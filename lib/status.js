/**
 * Shared IM bridge status store. The Telegram/WeChat channels write their live
 * state here, and the host serves the current snapshot over `/im/status` for
 * the browser panel to poll. A tiny observable (getSnapshot/subscribe) so the
 * same shape could back a host-side observable later.
 */
export class ImStatus {
  #state = {
    telegram: {
      enabled: false,
      connected: false,
      bot: null,
      error: null,
    },
    wechat: {
      enabled: false,
      loggedIn: false,
      userName: null,
      scanning: false,
      qrStatus: null,
      qrcode: null,
      error: null,
    },
  };
  #listeners = new Set();

  getSnapshot() {
    return this.#state;
  }

  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #emit() {
    for (const fn of this.#listeners) fn();
  }

  setTelegram(patch) {
    this.#state = {
      ...this.#state,
      telegram: { ...this.#state.telegram, ...patch },
    };
    this.#emit();
  }

  setWechat(patch) {
    this.#state = {
      ...this.#state,
      wechat: { ...this.#state.wechat, ...patch },
    };
    this.#emit();
  }

  toJSON() {
    return this.#state;
  }
}
