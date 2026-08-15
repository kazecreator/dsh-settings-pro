import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { installModelSelection } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import { parseCommand } from "./commands.js";
import { parseAnswer, renderQuestion } from "./questions.js";
import { detectLanguage, t } from "./i18n.js";
import { saveRestartNotice } from "./restart-notice.js";

const DEFAULT_REPLY_TIMEOUT_MS = 120000;
const CANCEL_SETTLE_TIMEOUT_MS = 5000;

/**
 * Per-agent system-prompt section: the model is answering through a chat
 * bridge (Telegram/WeChat), so it is nudged toward short plain-text replies
 * that survive the channel's 4096-char message limit. Registered through the
 * agent-scoped prompt-assembly waterfall (the same seam `installModelSelection`
 * uses), so it never leaks into web-GUI sessions and unwinds with the agent.
 */
const IM_FORMATTING_PROMPT = [
  "You are answering through an instant-messaging bridge (Telegram / WeChat), not the full web UI. Adapt replies to a chat thread:",
  "- Lead with the answer or the decision, not a narrated process.",
  "- Keep replies concise; prefer plain text over heavy Markdown.",
  "- Avoid GFM tables and long fenced code blocks; use short inline code instead.",
  "- Keep the final message well under ~3000 characters; the transport truncates near 4096.",
].join("\n");

/** Persisted peer → session mapping, so a restart resumes each IM peer's agent session instead of losing its history. */
function peersPath() {
  const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
  return join(home, "storages", "dsh-im", "peers.json");
}

