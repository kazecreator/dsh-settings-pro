import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { contentHasImage } from "@deepseek-ai/dsh-llm";
import { Config } from "./config.js";
import { startIm } from "./im.js";
import { MemoryStore } from "./memory-store.js";
import { PetStore } from "./pet-store.js";
import { cachedCatalog, fetchCatalog, resolveZhName } from "./codex-pets.js";
import { PET_PAGE } from "./pet-page.js";
import { PetsMonitor } from "./pets.js";
import { UsageService } from "./usage.js";
import { VisionService } from "./vision.js";

/** Stable Cordis plugin name used by loader diagnostics. */
const name = "dsh-settings-pro";

/**
 * Services are resolved defensively via `ctx.get(...)` after the loader
 * settles (mirrors dsh-im), so the plugin degrades gracefully in profiles
 * that lack a particular seam.
 */
const inject = [];

function home() {
  return process.env.DSH_HOME ?? join(homedir(), ".dsh");
}

function storageDir() {
  return join(home(), "storages", name);
}

/**
 * Resolve the DSH UI language for the pet bubble. The locale plugin stores an
 * explicit `locale.preference` ("zh"/"en") in the host user-settings document;
 * when absent, DSH defers to the browser, so we return null and let the client
 * fall back to `navigator.language`. Returns null when the settings service (or
 * the locale namespace) isn't composed.
 */
function readUiLang(ctx) {
  try {
    const settings = ctx.get("settings");
    const svc = settings?.settings ?? settings; // tolerate both service shapes
    const pref = svc?.get?.("locale")?.preference;
    return pref === "zh" || pref === "en" ? pref : null;
  } catch {
    return null;
  }
}

/** Marker so the re-issued text-only request skips the vision rewrite. */
const VISION_DONE = Symbol("settings-pro:vision-done");
/** Marker guarding the one-time model-modality patch. */
const VISION_MODALITY_PATCHED = Symbol("settings-pro:vision-modality-patched");

function hasImageContent(messages) {
  return Array.isArray(messages) && messages.some(
    (message) => message && Array.isArray(message.content) && contentHasImage(message.content),
  );
}

async function describeImageBlock(attachments, vision, block) {
  try {
    const stored = await attachments.readImage(block.attachment);
    const description = await vision.describe(stored.data, { mediaType: stored.ref.mediaType, question: "" });
    const text = String(description ?? "").trim();
    return text !== "" ? `[图片内容] ${text}` : "[图片]";
  } catch {
    return "[图片]";
  }
}

/**
 * Replace image blocks (and images nested inside tool results) with text
 * descriptions produced by the configured vision model, so a text-only main
 * model can still consume picture messages.
 */
async function describeImagesToText(attachments, vision, messages) {
  const out = [];
  for (const message of messages) {
    const blocks = message && message.content;
    if (!Array.isArray(blocks) || !contentHasImage(blocks)) {
      out.push(message);
      continue;
    }
    const next = [];
    for (const block of blocks) {
      if (block && block.type === "image") {
        next.push({ type: "text", text: await describeImageBlock(attachments, vision, block) });
      } else if (block && block.type === "tool-result" && Array.isArray(block.content) && contentHasImage(block.content)) {
        const inner = [];
        for (const b of block.content) {
          inner.push(b && b.type === "image" ? { type: "text", text: await describeImageBlock(attachments, vision, b) } : b);
        }
        next.push({ ...block, content: inner });
      } else {
        next.push(block);
      }
    }
    out.push({ ...message, content: next });
  }
  return out;
}

function sendJson(res, payload, statusCode = 200) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache",
  });
  res.end(JSON.stringify(payload));
}

function registerRoute(ctx, path, handler) {
  const webServer = ctx.get("webServer");
  if (webServer == null || typeof webServer.register !== "function") return;
  const route = typeof path === "string"
    ? { kind: "exact", path, handler }
    : { ...path, handler };
  webServer.register(route);
}

function runtimeConfigPath() {
  return join(storageDir(), "config.json");
}

