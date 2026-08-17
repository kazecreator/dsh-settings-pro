import z from "@deepseek-ai/schemastery";

/**
 * Flat plugin config. Kept flat (scalar keys) because the loader resolves
 * top-level scalars with `.default()` deterministically; nested objects would
 * need extra default plumbing. The richer pricing table lives in a runtime
 * JSON file (see usage store), not here.
 */
const Config = z.object({
  // Feature master switches. Everything is opt-in: a fresh install enables
  // nothing until the user flips the relevant switch (patch config or the
  // settings panel's live toggles).
  usageEnabled: z.boolean().default(false),
  memoryEnabled: z.boolean().default(false),
  // Pets: when enabled, the pet monitors conversations/jobs and reports progress.
  petsEnabled: z.boolean().default(false),
  // Balance refresh interval (ms).
  balanceRefreshMs: z.number().default(60000),
  // Vision: describe images via an OpenAI-compatible multimodal endpoint before
  // the text model sees them. Endpoint/model/credential are configurable so any
  // VLM (Qwen-VL / GLM-4V / GPT-4o / local Ollama) works without a code change.
  visionEnabled: z.boolean().default(false),
  visionBaseUrl: z.string().default(""),
  visionModel: z.string().default(""),
  visionApiKeyEnv: z.string().default(""),
  visionMaxTokens: z.number().default(2048),
  visionTimeoutMs: z.number().default(60000),

  // --- IM bridge (Telegram / WeChat) ---
  agentPreset: z.string().default(""),
  agentReplyTimeoutMs: z.number().default(120000),
  questionTimeoutMs: z.number().default(0),
  commandsEnabled: z.boolean().default(true),
  restartEnabled: z.boolean().default(true),
  telegramEnabled: z.boolean().default(false),
  telegramBotToken: z.string().default(""),
  telegramAllowedUserIds: z.array(z.string()).default([]),
  telegramPollingTimeout: z.number().default(30),
  telegramApiBase: z.string().default("https://api.telegram.org"),
  wechatEnabled: z.boolean().default(false),
});

export { Config };
