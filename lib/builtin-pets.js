/**
 * The three default pets shipped with the plugin. Each is a self-contained SVG
 * (no binary assets needed) with four expression states matching the monitor's
 * states: idle / working / goal / paused. User-uploaded pets use image files
 * (GIF/PNG/WebP) instead, but the manifest shape is identical.
 */

/** Duck — the original yellow duck, refactored out of the pet page. */
function duckSvg(expr) {
  const faces = {
    idle: {
      eyes: '<circle cx="25" cy="17" r="4.6" fill="#fff" stroke="#E8A800" stroke-width="0.8"/><circle cx="25" cy="17" r="2.3" fill="#3A2400"/><circle cx="26.2" cy="15.8" r="0.9" fill="#fff"/><circle cx="39" cy="17" r="4.6" fill="#fff" stroke="#E8A800" stroke-width="0.8"/><circle cx="39" cy="17" r="2.3" fill="#3A2400"/><circle cx="40.2" cy="15.8" r="0.9" fill="#fff"/>',
      mouth: '<path d="M28 32 Q32 35.5 36 32" stroke="#8A4A00" stroke-width="2" fill="none" stroke-linecap="round"/>',
    },
    working: {
      eyes: '<line x1="21" y1="17" x2="29" y2="17" stroke="#3A2400" stroke-width="2.4" stroke-linecap="round"/><line x1="35" y1="17" x2="43" y2="17" stroke="#3A2400" stroke-width="2.4" stroke-linecap="round"/>',
      mouth: '<line x1="29" y1="32" x2="35" y2="32" stroke="#8A4A00" stroke-width="2" stroke-linecap="round"/>',
    },
    goal: {
      eyes: '<circle cx="25" cy="16" r="5.6" fill="#fff" stroke="#E8A800" stroke-width="0.8"/><circle cx="25" cy="16" r="3" fill="#3A2400"/><circle cx="26.6" cy="14.4" r="1.1" fill="#fff"/><circle cx="39" cy="16" r="5.6" fill="#fff" stroke="#E8A800" stroke-width="0.8"/><circle cx="39" cy="16" r="3" fill="#3A2400"/><circle cx="40.6" cy="14.4" r="1.1" fill="#fff"/>',
      mouth: '<path d="M27 30 Q32 39 37 30 Q32 33 27 30 Z" fill="#B33A3A" stroke="#8A4A00" stroke-width="1.4"/>',
    },
    paused: {
      eyes: '<path d="M21 17 Q25 20 29 17" stroke="#3A2400" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M35 17 Q39 20 43 17" stroke="#3A2400" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
      mouth: '<circle cx="32" cy="32" r="2.3" fill="none" stroke="#8A4A00" stroke-width="2"/>',
    },
  };
  const f = faces[expr] || faces.idle;
  return '<svg width="84" height="84" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><radialGradient id="g" cx="42%" cy="30%" r="78%"><stop offset="0%" stop-color="#FFF3A8"/><stop offset="52%" stop-color="#FFD23F"/><stop offset="100%" stop-color="#F5B400"/></radialGradient>' +
    '<linearGradient id="belly" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FFF0A0" stop-opacity="0"/><stop offset="100%" stop-color="#FFF0A0" stop-opacity=".7"/></linearGradient></defs>' +
    '<ellipse cx="32" cy="60" rx="20" ry="4.2" fill="rgba(0,0,0,.12)"/>' +
    '<ellipse cx="14" cy="47" rx="5" ry="9" fill="#FFD23F" stroke="#E0A400" stroke-width="1.4" transform="rotate(-18 14 47)"/>' +
    '<ellipse cx="50" cy="47" rx="5" ry="9" fill="#FFD23F" stroke="#E0A400" stroke-width="1.4" transform="rotate(18 50 47)"/>' +
    '<ellipse cx="32" cy="45" rx="22" ry="15" fill="url(#g)" stroke="#E0A400" stroke-width="1.8"/>' +
    '<ellipse cx="32" cy="50" rx="14" ry="7.5" fill="url(#belly)"/>' +
    '<circle cx="32" cy="21" r="15" fill="url(#g)" stroke="#E0A400" stroke-width="1.8"/>' +
    '<ellipse cx="24" cy="13" rx="4" ry="2.4" fill="#fff" opacity=".55" transform="rotate(-24 24 13)"/>' +
    '<path d="M32 7 Q29 1 25 3 Q28 5 27 8 Z" fill="#FFD23F" stroke="#E0A400" stroke-width="1.4"/>' +
    '<path d="M25 26 Q32 21 39 26 Q39 33 32 34 Q25 33 25 26 Z" fill="#F5A623" stroke="#D98E00" stroke-width="1.4"/>' +
    f.eyes + f.mouth +
    '</svg>';
}

