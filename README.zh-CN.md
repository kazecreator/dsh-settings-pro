# @kazecreator/dsh-settings-pro

[English](README.md) · [中文](README.zh-CN.md)

DeepSeek Harness「设置 Pro」插件。单个包把五个功能塞进一个设置分区：

- **IM Bridge** — Telegram & 微信桥接（已并入 `@kazecreator/dsh-settings-pro`，原 `@kazecreator/dsh-im` 已归档），带内置 `IM Bridge` 标签页。
- **用量 (Usage)** — 通过 `/user/balance` 查询 DeepSeek 余额 + 平台计费的每日用量（峰谷计价）。
- **记忆 (Memory)** — 跨重启对话记忆：新会话自动注入摘要 + `read_memory`/`write_memory` 工具。
- **宠物 (Pets)** — 桌面宠物悬浮层 + 被动进度监控，开启后跟随对话。
- **视觉 (Vision)** — 在纯文本模型看到图片前，先用任意 OpenAI 兼容的 VLM 把图片描述成文本。

## 默认全关

全新安装**默认不启用任何功能**，需要你逐项开启。这是刻意的：你可以先开一个功能、确认没问题、再开下一个——半配置状态下插件不会启动网络轮询、注册工具或写入记忆。

| 功能 | 配置键 | 开启方式 | 需要重启？ |
|---|---|---|---|
| 用量 | `usageEnabled` | 面板开关（持久化） | 否 |
| 记忆 | `memoryEnabled` | 面板开关（持久化） | 否 |
| 宠物 | `petsEnabled` | 面板开关（持久化） | 否 |
| 视觉 | `visionEnabled` | 面板（持久化） | 否 |
| Telegram | `telegramEnabled` + `telegramBotToken` | 面板（持久化） | 否 |
| 微信 | `wechatEnabled` | 面板扫码（持久化） | 否 |

六项都能在 Web GUI 的「设置 Pro」面板里实时开关——无需改 `cordis.patch.yml`、无需重启。`*Enabled` 配置键仍可作为安装时的初始状态（想给某个 profile 预开启某项时用）。

## 安装

加到 profile 的 `package.json` 依赖里，再插入 `cordis.patch.yml`。最小（全关）配置：

```yaml
- insert:
    - id: dsh-settings-pro
      name: '@kazecreator/dsh-settings-pro'
      config: {}
```

可选地在安装时预开启某项：

```yaml
      config:
        usageEnabled: true
        memoryEnabled: true
```

## 一次开一个功能

1. **用量** — 在「设置 Pro → 用量」里点开关。没配 `DEEPSEEK_API_KEY` 时面板仍能正常加载，显示「未配置 DEEPSEEK_API_KEY」而不是报错。
2. **记忆** — 在「设置 Pro → 记忆」里点开关。`read_memory`/`write_memory` 工具随即生效，「记忆」标签页开始填充。
3. **宠物** — 在「设置 Pro → 宠物」里点开关。安装内置 / Codex / zip 宠物。
4. **视觉** — 在「设置 Pro → 视觉」里点「启用」，选 provider/model，保存。
5. **IM Bridge** — 在「设置 Pro → IM Bridge」里粘贴 Telegram bot token（连接）、扫描微信二维码（连接）。每个通道在拿到 token/扫码之前都保持惰性。

## 说明

- **用量「自动同步」读取 Chromium 浏览器会话**（macOS / Windows / Linux 上的 Chrome / Edge / Brave / Arc / Opera）来同步官方计费用量；Firefox / Safari 不支持，请从 platform.deepseek.com 手动粘贴 `userToken`。
- **桌面宠物 App 不随包分发。** 默认「网页」打开模式在浏览器标签页打开 `/pet`，无需额外安装；「App」模式需要另行安装独立的 Electron 桌面宠物应用（源码仓库里的 `pet-desktop/` 目录），npm 包不包含它。
- **在线宠物库从 GitHub 拉取**（`awesome-codex-pet`），本地有缓存，网络失败时回退到缓存/离线提示。
