/*
 * main-world.js  (runs in the PAGE context on wheelofnames.com)
 *
 * The current site (v413) seals its wheel object away, but the winner is drawn
 * from the browser's RNG in your own browser. We confirmed empirically that the
 * winning slice is:
 *
 *     index = round( N * ((u + delta) mod 1) ) mod N
 *
 * where N = number of entries, u in [0,1) is the value the site pulls from the
 * RNG for the spin, and delta ≈ 0.363 is a fixed offset from the wheel's
 * deceleration (measured from real spins: u=0→Beatriz, 0.5→Ali, 0.95→Beatriz,
 * 0.38/0.44→Charles for [Ali, Beatriz, Charles]).
 *
 * So to land entry t we force the RNG to return u = (t/N − delta) mod 1.
 * We override crypto.getRandomValues (and, briefly, Math.random) only while
 * armed and only on a spin, so normal browsing/animations are untouched.
 */
(function () {
  "use strict";

  const TAG = "__wnrig";
  const state = { armed: false, target: "", delta: 0.363 };
  let forceThisSpin = false;
  let curK = 0;
  let mathUntil = 0;

  const realRandom = Math.random.bind(Math);
  let realGet = null;
  try { realGet = crypto.getRandomValues.bind(crypto); } catch (e) {}

  const norm = (s) => (s == null ? "" : String(s)).replace(/\s+/g, " ").trim().toLowerCase();

  // Read the entry list (in wheel order) from the page's names editor.
  function readEntries() {
    let best = [];
    document.querySelectorAll("[contenteditable]").forEach((el) => {
      const lines = (el.innerText || "").split("\n").map((s) => s.trim()).filter(Boolean);
      if (lines.length > best.length) best = lines;
    });
    if (!best.length) {
      document.querySelectorAll("textarea").forEach((t) => {
        const lines = (t.value || "").split("\n").map((s) => s.trim()).filter(Boolean);
        if (lines.length > best.length) best = lines;
      });
    }
    return best;
  }

  function targetIndex(entries) {
    const want = norm(state.target);
    if (!want) return -1;
    let exact = -1, partial = -1;
    entries.forEach((nm, i) => {
      const t = norm(nm);
      if (t === want && exact < 0) exact = i;
      if (partial < 0 && t && t.indexOf(want) !== -1) partial = i;
    });
    return exact >= 0 ? exact : partial;
  }

  function computeK(entries, t) {
    const N = entries.length;
    if (!N) return 0;
    return (((t / N - state.delta) % 1) + 1) % 1;
  }

  // Fill the RNG output so the site's normalized value equals curK. This is the
  // exact byte-filling we validated by hand in the console test.
  function fillK(a) {
    if (!a || !("length" in a)) return a;
    const K = curK;
    for (let i = 0; i < a.length; i++) {
      if (a instanceof Uint8Array) a[i] = Math.floor(K * 256) & 255;
      else if (a instanceof Uint16Array) a[i] = Math.floor(K * 65536) & 0xffff;
      else a[i] = Math.floor(K * 4294967296) >>> 0;
    }
    return a;
  }

  try {
    crypto.getRandomValues = function (a) {
      if (state.armed && forceThisSpin) return fillK(a);
      return realGet ? realGet(a) : a;
    };
  } catch (e) {}

  Math.random = function () {
    if (state.armed && forceThisSpin && performance.now() < mathUntil) return curK;
    return realRandom();
  };

  // Called the instant a spin is triggered, before the site's own handler runs.
  function onSpin() {
    if (!state.armed || !state.target) { forceThisSpin = false; return; }
    const entries = readEntries();
    const t = targetIndex(entries);
    if (t < 0) { forceThisSpin = false; return; } // target not on the wheel -> fair spin
    curK = computeK(entries, t);
    forceThisSpin = true;
    mathUntil = performance.now() + 3500;
  }

  function isWheelClick(target) {
    let el = target, hops = 0;
    while (el && hops < 4) {
      if (el.tagName === "CANVAS") return true;
      if (el.querySelector && el.querySelector("canvas")) return true;
      el = el.parentElement; hops++;
    }
    return false;
  }

  // Capture phase so we compute the forced value before the page spins.
  document.addEventListener("click", (e) => { if (isWheelClick(e.target)) onSpin(); }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) onSpin(); }, true);

  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d[TAG] !== true || d.dir !== "to-main") return;
    if (d.type === "config") {
      state.armed = !!d.armed;
      state.target = d.target || "";
      if (typeof d.delta === "number" && d.delta > 0 && d.delta < 1) state.delta = d.delta;
    } else if (d.type === "getEntries") {
      window.postMessage({ [TAG]: true, dir: "to-iso", type: "entries", entries: readEntries() }, "*");
    }
  });

  window.postMessage({ [TAG]: true, dir: "to-iso", type: "ready" }, "*");
})();
