import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { isPeakTime, loadPricing, rateFor } from "./pricing.js";
import { readPlatformTokensFromChrome } from "./platform-token.js";
import { UsageStore } from "./usage-store.js";

const BALANCE_URL = "https://api.deepseek.com/user/balance";
// Legacy UTC-bucketed cost endpoint — still used only to validate a platform
// token (a cheap 200/code check) before the timezone-aligned backfill runs.
const USAGE_COST_URL = "https://platform.deepseek.com/api/v0/usage/cost";
// Timezone-aligned usage endpoints. The `/usage/cost` + `/usage/amount`
// endpoints bucket by UTC day, but the official UI buckets by the viewer's
// local timezone; these `by_api_key` endpoints take `start`/`end`/`tz` (in
// seconds) and return buckets aligned to that timezone's midnight.
const USAGE_BY_API_KEY_COST_URL = "https://platform.deepseek.com/api/v0/usage/by_api_key/cost";
const USAGE_BY_API_KEY_AMOUNT_URL = "https://platform.deepseek.com/api/v0/usage/by_api_key/amount";
// Asia/Shanghai is UTC+8 with no DST — matches the plugin's pricing timezone
// and the official UI for users in China.
const TZ_SEC = 8 * 3600;
const DEFAULT_REFRESH_MS = 60_000;
// Automatic official-usage sync cadence. Daily cost now comes *only* from the
// platform's billed numbers (auto-read from the browser session), never from
// balance deltas, so re-sync periodically to keep "today" fresh.
const AUTO_BACKFILL_MS = 6 * 60 * 60 * 1000; // deep 12-month sync, every 6 hours
const AUTO_BACKFILL_MONTHS = 12; // cover a full year of history
const CURRENT_MONTH_SYNC_MS = 15 * 60 * 1000; // light current-month sync, every 15 min

/**
 * Aggregate the timezone-aligned `by_api_key` usage endpoints into a flat
 * per-day list. Buckets land on local (Beijing) midnight; shift each `time`
 * back to UTC to read its date. `cost` buckets carry the billed amount; `usage`
 * buckets carry token counts (PROMPT_CACHE_HIT_TOKEN / PROMPT_CACHE_MISS_TOKEN
 * / RESPONSE_TOKEN).
 */
function parseByApiKeyUsage(costResp, amountResp) {
  const costBiz = costResp?.data?.biz_data;
  const amountBiz = amountResp?.data?.biz_data;

  const costByTime = {};
  for (const d of costBiz?.data ?? []) {
    for (const s of d.series ?? []) {
      for (const b of s.buckets ?? []) {
        const t = Number(b.time);
        if (!Number.isFinite(t)) continue;
        costByTime[t] = (costByTime[t] || 0) + (Number(b.cost) || 0);
      }
    }
  }

  const tokensByTime = {};
  for (const s of amountBiz?.series ?? []) {
    for (const b of s.buckets ?? []) {
      const t = Number(b.time);
      if (!Number.isFinite(t)) continue;
      const entry = tokensByTime[t] ?? (tokensByTime[t] = { hit: 0, miss: 0, resp: 0 });
      entry.hit += Number(b.usage?.PROMPT_CACHE_HIT_TOKEN) || 0;
      entry.miss += Number(b.usage?.PROMPT_CACHE_MISS_TOKEN) || 0;
      entry.resp += Number(b.usage?.RESPONSE_TOKEN) || 0;
    }
  }

  const times = new Set([...Object.keys(costByTime), ...Object.keys(tokensByTime)].map(Number));
  const days = [];
  for (const time of [...times].sort((a, b) => a - b)) {
    const date = new Date((time + TZ_SEC) * 1000).toISOString().slice(0, 10);
    const tk = tokensByTime[time] ?? { hit: 0, miss: 0, resp: 0 };
    const hit = tk.hit;
    const miss = tk.miss;
    const resp = tk.resp;
    days.push({
      date,
      cacheHitTokens: hit,
      cacheMissTokens: miss,
      responseTokens: resp,
      totalTokens: hit + miss + resp,
      totalCost: costByTime[time] ?? 0,
    });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));

  return days;
}

/**
 * Normalize a pasted platform token. The platform's `localStorage.userToken`
 * value is a JSON blob (e.g. `{"value":"…"}`), so accept either the raw token
 * or that JSON wrapper.
 */
