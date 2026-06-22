/*
 * Color Dice — hide one or more chosen colours on online-dice.com colour dice.
 *
 * online-dice.com RELOADS the page on every roll (the Game ID changes), so the
 * rig runs on page LOAD: it reads the blocked colours and recolours any die that
 * landed on one of them. Editing the block only ARMS it for your NEXT roll — the
 * dice already on screen (the current roll + history) are left exactly as they
 * are, so changing the block never visibly rewrites the result in front of you.
 *
 *   - Number keys block a SINGLE colour, replacing whatever was armed (press 1
 *     and only red is blocked). Press 0 to clear.
 *   - The popup can block SEVERAL colours at once (click to toggle each).
 *
 * Each blocked colour is swapped to one fixed, non-blocked replacement (using
 * the site's real shade, sampled off a genuine die) and applied to every
 * die-square on the page — the main roll AND the squares in "YOUR LAST 20 ROLLS"
 * (THIS ROLL / PREVIOUS ROLLS) and the STATS row — so the history always matches
 * the rolled dice instead of revealing a real, blocked colour.
 *   1 red · 2 orange · 3 yellow · 4 green · 5 blue · 6 purple · 0 clear all
 */
(function () {
  if (window.__colorDiceLoaded) return;
  window.__colorDiceLoaded = true;

  const COLORS = ["red", "orange", "gold", "green", "blue", "purple"];
  const KEYMAP = { "1": "red", "2": "orange", "3": "gold", "4": "green", "5": "blue", "6": "purple" };
  // fallback shades (used only if the real colour can't be sampled off the page)
  const CSS = { red: "#e8261f", orange: "#f5921e", gold: "#f2c200", green: "#388c3e", blue: "#2f6fe0", purple: "#8e1b9b" };

  // Two sets, on purpose:
  //  - activeSet : colours hidden on THIS page. Snapshotted at page load and then
  //                never changed, so editing the block never alters the dice that
  //                are already on screen (the current roll / history stay put).
  //  - armedSet  : what will be hidden on your NEXT roll. Keys/popup edit this and
  //                save it; it only takes effect when the page reloads (every roll).
  let activeSet = [];
  let armedSet = [];
  const isBlocked = (c) => activeSet.indexOf(c) !== -1;
  // accept legacy single-string storage too, and always hand back a fresh array
  function normSet(v) {
    if (Array.isArray(v)) return v.filter((c) => COLORS.indexOf(c) !== -1);
    if (typeof v === "string" && v) return COLORS.indexOf(v) !== -1 ? [v] : [];
    return [];
  }

  // one fixed replacement per blocked colour — chosen from the colours that are
  // NOT blocked, so a hidden colour never maps onto another hidden colour. Kept
  // stable per page load so every die of that colour swaps to the same thing.
  const repl = {};
  function replacementFor(c) {
    const pool = COLORS.filter((x) => !isBlocked(x));
    if (!pool.length) return null;                       // everything blocked: give up
    if (!repl[c] || pool.indexOf(repl[c]) === -1) {      // (re)pick if invalid/now-blocked
      repl[c] = pool[Math.floor(Math.random() * pool.length)];
    }
    return repl[c];
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
  // and the STATS row, so a blocked colour is hidden consistently everywhere.
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

  // exact colour string sampled from a genuine die of each bucket, so our swap
  // uses the site's real shade (and matches whatever theme is selected) instead
  // of a hardcoded guess that can look a touch lighter/darker than the real one.
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

  // paint a square the given colour, but only when it isn't already showing it.
  // The guard compares the square's CURRENT colour bucket to the target, so the
  // rig (which re-runs on every DOM mutation) neither rewrites identical styles
  // — avoiding a ping-pong with the MutationObserver — nor misses a square the
  // site has just re-rendered back to a real colour.
  function setColour(d, bucketName) {
    if (!bucketName || d.bucket === bucketName) return;
    d.el.style.setProperty(d.prop, colourFor(bucketName), "important");
    d.bucket = bucketName;
  }

  function applyRig() {
    const found = dice();
    samplePalette(found);                          // learn the site's shades first
    found.forEach((d) => {
      // a square we already swapped: keep it hidden if its colour is still
      // blocked; if its colour was un-blocked, restore the real colour & forget.
      if (d.el.dataset.cdRigged) {
        const orig = d.el.dataset.cdBucket;
        if (orig && isBlocked(orig)) {
          setColour(d, replacementFor(orig));
        } else {
          setColour(d, orig);
          delete d.el.dataset.cdRigged;
          delete d.el.dataset.cdBucket;
        }
        return;
      }
      // a genuine square whose colour is blocked: swap it and remember what it was
      if (!isBlocked(d.bucket)) return;
      const rc = replacementFor(d.bucket);
      if (!rc) return;
      d.el.dataset.cdRigged = "1";
      d.el.dataset.cdBucket = d.bucket;
      setColour(d, rc);
    });
    try { console.log("[ColorDice] active:", activeSet.join(",") || "(none)", "armed:", armedSet.join(",") || "(none)", "| squares:", found.length); } catch (e) {}
  }

  function init() {
    const sub = document.getElementById("sub-title2");
    if (sub) sub.textContent = "Roll Color Dice";

    try {
      chrome.storage.local.get("blocked", (c) => {
        activeSet = normSet(c && c.blocked);  // freeze what this page hides...
        armedSet = activeSet.slice();         // ...and start editing from the same set
        applyRig();
        [120, 350, 700, 1300, 2200, 3500].forEach((ms) => setTimeout(applyRig, ms));
      });
      // edits made elsewhere (popup, another tab) only change what's armed for the
      // next roll — they must NOT re-rig the dice already on this page.
      chrome.storage.onChanged.addListener((ch, area) => {
        if (area === "local" && ch.blocked) armedSet = normSet(ch.blocked.newValue);
      });
    } catch (e) {}

    function save() { try { chrome.storage.local.set({ blocked: armedSet.slice() }); } catch (x) {} }

    // Number keys arm a SINGLE colour (replacing whatever was armed); 0 clears.
    // No re-rig here — it takes effect on the next roll, leaving the current dice be.
    document.addEventListener("keydown", function (e) {
      if (KEYMAP[e.key]) { armedSet = [KEYMAP[e.key]]; save(); }
      else if (e.key === "0") { armedSet = []; save(); }
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