/** Cat — orange tabby with pointy ears and whiskers. */
function catSvg(expr) {
  const faces = {
    idle: {
      eyes: '<circle cx="25" cy="19" r="3.4" fill="#4A2A00"/><circle cx="26" cy="18" r="1.1" fill="#fff"/><circle cx="39" cy="19" r="3.4" fill="#4A2A00"/><circle cx="40" cy="18" r="1.1" fill="#fff"/>',
      mouth: '<path d="M28 30 Q32 33 36 30" stroke="#7A3A00" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
    },
    working: {
      eyes: '<line x1="21" y1="19" x2="29" y2="19" stroke="#4A2A00" stroke-width="2.4" stroke-linecap="round"/><line x1="35" y1="19" x2="43" y2="19" stroke="#4A2A00" stroke-width="2.4" stroke-linecap="round"/>',
      mouth: '<line x1="29" y1="30" x2="35" y2="30" stroke="#7A3A00" stroke-width="1.8" stroke-linecap="round"/>',
    },
    goal: {
      eyes: '<circle cx="25" cy="18" r="5" fill="#4A2A00"/><circle cx="26.6" cy="16.4" r="1.4" fill="#fff"/><circle cx="39" cy="18" r="5" fill="#4A2A00"/><circle cx="40.6" cy="16.4" r="1.4" fill="#fff"/>',
      mouth: '<path d="M27 29 Q32 37 37 29 Q32 31 27 29 Z" fill="#C0392B" stroke="#7A3A00" stroke-width="1.2"/>',
    },
    paused: {
      eyes: '<path d="M21 19 Q25 22 29 19" stroke="#4A2A00" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M35 19 Q39 22 43 19" stroke="#4A2A00" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
      mouth: '<circle cx="32" cy="30" r="2.2" fill="none" stroke="#7A3A00" stroke-width="1.8"/>',
    },
  };
  const f = faces[expr] || faces.idle;
  return '<svg width="84" height="84" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><radialGradient id="g" cx="42%" cy="30%" r="78%"><stop offset="0%" stop-color="#FFD8A8"/><stop offset="55%" stop-color="#F5A623"/><stop offset="100%" stop-color="#E08A00"/></radialGradient></defs>' +
    '<ellipse cx="32" cy="60" rx="20" ry="4.2" fill="rgba(0,0,0,.12)"/>' +
    '<path d="M13 20 L9 4 L22 12 Z" fill="#F5A623" stroke="#E08A00" stroke-width="1.4"/>' +
    '<path d="M51 20 L55 4 L42 12 Z" fill="#F5A623" stroke="#E08A00" stroke-width="1.4"/>' +
    '<ellipse cx="32" cy="46" rx="22" ry="15" fill="url(#g)" stroke="#E08A00" stroke-width="1.8"/>' +
    '<circle cx="32" cy="22" r="16" fill="url(#g)" stroke="#E08A00" stroke-width="1.8"/>' +
    '<path d="M12 26 Q6 25 7 20 M12 30 Q6 30 7 34" stroke="#E08A00" stroke-width="1.2" fill="none"/>' +
    '<path d="M52 26 Q58 25 57 20 M52 30 Q58 30 57 34" stroke="#E08A00" stroke-width="1.2" fill="none"/>' +
    '<path d="M28 27 L32 29 L32 27 L36 29 L32 27" fill="#FF8FA3"/>' +
    f.eyes + f.mouth +
    '</svg>';
}

