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
const TEMPLATE_FILES = ["main.js", "preload.js", "package.json"];

/** Generated (not shipped): mirrors so Electron installs fast/reliably behind CN networks. */
const NPMRC = "registry=https://registry.npmmirror.com\nelectron_mirror=https://npmmirror.com/mirrors/electron/\n";

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

  /** Whether the pet app is installed (macOS .app bundle, or the electron binary). */
  installed() {
    if (process.platform === "darwin") {
      const bundle = this.#bundlePath();
      return existsSync(join(bundle, "Contents", "Resources", "app", "main.js"));
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
    try {
      execFileSync("pgrep", ["-f", `${APP_NAME}.app/Contents/MacOS/`], { stdio: "ignore" });
      return true;
    } catch {
      return false;
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
      // `npm install` can exit 0 while still skipping the Electron binary (e.g.
      // NODE_ENV=production dropping devDependencies). Verify it actually landed.
      if (!existsSync(electronBinary(target))) {
        throw new Error(`npm install finished but the Electron binary is missing (expected ${electronBinary(target)}); check the registry/network and re-install`);
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
        env: { ...process.env, npm_config_production: "false" },
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

  /** Build `DSH Pet.app` (macOS) and return the bundle path it landed at. */
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
    // runs it directly (no `--app-path` needed).
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
      try {
        execFileSync(pb, ["-c", `Set :${key} ${value}`, plist], { stdio: "ignore" });
      } catch { /* non-fatal metadata */ }
    }

    // Do NOT re-sign: `codesign --deep --sign -` trips over Electron's sealed
    // frameworks ("unsealed contents") and `--remove-signature` makes launchd
    // refuse to spawn the app. The copied bundle keeps its (now stale) source
    // signature, which macOS still happily launches for a locally-created app.
  }

  launch() {
    const s = this.status();
    if (s.status === "running" && this.#running()) return s;
    if (!this.installed()) {
      const error = new Error("pet app not installed yet");
      this.#setState({ status: "error", pid: null, error: error.message });
      throw error;
    }
    if (process.platform === "darwin") {
      const child = spawn("open", [this.#bundlePath()], { detached: true, stdio: "ignore" });
      child.on("error", () => {
        this.#setState({ status: "error", pid: null, error: "failed to open the pet app" });
      });
      child.unref();
      return this.#setState({ status: "running", pid: null, error: null });
    }

    // Non-macOS: spawn the Electron binary directly.
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
        try { execFileSync("pkill", ["-f", `${APP_NAME}.app`], { stdio: "ignore" }); } catch { /* already gone */ }
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
