'use strict';

/* ─────────── CONFIG ─────────── */
const COLORS = [
  { id: 'red',    label: 'Red',    hex: '#e74c3c' },
  { id: 'orange', label: 'Orange', hex: '#e67e22' },
  { id: 'yellow', label: 'Yellow', hex: '#f0c000' },
  { id: 'green',  label: 'Green',  hex: '#27ae60' },
  { id: 'blue',   label: 'Blue',   hex: '#2980b9' },
  { id: 'purple', label: 'Purple', hex: '#8e44ad' },
];
const COLOR_MAP = Object.fromEntries(COLORS.map(c => [c.id, c]));

const LOADER_MESSAGES = [
  "What Color Will It Be?", "Rolling…", "Color Me Surprised!",
  "Let's Roll!", "Feeling Lucky?", "Fingers Crossed…",
  "Good Luck!", "Amazing!", "Let's Go!",
];

const HISTORY_MAX           = 20;
const HISTORY_SAVE_MAX_DICE = 6;
const ANIM_SHUFFLE_DURATION = 640;
const ANIM_SHUFFLE_INTERVAL = 75;

/* ─────────── STATE ─────────── */
let numDice     = 4;
let isRolling   = false;
let rollHistory = [];
let currentTheme = 'blue';

let overrideMode    = false;
let overrideWeights = { red:17, orange:17, yellow:17, green:17, blue:16, purple:16 };
let overrideAlways  = '';
let overrideNever   = '';
let overrideForce   = '';

let cornerClicks = 0;
let cornerTimer  = null;

/* ─────────── ENTRY ─────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadPersistedState();
  buildNumSelect();
  initSelects();
  initLoader();
  initRollButton();
  initAdminPanel();
  renderHistory();
  performRoll(false, false);
});

/* ─────────── PERSIST ─────────── */
function loadPersistedState() {
  try {
    const h = localStorage.getItem('cd_history');
    if (h) rollHistory = JSON.parse(h);
  } catch (_) { rollHistory = []; }

  try {
    const s = localStorage.getItem('cd_settings');
    if (s) {
      const p = JSON.parse(s);
      overrideMode    = !!p.overrideMode;
      overrideWeights = p.weights || overrideWeights;
      overrideAlways  = p.always  || '';
      overrideNever   = p.never   || '';
    }
  } catch (_) {}

  try {
    const t = localStorage.getItem('cd_theme');
    if (t) {
      currentTheme = t;
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (_) {}
}
function saveAdminSettings() {
  try {
    localStorage.setItem('cd_settings', JSON.stringify({
      overrideMode, weights: overrideWeights,
      always: overrideAlways, never: overrideNever,
    }));
  } catch (_) {}
}
function saveHistory() {
  try { localStorage.setItem('cd_history', JSON.stringify(rollHistory)); } catch (_) {}
}

/* ─────────── LOADER ─────────── */
function initLoader() {
  const titleEl = document.getElementById('loader-title');
  const diceRow = document.getElementById('loader-dice-row');

  titleEl.textContent = LOADER_MESSAGES[Math.floor(Math.random() * LOADER_MESSAGES.length)];

  const count = Math.min(numDice, 6);
  for (let i = 0; i < count; i++) {
    const die = document.createElement('div');
    die.className = 'loader-die';
    const pip = document.createElement('div');
    pip.className = 'loader-die-pip';
    die.appendChild(pip);
    diceRow.appendChild(die);
  }

  setTimeout(() => {
    document.getElementById('loader').classList.add('hide');
  }, 1250);
}

/* ─────────── SELECTS ─────────── */
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
    performRoll(true, true);
  });
}

function initSelects() {
  const themeSel = document.getElementById('theme-select');
  themeSel.value = currentTheme;
  themeSel.addEventListener('change', () => {
    currentTheme = themeSel.value;
    document.documentElement.setAttribute('data-theme', currentTheme);
    try { localStorage.setItem('cd_theme', currentTheme); } catch (_) {}
  });

  const typeSel = document.getElementById('type-select');
  typeSel.addEventListener('change', () => {
    typeSel.value = 'color-dice';
  });
}

/* ─────────── ROLL LOGIC ─────────── */
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
  if (overrideMode && overrideForce.trim()) {
    const forced = overrideForce
      .split(',')
      .map(s => s.trim().toLowerCase())
      .map(id => COLOR_MAP[id])
      .filter(Boolean);

    overrideForce = '';
    const fi = document.getElementById('force-roll-input');
    if (fi) fi.value = '';

    while (forced.length < n) forced.push(pickColor());
    return forced.slice(0, n);
  }

  const results = Array.from({ length: n }, () => pickColor());

  if (overrideMode && overrideAlways && COLOR_MAP[overrideAlways]) {
    if (!results.some(c => c.id === overrideAlways)) {
      results[Math.floor(Math.random() * results.length)] = COLOR_MAP[overrideAlways];
    }
  }

  return results;
}

/* ─────────── ROLL + ANIMATION ─────────── */
function initRollButton() {
  document.getElementById('roll-button').addEventListener('click', () => {
    performRoll(true, true);
  });
}

function performRoll(animate, withSound) {
  if (isRolling) return;
  const results = buildResults(numDice);

  if (animate) {
    isRolling = true;
    document.getElementById('roll-button').disabled = true;
    if (withSound) playRollSound();
    runShuffleAnimation(results, () => {
      isRolling = false;
      document.getElementById('roll-button').disabled = false;
      recordRoll(results);
      checkConfetti(results);
    });
  } else {
    paintDice(results, false);
    recordRoll(results);
  }
}

