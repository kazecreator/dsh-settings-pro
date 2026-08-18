/** Standalone desktop-pet page served at /pet — renders the active pet. */
export const PET_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Desktop Pet</title>
<style>
  html, body { margin: 0; padding: 0; background: transparent; height: 100%; overflow: hidden; font-family: system-ui, -apple-system, sans-serif; }
  #pet { position: fixed; left: 0; right: 0; bottom: 12px; margin: 0 auto; width: 84px; height: 84px; cursor: grab; user-select: none; z-index: 10; -webkit-user-select: none; -webkit-app-region: no-drag; }
  #bubble { position: absolute; bottom: 96px; left: 50%; transform: translateX(-50%); width: max-content; background: rgba(255,255,255,.96); border: 1px solid #e2e2e2; border-radius: 10px; padding: 5px 10px; font-size: 12px; line-height: 16px; color: #333; box-shadow: 0 2px 8px rgba(0,0,0,.15); max-width: 300px; text-align: left; }
  #body { position: absolute; left: 0; bottom: 0; width: 84px; height: 84px; display: flex; align-items: center; justify-content: center; }
  #body svg, #body img { display: block; width: 84px; height: 84px; object-fit: contain; filter: drop-shadow(0 3px 5px rgba(0,0,0,.18)); }

  .goal { white-space: pre-line; word-break: break-word; overflow-wrap: break-word; }
  .progress { color: #999; font-size: 11px; margin-top: 2px; }
  .now { display: flex; align-items: baseline; gap: 6px; white-space: nowrap; max-width: 100%; }
  .now .kind { flex: none; font-weight: 600; }
  .now .arg { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #777; }
  .now .time { flex: none; color: #aaa; font-size: 11px; }

  .k-read { color: #2563eb; }
  .k-edit { color: #d97706; }
  .k-write { color: #16a34a; }
  .k-bash { color: #7c3aed; }
  .k-grep { color: #0e7490; }
  .k-glob { color: #0d9488; }
  .k-web { color: #0284c7; }
  .k-ask { color: #ea580c; }
  .k-todo { color: #6b7280; }
  .k-agent { color: #4f46e5; }
  .k-image { color: #db2777; }
  .k-memory { color: #7c3aed; }
  .k-usage { color: #6b7280; }
  .k-think { color: #7c3aed; }
  .k-reply { color: #2563eb; }
  .k-user { color: #2563eb; }
  .k-error { color: #dc2626; }
  .k-done { color: #16a34a; }

  @media (prefers-color-scheme: dark) {
    #bubble { background: rgba(38,38,38,.96); border-color: #3f3f46; color: #e5e5e5; }
    .progress { color: #9ca3af; }
    .now .arg { color: #a1a1aa; }
    .now .time { color: #71717a; }
    .k-read, .k-reply, .k-user { color: #93c5fd; }
    .k-edit { color: #fbbf24; }
    .k-write, .k-done { color: #86efac; }
    .k-bash, .k-think, .k-memory { color: #c4b5fd; }
    .k-grep { color: #67e8f9; }
    .k-glob { color: #5eead4; }
    .k-web { color: #7dd3fc; }
    .k-ask { color: #fdba74; }
    .k-todo, .k-usage { color: #9ca3af; }
    .k-agent { color: #a5b4fc; }
    .k-image { color: #f9a8d4; }
    .k-error { color: #fca5a5; }
  }
</style>
</head>
<body>
<div id="pet">
  <div id="bubble">Connecting…</div>
  <div id="body"></div>
</div>
<script>
(function () {
  var pet = document.getElementById('pet');
  var bubble = document.getElementById('bubble');
  var body = document.getElementById('body');
  var active = null; // active pet manifest { id, name, states: { idle?, working?, goal?, paused? } }

  var EXPR_ORDER = ['idle', 'thinking', 'replying', 'working', 'goal', 'failed', 'success', 'paused'];
  var LABELS = { idle: 'Idle', thinking: 'Thinking', replying: 'Replying', working: 'Working', goal: 'Goal', failed: 'Failed', success: 'Done', paused: 'Paused' };

  function expressionFor(d) {
    if (!d || !d.enabled) return 'paused';

    // Transient event flashes (fresh turn outcomes).
    var act = d.recentActivity && d.recentActivity[0];
    if (act) {
      var age = Date.now() - ((act && act.ts) || 0);
      if (act.type === 'turn/end') {
        var r = act.reason;
        if (r === 'error' || r === 'aborted' || r === 'interrupted' || r === 'blocked' || r === 'max-tokens') {
          if (age < 4000) return 'failed';
        } else if (age < 2500) {
          return 'success';
        }
      }
    }

    // Steady states, most-active first.
    if ((d.liveJobs || []).length > 0) return 'working';
    if (d.streaming === 'reasoning') return 'thinking';
    if (d.streaming === 'text') return 'replying';
    if ((d.activeTurns || 0) > 0) {
      var last = d.recentActivity && d.recentActivity[0];
      return last && last.type === 'tool/call' ? 'working' : 'thinking';
    }
    if ((d.activeGoals || []).length > 0) return 'goal';
    return 'idle';
  }

  var lang = 'en';
  try {
    var navLang = String(navigator.language || '').toLowerCase();
    lang = navLang.indexOf('zh') === 0 ? 'zh' : 'en';
  } catch (err) {}
  // The DSH language (from the locale setting) overrides the browser guess once
  // the status snapshot arrives.
  function applyLang(d) {
    if (d && (d.lang === 'zh' || d.lang === 'en')) lang = d.lang;
  }
  function L(zh, en) { return lang === 'zh' ? zh : en; }

  // How clicking the pet opens the DSH GUI: "browser" (default) or "app".
  // Comes from the pet settings; passed to the Electron main process on click.
  var openMode = 'browser';
  function applyOpenMode(d) {
    if (d && (d.petOpenMode === 'app' || d.petOpenMode === 'browser')) openMode = d.petOpenMode;
  }

  // Escape untrusted content (tool args, reasoning, objectives) before it goes
  // into the bubble's innerHTML.
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // DSH-trajectory style: tool name + icon + a color class per type, localized
  // to the DSH system language (en/zh).
  var TOOL_META = {
    read: { en: 'Read', zh: '读取文件', icon: '📄', cls: 'k-read' },
    edit: { en: 'Edit', zh: '修改文件', icon: '✏️', cls: 'k-edit' },
    write: { en: 'Write', zh: '写入文件', icon: '📝', cls: 'k-write' },
    bash: { en: 'Bash', zh: '执行命令', icon: '💻', cls: 'k-bash' },
    grep: { en: 'Grep', zh: '搜索代码', icon: '🔍', cls: 'k-grep' },
    glob: { en: 'Glob', zh: '查找文件', icon: '🔎', cls: 'k-glob' },
    web_search: { en: 'Web Search', zh: '搜索网络', icon: '🌐', cls: 'k-web' },
    ask_user_question: { en: 'Ask', zh: '等待确认', icon: '❓', cls: 'k-ask' },
    todo_write: { en: 'Todo', zh: '更新任务清单', icon: '✅', cls: 'k-todo' },
    subagent: { en: 'Agent', zh: '委派子代理', icon: '🤖', cls: 'k-agent' },
    subagent_fork: { en: 'Agent', zh: '委派子代理', icon: '🤖', cls: 'k-agent' },
    read_image: { en: 'Image', zh: '查看图片', icon: '🖼️', cls: 'k-image' },
    read_memory: { en: 'Memory', zh: '读取记忆', icon: '🧠', cls: 'k-memory' },
    write_memory: { en: 'Memory', zh: '写入记忆', icon: '🧠', cls: 'k-memory' },
    get_usage: { en: 'Usage', zh: '查询用量', icon: '📊', cls: 'k-usage' },
  };
  function toolMeta(name) {
    return TOOL_META[name] || { en: String(name || ''), zh: String(name || ''), icon: '🔧', cls: 'k-todo' };
  }
  function toolName(m) {
    return lang === 'zh' ? m.zh : m.en;
  }
  function kind(name, icon, cls) {
    return '<span class="kind ' + cls + '">' + icon + ' ' + esc(name) + '</span>';
  }

  // Channel tags (web owner / telegram / wechat) for multi-channel attribution.
  var CHANNEL_META = {
    web: { zh: 'Web', en: 'Web', icon: '🖥️', cls: 'k-todo' },
    telegram: { zh: 'TG', en: 'TG', icon: '✈️', cls: 'k-web' },
    wechat: { zh: '微信', en: 'WeChat', icon: '💬', cls: 'k-edit' },
  };
  function channelMeta(c) {
    return CHANNEL_META[c] || CHANNEL_META.web;
  }
  function channelBadge(c) {
    var m = channelMeta(c);
    return kind(lang === 'zh' ? m.zh : m.en, m.icon, m.cls);
  }
  function channelLabel(c) {
    var m = channelMeta(c);
    return m.icon + ' ' + (lang === 'zh' ? m.zh : m.en);
  }

  function fmtDuration(ts) {
    var s = Math.max(0, Math.round((Date.now() - (ts || 0)) / 1000));
    if (s < 60) return s + 's';
    var m = Math.floor(s / 60);
    if (m < 60) return m + 'm' + (s % 60) + 's';
    var h = Math.floor(m / 60);
    var mm = m % 60;
    if (h < 24) return mm > 0 ? h + 'h' + mm + 'm' : h + 'h';
    var d = Math.floor(h / 24);
    var hh = h % 24;
    return hh > 0 ? d + 'd' + hh + 'h' : d + 'd';
  }

  function progressBar(n, m) {
    var width = 10;
    if (!(n > 0) || !(m > 0)) return '';
    var filled = Math.max(1, Math.min(width, Math.round((n / m) * width)));
    var out = '[';
    for (var i = 0; i < filled; i++) out += '█';
    for (var j = filled; j < width; j++) out += '░';
    return out + ']';
  }

  function actHtml(entry) {
    var type = entry && entry.type;
    var badge = channelBadge(entry && entry.channel);
    switch (type) {
      case 'user/message':
        return '<div class="now">' + badge + kind(L('用户', 'User'), '👤', 'k-user') + '</div>';
      case 'assistant/message':
        return '<div class="now">' + badge + kind(L('回复', 'Reply'), '💬', 'k-reply') + '<span class="time">· ' + fmtDuration(entry && entry.ts) + '</span></div>';
      case 'tool/call': {
        var m = toolMeta(entry && entry.tool);
        var detail = entry && entry.detail ? '<span class="arg">' + esc(entry.detail) + '</span>' : '';
        return '<div class="now">' + badge + kind(toolName(m), m.icon, m.cls) + detail + '<span class="time">· ' + fmtDuration(entry && entry.ts) + '</span></div>';
      }
      case 'turn/start':
        return '<div class="now">' + badge + kind(L('思考', 'Think'), '💭', 'k-think') + '</div>';
      case 'turn/end': {
        var r = entry && entry.reason;
        if (r === 'error') return '<div class="now">' + badge + kind(L('失败', 'Failed'), '⚠️', 'k-error') + '</div>';
        if (r === 'aborted' || r === 'interrupted') return '<div class="now">' + badge + kind(L('已取消', 'Cancelled'), '⚠️', 'k-error') + '</div>';
        if (r === 'blocked') return '<div class="now">' + badge + kind(L('已拦截', 'Blocked'), '⚠️', 'k-error') + '</div>';
        if (r === 'max-tokens') return '<div class="now">' + badge + kind(L('超出长度限制', 'Too long'), '⚠️', 'k-error') + '</div>';
        return '<div class="now">' + badge + kind(L('完成', 'Done'), '✅', 'k-done') + '</div>';
      }
      default: return null;
    }
  }

  function freshActivity(d, windowMs) {
    var acts = (d.recentActivity || []).filter(function (a) {
      return Date.now() - ((a && a.ts) || 0) < windowMs;
    });
    return acts.length > 0 ? acts[0] : null;
  }

  // Compact "N things are happening" summary, shown only when genuinely multi
  // (2+ goals / jobs / turns, or 2+ distinct channels).
  function multiSummary(d) {
    var goals = d.activeGoals || [];
    var jobs = d.liveJobs || [];
    var turns = d.activeTurns || 0;
    var channels = d.activeChannels || [];
    var multi = goals.length > 1 || jobs.length > 1 || turns > 1 || channels.length > 1;
    if (!multi) return null;
    var bits = [];
    if (channels.length > 1) bits.push(channels.map(channelLabel).join(' · '));
    if (turns > 1) bits.push(L(turns + ' 对话', turns + ' chats'));
    if (goals.length > 1) bits.push(L(goals.length + ' 目标', goals.length + ' goals'));
    if (jobs.length > 1) bits.push(L(jobs.length + ' 任务', jobs.length + ' jobs'));
    return '<div class="progress">' + L('同时', 'Concurrent') + ' · ' + esc(bits.join(' · ')) + '</div>';
  }

  function nowHtml(d) {
    var jobs = d.liveJobs || [];
    if (jobs.length > 0) {
      var j = jobs[0];
      var label = String(j.label || j.kind || '').trim();
      var arg = label ? '<span class="arg">' + esc(label) + '</span>' : '';
      var more = jobs.length > 1 ? '<span class="time"> · +' + (jobs.length - 1) + '</span>' : '';
      return '<div class="now">' + kind(L('任务', 'Job'), '⏳', 'k-bash') + arg + more + '<span class="time">· ' + fmtDuration(j.startedAt) + '</span></div>';
    }
    var activeTurn = (d.activeTurns || 0) > 0;
    if (d.streaming === 'reasoning') {
      var rt = d.reasoningText ? '<span class="arg">' + esc(d.reasoningText) + '</span>' : '';
      return '<div class="now">' + kind(L('思考', 'Think'), '💭', 'k-think') + rt + '</div>';
    }
    if (d.streaming === 'text') {
      return '<div class="now">' + kind(L('回复', 'Reply'), '💬', 'k-reply') + '</div>';
    }
    // While a turn is open, the freshest activity is authoritative; otherwise
    // only a very fresh entry counts, so a stale tool call never lingers.
    var act = freshActivity(d, activeTurn ? 90000 : 15000);
    if (act) return actHtml(act);
    if (activeTurn) return '<div class="now">' + kind(L('思考', 'Think'), '💭', 'k-think') + '</div>';
    return null;
  }

  function statusHtml(d) {
    if (!d || !d.enabled) return '<div class="now">' + kind(L('已暂停', 'Paused'), '⏸️', 'k-todo') + '</div>';
    var goals = d.activeGoals || [];
    var parts = [];

    // 0) Multi-task / multi-channel summary (only when 2+ things are live).
    var summary = multiSummary(d);
    if (summary) parts.push(summary);

    // 1) Context — the goal (or, without one, the in-progress todo), tagged
    // with its channel so Telegram/WeChat/Web goals are distinguishable.
    if (goals.length > 0) {
      var g = goals[0];
      var obj = esc(String(g.objective || '').trim());
      var gBadge = channelBadge(g.channel);
      var gMore = goals.length > 1 ? '<span class="time"> · +' + (goals.length - 1) + '</span>' : '';
      if (g.phase === 'blocked') {
        parts.push('<div class="goal">' + gBadge + '🚧 ' + obj + gMore + '</div>');
      } else {
        parts.push('<div class="goal">' + gBadge + '🎯 ' + obj + gMore + '</div>');
        if (g.roundsStarted > 0 && g.maxGoalRounds > 0) {
          parts.push('<div class="progress">' + progressBar(g.roundsStarted, g.maxGoalRounds) + ' ' + L('第 ' + g.roundsStarted + '/' + g.maxGoalRounds + ' 轮', 'Round ' + g.roundsStarted + '/' + g.maxGoalRounds) + '</div>');
        } else if (g.phase === 'paused') {
          parts.push('<div class="progress">' + L('已暂停', 'Paused') + '</div>');
        }
      }
    }

    // 2) What it's doing right now.
    var now = nowHtml(d);
    if (now) parts.push(now);

    if (parts.length === 0) return '<div class="now">' + kind(L('监控中', 'Watching'), '👀', 'k-todo') + '</div>';
    return parts.join('');
  }

  // Built-in/user pets only ship the four base states, so the richer
  // expressions degrade to the closest available animation.
  var EXPR_FALLBACK = {
    thinking: ['goal', 'working', 'idle'],
    replying: ['working', 'idle'],
    failed: ['working', 'idle'],
    success: ['working', 'idle'],
  };
  function resolveState(expr) {
    var states = (active && active.states) || {};
    var s = states[expr];
    var chain = EXPR_FALLBACK[expr] || [];
    for (var i = 0; s == null && i < chain.length; i++) s = states[chain[i]];
    return s || states.idle || null;
  }

  var spriteTimer = null;
  function clearSpriteTimer() {
    if (spriteTimer) { clearInterval(spriteTimer); spriteTimer = null; }
  }

  var frameCounts = {}; // sprite.url + '|' + row -> number of non-empty frames

  // Codex sprite atlases pack each animation's frames left-to-right and leave
  // the trailing columns transparent. Cycling all 'cols' columns therefore made
  // the pet blink on the empty cells. Detect the real frame count once per row.
  function detectFrames(sprite, row, done) {
    var key = sprite.url + '|' + row;
    if (frameCounts[key] != null) { done(frameCounts[key]); return; }
    var img = new Image();
    img.onload = function () {
      var count = sprite.cols || 8;
      try {
        var cw = sprite.cellW || 192;
        var ch = sprite.cellH || 208;
        var cols = sprite.cols || 8;
        var canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        var last = -1;
        var y0 = row * ch;
        for (var c = 0; c < cols; c++) {
          var data = ctx.getImageData(c * cw, y0, cw, ch).data;
          var has = false;
          for (var i = 3; i < data.length; i += 4) {
            if (data[i] > 8) { has = true; break; }
          }
          if (has) last = c;
        }
        if (last >= 0) count = last + 1;
      } catch (err) {}
      frameCounts[key] = count;
      done(count);
    };
    img.onerror = function () {
      var count = sprite.cols || 8;
      frameCounts[key] = count;
      done(count);
    };
    img.src = sprite.url;
  }

  function renderBody(expr) {
    clearSpriteTimer();
    if (active && active.sprite) {
      var sprite = active.sprite;
      var row = (sprite.states && sprite.states[expr]) || 0;
      var cols = sprite.cols || 8;
      var rows = sprite.rows || 9;
      var cellW = sprite.cellW || 192;
      var cellH = sprite.cellH || 208;
      var scale = Math.min(84 / cellW, 84 / cellH);
      var w = Math.round(cellW * scale);
      var h = Math.round(cellH * scale);
      var div = document.createElement('div');
      div.style.width = w + 'px';
      div.style.height = h + 'px';
      div.style.backgroundImage = 'url(' + sprite.url + ')';
      // Pixel-exact sizing/positioning. Percentage background-size/position
      // rounds to sub-pixels and bleeds neighbouring frames.
      div.style.backgroundSize = (cols * w) + 'px ' + (rows * h) + 'px';
      div.style.backgroundRepeat = 'no-repeat';
      div.style.imageRendering = 'pixelated';
      var frame = 0;
      var frameCount = cols;
      var setPos = function () {
        div.style.backgroundPosition = '-' + (frame * w) + 'px -' + (row * h) + 'px';
      };
      setPos();
      body.innerHTML = '';
      body.appendChild(div);
      // Start animating only after the real frame count is known, so the pet
      // never cycles into the empty trailing cells.
      detectFrames(sprite, row, function (count) {
        if (body.firstChild !== div) return; // body re-rendered meanwhile
        frameCount = count > 0 ? count : cols;
        if (frame >= frameCount) { frame = frame % frameCount; setPos(); }
        spriteTimer = setInterval(function () {
          frame = (frame + 1) % frameCount;
          setPos();
        }, 140);
      });
      return;
    }
    var state = resolveState(expr);
    if (!state) { body.innerHTML = ''; return; }
    if (state.kind === 'svg') {
      body.innerHTML = state.value;
    } else if (state.kind === 'image' && state.url) {
      var img = document.createElement('img');
      img.src = state.url;
      img.alt = '';
      body.innerHTML = '';
      body.appendChild(img);
    }
  }

  var lastExpr = null;
  var lastActiveId = null;
  var lastHtml = null;
  var lastVisualKey = null;

  // Dwell on the active→rest transition only (the gap between a goal's rounds
  // or between background jobs). Phase changes inside active work
  // (thinking↔replying↔working) and rest↔rest (goal↔idle) switch immediately,
  // so the pet tracks the model's real phase instead of flickering.
  var ACTIVE = { thinking: 1, replying: 1, working: 1 };
  var FLASH = { failed: 1, success: 1 };
  var DWELL_MS = 6000;
  var pendingExpr = null;
  var pendingSince = 0;
  function stabilizeExpr(expr) {
    var cur = lastExpr || expr;
    if (expr === cur) { pendingExpr = null; return expr; }
    // Transient flashes and enable/disable apply immediately and never linger.
    if (FLASH[expr] || FLASH[cur] || expr === 'paused' || cur === 'paused') { pendingExpr = null; return expr; }
    var curActive = !!ACTIVE[cur];
    var nextActive = !!ACTIVE[expr];
    if (!(curActive && !nextActive)) { pendingExpr = null; return expr; }
    if (pendingExpr !== expr) { pendingExpr = expr; pendingSince = Date.now(); return cur; }
    if (Date.now() - pendingSince < DWELL_MS) return cur;
    pendingExpr = null;
    return expr;
  }

  // Identity of the *resolved* visual (sprite row or state image), so the body
  // is only rebuilt when what's actually drawn changes — not on every logical
  // expression flip (thinking↔replying↔working) that maps to the same image.
  function visualKey(expr) {
    if (active && active.sprite) {
      var row = (active.sprite.states && active.sprite.states[expr]) || 0;
      return 'sprite:' + (active.sprite.url || '') + ':' + row;
    }
    var state = resolveState(expr);
    if (!state) return 'empty';
    return 'state:' + (state.kind || '') + ':' + (state.url || state.value || '');
  }

  function render(expr, html) {
    // Skip identical bubble markup so the 5s poll (and idle SSE) never rewrite
    // the DOM to the same string and cause a repaint flash.
    if (html !== lastHtml) {
      bubble.innerHTML = html;
      lastHtml = html;
    }
    var activeId = active ? active.id : null;
    var vk = visualKey(expr);
    var visualChanged = vk !== lastVisualKey || activeId !== lastActiveId;
    // Remember the logical expression (stabilizeExpr depends on it) even when
    // the resolved visual is unchanged.
    lastExpr = expr;
    lastActiveId = activeId;
    lastVisualKey = vk;
    if (visualChanged) renderBody(expr);
    var cls = expr === 'paused' ? 'still' : '';
    if (body.className !== cls) body.className = cls;
  }

  function applyScale(size) {
    var scale = ((size || 84) / 84);
    pet.style.transform = 'scale(' + scale + ')';
    pet.style.transformOrigin = 'bottom center';
  }

  // Grow/shrink the Electron window to fit the (possibly scaled) pet + bubble.
  // Measures the union of the body and the (centered, overflowing) bubble, and
  // compares against the *actual* window size so a missed resize is retried on
  // the next poll instead of being silently skipped.
  function syncWindowSize() {
    if (!(window.dshPet && typeof window.dshPet.resize === 'function')) return;
    var br = body.getBoundingClientRect();
    var fr = bubble.getBoundingClientRect();
    var left = Math.min(br.left, fr.left);
    var top = Math.min(br.top, fr.top);
    var right = Math.max(br.right, fr.right);
    var bottom = Math.max(br.bottom, fr.bottom);
    var pad = 28; // breathing room around the content (incl. drop shadows)
    var w = Math.ceil(right - left) + pad;
    var h = Math.ceil(bottom - top) + pad;
    if (Math.abs(w - window.innerWidth) <= 1 && Math.abs(h - window.innerHeight) <= 1) return;
    window.dshPet.resize(w, h);
  }

  // --- drag (moves the Electron window via IPC) + click (opens the DSH GUI) ---
  var lastOpenAt = 0;
  function openDsh() {
    var now = Date.now();
    if (now - lastOpenAt < 1500) return; // debounce: one click = one open
    lastOpenAt = now;
    if (window.dshPet && typeof window.dshPet.openDsh === 'function') {
      window.dshPet.openDsh(openMode);
    } else if (window.open) {
      window.open('http://127.0.0.1:3080', '_blank');
    }
  }

  var dragging = null;
  pet.addEventListener('mousedown', function (e) {
    e.preventDefault();
    dragging = { startX: e.clientX, startY: e.clientY, startT: Date.now(), moved: false };
    if (window.dshPet && typeof window.dshPet.dragStart === 'function') window.dshPet.dragStart();
  });
  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    if (Math.abs(e.clientX - dragging.startX) > 4 || Math.abs(e.clientY - dragging.startY) > 4) dragging.moved = true;
  });
  window.addEventListener('mouseup', function () {
    if (!dragging) return;
    var isClick = !dragging.moved && (Date.now() - dragging.startT) < 400;
    dragging = null;
    if (window.dshPet && typeof window.dshPet.dragEnd === 'function') window.dshPet.dragEnd();
    if (isClick) openDsh();
  });

  // --- poll status (with ?state= & ?demo=1 for previewing expressions) ----
  var qs = new URLSearchParams(window.location.search);
  var forceState = qs.get('state');
  var demo = qs.get('demo') === '1';
  var demoIdx = 0;

  function load() {
    if (forceState || demo) {
      var expr;
      if (forceState) expr = forceState;
      else { expr = EXPR_ORDER[demoIdx % EXPR_ORDER.length]; demoIdx++; }
      render(expr, (demo ? 'Demo · ' : 'Preview · ') + (LABELS[expr] || expr));
      return;
    }
    // Refresh both the active pet and the status snapshot.
    Promise.all([
      fetch('/pets/active').then(function (r) { return r.ok ? r.json() : null; }),
      fetch('/settings-pro/pets').then(function (r) { return r.ok ? r.json() : null; }),
    ]).then(function (rs) {
      var a = rs[0], d = rs[1];
      if (a && a.id && (!active || active.id !== a.id)) {
        active = a;
        document.title = a.name || 'Desktop Pet';
      }
      if (d) {
        applyLang(d);
        applyOpenMode(d);
        applyScale(d.petSize);
        render(stabilizeExpr(expressionFor(d)), statusHtml(d));
        syncWindowSize();
      }
    }).catch(function () {});
  }

  load();
  setInterval(load, demo ? 2000 : 5000);

  // Server-sent events: applying a pet, resizing, or live status push. The
  // status push makes the bubble update in near-real-time instead of waiting
  // for the 5s poll.
  try {
    var es = new EventSource('/pets/events');
    es.onmessage = function (e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg.type === 'pet-changed') load();
        else if (msg.type === 'pet-size-changed') { applyScale(msg.petSize); syncWindowSize(); }
        else if (msg.type === 'pet-status' && msg.status) {
          applyLang(msg.status);
          applyOpenMode(msg.status);
          applyScale(msg.status.petSize);
          render(stabilizeExpr(expressionFor(msg.status)), statusHtml(msg.status));
          syncWindowSize();
        }
      } catch (err) {}
    };
  } catch (err) {}
})();
</script>
</body>
</html>
`;
