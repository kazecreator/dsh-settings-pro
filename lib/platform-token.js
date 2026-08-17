import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const ORIGIN = "platform.deepseek.com";

/**
 * Read the platform.deepseek.com `userToken` straight out of Chromium's
 * on-disk localStorage (LevelDB), so the user never has to copy-paste it.
 *
 * This is a best-effort byte scan of the LevelDB `.log`/`.ldb` files rather
 * than a full LevelDB parse: keys are stored verbatim as
 * `_https://platform.deepseek.com\x00\x01userToken` (UTF-8) and values follow
 * as UTF-8 JSON (`{"value":"…",…}`). It only works while the user is signed in
 * to the platform in that browser; when the session is cleared there is
 * nothing to read and the caller falls back to asking the user to sign in.
 */

function browserLevelDbDirs() {
  const home = homedir();
  const bases = [
    // macOS: ~/Library/Application Support/<browser>/<profile>
    join(home, "Library/Application Support/Google/Chrome"),
    join(home, "Library/Application Support/Google/Chrome Canary"),
    join(home, "Library/Application Support/Chromium"),
    join(home, "Library/Application Support/Microsoft Edge"),
    join(home, "Library/Application Support/BraveSoftware/Brave-Browser"),
    join(home, "Library/Application Support/Arc/User Data"),
    join(home, "Library/Application Support/Vivaldi"),
    join(home, "Library/Application Support/com.operasoftware.Opera"),
    // Linux: ~/.config/<browser>/<profile>
    join(home, ".config/google-chrome"),
    join(home, ".config/google-chrome-beta"),
    join(home, ".config/chromium"),
    join(home, ".config/microsoft-edge"),
    join(home, ".config/BraveSoftware/Brave-Browser"),
    // Windows: ~/AppData/Local/<browser>/User Data/<profile>
    join(home, "AppData/Local/Google/Chrome/User Data"),
    join(home, "AppData/Local/Google/Chrome SxS/User Data"),
    join(home, "AppData/Local/Chromium/User Data"),
    join(home, "AppData/Local/Microsoft/Edge/User Data"),
    join(home, "AppData/Local/BraveSoftware/Brave-Browser/User Data"),
  ];
  const dirs = [];
  for (const base of bases) {
    if (!existsSync(base)) continue;
    let entries = [];
    try {
      entries = readdirSync(base);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const leveldb = join(base, entry, "Local Storage", "leveldb");
      if (existsSync(leveldb)) dirs.push(leveldb);
    }
  }
  return dirs;
}

function tokenFromJson(json) {
  try {
    const obj = JSON.parse(json);
    if (typeof obj === "string" && obj.trim()) return obj.trim();
    for (const key of ["value", "token", "access_token", "accessToken", "userToken"]) {
      if (typeof obj?.[key] === "string" && obj[key].trim()) return obj[key].trim();
    }
  } catch {
    // not JSON
  }
  return null;
}

function plausibleToken(value) {
  return typeof value === "string" && /^[A-Za-z0-9_\-+/.=]{20,512}$/.test(value);
}

/** Extract a balanced `{…}` JSON object starting at/after `fromIndex`. */
function extractJson(text, fromIndex) {
  const start = text.indexOf("{", fromIndex);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  const max = Math.min(text.length, start + 4096);
  for (let j = start; j < max; j++) {
    const c = text[j];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, j + 1);
    }
  }
  return null;
}

/**
 * @returns {string[]} candidate tokens in priority order (most-likely first).
 */
export function readPlatformTokensFromChrome() {
  const primary = [];
  const fallback = [];
  const seen = new Set();
  const add = (token, bucket) => {
    if (!plausibleToken(token)) return;
    if (seen.has(token)) return;
    seen.add(token);
    bucket.push(token);
  };

  for (const dir of browserLevelDbDirs()) {
    let files = [];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".log") || f.endsWith(".ldb"));
    } catch {
      continue;
    }
    for (const file of files) {
      let buf;
      try {
        buf = readFileSync(join(dir, file));
      } catch {
        continue;
      }
      // latin1 maps each byte 1:1 to a char, preserving the binary structure.
      const text = buf.toString("latin1");

      // 1) The canonical `userToken` key under the platform origin.
      let idx = 0;
      while ((idx = text.indexOf("userToken", idx)) !== -1) {
        const after = idx + "userToken".length;
        const before = text.slice(Math.max(0, idx - 400), idx);
        if (before.includes(ORIGIN)) {
          const json = extractJson(text, after);
          if (json) {
            const token = tokenFromJson(json);
            if (token) add(token, primary);
          }
          const raw = text.slice(after, after + 600).match(/^[\x00-\x1f]*([A-Za-z0-9_\-+/.=]{20,512})/);
          if (raw) add(raw[1], primary);
        }
        idx = after;
      }

      // 2) Fallback: base64-ish session tokens near the platform origin.
      let oi = 0;
      while ((oi = text.indexOf(ORIGIN, oi)) !== -1) {
        const region = text.slice(oi, oi + 4096);
        const matches = region.match(/[A-Za-z0-9_\-+/.=]{40,200}/g) ?? [];
        for (const cand of matches) add(cand, fallback);
        oi += ORIGIN.length;
      }
    }
  }

  return [...primary, ...fallback];
}
