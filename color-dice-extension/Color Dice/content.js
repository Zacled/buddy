/*
 * Color Dice — hide a chosen colour on online-dice.com colour dice.
 *
 * online-dice.com RELOADS the page on every roll, and re-renders the history from
 * its own (real) data, so the rig runs on page LOAD.
 *
 *   - Only ONE colour is blocked at a time, for your NEXT roll. Pressing a number
 *     key (or clicking a popup colour) blocks just that colour and drops whatever
 *     was blocked before (press 1 for red, then 3 for yellow → only yellow).
 *   - Editing the block never rewrites the dice already on screen — it takes
 *     effect on your next roll.
 *
 * PER-ROLL MEMORY: the first time a roll is seen, we "bake" its displayed colours
 * (hiding whatever is blocked at that moment) and remember them, keyed by the
 * roll's REAL colours. On every later load we replay that exact result. So a past
 * roll KEEPS its fake colours even after you switch to blocking a different colour
 * — the roll where you blocked red keeps hiding red, while new rolls hide the new
 * colour. Press 0 (or "Clear all") to forget every faked roll and show real again.
 *
 * Hidden dice are swapped to the site's real shade (sampled off a genuine die) and
 * varied by position, so several hidden dice in a roll differ, while a table die
 * and its history twin (same roll + position) match.
 *   1 red · 2 orange · 3 yellow · 4 green · 5 blue · 6 purple · 0 clear all
 */
