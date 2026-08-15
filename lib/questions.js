import { t } from "./i18n.js";

/**
 * Plain-text rendering and answer parsing for `ask_user_question` follow-ups
 * relayed over IM. IM is a single-message-per-turn medium, so the bridge renders
 * one question at a time, waits for the user's next message, and parses it back
 * into the `ask_user_question` answer shape: `{ id, selected, custom? }`.
 */

/** Render one question as a plain-text prompt (works for both Telegram and WeChat). */
export function renderQuestion(question, lang = "en") {
  const header = typeof question.header === "string" && question.header.trim() !== ""
    ? question.header.trim()
    : t(lang, "q.headerDefault");
  const lines = [`❓ ${header}`, "", question.question ?? ""];
  const options = Array.isArray(question.options) ? question.options : [];
  if (options.length > 0) {
    lines.push("", t(lang, "q.options"));
    for (let i = 0; i < options.length; i += 1) {
      const option = options[i] ?? {};
      const label = typeof option.label === "string" ? option.label : String(option.label ?? "");
      const description = typeof option.description === "string" && option.description.trim() !== ""
        ? ` — ${option.description.trim()}`
        : "";
      lines.push(`${i + 1}. ${label}${description}`);
    }
    lines.push("", t(lang, "q.replyHint"));
  } else {
    lines.push("", t(lang, "q.replyFree"));
  }
  return lines.join("\n");
}

/** Match one reply fragment to an option label, or `null` when it matches none. */
function matchOption(input, options) {
  const trimmed = (input ?? "").trim();
  if (trimmed === "") return null;
  // Numeric reply = 1-based option index.
  if (/^\d+$/.test(trimmed)) {
    const index = Number(trimmed);
    if (index >= 1 && index <= options.length) return options[index - 1].label;
    return null;
  }
  // Exact label, then case-insensitive label.
  const exact = options.find((option) => option.label === trimmed);
  if (exact) return exact.label;
  const ci = options.find((option) => String(option.label).toLowerCase() === trimmed.toLowerCase());
  return ci?.label ?? null;
}

/** Split a multi-select reply into fragments (commas, semicolons, newlines). */
function splitFragments(text) {
  return (text ?? "")
    .split(/[,;\n]+/)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment !== "");
}

/**
 * Parse one IM reply into the `ask_user_question` answer shape for one question.
 *
 * @param {string} text the user's reply message.
 * @param {{ id: string, options?: {label: string, description?: string}[], multiSelect?: boolean }} question
 * @returns {{ id: string, selected: string[], custom?: string }}
 */
export function parseAnswer(text, question) {
  const id = question.id;
  const options = Array.isArray(question.options) ? question.options : [];
  const multiSelect = question.multiSelect === true;
  const trimmed = (text ?? "").trim();

  if (options.length === 0 || trimmed === "") {
    return { id, selected: [], ...(trimmed === "" ? {} : { custom: trimmed }) };
  }

  if (multiSelect) {
    const selected = [];
    const custom = [];
    for (const fragment of splitFragments(trimmed)) {
      const label = matchOption(fragment, options);
      if (label != null && !selected.includes(label)) selected.push(label);
      else custom.push(fragment);
    }
    return {
      id,
      selected,
      ...(custom.length > 0 ? { custom: custom.join(", ") } : {}),
    };
  }

  const label = matchOption(trimmed, options);
  if (label != null) return { id, selected: [label] };
  return { id, selected: [], custom: trimmed };
}