/** Dog — tan pup with floppy ears. */
function dogSvg(expr) {
  const faces = {
    idle: {
      eyes: '<circle cx="24" cy="18" r="3.2" fill="#3A2400"/><circle cx="25" cy="17" r="1" fill="#fff"/><circle cx="40" cy="18" r="3.2" fill="#3A2400"/><circle cx="41" cy="17" r="1" fill="#fff"/>',
      mouth: '<path d="M26 28 Q32 34 38 28 Q32 30 26 28 Z" fill="#B33A3A"/>',
    },
    working: {
      eyes: '<line x1="20" y1="18" x2="28" y2="18" stroke="#3A2400" stroke-width="2.4" stroke-linecap="round"/><line x1="36" y1="18" x2="44" y2="18" stroke="#3A2400" stroke-width="2.4" stroke-linecap="round"/>',
      mouth: '<line x1="28" y1="29" x2="36" y2="29" stroke="#7A3A00" stroke-width="2" stroke-linecap="round"/>',
    },
    goal: {
      eyes: '<circle cx="24" cy="17" r="4.6" fill="#3A2400"/><circle cx="25.5" cy="15.6" r="1.3" fill="#fff"/><circle cx="40" cy="17" r="4.6" fill="#3A2400"/><circle cx="41.5" cy="15.6" r="1.3" fill="#fff"/>',
      mouth: '<path d="M25 27 Q32 37 39 27 Q32 31 25 27 Z" fill="#B33A3A"/>',
    },
    paused: {
      eyes: '<path d="M20 18 Q24 21 28 18" stroke="#3A2400" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M36 18 Q40 21 44 18" stroke="#3A2400" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
      mouth: '<circle cx="32" cy="29" r="2.2" fill="none" stroke="#7A3A00" stroke-width="1.8"/>',
    },
  };
  const f = faces[expr] || faces.idle;
  return '<svg width="84" height="84" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><radialGradient id="g" cx="42%" cy="30%" r="78%"><stop offset="0%" stop-color="#E8C88F"/><stop offset="55%" stop-color="#C8893E"/><stop offset="100%" stop-color="#A9682A"/></radialGradient></defs>' +
    '<ellipse cx="32" cy="60" rx="20" ry="4.2" fill="rgba(0,0,0,.12)"/>' +
    '<ellipse cx="9" cy="24" rx="5.5" ry="12" fill="#A9682A" stroke="#8A5220" stroke-width="1.4" transform="rotate(18 9 24)"/>' +
    '<ellipse cx="55" cy="24" rx="5.5" ry="12" fill="#A9682A" stroke="#8A5220" stroke-width="1.4" transform="rotate(-18 55 24)"/>' +
    '<ellipse cx="32" cy="46" rx="22" ry="15" fill="url(#g)" stroke="#8A5220" stroke-width="1.8"/>' +
    '<circle cx="32" cy="22" r="16" fill="url(#g)" stroke="#8A5220" stroke-width="1.8"/>' +
    '<ellipse cx="32" cy="26" rx="7" ry="5" fill="#F5DEB3"/>' +
    '<path d="M32 31 L32 39 Q32 43 26 43 Q24 43 24 41" stroke="#8A5220" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
    f.eyes + f.mouth +
    '</svg>';
}

export const BUILTIN_PETS = [
  {
    id: "duck",
    name: "大黄鸭",
    source: "builtin",
    states: {
      idle: { kind: "svg", value: duckSvg("idle") },
      working: { kind: "svg", value: duckSvg("working") },
      goal: { kind: "svg", value: duckSvg("goal") },
      paused: { kind: "svg", value: duckSvg("paused") },
    },
  },
  {
    id: "cat",
    name: "小猫咪",
    source: "builtin",
    states: {
      idle: { kind: "svg", value: catSvg("idle") },
      working: { kind: "svg", value: catSvg("working") },
      goal: { kind: "svg", value: catSvg("goal") },
      paused: { kind: "svg", value: catSvg("paused") },
    },
  },
  {
    id: "dog",
    name: "小黄狗",
    source: "builtin",
    states: {
      idle: { kind: "svg", value: dogSvg("idle") },
      working: { kind: "svg", value: dogSvg("working") },
      goal: { kind: "svg", value: dogSvg("goal") },
      paused: { kind: "svg", value: dogSvg("paused") },
    },
  },
];
