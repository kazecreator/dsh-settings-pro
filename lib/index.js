import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { Config } from "./config.js";
import { startIm } from "./im.js";
import { MemoryStore } from "./memory-store.js";
import { PET_PAGE } from "./pet-page.js";
import { PetsMonitor } from "./pets.js";
import { UsageService } from "./usage.js";
import { OWNER_KEY, sanitizeUserKey, UserRegistry } from "./users.js";

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
  webServer.register({ kind: "exact", path, handler });
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

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) req.destroy(new Error("body too large"));
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

/** Read the `?user=` query param, defaulting to the owner for the web tab. */
function readUserParam(req) {
  try {
    const value = new URL(req.url ?? "", "http://localhost").searchParams.get("user");
    if (value != null && value.trim() !== "") return sanitizeUserKey(value);
  } catch {
    // malformed URL → owner
  }
  return OWNER_KEY;
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
  const total = payload?.today?.total;
  if (total) {
    lines.push(
      `今日用量: 输入 ${total.inputTokens}（命中缓存 ${total.cacheReadTokens}）/ 输出 ${total.outputTokens} tokens，成本约 ¥${Number(total.cost).toFixed(4)}`,
    );
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
        return formatUsageText(await usage.payload(true));
      },
    }),
  );
}

function registerMemoryTools(ctx, memory) {
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
      async execute(_args, exec) {
        return memory.summaryText(exec?.agent?.id) || "（暂无记忆）";
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
      async execute(args, exec) {
        const userKey = memory.resolve(exec?.agent?.id);
        if (typeof args.summary === "string" && args.summary.trim() !== "") {
          memory.setSummary(userKey, args.summary);
        }
        memory.addNote(exec?.agent?.id, args.text);
        return `已写入记忆（用户 ${userKey}）`;
      },
    }),
  );
}

function registerMemoryInjection(ctx, memory) {
  const systemPrompt = ctx.get("systemPrompt");
  if (systemPrompt == null || typeof systemPrompt.context !== "function") return;
  systemPrompt.context({
    name: "settings-pro-memory",
    order: 50,
    text: (context) => memory.summaryText(context?.agent?.id),
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
function registerMemoryCapture(ctx, memory) {
  ctx.on("session/event", (session, event) => {
    if (event.type !== "user/message") return;
    if (event.data?.source?.kind !== "user") return;
    const text = extractMessageText(event.data?.content);
    if (text === "") return;
    memory.addNote(session.id, text, { sessionId: session.id });
  });
}

function apply(ctx, config) {
  const resolved = config ?? {};
  const loader = ctx.get("loader");

  const start = () => {
    try {
      const dir = storageDir();
      const users = new UserRegistry();
      let usage = null;

      if (resolved.usageEnabled !== false) {
        usage = new UsageService(ctx, resolved, dir);
        usage.start();
        registerUsageTool(ctx, usage);
        registerRoute(ctx, "/settings-pro/usage", async (req, res) => {
          if (req.method !== "GET" && req.method !== "HEAD") {
            res.writeHead(405);
            res.end();
            return;
          }
          try {
            sendJson(res, await usage.payload(false));
          } catch (error) {
            sendJson(res, { error: error?.message ?? String(error) }, 500);
          }
        });
      }

      if (resolved.memoryEnabled !== false) {
        const memory = new MemoryStore(dir, { registry: users });
        registerMemoryTools(ctx, memory);
        registerMemoryInjection(ctx, memory);
        registerMemoryCapture(ctx, memory);

        registerRoute(ctx, "/settings-pro/memory", (req, res) => {
          if (req.method !== "GET" && req.method !== "HEAD") {
            res.writeHead(405);
            res.end();
            return;
          }
          sendJson(res, { ...memory.exportJson(readUserParam(req)), users: memory.listUsers() });
        });

        registerRoute(ctx, "/settings-pro/memory/export.md", (req, res) => {
          if (req.method !== "GET" && req.method !== "HEAD") {
            res.writeHead(405);
            res.end();
            return;
          }
          const userKey = readUserParam(req);
          const markdown = memory.exportMarkdown(userKey);
          res.writeHead(200, {
            "content-type": "text/markdown; charset=utf-8",
            "cache-control": "no-cache",
            "content-disposition": `attachment; filename="memory-${userKey}-${new Date().toISOString().slice(0, 10)}.md"`,
          });
          res.end(markdown);
        });

        registerRoute(ctx, "/settings-pro/memory/summary", (req, res) => {
          if (req.method !== "POST") {
            res.writeHead(405);
            res.end();
            return;
          }
          const userKey = readUserParam(req);
          readJson(req)
            .then((body) => {
              memory.setSummary(userKey, body?.summary ?? "");
              sendJson(res, { ...memory.exportJson(userKey), users: memory.listUsers() });
            })
            .catch((error) => sendJson(res, { error: error?.message ?? String(error) }, 400));
        });

        registerRoute(ctx, "/settings-pro/memory/note", (req, res) => {
          if (req.method !== "POST") {
            res.writeHead(405);
            res.end();
            return;
          }
          const userKey = readUserParam(req);
          readJson(req)
            .then((body) => {
              memory.addUserNote(userKey, body?.text ?? "", { sessionId: "manual" });
              sendJson(res, { ...memory.exportJson(userKey), users: memory.listUsers() });
            })
            .catch((error) => sendJson(res, { error: error?.message ?? String(error) }, 400));
        });

        registerRoute(ctx, "/settings-pro/memory/clear", (req, res) => {
          if (req.method !== "POST") {
            res.writeHead(405);
            res.end();
            return;
          }
          const userKey = readUserParam(req);
          memory.clear(userKey);
          sendJson(res, { ...memory.exportJson(userKey), users: memory.listUsers() });
        });
      }

      const runtime = loadRuntimeConfig();
      const petsEnabled = runtime.petsEnabled ?? (resolved.petsEnabled === true);
      const pets = new PetsMonitor(ctx, { ...resolved, petsEnabled });
      pets.start();
      registerRoute(ctx, "/settings-pro/pets", (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        sendJson(res, pets.status());
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

      // IM bridge (Telegram / WeChat), self-contained within settings-pro.
      startIm(ctx, resolved, users);

      registerRoute(ctx, "/settings-pro/status", (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        sendJson(res, { ok: true, plugin: name, storageDir: dir });
      });

      ctx.on("dispose", () => {
        if (usage) usage.dispose();
      });

      console.log(
        `[${name}] loaded (usage=${String(resolved.usageEnabled)}, memory=${String(resolved.memoryEnabled)}, pets=${String(pets.enabled)}, telegram=${String(resolved.telegramEnabled)}, wechat=${String(resolved.wechatEnabled)})`,
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
