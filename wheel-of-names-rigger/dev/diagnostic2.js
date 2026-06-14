/* ============================================================================
 * Wheel Rigger — deep probe v2 (Vue 3).  Paste into the console, press Enter.
 * Walks the whole Vue 3 component tree (unwrapping refs) and finds the wheel by
 * BEHAVIOUR, not by property name, then reports its shape. Send the output back.
 * (No spin needed for this one — it just inspects.)
 * ========================================================================== */
(() => {
  const log = (...a) => console.log("%c[WR2]", "color:#16a34a;font-weight:bold", ...a);
  const seen = new WeakSet();
  const candidates = [];

  const isRef = (v) => v && typeof v === "object" && ("__v_isRef" in v || ("value" in v && "_value" in v));
  const unref = (v) => (isRef(v) ? v.value : v);

  function methodsOf(o) {
    const names = new Set();
    let p = Object.getPrototypeOf(o);
    let depth = 0;
    while (p && p !== Object.prototype && depth < 4) {
      for (const n of Object.getOwnPropertyNames(p)) {
        if (n === "constructor") continue;
        try { if (typeof p[n] === "function") names.add(n); } catch {}
      }
      p = Object.getPrototypeOf(p);
      depth++;
    }
    return [...names];
  }

  function bodyHasAngleRandom(o) {
    for (const m of methodsOf(o)) {
      let src = "";
      try { src = Function.prototype.toString.call(Object.getPrototypeOf(o)[m]); } catch { continue; }
      if (/\.angle\s*=/.test(src) && /(getRandomValues|Math\.random|Math\.PI)/.test(src)) return m;
    }
    return null;
  }

  function score(o) {
    if (!o || typeof o !== "object") return null;
    const keys = (() => { try { return Object.keys(o); } catch { return []; } })();
    const methods = methodsOf(o);
    const mset = new Set(methods);
    const wheelMethods = methods.filter((m) => /setRandomPosition|getEntryAtPointer|getIndexAtPointer|spinIsDone|getStateTimeLengths|setRandomPos/.test(m));
    const tickDraw = (mset.has("tick") ? 1 : 0) + (mset.has("draw") ? 1 : 0);
    const angleSpeed = (("angle" in o) ? 1 : 0) + (("speed" in o) ? 1 : 0);
    const hasPicker = ("entryPicker" in o) || keys.some((k) => /entr|pick|slice/i.test(k)) ? 1 : 0;
    const angleSetter = bodyHasAngleRandom(o);
    const s = wheelMethods.length * 3 + tickDraw * 2 + angleSpeed * 2 + hasPicker * 2 + (angleSetter ? 4 : 0);
    if (s < 3) return null;
    return { s, keys, methods, wheelMethods, angleSetter };
  }

  function walk(o, path, depth) {
    if (depth > 6) return;
    o = unref(o);
    if (!o || typeof o !== "object" || seen.has(o)) return;
    try { seen.add(o); } catch { return; }
    const sc = score(o);
    if (sc) candidates.push({ path, ...sc, obj: o });
    let keys = [];
    try { keys = Object.keys(o); } catch {}
    for (const k of keys) {
      if (depth >= 3 && /^[_$]|^[A-Z]/.test(k)) continue;
      let v; try { v = o[k]; } catch { continue; }
      if (v && typeof v === "object") walk(v, path + "." + k, depth + 1);
    }
  }

  // ---- find a Vue 3 instance from the canvas, then get the root instance ----
  const canvas = document.querySelector("canvas");
  log("canvas:", canvas ? canvas.width + "x" + canvas.height + " id=" + (canvas.id || "(none)") + " class=" + (canvas.className || "(none)") : "none");
  let inst = null, el = canvas;
  while (el) { if (el.__vueParentComponent) { inst = el.__vueParentComponent; break; } el = el.parentElement; }
  if (!inst) {
    const host = [...document.querySelectorAll("*")].find((e) => e.__vue_app__);
    inst = host && host.__vue_app__ && host.__vue_app__._instance;
  }
  if (!inst) { log("No Vue 3 instance found at all."); return; }
  const root = inst.root || inst;
  log("reached Vue3 root instance:", !!root, "type:", (root.type && (root.type.__name || root.type.name)) || "?");

  // ---- collect every component instance via subTree ----
  const instances = [];
  const cseen = new WeakSet();
  (function collect(i) {
    if (!i || cseen.has(i)) return; cseen.add(i); instances.push(i);
    const vis = (vn) => {
      if (!vn) return;
      if (vn.component) collect(vn.component);
      const ch = vn.children;
      if (Array.isArray(ch)) ch.forEach(vis);
    };
    vis(i.subTree);
  })(root);
  log("component instances in tree:", instances.length);

  // ---- search each instance's state buckets ----
  for (const i of instances) {
    const name = (i.type && (i.type.__name || i.type.name)) || "anon";
    for (const bucket of ["setupState", "data", "props", "ctx"]) {
      if (i[bucket]) walk(i[bucket], name + "." + bucket, 0);
    }
    if (i.proxy) {
      try { for (const k of Object.keys(i.proxy)) { let v; try { v = i.proxy[k]; } catch { continue; } if (v && typeof v === "object") walk(v, name + ".proxy." + k, 1); } } catch {}
    }
  }

  candidates.sort((a, b) => b.s - a.s);
  log("=== candidates:", candidates.length, "===");
  candidates.slice(0, 6).forEach((c, i) => {
    log(`#${i} score=${c.s} path=${c.path}`);
    log("   keys:", c.keys.join(","));
    log("   methods:", c.methods.join(","));
    if (c.angleSetter) log("   >>> angle-setter method:", c.angleSetter);
    if (c.wheelMethods.length) log("   >>> wheel methods:", c.wheelMethods.join(","));
  });
  window.__WR = candidates;
  if (candidates[0]) { window.__wheel = candidates[0].obj; log("Best candidate saved as window.__wheel"); }
  log("=== copy all [WR2] lines and send them back ===");
})();
