import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { markdownToPlainText, markdownToTelegramHtml, splitPlainText } from "./markdown.js";
import { t } from "./i18n.js";
import { takeRestartNotice } from "./restart-notice.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
/** Telegram `sendMessage` text limit (UTF-16 code units). */
const TELEGRAM_TEXT_LIMIT = 4096;
/** How many times to retry a `sendMessage`/`editMessageText` on HTTP 429. */
const TELEGRAM_MAX_RETRIES = 2;
/** Base backoff for a 429 without an explicit `retry_after` (ms). */
const TELEGRAM_RETRY_BASE_DELAY_MS = 1000;
/** Ceiling for any 429 retry delay, so a huge `retry_after` cannot hang a turn (ms). */
const TELEGRAM_MAX_RETRY_DELAY_MS = 15000;
/** Gap between the follow-up messages of a split long reply, to avoid a 429 burst (ms). */
const TELEGRAM_BULK_SEND_GAP_MS = 300;
/** Base backoff between `getUpdates` poll retries after a transient error (ms). */
const TELEGRAM_POLL_BACKOFF_BASE_MS = 2000;
/** Longer base backoff when a competing `getUpdates` is detected (HTTP 409) (ms). */
const TELEGRAM_POLL_CONFLICT_BACKOFF_BASE_MS = 5000;
/** Ceiling for any poll-retry backoff, so a persistent failure never spins hot (ms). */
const TELEGRAM_POLL_BACKOFF_MAX_MS = 60000;

/** Persisted `getUpdates` offset, so a restart does not re-deliver old updates. */
function offsetPath() {
  const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
  return join(home, "storages", "dsh-im", "telegram-offset.json");
}

