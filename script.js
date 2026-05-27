'use strict';

/* ============================================================
   ONLINE DICE — fully self-contained JS
   ============================================================ */

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

/* Pip layouts for d6 — which grid positions are lit for each face */
const PIP_LAYOUTS = {
  1: ['mc'],
  2: ['tl', 'br'],
  3: ['tl', 'mc', 'br'],
  4: ['tl', 'tr', 'bl', 'br'],
  5: ['tl', 'tr', 'mc', 'bl', 'br'],
  6: ['tl', 'ml', 'bl', 'tr', 'mr', 'br'],
};

const HISTORY_MAX = 20;
const HISTORY_SAVE_MAX_DICE = 6;
const ANIM_DURATION = 700;
const ANIM_TICK     = 75;

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
    if (t) { theme = t; document.documentElement.setAttribute('data-theme', t); }
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
  const loaderDie = document.getElementById('loader-die');
  let counter = 1;
  const tick = setInterval(() => {
    renderPipDie(loaderDie, counter);
    counter = counter === 6 ? 1 : counter + 1;
  }, 90);
  setTimeout(() => {
    clearInterval(tick);
    document.getElementById('loader').classList.add('hide');
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
    document.getElementById('color-info').style.display =
      diceType === 'color-dice' ? 'block' : 'none';
    performRoll(true);
  });

  const themeSel = document.getElementById('theme-select');
  themeSel.addEventListener('change', () => {
    theme = themeSel.value;
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('od_theme', theme); } catch (_) {}
  });
}

/* ---------- ROLL LOGIC ---------- */
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

function rollOnePip(maxFace) {
  if (overrideMode && overrideForcePip && diceType === 'd6') {
    const p = parseInt(overrideForcePip, 10);
    if (p >= 1 && p <= 6) return p;
  }
  return Math.floor(Math.random() * maxFace) + 1;
}

function buildResults(n) {
  if (diceType === 'color-dice') {
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

  const maxFace = DIE_FACES[diceType] || 6;

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
  document.getElementById('roll-button').addEventListener('click', () => performRoll(true));
}

function performRoll(animate) {
  if (isRolling) return;
  const results = buildResults(numDice);

  if (!animate) {
    paintDice(results, false);
    recordRoll(results);
    return;
  }

  isRolling = true;
  const btn = document.getElementById('roll-button');
  if (btn) btn.disabled = true;

  runShuffleAnimation(results, () => {
    isRolling = false;
    if (btn) btn.disabled = false;
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
        tabletop.appendChild(makeDieEl({ type:'color', color: COLORS[Math.floor(Math.random() * COLORS.length)] }));
      } else {
        const max = DIE_FACES[diceType] || 6;
        tabletop.appendChild(makeDieEl({ type:'pip', pip: Math.floor(Math.random() * max) + 1 }));
      }
    });
    elapsed += ANIM_TICK;
    if (elapsed >= ANIM_DURATION) {
      clearInterval(tick);
      paintDice(finalResults, true);
      onDone();
    }
  }, ANIM_TICK);
}

function paintDice(results, animate) {
  const tabletop = document.getElementById('tabletop');
  tabletop.innerHTML = '';
  results.forEach((r, i) => {
    const die = makeDieEl(r);
    if (animate) {
      die.classList.add('bouncing');
      die.style.animationDelay = `${i * 40}ms`;
      die.addEventListener('animationend', () => die.classList.remove('bouncing'), { once:true });
    }
    tabletop.appendChild(die);
  });
}

function makeDieEl(r) {
  const die = document.createElement('div');
  die.className = 'die';
  if (r.type === 'color') {
    die.classList.add('color');
    const pip = document.createElement('div');
    pip.className = 'pip';
    die.style.setProperty('--color', r.color.hex);
    die.style.setProperty('--color-glow', r.color.hex + '70');
    die.appendChild(pip);
  } else if (diceType === 'd6') {
    renderPipDie(die, r.pip);
  } else {
    die.classList.add('numeric');
    die.textContent = r.pip;
  }
  return die;
}

function renderPipDie(dieEl, face) {
  dieEl.className = 'die';
  dieEl.innerHTML = '';
  const layout = PIP_LAYOUTS[face] || PIP_LAYOUTS[1];
  layout.forEach(pos => {
    const pip = document.createElement('div');
    pip.className = `pip ${pos}`;
    dieEl.appendChild(pip);
  });
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
    row.className = 'history-row';

    const num = document.createElement('div');
    num.className = 'history-num';
    num.textContent = `${idx + 1}.`;
    row.appendChild(num);

    const dr = document.createElement('div');
    dr.className = 'history-dice';

    roll.forEach(item => {
      const die = document.createElement('div');
      die.className = 'die history-die';
      if (item.c) {
        const color = COLOR_MAP[item.c];
        die.classList.add('color');
        die.style.setProperty('--color', color.hex);
        const pip = document.createElement('div');
        pip.className = 'pip';
        die.appendChild(pip);
      } else if ((item.t || 'd6') === 'd6') {
        const layout = PIP_LAYOUTS[item.p] || PIP_LAYOUTS[1];
        layout.forEach(pos => {
          const pip = document.createElement('div');
          pip.className = `pip ${pos}`;
          die.appendChild(pip);
        });
      } else {
        die.classList.add('numeric');
        die.textContent = item.p;
      }
      dr.appendChild(die);
    });

    row.appendChild(dr);
    frag.appendChild(row);
  });

  container.innerHTML = '';
  container.appendChild(frag);

  const note = document.createElement('p');
  note.style.fontSize = '.78rem';
  note.style.opacity = '.7';
  note.style.marginTop = '8px';
  note.textContent = 'Please note: only dice rolls with up to 6 dice are saved.';
  container.appendChild(note);
}

/* ---------- CONFETTI ---------- */
let confettiRAF = null;
let confettiParticles = [];

function checkConfetti(results) {
  if (results.length < 2) return;
  const first = results[0];
  const same = results.every(r =>
    r.type === 'color' ? r.color?.id === first.color?.id : r.pip === first.pip
  );
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
      y: Math.random() * canvas.height * .5 - canvas.height * .5,
      w: Math.random() * 10 + 5,
      h: Math.random() * 5 + 3,
      color: color.hex,
      rot: Math.random() * 360,
      rotSpeed: (Math.random() - .5) * 6,
      vy: Math.random() * 3.5 + 1.8,
      vx: (Math.random() - .5) * 1.5,
      life: 1,
      decay: Math.random() * .008 + .004,
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
    overrideAlways   = document.getElementById('sel-always').value;
    overrideNever    = document.getElementById('sel-never').value;
    overrideForce    = document.getElementById('force-roll-input').value;
    overrideForcePip = document.getElementById('sel-force-pip').value;
    overrideMode     = toggle.checked;
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
