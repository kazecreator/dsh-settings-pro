/**
 * Pets monitor: a passive observer. It watches conversations, jobs, and goals
 * (read-only) and produces a status payload for the pet widget — it never
 * creates goals or drives the agent. Progress reporting is done through the
 * status bubbles rendered from `status()`.
 */

/** Last path segment, so the bubble shows `pet-page.js` instead of a long path. */
function shortFile(p) {
  const parts = String(p ?? "").split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

/**
 * Best-effort human detail for a tool call, parsed from the raw `arguments`
 * JSON string the model produced. Returns null when there is nothing useful.
 * The bubble truncates long details with an ellipsis (DSH-trajectory style).
 */
function summarizeToolArgs(name, argumentsStr) {
  let args = null;
  try { args = JSON.parse(argumentsStr ?? ""); } catch { args = null; }
  if (args == null || typeof args !== "object") return null;
  const str = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
  let s = null;
  switch (name) {
    case "bash": s = str(args.command); break;
    case "read":
    case "edit":
    case "write":
    case "read_image": {
      const p = str(args.file_path ?? args.path);
      s = p ? shortFile(p) : null;
      break;
    }
    case "grep":
    case "glob": s = str(args.pattern); break;
    case "web_search": s = str(args.query); break;
    case "subagent":
    case "subagent_fork": s = str(args.description); break;
    case "ask_user_question": {
      const qs = args.questions;
      if (Array.isArray(qs) && qs.length > 0 && typeof qs[0]?.question === "string") s = qs[0].question;
      break;
    }
    default: break;
  }
  if (s == null) return null;
  return s.replace(/\s+/g, " ").trim();
}

export class PetsMonitor {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config ?? {};
    this.enabled = this.config.petsEnabled === true;
    this.activity = [];
    this.openTurns = new Map(); // sessionId -> { ts, channel } (for reliable "thinking" state)
    this.channelResolver = null; // (sessionId) => "telegram" | "wechat" | null, wired by index.js
    this.agents = null;
    this.goals = null;
    this.jobs = null;

    // Live (non-activity) state for a richer bubble: what the model is emitting
    // right now, and the in-progress todo.
    this.streaming = null; // 'reasoning' | 'text' | null
    this.reasoningText = ""; // accumulated reasoning for the current segment
    this.currentTodo = null;
    this.onStatusChange = null; // wired by index.js to push SSE pet-status events
    this.notifyTimer = null;
    this.notifyPending = false;
  }

  setEnabled(enabled) {
    this.enabled = enabled === true;
  }

  /** Wire the IM bridge's session→channel lookup (set by index.js after startIm). */
  setChannelResolver(resolver) {
    this.channelResolver = typeof resolver === "function" ? resolver : null;
  }

  /** Resolve a channel tag for a session/agent id; unknown ⇒ the local owner ("web"). */
  #channelFor(id) {
    if (typeof this.channelResolver === "function") {
      try {
        const ch = this.channelResolver(id);
        if (ch === "telegram" || ch === "wechat") return ch;
      } catch {
        // fall through to the default
      }
    }
    return "web";
  }

  /** Manually clear all legacy guardian goals (exposed for the /pets/clear-goals route). */
  clearLegacyGoals() {
    this.#cleanupLegacyGoals();
  }

  start() {
    this.agents = this.ctx.get("agents");
    this.goals = this.ctx.get("goals");
    this.jobs = this.ctx.get("jobs");

    // Agents (and their restored goals) are not all present at start(); the
    // old guardian's goals live on per-session agents created later. Clear each
    // as it appears, plus a deferred sweep for agents restored at boot.
    this.ctx.on("agent/created", ({ agent }) => {
      const t = setTimeout(() => this.#clearLegacyGoal(agent), 500);
      t.unref?.();
    });
    const sweep = setTimeout(() => this.#cleanupLegacyGoals(), 3000);
    sweep.unref?.();

    this.ctx.on("session/event", (session, event) => {
      if (!this.enabled) return;
      this.#observe(session, event);
    });
  }

  /**
   * One-time migration: clear goals the old goal-creating guardian left behind
   * (identified by the legacy objective prefix).
   */
  #cleanupLegacyGoals() {
    if (this.agents == null || typeof this.agents.list !== "function") return;
    for (const agent of this.agents.list()) this.#clearLegacyGoal(agent);
  }

  #clearLegacyGoal(agent) {
    if (this.goals == null || typeof this.goals.get !== "function" || typeof this.goals.clear !== "function") return;
    try {
      const goal = this.goals.get(agent);
      if (goal != null && typeof goal.objective === "string" && goal.objective.startsWith("持续推进当前会话的工程目标")) {
        this.goals.clear(agent, { id: goal.id, revision: goal.revision });
      }
    } catch {
      // ignore per-agent failures
    }
  }

  #observe(session, event) {
    const type = event?.type;
    const channel = this.#channelFor(session.id);
    switch (type) {
      // Live state only (not pushed into the activity ring, which is reserved
      // for discrete "what just happened" markers).
      case "todo/write": {
        const todos = Array.isArray(event.data?.todos) ? event.data.todos : [];
        // Only an *in-progress* todo is a "now doing" context for the bubble.
        // Falling back to the last item was wrong: once every item is completed
        // the last one is a *done* task, yet it stuck on the bubble forever.
        const inProgress = todos.find((t) => t?.status === "in_progress");
        this.currentTodo = inProgress != null && typeof inProgress.content === "string" && inProgress.content.trim() !== ""
          ? inProgress.content.trim()
          : null;
        this.#notify();
        return;
      }
      case "assistant/chunk": {
        const chunk = event.data?.chunk;
        if (chunk?.type === "reasoning-delta") {
          this.streaming = "reasoning";
          if (typeof chunk.text === "string") this.reasoningText += chunk.text;
        } else if (chunk?.type === "text-delta") {
          this.streaming = "text";
        }
        this.#notify();
        return;
      }

      // Discrete activity markers (the bubble's "now" line).
      case "turn/start":
        this.streaming = null;
        this.reasoningText = "";
        this.openTurns.set(session.id, { ts: Date.now(), channel });
        this.#pushActivity({ type, sessionId: session.id, channel });
        this.#notify();
        return;
      case "turn/end": {
        this.streaming = null;
        this.openTurns.delete(session.id);
        const entry = { type, sessionId: session.id, channel };
        const kind = event.data?.reason?.kind;
        if (typeof kind === "string") entry.reason = kind;
        this.#pushActivity(entry);
        this.#notify();
        return;
      }
      case "tool/call": {
        this.streaming = null;
        this.reasoningText = "";
        const entry = { type, sessionId: session.id, channel };
        const name = event.data?.name;
        if (typeof name === "string") {
          entry.tool = name;
          const detail = summarizeToolArgs(name, event.data?.arguments);
          if (detail != null) entry.detail = detail;
        }
        this.#pushActivity(entry);
        this.#notify();
        return;
      }
      case "assistant/message":
        this.#pushActivity({ type, sessionId: session.id, channel });
        this.#notify();
        return;
      case "user/message":
        this.#pushActivity({ type, sessionId: session.id, channel });
        this.#notify();
        return;
      default:
        return;
    }
  }

  #pushActivity(partial) {
    this.activity.push({ ts: Date.now(), ...partial });
    if (this.activity.length > 50) this.activity.shift();
  }

  /** Throttled status push (SSE): coalesce bursts into ~2 pushes/sec. */
  #notify() {
    if (typeof this.onStatusChange !== "function") return;
    this.notifyPending = true;
    if (this.notifyTimer != null) return;
    const flush = () => {
      this.notifyTimer = null;
      if (!this.notifyPending) return;
      this.notifyPending = false;
      try { this.onStatusChange(this.status()); } catch { /* ignore */ }
    };
    this.notifyTimer = setTimeout(flush, 500);
    this.notifyTimer.unref?.();
  }

  /** Current monitored snapshot for the pet widget / settings tab. */
  status() {
    const agents = this.agents != null && typeof this.agents.list === "function" ? this.agents.list() : [];

    const jobs = this.jobs != null && typeof this.jobs.list === "function" ? this.jobs.list() : [];
    const liveJobs = jobs.filter((j) => j.status === "running" || j.status === "stopping");

    const goals = [];
    if (this.goals != null && typeof this.goals.get === "function") {
      for (const agent of agents) {
        const goal = this.goals.get(agent);
        if (goal != null && goal.phase !== "complete") {
          goals.push({
            sessionId: agent.id,
            channel: this.#channelFor(agent.session?.id ?? agent.id),
            phase: goal.phase,
            objective: goal.objective,
            roundsStarted: goal.roundsStarted ?? 0,
            maxGoalRounds: goal.maxGoalRounds ?? 0,
          });
        }
      }
    }

    // How many sessions have a turn open right now (started but not ended).
    // A turn that died without a turn/end event must not pin the pet in
    // "thinking" forever, so entries older than 10 minutes are pruned here.
    // The distinct channels of those open turns drive the multi-channel badge.
    const now = Date.now();
    let activeTurns = 0;
    const activeChannels = new Set();
    for (const [id, entry] of this.openTurns) {
      const ts = entry?.ts ?? 0;
      if (now - ts < 10 * 60 * 1000) {
        activeTurns++;
        activeChannels.add(entry?.channel || this.#channelFor(id));
      } else {
        this.openTurns.delete(id);
      }
    }

    return {
      enabled: this.enabled,
      liveJobs: liveJobs.map((j) => ({ id: j.id, kind: j.kind, label: j.label, status: j.status, startedAt: j.startedAt ?? 0 })),
      activeGoals: goals,
      activeTurns,
      activeChannels: [...activeChannels],
      streaming: this.streaming,
      reasoningText: this.reasoningText,
      currentTodo: this.currentTodo,
      recentActivity: this.activity.slice(-8).reverse(),
    };
  }
}
