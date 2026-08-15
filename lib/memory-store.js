import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { dateInTz } from "./pricing.js";
import { OWNER_KEY, sanitizeUserKey } from "./users.js";

const VERSION = 2;
const DEFAULT_TIMEZONE = "Asia/Shanghai";
const MAX_NOTES_PER_DAY = 100; // live notes kept verbatim per day file
const MAX_NOTE_CHARS = 500; // truncate each captured note on ingest
const MAX_DAY_BYTES = 256 * 1024; // compact a day file above this size
const MAX_DIGEST_CHARS = 4000; // compacted "digest" text cap per day
const MAX_INJECT_NOTES = 20; // most-recent notes injected into the prompt
const INJECT_BUDGET_CHARS = 4000; // total prompt-injection budget

/**
 * Durable cross-restart memory, namespaced per user and bucketed per date.
 *
 * Layout under `<dir>/memory/`:
 *   <userKey>/summary.json   — rolling summary (the distilled memory)
 *   <userKey>/YYYY-MM-DD.json — one file per day: `{ date, notes[], digest, compacted }`
 *
 * Size control keeps each day file small and bounded without silently dropping
 * history: when a day exceeds its note count or byte budget, the oldest notes
 * are rolled into a compact `digest` string (oldest-first, truncated to a cap),
 * so recent notes stay verbatim while older ones survive in compressed form.
 * The per-user `summary` is the model-maintained distilled memory and is always
 * injected first.
 */
export class MemoryStore {
  constructor(dir, { timezone = DEFAULT_TIMEZONE, registry = null } = {}) {
    this.root = join(dir, "memory");
    this.timezone = timezone;
    this.registry = registry;
    this.#migrateLegacy(dir);
  }

  // --- identity ------------------------------------------------------------

  /** Resolve a session id / agent id to a user key (owner when unbound). */
  resolve(sessionId) {
    return this.registry != null ? this.registry.resolve(sessionId) : OWNER_KEY;
  }