function loadRuntimeConfig() {
  try {
    const parsed = JSON.parse(readFileSync(runtimeConfigPath(), "utf8"));
    return parsed != null && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveRuntimeConfig(config) {
  try {
    mkdirSync(dirname(runtimeConfigPath()), { recursive: true });
    writeFileSync(runtimeConfigPath(), JSON.stringify(config, null, 2) + "\n");
  } catch (error) {
    console.error(`[${name}] failed to save runtime config:`, error);
  }
}

function readJson(req, maxBytes = 1e6) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) req.destroy(new Error("body too large"));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function formatUsageText(payload) {
  const lines = [];
  const infos = payload?.balance?.balance_infos;
  if (Array.isArray(infos) && infos.length > 0) {
    for (const b of infos) {
      lines.push(
        `余额(${b.currency}): 总计 ${b.total_balance}，赠送 ${b.granted_balance}，充值 ${b.topped_up_balance}`,
      );
    }
  } else if (payload?.balanceError) {
    lines.push(`余额查询失败: ${payload.balanceError}`);
  }
  // Prefer the official backfill's "today" (matches platform.deepseek.com);
  // fall back to the live local token store only before the first backfill.
  const today = payload?.today?.date;
  const officialToday = (payload?.officialDaily ?? []).find((d) => d.date === today);
  if (officialToday && (officialToday.cost > 0 || officialToday.cacheHit > 0 || officialToday.cacheMiss > 0 || officialToday.response > 0)) {
    const hit = officialToday.cacheHit || 0;
    const miss = officialToday.cacheMiss || 0;
    const resp = officialToday.response || 0;
    lines.push(
      `今日用量: 输入缓存命中 ${hit} / 未命中 ${miss} / 输出 ${resp} tokens，成本 ¥${Number(officialToday.cost || 0).toFixed(2)}`,
    );
  } else {
    const total = payload?.today?.total;
    if (total) {
      lines.push(
        `今日用量: 输入 ${total.inputTokens}（命中缓存 ${total.cacheReadTokens}）/ 输出 ${total.outputTokens} tokens，成本约 ¥${Number(total.cost).toFixed(2)}`,
      );
    }
  }
  return lines.join("\n") || "暂无用量数据";
}

function registerUsageTool(ctx, usage) {
  const tools = ctx.get("tools");
  if (tools == null || typeof tools.register !== "function") return;

  tools.register(
    defineTool({
      name: "get_usage",
      description: "查询 DeepSeek 账户余额与本地统计的每日 token 用量/成本（按峰谷时段计价）。",
      parameters: {},
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: value }],
      },
      async execute(_args, _exec) {
        if (!usage.enabled) return "用量功能未启用。请在「设置 Pro → 用量」中开启。";
        return formatUsageText(await usage.payload(true));
      },
    }),
  );
}

function registerMemoryTools(ctx, memory, enabled) {
  const tools = ctx.get("tools");
  if (tools == null || typeof tools.register !== "function") return;

  tools.register(
    defineTool({
      name: "read_memory",
      description: "读取跨重启的持久化记忆（上次对话摘要 + 工程进度记录）。",
      parameters: {},
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: value }],
      },
      async execute(_args, _exec) {
        if (!enabled.value) return "记忆功能未启用。请在「设置 Pro → 记忆」中开启。";
        return memory.summaryText() || "（暂无记忆）";
      },
    }),
  );

  tools.register(
    defineTool({
      name: "write_memory",
      description: "写入一条跨重启的持久化记忆（工程进度/结论/待办），新会话会自动注入。",
      parameters: {
        text: { type: "string", required: true, description: "要记住的内容" },
        summary: { type: "string", description: "可选：整体替换当前记忆摘要" },
      },
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: value }],
      },
      async execute(args, _exec) {
        if (!enabled.value) return "记忆功能未启用。请在「设置 Pro → 记忆」中开启。";
        if (typeof args.summary === "string" && args.summary.trim() !== "") {
          memory.setSummary(args.summary);
        }
        memory.addNote(args.text);
        return "已写入记忆";
      },
    }),
  );
}

function registerMemoryInjection(ctx, memory, enabled) {
  const systemPrompt = ctx.get("systemPrompt");
  if (systemPrompt == null || typeof systemPrompt.context !== "function") return;
  systemPrompt.context({
    name: "settings-pro-memory",
    order: 50,
    // Only the curated summary is injected into the prompt (cross-session,
    // low-noise). The full memory — including per-session notes — stays in the
    // store and is queried on demand via `read_memory`, so one session can ask
    // what another session is doing or did, without every session's raw notes
    // being dumped into every prompt.
    text: () => (enabled.value ? memory.getSummary() : ""),
  });
}

