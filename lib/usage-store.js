import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dateInTz } from "./pricing.js";

function emptyBucket() {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

/**
 * Durable daily usage aggregation. Each day is one JSON file under
 * `<dir>/usage/YYYY-MM-DD.json`, bucketed by model × band (peak/offpeak) so
 * peak/off-peak cost stays exact even though a day spans both bands.
 */
export class UsageStore {
  constructor(dir, timezone = "Asia/Shanghai") {
    this.dir = join(dir, "usage");
    this.timezone = timezone;
  }

  today() {
    return dateInTz(new Date(), this.timezone);
  }

  #path(date) {
    return join(this.dir, `${date}.json`);
  }

  load(date) {
    try {
      const data = JSON.parse(readFileSync(this.#path(date), "utf8"));
      if (data && typeof data === "object") return data;
    } catch {
      // missing/corrupt → empty
    }
    return { date, models: {} };
  }

  #save(data) {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.#path(data.date), JSON.stringify(data, null, 2) + "\n");
  }

  /** Add one usage report (raw provider TokenUsage) to a day, under peak/offpeak. */
  record(date, model, usage, peak) {
    const data = this.load(date);
    const band = peak ? "peak" : "offpeak";
    const models = data.models;
    const entry = models[model] ?? (models[model] = { peak: emptyBucket(), offpeak: emptyBucket() });
    const bucket = entry[band] ?? (entry[band] = emptyBucket());
    bucket.inputTokens += usage.inputTokens ?? 0;
    bucket.outputTokens += usage.outputTokens ?? 0;
    bucket.cacheReadTokens += usage.cacheReadTokens ?? 0;
    bucket.cacheWriteTokens += usage.cacheWriteTokens ?? 0;
    this.#save(data);
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
}
