'use strict';

/* ============================================================
   ONLINE DICE — vanilla JS clone
   ============================================================ */

/* ---------- CONFIG ---------- */
const COLORS = [
  { id:'red',    label:'Red',    hex:'#e74c3c' },
  { id:'orange', label:'Orange', hex:'#e67e22' },
  { id:'yellow', label:'Yellow', hex:'#f0c000' },
  { id:'green',  label:'Green',  hex:'#27ae60' },
  { id:'blue',   label:'Blue',   hex:'#2980b9' },
  { id:'purple', label:'Purple', hex:'#8e44ad' },
];
const COLOR_MAP = Object.fromEntries(COLORS.map(c => [c.id, c]));

const DIE_FACES = { d4:4, d6:6, d8:8, d10:10, d12:12, d20:20 };

const HISTORY_MAX = 20;
const HISTORY_SAVE_MAX_DICE = 6;
const ANIM_DURATION = 700;
const ANIM_TICK     = 75;

const THEME_CSS = {
  blue:   'https://www.online-dice.com/css/style.php',
  green:  'https://www.online-dice.com/css/green.php',
  red:    'https://www.online-dice.com/css/red.php',
  bw:     'https://www.online-dice.com/css/bw.php',
};

/* ---------- STATE ---------- */
let numDice    = 1;
let diceType   = 'd6';
let theme      = 'blue';
let isRolling  = false;
let rollHistory = [];

let overrideMode    = false;
let overrideWeights = { red:17, orange:17, yellow:17, green:17, blue:16, purple:16 };
let overrideAlways  = '';
let overrideNever   = '';
let overrideForce   = '';
let overrideForcePip = '';

let cornerClicks = 0;
let cornerTimer  = null;

/* ---------- ENTRY ---------- */
document.addEventListener('DOMContentLoaded', () => {
  loadPersisted();
  buildNumSelect();
  initSelects();
  initRollButton();
  initLoader();
  initAdminPanel();
  renderHistory();
  performRoll(false);
});

/* ---------- PERSIST ---------- */
function loadPersisted() {
  try {
    const h = localStorage.getItem('od_history');
    if (h) rollHistory = JSON.parse(h);
  } catch (_) {}
  try {
    const s = localStorage.getItem('od_settings');
    if (s) {
      const p = JSON.parse(s);
      overrideMode    = !!p.overrideMode;
      overrideWeights = p.weights || overrideWeights;
      overrideAlways  = p.always  || '';
      overrideNever   = p.never   || '';
      overrideForcePip = p.forcePip || '';
    }
  } catch (_) {}
  try {
    const t = localStorage.getItem('od_theme');
    if (t && THEME_CSS[t]) { theme = t; setTheme(t); }
  } catch (_) {}
}
function saveSettings() {
  try {
    localStorage.setItem('od_settings', JSON.stringify({
      overrideMode, weights: overrideWeights,
      always: overrideAlways, never: overrideNever,
      forcePip: overrideForcePip,
    }));
  } catch (_) {}
}
function saveHistory() {
  try { localStorage.setItem('od_history', JSON.stringify(rollHistory)); } catch (_) {}
}

/* ---------- LOADER ---------- */
function initLoader() {
  let counter = 1;
  const loaderDieIcon = document.querySelector('.loader-dice i');
  const tick = setInterval(() => {
    if (loaderDieIcon) {
      loaderDieIcon.className = `df-solid-small-dot-d6-${counter} rounded-dice`;
    }
    counter = counter === 6 ? 1 : counter + 1;
  }, 75);

  setTimeout(() => {
    clearInterval(tick);
    const titleEl = document.querySelector('.loader-title');
    const diceEl  = document.querySelector('.loader-dice');
    const loader  = document.querySelector('.loader');
    if (titleEl) titleEl.style.display = 'none';
    if (diceEl)  diceEl.style.visibility = 'hidden';
    if (loader)  loader.classList.add('hide');
  }, 1250);
}

/* ---------- SELECTS ---------- */
function buildNumSelect() {
  const sel = document.getElementById('num-select');
  for (let i = 1; i <= 100; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i === 1 ? '1 die' : `${i} dice`;
    if (i === numDice) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    numDice = parseInt(sel.value, 10);
    performRoll(true);
  });
}

