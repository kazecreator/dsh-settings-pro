import { existsSync, mkdirSync, readdirSync, renameSync, copyFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LOG = "[settings-pro:im]";

/** Legacy root the archived `@kazecreator/dsh-im` package wrote state into. */
const LEGACY_STORAGE_DIR = "dsh-im";
/** Files (relative to the IM storage dir) that carry cross-restart IM state. */
const STATE_FILES = [
  "config.json",
  "restart-notice.json",
  "wechat.json",
  "wechat-cursor.json",
  "peers.json",
  "telegram-offset.json",
];

function home() {
  return process.env.DSH_HOME ?? join(homedir(), ".dsh");
}

/**
 * Canonical storage directory for all settings-pro IM state. Lives under the
 * plugin's own `storages/dsh-settings-pro` root (same convention as
 * `storageDir()` in index.js), so IM state no longer lives in the archived
 * dsh-im namespace.
 */
export function imStorageDir() {
  return join(home(), "storages", "dsh-settings-pro", "im");
}

/** Resolve a state file inside the IM storage dir. */
export function imStoragePath(...parts) {
  return join(imStorageDir(), ...parts);
}

/**
 * The `im-workspace` directory stays at its legacy location on purpose: the
 * workspace registry record (`workspace.json`) and every IM session header's
 * `cwd` are bound to that exact path, and session files are stored under
 * `sessions/--<cwd>--/`. Moving it would orphan the attached sessions from the
 * "IM Bridge" workspace. Only the JSON state files migrate.
 */
export function imWorkspaceDir() {
  return join(home(), "storages", LEGACY_STORAGE_DIR, "im-workspace");
}

function legacyPath(...parts) {
  return join(home(), "storages", LEGACY_STORAGE_DIR, ...parts);
}

/**
 * One-time migration: move the JSON state files left behind by the archived
 * dsh-im package into the plugin's own storage root. Idempotent — files that
 * already exist at the destination are left untouched, and once the legacy
 * files are gone the function is a no-op.
 */
export function migrateLegacyImStorage() {
  const legacyRoot = legacyPath();
  if (!existsSync(legacyRoot)) return;
  mkdirSync(imStorageDir(), { recursive: true });
  let moved = 0;
  for (const file of STATE_FILES) {
    const src = legacyPath(file);
    const dst = imStoragePath(file);
    if (!existsSync(src) || existsSync(dst)) continue;
    try {
      renameSync(src, dst);
      moved += 1;
    } catch {
      // Cross-device or locked file: fall back to copy + remove.
      try {
        copyFileSync(src, dst);
        rmSync(src, { force: true });
        moved += 1;
      } catch (error) {
        console.error(`${LOG} failed to migrate ${file}:`, error?.message ?? error);
      }
    }
  }
  if (moved > 0) {
    console.log(`${LOG} migrated ${moved} IM state file(s) from storages/dsh-im to storages/dsh-settings-pro/im`);
  }
  // Remove the legacy dir only when it is completely empty. The bound
  // `im-workspace` subdir (see `imWorkspaceDir()`) must physically remain —
  // session cwd headers and the workspace registry record point at it.
  try {
    const remaining = readdirSync(legacyRoot);
    if (remaining.length === 0) rmSync(legacyRoot, { recursive: true, force: true });
  } catch {
    /* best-effort; leaving a stale legacy dir is harmless */
  }
}

/** @returns the directory containing the IM storage root (for mkdir chains). */
export function ensureImStorageDir() {
  mkdirSync(imStorageDir(), { recursive: true });
  return imStorageDir();
}
