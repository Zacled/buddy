/*
 * Color Dice — hide one chosen colour on online-dice.com colour dice.
 *
 * online-dice.com RELOADS the page on every roll (the Game ID changes), so the
 * rig runs on page LOAD: it reads the armed colour and recolours any die that
 * landed on it. Pressing a number key / using the popup only ARMS a colour
 * (saved in the extension); it takes effect on your next roll (= next reload),
 * never on the dice already on screen.
 *
 * The blocked colour is swapped to ONE fixed replacement (chosen per page load)
 * and applied to every die-square on the page — the main roll AND the squares in
 * "YOUR LAST 20 ROLLS" (THIS ROLL / PREVIOUS ROLLS) and the STATS row — so the
 * history always matches the rolled dice instead of revealing the real colour.
 *   1 red · 2 orange · 3 yellow · 4 green · 5 blue · 6 purple · 0 none
 */
(function () {
  if (window.__colorDiceLoaded) return;
  window.__colorDiceLoaded = true;

  const COLORS = ["red", "orange", "gold", "green", "blue", "purple"];
  const KEYMAP = { "1": "red", "2": "orange", "3": "gold", "4": "green", "5": "blue", "6": "purple" };
  // vivid replacements (close to the site's dice colours)
  const CSS = { red: "#e8261f", orange: "#f5921e", gold: "#f2c200", green: "#1f9e3a", blue: "#2f6fe0", purple: "#8e1b9b" };
  let blocked = null;

  // one fixed replacement per blocked colour, chosen once per page load — so the
  // same blocked die shows the SAME colour on the table and in the history.
  const repl = {};
  function replacementFor(c) {
    if (!repl[c]) {
      const pool = COLORS.filter((x) => x !== c);
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
        if (area > bestArea) { best = { el: el, prop: "background-color", bucket: bg }; bestArea = area; }
      }
    }
    if (best) return best;
    for (const el of els) {
      const fg = bucketOf(getComputedStyle(el).color);
      if (fg) return { el: el, prop: "color", bucket: fg };
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
      const bucket = bucketOf(getComputedStyle(el).backgroundColor);
      if (!bucket) return;
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.width > 150 || r.height < 20 || r.height > 150) return;
      const ratio = r.width / r.height;
      if (ratio < 0.6 || ratio > 1.7) return;               // roughly square
      add({ el: el, prop: "background-color", bucket: bucket });
    });

    return out;
  }

  function applyRig() {
    if (!blocked) return;
    const pick = CSS[replacementFor(blocked)]; // one colour for every blocked die
    const found = dice();
    found.forEach((d) => {
      if (d.bucket !== blocked || d.el.dataset.cdDone === blocked) return;
      d.el.style.setProperty(d.prop, pick, "important");
      d.el.dataset.cdDone = blocked; // don't recolour the same element twice
    });
    try { console.log("[ColorDice] blocked:", blocked, "->", replacementFor(blocked), "| squares:", found.length, found.map((d) => d.bucket)); } catch (e) {}
  }

  function init() {
    const sub = document.getElementById("sub-title2");
    if (sub) sub.textContent = "Roll Color Dice";

    try {
      chrome.storage.local.get("blocked", (c) => {
        blocked = (c && c.blocked) || null;
        applyRig();
        [120, 350, 700, 1300, 2200, 3500].forEach((ms) => setTimeout(applyRig, ms));
      });
      chrome.storage.onChanged.addListener((ch, area) => {
        if (area === "local" && ch.blocked) blocked = ch.blocked.newValue || null;
      });
    } catch (e) {}

    document.addEventListener("keydown", function (e) {
      if (KEYMAP[e.key]) { blocked = KEYMAP[e.key]; try { chrome.storage.local.set({ blocked: blocked }); } catch (x) {} }
      else if (e.key === "0") { blocked = null; try { chrome.storage.local.set({ blocked: null }); } catch (x) {} }
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
