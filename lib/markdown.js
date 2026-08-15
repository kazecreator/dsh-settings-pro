/**
 * Minimal GitHub-flavored Markdown renderers for IM channels.
 *
 * - `markdownToTelegramHtml` → Telegram `parse_mode: "HTML"`. Supports <b>, <i>,
 *   <s>, <u>, <code>, <pre>, <a href>, <tg-spoiler>, and <blockquote>. It does
 *   NOT support headings or tables, so we map headings to bold and render GFM
 *   tables as per-row `header: value` lines (records divided by a visible
 *   "———" line), because column-aligned tables wrap unreadably in Telegram.
 * - `markdownToPlainText` → readable plain text (for channels with no markup,
 *   e.g. WeChat iLink). Inline markup is stripped, tables become aligned text,
 *   code blocks are indented, and headings/lists degrade to plain lines.
 *
 * The inline parser is deliberately conservative so that literal asterisks
 * (multiplication, `a*b`, `**` exponents, `*args`) are left alone rather than
 * being misread as emphasis, while still supporting `**bold**`, `*italic*`,
 * `_italic_`, `~~strike~~`, `` `code` ``, nested `**bold *italic* inside**`, and
 * links whose labels contain inline formatting and whose URLs contain balanced
 * parentheses.
 */

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escape a URL for use inside an href attribute. */
function escapeUrl(url) {
  return url
    .replace(/&/g, "&amp;")
    .replace(/"/g, "%22")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E");
}

/* ------------------------------------------------------------------------- *
 * Inline markdown
 * ------------------------------------------------------------------------- */

/**
 * Extract Markdown links `[label](url)` from `text`, calling `onLink(label, url)`
 * for each (url is the raw href with balanced parentheses resolved). Returns the
 * text with each link replaced by whatever `onLink` returns.
 */
function extractLinks(text, onLink) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("[", i);
    if (open === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, open);
    const closeLabel = text.indexOf("]", open + 1);
    if (closeLabel === -1 || text[closeLabel + 1] !== "(") {
      out += "[";
      i = open + 1;
      continue;
    }
    const label = text.slice(open + 1, closeLabel);

    // Scan the URL with balanced parentheses so `Foo_(bar)` does not truncate.
    let j = closeLabel + 2;
    let depth = 0;
    let url = "";
    let closed = false;
    while (j < text.length) {
      const ch = text[j];
      if (ch === "(") {
        depth += 1;
        url += ch;
      } else if (ch === ")") {
        if (depth === 0) {
          closed = true;
          break;
        }
        depth -= 1;
        url += ch;
      } else {
        url += ch;
      }
      j += 1;
    }
    if (!closed) {
      // Unterminated link: emit the '[' literally and rescan after it.
      out += "[";
      i = open + 1;
      continue;
    }
    out += onLink(label, url);
    i = j + 1;
  }
  return out;
}

/**
 * Apply single-character emphasis (`*italic*` and `_italic_`) to already
 * HTML-escaped text. Conservative on purpose: the opening marker must be
 * preceded by a non-word boundary, and the emphasized content must start and
 * end with a non-whitespace character, so `3 * 4`, `a*b`, `5 ** 2`, and
 * `snake_case` are left untouched.
 */
function italicize(text) {
  text = text.replace(
    /(^|[^\w*])\*([^*\s][^*\n]*[^*\s]|[^*\s])\*(?!\*)/g,
    "$1<i>$2</i>",
  );
  text = text.replace(
    /(^|[^\w])_([^_\s][^_\n]*[^_\s]|[^_\s])_(?!\w)/g,
    "$1<i>$2</i>",
  );
  return text;
}

/** Apply strikethrough and italics inside a bold span (already-escaped text). */
function applyEmphasis(text) {
  text = text.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
  return italicize(text);
}

/**
 * Convert one line's inline markdown to Telegram HTML.
 */
