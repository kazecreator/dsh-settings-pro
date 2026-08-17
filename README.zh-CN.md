# @kazecreator/dsh-settings-pro

[English](README.md) · [中文](README.zh-CN.md)

DeepSeek Harness「设置 Pro」插件——一个包、五个功能：**IM Bridge**、**用量**、**记忆**、**宠物**、**视觉**。

## 快速上手

1. 把包安装进 profile：

```bash
dsh plugin --profile <name> add @kazecreator/dsh-settings-pro
```

`<name>` 是 profile 名（Web GUI 对应 `web`）；该命令会在 profile 目录里转发给 pnpm。

2. 在 `cordis.patch.yml` 里挂载插件：

```yaml
- insert:
    - id: dsh-settings-pro
      name: '@kazecreator/dsh-settings-pro'
      config: {}
```

3. 重启 DSH，让新插件加载。

4. 打开 Web GUI →「设置 Pro」，把想要的功能打开即可——可以全开、开几个、或只开一个。默认全关，开了才运行，而且所有开关都是即时生效（无需重启）。

## 一段 prompt 完成安装 + 开启功能

这段 prompt 完全替代上面的[「快速上手」](#快速上手)——**不需要**先做那几步。DSH 的 agent 有文件读写权限，直接粘贴下面这段 prompt，把 `[...]` 换成你想要的功能即可，安装和开启它都会帮你做完：

```text
把 @kazecreator/dsh-settings-pro 插件安装进这个 DSH profile，并开启这些功能：[用量, 记忆, 宠物, 视觉, telegram, wechat]。我没列出的功能一律保持关闭。

1. 安装包：在 profile 目录里运行 `dsh plugin --profile <profile> add @kazecreator/dsh-settings-pro`（或 `pnpm add @kazecreator/dsh-settings-pro`）。
2. 在该 profile 的 `cordis.patch.yml` 里加一条 `insert`，插件 id 为 `dsh-settings-pro`（name 为 `@kazecreator/dsh-settings-pro`），并在其 `config` 里只开启我指定的功能：
   - 用量     → `usageEnabled: true`
   - 记忆     → `memoryEnabled: true`
   - 宠物     → `petsEnabled: true`
   - 视觉     → `visionEnabled: true`（还需 `visionBaseUrl`、`visionModel`、`visionApiKeyEnv`——如果我没给，就向我询问）
   - telegram → `telegramEnabled: true`（还需 `telegramBotToken`、`telegramAllowedUserIds`——如果我没给，就向我询问）
   - wechat   → `wechatEnabled: true`
3. 重启 DSH，让新插件加载。
```

agent 会安装包、写好 patch、只把你点名的 `*Enabled` 键设为开启，其余全部关闭。重启后功能即生效；之后你仍可随时在「设置 Pro」里实时切换任意开关。

## 功能一览

| 功能 | 作用 | 开启方式 |
|---|---|---|
| **用量** | DeepSeek 余额 + 官方计费的每日成本/tokens（峰谷计价） | 设置 Pro → **用量** → 开关 |
| **记忆** | 跨重启记忆 + `read_memory` / `write_memory` 工具 | 设置 Pro → **记忆** → 开关 |
| **宠物** | 跟随对话的桌面宠物 | 设置 Pro → **宠物** → 开关 |
| **视觉** | 在纯文本模型看图片前，先用任意 OpenAI 兼容 VLM 描述图片 | 设置 Pro → **视觉** → 启用 + 选模型 |
| **IM Bridge** | Telegram & 微信桥接（并入自 `@kazecreator/dsh-im`，已归档） | 设置 Pro → **IM Bridge** → token / 扫码 |

`*Enabled` 配置键（`usageEnabled`、`memoryEnabled`、`petsEnabled`、`visionEnabled`、`telegramEnabled`、`wechatEnabled`）也能作为安装时的初始状态，想给某个 profile 预开启某项时用。

## 说明

- **用量「自动同步」读取 Chromium 浏览器会话**（macOS / Windows / Linux 上的 Chrome / Edge / Brave / Arc / Opera）来同步官方计费用量；Firefox / Safari 不支持。
- **桌面宠物 App 不随包分发。** 默认「网页」打开模式在浏览器标签页打开 `/pet`，无需额外安装；「App」模式需要另行安装独立的 Electron 桌面宠物应用（源码仓库里的 `pet-desktop/` 目录），npm 包不包含它。
- **在线宠物库从 GitHub 拉取**——[Awesome Codex Pet](https://codexpet.top) 社区画廊，作者 [@legeling](https://github.com/legeling/awesome-codex-pet)。感谢该项目及每一位宠物作者的开放投稿。本地有缓存，网络失败时回退到缓存/离线提示。
