/**
 * Localization for the IM bridge's built-in messages.
 *
 * The displayed language follows the conversation: `detectLanguage` inspects a
 * user message, and `t` resolves a key for that language. Every string that the
 * bridge itself emits (activity labels, command replies, follow-up question
 * templates, channel status) lives here in both `zh` and `en`, so nothing else
 * in the plugin hardcodes prose.
 *
 * Strings may contain `{placeholder}` tokens interpolated from the `vars` arg.
 */

const STRINGS = {
  en: {
    // Activity labels (bridge.js)
    "activity.bash": "Running command",
    "activity.read": "Reading file",
    "activity.grep": "Searching code",
    "activity.glob": "Finding files",
    "activity.edit": "Editing file",
    "activity.write": "Writing file",
    "activity.web_search": "Searching the web",
    "activity.ask_user_question": "Awaiting confirmation",
    "activity.todo_write": "Updating task list",
    "activity.thinking": "Thinking…",

    // Timeout / question lifecycle (bridge.js)
    "timeout.fallback": "⏳ The agent timed out, so I stopped the task. Send it again or let me retry another way.",
    "question.timeout": "Timed out waiting for an answer; the question was cancelled",
    "question.cancelledByCommand": "Received a command while waiting for an answer; cancelled the question",
    "reset.pendingQuestion": "Conversation reset",

    // Slash commands (bridge.js)
    "cmd.unknown": "Unknown command /{name}. Send /help to see available commands.",
    "help.title": "IM Bridge commands:",
    "help.help": "/help — show this help",
    "help.model": "/model — show the current model and available models",
    "help.modelSwitch": "/model <provider>/<model> — switch this chat's model (e.g. /model deepseek-official/deepseek-v4-flash)",
    "help.modelReset": "/model reset — restore the default model",
    "help.new": "/new (or /reset) — clear this chat and start a new conversation",
    "help.stop": "/stop — stop the current turn / cancel what's running",
    "help.restart": "/restart — restart the dsh web process (continue chatting after it's back)",
    "restart.disabled": "The restart command is disabled (restartEnabled: false).",
    "restart.ack": "Restarting dsh web… give it a moment, then continue chatting.",
    "restart.done": "✅ Restart complete — I'm back. Go ahead.",
    "stop.idle": "Nothing is running in this chat.",
    "stop.ack": "Stopped the current turn.",
    "stop.failed": "Failed to stop: {error}",

    // Model commands (bridge.js)
    "model.current": "Current model: {provider}/{model}",
    "model.available": "Available models:",
    "model.unavailable": "(model service unavailable; cannot list models)",
    "model.empty": ": no models available",
    "model.switchHint": "Switch: /model <provider>/<model> or /model <model>",
    "model.resetHint": "Reset: /model reset",
    "model.cannotSwitch": "Model service unavailable; cannot switch.",
    "model.notFound": "Model \"{model}\" not found. Send /model to see available models.",
    "model.usage": "Usage: /model <provider>/<model> (e.g. /model deepseek-official/deepseek-v4-pro).",
    "model.switched": "Switched to {provider}/{model}. Applies to this chat only.",
    "model.switchFailed": "Switch failed: {error}",
    "reset.done": "Started a new conversation; history cleared.",

    // Turn fallback reasons (bridge.js)
    "fallback.errorDetail": "unknown error",
    "fallback.error": "⚠️ Failed: {detail}",
    "fallback.aborted": "⚠️ The reply was cancelled. Please send it again.",
    "fallback.interrupted": "⚠️ The reply was interrupted. Please send it again.",
    "fallback.blocked": "⚠️ The reply was blocked. Please rephrase or try again later.",
    "fallback.maxTokens": "⚠️ The reply exceeded the length limit. Please narrow the scope and retry.",
    "fallback.noReply": "I finished, but no sendable reply was produced this time. Please ask again or rephrase.",

    // Follow-up question templates (questions.js)
    "q.headerDefault": "Confirmation needed",
    "q.options": "Options:",
    "q.replyHint": "Reply with the option number (e.g. 1) or type your answer.",
    "q.replyFree": "(just reply with your answer)",

    // WeChat channel (wechat.js)
    "wechat.noBotToken": "server did not return bot_token",
    "wechat.connectIncomplete": "Connection not completed ({status}); please scan again",
    "wechat.verifyCode": "WeChat requires a pairing verification code, which is not supported in the panel yet; please try again later",

    // Channel status (telegram.js)
    "status.done": "✅ Done",

    // Web UI panel (client.js)
    "ui.connected": "Connected",
    "ui.notConnected": "Not connected",
    "ui.disabled": "Disabled",
    "ui.enterToken": "Enter new token",
    "ui.tokenFrom": "Bot token from @BotFather",
    "ui.save": "Save",
    "ui.connect": "Connect",
    "ui.cancel": "Cancel",
    "ui.tokenConfigured": "Token configured",
    "ui.change": "Change",
    "ui.disconnect": "Disconnect",
    "ui.waitingScan": "Waiting for scan",
    "ui.scanHint": "Scan with WeChat to connect the AI bot",
    "ui.scanConnect": "Scan to connect",
    "ui.connecting": "Connecting...",
  },

  zh: {
    "activity.bash": "执行命令",
    "activity.read": "读取文件",
    "activity.grep": "搜索代码",
    "activity.glob": "查找文件",
    "activity.edit": "修改文件",
    "activity.write": "写入文件",
    "activity.web_search": "搜索网络",
    "activity.ask_user_question": "等待确认",
    "activity.todo_write": "更新任务清单",
    "activity.thinking": "思考中…",

    "timeout.fallback": "⏳ 处理超时了，我先停止当前任务。请再发一次，或让我换个方式重试。",
    "question.timeout": "等待回答超时，已取消本次询问",
    "question.cancelledByCommand": "等待回答时收到命令，已取消询问",
    "reset.pendingQuestion": "会话已重置",

    "cmd.unknown": "未知命令 /{name}。发送 /help 查看可用命令。",
    "help.title": "IM Bridge 命令：",
    "help.help": "/help — 显示本帮助",
    "help.model": "/model — 查看当前模型与可用模型",
    "help.modelSwitch": "/model <provider>/<model> — 切换本会话模型（如 /model deepseek-official/deepseek-v4-flash）",
    "help.modelReset": "/model reset — 恢复默认模型",
    "help.new": "/new（或 /reset）— 清空本会话，开始新对话",
    "help.stop": "/stop — 停止当前正在进行的对话/任务",
    "help.restart": "/restart — 重启 dsh web 进程（重启后即可继续对话）",
    "restart.disabled": "重启命令已被禁用（restartEnabled: false）。",
    "restart.ack": "正在重启 dsh web… 稍等片刻后即可继续对话。",
    "restart.done": "✅ 重启完成，我已回来，可以继续对话。",
    "stop.idle": "当前没有正在进行的对话或任务。",
    "stop.ack": "已停止当前对话。",
    "stop.failed": "停止失败：{error}",

    "model.current": "当前模型：{provider}/{model}",
    "model.available": "可用模型：",
    "model.unavailable": "（模型服务不可用，无法列出模型）",
    "model.empty": "：无可用模型",
    "model.switchHint": "切换：/model <provider>/<model> 或 /model <model>",
    "model.resetHint": "重置：/model reset",
    "model.cannotSwitch": "模型服务不可用，无法切换。",
    "model.notFound": "找不到模型 \"{model}\"。发送 /model 查看可用模型。",
    "model.usage": "用法：/model <provider>/<model>（如 /model deepseek-official/deepseek-v4-pro）。",
    "model.switched": "已切换到 {provider}/{model}。仅对本会话生效。",
    "model.switchFailed": "切换失败：{error}",
    "reset.done": "已开始新会话，历史已清空。",

    "fallback.errorDetail": "未知错误",
    "fallback.error": "⚠️ 处理失败：{detail}",
    "fallback.aborted": "⚠️ 回复已取消，请重新发送一次。",
    "fallback.interrupted": "⚠️ 回复被打断，请重新发送一次。",
    "fallback.blocked": "⚠️ 回复被拦截，请换一种问法或稍后重试。",
    "fallback.maxTokens": "⚠️ 回复超出长度限制，请缩小问题范围后重试。",
    "fallback.noReply": "我已经处理完了，但这次没有生成可发送的回复。请再问我一次或换个问法。",

    "q.headerDefault": "需要确认",
    "q.options": "选项：",
    "q.replyHint": "请回复选项编号（如 1）或直接输入你的回答。",
    "q.replyFree": "（直接回复你的回答即可）",

    "wechat.noBotToken": "服务器未返回 bot_token",
    "wechat.connectIncomplete": "连接未完成（{status}），请重新扫码",
    "wechat.verifyCode": "微信要求输入配对验证码，暂不支持在面板中输入；请稍后重试",

    "status.done": "✅ 完成",

    "ui.connected": "已连接",
    "ui.notConnected": "未连接",
    "ui.disabled": "未启用",
    "ui.enterToken": "输入新 token",
    "ui.tokenFrom": "Bot token 来自 @BotFather",
    "ui.save": "保存",
    "ui.connect": "连接",
    "ui.cancel": "取消",
    "ui.tokenConfigured": "已配置 token",
    "ui.change": "更改",
    "ui.disconnect": "断开",
    "ui.waitingScan": "等待扫码",
    "ui.scanHint": "用微信扫码连接 AI bot",
    "ui.scanConnect": "扫码连接",
    "ui.connecting": "正在连接中...",
  },
};

/** Detect a conversation language from a user message. Defaults to English. */
export function detectLanguage(text) {
  if (typeof text === "string" && /[\u4e00-\u9fff]/.test(text)) return "zh";
  return "en";
}

/**
 * Resolve a localized string for `lang`, falling back to English when a key is
 * missing. Interpolates `{placeholder}` tokens from `vars`.
 */
export function t(lang, key, vars) {
  const dict = STRINGS[lang] ?? STRINGS.en;
  let s = dict[key];
  if (s == null) s = STRINGS.en[key];
  if (s == null) return key;
  if (vars != null) {
    for (const [name, value] of Object.entries(vars)) {
      s = s.split(`{${name}}`).join(String(value));
    }
  }
  return s;
}