export function inlineMarkdown(text) {
  const codeSpans = [];
  const links = [];

  // Inline code first (so backticks inside code are never re-parsed).
  text = text.replace(/`([^`\n]+)`/g, (_, code) => {
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000C${codeSpans.length - 1}\u0000`;
  });

  // Links: label is recursively formatted, URL keeps balanced parentheses.
  text = extractLinks(text, (label, url) => {
    links.push(`<a href="${escapeUrl(url)}">${inlineMarkdown(label)}</a>`);
    return `\u0000L${links.length - 1}\u0000`;
  });

  // Escape the remaining literal text (placeholders contain only \u0000 + digits).
  text = escapeHtml(text);

  // Bold + italic `***x***`.
  text = text.replace(/\*\*\*([^*\n]+)\*\*\*/g, "<b><i>$1</i></b>");
  // Bold `**x**` (content may contain single `*` for nested italics).
  text = text.replace(
    /\*\*([^*\n]+(?:\*[^*\n]+)*)\*\*/g,
    (_, inner) => `<b>${applyEmphasis(inner)}</b>`,
  );
  // Strikethrough `~~x~~`.
  text = text.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
  // Italic `*x*` and `_x_`.
  text = italicize(text);

  // Restore code and links.
  text = text.replace(/\u0000C(\d+)\u0000/g, (_, i) => codeSpans[Number(i)]);
  text = text.replace(/\u0000L(\d+)\u0000/g, (_, i) => links[Number(i)]);

  return text;
}

/**
 * Strip inline markdown from text, leaving readable plain text (same conservative
 * rules as `inlineMarkdown`, so `3 * 4` / `a*b` / `5 ** 2` are preserved).
 */
