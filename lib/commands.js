/**
 * Inline slash-command parsing for the IM bridge. Messages that *start* with a
 * `/` are treated as bridge commands and handled locally (never sent to the
 * model); anything else is a normal message. Only a leading slash counts, so a
 * message like "please run /help" stays a normal prompt.
 */

/**
 * Parse one inbound message into a command, or `null` when it is not one.
 *
 * @param {string} text
 * @returns {{ name: string, args: string, raw: string } | null}
 */
export function parseCommand(text) {
  if (typeof text !== "string") return null;
  const raw = text.trim();
  if (!raw.startsWith("/")) return null;
  const body = raw.slice(1).trim();
  if (body === "") return null; // lone "/" is not a command
  const space = body.search(/\s/);
  const name = (space === -1 ? body : body.slice(0, space)).toLowerCase();
  if (name === "") return null;
  const args = space === -1 ? "" : body.slice(space + 1).trim();
  return { name, args, raw };
}

/** Whether an inbound text is a bridge command (for cheap pre-checks). */
export function isCommand(text) {
  return parseCommand(text) != null;
}