function initSelects() {
  const typeSel = document.getElementById('type-select');
  typeSel.value = diceType;
  typeSel.addEventListener('change', () => {
    diceType = typeSel.value;
    performRoll(true);
  });

  const themeSel = document.getElementById('theme-select');
  themeSel.addEventListener('change', () => {
    const t = themeSel.value;
    if (THEME_CSS[t]) {
      theme = t;
      setTheme(t);
      try { localStorage.setItem('od_theme', t); } catch (_) {}
    }
  });
}

function setTheme(t) {
  const link = document.getElementById('theme-css');
  if (link) link.href = THEME_CSS[t];
}

/* ---------- ROLL LOGIC ---------- */
function rollOnePip(maxFace) {
  // pick uniform 1..maxFace, optionally forced
  if (overrideMode && overrideForcePip && diceType === 'd6') {
    const p = parseInt(overrideForcePip, 10);
    if (p >= 1 && p <= 6) return p;
  }
  return Math.floor(Math.random() * maxFace) + 1;
}

function pickColor() {
  if (!overrideMode) return COLORS[Math.floor(Math.random() * COLORS.length)];
  const pool = COLORS.filter(c => c.id !== overrideNever);
  if (!pool.length) return COLORS[Math.floor(Math.random() * COLORS.length)];
  const total = pool.reduce((s, c) => s + (overrideWeights[c.id] || 0), 0);
  if (total <= 0) return pool[Math.floor(Math.random() * pool.length)];
  let r = Math.random() * total;
  for (const c of pool) {
    r -= (overrideWeights[c.id] || 0);
    if (r <= 0) return c;
  }
  return pool[pool.length - 1];
}

function buildResults(n) {
  if (diceType === 'color-dice') {
    // Forced-roll list
    if (overrideMode && overrideForce.trim()) {
      const forced = overrideForce.split(',').map(s => s.trim().toLowerCase())
        .map(id => COLOR_MAP[id]).filter(Boolean);
      overrideForce = '';
      const fi = document.getElementById('force-roll-input');
      if (fi) fi.value = '';
      while (forced.length < n) forced.push(pickColor());
      return forced.slice(0, n).map(c => ({ type:'color', color:c }));
    }
    const results = Array.from({ length:n }, () => pickColor());
    if (overrideMode && overrideAlways && COLOR_MAP[overrideAlways]) {
      if (!results.some(c => c.id === overrideAlways)) {
        results[Math.floor(Math.random() * results.length)] = COLOR_MAP[overrideAlways];
      }
    }
    return results.map(c => ({ type:'color', color:c }));
  }

  // Numeric dice (d4..d20)
  const maxFace = DIE_FACES[diceType] || 6;

  // Forced-roll list for pips
  if (overrideMode && overrideForce.trim()) {
    const forced = overrideForce.split(',').map(s => parseInt(s.trim(), 10))
      .filter(v => v >= 1 && v <= maxFace);
    overrideForce = '';
    const fi = document.getElementById('force-roll-input');
    if (fi) fi.value = '';
    while (forced.length < n) forced.push(rollOnePip(maxFace));
    return forced.slice(0, n).map(p => ({ type:'pip', pip:p }));
  }

  return Array.from({ length:n }, () => ({ type:'pip', pip: rollOnePip(maxFace) }));
}

/* ---------- ROLL + ANIMATION ---------- */
function initRollButton() {
  document.getElementById('roll-button').addEventListener('click', e => {
    e.preventDefault();
    performRoll(true);
  });
}

function performRoll(animate) {
  if (isRolling) return;
  const results = buildResults(numDice);

  if (!animate) {
    paintDice(results);
    recordRoll(results);
    return;
  }

  isRolling = true;
  const btn = document.getElementById('roll-button');
  if (btn) btn.style.pointerEvents = 'none';

  runShuffleAnimation(results, () => {
    isRolling = false;
    if (btn) btn.style.pointerEvents = '';
    recordRoll(results);
    checkConfetti(results);
  });
}

