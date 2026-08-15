import z from "@deepseek-ai/schemastery";

/**
 * Flat plugin config. Kept flat (scalar keys) because the loader resolves
 * top-level scalars with `.default()` deterministically; nested objects would
 * need extra default plumbing. The richer pricing table lives in a runtime
 * JSON file (see usage store), not here.
 */
const Config = z.object({
  // Feature master switches.
  usageEnabled: z.boolean().default(true),
  memoryEnabled: z.boolean().default(true),
  // Pets: when enabled, the pet monitors conversations/jobs and reports progress.
  petsEnabled: z.boolean().default(false),
  // Balance refresh interval (ms).
  balanceRefreshMs: z.number().default(60000),

  // --- IM bridge (merged from @kazecreator/dsh-im) ---
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
