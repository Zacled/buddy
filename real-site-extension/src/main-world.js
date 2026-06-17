/*
 * main-world.js  (runs in the PAGE context on wheelofnames.com)
 *
 * Press a number key to choose the winner by position:
 *   1 -> 1st name, 2 -> 2nd name, ... 9 -> 9th name, 0 / Esc -> fair spin.
 *
 * The winner the site shows is:
 *     index = round( N * ((u + delta) mod 1) ) mod N
 * (measured from real spins; delta ≈ 0.363). So to land position t we force the
 * RNG to return u = (t/N − delta) mod 1, only at the moment you spin.
 */
(function () {
  "use strict";

  const TAG = "__wnrig";
  const state = { activated: false, enabled: true, forceIndex: -1, delta: 0.363, wobble: 0.45 };
  let forceThisSpin = false;
  let curK = 0;
  let mathUntil = 0;
  // Fail-safe gate: only rig while we have a RECENT "yes, still activated"
  // confirmation from the extension. If the code is revoked, or the tab was in the
  // background and we haven't re-confirmed since regaining focus, rigging stays OFF
  // until a fresh OK arrives — so a revoked code can't keep working on a stale flag.
  let lastConfirm = 0;       // performance.now() of the last activated:true push
  let needReverify = false;  // set when the tab regains focus; blocks rigging until reconfirmed
  const LEASE_MS = 12000;    // if confirmations stop entirely, rigging dies within this

  function riggingLive() {
    return state.activated && state.enabled && !needReverify &&
      (performance.now() - lastConfirm < LEASE_MS);
  }

  const realRandom = Math.random.bind(Math);
  let realGet = null;
  try { realGet = crypto.getRandomValues.bind(crypto); } catch (e) {}

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

  function computeK(N, t) {
    if (!N) return 0;
    // Land somewhere inside the target slice. `wobble` (0..~0.9) is how much of the
    // half-slice to randomly vary the resting spot: 0 = dead centre (most reliable),
    // higher = more visible variation but needs the aim well-calibrated or it can
    // tip into a neighbour. Winner = round(N*((u+delta) mod 1)), so staying within
    // ±0.5/N of t/N keeps the same name.
    const half = 0.5 / N;
    const j = Math.max(0, Math.min(state.wobble, 0.9)) * half;
    const offset = (realRandom() * 2 - 1) * j;
    const phi = t / N + offset;
    return (((phi - state.delta) % 1) + 1) % 1;
  }

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
      if (riggingLive() && forceThisSpin) return fillK(a);
      return realGet ? realGet(a) : a;
    };
  } catch (e) {}

  Math.random = function () {
    if (riggingLive() && forceThisSpin && performance.now() < mathUntil) return curK;
    return realRandom();
  };

  function onSpin() {
    window.postMessage({ [TAG]: true, dir: "to-iso", type: "recheck" }, "*"); // refresh revocation status
    if (!riggingLive() || state.forceIndex < 0) { forceThisSpin = false; return; }
    const entries = readEntries();
    const N = entries.length;
    const t = state.forceIndex;
    if (!(t >= 0 && t < N)) { forceThisSpin = false; return; } // position not on wheel -> fair
    curK = computeK(N, t);
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

  function inEditable() {
    const a = document.activeElement;
    if (!a) return false;
    return a.isContentEditable || a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT";
  }

  document.addEventListener("click", (e) => { if (isWheelClick(e.target)) onSpin(); }, true);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { onSpin(); return; } // spin shortcut
    if (!state.activated) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (inEditable()) return;
    if (e.key >= "1" && e.key <= "9") { state.forceIndex = e.key.charCodeAt(0) - 49; announce(); }
    else if (e.key === "0" || e.key === "Escape") { state.forceIndex = -1; announce(); }
  }, true);

  function announce() {
    window.postMessage({ [TAG]: true, dir: "to-iso", type: "setIndex", index: state.forceIndex }, "*");
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d[TAG] !== true || d.dir !== "to-main") return;
    if (d.type === "config") {
      if (typeof d.activated === "boolean") {
        state.activated = d.activated;
        if (d.activated) { lastConfirm = performance.now(); needReverify = false; } // fresh OK
      }
      if (typeof d.enabled === "boolean") state.enabled = d.enabled;
      if (typeof d.forceIndex === "number") state.forceIndex = d.forceIndex;
      if (typeof d.delta === "number" && d.delta > 0 && d.delta < 1) state.delta = d.delta;
      if (typeof d.wobble === "number" && d.wobble >= 0 && d.wobble <= 1) state.wobble = d.wobble;
    } else if (d.type === "getEntries") {
      window.postMessage({ [TAG]: true, dir: "to-iso", type: "entries", entries: readEntries() }, "*");
    }
  });

  // Coming back to this tab forces a fresh activation check before we'll rig again,
  // so a code revoked while you were on another tab can't sneak one last rigged spin.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      needReverify = true;
      window.postMessage({ [TAG]: true, dir: "to-iso", type: "recheck" }, "*");
    }
  });

  window.postMessage({ [TAG]: true, dir: "to-iso", type: "ready" }, "*");
})();
