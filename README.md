# @kazecreator/dsh-settings-pro

[English](README.md) · [中文](README.zh-CN.md)

DeepSeek Harness **Settings Pro** plugin — one package, five features: **IM Bridge**, **Usage**, **Memory**, **Pets**, and **Vision**.

## Quick start

1. Mount the plugin in `cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-settings-pro
      name: '@kazecreator/dsh-settings-pro'
      config: {}
```

2. Open the Web GUI → **Settings Pro**, and flip on whatever you want — all together, a few, or one at a time. Everything is off by default, so nothing runs until you opt in, and every toggle is live (no restart).

## Features

| Feature | What it does | How to enable |
|---|---|---|
| **Usage** | DeepSeek balance + daily cost/tokens (peak/off-peak pricing) | Settings Pro → **Usage** → toggle |
| **Memory** | Cross-restart memory + `read_memory` / `write_memory` tools | Settings Pro → **Memory** → toggle |
| **Pets** | Desktop pet that follows conversations | Settings Pro → **Pets** → toggle |
| **Vision** | Describe images via any OpenAI-compatible VLM before a text-only model sees them | Settings Pro → **Vision** → enable + pick model |
| **IM Bridge** | Telegram & WeChat bridge (merged from `@kazecreator/dsh-im`, archived) | Settings Pro → **IM Bridge** → token / QR |

The `*Enabled` config keys (`usageEnabled`, `memoryEnabled`, `petsEnabled`, `visionEnabled`, `telegramEnabled`, `wechatEnabled`) also work as install-time defaults if you want to pre-enable something for a profile.

## Notes

- **Usage auto-sync reads a Chromium browser session** (Chrome / Edge / Brave / Arc / Opera on macOS / Windows / Linux) to backfill official billed usage. Firefox / Safari aren't supported — paste the `userToken` manually from platform.deepseek.com instead.
- **Pet desktop app is not bundled.** The default "browser" open mode opens `/pet` in a browser tab with no extra install. The "app" mode needs the separate Electron desktop-pet app (the `pet-desktop/` folder in the source repo), which is not part of the npm package.
- **The online pet library fetches from GitHub** (`awesome-codex-pet`). It caches locally and degrades to the cache/offline notice on network failure.
