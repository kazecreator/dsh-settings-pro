import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * A single "restart is in flight" notice that survives the process relaunch.
 *
 * When a peer runs `/restart`, the bridge writes one record describing who asked
 * for the restart and in which language. The relaunched process reads it back
 * once the matching channel reconnects, sends a "restart complete" message to
 * that peer, and clears it. Persisting the record to disk is what lets the new
 * process send the notification proactively instead of staying silent.
 */

function noticePath() {
  const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
  return join(home, "storages", "dsh-im", "restart-notice.json");
}

/**
 * Persist the pending restart notice (best-effort). Called before the process
 * exits so the relaunched process can pick it up.
 *
 * @param {{provider: string, peerId: string, lang: string}} notice
 */
export function saveRestartNotice(notice) {
  try {
    mkdirSync(dirname(noticePath()), { recursive: true });
    writeFileSync(noticePath(), JSON.stringify(notice) + "\n");
  } catch (error) {
    console.error("[dsh-im] failed to save restart notice:", error?.message ?? error);
  }
}

/**
 * Read the pending notice and clear it, but only when it targets `provider`.
 * Other channels must leave it alone so the correct channel still delivers it.
 *
 * @param {string} provider
 * @returns {{provider: string, peerId: string, lang: string} | null}
 */
export function takeRestartNotice(provider) {
  try {
    const parsed = JSON.parse(readFileSync(noticePath(), "utf8"));
    if (parsed == null || parsed.provider !== provider) return null;
    unlinkSync(noticePath());
    return parsed;
  } catch {
    return null;
  }
}
