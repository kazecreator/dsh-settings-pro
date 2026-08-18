import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

/**
 * Local desktop-pet app manager. On macOS it installs a real `DSH Pet.app`
 * into /Applications (built from the bundled Electron.app, with our app files
 * and a custom icon), then launches it with `open`. On other platforms it falls
 * back to spawning the Electron binary directly. State persists to a JSON file
 * so the Pets tab can show and resume state across reloads and restarts.
 */

const APP_DIR_NAME = "pet-app";
const STATE_FILE = "pet-app-state.json";
const APP_NAME = "DSH Pet";
const APP_ID = "top.kazecreator.dsh-pet";

/** Source files copied verbatim (never node_modules) into the app dir. */
const TEMPLATE_FILES = ["main.js", "preload.js", "package.json", "electron.icns"];

/** Generated (not shipped): mirrors so Electron installs fast/reliably behind CN networks. */
const NPMRC = "registry=https://registry.npmmirror.com\nelectron_mirror=https://npmmirror.com/mirrors/electron/\nstrict-ssl=false\n";

function templateDir() {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "pet-desktop");
}

function appDir(dir) {
  return join(dir, APP_DIR_NAME);
}

function statePath(dir) {
  return join(dir, STATE_FILE);
}

function electronBinary(appDirPath) {
  const dist = join(appDirPath, "node_modules", "electron", "dist");
  if (process.platform === "win32") return join(dist, "electron.exe");
  if (process.platform === "darwin") return join(dist, "Electron.app", "Contents", "MacOS", "Electron");
  return join(dist, "electron");
}

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export class PetAppManager {
  constructor(dir) {
    this.dir = dir;
    this.installing = false;
    this.onStateChange = null; // wired by index.js to push SSE pet-app-status events
  }

  /** Resolve the .app bundle path (macOS), remembering a prior fallback choice. */
  #bundlePath() {
    const saved = this.readState().bundle;
    if (saved) return saved;
    return join("/Applications", `${APP_NAME}.app`);
  }

  /** Whether the pet app is installed (macOS bundle with our app inside). */
  installed() {
    if (process.platform === "darwin") {
      return existsSync(join(this.#bundlePath(), "Contents", "Resources", "app", "main.js"));
    }
    return existsSync(electronBinary(appDir(this.dir)));
  }

  readState() {
    try {
      const parsed = JSON.parse(readFileSync(statePath(this.dir), "utf8"));
      if (parsed != null && typeof parsed === "object") {
        return { status: "not-installed", pid: null, error: null, ...parsed };
      }
    } catch {
      /* first run */
    }
    return { status: "not-installed", pid: null, error: null, updatedAt: null };
  }

  #setState(patch) {
    const next = { ...this.readState(), ...patch, updatedAt: Date.now() };
    try {
      mkdirSync(this.dir, { recursive: true });
      writeFileSync(statePath(this.dir), JSON.stringify(next) + "\n");
    } catch {
      /* best-effort persistence */
    }
    this.onStateChange?.(next);
    return next;
  }

  #macAppRunning() {
    // Detect both the current real bundle and the legacy wrapper process. The
    // legacy wrapper execs Electron with the plugin's pet-app dir as its arg,
    // so it shows up under the app dir instead of the bundle path.
    for (const pattern of [`${APP_NAME}.app/Contents/MacOS/`, appDir(this.dir)]) {
      try {
        execFileSync("pgrep", ["-f", pattern], { stdio: "ignore" });
        return true;
      } catch {
        /* keep looking */
      }
    }
    return false;
  }

  #killMacApp() {
    // The real bundle and the legacy wrapper have different command lines, so
    // both patterns are required during the one-time migration/self-heal.
    for (const pattern of [`${APP_NAME}.app`, appDir(this.dir)]) {
      try { execFileSync("pkill", ["-f", pattern], { stdio: "ignore" }); } catch { /* not running */ }
    }
  }

  #running() {
    if (process.platform === "darwin") return this.#macAppRunning();
    return isAlive(this.readState().pid);
  }

  /** Derive the live state, correcting stale process / install markers. */
  status() {
    const s = this.readState();
    if (s.status === "running") {
      if (!this.#running()) {
        return this.#setState({ status: this.installed() ? "installed" : "not-installed", pid: null, error: null });
      }
      return s;
    }
    if (s.status === "installing" && !this.installing) {
      // No active install in this process: it either finished right before a
      // restart or was interrupted. Settle based on whether electron landed.
      return this.#setState({ status: this.installed() ? "installed" : "not-installed", pid: null, error: null });
    }
    if (s.status === "installed" && !this.installed()) {
      return this.#setState({ status: "not-installed", pid: null, error: null });
    }
    return s;
  }

  async install() {
    if (this.installing) return this.status();
    const target = appDir(this.dir);
    this.installing = true;
    this.#setState({ status: "installing", pid: null, error: null });
    try {
      mkdirSync(target, { recursive: true });
      const src = templateDir();
      for (const f of TEMPLATE_FILES) {
        writeFileSync(join(target, f), readFileSync(join(src, f)));
      }
      writeFileSync(join(target, ".npmrc"), NPMRC);
      await this.#runInstall(target);
      // `npm install` can exit 0 while the Electron binary still hasn't landed
      // (ignore-scripts, NODE_ENV=production dropping devDependencies, or a
      // silent postinstall failure). Retry the binary download directly, then
      // verify — so "installed" is never a lie and launch() gets a real error.
      if (!existsSync(electronBinary(target))) {
        await this.#runElectronInstall(target);
      }
      if (!existsSync(electronBinary(target))) {
        throw new Error(`Electron binary missing after install (expected ${electronBinary(target)}); the download was blocked — check proxy/network`);
      }
      // macOS: materialize a real app bundle in /Applications with our icon.
      let bundle = null;
      if (process.platform === "darwin") {
        bundle = this.#buildAppBundle(target);
      }
      this.installing = false;
      return this.#setState({ status: "installed", pid: null, error: null, ...(bundle ? { bundle } : {}) });
    } catch (error) {
      this.installing = false;
      this.#setState({ status: "error", pid: null, error: error?.message ?? String(error) });
      throw error;
    }
  }

  #runInstall(cwd) {
    return new Promise((resolve, reject) => {
      const child = spawn("npm", ["install"], {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, npm_config_production: "false", NODE_TLS_REJECT_UNAUTHORIZED: "0" },
        shell: process.platform === "win32",
      });
      let out = "";
      let err = "";
      child.stdout.on("data", (chunk) => { out += chunk; });
      child.stderr.on("data", (chunk) => { err += chunk; });
      child.on("error", reject);
      child.on("exit", (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`npm install failed (code ${code ?? signal}): ${(err.trim() || out.trim() || "unknown error").slice(0, 400)}`));
      });
    });
  }

  /** Run Electron's own install.js directly (retries the binary download). */
  #runElectronInstall(cwd) {
    return new Promise((resolve, reject) => {
      const script = join(cwd, "node_modules", "electron", "install.js");
      const child = spawn(process.execPath, [script], {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          ELECTRON_MIRROR: "https://npmmirror.com/mirrors/electron/",
          NODE_TLS_REJECT_UNAUTHORIZED: "0",
        },
        shell: process.platform === "win32",
      });
      let out = "";
      let err = "";
      child.stdout.on("data", (chunk) => { out += chunk; });
      child.stderr.on("data", (chunk) => { err += chunk; });
      child.on("error", reject);
      child.on("exit", (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`electron binary download failed (code ${code ?? signal}): ${(err.trim() || out.trim() || "unknown error").slice(0, 400)}`));
      });
    });
  }

  /** Build `DSH Pet.app` (macOS): a copy of Electron.app with our app + icon,
   *  re-signed so the Dock shows our name/icon and Gatekeeper stays happy. */
  #buildAppBundle(appDirPath) {
    const srcApp = join(appDirPath, "node_modules", "electron", "dist", "Electron.app");
    const name = `${APP_NAME}.app`;
    const sysBundle = join("/Applications", name);
    const userBundle = join(homedir(), "Applications", name);
    for (const bundle of [sysBundle, userBundle]) {
      try {
        this.#writeBundle(srcApp, bundle);
        return bundle;
      } catch (error) {
        console.warn(`[dsh-settings-pro] failed to write pet app bundle to ${bundle}:`, error?.message ?? error);
      }
    }
    throw new Error("failed to create the desktop pet app bundle in /Applications (or ~/Applications)");
  }

  #writeBundle(srcApp, bundle) {
    rmSync(bundle, { recursive: true, force: true });
    cpSync(srcApp, bundle, { recursive: true });

    // Our app lives at Contents/Resources/app so double-clicking the bundle
    // runs it directly — no `--app-path` needed.
    const resApp = join(bundle, "Contents", "Resources", "app");
    mkdirSync(resApp, { recursive: true });
    for (const f of TEMPLATE_FILES) {
      writeFileSync(join(resApp, f), readFileSync(join(templateDir(), f)));
    }

    const iconSrc = join(templateDir(), "electron.icns");
    if (existsSync(iconSrc)) {
      cpSync(iconSrc, join(bundle, "Contents", "Resources", "electron.icns"));
    }

    const plist = join(bundle, "Contents", "Info.plist");
    const pb = "/usr/libexec/PlistBuddy";
    for (const [key, value] of [["CFBundleName", APP_NAME], ["CFBundleDisplayName", APP_NAME], ["CFBundleIdentifier", APP_ID]]) {
      try { execFileSync(pb, ["-c", `Set :${key} ${value}`, plist], { stdio: "ignore" }); } catch { /* non-fatal */ }
    }

    // Copying + editing breaks Electron's signature. Re-sign ad-hoc WITH
    // preserved metadata — plain `--deep --sign -` trips over Electron's sealed
    // frameworks ("unsealed contents"), while --preserve-metadata re-signs clean
    // (verified: codesign --verify passes and the Dock shows "DSH Pet").
    try {
      execFileSync("codesign", ["--force", "--deep", "--sign", "-", "--preserve-metadata=identifier,entitlements,requirements", bundle], { stdio: "ignore" });
    } catch { /* stale signature still launches locally */ }
  }

  launch() {
    const s = this.status();
    if (s.status === "running" && this.#running() && this.installed()) return s;
    if (process.platform === "darwin") {
      // The bundle may be missing or left over from the old wrapper layout
      // (no Contents/Resources/app). Rebuild it from the installed Electron so
      // Launch works without a manual re-install after an upgrade.
      if (!this.installed()) {
        const target = appDir(this.dir);
        if (!existsSync(electronBinary(target))) {
          const error = new Error("pet app not installed yet");
          this.#setState({ status: "error", pid: null, error: error.message });
          throw error;
        }
        const bundle = this.#buildAppBundle(target);
        this.#setState({ bundle });
      }
      // Self-heal: refresh the bundle's app files (main.js / icon / …) so a
      // plugin update takes effect on the next launch without a manual
      // re-install. Re-sign only when something actually changed, so steady
      // launches stay fast and the signature stays valid for Gatekeeper.
      try {
        const resApp = join(this.#bundlePath(), "Contents", "Resources", "app");
        mkdirSync(resApp, { recursive: true });
        let changed = false;
        for (const f of TEMPLATE_FILES) {
          const src = readFileSync(join(templateDir(), f));
          const dst = join(resApp, f);
          if (!existsSync(dst) || !readFileSync(dst).equals(src)) {
            writeFileSync(dst, src);
            changed = true;
          }
        }
        if (changed) {
          execFileSync("codesign", ["--force", "--deep", "--sign", "-", "--preserve-metadata=identifier,entitlements,requirements", this.#bundlePath()], { stdio: "ignore" });
        }
      } catch { /* non-fatal */ }
      this.#killMacApp();
      const child = spawn("open", [this.#bundlePath()], { detached: true, stdio: "ignore" });
      child.on("error", () => {
        this.#setState({ status: "error", pid: null, error: "failed to open the pet app" });
      });
      child.unref();
      return this.#setState({ status: "running", pid: null, error: null });
    }

    // Non-macOS: spawn the Electron binary directly.
    if (!this.installed()) {
      const error = new Error("pet app not installed yet");
      this.#setState({ status: "error", pid: null, error: error.message });
      throw error;
    }
    let stderr = "";
    const child = spawn(electronBinary(appDir(this.dir)), [appDir(this.dir)], {
      detached: true,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "true" },
    });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const pid = child.pid;
    child.on("error", () => {
      this.#setState({ status: "error", pid: null, error: "failed to launch pet app" });
    });
    child.on("exit", (code, signal) => {
      const cur = this.readState();
      if (cur.status === "running" && cur.pid === pid && code !== 0) {
        this.#setState({ status: "error", pid: null, error: `pet app exited (code ${code ?? signal}): ${stderr.trim().slice(0, 400) || "unknown error"}` });
      }
    });
    child.unref();
    return this.#setState({ status: "running", pid, error: null });
  }

  stop() {
    const s = this.status();
    if (s.status === "running") {
      if (process.platform === "darwin") {
        this.#killMacApp();
      } else if (isAlive(s.pid)) {
        try { process.kill(s.pid, "SIGTERM"); } catch { /* already gone */ }
        if (process.platform !== "win32") {
          try { process.kill(-s.pid, "SIGTERM"); } catch { /* not a group leader */ }
        }
      }
    }
    return this.#setState({ status: "installed", pid: null, error: null });
  }
}
