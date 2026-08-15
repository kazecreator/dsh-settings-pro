import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { ImBridge } from "./bridge.js";
import { ImStatus } from "./status.js";
import { TelegramChannel } from "./telegram.js";
import { WeChatChannel } from "./wechat.js";

const LOG = "[settings-pro:im]";

/**
 * Path of the UI-written runtime overrides (survive restarts, override the
 * patch layer). Kept under `storages/dsh-im` on purpose so existing IM state
 * (telegram offset, wechat session, peers) survives the merge into settings-pro.
 */
function runtimeConfigPath() {
  const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
  return join(home, "storages", "dsh-im", "config.json");
}

/** Read a JSON request body (bounded). */
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

/**
 * Runtime controller: owns the two channel instances, the shared status store,
 * and the UI-written overrides file. It can start/stop each channel live so the
 * web panel can connect Telegram (token) and start WeChat (scan) without a
 * profile restart.
 */
class ImController {
  #ctx;
  #bridge;
  #status;
  #patchConfig;
  #runtimeConfig;
  #configPath;
  #telegram = null;
  #wechat = null;
  #uiLang = "en";

  constructor(ctx, patchConfig) {
    this.#ctx = ctx;
    this.#patchConfig = patchConfig;
    this.#configPath = runtimeConfigPath();
    this.#runtimeConfig = this.#loadRuntimeConfig();
    this.#status = new ImStatus();
    this.#bridge = new ImBridge(ctx, { ...this.#patchConfig, ...this.#runtimeConfig });
  }

  get available() {
    return this.#bridge.available;
  }

  effectiveConfig() {
    return { ...this.#patchConfig, ...this.#runtimeConfig };
  }

  #loadRuntimeConfig() {
    try {
      const parsed = JSON.parse(readFileSync(this.#configPath, "utf8"));
      return parsed != null && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  #saveRuntimeConfig() {
    try {
      mkdirSync(dirname(this.#configPath), { recursive: true });
      writeFileSync(this.#configPath, JSON.stringify(this.#runtimeConfig, null, 2) + "\n");
    } catch (error) {
      console.error(`${LOG} failed to save runtime config:`, error);
    }
  }

  #readLang(req) {
    try {
      const lang = new URL(req.url ?? "", "http://localhost").searchParams.get("lang");
      if (lang === "zh" || lang === "en") this.#uiLang = lang;
    } catch {
      // Ignore malformed URLs.
    }
  }

  #getUiLang = () => this.#uiLang;

  start() {
    this.#status.setTelegram({ enabled: this.effectiveConfig().telegramEnabled === true });
    this.#status.setWechat({ enabled: this.effectiveConfig().wechatEnabled === true });
    this.#startTelegram();
    this.#startWechat();
    this.#registerRoutes();
  }

  #startTelegram() {
    if (this.#telegram != null) this.#telegram.stop();
    const config = this.effectiveConfig();
    this.#telegram = new TelegramChannel(config, this.#bridge, this.#status, this.#getUiLang);
    this.#telegram.start();
  }

  #startWechat() {
    if (this.#wechat != null) {
      this.#wechat.stop();
    }
    const config = this.effectiveConfig();
    this.#wechat = new WeChatChannel(config, this.#bridge, this.#status, this.#getUiLang);
    this.#wechat.start().catch((error) => {
      console.error(`${LOG} wechat start failed:`, error);
      this.#status.setWechat({ error: error?.message ?? String(error) });
    });
  }

  setTelegramToken(token) {
    const value = (token ?? "").trim();
    this.#runtimeConfig.telegramEnabled = value !== "";
    if (value !== "") this.#runtimeConfig.telegramToken = value;
    else delete this.#runtimeConfig.telegramToken;
    this.#saveRuntimeConfig();
    this.#startTelegram();
  }

  startWeChat() {
    this.#runtimeConfig.wechatEnabled = true;
    this.#saveRuntimeConfig();
    this.#startWechat();
  }

  logoutWeChat() {
    this.#runtimeConfig.wechatEnabled = false;
    this.#saveRuntimeConfig();
    if (this.#wechat != null) this.#wechat.logout();
    this.#wechat = null;
  }

  statusPayload() {
    const config = this.effectiveConfig();
    const snapshot = this.#status.toJSON();
    return {
      ...snapshot,
      telegram: {
        ...snapshot.telegram,
        tokenConfigured: (config.telegramBotToken ?? "").trim() !== "",
        enabled: config.telegramEnabled === true,
      },
      wechat: {
        ...snapshot.wechat,
        enabled: config.wechatEnabled === true,
      },
    };
  }

  sendJson(res, payload, statusCode = 200) {
    res.writeHead(statusCode, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-cache",
    });
    res.end(JSON.stringify(payload));
  }

  #registerRoutes() {
    const webServer = this.#ctx.get("webServer");
    if (webServer == null || typeof webServer.register !== "function") return;

    webServer.register({
      kind: "exact",
      path: "/im/status",
      handler: (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        this.#readLang(req);
        this.sendJson(res, this.statusPayload());
      },
    });

    webServer.register({
      kind: "exact",
      path: "/im/telegram",
      handler: async (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        try {
          this.#readLang(req);
          const body = await readJson(req);
          this.setTelegramToken(body.token ?? "");
          this.sendJson(res, this.statusPayload());
        } catch (error) {
          this.sendJson(res, { error: error?.message ?? String(error) }, 400);
        }
      },
    });

    webServer.register({
      kind: "exact",
      path: "/im/wechat/start",
      handler: (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        this.#readLang(req);
        this.startWeChat();
        this.sendJson(res, this.statusPayload());
      },
    });

    webServer.register({
      kind: "exact",
      path: "/im/wechat/logout",
      handler: (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        this.#readLang(req);
        this.logoutWeChat();
        this.sendJson(res, this.statusPayload());
      },
    });

    console.log(`${LOG} IM status/config endpoints registered`);
  }

  dispose() {
    if (this.#telegram != null) this.#telegram.stop();
    if (this.#wechat != null) this.#wechat.stop();
  }
}

/**
 * Mount the IM bridge. Caller (index.js) has already awaited the loader, so
 * `ctx.agents` has its loop factory. Returns the live controller or `null`.
 */
export function startIm(ctx, config) {
  const controller = new ImController(ctx, config ?? {});
  if (!controller.available) {
    console.warn(`${LOG} agent services unavailable in this profile; bridge disabled`);
    return null;
  }
  controller.start();
  ctx.on("dispose", () => controller.dispose());
  return controller;
}