function loadPeers() {
  try {
    const parsed = JSON.parse(readFileSync(peersPath(), "utf8"));
    return parsed != null && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function savePeers(peers) {
  try {
    mkdirSync(dirname(peersPath()), { recursive: true });
    writeFileSync(peersPath(), JSON.stringify(peers, null, 2) + "\n");
  } catch (error) {
    console.error("[dsh-im] failed to save peer sessions:", error?.message ?? error);
  }
}

/** Remove DSH's `<invoke>`/`<function_calls>` text fallback, which some models emit when tools are unavailable. */
function stripFakeToolCallMarkup(text) {
  if (!/<invoke\b/i.test(text) && !/<function_calls?\b/i.test(text)) return text;
  let cleaned = text.replace(/<\s*invoke\b[^>]*\/\s*>/gi, "");
  cleaned = cleaned.replace(/<\s*invoke\b[\s\S]*?<\/\s*invoke\s*>/gi, "");
  cleaned = cleaned.replace(/<\s*function_calls?\b[^>]*\/\s*>/gi, "");
  cleaned = cleaned.replace(/<\s*function_calls?\b[\s\S]*?<\/\s*function_calls?\s*>/gi, "");
  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

/** Call an optional sink method, swallowing sync throws and logging async rejections. */
function emit(sink, method, arg) {
  const fn = sink?.[method];
  if (typeof fn !== "function") return;
  try {
    const result = fn.call(sink, arg);
    if (result != null && typeof result.then === "function") {
      result.catch((error) => console.error(`[dsh-im] sink.${method} failed:`, error?.message ?? error));
    }
  } catch (error) {
    console.error(`[dsh-im] sink.${method} failed:`, error?.message ?? error);
  }
}

/**
 * Idle watchdog: fires `onTimeout` after `timeoutMs` of *inactivity*. Every
 * `poke()` restarts the deadline, so a turn that keeps producing session events
 * (steps, tool calls, stream chunks) never trips it — only a genuinely silent,
 * stuck period (e.g. a hanging `ask_user_question`) does. `timeoutMs <= 0`
 * disables the watchdog entirely.
 */
function makeWatchdog(timeoutMs, onTimeout) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { poke() {}, disarm() {}, pause() {}, resume() {} };
  }
  let timer = null;
  let disarmed = false;
  let paused = false;
  const clear = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const arm = () => {
    clear();
    timer = setTimeout(() => {
      timer = null;
      if (!disarmed && !paused) onTimeout();
    }, timeoutMs);
    timer.unref?.();
  };
  arm();
  return {
    poke() {
      if (!disarmed && !paused) arm();
    },
    pause() {
      paused = true;
      clear();
    },
    resume() {
      paused = false;
      arm();
    },
    disarm() {
      disarmed = true;
      clear();
    },
  };
}

/**
 * Routes inbound IM messages into per-peer DSH agent sessions and captures the
 * assistant reply to hand back to the originating chat.
 *
 * One live Agent is created per `provider:peerId` key and reused across
 * messages. The peer's session id is persisted (`peers.json`) and the session
 * is resumed on boot, so conversation history survives restarts instead of
 * being lost. Turns are serialized per peer with a promise chain: an agent
 * drives one turn at a time and a racing second message must not interleave its
 * `whenIdle()` wait with the first.
 *
 * Each turn streams into a channel-supplied `sink` object whose methods are
 * all optional:
 *   - `onChunk(delta)`     — visible assistant text delta (streaming).
 *   - `onActivity(label)`  — what the agent is doing now (tool call / thinking).
 *   - `onFinal(text)`      — the authoritative final reply (or fallback text).
 */
export class ImBridge {
  #ctx;
  #agents;
  #defaultModel;
  #llm;
  #sessions;
  #workspaceRegistry;
  #agentPresets;
  #agentPresetId;
  #replyTimeoutMs;
  #commandsEnabled;
  #restartEnabled;
  #agentsByPeer = new Map();
  #queuesByPeer = new Map();
  #handlersBySession = new Map();
  #modelOverridesByPeer = new Map();
  #holdersByPeer = new Map();
  #peerBySessionId = new Map();
  #turnsByPeer = new Map();
  #questionWaitersByPeer = new Map();
  #langByPeer = new Map();
  #sessionIdByPeer = new Map();
  #questionTimeoutMs;
  #upstreamQuestionProvider;
  #vision;

  constructor(ctx, config = {}, vision = null) {
    this.#ctx = ctx;
    this.#vision = vision;
    this.#agents = ctx.get("agents");
    this.#defaultModel = ctx.get("agentDefaultModel");
    this.#llm = ctx.get("llm");
    this.#sessions = ctx.get("sessions");
    this.#workspaceRegistry = ctx.get("workspaceRegistry");
    this.#agentPresets = ctx.get("agentPresets");
    this.#agentPresetId = typeof config.agentPreset === "string" && config.agentPreset.trim() !== ""
      ? config.agentPreset.trim()
      : void 0;
    this.#replyTimeoutMs = Number.isFinite(config.agentReplyTimeoutMs) && config.agentReplyTimeoutMs >= 0
      ? config.agentReplyTimeoutMs
      : DEFAULT_REPLY_TIMEOUT_MS;
    this.#commandsEnabled = config.commandsEnabled !== false;
    this.#restartEnabled = config.restartEnabled !== false;
    this.#questionTimeoutMs = Number.isFinite(config.questionTimeoutMs) && config.questionTimeoutMs > 0
      ? config.questionTimeoutMs
      : 0;
    this.#sessionIdByPeer = new Map(Object.entries(loadPeers()));

    // One process-wide subscription to the append feed; each turn registers a
    // per-session handler keyed by session id so live events drive streaming,
    // progress, and the idle watchdog.
    if (this.#ctx != null && typeof this.#ctx.on === "function") {
      this.#ctx.on("session/event", (session, event) => {
        const handler = this.#handlersBySession.get(session.id);
        if (handler != null) handler(event);
      });
    }

    // Relay `ask_user_question` follow-ups to the IM chat instead of the Web
    // provider (which the IM user cannot see or answer).
    this.#installQuestionProvider();
  }

  /** The bridge can only drive agents when the core agent services are present. */
  get available() {
    return this.#agents != null && this.#defaultModel != null;
  }

  #peerKey(provider, peerId) {
    return `${provider}:${peerId}`;
  }

  /** Resolve the IM peer that owns a live agent, or `undefined` for non-IM agents. */
  #peerForAgent(agent) {
    if (agent == null) return void 0;
    return this.#peerBySessionId.get(agent.id ?? agent.session?.id);
  }

  /**
   * Resolve the conversation language for a peer. A message containing CJK
   * switches the peer to Chinese; otherwise the peer keeps its remembered
   * language (so a slash command or a numeric answer doesn't flip it back).
   */
  #resolveLang(peerKey, text) {
    const detected = detectLanguage(text);
    if (detected === "zh" || !this.#langByPeer.has(peerKey)) {
      this.#langByPeer.set(peerKey, detected);
    }
    return this.#langByPeer.get(peerKey) ?? "en";
  }

  /** Localized activity label for a tool; unknown tools fall back to the raw name. */
  #activityLabel(lang, name) {
    const key = `activity.${name}`;
    const label = t(lang, key);
    return label === key ? name : label;
  }

  /**
   * Install the follow-up-question routing provider on `ctx.userQuestions`.
   *
   * The seam allows exactly one provider per context, and in Web profiles
   * `dsh-host-apiproxy` registers the browser provider first (bundle loads
   * before this patch's insert). Rather than throw `DUPLICATE_PROVIDER`, we wrap
   * that provider: IM-owned agents are relayed to the chat, everything else
   * delegates to the Web provider unchanged.
   */
  #installQuestionProvider() {
    const userQuestions = this.#ctx.get("userQuestions");
    if (userQuestions == null) {
      console.warn("[dsh-im] userQuestions service unavailable; follow-up questions will not be relayed");
      return;
    }
    const bridge = this;
    const router = {
      ask(request) {
        const peerKey = bridge.#peerForAgent(request?.agent);
        if (peerKey != null) return bridge.#askInIm(peerKey, request);
        const upstream = bridge.#upstreamQuestionProvider;
        if (upstream != null) return upstream.ask(request);
        return Promise.reject(new Error("no user-questions provider is available"));
      },
    };
    const upstream = userQuestions.provider;
    this.#upstreamQuestionProvider = upstream;
    if (upstream == null) {
      userQuestions.registerProvider(router);
    } else {
      userQuestions.provider = router;
    }
  }

  /** Relay one `ask_user_question` request to the IM chat, one question at a time. */
  async #askInIm(peerKey, request) {
    const turn = this.#turnsByPeer.get(peerKey);
    // A follow-up question is a legitimate wait for the human: hold the idle
    // watchdog so it does not cancel the turn while the user is answering.
    turn?.watchdog?.pause();
    try {
      const answers = [];
      for (const question of request.questions ?? []) {
        await this.#sendQuestion(turn, renderQuestion(question, turn?.lang));
        const answerText = await this.#waitForAnswer(peerKey, request.signal);
        answers.push(parseAnswer(answerText, question));
      }
      return { answers };
    } finally {
      turn?.watchdog?.resume();
    }
  }

  /** Send a question through the active turn's sink (best-effort, awaited). */
  async #sendQuestion(turn, text) {
    const sink = turn?.sink;
    const onQuestion = sink?.onQuestion;
    if (typeof onQuestion === "function") {
      try {
        await onQuestion.call(sink, text);
      } catch (error) {
        console.error("[dsh-im] failed to send question:", error?.message ?? error);
      }
      return;
    }
    // Fallback for a sink that only knows how to stream assistant text.
    if (typeof sink?.onChunk === "function") {
      sink.onChunk(`\n\n${text}\n\n`);
    }
  }

  /** Wait for the peer's next message (the answer), honoring abort + timeout. */
  #waitForAnswer(peerKey, signal) {
    if (signal?.aborted) {
      return Promise.reject(new Error("ask_user_question was aborted before the user answered"));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;
      const onAbort = () => finish(reject, new Error("ask_user_question was aborted before the user answered"));
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        this.#questionWaitersByPeer.delete(peerKey);
        if (timer != null) clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        fn(value);
      };
      if (this.#questionTimeoutMs > 0) {
        timer = setTimeout(() => finish(reject, new Error(t(this.#langByPeer.get(peerKey) ?? "en", "question.timeout"))), this.#questionTimeoutMs);
        timer.unref?.();
      }
      signal?.addEventListener("abort", onAbort, { once: true });
      this.#questionWaitersByPeer.set(peerKey, {
        resolve: (value) => finish(resolve, value),
        reject: (error) => finish(reject, error),
      });
    });
  }

  #acquireAgent(peerKey) {
    const cached = this.#agentsByPeer.get(peerKey);
    if (cached) return cached;
    const creating = this.#createAgent(peerKey);
    this.#agentsByPeer.set(peerKey, creating);
    creating.catch(() => this.#agentsByPeer.delete(peerKey));
    return creating;
  }

  /**
   * One peer's mutable model-selection holder, mirroring the harness's own
   * per-session selection: a `current` getter/setter that `installModelSelection`
   * snapshots on each prompt assembly. When the peer has no explicit override,
   * `current` reads the live Agent default so the chat follows default changes.
   */
  #makeSelectionHolder() {
    const defaultModel = this.#defaultModel;
    let picked;
    return {
      get current() {
        if (picked !== undefined) return picked;
        return defaultModel?.currentSelection();
      },
      set current(next) {
        picked = next;
      },
      clear() {
        picked = undefined;
      },
      assembled: undefined,
    };
  }

  /** Dedicated workspace directory for IM sessions, so they group under one named workspace. */
  #imWorkspaceDir() {
    const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
    return join(home, "storages", "dsh-im", "im-workspace");
  }

  /** Create/reuse the "IM Bridge" workspace and attach a session to it (best-effort). */
  async #attachToImWorkspace(sessionId) {
    const registry = this.#workspaceRegistry;
    if (registry == null) return;
    const dir = this.#imWorkspaceDir();
    const existing = await registry.resolveByPath(dir).catch(() => undefined);
    const workspace = existing ?? await registry.create(dir, "IM Bridge");
    await workspace.attachSession(sessionId);
  }

  async #createAgent(peerKey) {
    const holder = this.#makeSelectionHolder();
    const override = this.#modelOverridesByPeer.get(peerKey);
    if (override !== undefined) holder.current = override;
    const selection = holder.current;
    const cwd = this.#imWorkspaceDir();
    try {
      mkdirSync(cwd, { recursive: true });
    } catch {
      // Workspace creation is best-effort; the session still works without it.
    }
    let presetId = this.#agentPresetId;
    if (this.#agentPresets?.resolveMountable != null) {
      const preset = await this.#agentPresets.resolveMountable(presetId);
      presetId = preset.id;
    }
    const agentOptions = {
      provider: selection.provider,
      model: selection.model,
    };
    const setup = async (agentCtx) => {
      installModelSelection(agentCtx, holder);
      // Agent-scoped formatting instructions for the chat bridge. A scoped
      // waterfall listener is the correct seam here: it only affects this
      // agent's prompt assembly (web sessions are untouched) and the effect
      // disposes with the agent, so it is safe to register without tracking
      // the disposer.
      agentCtx.on("system-prompt/assemble", async (_assembly, _context, next) => {
        const assembled = await next();
        return {
          ...assembled,
          sections: [...(assembled.sections ?? []), { name: "app:dsh-im", text: IM_FORMATTING_PROMPT }],
        };
      });
      // Web profiles keep model-facing tools inside agent presets. Join the
      // active/default preset so this IM agent gets the same coding tools as a
      // Web session instead of an empty global tool layer. On profiles without
      // a preset roster the tools remain global and this is a no-op.
      if (this.#agentPresets?.mount != null) {
        await this.#agentPresets.mount(agentCtx, presetId);
      }
    };

    // Resume the peer's persisted session when one exists, so a restart keeps
    // the conversation history instead of minting an orphaned fresh session.
    // Any resume failure (missing session, persistence error) falls back to a
    // fresh session and re-persists its id.
    const persistedSessionId = this.#sessionIdByPeer.get(peerKey);
    let handle;
    if (persistedSessionId !== undefined) {
      try {
        handle = await this.#agents.resume({
          resumeSessionId: persistedSessionId,
          agentOptions,
          setup,
        });
      } catch (error) {
        console.warn(`[dsh-im] resume failed for ${peerKey}, creating a fresh session:`, error?.message ?? error);
        this.#sessionIdByPeer.delete(peerKey);
      }
    }
    if (handle === undefined) {
      const sessionId = SessionId(`session-${randomUUID()}`);
      handle = await this.#agents.create({
        sessionId,
        meta: {
          cwd,
          ...presetId === void 0 ? {} : { agentPreset: presetId },
        },
        agentOptions,
        setup,
      });
      this.#sessionIdByPeer.set(peerKey, handle.agent.session.id);
      savePeers(Object.fromEntries(this.#sessionIdByPeer));
    }
    const { agent, dispose } = handle;
    await agent.whenIdle();
    this.#peerBySessionId.set(agent.session.id, peerKey);
    try {
      await this.#attachToImWorkspace(agent.session.id);
    } catch (error) {
      console.error("[dsh-im] failed to attach session to IM workspace:", error?.message ?? error);
    }
    this.#holdersByPeer.set(peerKey, holder);
    return { agent, dispose };
  }

  /** Classify one live session event into sink calls (streaming text + activity). */
  #routeEvent(event, sink, streamState, lang) {
    switch (event?.type) {
      case "assistant/chunk": {
        const chunk = event?.data?.chunk;
        if (chunk?.type === "text-delta" && typeof chunk.text === "string" && chunk.text !== "") {
          streamState.streamed = true;
          streamState.thinkingShown = false;
          emit(sink, "onChunk", chunk.text);
        } else if (chunk?.type === "reasoning-delta" && !streamState.thinkingShown) {
          streamState.thinkingShown = true;
          emit(sink, "onActivity", t(lang, "activity.thinking"));
        }
        break;
      }
      case "tool/call": {
        streamState.thinkingShown = false;
        emit(sink, "onActivity", this.#activityLabel(lang, event?.data?.name));
        break;
      }
      default:
        break;
    }
  }

  async #handleTurn(peerKey, agent, text, sink, lang) {
    const firstSeq = agent.session.seq;
    let timedOut = false;
    const streamState = { streamed: false, thinkingShown: false };

    // Post-cancel settle bound: resolves only after the watchdog cancels and the
    // turn still has not converged, so a tool ignoring its abort signal cannot
    // wedge this peer's message queue forever.
    let forceSettle = () => {};
    const settleBound = new Promise((resolve) => { forceSettle = resolve; });
    let settleTimer = null;

    const watchdog = makeWatchdog(this.#replyTimeoutMs, () => {
      timedOut = true;
      console.warn("[dsh-im] agent idle timeout; cancelling the active turn");
      try {
        agent.cancel({ kind: "hook", reason: "dsh-im idle timeout" });
      } catch (error) {
        console.error("[dsh-im] failed to cancel timed-out agent:", error?.message ?? error);
      }
      settleTimer = setTimeout(forceSettle, CANCEL_SETTLE_TIMEOUT_MS);
      settleTimer.unref?.();
    });

    const handler = (event) => {
      watchdog.poke();
      this.#routeEvent(event, sink, streamState, lang);
    };
    this.#handlersBySession.set(agent.session.id, handler);
    // Publish the active turn so the follow-up-question provider can pause the
    // watchdog and reach this peer's sink while the agent waits for the human.
    this.#turnsByPeer.set(peerKey, { sink, watchdog, lang });

    try {
      agent.followup(createUserMessage({
        content: [{ type: "text", text }],
        source: { kind: "user" },
      }));
      await Promise.race([agent.whenIdle(), settleBound]);
    } finally {
      this.#turnsByPeer.delete(peerKey);
      if (settleTimer != null) clearTimeout(settleTimer);
      watchdog.disarm();
      this.#handlersBySession.delete(agent.session.id);
    }

    if (this.#sessions != null) await this.#sessions.flush(agent.session).catch(() => {});
    const outcome = summarizeTurn(agent.session.events, firstSeq);
    let replyText = outcome.text;
    if (timedOut && replyText === "") replyText = t(lang, "timeout.fallback");
    if (replyText === "") replyText = fallbackForTurnReason(outcome.reason, lang);
    if (replyText !== "") emit(sink, "onFinal", replyText);
    return replyText;
  }

  /**
   * Handle one inbound message: serialize on the peer, feed the agent, stream
   * progress, and reply with the final assistant text.
   *
   * @param {{provider: string, peerId: string, text: string, sink?: object, reply?: (text: string) => Promise<unknown>}} input
   * @returns {Promise<string>} the assistant reply text.
   */
  handleInbound({ provider, peerId, text, sink, reply, route, image }) {
    const peerKey = this.#peerKey(provider, peerId);
    const resolvedSink = normalizeSink(sink, reply);
    const command = this.#commandsEnabled ? parseCommand(text) : null;
    const lang = this.#resolveLang(peerKey, text);

    // /stop interrupts the active turn immediately instead of queueing behind it.
    if (command?.name === "stop") {
      return this.#stopPeer(peerKey, lang).then(async (replyText) => {
        await this.#replyNow(resolvedSink, replyText);
        return replyText;
      });
    }

    // A follow-up question is awaiting this peer's next message. Answer it
    // directly rather than queueing a turn behind the (blocked) asking turn.
    const waiter = this.#questionWaitersByPeer.get(peerKey);
    if (waiter != null) {
      if (command != null) {
        // A slash command while a question is pending is an escape hatch: cancel
        // the question so the turn settles, then run the command below.
        waiter.reject(new Error(t(lang, "question.cancelledByCommand")));
      } else {
        waiter.resolve(text);
        return Promise.resolve(text);
      }
    }

    const previous = this.#queuesByPeer.get(peerKey) ?? Promise.resolve();
    const next = previous.then(async () => {
      if (command != null) {
        const replyText = await this.#runCommand(peerKey, command, lang);
        if (replyText !== "") await this.#replyNow(resolvedSink, replyText);
        if (command.name === "restart" && this.#restartEnabled) this.#restartProcess(provider, route ?? { peerId }, lang);
        return replyText;
      }
      // An attached image is described first (vision bridge), then the resulting
      // text is fed to the text model like any other message.
      let prompt = text;
      if (image != null) {
        prompt = await this.#describeImage(resolvedSink, text, image, lang);
        if (prompt == null) return ""; // describe failed; the error was already replied
      }
      const { agent } = await this.#acquireAgent(peerKey);
      return await this.#handleTurn(peerKey, agent, prompt, resolvedSink, lang);
    });
    // Keep the chain alive on failure so the peer queue never wedges.
    this.#queuesByPeer.set(peerKey, next.catch(() => {}));
    return next;
  }

  /** Describe an attached image via the vision service; returns the prompt text or null on failure. */
  async #describeImage(sink, text, image, lang) {
    if (this.#vision == null || this.#vision.enabled !== true) {
      await this.#replyNow(sink, t(lang, "vision.disabled"));
      return null;
    }
    if (typeof sink?.onActivity === "function") {
      try {
        sink.onActivity(t(lang, "activity.vision"));
      } catch {
        // ignore activity failures
      }
    }
    let description;
    try {
      description = await this.#vision.describe(image.data, {
        mediaType: image.mediaType ?? "image/png",
        question: text,
      });
    } catch (error) {
      await this.#replyNow(sink, t(lang, "vision.failed", { error: error?.message ?? String(error) }));
      return null;
    }
    const caption = String(text ?? "").trim();
    return `[图片内容]\n${description}\n\n[随图文字]\n${caption !== "" ? caption : t(lang, "vision.noCaption")}`;
  }

  // --- slash commands -------------------------------------------------------

  /** Dispatch one parsed command and return the plain-text reply. */
  async #runCommand(peerKey, { name, args }, lang) {
    switch (name) {
      case "help":
        return this.#helpText(lang);
      case "model":
        return await this.#modelCommand(peerKey, args, lang);
      case "effort":
        return await this.#effortCommand(peerKey, args, lang);
      case "new":
      case "reset":
        return await this.#resetCommand(peerKey, lang);
      case "restart":
        return this.#restartReply(lang);
      default:
        return t(lang, "cmd.unknown", { name });
    }
  }

  #helpText(lang) {
    return [
      t(lang, "help.title"),
      t(lang, "help.help"),
      t(lang, "help.model"),
      t(lang, "help.modelSwitch"),
      t(lang, "help.modelReset"),
      t(lang, "help.effort"),
      t(lang, "help.new"),
      t(lang, "help.stop"),
      t(lang, "help.restart"),
    ].join("\n");
  }

  #restartReply(lang) {
    if (!this.#restartEnabled) return t(lang, "restart.disabled");
    return t(lang, "restart.ack");
  }

  /** Send a command reply through the sink and await its delivery. */
  async #replyNow(sink, text) {
    const onFinal = sink?.onFinal;
    if (typeof onFinal !== "function") return;
    try {
      await onFinal.call(sink, text);
    } catch (error) {
      console.error("[dsh-im] failed to send command reply:", error?.message ?? error);
    }
  }

  /**
   * Relaunch this dsh process (self re-exec) and exit. The reply above has
   * already been delivered, so a channel reply lands before the restart. We
   * only exit after the child reports a successful `spawn`, so a failed launch
   * leaves the bridge running instead of silently going down.
   *
   * Before relaunching, persist a restart notice so the new process can send a
   * proactive "restart complete" message to the requesting peer once its
   * channel reconnects.
   */
  #restartProcess(provider, route, lang) {
    const args = process.argv.slice(1);
    console.log("[dsh-im] restarting dsh web process:", process.execPath, ...args);
    let child;
    try {
      child = spawn(process.execPath, args, {
        cwd: process.cwd(),
        detached: true,
        stdio: "inherit",
        env: process.env,
      });
    } catch (error) {
      console.error("[dsh-im] failed to launch restart child:", error?.message ?? error);
      return;
    }
    child.on("spawn", () => {
      console.log("[dsh-im] restart child launched; exiting");
      saveRestartNotice({ provider, route, lang });
      setTimeout(() => process.exit(0), 250);
    });
    child.on("error", (error) => {
      console.error("[dsh-im] restart child failed to launch; staying up:", error?.message ?? error);
    });
    child.unref();
  }

  /** Load the provider→models catalog through the `llm` service (best-effort). */
  async #loadCatalog() {
    if (this.#llm == null) return [];
    const groups = [];
    for (const provider of this.#llm.listProviders() ?? []) {
      try {
        const models = await this.#llm.listModels(provider.id);
        groups.push({ provider, models });
      } catch (error) {
        groups.push({ provider, models: [], error: error?.message ?? String(error) });
      }
    }
    return groups;
  }

  /** Current selection for one peer: live holder, then override, then default. */
  #currentSelection(peerKey) {
    const holder = this.#holdersByPeer.get(peerKey);
    if (holder != null) return holder.current;
    return this.#modelOverridesByPeer.get(peerKey) ?? this.#defaultModel?.currentSelection();
  }

  async #modelCommand(peerKey, args, lang) {
    const arg = (args ?? "").trim();
    if (arg === "reset" || arg === "default") {
      this.#modelOverridesByPeer.delete(peerKey);
      this.#holdersByPeer.get(peerKey)?.clear();
      return await this.#modelStatus(peerKey, lang);
    }
    if (arg === "") return await this.#modelStatus(peerKey, lang);
    return await this.#switchModel(peerKey, arg, lang);
  }

  async #modelStatus(peerKey, lang) {
    const current = this.#currentSelection(peerKey);
    const groups = await this.#loadCatalog();
    const lines = [];
    lines.push(t(lang, "model.current", { provider: current?.provider ?? "?", model: current?.model ?? "?" }));
    lines.push("");
    lines.push(t(lang, "model.available"));
    if (groups.length === 0) {
      lines.push(t(lang, "model.unavailable"));
    }
    for (const { provider, models, error } of groups) {
      if (models.length === 0) {
        lines.push(`• ${provider.name} (${provider.id})${error ? `: ${error}` : t(lang, "model.empty")}`);
        continue;
      }
      lines.push(`• ${provider.name} (${provider.id})`);
      for (const model of models) {
        const mark = current?.provider === provider.id && current?.model === model.id ? " ✓" : "";
        lines.push(`    - ${model.id}${mark}`);
      }
    }
    lines.push("");
    lines.push(t(lang, "model.switchHint"));
    lines.push(t(lang, "model.resetHint"));
    return lines.join("\n");
  }

  async #switchModel(peerKey, arg, lang) {
    if (this.#llm == null) return t(lang, "model.cannotSwitch");
    let provider;
    let model;
    if (arg.includes("/")) {
      const [head, ...rest] = arg.split("/");
      provider = head.trim();
      model = rest.join("/").trim();
    } else {
      model = arg;
      provider = await this.#findProviderForModel(model);
      if (provider === undefined) {
        return t(lang, "model.notFound", { model });
      }
    }
    if (provider === "" || model === "") return t(lang, "model.usage");
    try {
      const { config } = await this.#llm.resolveCallConfig({ provider, model });
      const selected = {
        provider: config.provider,
        model: config.model,
        ...config.reasoningEffort === undefined ? {} : { reasoningEffort: config.reasoningEffort },
      };
      this.#modelOverridesByPeer.set(peerKey, selected);
      const holder = this.#holdersByPeer.get(peerKey);
      if (holder != null) holder.current = selected;
      return t(lang, "model.switched", { provider: selected.provider, model: selected.model });
    } catch (error) {
      return t(lang, "model.switchFailed", { error: error?.message ?? String(error) });
    }
  }

  /** Show or set this peer's reasoning effort (off / high / max); chat-scoped only. */
  async #effortCommand(peerKey, args, lang) {
    const arg = (args ?? "").trim().toLowerCase();
    const current = this.#currentSelection(peerKey) ?? {};
    const currentEffort = current.reasoningEffort ?? "high";

    if (arg === "") {
      return [
        t(lang, "effort.current", { effort: currentEffort }),
        t(lang, "effort.options"),
        `off  — ${t(lang, "effort.off")}`,
        `high — ${t(lang, "effort.high")}`,
        `max  — ${t(lang, "effort.max")}`,
        t(lang, "effort.hint"),
      ].join("\n");
    }

    if (arg !== "off" && arg !== "high" && arg !== "max") {
      return t(lang, "effort.unknown", { effort: arg });
    }

    const selected = { ...current, reasoningEffort: arg };
    this.#modelOverridesByPeer.set(peerKey, selected);
    const holder = this.#holdersByPeer.get(peerKey);
    if (holder != null) holder.current = selected;
    return t(lang, "effort.set", { effort: arg });
  }

  /** Resolve a bare model id to a unique provider; undefined when not found. */
  async #findProviderForModel(model) {
    const groups = await this.#loadCatalog();
    const matches = groups
      .filter(({ models }) => models.some((entry) => entry.id === model))
      .map(({ provider }) => provider.id);
    if (matches.length === 1) return matches[0];
    return undefined;
  }

  async #resetCommand(peerKey, lang) {
    await this.#resetPeer(peerKey);
    return t(lang, "reset.done");
  }

  /** Interrupt the peer's active turn and any pending follow-up question. */
  async #stopPeer(peerKey, lang) {
    const waiter = this.#questionWaitersByPeer.get(peerKey);
    if (waiter != null) waiter.reject(new Error(t(lang, "question.cancelledByCommand")));

    const pending = this.#agentsByPeer.get(peerKey);
    const active = this.#turnsByPeer.has(peerKey);
    if (pending == null || !active) {
      return t(lang, "stop.idle");
    }
    try {
      const handle = await pending;
      handle.agent.cancel({ kind: "user" });
      return t(lang, "stop.ack");
    } catch (error) {
      return t(lang, "stop.failed", { error: error?.message ?? String(error) });
    }
  }

  /** Drop the peer's live agent (and its model holder) so the next message mints a fresh one. */
  async #resetPeer(peerKey) {
    const pending = this.#agentsByPeer.get(peerKey);
    this.#agentsByPeer.delete(peerKey);
    this.#holdersByPeer.delete(peerKey);
    // Cancel a pending follow-up question and drop turn state so a stale answer
    // cannot misroute or wedge the reset.
    this.#questionWaitersByPeer.get(peerKey)?.reject(new Error(t(this.#langByPeer.get(peerKey) ?? "en", "reset.pendingQuestion")));
    this.#turnsByPeer.delete(peerKey);
    // Forget the persisted session so the next message starts a fresh one.
    if (this.#sessionIdByPeer.delete(peerKey)) {
      savePeers(Object.fromEntries(this.#sessionIdByPeer));
    }
    if (pending == null) return;
    try {
      const handle = await pending;
      this.#peerBySessionId.delete(handle.agent.session.id);
      await handle.dispose();
    } catch (error) {
      console.error("[dsh-im] failed to dispose agent on reset:", error?.message ?? error);
    }
  }
}

