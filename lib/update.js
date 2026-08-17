import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const LOG = "[dsh-settings-pro]";
const REGISTRY_URL = "https://registry.npmjs.org/@kazecreator/dsh-settings-pro/latest";
const PACKAGE_NAME = "@kazecreator/dsh-settings-pro";
/** Guard against registry hangs / flaky networks when checking for updates. */
const FETCH_TIMEOUT_MS = 6000;
/** Only re-check the registry once per day; the settings page and startup reuse the cached result. */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Cache file that remembers the last check time + latest version, so we poll the registry at most daily. */
function cachePath() {
  const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
  return join(home, "storages", "dsh-settings-pro", "update-cache.json");
}

function readCache() {
  try {
    const parsed = JSON.parse(readFileSync(cachePath(), "utf8"));
    return parsed != null && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(entry) {
  try {
    mkdirSync(dirname(cachePath()), { recursive: true });
    writeFileSync(cachePath(), JSON.stringify({ ...readCache(), ...entry, checkedAt: Date.now() }) + "\n");
  } catch {
    /* best-effort; a missing cache only means an extra registry poll next boot */
  }
}

/** Local version, read from this package's own package.json. */
function localVersion() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
    return typeof pkg?.version === "string" && pkg.version !== "" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Fetch the latest published version from the npm registry (best-effort). */
export async function fetchLatestVersion() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(REGISTRY_URL, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.version === "string" && body.version !== "" ? body.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * How this plugin is installed in the active profile: `file:` (a local
 * development checkout — updates are meaningless because code changes apply
 * immediately and `pnpm add` would replace the file: link) or `registry`
 * (a published npm version, updatable in place). Detection reads the profile's
 * package.json dependency spec; unknown shapes fall back to `registry`.
 */
export function detectInstallMode(profileDir) {
  try {
    const pkg = JSON.parse(readFileSync(join(profileDir, "package.json"), "utf8"));
    const spec = pkg?.dependencies?.[PACKAGE_NAME] ?? pkg?.devDependencies?.[PACKAGE_NAME];
    if (typeof spec === "string" && spec.startsWith("file:")) return "file";
    if (typeof spec === "string") return "registry";
  } catch {
    /* fall through */
  }
  return "registry";
}

/**
 * Snapshot used by the settings page and the startup log line.
 * `installMode: "file"` means the UI must not offer a one-click update.
 *
 * With `force: false` (default) the registry is only polled once per day; the
 * cached `latest` from the most recent check is reused otherwise. `force: true`
 * always hits the registry (used by the manual "Check for updates" button).
 */
export async function updateSnapshot(profileDir, { force = false } = {}) {
  const current = localVersion();
  const cache = readCache();
  const fresh = force || cache.latest == null || Date.now() - (cache.checkedAt ?? 0) > CHECK_INTERVAL_MS;
  let latest = cache.latest ?? null;
  if (fresh) {
    latest = await fetchLatestVersion();
    if (latest != null) writeCache({ latest });
  }
  return {
    current,
    latest,
    hasUpdate: latest != null && compareVersions(latest, current) > 0,
    installMode: detectInstallMode(profileDir),
    checkFailed: latest == null,
    checkedAt: fresh ? Date.now() : (cache.checkedAt ?? null),
    daily: !fresh,
  };
}

/**
 * One-click update: run `pnpm add <pkg>@latest` inside the profile directory,
 * then relaunch this process via self re-exec (same mechanism as the IM
 * `/restart` command). Rejects without touching anything when the plugin is a
 * `file:` install (local development) or pnpm is missing.
 *
 * @returns a promise that resolves once the child `pnpm` has been spawned;
 * the caller should send its response and let the process exit shortly after.
 */
export function applyUpdate(profileDir) {
  const mode = detectInstallMode(profileDir);
  if (mode === "file") {
    return Promise.reject(new Error("plugin is a file: install (local development); run `pnpm add` manually to switch to the registry version"));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn("pnpm", ["add", `${PACKAGE_NAME}@latest`], {
      cwd: profileDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      err += chunk;
    });
    const finish = (fn, detail) => {
      if (settled) return;
      settled = true;
      fn(detail);
    };
    child.on("error", (error) => finish(reject, error));
    child.on("exit", (code, signal) => {
      if (code === 0) {
        finish(resolve, { code, out });
      } else {
        finish(reject, new Error(`pnpm add failed (code ${code ?? signal}): ${err.trim() || out.trim() || "unknown error"}`));
      }
    });
  });
}

/**
 * Relaunch this dsh process (self re-exec) and exit — mirrors the bridge's
 * restart flow so the freshly installed plugin version actually loads.
 */
export function restartProcess() {
  const args = process.argv.slice(1);
  console.log(`${LOG} restarting dsh web process to load updated plugin:`, process.execPath, ...args);
  let child;
  try {
    child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      detached: true,
      stdio: "inherit",
      env: process.env,
    });
  } catch (error) {
    console.error(`${LOG} failed to launch restart child:`, error?.message ?? error);
    return;
  }
  child.on("spawn", () => {
    console.log(`${LOG} restart child launched; exiting`);
    setTimeout(() => process.exit(0), 250);
  });
  child.on("error", (error) => {
    console.error(`${LOG} restart child failed to launch; staying up:`, error?.message ?? error);
  });
  child.unref();
}