function loadOffset() {
  try {
    const n = Number(JSON.parse(readFileSync(offsetPath(), "utf8"))?.offset);
    return Number.isInteger(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function saveOffset(offset) {
  try {
    mkdirSync(dirname(offsetPath()), { recursive: true });
    writeFileSync(offsetPath(), JSON.stringify({ offset }) + "\n");
  } catch (error) {
    console.error("[dsh-im] failed to save telegram offset:", error?.message ?? error);
  }
}

/**
 * Telegram Bot API channel via long polling (`getUpdates` + `sendMessage`).
 * Uses Node's global `fetch` (no heavy dependency); the DSH web seam only
 * supports GET so this channel owns its HTTP calls.
 */
export class TelegramChannel {
  #config;
  #bridge;
  #status;
  #getUiLang;
  #abort = new AbortController();
  #offset;
  #pollFailures = 0;

  constructor(config, bridge, status, getUiLang) {
    this.#config = config;
    this.#bridge = bridge;
    this.#status = status;
    this.#getUiLang = getUiLang;
    this.#offset = loadOffset();
  }

  get token() {
    return (this.#config.telegramBotToken ?? "").trim();
  }

  get enabled() {
    return this.#config.telegramEnabled === true && this.token !== "";
  }

  #api(method) {
    const base = (this.#config.telegramApiBase ?? "https://api.telegram.org").replace(/\/+$/, "");
    return `${base}/bot${this.token}/${method}`;
  }

  async #call(method, body, signal) {
    const url = this.#api(method);
    let attempt = 0;
    for (;;) {
      if (signal?.aborted || this.#abort.signal.aborted) {
        throw new Error(`telegram ${method} aborted`);
      }
      const res = await fetch(url, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
        signal,
      });
      let data;
      try {
        data = await res.json();
      } catch {
        data = void 0;
      }
      // Retry on rate limiting, honoring Telegram's `retry_after` when present.
      if (res.status === 429 && attempt < TELEGRAM_MAX_RETRIES) {
        const retryAfter = data?.parameters?.retry_after;
        const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, TELEGRAM_MAX_RETRY_DELAY_MS)
          : TELEGRAM_RETRY_BASE_DELAY_MS * 2 ** attempt;
        attempt += 1;
        console.warn(`[dsh-im] telegram ${method} rate-limited (429); retrying in ${delayMs}ms (attempt ${attempt}/${TELEGRAM_MAX_RETRIES})`);
        await this.#sleep(delayMs);
        continue;
      }
      if (!res.ok || data?.ok !== true) {
        const detail = data?.description ?? (await res.text().catch(() => ""));
        const error = new Error(`telegram ${method} failed (HTTP ${res.status}): ${detail}`);
        error.status = res.status;
        throw error;
      }
      return data.result;
    }
  }

  start() {
    if (!this.enabled) return;
    console.log("[dsh-im] telegram channel starting (long polling)");
    this.#status?.setTelegram({ enabled: true, error: null });
    this.#getMe().then((bot) => {
      this.#status?.setTelegram({ connected: true, bot });
    }).catch((error) => {
      this.#status?.setTelegram({ connected: false, error: error?.message ?? String(error) });
    });
    this.#poll().catch((error) => {
      if (error?.name === "AbortError") return;
      console.error("[dsh-im] telegram poll stopped:", error);
      this.#status?.setTelegram({ connected: false, error: error?.message ?? String(error) });
    });
    this.#sendRestartNotice().catch((error) => {
      console.error("[dsh-im] failed to send telegram restart notice:", error?.message ?? error);
    });
  }

  /** Deliver a pending "restart complete" notice to the peer who asked for it. */
  async #sendRestartNotice() {
    const notice = takeRestartNotice("telegram");
    if (notice == null) return;
    const route = notice.route ?? {};
    await this.#call("sendMessage", {
      chat_id: route.chatId ?? notice.peerId,
      text: t(notice.lang ?? "en", "restart.done"),
    });
  }

  async #getMe() {
    const me = await this.#call("getMe", {});
    return me?.username ?? null;
  }

  async #poll() {
    while (!this.#abort.signal.aborted) {
      try {
        const updates = await this.#call("getUpdates", {
          offset: this.#offset,
          timeout: Math.max(1, this.#config.telegramPollingTimeout ?? 30),
          allowed_updates: ["message"],
        }, this.#abort.signal);
        this.#pollFailures = 0;
        this.#status?.setTelegram({ connected: true, error: null });
        for (const update of updates) {
          this.#offset = Math.max(this.#offset, update.update_id + 1);
          const message = update.message;
          if (message == null || message.chat == null) continue;
          // Photo messages carry no `.text` (only `caption`); keep them so the
          // vision bridge can describe the image. Other non-text updates (e.g.
          // stickers) are still dropped.
          const hasPhoto = Array.isArray(message.photo) && message.photo.length > 0;
          if (typeof message.text !== "string" && !hasPhoto) continue;
          this.#handleMessage(message);
        }
        if (updates.length > 0) saveOffset(this.#offset);
      } catch (error) {
        if (this.#abort.signal.aborted || error?.name === "AbortError") break;
        this.#pollFailures += 1;
        const conflict = this.#isGetUpdatesConflict(error);
        const delay = this.#pollBackoffDelay(conflict);
        if (conflict) {
          console.warn(`[dsh-im] telegram getUpdates conflict (another poller is active); backing off ${delay}ms before retry ${this.#pollFailures}`);
        } else {
          console.error(`[dsh-im] telegram poll error (retrying in ${delay}ms):`, error?.message ?? error);
        }
        this.#status?.setTelegram({ connected: false, error: error?.message ?? String(error) });
        await this.#sleep(delay);
      }
    }
  }

  /** A 409 "terminated by other getUpdates" means another poller owns the bot. */
  #isGetUpdatesConflict(error) {
    return error?.status === 409 && /terminated by other getUpdates/i.test(error?.message ?? "");
  }

  /**
   * Exponential backoff plus random jitter. Jitter matters for the 409 conflict:
   * two pollers retrying on a fixed interval keep terminating each other's
   * `getUpdates` forever; staggered waits let one win while the other settles
   * into a slow retry until the winner stops. Capped so a dead peer never spins.
   */
  #pollBackoffDelay(conflict) {
    const exponent = Math.min(this.#pollFailures - 1, 5);
    const base = conflict ? TELEGRAM_POLL_CONFLICT_BACKOFF_BASE_MS : TELEGRAM_POLL_BACKOFF_BASE_MS;
    const delay = Math.min(base * 2 ** exponent, TELEGRAM_POLL_BACKOFF_MAX_MS);
    return delay + Math.floor(Math.random() * Math.max(500, Math.floor(delay / 2)));
  }

  #sleep(ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.#abort.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
  }

  #handleMessage(message) {
    const chatId = String(message.chat.id);
    const fromId = String(message.from?.id ?? "");
    const allowed = this.#config.telegramAllowedUserIds ?? [];
    if (allowed.length > 0 && !allowed.includes(fromId) && !allowed.includes(chatId)) {
      console.log(`[dsh-im] telegram: dropped message from ${fromId} (not in allowlist)`);
      return;
    }

    const photo = Array.isArray(message.photo) && message.photo.length > 0 ? message.photo : null;
    const text = photo != null ? (message.caption ?? "") : (message.text ?? "");
    if (photo == null && text.trim() === "") return;
    console.log(`[dsh-im] telegram: message from ${fromId}: ${photo != null ? "[photo]" : ""} ${text.slice(0, 120)}`);

    // Show "typing…" while the agent works. Telegram clears it automatically
    // when the reply lands, and the action expires after ~5s, so keep it alive.
    const sendTyping = () => this.#call("sendChatAction", { chat_id: message.chat.id, action: "typing" }).catch(() => {});
    sendTyping();
    const typingTimer = setInterval(sendTyping, 4000);

    const streamer = new TelegramReplyStreamer(message.chat.id, (method, body) => this.#call(method, body), this.#getUiLang?.() ?? "en");

    const run = async () => {
      let image = null;
      if (photo != null) {
        try {
          image = await this.#downloadPhoto(photo);
        } catch (error) {
          await this.#call("sendMessage", {
            chat_id: message.chat.id,
            text: `⚠️ 图片下载失败：${error?.message ?? String(error)}`,
          }).catch(() => {});
          return "";
        }
      }
      return this.#bridge.handleInbound({
        provider: "telegram",
        peerId: chatId,
        text,
        sink: streamer,
        route: { chatId: message.chat.id },
        image,
      });
    };

    run().then((replyText) => {
      console.log(`[dsh-im] telegram: replied to ${chatId}: ${replyText.slice(0, 120)}`);
    }).catch((error) => {
      console.error("[dsh-im] telegram reply failed:", error);
      return this.#call("sendMessage", {
        chat_id: message.chat.id,
        text: `⚠️ ${error?.message ?? String(error)}`,
      }).catch(() => {});
    }).finally(() => {
      clearInterval(typingTimer);
    });
  }

  /** Download the largest photo variant as image bytes + media type. */
  async #downloadPhoto(photo) {
    const largest = photo[photo.length - 1];
    const file = await this.#call("getFile", { file_id: largest?.file_id });
    const filePath = file?.file_path;
    if (!filePath) throw new Error("telegram getFile 未返回 file_path");
    const base = (this.#config.telegramApiBase ?? "https://api.telegram.org").replace(/\/+$/, "");
    const url = `${base}/file/bot${this.token}/${filePath}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`telegram 图片下载 HTTP ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    const ext = (filePath.split(".").pop() ?? "").toLowerCase();
    const mediaType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";
    return { data, mediaType };
  }

  stop() {
    this.#abort.abort();
  }
}

