/**
 * Memory "user" namespacing. Every durable memory note is bound to a stable
 * user key so one user's memory never leaks into another user's session:
 *  - the Web owner and any non-IM session resolve to `owner`;
 *  - an IM peer resolves to `telegram:<peerId>` / `wechat:<peerId>`, bound by
 *    the bridge when it mints that peer's agent (session id → user key).
 *
 * Keys are sanitized before they touch the filesystem (the storage layout is
 * `memory/<userKey>/<date>.json`), and the mapping is process-local only: it is
 * re-bound on every boot as IM agents are (re)created, so nothing sensitive is
 * persisted here.
 */
export const OWNER_KEY = "owner";

/** Turn an arbitrary user key into a filesystem-safe directory segment. */
export function sanitizeUserKey(key) {
  const value = String(key ?? "").trim();
  if (value === "") return OWNER_KEY;
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

export class UserRegistry {
  #sessionToUser = new Map();

  /** Resolve a session id to a stable user key (defaults to the owner). */
  resolve(sessionId) {
    const key = this.#sessionToUser.get(sessionId);
    return sanitizeUserKey(key ?? OWNER_KEY);
  }

  /** Bind a session id to a user key (called by the bridge on agent creation). */
  bind(sessionId, userKey) {
    this.#sessionToUser.set(sessionId, sanitizeUserKey(userKey));
  }

  /** Forget a session binding (called by the bridge on agent disposal/reset). */
  unbind(sessionId) {
    this.#sessionToUser.delete(sessionId);
  }
}
