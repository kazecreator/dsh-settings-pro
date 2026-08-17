import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const DEFAULT_BASE_URL = "https://api.minimaxi.com/v1";
const DEFAULT_MODEL = "MiniMax-M3";
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_API_KEY_ENV = "MINIMAX_API_KEY";
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_PROMPT_EN =
  "Describe the image objectively and directly: its visual elements, any text (transcribe it in full), and notable details. Do not begin with lead-ins like \"this is an image…\"; output the content itself.";
const DEFAULT_PROMPT_ZH =
  "请直接、客观地描述这张图片的画面元素、文字（如有请完整转录原文）和值得注意的细节。不要以“这是一张图/这是一张…”之类的引导语开头，也不要加无关解释，直接输出内容本身。";

/**
 * Substring hints for vision-capable model ids. `/models` endpoints don't
 * disclose input modalities, so this is a best-effort filter: a model whose id
 * matches any hint is offered first, and the UI falls back to the full list
 * when the filter matches nothing (so a new/renamed VLM is never unreachable).
 */
const VISION_MODEL_HINTS = [
  "vision", "llava", "moondream", "minicpm-v", "minicpmv", "cogvlm", "bakllava",
  "gpt-4o", "gpt-4.1", "gpt-4-turbo", "claude", "gemini", "internvl", "pixtral",
  "phi-3.5-vision", "qwen-vl", "qwen2-vl", "qwen2.5-vl", "qwen2.5vl", "glm-4v",
  "llama3.2-vision", "llama-3.2-vision", "paligemma", "florence", "blip", "ocr",
  "minimax-m3",
];

/**
 * Credential env var each pi-ai catalog provider resolves its API key from.
 * The bridge speaks OpenAI `chat/completions`, so only providers whose vision
 * models use the `openai-completions` wire protocol are offered — their
 * endpoint is exactly the OpenAI-compatible surface `describe()` sends to.
 * (pi-ai does not expose the env list on the provider object, so it is kept
 * here; these names mirror each provider's `envApiKeyAuth(..., [env])`.)
 */
const VISION_PROVIDER_ENV = {
  cerebras: "CEREBRAS_API_KEY",
  "github-copilot": "COPILOT_GITHUB_TOKEN",
  groq: "GROQ_API_KEY",
  huggingface: "HF_TOKEN",
  moonshotai: "MOONSHOT_API_KEY",
  "moonshotai-cn": "MOONSHOT_API_KEY",
  nvidia: "NVIDIA_API_KEY",
  opencode: "OPENCODE_API_KEY",
  "opencode-go": "OPENCODE_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  "qwen-token-plan": "QWEN_TOKEN_PLAN_API_KEY",
  "qwen-token-plan-cn": "QWEN_TOKEN_PLAN_CN_API_KEY",
  together: "TOGETHER_API_KEY",
  xai: "XAI_API_KEY",
  xiaomi: "XIAOMI_API_KEY",
  "xiaomi-token-plan-ams": "XIAOMI_TOKEN_PLAN_AMS_API_KEY",
  "xiaomi-token-plan-cn": "XIAOMI_TOKEN_PLAN_CN_API_KEY",
  "xiaomi-token-plan-sgp": "XIAOMI_TOKEN_PLAN_SGP_API_KEY",
  zai: "ZAI_API_KEY",
  "zai-coding-cn": "ZAI_CODING_CN_API_KEY",
};

/**
 * Curated fallback when the pi-ai catalog cannot be loaded at runtime (e.g. a
 * text-only profile without `dsh-llm-pi-ai`). It is the openai-completions
 * vision subset of the same built-in catalog, snapshotted so the provider
 * dropdown still works. `listVisionProviders()` refreshes this from the live
 * catalog whenever it can.
 */