/**
 * Implements the bridge's streaming sink for Telegram: streams assistant text
 * into one message edited in place, and mirrors tool activity into a separate
 * status line. Falls back to plain text whenever HTML rendering/editing fails.
 */
class TelegramReplyStreamer {
  #chatId;
  #call;
  #lang;
  #buffer = "";
  #messageId = null;
  #statusId = null;
  #lastLabel = "";
  #editTimer = null;
  #opening = null;
  #activityChain = Promise.resolve();
  #editChain = Promise.resolve();

  constructor(chatId, call, lang) {
    this.#chatId = chatId;
    this.#call = call;
    this.#lang = lang ?? "en";
  }

  #render(md) {
    return markdownToTelegramHtml(md);
  }

  #sleep(ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      timer.unref?.();
    });
  }

  async #send(md) {
    const html = this.#render(md);
    if (html !== "") {
      if (html.length > TELEGRAM_TEXT_LIMIT) return null; // too long for one message
      try {
        const sent = await this.#call("sendMessage", { chat_id: this.#chatId, text: html, parse_mode: "HTML" });
        return sent?.message_id;
      } catch (error) {
        console.warn("[dsh-im] telegram HTML send failed, falling back to plain text:", error?.message ?? error);
      }
    }
    const plain = markdownToPlainText(md);
    if (plain.length > TELEGRAM_TEXT_LIMIT) return null;
    try {
      const sent = await this.#call("sendMessage", { chat_id: this.#chatId, text: plain });
      return sent?.message_id;
    } catch (error) {
      console.warn("[dsh-im] telegram plain sendMessage failed:", error?.message ?? error);
      return null;
    }
  }

  async #edit(messageId, md) {
    if (messageId == null) return;
    const html = this.#render(md);
    const body = html !== ""
      ? { chat_id: this.#chatId, message_id: messageId, text: html, parse_mode: "HTML" }
      : { chat_id: this.#chatId, message_id: messageId, text: markdownToPlainText(md) };
    try {
      await this.#call("editMessageText", body);
    } catch (error) {
      // "message is not modified" is benign (debounce re-sent identical text).
      if (/not modified/i.test(error?.message ?? "")) return;
      // HTML parse failure → retry as plain text.
      if (html !== "") {
        try {
          await this.#call("editMessageText", { chat_id: this.#chatId, message_id: messageId, text: markdownToPlainText(md) });
        } catch (fallbackError) {
          if (/not modified/i.test(fallbackError?.message ?? "")) return;
          console.warn("[dsh-im] telegram editMessageText (plain fallback) failed:", fallbackError?.message ?? fallbackError);
        }
      } else {
        console.warn("[dsh-im] telegram editMessageText failed:", error?.message ?? error);
      }
    }
  }

  /** Send one plain-text message (no HTML attempt); returns the message id or null. */
  async #sendPlain(text) {
    if (text === "" || text.length > TELEGRAM_TEXT_LIMIT) return null;
    try {
      const sent = await this.#call("sendMessage", { chat_id: this.#chatId, text });
      return sent?.message_id;
    } catch (error) {
      console.warn("[dsh-im] telegram plain sendMessage failed:", error?.message ?? error);
      return null;
    }
  }

  /** Edit one message to plain text (no HTML parse); logs and swallows failures. */
  async #editPlain(messageId, text) {
    if (messageId == null || text === "" || text.length > TELEGRAM_TEXT_LIMIT) return;
    try {
      await this.#call("editMessageText", { chat_id: this.#chatId, message_id: messageId, text });
    } catch (error) {
      if (/not modified/i.test(error?.message ?? "")) return;
      console.warn("[dsh-im] telegram plain editMessageText failed:", error?.message ?? error);
    }
  }

  #scheduleEdit() {
    if (this.#editTimer != null) return;
    this.#editTimer = setTimeout(() => this.#flushEdit(), 150);
    this.#editTimer.unref?.();
  }

  #flushEdit() {
    this.#editTimer = null;
    const md = this.#buffer;
    const overLimit = this.#render(md).length > TELEGRAM_TEXT_LIMIT || markdownToPlainText(md).length > TELEGRAM_TEXT_LIMIT;
    if (overLimit) return; // too long to stream in place; onFinal will split it
    // Serialize streaming edits so a slow earlier edit can never land after a
    // later, fuller one (or after the authoritative final edit in onFinal).
    this.#editChain = this.#editChain.then(async () => {
      if (this.#messageId != null) {
        await this.#edit(this.#messageId, md).catch(() => {});
        return;
      }
      // First render: send once; concurrent flushes await the same opening so a
      // burst of early chunks cannot spawn duplicate messages.
      if (this.#opening == null) {
        this.#opening = (async () => {
          this.#messageId = await this.#send(md);
        })().finally(() => { this.#opening = null; });
      }
      await this.#opening.catch(() => {});
    });
    return this.#editChain;
  }

  onChunk(delta) {
    this.#buffer += delta;
    this.#scheduleEdit();
  }

  onActivity(label) {
    if (label === this.#lastLabel) return this.#activityChain;
    this.#lastLabel = label;
    // Serialize status writes so a burst of distinct tool calls cannot spawn
    // duplicate status messages or interleave edits.
    this.#activityChain = this.#activityChain.then(async () => {
      if (this.#statusId == null) {
        const sent = await this.#call("sendMessage", { chat_id: this.#chatId, text: `⏳ ${label}…` });
        this.#statusId = sent?.message_id;
      } else {
        await this.#call("editMessageText", { chat_id: this.#chatId, message_id: this.#statusId, text: `⏳ ${label}…` }).catch((error) => {
          console.warn("[dsh-im] telegram failed to update activity status:", error?.message ?? error);
        });
      }
    }).catch((error) => {
      console.warn("[dsh-im] telegram activity status send failed:", error?.message ?? error);
    });
    return this.#activityChain;
  }

  /** Send a follow-up question as its own message (rendered via HTML when possible). */
  async onQuestion(text) {
    // Flush any streamed partial first so the question lands as a separate
    // message rather than interleaving with the reply edit.
    if (this.#editTimer != null) {
      clearTimeout(this.#editTimer);
      this.#editTimer = null;
    }
    if (this.#buffer !== "") {
      await this.#flushEdit().catch(() => {});
    }
    await this.#send(text).catch(() => {});
  }

  async onFinal(text) {
    // Flush any pending debounced edit and in-flight streaming edit, then settle
    // on the authoritative final text so a slow partial edit can never overwrite it.
    if (this.#editTimer != null) {
      clearTimeout(this.#editTimer);
      this.#editTimer = null;
    }
    await this.#editChain.catch(() => {});
    if (this.#opening != null) await this.#opening.catch(() => {});

    const plain = markdownToPlainText(text);
    const overLimit = this.#render(text).length > TELEGRAM_TEXT_LIMIT || plain.length > TELEGRAM_TEXT_LIMIT;
    if (overLimit) {
      // Long reply: keep the FIRST chunk in the already-streamed message (edit
      // it in place) and send the rest as follow-ups. Editing instead of
      // deleting means the body's first part can never vanish, even if a later
      // follow-up send fails.
      const chunks = splitPlainText(plain, TELEGRAM_TEXT_LIMIT);
      const [head, ...tail] = chunks;
      if (this.#messageId != null) {
        if (head !== undefined && head !== "") await this.#editPlain(this.#messageId, head);
      } else if (head !== undefined && head !== "") {
        this.#messageId = await this.#sendPlain(head);
      }
      for (const chunk of tail) {
        if (chunk === "") continue;
        await this.#sendPlain(chunk);
        // Gentle spacing so a burst of follow-ups does not trip Telegram's 429.
        await this.#sleep(TELEGRAM_BULK_SEND_GAP_MS);
      }
    } else if (this.#messageId != null) {
      await this.#edit(this.#messageId, text);
    } else {
      await this.#send(text);
    }
    // Settle the status line only after any in-flight activity update lands,
    // then delete the transient progress line (e.g. "⏳ Thinking…") so no
    // permanent "✅ Done" sits above every reply.
    await this.#activityChain.catch(() => {});
    if (this.#statusId != null) {
      await this.#call("deleteMessage", { chat_id: this.#chatId, message_id: this.#statusId }).catch((error) => {
        console.warn("[dsh-im] telegram failed to delete status message:", error?.message ?? error);
      });
      this.#statusId = null;
    }
  }
}