export function stripInline(text) {
  // Code spans first (protect `` `...` `` content from further stripping).
  text = text.replace(/`([^`\n]+)`/g, "$1");
  // Links next (balanced-paren URL; label may itself contain inline markup).
  text = extractLinks(text, (label) => stripInline(label));
  return text
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, "$1")
    .replace(/\*\*([^*\n]+(?:\*[^*\n]+)*)\*\*/g, "$1")
    .replace(/~~([^~\n]+)~~/g, "$1")
    .replace(/(^|[^\w*])\*([^*\s][^*\n]*[^*\s]|[^*\s])\*(?!\*)/g, "$1$2")
    .replace(/(^|[^\w])_([^_\s][^_\n]*[^_\s]|[^_\s])_(?!\w)/g, "$1$2");
}

/* ------------------------------------------------------------------------- *
 * Tables
 * ------------------------------------------------------------------------- */

/** Split a table row into trimmed cells. */
function parseTableRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((cell) => cell.trim());
}

/** Whether a line is a GFM table separator (e.g. `|---|---|`). */
function isTableSeparator(line) {
  return /^\s*\|?[\s:|-]+\|?[\s:|-]*$/.test(line) && line.includes("-");
}

/** Whether a code point occupies a double-width (CJK / fullwidth / emoji) cell. */
function isWideCodePoint(cp) {
  return (
    cp >= 0x1100 &&
    (cp <= 0x115f || // Hangul Jamo init. consonants
      cp === 0x2329 ||
      cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0x3247 && cp !== 0x303f) ||
      (cp >= 0x3250 && cp <= 0x4dbf) ||
      (cp >= 0x4e00 && cp <= 0xa4c6) ||
      (cp >= 0xa960 && cp <= 0xa97c) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe10 && cp <= 0xfe19) ||
      (cp >= 0xfe30 && cp <= 0xfe52) ||
      (cp >= 0xfe54 && cp <= 0xfe66) ||
      (cp >= 0xfe68 && cp <= 0xfe6b) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1b000 && cp <= 0x1b001) ||
      (cp >= 0x1f200 && cp <= 0x1f251) ||
      (cp >= 0x1f300 && cp <= 0x1faff) || // emoji & misc symbols
      (cp >= 0x20000 && cp <= 0x3fffd))
  );
}

/** Terminal display width of a string (wide code points count as 2). */
function displayWidth(str) {
  let width = 0;
  for (const ch of str) width += isWideCodePoint(ch.codePointAt(0)) ? 2 : 1;
  return width;
}

/** Pad `str` to `width` display columns (no-op if it is already wider). */
function padDisplay(str, width) {
  const pad = width - displayWidth(str);
  return pad > 0 ? str + " ".repeat(pad) : str;
}

/** Render collected GFM table lines as aligned plain-text rows. */
function tableToText(lines) {
  const rows = lines
    .filter((line) => !isTableSeparator(line))
    .map(parseTableRow)
    .filter((cells) => cells.length > 0 && cells.some((c) => c !== ""))
    .map((cells) => cells.map((cell) => stripInline(cell)));

  if (rows.length === 0) return "";

  const colCount = Math.max(...rows.map((r) => r.length));
  const widths = [];
  for (let c = 0; c < colCount; c += 1) {
    widths[c] = Math.max(3, ...rows.map((r) => displayWidth(r[c] ?? "")));
  }

  return rows
    .map((row) => {
      let line = "";
      for (let c = 0; c < colCount; c += 1) {
        const cell = row[c] ?? "";
        line += c === 0 ? padDisplay(cell, widths[c]) : `  ${padDisplay(cell, widths[c])}`;
      }
      return line.trimEnd();
    })
    .join("\n");
}

/**
 * Render collected GFM table lines as per-row "header: value" lines. Each data
 * row becomes one record: every column on its own line prefixed with its bold
 * column name. Records are separated by a visible divider line rather than a
 * blank line, because Telegram collapses consecutive newlines and a `\n\n` gap
 * would visually merge adjacent records. Keeping each cell on its own line also
 * survives long-prose cells, which break any column-aligned layout.
 */
function tableToKeyValueHtml(lines) {
  const rows = lines
    .filter((line) => !isTableSeparator(line))
    .map(parseTableRow)
    .filter((cells) => cells.length > 0 && cells.some((c) => c !== ""));

  if (rows.length === 0) return "";

  const [header, ...data] = rows;
  if (header == null || header.length === 0 || data.length === 0) return "";

  const records = [];
  for (const row of data) {
    const record = [];
    for (let c = 0; c < header.length; c += 1) {
      const label = header[c] ?? "";
      const value = row[c] ?? "";
      if (label === "" && value === "") continue;
      record.push(`<b>${inlineMarkdown(label)}</b>: ${inlineMarkdown(value)}`);
    }
    if (record.length > 0) records.push(record.join("\n"));
  }

  return records.join("\n———\n");
}

/* ------------------------------------------------------------------------- *
 * Document renderers
 * ------------------------------------------------------------------------- */

/**
 * Convert a whole markdown document to Telegram HTML.
 * @param {string} md
 * @returns {string}
 */
export function markdownToTelegramHtml(md) {
  if (typeof md !== "string" || md.trim() === "") return "";
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block ```lang ... ```
    if (/^\s*```/.test(line)) {
      const codeLines = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence
      out.push(`<pre>${escapeHtml(codeLines.join("\n"))}</pre>`);
      continue;
    }

    // GFM table (current line has pipes, next is a separator).
    if (line.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim() !== "" && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i += 1;
      }
      const kv = tableToKeyValueHtml(tableLines);
      if (kv) out.push(kv);
      continue;
    }

    // Headings → bold.
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      out.push(`<b>${inlineMarkdown(heading[2])}</b>`);
      i += 1;
      continue;
    }

    // Horizontal rule.
    if (/^\s*([-*_]\s*){3,}$/.test(line)) {
      out.push("<i>————————</i>");
      i += 1;
      continue;
    }

    // Blockquote.
    if (/^\s*&gt;\s?/.test(line) || /^\s*>\s?/.test(line)) {
      const text = line.replace(/^\s*&gt;\s?/, "").replace(/^\s*>\s?/, "");
      out.push(`<i>${inlineMarkdown(text)}</i>`);
      i += 1;
      continue;
    }

    // Unordered list item.
    const bullet = /^\s*[-*+]\s+/.exec(line);
    if (bullet) {
      out.push(`• ${inlineMarkdown(line.slice(bullet[0].length))}`);
      i += 1;
      continue;
    }

    // Ordered list item.
    const ordered = /^\s*(\d+)[.)]\s+/.exec(line);
    if (ordered) {
      out.push(`${ordered[1]}. ${inlineMarkdown(line.slice(ordered[0].length))}`);
      i += 1;
      continue;
    }

    // Blank line → paragraph break.
    if (line.trim() === "") {
      out.push("");
      i += 1;
      continue;
    }

    // Ordinary paragraph line.
    out.push(inlineMarkdown(line));
    i += 1;
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Convert a whole markdown document to readable plain text (for channels with
 * no HTML/markdown support, e.g. WeChat iLink).
 */