(function () {
  if (window.__colorDiceLoaded) return;
  window.__colorDiceLoaded = true;

  const COLORS = ["red", "orange", "gold", "green", "blue", "purple"];
  const KEYMAP = { "1": "red", "2": "orange", "3": "gold", "4": "green", "5": "blue", "6": "purple" };
  // fallback shades (used only if the real colour can't be sampled off the page)
  const CSS = { red: "#e8261f", orange: "#f5921e", gold: "#f2c200", green: "#388c3e", blue: "#2f6fe0", purple: "#8e1b9b" };

  // the single colour armed for your NEXT roll (selecting another replaces it)
  let armed = null;

  // Per-roll memory: signature (a roll's real colours, joined) -> displayed colours.
  let fakeMap = {};      // sig -> array of colour names actually shown
  let fakeList = [];     // sigs in insertion order, for pruning
  let fakesDirty = false;
  const FAKE_CAP = 300;

  function loadFakes(v) {
    fakeMap = {}; fakeList = [];
    (Array.isArray(v) ? v : []).forEach((e) => {
      if (e && e.length === 2 && typeof e[0] === "string" && Array.isArray(e[1])) { fakeMap[e[0]] = e[1]; fakeList.push(e[0]); }
    });
  }
  function persistFakes() {
    try { chrome.storage.local.set({ cdFakes: fakeList.map((s) => [s, fakeMap[s]]) }); } catch (e) {}
  }
  function bakeFake(sig, seq) {                 // remember a roll's displayed colours (once)
    fakeMap[sig] = seq; fakeList.push(sig);
    if (fakeList.length > FAKE_CAP) delete fakeMap[fakeList.shift()];
    fakesDirty = true;
  }

  // accept legacy single-string / array storage; return one colour name or null
  function firstColor(v) {
    if (Array.isArray(v)) { const f = v.filter((c) => COLORS.indexOf(c) !== -1); return f.length ? f[0] : null; }
    if (typeof v === "string" && COLORS.indexOf(v) !== -1) return v;
    return null;
  }

  // Pick a replacement colour for a blocked die: any colour OTHER than the blocked
  // one, walked by position so several blocked dice in a roll get DISTINCT colours.
  // Deterministic per (blocked colour, position, per-load salt) so a die and its
  // history twin (same roll + position) resolve to the same colour.
  const SALT = (Math.random() * 1e9) | 0;
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function replacementColor(blocked, pos) {
    const pool = COLORS.filter((x) => x !== blocked);
    if (!pool.length) return null;
    const start = hashStr(blocked + ":" + SALT) % pool.length;
    return pool[(start + pos) % pool.length];
  }
  // the displayed sequence for a roll: hide `blocked` (varied by position), keep rest
  function computeFakeSeq(real, blocked) {
    if (!blocked) return real.slice();
    return real.map((c, i) => (c === blocked ? (replacementColor(blocked, i) || c) : c));
  }

  // classify an "rgb(...)" string into one of the 6 buckets by hue
  function bucketOf(s) {
    const m = s && s.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s]+([\d.]+))?/);
    if (!m) return null;
    if (m[4] !== undefined && parseFloat(m[4]) < 0.3) return null; // mostly transparent
    const r = +m[1], g = +m[2], b = +m[3];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d < 25) return null; // grey/white/black/near-grey — not a dice colour
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    if (h < 15 || h >= 345) return "red";
    if (h < 45) return "orange";
    if (h < 70) return "gold";
    if (h < 175) return "green";
    if (h < 260) return "blue";
    return "purple";
  }

  // find each die's colour element — works whether the colour is a text colour
  // (<i style="color">) or a background colour (a coloured square)
  function findDie(scope) {
    const els = [scope].concat(Array.prototype.slice.call(scope.querySelectorAll("*")));
    let best = null, bestArea = -1;
    for (const el of els) {
      if (el.classList && el.classList.contains("__cd_die")) continue;
      const cs = getComputedStyle(el);
      const bg = bucketOf(cs.backgroundColor);
      if (bg) {
        const r = el.getBoundingClientRect();
        const area = r.width * r.height;
        if (area > bestArea) { best = { el: el, prop: "background-color", bucket: bg, raw: cs.backgroundColor }; bestArea = area; }
      }
    }
    if (best) return best;
    for (const el of els) {
      const cs = getComputedStyle(el);
      const fg = bucketOf(cs.color);
      if (fg) return { el: el, prop: "color", bucket: fg, raw: cs.color };
    }
    return null;
  }

  // collect EVERY die-shaped coloured square on the page: the main rolled dice
  // PLUS the small squares in "YOUR LAST 20 ROLLS" (THIS ROLL / PREVIOUS ROLLS)
  // and the STATS row.
  function dice() {
    const out = [];
    const seen = new Set();
    const add = (d) => { if (d && !seen.has(d.el)) { seen.add(d.el); out.push(d); } };

    // 1) the main rolled dice, via the site's known wrappers
    document.querySelectorAll(".tabletop .dice-wrapper, .dice-wrapper, .dice")
      .forEach((w) => add(findDie(w)));

    // 2) every other small/medium coloured square (history rows + stats squares).
    //    Filters keep us off the blue page background, panels, avatars, verified
    //    badges, the colour legend, and any text labels/counts.
    document.querySelectorAll("div,span,i,td,b,strong,li").forEach((el) => {
      if (seen.has(el)) return;
      if (el.classList && el.classList.contains("__cd_die")) return;
      if (el.querySelector("img")) return;                  // avatars / badges
      if (/[a-z0-9]/i.test(el.textContent || "")) return;   // labels, names, counts
      const cs = getComputedStyle(el);
      const bucket = bucketOf(cs.backgroundColor);
      if (!bucket) return;
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.width > 150 || r.height < 20 || r.height > 150) return;
      const ratio = r.width / r.height;
      if (ratio < 0.6 || ratio > 1.7) return;               // roughly square
      add({ el: el, prop: "background-color", bucket: bucket, raw: cs.backgroundColor });
    });

    return out;
  }

  // exact colour string sampled from a genuine die of each bucket, so our swap uses
  // the site's real shade (and matches whatever theme is selected).
  const palette = {};
  function samplePalette(found) {
    found.forEach((d) => {
      if (d.el.dataset.cdRigged) return;          // never learn from our own swaps
      if (d.raw && !palette[d.bucket]) palette[d.bucket] = d.raw;
    });
  }
  function colourFor(name) {
    return palette[name] || CSS[name];            // real shade if known, else fallback
  }

  // a die's REAL colour: what it was before we touched it (remembered), else current
  function realBucketOf(d) { return d.el.dataset.cdBucket || d.bucket; }

  // paint a square a colour, but only when it isn't already showing it (the guard
  // avoids rewriting identical styles and ping-ponging with the MutationObserver).
  function setColour(d, bucketName) {
    if (!bucketName || d.bucket === bucketName) return;
    d.el.style.setProperty(d.prop, colourFor(bucketName), "important");
    d.bucket = bucketName;
  }
  // make a die show `target`; remember its real colour so we can restore it later
  function applyTarget(d, target, real) {
    if (!target) target = real;
    if (target === real) {
      if (d.el.dataset.cdRigged) { setColour(d, real); delete d.el.dataset.cdRigged; delete d.el.dataset.cdBucket; }
    } else {
      d.el.dataset.cdRigged = "1";
      d.el.dataset.cdBucket = real;
      setColour(d, target);
    }
  }

  // group dice into visual rows (by top edge), index them left-to-right, and tag
  // each with its row's REAL-colour signature and length.
  function assignRows(found) {
    const rows = [];
    found.forEach((d) => {
      const r = d.el.getBoundingClientRect();
      d._left = r.left; d._real = realBucketOf(d);
      let row = null;
      for (let i = 0; i < rows.length; i++) { if (Math.abs(rows[i].top - r.top) <= 14) { row = rows[i]; break; } }
      if (!row) { row = { top: r.top, items: [] }; rows.push(row); }
      row.items.push(d);
    });
    rows.forEach((row) => {
      row.items.sort((a, b) => a._left - b._left);
      const sig = row.items.map((d) => d._real).join(",");
      row.items.forEach((d, i) => { d.pos = i; d.rowSig = sig; d.rowLen = row.items.length; });
    });
  }

  // how many dice make up a roll (from the URL: /roll-color-dice/<n>/)
  function diceCount() {
    const m = location.pathname.match(/roll-color-dice\/(\d+)/);
    return m ? +m[1] : 4;
  }

  function applyRig() {
    const found = dice();
    samplePalette(found);                          // learn the site's shades first
    assignRows(found);
    const dc = diceCount();

    found.forEach((d) => {
      const real = d._real;
      if (d.rowLen === dc) {
        // a roll row: bake its fake the first time we see it, then replay it. This
        // is what makes a past roll keep its colours after you block something else.
        if (!(d.rowSig in fakeMap)) bakeFake(d.rowSig, computeFakeSeq(d.rowSig.split(","), armed));
        const seq = fakeMap[d.rowSig];
        applyTarget(d, seq ? seq[d.pos] : real, real);
      } else {
        // stats / streak / anything else: leave it as the real colour
        applyTarget(d, real, real);
      }
    });

    if (fakesDirty) { fakesDirty = false; persistFakes(); }
    try { console.log("[ColorDice] armed:", armed || "(none)", "| rolls remembered:", fakeList.length, "| squares:", found.length); } catch (e) {}
  }

  function init() {
    const sub = document.getElementById("sub-title2");
    if (sub) sub.textContent = "Roll Color Dice";

    try {
      chrome.storage.local.get(["blocked", "cdFakes"], (c) => {
        armed = firstColor(c && c.blocked);
        loadFakes(c && c.cdFakes);
        applyRig();
        [120, 350, 700, 1300, 2200, 3500].forEach((ms) => setTimeout(applyRig, ms));
      });
      chrome.storage.onChanged.addListener((ch, area) => {
        if (area !== "local") return;
        if (ch.blocked) armed = firstColor(ch.blocked.newValue);     // selection only → don't touch current dice
        if (ch.cdFakes) { loadFakes(ch.cdFakes.newValue); applyRig(); } // a bake/clear elsewhere → re-apply
      });
    } catch (e) {}

    function saveBlocked() { try { chrome.storage.local.set({ blocked: armed ? [armed] : [] }); } catch (e) {} }
    function clearAll() {                          // forget every faked roll, show real again (live)
      armed = null; fakeMap = {}; fakeList = [];
      try { chrome.storage.local.set({ blocked: [], cdFakes: [] }); } catch (e) {}
      applyRig();
    }

    // 1–6 arm a single colour for your NEXT roll (current dice stay put); 0 resets.
    document.addEventListener("keydown", function (e) {
      if (KEYMAP[e.key]) { armed = KEYMAP[e.key]; saveBlocked(); }
      else if (e.key === "0") { clearAll(); }
    });

    try {
      const target = document.querySelector(".tabletop") || document.body;
      let scheduled = false;
      const obs = new MutationObserver(function () {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(function () { scheduled = false; applyRig(); });
      });
      obs.observe(target, { childList: true, subtree: true, attributes: true });
    } catch (e) {}

    try {
      chrome.runtime.onMessage.addListener(function (msg, sender, send) {
        if (msg && msg.type === "ping") send({ ok: true, dice: dice().length });
        return true;
      });
    } catch (e) {}
  }

  if (document.readyState === "complete") init();
  else window.addEventListener("load", init);
})();
