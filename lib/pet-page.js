/** Standalone desktop-pet page served at /pet — renders the active pet. */
export const PET_PAGE = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>桌面宠物</title>
<style>
  html, body { margin: 0; padding: 0; background: transparent; height: 100%; overflow: hidden; font-family: system-ui, -apple-system, sans-serif; }
  #pet { position: fixed; right: 12px; bottom: 12px; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: grab; user-select: none; z-index: 10; -webkit-user-select: none; -webkit-app-region: drag; }
  #bubble { background: rgba(255,255,255,.96); border: 1px solid #e2e2e2; border-radius: 10px; padding: 4px 10px; font-size: 12px; line-height: 16px; color: #333; box-shadow: 0 2px 8px rgba(0,0,0,.15); white-space: nowrap; }
  #body { position: relative; width: 84px; height: 84px; display: flex; align-items: center; justify-content: center; animation: bob 2.8s ease-in-out infinite; }
  #body.still { animation: none; }
  #body svg, #body img { display: block; width: 84px; height: 84px; object-fit: contain; filter: drop-shadow(0 3px 5px rgba(0,0,0,.18)); }
  @keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
</style>
</head>
<body>
<div id="pet">
  <div id="bubble">连接中…</div>
  <div id="body"></div>
</div>
<script>
(function () {
  var pet = document.getElementById('pet');
  var bubble = document.getElementById('bubble');
  var body = document.getElementById('body');
  var active = null; // active pet manifest { id, name, states: { idle?, working?, goal?, paused? } }

  var EXPR_ORDER = ['idle', 'working', 'goal', 'paused'];
  var LABELS = { idle: '监控中', working: '进行中', goal: '有目标', paused: '已暂停' };

  function expressionFor(d) {
    if (!d || !d.enabled) return 'paused';
    if ((d.liveJobs || []).length > 0) return 'working';
    if ((d.activeGoals || []).length > 0) return 'goal';
    return 'idle';
  }

  function statusText(d) {
    if (!d || !d.enabled) return '已暂停';
    var jobs = (d.liveJobs || []).length;
    var goals = (d.activeGoals || []).length;
    if (jobs > 0) return '进行中 · ' + jobs + ' 任务';
    if (goals > 0) return goals + ' 目标';
    return '监控中 · ' + (d.activeAgents || 0) + ' 会话';
  }

  function resolveState(expr) {
    var states = (active && active.states) || {};
    return states[expr] || states.idle || null;
  }

  function renderBody(expr) {
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

  function render(expr, text) {
    bubble.textContent = text;
    renderBody(expr);
    body.className = expr === 'paused' ? 'still' : '';
  }

  function loadActive() {
    return fetch('/pets/active').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (d) { active = d; document.title = d.name || '桌面宠物'; }
    }).catch(function () {});
  }

  // --- drag (moves the Electron window via -webkit-app-region) ------------
  try {
    var saved = JSON.parse(localStorage.getItem('dsh-pet-pos') || 'null');
    if (saved) { pet.style.left = saved.x + 'px'; pet.style.top = saved.y + 'px'; pet.style.right = 'auto'; pet.style.bottom = 'auto'; }
  } catch (e) {}

  var dragging = null;
  pet.addEventListener('mousedown', function (e) {
    e.preventDefault();
    var rect = pet.getBoundingClientRect();
    dragging = { offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top, last: null };
  });
  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    var x = Math.max(0, Math.min(e.clientX - dragging.offsetX, window.innerWidth - 90));
    var y = Math.max(0, Math.min(e.clientY - dragging.offsetY, window.innerHeight - 110));
    pet.style.left = x + 'px'; pet.style.top = y + 'px'; pet.style.right = 'auto'; pet.style.bottom = 'auto';
    dragging.last = { x: x, y: y };
  });
  window.addEventListener('mouseup', function () {
    if (dragging && dragging.last) { try { localStorage.setItem('dsh-pet-pos', JSON.stringify(dragging.last)); } catch (e) {} }
    dragging = null;
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
      render(expr, (demo ? '演示 · ' : '预览 · ') + (LABELS[expr] || expr));
      return;
    }
    fetch('/settings-pro/pets').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return;
      render(expressionFor(d), statusText(d));
    }).catch(function () {});
  }

  loadActive().then(load);
  setInterval(load, demo ? 2000 : 5000);
})();
</script>
</body>
</html>
`;