export function markdownToPlainText(md) {
  if (typeof md !== "string" || md.trim() === "") return "";
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block ```lang ... ```
    if (/^\s*```/.test(line)) {
      const codeLines = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence
      out.push(codeLines.map((codeLine) => `  ${codeLine}`).join("\n"));
      continue;
    }

    // GFM table.
    if (line.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim() !== "" && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i += 1;
      }
      const text = tableToText(tableLines);
      if (text) out.push(text);
      continue;
    }

    // Headings.
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      out.push(stripInline(heading[2]));
      i += 1;
      continue;
    }

    // Horizontal rule.
    if (/^\s*([-*_]\s*){3,}$/.test(line)) {
      out.push("————————");
      i += 1;
      continue;
    }

    // Blockquote.
    if (/^\s*>\s?/.test(line)) {
      out.push(stripInline(line.replace(/^\s*>\s?/, "")));
      i += 1;
      continue;
    }

    // Unordered list item.
    const bullet = /^\s*[-*+]\s+/.exec(line);
    if (bullet) {
      out.push(`• ${stripInline(line.slice(bullet[0].length))}`);
      i += 1;
      continue;
    }

    // Ordered list item.
    const ordered = /^\s*(\d+)[.)]\s+/.exec(line);
    if (ordered) {
      out.push(`${ordered[1]}. ${stripInline(line.slice(ordered[0].length))}`);
      i += 1;
      continue;
    }

    // Blank line → paragraph break.
    if (line.trim() === "") {
      out.push("");
      i += 1;
      continue;
    }

    // Ordinary paragraph line.
    out.push(stripInline(line));
    i += 1;
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ------------------------------------------------------------------------- *
 * Long-message splitting (shared by the channels)
 * ------------------------------------------------------------------------- */

/**
 * Split a plain-text payload into chunks no longer than `maxLen` characters,
 * preferring newline boundaries and hard-splitting any over-long line.
 * @param {string} text
 * @param {number} maxLen
 * @returns {string[]}
 */
export function splitPlainText(text, maxLen) {
  if (typeof text !== "string" || text === "") return [""];
  const parts = [];
  const lines = text.split("\n");
  let cur = "";
  const flush = () => {
    if (cur !== "") {
      parts.push(cur);
      cur = "";
    }
  };
  for (const line of lines) {
    const next = cur === "" ? line : `${cur}\n${line}`;
    if (next.length <= maxLen) {
      cur = next;
      continue;
    }
    flush();
    if (line.length <= maxLen) {
      cur = line;
      continue;
    }
    let rest = line;
    while (rest.length > maxLen) {
      parts.push(rest.slice(0, maxLen));
      rest = rest.slice(maxLen);
    }
    cur = rest;
  }
  flush();
  return parts.length > 0 ? parts : [text];
}

/**
 * Split a plain-text payload into chunks whose UTF-8 byte length is at most
 * `maxBytes`, preferring newline boundaries and hard-splitting over-long lines
 * on character boundaries. Used by channels with a byte-based limit (WeChat).
 * @param {string} text
 * @param {number} maxBytes
 * @returns {string[]}
 */
export function splitPlainTextBytes(text, maxBytes) {
  if (typeof text !== "string" || text === "") return [""];
  const encoder = new TextEncoder();
  const byteLen = (s) => encoder.encode(s).length;

  const parts = [];
  const lines = text.split("\n");
  let cur = "";
  const flush = () => {
    if (cur !== "") {
      parts.push(cur);
      cur = "";
    }
  };
  for (const line of lines) {
    const candidate = cur === "" ? line : `${cur}\n${line}`;
    if (byteLen(candidate) <= maxBytes) {
      cur = candidate;
      continue;
    }
    flush();
    if (byteLen(line) <= maxBytes) {
      cur = line;
      continue;
    }
    // Hard-split an over-long line, cutting on a character boundary.
    let rest = line;
    while (byteLen(rest) > maxBytes) {
      let cut = 0;
      let bytes = 0;
      for (const ch of rest) {
        const n = byteLen(ch);
        if (bytes + n > maxBytes) break;
        bytes += n;
        cut += ch.length;
      }
      if (cut === 0) cut = 1; // safety: never spin on one oversized code point
      parts.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    cur = rest;
  }
  flush();
  return parts.length > 0 ? parts : [text];
}
