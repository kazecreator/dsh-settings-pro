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

### 推荐最小配置

不想自己选？直接粘贴这个开箱即用版本——它开启无需额外配置的核心功能（**用量**、**记忆**、**宠物**），并保持 **IM**（Telegram/微信）与 **视觉** 关闭（它们需要额外 token/端点，默认 `false` / 空）：

```text
把 @kazecreator/dsh-settings-pro 插件安装进这个 DSH profile，并按推荐最小配置开启：用量、记忆、宠物；保持 telegram、wechat、视觉关闭。

1. 安装包：在 profile 目录里运行 `dsh plugin --profile <profile> add @kazecreator/dsh-settings-pro`（或 `pnpm add @kazecreator/dsh-settings-pro`）。
2. 在该 profile 的 `cordis.patch.yml` 里加一条 `insert`，插件 id 为 `dsh-settings-pro`（name 为 `@kazecreator/dsh-settings-pro`），并在其 `config` 里设置 `usageEnabled: true`、`memoryEnabled: true`、`petsEnabled: true`。`telegramEnabled`、`wechatEnabled`、`visionEnabled` 保持不写（默认 `false`，视觉的 `visionBaseUrl` / `visionModel` / `visionApiKeyEnv` 保持空）。
3. 重启 DSH，让新插件加载。
```

之后你仍可在「设置 Pro」里随时开启 IM 或视觉——在此之前它们保持关闭（false / 空）。

## 功能一览

| 功能 | 作用 | 开启方式 |
|---|---|---|
| **用量** | DeepSeek 余额 + 官方计费的每日成本/tokens（峰谷计价） | 设置 Pro → **用量** → 开关 |
| **记忆** | 跨重启记忆 + `read_memory` / `write_memory` 工具 | 设置 Pro → **记忆** → 开关 |
| **宠物** | 跟随对话的桌面宠物 | 设置 Pro → **宠物** → 开关 |
| **视觉** | 在纯文本模型看图片前，先用任意 OpenAI 兼容 VLM 描述图片 | 设置 Pro → **视觉** → 启用 + 选模型 |
| **IM Bridge** | Telegram & 微信桥接（内置） | 设置 Pro → **IM Bridge** → token / 扫码 |

`*Enabled` 配置键（`usageEnabled`、`memoryEnabled`、`petsEnabled`、`visionEnabled`、`telegramEnabled`、`wechatEnabled`）也能作为安装时的初始状态，想给某个 profile 预开启某项时用。

## 桌面宠物 App（可选，Electron）

「网页」打开模式无需安装——直接在浏览器标签页打开 `/pet`。想要一个真正悬浮在桌面、置顶、可拖拽、点击能回到 DSH 的小窗口宠物，就用「App」模式：打开 **设置 Pro → 宠物**，在「桌面应用」卡片点 **安装**，插件会在本地装好 Electron 并启动宠物窗口；安装状态会持久化，关掉设置再进来也能看到「运行中 / 已安装」等状态。

不想用一键安装，也可手动跑源码仓库里的 `pet-desktop/`：`cd pet-desktop && npm install && npm start`。

可选环境变量（默认值如下）：

- `DSH_PET_URL` — 宠物页面地址，默认 `http://127.0.0.1:3080/pet`
- `DSH_URL` — 点击宠物时打开的 DSH 地址，默认 `http://127.0.0.1:3080`
- `DSH_OPEN_MODE` — 点击宠物打开 DSH 的方式：`browser`（默认）或 `app`
- `DSH_APP_NAME` — macOS 上「App」打开模式所用 Chrome PWA 的应用名，默认 `DeepSeek Harness`

## 说明

- **更新**：插件每天检查一次 npm registry（启动时与设置页打开时，24 小时内复用缓存）。发现新版本时，「设置 Pro」导航项右侧出现 **NEW** 徽标；**「关于」**tab（最后一个 tab）展示插件信息、当前/最新版本、手动「检查更新」，并在 registry 安装且存在新版本时提供「更新并重启」按钮（在 profile 目录执行 `pnpm add @kazecreator/dsh-settings-pro@latest` 并重启 dsh 进程）。若插件以 `file:` 链接安装（本地开发目录），更新按钮隐藏，「关于」tab 会显示「安装方式：本地开发（file:）」行。
- **用量「自动同步」读取 Chromium 浏览器会话**（macOS / Windows / Linux 上的 Chrome / Edge / Brave / Arc / Opera）来同步官方计费用量；Firefox / Safari 不支持。
- **桌面宠物 App 不随包分发。** 默认「网页」打开模式在浏览器标签页打开 `/pet`，无需额外安装；「App」模式用「设置 Pro → 宠物 → 桌面应用」的一键安装按钮本地安装并启动 Electron 宠物窗口，安装状态持久化。也可手动运行源码仓库里的 `pet-desktop/`（`npm install && npm start`）。
- **在线宠物库从 GitHub 拉取**——[Awesome Codex Pet](https://codexpet.top) 社区画廊，作者 [@legeling](https://github.com/legeling/awesome-codex-pet)。感谢该项目及每一位宠物作者的开放投稿。本地有缓存，网络失败时回退到缓存/离线提示。
