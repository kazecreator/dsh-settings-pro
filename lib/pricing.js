import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Default DeepSeek peak/off-peak pricing (元 / 1M tokens), effective
 * 2026-08-17 00:00 Beijing time (UTC+8).
 * Peak windows: 09:00-12:00 and 14:00-18:00 Beijing time; everything else is
 * off-peak (half the peak price).
 */
export const DEFAULT_PRICING = {
  timezone: "Asia/Shanghai",
  peakWindows: [
    { start: "09:00", end: "12:00" },
    { start: "14:00", end: "18:00" },
  ],
  defaultModel: "deepseek-v4-pro",
  models: {
    "deepseek-v4-flash": {
      peak: { inputCacheHit: 0.1, inputCacheMiss: 3.0, output: 9.0 },
      offpeak: { inputCacheHit: 0.05, inputCacheMiss: 1.5, output: 4.5 },
    },
    "deepseek-v4-pro": {
      peak: { inputCacheHit: 0.3, inputCacheMiss: 9.0, output: 27.0 },
      offpeak: { inputCacheHit: 0.15, inputCacheMiss: 4.5, output: 13.5 },
    },
    // Harness may report the older ids until models are renamed; alias to v4-pro.
    "deepseek-chat": {
      peak: { inputCacheHit: 0.3, inputCacheMiss: 9.0, output: 27.0 },
      offpeak: { inputCacheHit: 0.15, inputCacheMiss: 4.5, output: 13.5 },
    },
    "deepseek-reasoner": {
      peak: { inputCacheHit: 0.3, inputCacheMiss: 9.0, output: 27.0 },
      offpeak: { inputCacheHit: 0.15, inputCacheMiss: 4.5, output: 13.5 },
    },
  },
};

function hhmmToMinutes(value) {
  const [h, m] = String(value).split(":").map(Number);
  return h * 60 + m;
}

/** Local HH:mm minutes in `timezone` for a Date. */
function localMinutes(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  let h = 0;
  let m = 0;
  for (const p of parts) {
    if (p.type === "hour") h = Number(p.value);
    else if (p.type === "minute") m = Number(p.value);
  }
  return h * 60 + m;
}

/** Whether a Date falls inside a configured peak window (in the pricing timezone). */
export function isPeakTime(date, pricing) {
  const minutes = localMinutes(date, pricing.timezone ?? "Asia/Shanghai");
  return (pricing.peakWindows ?? []).some(
    (w) => minutes >= hhmmToMinutes(w.start) && minutes < hhmmToMinutes(w.end),
  );
}

/** Local YYYY-MM-DD in a timezone. */
export function dateInTz(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const g = {};
  for (const p of parts) g[p.type] = p.value;
  return `${g.year}-${g.month}-${g.day}`;
}

/** Per-direction rate for a model and band ("peak" | "offpeak"). */
export function rateForBand(model, band, pricing) {
  const models = pricing.models ?? {};
  const entry = models[model] ?? models[pricing.defaultModel] ?? DEFAULT_PRICING.models["deepseek-v4-pro"];
  return entry[band] ?? entry.offpeak;
}

/** Load a runtime pricing file, layering it over the built-in default. */
export function loadPricing(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed && typeof parsed === "object") {
      return {
        ...DEFAULT_PRICING,
        ...parsed,
        peakWindows: parsed.peakWindows ?? DEFAULT_PRICING.peakWindows,
        models: { ...DEFAULT_PRICING.models, ...(parsed.models ?? {}) },
      };
    }
  } catch {
    // missing/corrupt file → default
  }
  return DEFAULT_PRICING;
}

export function savePricing(path, pricing) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(pricing, null, 2) + "\n");
}
