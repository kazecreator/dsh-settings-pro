// Integration smoke test: exercise the server `apply` with a mocked harness
// context to catch wiring errors (wrong service names / API signatures) before
// a real harness restart.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply } from "./lib/index.js";

// Hermetic: point the plugin at a throwaway $DSH_HOME so this test never reads
// or mutates real runtime state — no persisted pets toggle, no real Telegram /
// WeChat polling, no real balance fetch.
const dshHome = mkdtempSync(join(tmpdir(), "dsh-settings-pro-smoke-"));
process.env.DSH_HOME = dshHome;

const routes = [];
const tools = [];
const contexts = [];
const events = {};
const goals = new Map();

function makeGoalsService() {
  return {
    get: (agent) => goals.get(agent.id),
    create: (agent, req) => {
      goals.set(agent.id, { phase: "active", objective: req.objective, maxGoalRounds: req.maxGoalRounds });
      return goals.get(agent.id);
    },
    disarm: (agent) => {
      goals.delete(agent.id);
    },
  };
}

const agents = [{ id: "s1" }, { id: "s2" }];

const ctx = {
  get(name) {
    switch (name) {
      case "loader":
        return { await: () => Promise.resolve() };
      case "webServer":
        return { register: (route) => routes.push(route) };
      case "tools":
        return { register: (def) => tools.push(def) };
      case "systemPrompt":
        return { context: (c) => contexts.push(c) };
      case "goals":
        return makeGoalsService();
      case "agents":
        return { list: () => agents };
      case "agentDefaultModel":
        return { id: "deepseek-v4-pro" };
      case "sessions":
        return {};
      case "llm":
        return {};
      case "credentials":
        return { resolve: async () => undefined };
      default:
        return undefined;
    }
  },
  on(event, handler) {
    (events[event] ??= []).push(handler);
  },
};

await apply(ctx, {
  usageEnabled: true,
  memoryEnabled: true,
  petsEnabled: false,
  petsMaxGoalRounds: 16,
});

// Wait for the loader await to settle (microtasks).
await new Promise((r) => setTimeout(r, 10));

console.log("routes:", routes.map((r) => r.path).sort().join(", "));
console.log("tools:", tools.map((t) => t.name).sort().join(", "));
console.log("systemPrompt contexts:", contexts.map((c) => c.name).join(", "));
console.log("event handlers:", Object.keys(events).sort().join(", "));

const fail = [];
if (tools.length !== 3) fail.push(`expected 3 tools, got ${tools.length}`);
if (contexts.length !== 1) fail.push(`expected 1 memory context, got ${contexts.length}`);
if (!events["session/event"]) fail.push("missing session/event handler");
if (!events["agent/created"]) fail.push("missing agent/created handler");
if (!routes.some((r) => r.path === "/settings-pro/usage")) fail.push("missing /settings-pro/usage");
if (!routes.some((r) => r.path === "/settings-pro/memory")) fail.push("missing /settings-pro/memory");
if (!routes.some((r) => r.path === "/settings-pro/pets")) fail.push("missing /settings-pro/pets");
if (!routes.some((r) => r.path === "/im/status")) fail.push("missing /im/status");
if (!routes.some((r) => r.path === "/im/telegram")) fail.push("missing /im/telegram");
if (!routes.some((r) => r.path === "/im/wechat/start")) fail.push("missing /im/wechat/start");

console.log(fail.length ? "FAIL: " + fail.join("; ") : "ALL WIRING CHECKS PASSED");
rmSync(dshHome, { recursive: true, force: true });
process.exit(fail.length ? 1 : 0);
