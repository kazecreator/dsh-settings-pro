# settings-pro 插件设计方案（草案）

> 状态：实现完成，web 端联调验证已通过（见 §9）。剩余：用户在浏览器目视核对设置页「设置 Pro」四个 tab 的展示与交互。
> 目标：**单包 `@kazecreator/dsh-settings-pro`**，四个子功能全部内置：① IM Bridge（Telegram/微信）② DeepSeek 用量 ③ 记忆 ④ 宠物。IM 桥接原为独立包 `dsh-im`，已合并进本包并归档（不再双线维护）。

## 0. 已确认的需求
- pets = 桌面宠物（预设 + 自定义），守护进程后台跟进对话、web 端显示进度。
- 用量：余额走 DeepSeek 官方 `/user/balance`；每日用量由 harness 本地统计 token/成本聚合。
- 记忆：新会话自动注入「上次摘要 + 工程进度」+ 提供读写工具；落盘 `~/.dsh` 持久化 JSON；设置页可查看/清空/导出。
- 交付：先出设计，确认后实现。

## 1. 命名方案（推荐 + 备选）
| 对象 | 推荐命名 | 英文 id | 说明 |
|---|---|---|---|
| 插件包 | `@kazecreator/dsh-settings-pro` | `dsh-settings-pro` | 沿用你口中的 "settings-pro"，cordis 名 kebab-case |
| 设置分区（可见） | 「设置 Pro」 | `settings-pro` | 统一入口（已定），含四个 tab |
| 用量功能 | 「用量」 | `usage` | 副标题「余额与每日用量」 |
| 记忆功能 | 「记忆」 | `memory` | 副标题「跨重启续聊」 |
| 宠物功能 | 「宠物」 | `pets` | 副标题「桌面宠物 · 守护跟进」 |
| IM 桥接 | 「IM Bridge」 | `im-bridge` | 已合并进本包（`lib/im.js` + bridge/telegram/wechat 等），内置 tab |

## 2. 设置页展示与排序（已核实底层机制）
- 设置页导航由 client 插槽 `settings.section` 承载，每个分区注册 `{ name:"settings.section", id, order, label }` + 一个 React 组件。
- 现有 order 占用：`general`=0、`models`=10、`plugins`=15。**「设置 Pro」插在 order=20**：`通用(0) → 模型(10) → 插件(15) → 设置 Pro(20)`。
- 「设置 Pro」分区内部用**标签页**：`用量(0) / 记忆(10) / 宠物(20) / IM Bridge(100)`。前三个是内置 tab，IM Bridge 同为内置 tab（并入前由独立包经子插槽 `settings-pro.tab` 贡献；分区用 `children: { "settings-pro.tab": {kind:"list",scope:"root"} }` 声明，组件读 `ctx.slots.entries("settings-pro.tab")` 渲染）。
- 每个 tab 是**自定义 React 组件**（用 `@deepseek-ai/dsh-client-ui-primitives` 的 `Input/Button` 等，沿用并入前的 `client.js` 模式），**不是 schema-form**（schema-form 只是 rehydrate/校验，无通用渲染器）。
- 图标：shell 按 `id` 硬编码 `navIcon(id)`，未知 id 回落齿轮 —— 新分区默认显示齿轮，可接受（不强行改 shell）。

## 3. 打包结构（沿用并入前已验证的模式）
- `package.json`：`type:module`、`main/exports`、`dsh.client = { platform:"web", inject:[...] }`、`peerDependencies` 声明 cordis/schemastery/dsh-*。
- 服务端入口 `lib/index.js`：导出 `{ name, inject, Config, apply }`；`apply(ctx, config)` 里通过 `ctx.get("loader").await()` 等 loader 就绪后再启动。
- 客户端入口 `lib/client.js`：`window.__ModuleLoader__.load({ id, factory })`，`apply(ctx)` 里 `ctx.slots.inject("settings.section", ...)`。
- 配置：schemastery `Config`；运行时覆盖存 `~/.dsh/storages/dsh-settings-pro/config.json`。
- web 接口：`ctx.get("webServer").register({ kind:"exact", path, handler })`。