function runShuffleAnimation(finalResults, onDone) {
  const tabletop = document.getElementById('tabletop');
  let elapsed = 0;
  const tickId = setInterval(() => {
    tabletop.innerHTML = '';
    for (let i = 0; i < numDice; i++) {
      tabletop.appendChild(makeDie(COLORS[Math.floor(Math.random() * COLORS.length)], true));
    }
    elapsed += ANIM_SHUFFLE_INTERVAL;
    if (elapsed >= ANIM_SHUFFLE_DURATION) {
      clearInterval(tickId);
      paintDice(finalResults, true);
      onDone();
    }
  }, ANIM_SHUFFLE_INTERVAL);
}

function paintDice(results, animate) {
  const tabletop = document.getElementById('tabletop');
  tabletop.innerHTML = '';
  results.forEach((color, i) => {
    const die = makeDie(color, false);
    if (animate) {
      die.classList.add('bouncing');
      die.style.animationDelay = `${i * 40}ms`;
      die.addEventListener('animationend', () => die.classList.remove('bouncing'), { once: true });
    }
    tabletop.appendChild(die);
  });
}

function makeDie(color, rolling) {
  const wrapper = document.createElement('div');
  wrapper.className = 'die' + (rolling ? ' rolling' : '');
  const pip = document.createElement('div');
  pip.className = 'die-pip';
  pip.style.background = color.hex;
  pip.style.boxShadow  = `inset 0 -2px 4px rgba(0,0,0,0.18), 0 0 12px ${color.hex}55`;
  wrapper.appendChild(pip);
  return wrapper;
}

/* ─────────── HISTORY ─────────── */
function recordRoll(results) {
  rollHistory.unshift(results.map(c => c.id));
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
    row.className = 'history-row';

    const num = document.createElement('div');
    num.className = 'history-num';
    num.textContent = `${idx + 1}.`;

    const diceRow = document.createElement('div');
    diceRow.className = 'history-dice';
    roll.forEach(id => {
      const color = COLOR_MAP[id];
      if (!color) return;
      const die = document.createElement('div');
      die.className = 'history-die';
      const pip = document.createElement('div');
      pip.className = 'mini-pip';
      pip.style.background = color.hex;
      die.appendChild(pip);
      diceRow.appendChild(die);
    });

    row.appendChild(num);
    row.appendChild(diceRow);
    frag.appendChild(row);
  });
  container.innerHTML = '';
  container.appendChild(frag);
}

/* ─────────── CONFETTI ─────────── */
let confettiRAF = null;
let confettiParticles = [];
function checkConfetti(results) {
  if (results.length > 1 && results.every(c => c.id === results[0].id)) {
    setTimeout(launchConfetti, 480);
  }
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
      h: Math.random() * 5  + 3,
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
    p.x += p.vx; p.y += p.vy; p.rot += p.rotSpeed; p.life -= p.decay;
  });
  if (confettiParticles.length > 0) {
    confettiRAF = requestAnimationFrame(() => drawConfetti(ctx, canvas));
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

/* ─────────── SOUND ─────────── */
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
  }
  return audioCtx;
}
function playRollSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const sr = ctx.sampleRate;
  const dur = 0.28;
  const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.exp(-(i / d.length) * 5);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bpf = ctx.createBiquadFilter();
  bpf.type = 'bandpass';
  bpf.frequency.value = 600;
  bpf.Q.value = 0.6;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.45, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  src.connect(bpf); bpf.connect(gain); gain.connect(ctx.destination);
  src.start(now); src.stop(now + dur);
}

/* ─────────── HIDDEN PANEL ─────────── */
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
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
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
    try { localStorage.removeItem('cd_settings'); } catch (_) {}
    syncFormToState();
    btnNatural.textContent = '✓ Reset Done';
    setTimeout(() => { btnNatural.textContent = '✓ Natural Mode'; }, 1400);
  });

  btnSave.addEventListener('click', () => {
    ['red','orange','yellow','green','blue','purple'].forEach(id => {
      const el = document.getElementById(`w-${id}`);
      if (el) overrideWeights[id] = Math.max(0, parseInt(el.value, 10) || 0);
    });
    overrideAlways = document.getElementById('sel-always').value;
    overrideNever  = document.getElementById('sel-never').value;
    overrideForce  = document.getElementById('force-roll-input').value;
    overrideMode   = toggle.checked;
    saveAdminSettings();
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
  if (sa) sa.value = overrideAlways;
  if (sn) sn.value = overrideNever;
}
function openPanel() {
  document.getElementById('ctrl-overlay').classList.add('open');
  document.getElementById('ctrl-overlay').setAttribute('aria-hidden', 'false');
}
function closePanel() {
  document.getElementById('ctrl-overlay').classList.remove('open');
  document.getElementById('ctrl-overlay').setAttribute('aria-hidden', 'true');
}
function togglePanel() {
  document.getElementById('ctrl-overlay').classList.contains('open') ? closePanel() : openPanel();
}

/* ─────────── RESIZE ─────────── */
window.addEventListener('resize', () => {
  const c = document.getElementById('confetti-canvas');
  c.width = window.innerWidth;
  c.height = window.innerHeight;
});
