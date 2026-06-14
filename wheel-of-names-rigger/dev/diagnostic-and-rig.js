/* ============================================================================
 * Wheel Rigger — live diagnostic + test rig  (paste into the browser console)
 *
 * HOW TO USE:
 *   1. Open your wheelofnames.com tab with the names on it.
 *   2. Press F12 (or Cmd+Option+I) -> "Console" tab.
 *   3. Edit the TARGET line below to the name you want to win.
 *   4. Paste this whole thing, press Enter.
 *   5. Spin the wheel once.
 *   6. Copy ALL the green [WheelRig] lines from the console and send them back,
 *      and tell me which name it landed on.
 * ========================================================================== */
(() => {
  const TARGET = "Ali"; // <-- CHANGE THIS to the name you want to always win

  const TWO_PI = 2 * Math.PI;
  const STOP_SPEED = 0.00015;
  const out = [];
  const log = (...a) => {
    out.push(a.map(String).join(" "));
    console.log("%c[WheelRig]", "color:#16a34a;font-weight:bold", ...a);
  };

  const norm = (s) => (s == null ? "" : String(s)).replace(/\s+/g, " ").trim().toLowerCase();

  // ---------- discovery ----------
  function looksLikeWheel(o) {
    if (!o || typeof o !== "object") return false;
    const hasPicker = "entryPicker" in o;
    const hasAngle = "angle" in o || "speed" in o || "state" in o;
    const hasMethod =
      typeof o.setRandomPosition === "function" ||
      typeof o.getEntryAtPointer === "function" ||
      typeof o.getIndexAtPointer === "function";
    return hasPicker && (hasAngle || hasMethod);
  }

  function scanContainer(c, hint, hits) {
    if (!c || typeof c !== "object") return;
    const buckets = [c, c.proxy, c.data, c.ctx, c.setupState, c._data, c.$data].filter(Boolean);
    for (const b of buckets) {
      try {
        if (b.myWheel && looksLikeWheel(b.myWheel)) hits.push({ wheel: b.myWheel, how: hint + ".myWheel" });
        for (const k of Object.keys(b)) {
          let v;
          try { v = b[k]; } catch { continue; }
          if (looksLikeWheel(v)) hits.push({ wheel: v, how: hint + "." + k });
        }
      } catch {}
    }
  }

  const canvases = [...document.querySelectorAll("canvas")];
  log("canvases:", canvases.map((c) => "#" + (c.id || "(none)") + " " + c.width + "x" + c.height).join(", ") || "none");

  const all = [...document.querySelectorAll("*")];
  const anyVue2 = all.some((e) => e.__vue__);
  const anyVue3 = all.some((e) => e.__vueParentComponent || e.__vue_app__);
  log("framework: Vue2(__vue__)=" + anyVue2 + "  Vue3(__vueParentComponent)=" + anyVue3);

  const hits = [];
  for (const cv of canvases) {
    let el = cv;
    while (el) {
      if (el.__vue__) scanContainer(el.__vue__, "canvas^.__vue__", hits);
      if (el.__vueParentComponent) scanContainer(el.__vueParentComponent, "canvas^.__vueParentComponent", hits);
      el = el.parentElement;
    }
  }
  if (!hits.length) for (const el of all) {
    if (el.__vue__) scanContainer(el.__vue__, "*.__vue__", hits);
    if (el.__vueParentComponent) scanContainer(el.__vueParentComponent, "*.__vueParentComponent", hits);
    if (hits.length) break;
  }
  if (!hits.length) for (const k of Object.keys(window)) {
    let v; try { v = window[k]; } catch { continue; }
    if (looksLikeWheel(v)) hits.push({ wheel: v, how: "window." + k });
  }

  if (!hits.length) {
    log("RESULT: could NOT find the wheel object. Structure may have changed or names are minified.");
    log("=== send everything above back ===");
    return;
  }

  const wheel = hits[0].wheel;
  log("FOUND wheel via:", hits[0].how);
  log("instance keys:", Object.keys(wheel).join(", "));
  const proto = Object.getPrototypeOf(wheel) || {};
  log("prototype methods:", Object.getOwnPropertyNames(proto).filter((n) => n !== "constructor").join(", "));
  log("has setRandomPosition:", typeof wheel.setRandomPosition === "function");
  log("has getStateTimeLengths:", typeof wheel.getStateTimeLengths === "function");
  const epOk = !!(wheel.entryPicker && typeof wheel.entryPicker.getDisplayEntries === "function");
  log("entryPicker.getDisplayEntries:", epOk);
  let entries = [];
  try { entries = wheel.entryPicker.getDisplayEntries(); } catch (e) { log("entries read error:", e.message); }
  log("entries(" + entries.length + "):", entries.map((e) => e && e.text).join(" | "));

  // ---------- rig math ----------
  function angleForIndex(es, t) {
    const N = es.length;
    if (!N) return 0;
    const weighted = !!(es[0] && es[0].weight);
    if (!weighted) return ((((t % N) * (TWO_PI / N)) % TWO_PI) + TWO_PI) % TWO_PI;
    let tw = 0;
    for (const e of es) tw += e.weight || 0;
    const rad = es.map((e) => (TWO_PI * (e.weight || 0)) / tw);
    const end = [];
    let a = rad[0] / 2;
    for (let i = 0; i < es.length; i++) { end.push(a); a += rad[i + 1] || 0; }
    if (t <= 0) return end[0] / 2;
    const lo = end[t - 1], hi = t < end.length ? end[t] : TWO_PI;
    return (lo + hi) / 2;
  }
  function decelTravel(w) {
    const start = w.speed;
    let ticks;
    try { ticks = w.getStateTimeLengths().decelerating; } catch { ticks = 540; }
    if (!(start > 0) || !(ticks > 0)) return 0;
    const r = Math.exp(Math.log(STOP_SPEED / start) / ticks);
    return (start * (1 - Math.pow(r, ticks + 1))) / (1 - r);
  }
  function targetIndex(es) {
    const want = norm(TARGET);
    if (!want) return -1;
    let p = -1;
    for (let i = 0; i < es.length; i++) {
      const t = norm(es[i] && es[i].text);
      if (t === want) return i;
      if (p < 0 && t && t.indexOf(want) !== -1) p = i;
    }
    return p;
  }

  // ---------- locate the angle-setter (named, or by body) ----------
  function locateSetter(pr) {
    if (typeof pr.setRandomPosition === "function") return "setRandomPosition";
    for (const n of Object.getOwnPropertyNames(pr)) {
      if (n === "constructor") continue;
      let fn; try { fn = pr[n]; } catch { continue; }
      if (typeof fn !== "function") continue;
      let src = ""; try { src = Function.prototype.toString.call(fn); } catch { continue; }
      if (/\.angle\s*=/.test(src) && /(random|getRandomValues|Math\.PI)/i.test(src)) return n;
    }
    return null;
  }

  const setterKey = locateSetter(proto);
  log("angle-setter method:", setterKey || "NOT FOUND");

  if (!setterKey) {
    log("Could not find the angle setter to hook. Send the lines above back.");
    return;
  }

  // ---------- install the test rig (also forces the announced winner) ----------
  if (!proto.__wheelRigTest) {
    const origSetter = proto[setterKey];
    proto[setterKey] = function () {
      const ret = origSetter.apply(this, arguments);
      try {
        const es = this.entryPicker.getDisplayEntries();
        const idx = targetIndex(es);
        if (idx >= 0) {
          const tAngle = angleForIndex(es, idx);
          const D = decelTravel(this);
          this.angle = (((tAngle - D) % TWO_PI) + TWO_PI) % TWO_PI;
          this.__rigForce = es[idx];
        } else {
          this.__rigForce = null;
        }
      } catch (e) { console.log("[WheelRig] override error:", e.message); }
      return ret;
    };
    // Safety net: also force the announced winner, in case the deceleration
    // physics differ slightly from the open-source version.
    if (typeof proto.getEntryAtPointer === "function") {
      const origGet = proto.getEntryAtPointer;
      proto.getEntryAtPointer = function () {
        if (this.__rigForce) return this.__rigForce;
        return origGet.apply(this, arguments);
      };
    }
    proto.__wheelRigTest = true;
    log("TEST RIG INSTALLED. Now SPIN the wheel — it should land on:", TARGET);
  } else {
    log("Test rig already installed. Spin again — target:", TARGET);
  }

  log("=== copy all [WheelRig] lines above and send them back ===");
})();