function normalizePlatformToken(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  if (trimmed[0] !== "{" && trimmed[0] !== "[") return trimmed;
  try {
    const obj = JSON.parse(trimmed);
    if (typeof obj === "string" && obj.trim()) return obj.trim();
    for (const key of ["value", "token", "access_token", "accessToken", "userToken"]) {
      const v = obj?.[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  } catch {
    // not valid JSON — fall through to the raw value
  }
  return trimmed;
}

function costForBucket(bucket, rate) {
  const miss = (bucket.inputTokens ?? 0) + (bucket.cacheWriteTokens ?? 0);
  const hit = bucket.cacheReadTokens ?? 0;
  const out = bucket.outputTokens ?? 0;
  return {
    inputMissTokens: miss,
    inputHitTokens: hit,
    outputTokens: out,
    inputMissCost: (miss / 1e6) * rate.inputCacheMiss,
    inputHitCost: (hit / 1e6) * rate.inputCacheHit,
    outputCost: (out / 1e6) * rate.output,
    total: (miss / 1e6) * rate.inputCacheMiss + (hit / 1e6) * rate.inputCacheHit + (out / 1e6) * rate.output,
  };
}

/**
 * Usage service: subscribes to the `session/event` firehose, buckets provider
 * token usage by (day × model × peak/offpeak), and exposes DeepSeek balance.
 */
export class UsageService {
  #enabled = false;

  constructor(ctx, config, dir) {
    this.ctx = ctx;
    this.config = config ?? {};
    this.dir = dir;
    this.pricingPath = join(dir, "pricing.json");
    this.pricing = loadPricing(this.pricingPath);
    this.store = new UsageStore(dir, this.pricing.timezone);
    this.modelBySession = new Map();
    this.balance = null;
    this.balanceError = null;
    this.timer = null;
    this.backfillTimer = null;
    this.currentMonthTimer = null;
    this.backfilling = false;
    this.platformToken = "";
    this.costHistoryPath = join(dir, "cost-history.json");
    this.costHistory = this.#loadCostHistory();
    this.#enabled = this.config.usageEnabled === true;
  }

  get enabled() {
    return this.#enabled;
  }

  /** Toggle live from the settings panel: start/stop the timers + balance poll. */
  setEnabled(value) {
    const on = value === true;
    if (on === this.#enabled) return;
    this.#enabled = on;
    if (on) this.#startTimers();
    else this.#stopTimers();
  }

  #loadCostHistory() {
    try {
      const parsed = JSON.parse(readFileSync(this.costHistoryPath, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // missing/corrupt → empty
    }
    return {};
  }

  #saveCostHistory() {
    try {
      mkdirSync(dirname(this.costHistoryPath), { recursive: true });
      writeFileSync(this.costHistoryPath, JSON.stringify(this.costHistory, null, 2) + "\n");
    } catch {
      // best-effort persistence
    }
  }

  /**
   * Official daily usage (billed cost + cache hit/miss/response tokens) for the
   * backfilled days. This is now the single source of truth for the usage chart
   * — the old balance-delta estimate was dropped because its samples aren't
   * taken at midnight, so its "today" swallowed part of the previous day.
   * @returns {Array<{date:string, cost:number, cacheHit:number, cacheMiss:number, response:number}>}
   */
  officialDaily() {
    const today = this.store.today();
    return Object.entries(this.costHistory)
      .filter(([date]) => date <= today)
      .map(([date, entry]) => {
        const e = typeof entry === "number" ? { cost: entry } : entry;
        return {
          date,
          cost: e?.cost || 0,
          cacheHit: e?.cacheHit || 0,
          cacheMiss: e?.cacheMiss || 0,
          response: e?.response || 0,
        };
      })
      // A zero entry is a "no usage / not yet settled" placeholder (today before
      // the platform settles the day, or a future day). Drop it so it never
      // overrides the live local token store.
      .filter((d) => d.cost > 0 || d.cacheHit > 0 || d.cacheMiss > 0 || d.response > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async #apiKey() {
    const credentials = this.ctx.get("credentials");
    if (credentials && typeof credentials.resolve === "function") {
      const hit = await credentials.resolve(credentialRef("DEEPSEEK_API_KEY"));
      if (hit && hit.value) return hit.value;
    }
    return process.env.DEEPSEEK_API_KEY ?? "";
  }

  async refreshBalance() {
    const key = await this.#apiKey();
    if (!key) {
      this.balanceError = "DEEPSEEK_API_KEY is not configured";
      return null;
    }
    try {
      const res = await fetch(BALANCE_URL, {
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.balance = await res.json();
      this.balanceError = null;
      return this.balance;
    } catch (error) {
      this.balanceError = error?.message ?? String(error);
      return null;
    }
  }

  async getBalance(force = false) {
    if (force || this.balance == null) await this.refreshBalance();
    return this.balance;
  }

  /** Shared request headers for the private platform endpoints. */
  #platformHeaders(token) {
    return {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "x-app-version": "1.0.0",
      Referer: "https://platform.deepseek.com/usage",
      Origin: "https://platform.deepseek.com",
    };
  }

  /** True if a platform token still authenticates the private endpoints. */
  async #platformTokenValid(token) {
    if (!token) return false;
    try {
      const now = new Date();
      const res = await fetch(
        `${USAGE_COST_URL}?month=${now.getMonth() + 1}&year=${now.getFullYear()}`,
        { headers: this.#platformHeaders(token) },
      );
      if (!res.ok) return false;
      const body = await res.json();
      const codes = [body?.code, body?.data?.biz_code];
      if (codes.includes(40002) || codes.includes(40003)) return false;
      return !(typeof body?.code === "number" && body.code !== 0);
    } catch {
      return false;
    }
  }

  /**
   * Auto-detect a platform `userToken` by reading Chromium's on-disk
   * localStorage and validating the candidates. Returns the first valid token
   * or "" when none is found (e.g. the user is not signed in on the platform).
   */
  async autoPlatformToken() {
    if (this.platformToken) return this.platformToken;
    const candidates = readPlatformTokensFromChrome();
    for (const candidate of candidates.slice(0, 20)) {
      if (await this.#platformTokenValid(candidate)) {
        this.platformToken = candidate;
        return candidate;
      }
    }
    return "";
  }

  /**
   * Official backfill: fetch the platform's billed daily cost + token counts
   * for the last `months` months using a `userToken`, and merge it into
   * `cost-history.json`. This is the only source of daily cost/token numbers.
   * @param {string} token platform session token (userToken)
   * @param {number} months how many months back to fetch (default 3)
   * @returns {Promise<Array<{date:string, cost:number, cacheHit:number, cacheMiss:number, response:number}>>}
   */
  async backfillOfficial(token, months = 3) {
    const raw = normalizePlatformToken(token);
    if (raw === "") throw new Error("Please provide the platform userToken");
    const headers = this.#platformHeaders(raw);
    const getJson = async (url) => {
      const res = await fetch(url, { headers });
      if (res.status === 401) throw new Error("Platform token is invalid or expired");
      if (res.status === 429) throw new Error("Too many requests, try again later");
      if (!res.ok) throw new Error(`用量接口 HTTP ${res.status}`);
      const body = await res.json();
      // The platform returns HTTP 200 with a JSON error code when the session
      // has expired; map the known auth codes (40002/40003) to a clear message.
      const codes = [body?.code, body?.data?.biz_code];
      if (codes.includes(40002) || codes.includes(40003)) {
        throw new Error("Platform token has expired; sign in to platform.deepseek.com again and re-sync");
      }
      if (typeof body?.code === "number" && body.code !== 0) {
        throw new Error(`Platform API error code=${body.code}`);
      }
      return body;
    };

    const fetched = {};
    const now = new Date();
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = d.getMonth() + 1;
      const year = d.getFullYear();
      // Local (Beijing) midnight of the month's first day → next month's first
      // day, so the returned daily buckets match the official UI's timezone.
      const start = Math.floor(Date.UTC(year, month - 1, 1) / 1000) - TZ_SEC;
      const end = Math.floor(Date.UTC(year, month, 1) / 1000) - TZ_SEC;
      const [costResp, amountResp] = await Promise.all([
        getJson(`${USAGE_BY_API_KEY_COST_URL}?start=${start}&end=${end}&tz=${TZ_SEC}`),
        getJson(`${USAGE_BY_API_KEY_AMOUNT_URL}?start=${start}&end=${end}&tz=${TZ_SEC}`),
      ]);
      for (const day of parseByApiKeyUsage(costResp, amountResp)) {
        // Keep the token breakdown (cache hit/miss/response) from the amount
        // endpoint, not just the billed cost. Skip days with no usage (e.g.
        // future days in the current month) so they never appear in the chart.
        if (day.totalCost <= 0 && day.totalTokens <= 0) continue;
        fetched[day.date] = {
          cost: day.totalCost,
          cacheHit: day.cacheHitTokens,
          cacheMiss: day.cacheMissTokens,
          response: day.responseTokens,
        };
      }
    }

    this.costHistory = { ...this.costHistory, ...fetched };
    // Prune placeholder entries with no usage (today before settlement, future
    // days, or no-usage days) so they never appear in the chart.
    for (const [date, entry] of Object.entries(this.costHistory)) {
      const e = typeof entry === "number" ? { cost: entry } : entry;
      if (!(e?.cost) && !(e?.cacheHit) && !(e?.cacheMiss) && !(e?.response)) {
        delete this.costHistory[date];
      }
    }
    this.#saveCostHistory();
    return this.officialDaily();
  }

  /**
   * Auto-detect a platform `userToken` from the browser and backfill official
   * usage. Returns false (without throwing) when no valid token is available.
   */
  async autoBackfill(months = AUTO_BACKFILL_MONTHS) {
    const token = await this.autoPlatformToken();
    if (!token) return false;
    await this.backfillOfficial(token, months);
    return true;
  }

  /** Guarded auto-sync: never overlap, and swallow failures for a later retry. */
  async syncOfficial(months = AUTO_BACKFILL_MONTHS) {
    if (!this.#enabled) return;
    if (this.backfilling) return;
    this.backfilling = true;
    try {
      await this.autoBackfill(months);
    } catch {
      // auto-sync is best-effort; clear the cached token so the next tick
      // re-detects (the session may have expired).
      this.platformToken = "";
    } finally {
      this.backfilling = false;
    }
  }

  start() {
    this.ctx.on("session/event", (session, event) => {
      if (!this.#enabled) return;
      if (event.type === "request/header") {
        const model = event.data?.header?.config?.model;
        if (model) this.modelBySession.set(session.id, model);
      } else if (event.type === "assistant/message" && event.data?.usage) {
        const model = this.modelBySession.get(session.id) ?? this.pricing.defaultModel;
        this.store.record(this.store.today(), model, event.data.usage, isPeakTime(new Date(), this.pricing));
      }
    });

    if (this.#enabled) this.#startTimers();
  }

  #startTimers() {
    this.refreshBalance();
    const intervalMs = Number.isFinite(this.config.balanceRefreshMs)
      ? this.config.balanceRefreshMs
      : DEFAULT_REFRESH_MS;
    this.timer = setInterval(() => this.refreshBalance(), intervalMs);
    this.timer.unref?.();

    // Daily cost/tokens come purely from the official platform backfill, so
    // sync it automatically: light current-month refresh every 15 min keeps
    // "today" close to the live platform page, plus a deep 12-month sync.
    const kickOff = setTimeout(() => this.syncOfficial(), 3000);
    kickOff.unref?.();
    this.currentMonthTimer = setInterval(() => this.syncOfficial(1), CURRENT_MONTH_SYNC_MS);
    this.currentMonthTimer.unref?.();
    this.backfillTimer = setInterval(() => this.syncOfficial(AUTO_BACKFILL_MONTHS), AUTO_BACKFILL_MS);
    this.backfillTimer.unref?.();
  }

  #stopTimers() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.backfillTimer) { clearInterval(this.backfillTimer); this.backfillTimer = null; }
    if (this.currentMonthTimer) { clearInterval(this.currentMonthTimer); this.currentMonthTimer = null; }
  }

  summarizeDay(date) {
    const data = this.store.load(date);
    const total = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cost: 0 };
    const models = {};
    for (const [model, bands] of Object.entries(data.models ?? {})) {
      const modelSummary = { peak: null, offpeak: null, totalCost: 0 };
      for (const band of ["offpeak", "peak"]) {
        const bucket = bands?.[band];
        if (!bucket) continue;
        const cost = costForBucket(bucket, rateFor(model, band, date, this.pricing));
        modelSummary[band] = { ...bucket, cost };
        modelSummary.totalCost += cost.total;
        total.inputTokens += bucket.inputTokens ?? 0;
        total.outputTokens += bucket.outputTokens ?? 0;
        total.cacheReadTokens += bucket.cacheReadTokens ?? 0;
        total.cacheWriteTokens += bucket.cacheWriteTokens ?? 0;
      }
      total.cost += modelSummary.totalCost;
      models[model] = modelSummary;
    }
    return { date, total, models };
  }

  async payload(forceBalance = false) {
    const days = this.store.listDays();
    const official = this.officialDaily();
    return {
      balance: await this.getBalance(forceBalance),
      balanceError: this.balanceError,
      today: this.summarizeDay(this.store.today()),
      daily: days.map((date) => this.summarizeDay(date)),
      officialDaily: official,
      lifetimeCost: official.reduce((sum, d) => sum + (d.cost || 0), 0),
      backfilled: Object.keys(this.costHistory).length > 0,
    };
  }

  dispose() {
    this.#stopTimers();
  }
}
