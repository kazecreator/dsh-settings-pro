import { credentialRef } from "@deepseek-ai/dsh-credentials";

const VISION_URL = "https://api.deepseek.com/v1/chat/completions";
const DEFAULT_MODEL = "deepseek-v4-pro";
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_PROMPT =
  "请详细描述这张图片的内容：画面元素、文字（如有请完整转录原文）、以及值得注意的细节。不要加无关的解释。";

/**
 * DeepSeek vision bridge. The harness's `dsh-llm-deepseek` adapter is text-only
 * (it rejects image blocks), so this service converts an image into a text
 * description via DeepSeek's own multimodal `chat/completions` endpoint, and the
 * bridge feeds that description back to the text model as a normal user message.
 */
export class VisionService {
  constructor(ctx, config = {}) {
    this.ctx = ctx;
    this.config = config;
  }

  get enabled() {
    return this.config.visionEnabled === true;
  }

  async #apiKey() {
    const credentials = this.ctx.get("credentials");
    if (credentials != null && typeof credentials.resolve === "function") {
      const hit = await credentials.resolve(credentialRef("DEEPSEEK_API_KEY"));
      if (hit != null && hit.value) return hit.value;
    }
    return process.env.DEEPSEEK_API_KEY ?? "";
  }

  /**
   * Describe one image with DeepSeek's vision model.
   * @param {Buffer|Uint8Array} image image bytes
   * @param {{mediaType?: string, question?: string}} opts
   * @returns {Promise<string>} the text description
   */
  async describe(image, { mediaType = "image/png", question = "" } = {}) {
    const key = await this.#apiKey();
    if (!key) throw new Error("未配置 DEEPSEEK_API_KEY");

    const bytes = Buffer.isBuffer(image) ? image : Buffer.from(image);
    const dataUrl = `data:${mediaType};base64,${bytes.toString("base64")}`;
    const prompt = String(question ?? "").trim() !== "" ? String(question).trim() : DEFAULT_PROMPT;

    const body = {
      model: this.config.visionModel ?? DEFAULT_MODEL,
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

    const res = await fetch(VISION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`vision HTTP ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? "";
  }
}
