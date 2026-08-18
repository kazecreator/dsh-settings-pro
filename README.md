# @kazecreator/dsh-settings-pro

[English](README.md) · [中文](README.zh-CN.md)

DeepSeek Harness **Settings Pro** plugin — one package, five features: **IM Bridge**, **Usage**, **Memory**, **Pets**, and **Vision**.

## Quick start

1. Install the package into the profile:

```bash
dsh plugin --profile <name> add @kazecreator/dsh-settings-pro
```

`<name>` is the profile name (`web` for the Web GUI profile); the command forwards to pnpm in the profile directory.

2. Mount the plugin in `cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-settings-pro
      name: '@kazecreator/dsh-settings-pro'
      config: {}
```

3. Restart DSH so the new plugin loads.

4. Open the Web GUI → **Settings Pro**, and flip on whatever you want — all together, a few, or one at a time. Everything is off by default, so nothing runs until you opt in, and every toggle is live (no restart).

## Install & enable with one prompt

This replaces the whole [Quick start](#quick-start) above — you do **not** need to do those steps first. DSH's agent has file access, so just paste one prompt and it does both install and enable for you. Replace the `[...]` list with the features you want:

```text
Install the @kazecreator/dsh-settings-pro plugin into this DSH profile and enable these features: [usage, memory, pets, vision, telegram, wechat]. Keep anything I didn't list disabled.

1. Install the package: run `dsh plugin --profile <profile> add @kazecreator/dsh-settings-pro` (or `pnpm add @kazecreator/dsh-settings-pro` in the profile directory).
2. Add an `insert` entry for plugin id `dsh-settings-pro` (name `@kazecreator/dsh-settings-pro`) to the profile's `cordis.patch.yml`, and in its `config` turn on only the features I named:
   - usage    → `usageEnabled: true`
   - memory   → `memoryEnabled: true`
   - pets     → `petsEnabled: true`
   - vision   → `visionEnabled: true` (plus `visionBaseUrl`, `visionModel`, `visionApiKeyEnv` — ask me for these if I didn't give them)
   - telegram → `telegramEnabled: true` (plus `telegramBotToken`, `telegramAllowedUserIds` — ask me for these if I didn't give them)
   - wechat   → `wechatEnabled: true`
3. Restart DSH so the new plugin loads.
```

The agent installs the package, writes the patch, sets exactly the `*Enabled` keys you named, and leaves everything else off. After a restart the features run; from then on you can still flip any toggle live in **Settings Pro**.

### Recommended minimal config

Don't want to pick? Paste this ready-to-use version — it enables the self-contained core (**Usage**, **Memory**, **Pets**) and keeps **IM** (Telegram/WeChat) and **Vision** off, since they need extra tokens/endpoints and default to `false` / empty:

```text
Install the @kazecreator/dsh-settings-pro plugin into this DSH profile with the recommended minimal config: enable usage, memory, and pets; keep telegram, wechat, and vision disabled.

1. Install the package: run `dsh plugin --profile <profile> add @kazecreator/dsh-settings-pro` (or `pnpm add @kazecreator/dsh-settings-pro` in the profile directory).
2. Add an `insert` entry for plugin id `dsh-settings-pro` (name `@kazecreator/dsh-settings-pro`) to the profile's `cordis.patch.yml`, and in its `config` set `usageEnabled: true`, `memoryEnabled: true`, and `petsEnabled: true`. Leave `telegramEnabled`, `wechatEnabled`, and `visionEnabled` unset so they stay `false` (vision's `visionBaseUrl` / `visionModel` / `visionApiKeyEnv` stay empty).
3. Restart DSH so the new plugin loads.
```

You can enable IM or Vision later from **Settings Pro** — they stay off (`false` / empty) until then.

## Features

| Feature | What it does | How to enable |
|---|---|---|
| **Usage** | DeepSeek balance + official billed daily cost/tokens (peak/off-peak pricing) | Settings Pro → **Usage** → toggle |
| **Memory** | Cross-restart memory + `read_memory` / `write_memory` tools | Settings Pro → **Memory** → toggle |
| **Pets** | Desktop pet that follows conversations | Settings Pro → **Pets** → toggle |
| **Vision** | Describe images via any OpenAI-compatible VLM before a text-only model sees them | Settings Pro → **Vision** → enable + pick model |
| **IM Bridge** | Telegram & WeChat bridge (built-in) | Settings Pro → **IM Bridge** → token / QR |

The `*Enabled` config keys (`usageEnabled`, `memoryEnabled`, `petsEnabled`, `visionEnabled`, `telegramEnabled`, `wechatEnabled`) also work as install-time defaults if you want to pre-enable something for a profile.

## Notes

- **Updates:** Settings Pro checks the npm registry once a day (at startup and when the settings section opens, reusing a 24h cache). When a newer version exists, a **NEW** chip appears on the **Settings Pro** nav item; the **About** tab (last tab) shows plugin info, the installed/latest versions, a manual **Check for updates** action, and — only when an update exists on a registry install — an **Update & Restart** button (runs `pnpm add @kazecreator/dsh-settings-pro@latest` in the profile and relaunches the dsh process). If the plugin is installed as a `file:` link (local development checkout), the update button is hidden and the About tab shows the install mode as **Local dev (file:)**.
- **Usage auto-sync reads a Chromium browser session** (Chrome / Edge / Brave / Arc / Opera on macOS / Windows / Linux) to backfill official billed usage. Firefox / Safari aren't supported.
- **Pet desktop app is not bundled.** The default "browser" open mode opens `/pet` in a browser tab with no extra install. The "app" mode needs the separate Electron desktop-pet app (the `pet-desktop/` folder in the source repo), which is not part of the npm package.
- **The online pet library fetches from GitHub** — the [Awesome Codex Pet](https://codexpet.top) community gallery by [@legeling](https://github.com/legeling/awesome-codex-pet). Thanks to that project and every pet author for the open submissions. It caches locally and degrades to the cache/offline notice on network failure.