/** Normalize the channel-supplied sink: prefer `sink`, else wrap a legacy `reply(text)` function. */
function normalizeSink(sink, reply) {
  if (sink != null && typeof sink === "object") return sink;
  if (typeof reply === "function") {
    return {
      onFinal: (text) => reply(text),
    };
  }
  return {};
}

/** Aggregate the last assistant text and turn outcome after `firstSeq`. */
function summarizeTurn(events, firstSeq) {
  let started = false;
  let text = "";
  let reason;
  for (const event of events) {
    if (event == null) continue;
    if (event.seq < firstSeq) continue;
    if (event.type === "turn/start") {
      started = true;
      continue;
    }
    if (!started) continue;
    if (event.type === "assistant/message") {
      // Defensive read: tolerate a missing `content` array, null blocks, or
      // non-string text so a harness event-shape change degrades to a fallback
      // reply instead of throwing.
      const blocks = Array.isArray(event?.data?.message?.content) ? event.data.message.content : [];
      const joined = blocks
        .filter((block) => block?.type === "text")
        .map((block) => (typeof block?.text === "string" ? block.text : ""))
        .join("");
      const cleaned = stripFakeToolCallMarkup(joined);
      if (cleaned !== "") text = cleaned;
    }
    if (event.type === "turn/end") reason = event?.data?.reason;
  }
  return { text, reason };
}

/** Turn a non-text turn ending into a human-readable IM fallback reply. */
function fallbackForTurnReason(reason, lang) {
  switch (reason?.kind) {
    case "error": {
      const detail = reason.error?.message ?? t(lang, "fallback.errorDetail");
      return t(lang, "fallback.error", { detail });
    }
    case "aborted":
      return t(lang, "fallback.aborted");
    case "interrupted":
      return t(lang, "fallback.interrupted");
    case "blocked":
      return t(lang, "fallback.blocked");
    case "max-tokens":
      return t(lang, "fallback.maxTokens");
    case "completed":
    default:
      return t(lang, "fallback.noReply");
  }
}