## 4. 用量（余额 + 每日，技术方案已核实）
- 余额：Node 全局 `fetch` → `GET https://api.deepseek.com/user/balance`，`Authorization: Bearer <key>`。key 读取：`(await ctx.credentials.resolve(credentialRef("DEEPSEEK_API_KEY")))?.value`（ref 即 `DEEPSEEK_API_KEY`；存放 `$DSH_HOME/.credentials.yaml`，优先级 env > 该文件 > .env）。无沙箱网络限制（DeepSeek adapter 本身直接用 fetch）。
- 每日（本地统计）：订阅 `session/event` firehose，取 `assistant/message` 事件的 `data.usage = {inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens}`；模型名回看最近 `request/header` 的 `header.config.model`。或读投影 `ctx.sessionProjections.snapshot(session).values.tokenUsage`。
- 成本：harness **无定价表**，插件需自带「模型→单价」表，token×单价自行折算。
- 聚合存储：`dshHomePath("usage","<YYYY-MM-DD>.json")` + `writeFileAtomic`（读改写用 `withFileLock` 串行化）；或 `ctx.storage.backend.get("json").kv.open(...)`。

## 5. 记忆（技术方案已核实）
- 落盘：用 `dsh-storage` + `dsh-storage-domain`（`defineDomain` 定义 zod-schema 的 global/table）+ `dsh-storage-json`（原子整文件重写，落 `~/.dsh/storages/<domain>.json`）。`dsh-home-paths.dshHomePath()` 定位 `~/.dsh`。
- 自动注入扩展点：`ctx.systemPrompt.section({name,order,text})` 或 `.context({name,order,text})`（动态 user 快照）。记忆摘要用 `context()`/`section()` 注入最合适。
- 会话历史读取：`ctx.sessionPersistence`（`inspect/load/readFrom/list`）或 `ctx.sessionQuery.readSession/readSurface` 读上一会话全文，jsonl 在 `~/.dsh/sessions/--<cwd>--/<id>/session.jsonl(.zstd)`。
- 摘要生成模板：复用 `dsh-session-title-llm` 的 `registerSessionTitleLlmProvider/generateSessionTitleWithLlm`（LLM 生成 → 追加 log-only 事件 → projection 折叠）。
- 可选投影：`ctx.sessionProjections.register(ProjectionDefinition{key,schema,init,apply,view,stateVersion})` 挂 `memory` 键，持久化经 `dsh-session-projection-cache`。
- 记忆独立于 compaction（跨会话持久 vs 会话内有损压缩），可联动：`turn/end` 或 `compaction/summary` 后空闲蒸馏。
- **自动捕获（已实现）**：订阅 `session/event`，对 `user/message` 且 `source.kind === "user"`（直接人类消息，排除 goal-round/agent-inject 等合成消息）抽取文本、截断 500 字符追加为 note（`registerMemoryCapture`）；记忆 tab 每 5s 轮询刷新。LLM 摘要生成仍为可选后续增强。

## 5c. 记忆存储架构（2026-08-15 重构，已实现）
- **跨通道共享（不按用户隔离）**：所有通道（web 主人、Telegram、微信）读写同一份记忆，助手跨通道互相记得做过什么；「同时多对话不串」由 IM bridge 的**按 peer 路由**保证（每个 peer 独立 agent/session），记忆本身全局共享。
- **按日期分文件**：`memory/YYYY-MM-DD.json`（每日一条 note 数组）+ `memory/summary.json`（滚动摘要）。
- **大小控制（不丢信息也不膨胀）**：单日最多 `MAX_NOTES_PER_DAY=100` 条、单条截断 `MAX_NOTE_CHARS=500`；超限时把**最旧**的 note 折进 `digest`（压缩块，`MAX_DIGEST_CHARS=4000`，保留尾部）而非删除；另有字节上限 `MAX_DAY_BYTES=256KB` 兜底。注入到 prompt 的文本受 `INJECT_BUDGET_CHARS=4000` + 最近 `MAX_INJECT_NOTES=20` 条约束（按 ts 倒序取最新）。
- **导出为带日期 md**：`GET /settings-pro/memory/export.md` 返回 `text/markdown`，`content-disposition: memory-<YYYY-MM-DD>.md`，内容含摘要 + 按日分节 + 合并块。
- **新建/编辑落位**：UI 记忆 tab 提供摘要编辑（`POST /settings-pro/memory/summary`）、添加记录（`POST /settings-pro/memory/note`）、清空（`POST /settings-pro/memory/clear`）；`write_memory` 工具仍可用。
- **旧数据迁移**：首次启动把旧 `memory.json` 与 `memory/<userKey>/`（v1/v2）一次性合并进扁平 `memory/`，原 `memory.json` 留 `.bak`，旧用户子目录删除。

