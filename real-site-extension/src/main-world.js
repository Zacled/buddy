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
  let cal = null;            // guided-calibration state (null = not calibrating)

  function frac(x) { return ((x % 1) + 1) % 1; }

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
    const half = 0.5 / N;
    // During calibration we aim with an EXACT probe offset (no random wobble) so the
    // guided steps read cleanly. Otherwise `wobble` (0..0.9) varies the resting spot
    // within the slice. Winner = round(N*((u+delta) mod 1)), so staying within ±0.5/N
    // of t/N keeps the same name.
    let offset;
    if (cal) offset = cal.probe / N;
    else { const j = Math.max(0, Math.min(state.wobble, 0.9)) * half; offset = (realRandom() * 2 - 1) * j; }
    const phi = t / N + offset;
    return frac(phi - state.delta);
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

  // ---- guided precise calibration (on-page panel) ----
  // Binary-searches the slice boundary using only "what number did it land on"
  // answers, so afterwards even High variety stays on the right name.
  let calPanel = null, calMsgEl = null, calInputEl = null;
  function calStart() {
    if (cal) return;
    const N = readEntries().length;
    if (N < 3) { alert("Add at least 3 names to the wheel, then start calibration."); return; }
    cal = { N: N, target: 1, phase: "coarse", lo: 0, hi: 0, iter: 0, probe: 0 };
    state.forceIndex = cal.target; // aim at position 2 (has neighbours either side)
    buildCalPanel();
    calRender("Spin the wheel once (it's aiming at position 2). Then type the number it actually landed on.");
  }
  function calStep(landed) {
    if (!cal) return;
    let rel = (landed - 1) - cal.target;
    if (rel > cal.N / 2) rel -= cal.N;
    if (rel < -cal.N / 2) rel += cal.N;
    if (cal.phase === "coarse") {
      state.delta = frac(state.delta + rel / cal.N);
      cal.phase = "signF"; cal.probe = 0.45;
      calRender("Good — now it's centred. Spin again, then type where it landed.");
    } else if (cal.phase === "signF") {
      if (rel > 0) { cal.phase = "searchF"; cal.lo = 0; cal.hi = 0.45; cal.iter = 0; calProbeMid(); }
      else { cal.phase = "signB"; cal.probe = -0.45; calRender("Spin again, then type where it landed."); }
    } else if (cal.phase === "signB") {
      if (rel < 0) { cal.phase = "searchB"; cal.lo = -0.45; cal.hi = 0; cal.iter = 0; calProbeMid(); }
      else calFinish(0);
    } else if (cal.phase === "searchF") {
      const m = (cal.lo + cal.hi) / 2;
      if (rel > 0) cal.hi = m; else cal.lo = m;
      if (++cal.iter >= 6) calFinish(0.5 - (cal.lo + cal.hi) / 2); else calProbeMid();
    } else if (cal.phase === "searchB") {
      const m = (cal.lo + cal.hi) / 2;
      if (rel < 0) cal.lo = m; else cal.hi = m;
      if (++cal.iter >= 6) calFinish(-0.5 - (cal.lo + cal.hi) / 2); else calProbeMid();
    }
  }
  function calProbeMid() {
    cal.probe = (cal.lo + cal.hi) / 2;
    calRender("Spin again (" + (cal.iter + 1) + " of 6), then type where it landed.");
  }
  function calFinish(r) {
    state.delta = frac(state.delta + r / cal.N);
    window.postMessage({ [TAG]: true, dir: "to-iso", type: "setDelta", delta: state.delta }, "*");
    state.forceIndex = -1;
    cal = null;
    if (calMsgEl) calMsgEl.textContent = "✓ Aim locked in. Crank Spin variety up now — it'll stay on the right name.";
    if (calInputEl) calInputEl.style.display = "none";
    setTimeout(removeCalPanel, 4500);
  }
  function buildCalPanel() {
    removeCalPanel();
    const p = document.createElement("div"); p.id = "__wp_cal";
    Object.assign(p.style, { position: "fixed", left: "50%", bottom: "18px", transform: "translateX(-50%)",
      zIndex: "2147483647", background: "#0f172a", color: "#e2e8f0", border: "2px solid #16a34a",
      borderRadius: "14px", padding: "16px 18px", width: "min(440px,92vw)", boxShadow: "0 14px 50px rgba(0,0,0,.5)",
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", textAlign: "center" });
    const h = document.createElement("div");
    Object.assign(h.style, { fontWeight: "800", fontSize: "15px", marginBottom: "6px" });
    h.textContent = "🎯 Calibrating the aim";
    calMsgEl = document.createElement("div");
    Object.assign(calMsgEl.style, { fontSize: "13px", color: "#cbd5e1", lineHeight: "1.45", marginBottom: "12px" });
    const row = document.createElement("div");
    Object.assign(row.style, { display: "flex", gap: "8px", justifyContent: "center", alignItems: "center" });
    const lbl = document.createElement("span"); lbl.textContent = "Landed on #"; lbl.style.fontSize = "13px";
    calInputEl = document.createElement("input"); calInputEl.type = "number"; calInputEl.min = "1";
    Object.assign(calInputEl.style, { width: "64px", padding: "8px", fontSize: "15px", borderRadius: "8px",
      border: "1px solid #334155", background: "#1e293b", color: "#fff", textAlign: "center" });
    const submit = function () { const v = parseInt(calInputEl.value, 10); if (v >= 1) { calInputEl.value = ""; calStep(v); } };
    calInputEl.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    const next = document.createElement("button"); next.textContent = "Next";
    Object.assign(next.style, { background: "#16a34a", color: "#fff", border: "none", borderRadius: "8px",
      padding: "9px 16px", fontWeight: "700", fontSize: "14px", cursor: "pointer" });
    next.addEventListener("click", submit);
    row.appendChild(lbl); row.appendChild(calInputEl); row.appendChild(next);
    const cancel = document.createElement("button"); cancel.textContent = "cancel";
    Object.assign(cancel.style, { display: "block", margin: "10px auto 0", background: "none", border: "none", color: "#94a3b8", fontSize: "12px", cursor: "pointer" });
    cancel.addEventListener("click", function () { state.forceIndex = -1; cal = null; removeCalPanel(); });
    p.appendChild(h); p.appendChild(calMsgEl); p.appendChild(row); p.appendChild(cancel);
    (document.body || document.documentElement).appendChild(p);
    calPanel = p;
  }
  function calRender(msg) { if (calMsgEl) calMsgEl.textContent = msg; if (calInputEl) calInputEl.focus(); }
  function removeCalPanel() { if (calPanel && calPanel.parentNode) calPanel.parentNode.removeChild(calPanel); calPanel = null; }

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
    if (cal) return; // ignore number keys while calibrating
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
      if (cal) return; // during calibration keep our own aim/delta — ignore pushes
      if (typeof d.enabled === "boolean") state.enabled = d.enabled;
      if (typeof d.forceIndex === "number") state.forceIndex = d.forceIndex;
      if (typeof d.delta === "number" && d.delta > 0 && d.delta < 1) state.delta = d.delta;
      if (typeof d.wobble === "number" && d.wobble >= 0 && d.wobble <= 1) state.wobble = d.wobble;
    } else if (d.type === "getEntries") {
      window.postMessage({ [TAG]: true, dir: "to-iso", type: "entries", entries: readEntries() }, "*");
    } else if (d.type === "startCal") {
      calStart();
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
