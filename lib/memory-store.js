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

const VERSION = 3;
const DEFAULT_TIMEZONE = "Asia/Shanghai";
const MAX_NOTES_PER_DAY = 100; // live notes kept verbatim per day file
const MAX_NOTE_CHARS = 500; // truncate each captured note on ingest
const MAX_DAY_BYTES = 256 * 1024; // compact a day file above this size
const MAX_DIGEST_CHARS = 4000; // compacted "digest" text cap per day
const MAX_INJECT_NOTES = 20; // most-recent notes injected into the prompt
const INJECT_BUDGET_CHARS = 4000; // total prompt-injection budget

/**
 * Durable cross-restart memory, shared across all channels (Web owner, Telegram,
 * WeChat) and bucketed per date. There is no per-user isolation on purpose:
 * every channel reads and writes the same memory so the assistant remembers
 * everything it did, while the IM bridge keeps *live* conversations routed per
 * peer so simultaneous chats never interleave.
 *
 * Layout under `<dir>/memory/`:
 *   summary.json      — rolling summary (the distilled memory)
 *   YYYY-MM-DD.json   — one file per day: `{ date, notes[], digest, compacted }`
 *
 * Size control keeps each day file small and bounded without silently dropping
 * history: when a day exceeds its note count or byte budget, the oldest notes
 * are rolled into a compact `digest` string (oldest-first, truncated to a cap),
 * so recent notes stay verbatim while older ones survive in compressed form.
 */
export class MemoryStore {
  constructor(dir, { timezone = DEFAULT_TIMEZONE } = {}) {
    this.dir = join(dir, "memory");
    this.timezone = timezone;
    this.#migrate(dir);
  }

