# @kazecreator/dsh-settings-pro

DeepSeek Harness settings-pro plugin. A single package bundling five features into a "设置 Pro" settings section:

- **IM Bridge** — Telegram & WeChat bridge (merged from `@kazecreator/dsh-im`, now archived), with a built-in `IM Bridge` tab.
- **用量 (Usage)** — DeepSeek balance via `/user/balance` + platform-billed daily usage with peak/off-peak pricing.
- **记忆 (Memory)** — cross-restart conversation memory: summary auto-injected into new sessions + `read_memory`/`write_memory` tools.
- **宠物 (Pets)** — desktop pet overlay + passive progress monitor that follows conversations when enabled.
- **视觉 (Vision)** — describe images via any OpenAI-compatible VLM before a text-only model sees them.

## Everything is off by default

A fresh install enables **nothing** until you opt in, feature by feature. This is intentional: you can turn on one feature, verify it works, then turn on the next — a half-configured plugin never starts network polling, registers tools, or writes memory.

| Feature | Config key | How to enable | Needs restart? |
|---|---|---|---|
| Usage | `usageEnabled` | panel toggle (persisted) | no |
| Memory | `memoryEnabled` | panel toggle (persisted) | no |
| Pets | `petsEnabled` | panel toggle (persisted) | no |
| Vision | `visionEnabled` | panel (persisted) | no |
| Telegram | `telegramEnabled` + `telegramBotToken` | panel (persisted) | no |
| WeChat | `wechatEnabled` | panel scan (persisted) | no |

All six are toggled live from the "设置 Pro" panel in the Web GUI — no `cordis.patch.yml` editing or restart required. The `*Enabled` config keys still work as the initial (install-time) state if you want to pre-enable a feature for a profile.

## Install

Add to the profile's `package.json` dependencies and insert into `cordis.patch.yml`. The minimal (all-off) config is:

```yaml
- insert:
    - id: dsh-settings-pro
      name: '@kazecreator/dsh-settings-pro'
      config: {}
```

Optionally pre-enable a feature at install time:

```yaml
      config:
        usageEnabled: true
        memoryEnabled: true
```

## Enable one feature at a time

1. **Usage** — flip the toggle in "设置 Pro → 用量". Without `DEEPSEEK_API_KEY` configured the panel still loads and reports "未配置 DEEPSEEK_API_KEY" rather than failing.
2. **Memory** — flip the toggle in "设置 Pro → 记忆". `read_memory`/`write_memory` tools activate and the "记忆" tab populates.
3. **Pets** — flip the toggle in "设置 Pro → 宠物". Install built-in / Codex / zip pets.
4. **Vision** — flip "启用" in "设置 Pro → 视觉", pick a provider/model, save.
5. **IM Bridge** — in "设置 Pro → IM Bridge", paste a Telegram bot token (connect) and scan the WeChat QR (connect). Each channel stays inert until its token/scan is present.

## Notes

- **Usage auto-sync reads a Chromium browser session** (Chrome / Edge / Brave / Arc / Opera on macOS / Windows / Linux) to backfill official billed usage. Firefox / Safari aren't supported — paste the `userToken` manually from platform.deepseek.com instead.
- **Pet desktop app is not bundled.** The default "browser" open mode opens `/pet` in a browser tab with no extra install. The "app" mode needs the separate Electron desktop-pet app (the `pet-desktop/` folder in the source repo), which is not part of the npm package.
- **The online pet library fetches from GitHub** (`awesome-codex-pet`). It caches locally and degrades to the cache/offline notice on network failure.