## 5b. 工具注册（技术方案已核实）
- API：`ctx.tools.register(defineTool({...}))`，`inject:["tools"]`；`defineTool(options)` 编译 `parameters` DSL 为 JSON Schema 并校验。
- 返回：`execute(args, exec)` 返回 `output.schema` 声明的规范 JSON；模型看到的文本由 `output.render(args, value)` 生成。
- 权限：默认不触发用户确认；审批需 `tools/pre-execute` 监听器返回 `{kind:'ask'}`（未挂 `ctx.approval` 时 fail-closed）。
- 落地：`read_memory` / `write_memory` 两个工具 + `get_usage` 一个工具。

## 6. 宠物（守护进程 + web 进度，技术方案已核实）
- 守护（跟进对话）：复用 `ctx.goals.create(agent,{objective,maxGoalRounds})` + `dsh-goal-round-driver`（idle agent + active goal → `agent.followup()` 排入 `<goal_round>` 持续多轮）。恢复/fork 后需 resume 重新 arm（activation 是进程内状态、不持久化）。
- 长期可取消动作：`ctx.jobs.start({kind,label,run():{cancel,done,readOutput}})`；先 `attachController()`。
- 前端注入：宠物视觉注入 `shell.overlay`（root list）或 `sidebar.footer.action`；用 `ctx.slots.register({...}, Component)`。
- 前端进度：读 `useProjection("goal")` 与 `jobsBySession`（`useSessions`）；连接层 `ctx.connection` + `ctx.remote.$on/$dispatch`。
- 注意：客户端只有公开 job 视图（无实时增量输出），流式游标 host 侧单消费 → 进度用 goal projection + job 终态事件，而非流式输出。

## 7. 实现分阶段（确认后执行）
1. **骨架**：建 `@kazecreator/dsh-settings-pro` 包（服务端 `lib/index.js` + 客户端 `lib/client.js` + `Config`），在 profile `cordis.patch.yml` 用 `insert` 挂载，设置页出现「设置 Pro」分区（order=20，三个空 tab）。
2. **用量**：余额接口 + 本地每日聚合（峰谷计价）+ `get_usage` 工具 + 「用量」tab（余额卡片 + 每日表）。
3. **记忆**：`memory.json` 存储 + systemPrompt 注入 + `read_memory`/`write_memory` 工具 + 「记忆」tab（查看/清空/导出）。
4. **宠物**：`shell.overlay` 宠物组件 + goal/jobs 守护 + 「宠物」tab（预设/自定义宠物管理）。
5. 联调：web 端核对展示、重启验证记忆续聊与用量持久化。

## 8. 已定决策
- 分区名 = 「设置 Pro」（id `settings-pro`，order=20）。
- 宠物守护 = 全局总开关（默认关）；**开启后自动守护所有对话**，无需每会话手动开。
- 用量计价 = **峰谷分时计费**（DeepSeek 8/17 起，闲时约为高峰一半）：定价表按 `模型 × 方向(输入命中缓存/未命中/输出) × 时段(高峰/闲时)` 配置，并含时段表与时区；做成可编辑配置，避免硬编码过期价格。

## 9. 联调结果（2026-08-15 已通过）
- harness 已重启，插件 `@kazecreator/dsh-settings-pro` 正常加载，服务端与客户端入口均生效。
- 服务端 web 接口全部 200：`/settings-pro/status|usage|memory|pets`、`/im/status`。Telegram `connected=true`、WeChat `loggedIn=true`。
- 工具已注册并可用：`get_usage`（余额 CNY 12.07 + 今日用量/成本）、`read_memory`、`write_memory`。
- 用量持久化：`~/.dsh/storages/dsh-settings-pro/usage/2026-08-15.json` 实时累计 token 并按峰谷计价。
- 记忆持久化：`~/.dsh/storages/dsh-settings-pro/memory.json`，`write_memory`/`read_memory` 往返正常，`systemPrompt` context 注入正常。
- 宠物守护：`petsEnabled` 已由运行时配置（`~/.dsh/storages/dsh-settings-pro/config.json`）持久化为 `true`，guardian 正在对 3 个 agent 挂目标（含本会话的 `<goal_round>`，验证了 `ctx.goals` + goal-round-driver 链路）。
- 测试：`test-plugin-apply.mjs`（已改为 hermetic，临时 `$DSH_HOME`）与 `test-markdown.mjs`（导入路径已改为 `dsh-settings-pro`）均通过。markdown 29 样例中 4 个「flagged」经核对均为误报（代码块内反引号/星号被保留、数学星号未误判为强调、>4096 长文本由 telegram 发送端 `splitPlainText` 拆分，均非转换器缺陷）。
