# @kazecreator/dsh-settings-pro

[English](README.md) · [中文](README.zh-CN.md)

DeepSeek Harness「设置 Pro」插件——一个包、五个功能：**IM Bridge**、**用量**、**记忆**、**宠物**、**视觉**。

## 快速上手

1. 在 `cordis.patch.yml` 里挂载插件：

```yaml
- insert:
    - id: dsh-settings-pro
      name: '@kazecreator/dsh-settings-pro'
      config: {}
```

2. 打开 Web GUI →「设置 Pro」，把想要的功能打开即可——可以全开、开几个、或只开一个。默认全关，开了才运行，而且所有开关都是即时生效（无需重启）。

## 功能一览

| 功能 | 作用 | 开启方式 |
|---|---|---|
| **用量** | DeepSeek 余额 + 每日成本/tokens（峰谷计价） | 设置 Pro → **用量** → 开关 |
| **记忆** | 跨重启记忆 + `read_memory` / `write_memory` 工具 | 设置 Pro → **记忆** → 开关 |
| **宠物** | 跟随对话的桌面宠物 | 设置 Pro → **宠物** → 开关 |
| **视觉** | 在纯文本模型看图片前，先用任意 OpenAI 兼容 VLM 描述图片 | 设置 Pro → **视觉** → 启用 + 选模型 |
| **IM Bridge** | Telegram & 微信桥接（并入自 `@kazecreator/dsh-im`，已归档） | 设置 Pro → **IM Bridge** → token / 扫码 |

`*Enabled` 配置键（`usageEnabled`、`memoryEnabled`、`petsEnabled`、`visionEnabled`、`telegramEnabled`、`wechatEnabled`）也能作为安装时的初始状态，想给某个 profile 预开启某项时用。

## 说明

- **用量「自动同步」读取 Chromium 浏览器会话**（macOS / Windows / Linux 上的 Chrome / Edge / Brave / Arc / Opera）来同步官方计费用量；Firefox / Safari 不支持，请从 platform.deepseek.com 手动粘贴 `userToken`。
- **桌面宠物 App 不随包分发。** 默认「网页」打开模式在浏览器标签页打开 `/pet`，无需额外安装；「App」模式需要另行安装独立的 Electron 桌面宠物应用（源码仓库里的 `pet-desktop/` 目录），npm 包不包含它。
- **在线宠物库从 GitHub 拉取**（`awesome-codex-pet`），本地有缓存，网络失败时回退到缓存/离线提示。