  #userDir(userKey) {
    return join(this.root, sanitizeUserKey(userKey));
  }

  #summaryPath(userKey) {
    return join(this.#userDir(userKey), "summary.json");
  }

  #dayPath(userKey, date) {
    return join(this.#userDir(userKey), `${date}.json`);
  }

  #dateOf(ts) {
    return dateInTz(new Date(ts), this.timezone);
  }

  // --- summary -------------------------------------------------------------

  getSummary(userKey) {
    try {
      const parsed = JSON.parse(readFileSync(this.#summaryPath(userKey), "utf8"));
      return typeof parsed?.summary === "string" ? parsed.summary : "";
    } catch {
      return "";
    }
  }

  setSummary(userKey, text) {
    const summary = String(text ?? "").trim();
    mkdirSync(this.#userDir(userKey), { recursive: true });
    writeFileSync(
      this.#summaryPath(userKey),
      JSON.stringify({ version: VERSION, summary, updatedAt: Date.now() }, null, 2) + "\n",
    );
    return summary;
  }

  // --- day files -----------------------------------------------------------

  #loadDay(userKey, date) {
    try {
      const parsed = JSON.parse(readFileSync(this.#dayPath(userKey, date), "utf8"));
      if (parsed && typeof parsed === "object") {
        return {
          date,
          notes: Array.isArray(parsed.notes) ? parsed.notes : [],
          digest: typeof parsed.digest === "string" ? parsed.digest : "",
          compacted: Number.isFinite(parsed.compacted) ? parsed.compacted : 0,
        };
      }
    } catch {
      // missing/corrupt → fresh
    }
    return { date, notes: [], digest: "", compacted: 0 };
  }

  #saveDay(userKey, day) {
    mkdirSync(this.#userDir(userKey), { recursive: true });
    writeFileSync(this.#dayPath(userKey, day.date), JSON.stringify(day, null, 2) + "\n");
  }

  /** Fold a day's oldest notes into its digest, keeping the newest ones verbatim. */
  #compactDay(day) {
    if (day.notes.length <= MAX_NOTES_PER_DAY) return day;
    const overflow = day.notes.splice(0, day.notes.length - MAX_NOTES_PER_DAY);
    day.digest = this.#appendDigest(day.digest, overflow);
    day.compacted += overflow.length;
    return day;
  }

  #appendDigest(digest, notes) {
    const block = notes
      .map((n) => {
        const when = new Date(n.ts).toLocaleString("zh-CN", { hour12: false });
        return `[${when}] ${String(n.text ?? "")}`;
      })
      .join("\n");
    const merged = digest ? `${digest}\n${block}` : block;
    // Keep the tail (most recent of the compacted batch) rather than the head,
    // so newer compacted info survives a truncation.
    return merged.length > MAX_DIGEST_CHARS
      ? "…" + merged.slice(-(MAX_DIGEST_CHARS - 1))
      : merged;
  }

  #appendDay(userKey, date, text, meta = {}) {
    const day = this.#loadDay(userKey, date);
    day.notes.push({ ts: meta.ts ?? Date.now(), text, ...meta });
    this.#compactDay(day);
    this.#saveDay(userKey, day);
    // Belt-and-suspenders byte cap for days that grow many very long notes.
    try {
      const stats = readFileSync(this.#dayPath(userKey, date));
      if (stats.length > MAX_DAY_BYTES) {
        const reloaded = this.#loadDay(userKey, date);
        const overflow = reloaded.notes.splice(0, Math.ceil(reloaded.notes.length / 2));
        reloaded.digest = this.#appendDigest(reloaded.digest, overflow);
        reloaded.compacted += overflow.length;
        this.#saveDay(userKey, reloaded);
      }
    } catch {
      // best-effort size check
    }
  }

  // --- notes ---------------------------------------------------------------

  /** Capture one note (auto-capture + `write_memory`) under the resolved user. */
  addNote(sessionId, text, meta = {}) {
    return this.addUserNote(this.resolve(sessionId), text, meta);
  }

  /** Add a note directly under an explicit user key (manual UI/tool writes). */
  addUserNote(userKey, text, meta = {}) {
    const clean = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NOTE_CHARS);
    if (clean === "") return null;
    const { ts, ...rest } = meta;
    const note = { ts: ts ?? Date.now(), ...rest };
    this.#appendDay(userKey, this.#dateOf(note.ts), clean, note);
    return { userKey, note };
  }

  /** All notes for a user, newest first (merged across days), optionally bounded. */
  listNotes(userKey, limit = 0) {
    const days = this.listDays(userKey).reverse();
    const out = [];
    for (const date of days) {
      const day = this.#loadDay(userKey, date);
      for (const note of day.notes) out.push({ ...note, date });
      if (limit > 0 && out.length >= limit) break;
    }
    return out;
  }

  listDays(userKey) {
    try {
      return readdirSync(this.#userDir(userKey))
        .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .map((f) => f.replace(/\.json$/, ""))
        .sort();
    } catch {
      return [];
    }
  }

  listUsers() {
    try {
      return readdirSync(this.root, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    } catch {
      return [];
    }
  }

  clear(userKey) {
    try {
      rmSync(this.#userDir(userKey), { recursive: true, force: true });
    } catch (error) {
      console.error(`[dsh-settings-pro] memory clear failed for ${userKey}:`, error);
    }
  }

  // --- injection -----------------------------------------------------------

  /**
   * Human-readable memory injected into the system prompt / tool output for the
   * resolved user: rolling summary first, then the most recent notes and any
   * compacted digests, all truncated to a fixed budget so the prompt never
   * balloons.
   */
  summaryText(sessionId) {
    const userKey = this.resolve(sessionId);
    const parts = [];
    const summary = this.getSummary(userKey);
    if (summary) parts.push(summary);

    const lines = [];
    for (const date of this.listDays(userKey).reverse()) {
      const day = this.#loadDay(userKey, date);
      if (day.digest) lines.push(`[${date} 较早记录]\n${day.digest}`);
      // Newest-first within each day so the freshest notes survive the budget cut.
      for (const note of day.notes.slice().reverse()) {
        const when = new Date(note.ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
        lines.push(`- [${date} ${when}] ${note.text}`);
        if (lines.length >= MAX_INJECT_NOTES) break;
      }
      if (lines.length >= MAX_INJECT_NOTES) break;
    }
    if (lines.length > 0) parts.push("近期记录：\n" + lines.join("\n"));

    let text = parts.join("\n");
    if (text.length > INJECT_BUDGET_CHARS) {
      text = text.slice(0, INJECT_BUDGET_CHARS) + "\n…（记忆已截断）";
    }
    return text;
  }

  // --- export --------------------------------------------------------------

  /** JSON snapshot of one user's memory (for the web tab). */
  exportJson(userKey) {
    const days = this.listDays(userKey).reverse().map((date) => this.#loadDay(userKey, date));
    return {
      version: VERSION,
      user: userKey,
      summary: this.getSummary(userKey),
      days,
      updatedAt: Date.now(),
    };
  }

  /** Date-stamped Markdown export of one user's memory. */
  exportMarkdown(userKey) {
    const today = this.#dateOf(Date.now());
    const header = [`# 记忆 · ${userKey} · ${today}`, ""];
    const summary = this.getSummary(userKey);
    if (summary) header.push(`## 摘要`, "", summary, "");

    const sections = [];
    for (const date of this.listDays(userKey).reverse()) {
      const day = this.#loadDay(userKey, date);
      const block = [`## ${date}`];
      if (day.digest) block.push("", `> 较早记录（已合并 ${day.compacted} 条）`, "", `> ${day.digest.replace(/\n/g, "\n> ")}`);
      if (day.notes.length > 0) {
        block.push("");
        for (const note of day.notes) {
          const when = new Date(note.ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
          block.push(`- [${when}] ${note.text}`);
        }
      }
      sections.push(block.join("\n"));
    }
    return [...header, ...(sections.length > 0 ? sections : ["（暂无记录）"]), ""].join("\n");
  }

  // --- legacy migration ----------------------------------------------------

  /** One-time migration of the old single `memory.json` into the owner's files. */
  #migrateLegacy(dir) {
    const legacy = join(dir, "memory.json");
    if (!existsSync(legacy)) return;
    try {
      const parsed = JSON.parse(readFileSync(legacy, "utf8"));
      const notes = Array.isArray(parsed?.notes) ? parsed.notes : [];
      for (const raw of notes) {
        const text = String(raw?.text ?? "");
        if (text.trim() === "") continue;
        this.#appendDay(OWNER_KEY, this.#dateOf(raw?.ts ?? Date.now()), text.slice(0, MAX_NOTE_CHARS), {
          ts: raw?.ts ?? Date.now(),
          ...(raw?.sessionId ? { sessionId: raw.sessionId } : {}),
        });
      }
      if (typeof parsed?.summary === "string" && parsed.summary.trim() !== "") {
        this.setSummary(OWNER_KEY, parsed.summary);
      }
      // Preserve the raw file as a backup and remove it so migration is one-shot.
      writeFileSync(join(dir, "memory.json.bak"), JSON.stringify(parsed, null, 2) + "\n");
      rmSync(legacy);
      console.log(`[dsh-settings-pro] migrated legacy memory.json → memory/${OWNER_KEY}/ (${notes.length} notes)`);
    } catch (error) {
      console.error("[dsh-settings-pro] legacy memory migration failed:", error);
    }
  }
}
