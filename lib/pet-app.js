import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Local desktop-pet app manager. Owns a small Electron app — copied from the
 * `pet-desktop/` template shipped inside this package — under
 * `<storage>/pet-app`, installs its deps (`npm install`), launches the floating
 * pet window, and persists a state file so the Pets tab can show and resume
 * state across settings reopen and server restarts.
 */

const APP_DIR_NAME = "pet-app";
const STATE_FILE = "pet-app-state.json";

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

  installed() {
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

  /** Derive the live state, correcting stale process / install markers. */
  status() {
    const s = this.readState();
    if (s.status === "running") {
      if (!isAlive(s.pid)) {
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
      // NODE_ENV=production dropping devDependencies). Verify it actually landed
      // so "installed" is never a lie and launch() gets a real, diagnosable error.
      if (!this.installed()) {
        throw new Error(`npm install finished but the Electron binary is missing (expected ${electronBinary(target)}); check the registry/network and re-install`);
      }
      this.installing = false;
      return this.#setState({ status: "installed", pid: null, error: null });
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

  launch() {
    const s = this.status();
    if (s.status === "running" && isAlive(s.pid)) return s;
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
      // Surface a quick startup crash; skip if stop() already settled the state.
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
    if (s.status === "running" && isAlive(s.pid)) {
      try { process.kill(s.pid, "SIGTERM"); } catch { /* already gone */ }
      if (process.platform !== "win32") {
        try { process.kill(-s.pid, "SIGTERM"); } catch { /* not a group leader */ }
      }
    }
    return this.#setState({ status: "installed", pid: null, error: null });
  }
}