function runShuffleAnimation(finalResults, onDone) {
  const tabletop = document.getElementById('tabletop');
  let elapsed = 0;
  const tick = setInterval(() => {
    tabletop.innerHTML = '';
    finalResults.forEach(r => {
      if (r.type === 'color') {
        const rand = COLORS[Math.floor(Math.random() * COLORS.length)];
        tabletop.appendChild(makeDieEl({ type:'color', color: rand }));
      } else {
        const rand = Math.floor(Math.random() * (DIE_FACES[diceType] || 6)) + 1;
        tabletop.appendChild(makeDieEl({ type:'pip', pip: rand }));
      }
    });
    elapsed += ANIM_TICK;
    if (elapsed >= ANIM_DURATION) {
      clearInterval(tick);
      paintDice(finalResults);
      onDone();
    }
  }, ANIM_TICK);
}

function paintDice(results) {
  const tabletop = document.getElementById('tabletop');
  tabletop.innerHTML = '';
  results.forEach(r => tabletop.appendChild(makeDieEl(r)));
}

function makeDieEl(r) {
  // Use online-dice.com's dicefont icons via class names
  const wrapper = document.createElement('div');
  wrapper.className = 'dice-wrapper size-100 rounded-dice';

  const i = document.createElement('i');
  if (r.type === 'color') {
    i.className = 'df-solid-small-dot-d6-1';
    i.style.color = r.color.hex + '!important';
    i.style.setProperty('color', r.color.hex, 'important');
    wrapper.style.setProperty('background', '#fff', 'important');
  } else {
    const type = diceType.replace('color-dice', 'd6');
    i.className = `df-solid-small-dot-${type}-${r.pip}`;
  }
  wrapper.appendChild(i);
  return wrapper;
}

/* ---------- HISTORY ---------- */
function recordRoll(results) {
  rollHistory.unshift(results.map(r =>
    r.type === 'color' ? { c: r.color.id } : { p: r.pip, t: diceType }
  ));
  if (rollHistory.length > HISTORY_MAX) rollHistory.length = HISTORY_MAX;
  if (numDice <= HISTORY_SAVE_MAX_DICE) saveHistory();
  renderHistory();
}

function renderHistory() {
  const container = document.getElementById('roll-history');
  if (!container) return;
  if (!rollHistory.length) {
    container.innerHTML = '<p>No rolls yet — roll the dice to get started!</p>';
    return;
  }

  const frag = document.createDocumentFragment();
  rollHistory.forEach((roll, idx) => {
    const row = document.createElement('div');
    row.className = 'cd-history-row';

    const num = document.createElement('div');
    num.className = 'cd-history-num';
    num.textContent = `${idx + 1}.`;
    row.appendChild(num);

    roll.forEach(item => {
      const die = document.createElement('div');
      die.className = 'dice-wrapper cd-history-die';

      const i = document.createElement('i');
      if (item.c) {
        const color = COLOR_MAP[item.c];
        i.className = 'df-solid-small-dot-d6-1';
        i.style.animation = 'none';
        i.style.setProperty('color', color.hex, 'important');
        die.style.setProperty('background', '#fff', 'important');
      } else {
        const t = item.t || 'd6';
        i.className = `df-solid-small-dot-${t}-${item.p}`;
        i.style.animation = 'none';
      }
      die.appendChild(i);
      row.appendChild(die);
    });

    frag.appendChild(row);
  });

  container.innerHTML = '';
  container.appendChild(frag);

  const note = document.createElement('p');
  note.style.fontSize = '0.8rem';
  note.style.opacity = '0.7';
  note.style.marginTop = '6px';
  note.textContent = 'Please note: only dice rolls with up to 6 dice are saved.';
  container.appendChild(note);
}

/* ---------- CONFETTI ---------- */
let confettiRAF = null;
let confettiParticles = [];

function checkConfetti(results) {
  if (results.length < 2) return;
  const same = results.every(r => {
    if (r.type === 'color') return r.color.id === results[0].color?.id;
    return r.pip === results[0].pip;
  });
  if (same) setTimeout(launchConfetti, 450);
}

function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  confettiParticles = [];
  for (let i = 0; i < 160; i++) {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    confettiParticles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * 0.5 - canvas.height * 0.5,
      w: Math.random() * 10 + 5,
      h: Math.random() * 5 + 3,
      color: color.hex,
      rot: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 6,
      vy: Math.random() * 3.5 + 1.8,
      vx: (Math.random() - 0.5) * 1.5,
      life: 1,
      decay: Math.random() * 0.008 + 0.004,
    });
  }
  cancelAnimationFrame(confettiRAF);
  drawConfetti(ctx, canvas);
}

