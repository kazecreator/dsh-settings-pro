/**
 * Pets monitor: a passive observer. It watches conversations, jobs, and goals
 * (read-only) and produces a status payload for the pet widget — it never
 * creates goals or drives the agent. Progress reporting is done through the
 * status bubbles rendered from `status()`.
 */
export class PetsMonitor {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config ?? {};
    this.enabled = this.config.petsEnabled === true;
    this.activity = [];
    this.agents = null;
    this.goals = null;
    this.jobs = null;
  }

  setEnabled(enabled) {
    this.enabled = enabled === true;
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
    const interesting = new Set([
      "turn/start",
      "turn/end",
      "user/message",
      "assistant/message",
      "tool/call",
    ]);
    if (!interesting.has(event.type)) return;
    this.activity.push({ ts: Date.now(), type: event.type, sessionId: session.id });
    if (this.activity.length > 50) this.activity.shift();
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
          goals.push({ sessionId: agent.id, phase: goal.phase, objective: goal.objective });
        }
      }
    }

    return {
      enabled: this.enabled,
      activeAgents: agents.length,
      liveJobs: liveJobs.map((j) => ({ id: j.id, kind: j.kind, label: j.label, status: j.status })),
      activeGoals: goals,
      recentActivity: this.activity.slice(-8).reverse(),
    };
  }
}