function extractMessageText(content) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block != null && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/**
 * Auto-capture direct human prompts (chat records) into memory, so the memory
 * tab shows additions without the model having to call `write_memory` manually.
 * Synthetic messages (goal rounds, agent injects) are filtered out by source.
 */
function registerMemoryCapture(ctx, memory, enabled) {
  ctx.on("session/event", (session, event) => {
    if (!enabled.value) return;
    if (event.type !== "user/message") return;
    if (event.data?.source?.kind !== "user") return;
    const text = extractMessageText(event.data?.content);
    if (text === "") return;
    memory.addNote(text, { sessionId: session.id });
  });
}

function apply(ctx, config) {
  const resolved = config ?? {};
  const loader = ctx.get("loader");

  const start = () => {
    try {
      const dir = storageDir();
      const runtime = loadRuntimeConfig();

      // Runtime-overridable feature switches. `usage`/`memory` start from the
      // patch config but can be toggled live from the panel (persisted to
      // runtime config), matching pets/vision/IM.
      const usageEnabled = { value: runtime.usageEnabled ?? (resolved.usageEnabled === true) };
      const memoryEnabled = { value: runtime.memoryEnabled ?? (resolved.memoryEnabled === true) };

      // --- usage (balance + daily usage, runtime-toggleable) ---
      const usage = new UsageService(ctx, { ...resolved, usageEnabled: usageEnabled.value }, dir);
      usage.start();
      registerUsageTool(ctx, usage);
      registerRoute(ctx, "/settings-pro/usage", async (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        if (!usage.enabled) {
          sendJson(res, { disabled: true, enabled: false });
          return;
        }
        try {
          const payload = await usage.payload(false);
          payload.hasPlatformToken = String(loadRuntimeConfig().deepseekPlatformToken ?? "").trim() !== "";
          sendJson(res, payload);
        } catch (error) {
          sendJson(res, { error: error?.message ?? String(error) }, 500);
        }
      });

      registerRoute(ctx, "/settings-pro/usage/toggle", (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        readJson(req)
          .then((body) => {
            const rc = loadRuntimeConfig();
            rc.usageEnabled = body.enabled === true;
            saveRuntimeConfig(rc);
            usageEnabled.value = rc.usageEnabled;
            usage.setEnabled(rc.usageEnabled);
            sendJson(res, { enabled: usage.enabled });
          })
          .catch((error) => sendJson(res, { error: error?.message ?? String(error) }, 400));
      });

      // Backfill accurate daily cost + token breakdown from the platform.
      // The token is remembered in runtime config so a later re-sync works
      // without pasting it again; later days come from local balance deltas.
      registerRoute(ctx, "/settings-pro/usage/backfill", (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        readJson(req)
          .then(async (body) => {
            const rc = loadRuntimeConfig();
            let token = String(body?.token ?? "").trim();
            if (body?.auto === true && token === "") {
              // Auto-sync: read the browser session first, then fall back to
              // the saved token, so a re-sync keeps working even when the
              // browser session is gone.
              token = await usage.autoPlatformToken();
            }
            if (token === "") token = String(rc.deepseekPlatformToken ?? "").trim();
            if (token === "") {
              throw new Error(
                body?.auto === true
                  ? "未在浏览器找到 platform 登录会话，请先在 platform.deepseek.com 登录，再点「自动同步」"
                  : "请填入 platform 的 userToken",
              );
            }
            const costs = await usage.backfillOfficial(token, Number(body?.months) || 3);
            rc.deepseekPlatformToken = token;
            saveRuntimeConfig(rc);
            return { costs, hasPlatformToken: true, auto: body?.auto === true };
          })
          .then((result) => sendJson(res, result))
          .catch((error) => sendJson(res, { error: error?.message ?? String(error) }, 400));
      });

      // --- memory (cross-restart notes, runtime-toggleable) ---
      const memory = new MemoryStore(dir);
      registerMemoryTools(ctx, memory, memoryEnabled);
      registerMemoryInjection(ctx, memory, memoryEnabled);
      registerMemoryCapture(ctx, memory, memoryEnabled);

      registerRoute(ctx, "/settings-pro/memory", (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        if (!memoryEnabled.value) {
          sendJson(res, { disabled: true, enabled: false });
          return;
        }
        sendJson(res, memory.exportJson());
      });

      registerRoute(ctx, "/settings-pro/memory/toggle", (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        readJson(req)
          .then((body) => {
            const rc = loadRuntimeConfig();
            rc.memoryEnabled = body.enabled === true;
            saveRuntimeConfig(rc);
            memoryEnabled.value = rc.memoryEnabled;
            sendJson(res, { enabled: memoryEnabled.value });
          })
          .catch((error) => sendJson(res, { error: error?.message ?? String(error) }, 400));
      });

      registerRoute(ctx, "/settings-pro/memory/export.md", (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        const params = new URL(req.url ?? "", "http://localhost").searchParams;
        const from = params.get("from") ?? "";
        const to = params.get("to") ?? "";
        const markdown = memory.exportMarkdown({ from, to });

        const dFrom = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : "";
        const dTo = /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : "";
        let name;
        if (dFrom && dTo) name = dFrom === dTo ? dFrom : `${dFrom}_${dTo}`;
        else if (dFrom) name = `from-${dFrom}`;
        else if (dTo) name = `to-${dTo}`;
        else name = "all";

        res.writeHead(200, {
          "content-type": "text/markdown; charset=utf-8",
          "cache-control": "no-cache",
          "content-disposition": `attachment; filename="memory-${name}.md"`,
        });
        res.end(markdown);
      });

      registerRoute(ctx, "/settings-pro/memory/clear", (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        memory.clear();
        sendJson(res, memory.exportJson());
      });

      const petsEnabled = runtime.petsEnabled ?? (resolved.petsEnabled === true);
      const pets = new PetsMonitor(ctx, { ...resolved, petsEnabled });
      pets.start();
      const petStore = new PetStore(dir);
      const vision = new VisionService(ctx, { ...resolved, ...runtime });

      // When the main model cannot see images, route any image content through
      // the configured vision model and re-issue the call as text.
      ctx.on("llm/stream", function (options, next) {
        if (options[VISION_DONE]) return next();
        if (!vision.enabled || !hasImageContent(options.messages)) return next();
        const attachments = ctx.get("attachments");
        if (!attachments || typeof attachments.readImage !== "function") return next();
        const llm = ctx.get("llm");
        if (!llm || typeof llm.stream !== "function") return next();

        // Short-circuit synchronously; the async vision work is deferred into
        // the returned async generator so the waterfall stays an AsyncIterable.
        return (async function* () {
          const messages = await describeImagesToText(attachments, vision, options.messages);
          yield* llm.stream({ ...options, messages, [VISION_DONE]: true });
        })();
      }, { global: true, prepend: true });

      // While vision is enabled, report image support for the main model so the
      // host admits image attachments (they are described above instead of being
      // rejected as "model does not support images").
      const llmService = ctx.get("llm");
      if (llmService && typeof llmService.resolveModelInfo === "function" && !llmService[VISION_MODALITY_PATCHED]) {
        llmService[VISION_MODALITY_PATCHED] = true;
        const originalResolve = llmService.resolveModelInfo.bind(llmService);
        llmService.resolveModelInfo = async function (provider, model, signal) {
          const info = await originalResolve(provider, model, signal);
          if (!vision.enabled) return info;
          if (info && Array.isArray(info.inputModalities) && !info.inputModalities.includes("image")) {
            return { ...info, inputModalities: [...info.inputModalities, "image"] };
          }
          return info;
        };
      }

      // --- vision (image → text description via an OpenAI-compatible VLM) ---
      registerRoute(ctx, "/vision/status", (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        sendJson(res, {
          enabled: vision.enabled,
          baseUrl: vision.baseUrl,
          model: vision.model,
          apiKeyEnv: vision.apiKeyEnv,
          maxTokens: resolved.visionMaxTokens ?? 2048,
        });
      });

      registerRoute(ctx, "/vision/describe", (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        readJson(req, 12 * 1024 * 1024)
          .then((body) => {
            const dataUrl = body?.dataUrl ?? "";
            const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(String(dataUrl));
            if (!m) throw new Error("缺少 dataUrl 图片数据");
            const bytes = Buffer.from(m[2], "base64");
            return vision.describe(bytes, { mediaType: m[1].toLowerCase(), question: body?.question ?? "" });
          })
          .then((description) => sendJson(res, { description }))
          .catch((error) => sendJson(res, { error: error?.message ?? String(error) }, 400));
      });

      // List models from the configured (or a draft) endpoint for the dropdown.
      registerRoute(ctx, "/vision/models", (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        let baseUrl;
        try {
          baseUrl = new URL(req.url ?? "", "http://localhost").searchParams.get("baseUrl") ?? undefined;
        } catch {
          baseUrl = undefined;
        }
        vision.listModels({ baseUrl })
          .then((models) => {
            const v = models.filter((id) => VisionService.isVisionModel(id));
            sendJson(res, { models, vision: v.length > 0 ? v : models });
          })
          .catch((error) => sendJson(res, { error: error?.message ?? String(error) }, 400));
      });

      // Providers with vision models, from the same pi-ai catalog the harness
      // registers models from. Drives the settings panel's provider dropdown.
      registerRoute(ctx, "/vision/providers", (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        vision.listVisionProviders()
          .then((providers) => sendJson(res, { providers }))
          .catch((error) => sendJson(res, { error: error?.message ?? String(error) }, 400));
      });

      // Persist vision settings to runtime config (survives restart, editable in the panel).
      registerRoute(ctx, "/vision/config", (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        readJson(req)
          .then((body) => {
            const rc = loadRuntimeConfig();
            for (const f of ["visionEnabled", "visionBaseUrl", "visionModel", "visionApiKeyEnv", "visionMaxTokens", "visionTimeoutMs"]) {
              if (body[f] !== undefined) rc[f] = body[f];
            }
            saveRuntimeConfig(rc);
            vision.config = { ...resolved, ...rc };
            sendJson(res, {
              enabled: vision.enabled,
              baseUrl: vision.baseUrl,
              model: vision.model,
              apiKeyEnv: vision.apiKeyEnv,
              maxTokens: rc.visionMaxTokens ?? resolved.visionMaxTokens ?? 2048,
            });
          })
          .catch((error) => sendJson(res, { error: error?.message ?? String(error) }, 400));
      });

      // --- pet catalog (list / select / add / remove / images) ---
      const petListPayload = () => ({ active: petStore.active(), pets: petStore.list() });

      // SSE so both the /pet window and the settings panel react instantly to
      // pet changes (apply / add / remove / size / install progress), instead
      // of waiting for the next poll. Cross-process too: settings live in the
      // browser while the pet lives in the Electron window.
      const petEventClients = new Set();
      const broadcastPetEvent = (payload) => {
        const data = `data: ${JSON.stringify(payload)}\n\n`;
        for (const client of petEventClients) {
          try { client.write(data); } catch { petEventClients.delete(client); }
        }
      };

      // Push live status snapshots to the pet windows so the bubble updates in
      // near-real-time as the agent works, instead of waiting for the 5s poll.
      // The monitor already throttles this to ~2 pushes/sec during streaming.
      const broadcastPetStatus = () => {
        broadcastPetEvent({
          type: "pet-status",
          status: {
            ...pets.status(),
            petSize: Number(loadRuntimeConfig().petSize) || 84,
            petOpenMode: String(loadRuntimeConfig().petOpenMode || "browser"),
            lang: readUiLang(ctx),
          },
        });
      };
      pets.onStatusChange = broadcastPetStatus;

      registerRoute(ctx, "/settings-pro/pets", (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        sendJson(res, {
          ...pets.status(),
          petSize: Number(loadRuntimeConfig().petSize) || 84,
          petOpenMode: String(loadRuntimeConfig().petOpenMode || "browser"),
          lang: readUiLang(ctx),
        });
      });
      registerRoute(ctx, "/settings-pro/pets/size", (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        readJson(req)
          .then((body) => {
            const size = Math.max(40, Math.min(200, Number(body?.size) || 84));
            const rc = loadRuntimeConfig();
            rc.petSize = size;
            saveRuntimeConfig(rc);
            // Push the new size to the /pet window immediately (no poll delay).
            broadcastPetEvent({ type: "pet-size-changed", petSize: size });
            sendJson(res, { petSize: size });
          })
          .catch((error) => sendJson(res, { error: error?.message ?? String(error) }, 400));
      });
      registerRoute(ctx, "/settings-pro/pets/open-mode", (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        readJson(req)
          .then((body) => {
            const mode = body?.mode === "app" ? "app" : "browser";
            const rc = loadRuntimeConfig();
            rc.petOpenMode = mode;
            saveRuntimeConfig(rc);
            broadcastPetStatus();
            sendJson(res, { petOpenMode: mode });
          })
          .catch((error) => sendJson(res, { error: error?.message ?? String(error) }, 400));
      });
      registerRoute(ctx, "/settings-pro/pets/toggle", (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        readJson(req)
          .then((body) => {
            const rc = loadRuntimeConfig();
            rc.petsEnabled = body.enabled === true;
            saveRuntimeConfig(rc);
            pets.setEnabled(rc.petsEnabled);
            broadcastPetStatus();
            sendJson(res, { enabled: pets.enabled });
          })
          .catch((error) => sendJson(res, { error: error?.message ?? String(error) }, 400));
      });

      // Manually delete all legacy guardian goals (belt-and-suspenders next to
      // the automatic startup cleanup).
      registerRoute(ctx, "/settings-pro/pets/clear-goals", (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        pets.clearLegacyGoals();
        sendJson(res, { ok: true, status: pets.status() });
      });

      // Standalone desktop-pet window: a draggable pet with a status bubble,
      // served at /pet so it can be opened outside the main web GUI.
      registerRoute(ctx, "/pet", (req, res) => {
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-cache",
        });
        res.end(PET_PAGE);
      });

      registerRoute(ctx, "/pets/events", (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        res.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
          "connection": "keep-alive",
        });
        res.write(`data: ${JSON.stringify({ type: "hello" })}\n\n`);
        petEventClients.add(res);
        req.on("close", () => petEventClients.delete(res));
      });

      registerRoute(ctx, "/pets/list", (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        sendJson(res, petListPayload());
      });

      registerRoute(ctx, "/pets/active", (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        sendJson(res, petStore.get(petStore.active()) ?? petStore.list()[0] ?? null);
      });

      registerRoute(ctx, "/pets/select", (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        readJson(req)
          .then((body) => {
            petStore.setActive(body?.id);
            broadcastPetEvent({ type: "pet-changed" });
            sendJson(res, petListPayload());
          })
          .catch((error) => sendJson(res, { error: error?.message ?? String(error) }, 400));
      });

      registerRoute(ctx, "/pets/add", (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        readJson(req, 24 * 1024 * 1024)
          .then((body) => {
            const pet = body?.zip != null
              ? petStore.addFromZip(Buffer.from(body.zip, "base64"))
              : petStore.addFromSteps(body ?? {});
            petStore.setActive(pet.id);
            broadcastPetEvent({ type: "pet-changed" });
            sendJson(res, petListPayload());
          })
          .catch((error) => sendJson(res, { error: error?.message ?? String(error) }, 400));
      });

      registerRoute(ctx, "/pets/remove", (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        readJson(req)
          .then((body) => {
            petStore.remove(body?.id);
            broadcastPetEvent({ type: "pet-changed" });
            sendJson(res, petListPayload());
          })
          .catch((error) => sendJson(res, { error: error?.message ?? String(error) }, 400));
      });

      // Online Codex pet catalog (Awesome Codex Pet). Fetch-on-first-view,
      // cached locally afterwards.
      registerRoute(ctx, "/pets/catalog", async (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        try {
          let list = cachedCatalog(dir);
          if (list == null) list = await fetchCatalog(dir);
          const installed = new Set(petStore.listCodex().map((p) => p.id));
          sendJson(res, {
            pets: list.map((entry) => ({
              id: entry.slug,
              name: entry.localized_names?.en ?? entry.name ?? entry.slug ?? "",
              nameZh: resolveZhName(entry.slug, entry.name, entry.localized_names),
              author: entry.author ?? "",
              category: entry.primary_category ?? "",
              license: entry.license ?? "",
              description: entry.description ?? "",
              installed: installed.has(entry.slug),
            })),
          });
        } catch (error) {
          sendJson(res, { error: error?.message ?? String(error) }, 500);
        }
      });

      registerRoute(ctx, "/pets/install-codex", (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        readJson(req)
          .then(async (body) => {
            const id = String(body?.id ?? "");
            const report = (phase, percent, error) => {
              broadcastPetEvent({ type: "install-progress", petId: id, phase, percent, error });
            };
            report("fetching", 0);
            try {
              const pet = await petStore.installCodex(id, (p) => {
                const total = Number(p?.total) || 0;
                const percent = p?.phase === "fetching"
                  ? 5
                  : total > 0 ? Math.min(99, Math.round((Number(p.loaded) / total) * 100)) : 0;
                report(p?.phase ?? "downloading", percent);
              });
              petStore.setActive(pet.id);
              report("done", 100);
              broadcastPetEvent({ type: "pet-changed" });
              sendJson(res, petListPayload());
            } catch (error) {
              report("error", 0, error?.message ?? String(error));
              sendJson(res, { error: error?.message ?? String(error) }, 400);
            }
          })
          .catch((error) => sendJson(res, { error: error?.message ?? String(error) }, 400));
      });

      // Serve cached Codex sprite sheets by id.
      registerRoute(ctx, { kind: "prefix", path: "/pets/codex" }, (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        try {
          const rel = decodeURIComponent((req.url ?? "").replace(/^\/pets\/codex\/?/, "").split("?")[0]);
          const id = rel.split("/")[0];
          const fileName = rel.split("/")[1] ?? "spritesheet.webp";
          if (!/^[a-zA-Z0-9._-]+$/.test(id) || !/^[a-zA-Z0-9._-]+$/.test(fileName)) {
            res.writeHead(400);
            res.end();
            return;
          }
          const file = join(dir, "pets", "codex", id, fileName);
          const buf = readFileSync(file);
          res.writeHead(200, {
            "content-type": fileName.endsWith(".webp") ? "image/webp" : "application/octet-stream",
            "cache-control": "public, max-age=86400",
          });
          res.end(buf);
        } catch {
          res.writeHead(404);
          res.end();
        }
      });

      // Serve user-uploaded pet images by path.
      registerRoute(ctx, { kind: "prefix", path: "/pets/user" }, (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        try {
          const rel = decodeURIComponent((req.url ?? "").replace(/^\/pets\/user\/?/, "").split("?")[0]);
          if (rel.includes("..") || rel.includes("/")) {
            res.writeHead(400);
            res.end();
            return;
          }
          const file = join(dir, "pets", "user", rel);
          const buf = readFileSync(file);
          const ext = rel.split(".").pop()?.toLowerCase();
          const mime = ext === "gif" ? "image/gif" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "application/octet-stream";
          res.writeHead(200, { "content-type": mime, "cache-control": "public, max-age=3600" });
          res.end(buf);
        } catch (error) {
          res.writeHead(404);
          res.end();
        }
      });

      // IM bridge (Telegram / WeChat), self-contained within settings-pro.
      // Wire its session→channel lookup into the pets monitor so the bubble can
      // label activity with its origin (telegram / wechat / web).
      const imController = startIm(ctx, resolved, vision, usage);
      pets.setChannelResolver((sessionId) => imController?.channelForSession(sessionId) ?? null);

      registerRoute(ctx, "/settings-pro/status", (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        sendJson(res, { ok: true, plugin: name, storageDir: dir });
      });

      ctx.on("dispose", () => {
        usage.dispose();
      });

      console.log(
        `[${name}] loaded (usage=${String(usageEnabled.value)}, memory=${String(memoryEnabled.value)}, pets=${String(pets.enabled)}, telegram=${String(resolved.telegramEnabled)}, wechat=${String(resolved.wechatEnabled)})`,
      );
    } catch (error) {
      console.error(`[${name}] start failed:`, error);
    }
  };

  if (loader != null && typeof loader.await === "function") {
    loader.await().then(start).catch((error) => {
      console.error(`[${name}] loader await failed:`, error);
      start();
    });
  } else {
    start();
  }
}

export { Config, apply, inject, name };
export default { name, inject, Config, apply };
