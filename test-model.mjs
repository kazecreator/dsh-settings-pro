import { Context } from "@deepseek-ai/cordis";
import { LlmRuntime } from "@deepseek-ai/dsh-llm";
import { DeepSeekAdapter, resolveAdapterOptions } from "@deepseek-ai/dsh-llm-deepseek";

const ctx = new Context();
const llm = new LlmRuntime(ctx);
const config = resolveAdapterOptions({ apiKeyEnv: "DEEPSEEK_API_KEY" }, undefined);
const adapter = new DeepSeekAdapter({
  options: () => config,
  resolveApiKey: async () => "test",
  resolveUserId: () => "u",
});
llm.registerAdapter(["deepseek-official"], adapter);

for (const model of ["deepseek-v4-flash", "deepseek-v4-pro"]) {
  try {
    const r = await llm.resolveCallConfig({ provider: "deepseek-official", model });
    console.log(`resolveCallConfig(${model}) OK:`, JSON.stringify(r));
  } catch (e) {
    console.log(`resolveCallConfig(${model}) FAIL:`, e?.message);
    console.log("  stack:", (e?.stack ?? "").split("\n").slice(0, 4).join(" <- "));
  }
}