function drawConfetti(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  confettiParticles = confettiParticles.filter(p => p.life > 0);
  confettiParticles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.life;
    ctx.translate(p.x + p.w/2, p.y + p.h/2);
    ctx.rotate((p.rot * Math.PI) / 180);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
    ctx.restore();
    p.x += p.vx; p.y += p.vy;
    p.rot += p.rotSpeed; p.life -= p.decay;
  });
  if (confettiParticles.length > 0) {
    confettiRAF = requestAnimationFrame(() => drawConfetti(ctx, canvas));
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

/* ---------- HIDDEN ADMIN PANEL ---------- */
function initAdminPanel() {
  const overlay    = document.getElementById('ctrl-overlay');
  const closeBtn   = document.getElementById('ctrl-close');
  const toggle     = document.getElementById('rigged-toggle');
  const optsDiv    = document.getElementById('override-opts');
  const btnNatural = document.getElementById('btn-natural');
  const btnSave    = document.getElementById('btn-save');
  const corner     = document.getElementById('corner-spot');

  syncFormToState();

  corner.addEventListener('click', () => {
    cornerClicks++;
    clearTimeout(cornerTimer);
    cornerTimer = setTimeout(() => { cornerClicks = 0; }, 2000);
    if (cornerClicks >= 5) { cornerClicks = 0; openPanel(); }
  });

  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      e.preventDefault();
      togglePanel();
    }
  });

  closeBtn.addEventListener('click', closePanel);

  toggle.addEventListener('change', () => {
    overrideMode = toggle.checked;
    optsDiv.style.display = overrideMode ? 'block' : 'none';
  });

  btnNatural.addEventListener('click', () => {
    overrideMode    = false;
    overrideWeights = { red:17, orange:17, yellow:17, green:17, blue:16, purple:16 };
    overrideAlways  = '';
    overrideNever   = '';
    overrideForce   = '';
    overrideForcePip = '';
    try { localStorage.removeItem('od_settings'); } catch (_) {}
    syncFormToState();
    btnNatural.textContent = '✓ Reset Done';
    setTimeout(() => { btnNatural.textContent = '✓ Natural Mode'; }, 1400);
  });

  btnSave.addEventListener('click', () => {
    ['red','orange','yellow','green','blue','purple'].forEach(id => {
      const el = document.getElementById(`w-${id}`);
      if (el) overrideWeights[id] = Math.max(0, parseInt(el.value, 10) || 0);
    });
    overrideAlways  = document.getElementById('sel-always').value;
    overrideNever   = document.getElementById('sel-never').value;
    overrideForce   = document.getElementById('force-roll-input').value;
    overrideForcePip = document.getElementById('sel-force-pip').value;
    overrideMode    = toggle.checked;
    saveSettings();
    btnSave.textContent = '✓ Saved';
    setTimeout(() => { btnSave.textContent = '💾 Save Settings'; }, 1400);
  });
}

function syncFormToState() {
  const toggle  = document.getElementById('rigged-toggle');
  const optsDiv = document.getElementById('override-opts');
  toggle.checked = overrideMode;
  optsDiv.style.display = overrideMode ? 'block' : 'none';
  ['red','orange','yellow','green','blue','purple'].forEach(id => {
    const el = document.getElementById(`w-${id}`);
    if (el) el.value = overrideWeights[id];
  });
  const sa = document.getElementById('sel-always');
  const sn = document.getElementById('sel-never');
  const sp = document.getElementById('sel-force-pip');
  if (sa) sa.value = overrideAlways;
  if (sn) sn.value = overrideNever;
  if (sp) sp.value = overrideForcePip;
}

function openPanel() {
  const o = document.getElementById('ctrl-overlay');
  o.classList.add('open');
  o.setAttribute('aria-hidden', 'false');
}
function closePanel() {
  const o = document.getElementById('ctrl-overlay');
  o.classList.remove('open');
  o.setAttribute('aria-hidden', 'true');
}
function togglePanel() {
  const o = document.getElementById('ctrl-overlay');
  o.classList.contains('open') ? closePanel() : openPanel();
}

/* ---------- RESIZE ---------- */
window.addEventListener('resize', () => {
  const c = document.getElementById('confetti-canvas');
  c.width = window.innerWidth;
  c.height = window.innerHeight;
});
