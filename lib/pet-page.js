/** Standalone desktop-pet page served at /pet — a lively yellow duck with expressions. */
export const PET_PAGE = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>大黄鸭</title>
<style>
  html, body { margin: 0; padding: 0; background: transparent; height: 100%; overflow: hidden; font-family: system-ui, -apple-system, sans-serif; }
  #pet { position: fixed; right: 12px; bottom: 12px; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: grab; user-select: none; z-index: 10; -webkit-user-select: none; -webkit-app-region: drag; }
  #bubble { background: rgba(255,255,255,.96); border: 1px solid #e2e2e2; border-radius: 10px; padding: 4px 10px; font-size: 12px; line-height: 16px; color: #333; box-shadow: 0 2px 8px rgba(0,0,0,.15); white-space: nowrap; }
  #body { position: relative; width: 84px; height: 84px; display: flex; align-items: center; justify-content: center; animation: bob 2.8s ease-in-out infinite; }
  #body.still { animation: none; }
  #body svg { display: block; filter: drop-shadow(0 3px 5px rgba(0,0,0,.18)); }
  #deco { position: absolute; top: -6px; right: -8px; font-size: 20px; line-height: 1; text-shadow: 0 1px 2px rgba(0,0,0,.15); }
  @keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
</style>
</head>
<body>
<div id="pet">
  <div id="bubble">连接中…</div>
  <div id="body"><span id="deco"></span></div>
</div>
<script>
(function () {
  var pet = document.getElementById('pet');
  var bubble = document.getElementById('bubble');
  var body = document.getElementById('body');
  var deco = document.getElementById('deco');

  // --- Yellow duck, four expressions --------------------------------------
  var FACE = {
    idle: {
      eyes: '<circle cx="25" cy="17" r="4.6" fill="#fff" stroke="#E8A800" stroke-width="0.8"/><circle cx="25" cy="17" r="2.3" fill="#3A2400"/><circle cx="26.2" cy="15.8" r="0.9" fill="#fff"/><circle cx="39" cy="17" r="4.6" fill="#fff" stroke="#E8A800" stroke-width="0.8"/><circle cx="39" cy="17" r="2.3" fill="#3A2400"/><circle cx="40.2" cy="15.8" r="0.9" fill="#fff"/>',
      mouth: '<path d="M28 32 Q32 35.5 36 32" stroke="#8A4A00" stroke-width="2" fill="none" stroke-linecap="round"/>'
    },
    working: {
      eyes: '<line x1="21" y1="17" x2="29" y2="17" stroke="#3A2400" stroke-width="2.4" stroke-linecap="round"/><line x1="35" y1="17" x2="43" y2="17" stroke="#3A2400" stroke-width="2.4" stroke-linecap="round"/>',
      mouth: '<line x1="29" y1="32" x2="35" y2="32" stroke="#8A4A00" stroke-width="2" stroke-linecap="round"/>'
    },
    paused: {
      eyes: '<path d="M21 17 Q25 20 29 17" stroke="#3A2400" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M35 17 Q39 20 43 17" stroke="#3A2400" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
      mouth: '<circle cx="32" cy="32" r="2.3" fill="none" stroke="#8A4A00" stroke-width="2"/>'
    },
    goal: {
      eyes: '<circle cx="25" cy="16" r="5.6" fill="#fff" stroke="#E8A800" stroke-width="0.8"/><circle cx="25" cy="16" r="3" fill="#3A2400"/><circle cx="26.6" cy="14.4" r="1.1" fill="#fff"/><circle cx="39" cy="16" r="5.6" fill="#fff" stroke="#E8A800" stroke-width="0.8"/><circle cx="39" cy="16" r="3" fill="#3A2400"/><circle cx="40.6" cy="14.4" r="1.1" fill="#fff"/>',
      mouth: '<path d="M27 30 Q32 39 37 30 Q32 33 27 30 Z" fill="#B33A3A" stroke="#8A4A00" stroke-width="1.4"/>'
    }
  };

  var DECO = { idle: '', working: '💦', goal: '✨', paused: '💤' };

  function duckSvg(expr) {
    var f = FACE[expr] || FACE.idle;
    return '<svg width="84" height="84" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
      '<radialGradient id="g" cx="42%" cy="30%" r="78%">' +
      '<stop offset="0%" stop-color="#FFF3A8"/><stop offset="52%" stop-color="#FFD23F"/><stop offset="100%" stop-color="#F5B400"/>' +
      '</radialGradient>' +
      '<linearGradient id="belly" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#FFF0A0" stop-opacity="0"/><stop offset="100%" stop-color="#FFF0A0" stop-opacity=".7"/>' +
      '</linearGradient>' +
      '</defs>' +
      '<ellipse cx="32" cy="60" rx="20" ry="4.2" fill="rgba(0,0,0,.12)"/>' +
      '<ellipse cx="14" cy="47" rx="5" ry="9" fill="#FFD23F" stroke="#E0A400" stroke-width="1.4" transform="rotate(-18 14 47)"/>' +
      '<ellipse cx="50" cy="47" rx="5" ry="9" fill="#FFD23F" stroke="#E0A400" stroke-width="1.4" transform="rotate(18 50 47)"/>' +
      '<ellipse cx="32" cy="45" rx="22" ry="15" fill="url(#g)" stroke="#E0A400" stroke-width="1.8"/>' +
      '<ellipse cx="32" cy="50" rx="14" ry="7.5" fill="url(#belly)"/>' +
      '<circle cx="32" cy="21" r="15" fill="url(#g)" stroke="#E0A400" stroke-width="1.8"/>' +
      '<ellipse cx="24" cy="13" rx="4" ry="2.4" fill="#fff" opacity=".55" transform="rotate(-24 24 13)"/>' +
      '<path d="M32 7 Q29 1 25 3 Q28 5 27 8 Z" fill="#FFD23F" stroke="#E0A400" stroke-width="1.4"/>' +
      '<path d="M25 26 Q32 21 39 26 Q39 33 32 34 Q25 33 25 26 Z" fill="#F5A623" stroke="#D98E00" stroke-width="1.4"/>' +
      '<ellipse cx="32" cy="27.6" rx="1.1" ry="1.5" fill="#C77A00" opacity=".65"/>' +
      '<ellipse cx="28" cy="29.5" rx="2.8" ry="1.3" fill="#FFC95E"/>' +
      '<ellipse cx="21" cy="31" rx="3.6" ry="2.3" fill="#FF8FA3" opacity=".5"/>' +
      '<ellipse cx="43" cy="31" rx="3.6" ry="2.3" fill="#FF8FA3" opacity=".5"/>' +
      f.eyes + f.mouth +
      '</svg>';
  }

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

  function render(expr, text) {
    bubble.textContent = text;
    body.innerHTML = duckSvg(expr);
    deco.textContent = DECO[expr] || '';
    body.className = expr === 'paused' ? 'still' : '';
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
  var demoOrder = ['idle', 'working', 'goal', 'paused'];
  var demoIdx = 0;
  var LABELS = { idle: '监控中', working: '进行中', goal: '有目标', paused: '已暂停' };

  function load() {
    if (forceState || demo) {
      var expr;
      if (forceState) expr = forceState;
      else { expr = demoOrder[demoIdx % demoOrder.length]; demoIdx++; }
      render(expr, (demo ? '演示 · ' : '预览 · ') + (LABELS[expr] || expr));
      return;
    }
    fetch('/settings-pro/pets').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return;
      render(expressionFor(d), statusText(d));
    }).catch(function () {});
  }
  load();
  setInterval(load, demo ? 2000 : 5000);
})();
</script>
</body>
</html>
`;
