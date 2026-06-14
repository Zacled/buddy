/* ============================================================================
 * Wheel Rigger — probe v3 (Vue 3, production).  Paste, set TARGET, Enter, SPIN.
 * Seeds from ANY Vue-tagged element, walks the whole component tree, finds the
 * wheel by behaviour, reports it, and installs an angle-only test rig.
 * Then send back the [WR3] lines AND tell me the name it landed on.
 * ========================================================================== */
(() => {
  const TARGET = "Ali"; // <-- CHANGE to the name you want to win

  const TWO_PI = 2 * Math.PI, STOP = 0.00015;
  const log = (...a) => console.log("%c[WR3]", "color:#16a34a;font-weight:bold", ...a);
  const norm = (s) => (s == null ? "" : String(s)).replace(/\s+/g, " ").trim().toLowerCase();
  const isRef = (v) => v && typeof v === "object" && ("__v_isRef" in v || ("value" in v && "_value" in v));
  const unref = (v) => (isRef(v) ? v.value : v);

  function methodsOf(o) {
    const out = new Set(); let p = Object.getPrototypeOf(o), d = 0;
    while (p && p !== Object.prototype && d < 4) {
      for (const n of Object.getOwnPropertyNames(p)) { if (n === "constructor") continue; try { if (typeof p[n] === "function") out.add(n); } catch {} }
      p = Object.getPrototypeOf(p); d++;
    }
    return [...out];
  }
  function angleSetter(o) {
    const pr = Object.getPrototypeOf(o);
    for (const m of methodsOf(o)) { let s = ""; try { s = Function.prototype.toString.call(pr[m]); } catch { continue; } if (/\.angle\s*=/.test(s) && /(getRandomValues|Math\.random|Math\.PI)/.test(s)) return m; }
    return null;
  }
  function score(o) {
    if (!o || typeof o !== "object") return null;
    let keys = []; try { keys = Object.keys(o); } catch {}
    const M = methodsOf(o), ms = new Set(M);
    const wm = M.filter((m) => /setRandomPosition|getEntryAtPointer|getIndexAtPointer|spinIsDone|getStateTimeLengths/.test(m));
    const td = (ms.has("tick") ? 1 : 0) + (ms.has("draw") ? 1 : 0);
    const as = (("angle" in o) ? 1 : 0) + (("speed" in o) ? 1 : 0);
    const hp = (("entryPicker" in o) || keys.some((k) => /entr|pick|slice/i.test(k))) ? 1 : 0;
    const ang = angleSetter(o);
    const s = wm.length * 3 + td * 2 + as * 2 + hp * 2 + (ang ? 4 : 0);
    return s < 4 ? null : { s, keys, methods: M, wm, ang };
  }

  const seen = new WeakSet(), cand = [];
  function walk(o, path, d) {
    if (d > 6) return; o = unref(o);
    if (!o || typeof o !== "object" || seen.has(o)) return;
    try { seen.add(o); } catch { return; }
    const sc = score(o); if (sc) cand.push({ path, ...sc, obj: o });
    let keys = []; try { keys = Object.keys(o); } catch {}
    for (const k of keys) { if (d >= 3 && /^[_$]|^[A-Z]/.test(k)) continue; let v; try { v = o[k]; } catch { continue; } if (v && typeof v === "object") walk(v, path + "." + k, d + 1); }
  }

  // ---- seed Vue 3 instances from ANY tagged element ----
  const canvas = document.querySelector("canvas");
  log("canvas:", canvas ? canvas.width + "x" + canvas.height + " id=" + (canvas.id || "(none)") : "none");
  const roots = new Set(); let tagged = 0;
  document.querySelectorAll("*").forEach((el) => {
    const i = el.__vueParentComponent;
    if (i) { tagged++; roots.add(i.root || i); }
    if (el.__vue_app__ && el.__vue_app__._instance) roots.add(el.__vue_app__._instance);
  });
  log("elements with Vue internals:", tagged, "| roots:", roots.size);
  if (!roots.size) { log("Still no Vue 3 root. The app may isolate it (shadow DOM / iframe)."); return; }

  // ---- collect all component instances via subTree ----
  const insts = new Set();
  (function add(set) { set.forEach(collect); })(roots);
  function collect(i) {
    if (!i || insts.has(i)) return; insts.add(i);
    const vis = (vn) => {
      if (!vn) return;
      if (vn.component) collect(vn.component);
      const ch = vn.children;
      if (Array.isArray(ch)) ch.forEach(vis);
      else if (ch && typeof ch === "object") for (const k in ch) { const s = ch[k]; if (Array.isArray(s)) s.forEach(vis); }
    };
    vis(i.subTree);
  }
  log("components in tree:", insts.size);

  for (const i of insts) {
    const name = (i.type && (i.type.__name || i.type.name)) || "anon";
    for (const b of ["setupState", "data", "props", "ctx", "exposed"]) if (i[b]) walk(i[b], name + "." + b, 0);
    if (i.proxy) { try { for (const k of Object.keys(i.proxy)) { let v; try { v = i.proxy[k]; } catch { continue; } if (v && typeof v === "object") walk(v, name + ".proxy." + k, 1); } } catch {} }
  }

  cand.sort((a, b) => b.s - a.s);
  log("=== candidates:", cand.length, "===");
  cand.slice(0, 5).forEach((c, i) => {
    log(`#${i} score=${c.s} path=${c.path}`);
    log("   methods:", c.methods.join(","));
    if (c.ang) log("   >>> angle-setter:", c.ang);
    if (c.wm.length) log("   >>> wheel methods:", c.wm.join(","));
  });
  if (!cand.length) { log("No wheel-like object found. Send the lines above back."); return; }

  // ---- install angle-only test rig on the best candidate ----
  const wheel = cand[0].obj; window.__wheel = wheel;
  const proto = Object.getPrototypeOf(wheel);
  const key = cand[0].ang || (typeof proto.setRandomPosition === "function" ? "setRandomPosition" : null);
  if (!key) { log("Found wheel but no angle-setter to hook. Send lines back."); return; }

  function entriesOf(w) { try { return w.entryPicker.getDisplayEntries(); } catch { return null; } }
  function angleForIndex(es, t) {
    const N = es.length; if (!N) return 0;
    const w = !!(es[0] && es[0].weight);
    if (!w) return ((((t % N) * (TWO_PI / N)) % TWO_PI) + TWO_PI) % TWO_PI;
    let tw = 0; for (const e of es) tw += e.weight || 0;
    const r = es.map((e) => (TWO_PI * (e.weight || 0)) / tw), end = []; let a = r[0] / 2;
    for (let i = 0; i < es.length; i++) { end.push(a); a += r[i + 1] || 0; }
    if (t <= 0) return end[0] / 2;
    return (end[t - 1] + (t < end.length ? end[t] : TWO_PI)) / 2;
  }
  function decel(w) { const s = w.speed; let n; try { n = w.getStateTimeLengths().decelerating; } catch { n = 540; } if (!(s > 0) || !(n > 0)) return 0; const r = Math.exp(Math.log(STOP / s) / n); return (s * (1 - Math.pow(r, n + 1))) / (1 - r); }
  function tIdx(es) { const want = norm(TARGET); if (!want) return -1; let p = -1; for (let i = 0; i < es.length; i++) { const t = norm(es[i] && es[i].text); if (t === want) return i; if (p < 0 && t && t.indexOf(want) !== -1) p = i; } return p; }

  const es0 = entriesOf(wheel);
  log("entries readable:", !!es0, es0 ? "(" + es0.map((e) => e && e.text).join(" | ") + ")" : "");
  log("hooking method:", key, "| getStateTimeLengths:", typeof wheel.getStateTimeLengths === "function");

  if (!proto.__wr3) {
    const orig = proto[key];
    proto[key] = function () {
      const ret = orig.apply(this, arguments);
      try {
        const es = entriesOf(this); if (!es) return ret;
        const idx = tIdx(es); if (idx < 0) return ret;
        const ta = angleForIndex(es, idx), D = decel(this);
        this.angle = (((ta - D) % TWO_PI) + TWO_PI) % TWO_PI;
      } catch (e) { console.log("[WR3] override error:", e.message); }
      return ret;
    };
    proto.__wr3 = true;
    log("TEST RIG INSTALLED (angle-only). SPIN now — should land on:", TARGET);
  } else log("rig already installed — spin. target:", TARGET);
  log("=== send these [WR3] lines + what it landed on ===");
})();