const VISION_PROVIDER_FALLBACK = [
  { id: "cerebras", name: "Cerebras", baseUrl: "https://api.cerebras.ai/v1", apiKeyEnv: "CEREBRAS_API_KEY", models: ["gemma-4-31b"] },
  { id: "github-copilot", name: "GitHub Copilot", baseUrl: "https://api.individual.githubcopilot.com", apiKeyEnv: "COPILOT_GITHUB_TOKEN", models: ["claude-fable-5", "gemini-2.5-pro", "gemini-3-flash-preview", "gpt-4.1", "kimi-k2.7-code"] },
  { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1", apiKeyEnv: "GROQ_API_KEY", models: ["meta-llama/llama-4-scout-17b-16e-instruct"] },
  { id: "huggingface", name: "Hugging Face", baseUrl: "https://router.huggingface.co/v1", apiKeyEnv: "HF_TOKEN", models: ["MiniMaxAI/MiniMax-M3", "Qwen/Qwen3.6-27B", "google/gemma-4-31B-it", "moonshotai/Kimi-K2.6", "zai-org/GLM-4.5V"] },
  { id: "moonshotai", name: "Moonshot AI", baseUrl: "https://api.moonshot.ai/v1", apiKeyEnv: "MOONSHOT_API_KEY", models: ["kimi-k2.5", "kimi-k2.6", "kimi-k2.7-code", "kimi-k3"] },
  { id: "moonshotai-cn", name: "Moonshot AI CN", baseUrl: "https://api.moonshot.cn/v1", apiKeyEnv: "MOONSHOT_API_KEY", models: ["kimi-k2.5", "kimi-k2.6", "kimi-k2.7-code", "kimi-k3"] },
  { id: "nvidia", name: "NVIDIA", baseUrl: "https://integrate.api.nvidia.com/v1", apiKeyEnv: "NVIDIA_API_KEY", models: ["meta/llama-3.2-11b-vision-instruct", "meta/llama-3.2-90b-vision-instruct", "minimaxai/minimax-m3", "moonshotai/kimi-k2.6"] },
  { id: "opencode", name: "OpenCode Zen", baseUrl: "https://opencode.ai/zen/v1", apiKeyEnv: "OPENCODE_API_KEY", models: ["grok-build-0.1", "kimi-k2.6", "kimi-k2.7-code", "minimax-m3"] },
  { id: "opencode-go", name: "OpenCode Zen Go", baseUrl: "https://opencode.ai/zen/go/v1", apiKeyEnv: "OPENCODE_API_KEY", models: ["kimi-k2.6", "kimi-k2.7-code", "kimi-k3", "qwen3.6-plus"] },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", apiKeyEnv: "OPENROUTER_API_KEY", models: ["anthropic/claude-opus-4.5", "google/gemini-3.1-pro-preview", "openai/gpt-4o", "openai/gpt-4.1", "qwen/qwen3-vl-235b-a22b-instruct", "moonshotai/kimi-k2.6", "minimax/minimax-m3", "z-ai/glm-4.6v"] },
  { id: "qwen-token-plan", name: "Qwen Token Plan", baseUrl: "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1", apiKeyEnv: "QWEN_TOKEN_PLAN_API_KEY", models: ["kimi-k2.5", "kimi-k2.6", "qwen3.6-flash", "qwen3.6-plus"] },
  { id: "qwen-token-plan-cn", name: "Qwen Token Plan CN", baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1", apiKeyEnv: "QWEN_TOKEN_PLAN_CN_API_KEY", models: ["kimi-k2.5", "kimi-k2.6", "qwen3.6-flash", "qwen3.6-plus"] },
  { id: "together", name: "Together", baseUrl: "https://api.together.ai/v1", apiKeyEnv: "TOGETHER_API_KEY", models: ["MiniMaxAI/MiniMax-M3", "Qwen/Qwen3.5-9B", "google/gemma-4-31B-it", "moonshotai/Kimi-K2.6"] },
  { id: "xai", name: "xAI", baseUrl: "https://api.x.ai/v1", apiKeyEnv: "XAI_API_KEY", models: ["grok-4.3", "grok-build-0.1"] },
  { id: "xiaomi", name: "Xiaomi", baseUrl: "https://api.xiaomimimo.com/v1", apiKeyEnv: "XIAOMI_API_KEY", models: ["mimo-v2-omni", "mimo-v2.5"] },
  { id: "xiaomi-token-plan-ams", name: "Xiaomi Token Plan AMS", baseUrl: "https://token-plan-ams.xiaomimimo.com/v1", apiKeyEnv: "XIAOMI_TOKEN_PLAN_AMS_API_KEY", models: ["mimo-v2.5"] },
  { id: "xiaomi-token-plan-cn", name: "Xiaomi Token Plan CN", baseUrl: "https://token-plan-cn.xiaomimimo.com/v1", apiKeyEnv: "XIAOMI_TOKEN_PLAN_CN_API_KEY", models: ["mimo-v2.5"] },
  { id: "xiaomi-token-plan-sgp", name: "Xiaomi Token Plan SGP", baseUrl: "https://token-plan-sgp.xiaomimimo.com/v1", apiKeyEnv: "XIAOMI_TOKEN_PLAN_SGP_API_KEY", models: ["mimo-v2.5"] },
  { id: "zai", name: "Z.AI", baseUrl: "https://api.z.ai/api/coding/paas/v4", apiKeyEnv: "ZAI_API_KEY", models: ["glm-5v-turbo"] },
  { id: "zai-coding-cn", name: "Z.AI Coding CN", baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4", apiKeyEnv: "ZAI_CODING_CN_API_KEY", models: ["glm-5v-turbo"] },
];

/**
 * Providers the bridge can serve but whose catalog entry is not
 * `openai-completions`, so the protocol filter above drops them. Each one also
 * exposes an OpenAI `chat/completions` endpoint (which `describe()` speaks), so
 * they are added back with that endpoint explicitly. MiniMax is the default.
 *
 * MiniMax is split like its catalog: `minimax` (international) and `minimax-cn`
 * (China) — both serve MiniMax-M3, with different endpoints and env keys.
 * OpenAI/Anthropic/Google/Mistral/Fireworks are catalogued under their native
 * protocols (`openai-responses` / `anthropic-messages` / `google-generative-ai`
 * / `mistral-conversations`) but also answer OpenAI wire format at the URLs below.
 */
const VISION_PROVIDER_EXTRA = [
  { id: "minimax", name: "MiniMax", baseUrl: "https://api.minimax.io/v1", apiKeyEnv: "MINIMAX_API_KEY", models: ["MiniMax-M3"] },
  { id: "minimax-cn", name: "MiniMax CN", baseUrl: "https://api.minimaxi.com/v1", apiKeyEnv: "MINIMAX_CN_API_KEY", models: ["MiniMax-M3"] },
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", apiKeyEnv: "OPENAI_API_KEY", models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4-turbo"] },
  { id: "anthropic", name: "Anthropic", baseUrl: "https://api.anthropic.com/v1", apiKeyEnv: "ANTHROPIC_API_KEY", models: ["claude-opus-5", "claude-opus-4-8", "claude-sonnet-5", "claude-sonnet-4-6", "claude-haiku-4-5"] },
  { id: "google", name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKeyEnv: "GEMINI_API_KEY", models: ["gemini-3.1-pro-preview", "gemini-3.5-flash", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"] },
  { id: "mistral", name: "Mistral", baseUrl: "https://api.mistral.ai/v1", apiKeyEnv: "MISTRAL_API_KEY", models: ["pixtral-large-latest", "pixtral-12b", "mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"] },
  { id: "fireworks", name: "Fireworks", baseUrl: "https://api.fireworks.ai/inference/v1", apiKeyEnv: "FIREWORKS_API_KEY", models: ["accounts/fireworks/models/minimax-m3", "accounts/fireworks/models/kimi-k2p7-code", "accounts/fireworks/models/qwen3p7-plus"] },
];

/**
 * Load the pi-ai built-in catalog through the harness's own `dsh-llm-pi-ai`
 * peer (the plugin's node_modules does not expose the `@earendil-works` scope,
 * but pi-ai sits in the same tree as that peer, which depends on it).
 * @returns {Promise<import("@earendil-works/pi-ai/providers/all")|null>}
 */
async function loadPiAiCatalog() {
  try {
    const dshPiAiUrl = import.meta.resolve("@deepseek-ai/dsh-llm-pi-ai");
    const dshPiAiPath = fileURLToPath(dshPiAiUrl);
    const nodeModulesDir = dirname(dirname(dirname(dirname(dshPiAiPath))));
    const allUrl = pathToFileURL(join(nodeModulesDir, "@earendil-works", "pi-ai", "dist", "providers", "all.js")).href;
    return await import(allUrl);
  } catch {
    return null;
  }
}

/**
 * OpenAI-compatible vision bridge. The harness's text model (DeepSeek) is
 * text-only, so this service sends the image to any OpenAI-compatible
 * multimodal endpoint — `/chat/completions` with an `image_url` content block,
 * the same wire protocol the harness's pi-ai adapter speaks on its
 * `openai-completions` routes — and feeds the returned description back to the
 * text model as a normal user message.
 *
 * Endpoint, model, and the credential env name are all configurable, so
 * Qwen-VL / GLM-4V / GPT-4o / a local Ollama server are a settings change, not
 * a code change. The key resolves through `ctx.credentials` first, then the
 * process environment, mirroring the harness's own LLM adapters.
 */
export class VisionService {
  constructor(ctx, config = {}) {
    this.ctx = ctx;
    this.config = config;
  }

  get enabled() {
    return this.config.visionEnabled === true;
  }

  get baseUrl() {
    return normalizeBaseUrl(this.config.visionBaseUrl) ?? DEFAULT_BASE_URL;
  }

  get model() {
    const raw = String(this.config.visionModel ?? "").trim();
    return raw !== "" ? raw : DEFAULT_MODEL;
  }

  get apiKeyEnv() {
    const raw = String(this.config.visionApiKeyEnv ?? "").trim();
    return raw !== "" ? raw : DEFAULT_API_KEY_ENV;
  }

  async #apiKeyFor(envName) {
    const env = String(envName ?? "").trim() || DEFAULT_API_KEY_ENV;
    // A value that isn't a plausible env-var name is a raw API key pasted
    // directly into the field (e.g. "sk-…"), so use it as-is.
    if (!/^[A-Z][A-Z0-9_]*$/.test(env)) return env;
    const ref = credentialRef(env);
    const credentials = this.ctx.get("credentials");
    if (credentials != null && typeof credentials.resolve === "function") {
      const hit = await credentials.resolve(ref);
      if (hit != null && typeof hit.value === "string" && hit.value.trim() !== "") {
        return hit.value.trim();
      }
    }
    return (process.env[env] ?? "").trim();
  }

  #timeoutMs() {
    const n = this.config.visionTimeoutMs;
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
  }

  /**
   * Describe one image via an OpenAI-compatible multimodal endpoint.
   * @param {Buffer|Uint8Array} image image bytes
   * @param {{mediaType?: string, question?: string}} opts
   * @returns {Promise<string>} the text description
   */
  async describe(image, { mediaType = "image/png", question = "", lang = "en" } = {}) {
    // Keyless local endpoints (e.g. Ollama) send no Authorization header; a
    // cloud provider that needs one will answer 401 and surface it below.
    const key = await this.#apiKeyFor(this.apiKeyEnv);

    const bytes = Buffer.isBuffer(image) ? image : Buffer.from(image);
    const dataUrl = `data:${mediaType};base64,${bytes.toString("base64")}`;
    const prompt = String(question ?? "").trim() !== "" ? String(question).trim() : (lang === "zh" ? DEFAULT_PROMPT_ZH : DEFAULT_PROMPT_EN);

    const body = {
      model: this.model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: Number.isFinite(this.config.visionMaxTokens) ? this.config.visionMaxTokens : DEFAULT_MAX_TOKENS,
      stream: false,
    };

    let res;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key !== "" ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.#timeoutMs()),
      });
    } catch (error) {
      if (error?.name === "TimeoutError" || error?.name === "AbortError") {
        throw new Error(`vision HTTP 请求超时（${this.#timeoutMs()}ms）`);
      }
      throw new Error(`vision HTTP 请求失败: ${error?.message ?? String(error)}`);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`vision HTTP ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = await res.json();
    return stripThinking(data?.choices?.[0]?.message?.content);
  }

  /**
   * List the models an endpoint serves, for a dropdown. Tries the
   * OpenAI-compatible `GET /models` first, then Ollama's native `GET /api/tags`
   * for local servers.
   * @param {{baseUrl?: string, apiKeyEnv?: string}} opts
   * @returns {Promise<string[]>} model ids
   */
  async listModels({ baseUrl, apiKeyEnv } = {}) {
    const url = normalizeBaseUrl(baseUrl) ?? this.baseUrl;
    const env = String(apiKeyEnv ?? "").trim() || this.apiKeyEnv;
    const key = await this.#apiKeyFor(env);
    const headers = { ...(key !== "" ? { Authorization: `Bearer ${key}` } : {}) };
    const timeoutMs = this.#timeoutMs();

    // 1) OpenAI-compatible GET /models.
    try {
      const res = await fetch(`${url}/models`, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) {
        const ids = extractModelIds(await res.json());
        if (ids.length > 0) return ids;
      }
    } catch {
      // fall through to the Ollama-native probe
    }

    // 2) Ollama native GET /api/tags (local servers without a /v1 prefix).
    const origin = url.replace(/\/v\d+\/?$/, "");
    if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(origin) || /:\d+\/?$/.test(origin)) {
      try {
        const res = await fetch(`${origin}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
        if (res.ok) {
          const data = await res.json();
          const ids = Array.isArray(data?.models)
            ? data.models.map((m) => (typeof m === "string" ? m : m?.name)).filter((s) => typeof s === "string" && s !== "")
            : [];
          if (ids.length > 0) return ids;
        }
      } catch {
        // no usable model list
      }
    }
    return [];
  }

  /**
   * Providers with at least one vision model the bridge can actually serve.
   *
   * Reads the same pi-ai built-in catalog the harness's own `dsh-llm-pi-ai`
   * adapter registers models from (`@earendil-works/pi-ai/providers/all`),
   * which is how the harness "adds models": each catalog model carries an
   * `input` modality list (`image` marks a VLM) and a wire `api` protocol.
   * Only `openai-completions` vision models are kept because `describe()`
   * speaks OpenAI `chat/completions`; endpoints with template placeholders
   * (e.g. Cloudflare account ids) are skipped since they need extra config.
   *
   * @returns {Promise<Array<{id:string,name:string,baseUrl:string,apiKeyEnv:string,models:string[]}>>}
   */
  async listVisionProviders() {
    const pi = await loadPiAiCatalog();
    let out = null;
    if (pi != null) {
      try {
        const found = [];
        for (const provider of pi.builtinProviders()) {
          const vision = pi.getBuiltinModels(provider.id).filter(
            (m) => Array.isArray(m.input) && m.input.includes("image") && m.api === "openai-completions",
          );
          if (vision.length === 0) continue;
          const baseUrl = String(vision[0].baseUrl ?? provider.baseUrl ?? "").trim();
          if (baseUrl === "" || /\{[A-Za-z0-9_]+\}/.test(baseUrl)) continue;
          found.push({
            id: provider.id,
            name: provider.name ?? provider.id,
            baseUrl,
            apiKeyEnv: VISION_PROVIDER_ENV[provider.id] ?? "",
            models: vision.map((m) => m.id),
          });
        }
        out = found;
      } catch {
        out = null;
      }
    }
    if (out == null) out = VISION_PROVIDER_FALLBACK.map((p) => ({ ...p, models: [...p.models] }));
    out.sort((a, b) => a.name.localeCompare(b.name));
    // MiniMax is always offered first (it is the default backend); its OpenAI
    // route is not in the catalog so it is appended from VISION_PROVIDER_EXTRA.
    const extras = VISION_PROVIDER_EXTRA.map((p) => ({ ...p, models: [...p.models] }));
    return [...extras, ...out];
  }

  /** Best-effort: true when a model id looks vision-capable. */
  static isVisionModel(id) {
    const s = String(id ?? "").toLowerCase();
    if (s === "") return false;
    return VISION_MODEL_HINTS.some((hint) => s.includes(hint));
  }
}

function normalizeBaseUrl(raw) {
  const s = String(raw ?? "").trim().replace(/\/+$/, "");
  return s !== "" ? s : null;
}

function extractModelIds(data) {
  if (Array.isArray(data?.data)) {
    return data.data.map((m) => (typeof m === "string" ? m : m?.id)).filter((s) => typeof s === "string" && s !== "");
  }
  if (Array.isArray(data?.models)) {
    return data.models.map((m) => (typeof m === "string" ? m : (m?.id ?? m?.name))).filter((s) => typeof s === "string" && s !== "");
  }
  if (Array.isArray(data)) {
    return data.map((m) => (typeof m === "string" ? m : m?.id)).filter((s) => typeof s === "string" && s !== "");
  }
  return [];
}

/** Strip reasoning blocks (MiniMax M3 / DeepSeek-style `<think>…</think>`) from a reply. */
function stripThinking(content) {
  return String(content ?? "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();
}
