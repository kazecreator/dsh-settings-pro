import { join } from "node:path";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { isPeakTime, loadPricing, rateForBand } from "./pricing.js";
import { UsageStore } from "./usage-store.js";

const BALANCE_URL = "https://api.deepseek.com/user/balance";
const DEFAULT_REFRESH_MS = 60_000;

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
    this.balanceAt = 0;
    this.timer = null;
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
      this.balanceError = "未配置 DEEPSEEK_API_KEY";
      return null;
    }
    try {
      const res = await fetch(BALANCE_URL, {
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.balance = await res.json();
      this.balanceError = null;
      this.balanceAt = Date.now();
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

  start() {
    this.ctx.on("session/event", (session, event) => {
      if (event.type === "request/header") {
        const model = event.data?.header?.config?.model;
        if (model) this.modelBySession.set(session.id, model);
      } else if (event.type === "assistant/message" && event.data?.usage) {
        const model = this.modelBySession.get(session.id) ?? this.pricing.defaultModel;
        this.store.record(this.store.today(), model, event.data.usage, isPeakTime(new Date(), this.pricing));
      }
    });

    this.refreshBalance();
    const intervalMs = Number.isFinite(this.config.balanceRefreshMs)
      ? this.config.balanceRefreshMs
      : DEFAULT_REFRESH_MS;
    this.timer = setInterval(() => this.refreshBalance(), intervalMs);
    this.timer.unref?.();
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
        const cost = costForBucket(bucket, rateForBand(model, band, this.pricing));
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
    return {
      balance: await this.getBalance(forceBalance),
      balanceError: this.balanceError,
      balanceAt: this.balanceAt,
      today: this.summarizeDay(this.store.today()),
      days: this.store.listDays(),
      pricing: this.pricing,
    };
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
  }
}