  #summaryPath() {
    return join(this.dir, "summary.json");
  }

  #dayPath(date) {
    return join(this.dir, `${date}.json`);
  }

  #dateOf(ts) {
    return dateInTz(new Date(ts), this.timezone);
  }

  // --- summary -------------------------------------------------------------

  getSummary() {
    try {
      const parsed = JSON.parse(readFileSync(this.#summaryPath(), "utf8"));
      return typeof parsed?.summary === "string" ? parsed.summary : "";
    } catch {
      return "";
    }
  }

  setSummary(text) {
    const summary = String(text ?? "").trim();
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(
      this.#summaryPath(),
      JSON.stringify({ version: VERSION, summary, updatedAt: Date.now() }, null, 2) + "\n",
    );
    return summary;
  }

  // --- day files -----------------------------------------------------------

  #loadDay(date) {
    try {
      const parsed = JSON.parse(readFileSync(this.#dayPath(date), "utf8"));
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

  #saveDay(day) {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.#dayPath(day.date), JSON.stringify(day, null, 2) + "\n");
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

  #appendDay(date, note) {
    const day = this.#loadDay(date);
    day.notes.push(note);
    this.#compactDay(day);
    this.#saveDay(day);
    // Belt-and-suspenders byte cap for days that grow many very long notes.
    try {
      const stats = readFileSync(this.#dayPath(date));
      if (stats.length > MAX_DAY_BYTES) {
        const reloaded = this.#loadDay(date);
        const overflow = reloaded.notes.splice(0, Math.ceil(reloaded.notes.length / 2));
        reloaded.digest = this.#appendDigest(reloaded.digest, overflow);
        reloaded.compacted += overflow.length;
        this.#saveDay(reloaded);
      }
    } catch {
      // best-effort size check
    }
  }

  // --- notes ---------------------------------------------------------------

  /** Capture one note (auto-capture + `write_memory`) into the shared pool. */
  addNote(text, meta = {}) {
    const clean = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NOTE_CHARS);
    if (clean === "") return null;
    const { ts = Date.now(), ...rest } = meta;
    const note = { ts, text: clean, ...rest };
    this.#appendDay(this.#dateOf(ts), note);
    return note;
  }

  /** All notes newest-first (merged across days), optionally bounded. */
  listNotes(limit = 0) {
    const out = [];
    for (const date of this.listDays().reverse()) {
      const day = this.#loadDay(date);
      for (const note of day.notes) out.push({ ...note, date });
      if (limit > 0 && out.length >= limit) break;
    }
    return out;
  }

  listDays() {
    try {
      return readdirSync(this.dir)
        .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .map((f) => f.replace(/\.json$/, ""))
        .sort();
    } catch {
      return [];
    }
  }

  clear() {
    try {
      rmSync(this.dir, { recursive: true, force: true });
    } catch (error) {
      console.error("[dsh-settings-pro] memory clear failed:", error);
    }
  }

  // --- injection -----------------------------------------------------------

  /**
   * Human-readable memory injected into the system prompt / tool output:
   * rolling summary first, then the most recent notes and any compacted
   * digests, all truncated to a fixed budget so the prompt never balloons.
   */
  summaryText() {
    const parts = [];
    const summary = this.getSummary();
    if (summary) parts.push(summary);

    const lines = [];
    for (const date of this.listDays().reverse()) {
      const day = this.#loadDay(date);
      if (day.digest) lines.push(`[${date} 较早记录]\n${day.digest}`);
      // Newest-first (by timestamp) so the freshest notes survive the budget cut.
      const notes = day.notes.slice().sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
      for (const note of notes) {
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

  /** JSON snapshot of the shared memory (for the web tab / backup export). */
  exportJson({ from = "", to = "" } = {}) {
    const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : "";
    const dateTo = /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : "";
    const days = this.listDays().filter((date) => {
      if (dateFrom && date < dateFrom) return false;
      if (dateTo && date > dateTo) return false;
      return true;
    });
    return {
      version: VERSION,
      summary: this.getSummary(),
      today: dateInTz(new Date(), this.timezone),
      days: days.reverse().map((date) => this.#loadDay(date)),
      updatedAt: Date.now(),
    };
  }

  /** Date-stamped Markdown export of the shared memory. */
  exportMarkdown({ from = "", to = "" } = {}) {
    const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : "";
    const dateTo = /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : "";

    let title;
    if (dateFrom && dateTo) title = dateFrom === dateTo ? dateFrom : `${dateFrom} ~ ${dateTo}`;
    else if (dateFrom) title = `${dateFrom} 起`;
    else if (dateTo) title = `至 ${dateTo}`;
    else title = "全部";

    const header = [`# 记忆 · ${title}`, ""];
    const summary = this.getSummary();
    if (summary) header.push(`## 摘要`, "", summary, "");

    const days = this.listDays().filter((date) => {
      if (dateFrom && date < dateFrom) return false;
      if (dateTo && date > dateTo) return false;
      return true;
    });

    const sections = [];
    for (const date of days.reverse()) {
      const day = this.#loadDay(date);
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

  // --- migration -----------------------------------------------------------

  /** One-time migration of old layouts into the flat shared layout. */
  #migrate(dir) {
    // 1) Legacy single memory.json (v1).
    const legacy = join(dir, "memory.json");
    if (existsSync(legacy)) {
      try {
        const parsed = JSON.parse(readFileSync(legacy, "utf8"));
        for (const raw of Array.isArray(parsed?.notes) ? parsed.notes : []) {
          if (typeof raw?.text !== "string" || raw.text.trim() === "") continue;
          this.#appendDay(this.#dateOf(raw?.ts ?? Date.now()), {
            ts: raw?.ts ?? Date.now(),
            text: raw.text.slice(0, MAX_NOTE_CHARS),
            ...(raw?.sessionId ? { sessionId: raw.sessionId } : {}),
          });
        }
        if (typeof parsed?.summary === "string" && parsed.summary.trim() !== "") this.setSummary(parsed.summary);
        writeFileSync(join(dir, "memory.json.bak"), JSON.stringify(parsed, null, 2) + "\n");
        rmSync(legacy);
        console.log("[dsh-settings-pro] migrated legacy memory.json → memory/ (flat)");
      } catch (error) {
        console.error("[dsh-settings-pro] legacy memory migration failed:", error);
      }
    }

    // 2) Per-user subdirs (v2) → flat shared pool.
    try {
      const entries = readdirSync(this.dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const userDir = join(this.dir, entry.name);
        const summaryPath = join(userDir, "summary.json");
        if (existsSync(summaryPath)) {
          try {
            const s = JSON.parse(readFileSync(summaryPath, "utf8"));
            if (typeof s?.summary === "string" && s.summary.trim() !== "") this.setSummary(s.summary);
          } catch {
            // ignore unreadable summary
          }
        }
        let count = 0;
        for (const f of readdirSync(userDir)) {
          if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) continue;
          try {
            const day = JSON.parse(readFileSync(join(userDir, f), "utf8"));
            const date = day?.date ?? f.replace(/\.json$/, "");
            for (const note of Array.isArray(day?.notes) ? day.notes : []) {
              if (typeof note?.text !== "string" || note.text.trim() === "") continue;
              this.#appendDay(date, {
                ts: note.ts ?? Date.now(),
                text: note.text.slice(0, MAX_NOTE_CHARS),
                ...(note.sessionId ? { sessionId: note.sessionId } : {}),
              });
              count += 1;
            }
            if (typeof day?.digest === "string" && day.digest !== "") {
              const flat = this.#loadDay(date);
              flat.digest = this.#appendDigest(flat.digest, [{ ts: Date.now(), text: `[${entry.name}] ${day.digest}` }]);
              flat.compacted += Number(day.compacted ?? 0);
              this.#saveDay(flat);
            }
          } catch {
            // ignore unreadable day file
          }
        }
        rmSync(userDir, { recursive: true, force: true });
        if (count > 0) console.log(`[dsh-settings-pro] consolidated memory/${entry.name}/ → memory/ (${count} notes)`);
      }
    } catch {
      // no per-user dirs yet
    }
  }
}
