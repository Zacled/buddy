/*
 * main-world.js  (runs in the PAGE's JS context on wheelofnames.com)
 *
 * wheelofnames.com is the open-source app github.com/momander/wheel-spinner.
 * The winner is purely a function of the wheel's final rotation `angle`:
 * when a spin transitions from "accelerating" to "decelerating", the app sets
 *
 *     this.angle = Math.random() * 2 * Math.PI;          // Wheel.js -> setRandomPosition()
 *
 * and then decelerates by a FULLY DETERMINISTIC amount before reading the
 * entry under the pointer (Util.getIndexAtPointer). The on-screen pointer and
 * the announced winner both read that same `angle`, so if we choose the
 * pre-deceleration angle correctly, the wheel *visibly* glides to our target
 * and announces it — no snapping, no mismatch.
 *
 * We therefore override setRandomPosition: let it run, then replace `angle`
 * with (targetAngle - decelerationTravel), so after the deceleration it lands
 * exactly on the chosen name. Everything else is untouched, so it looks normal.
 */
(function () {
  "use strict";

  const TAG = "__wheelRig";
  const TWO_PI = 2 * Math.PI;
  const STOP_SPEED = 0.00015; // Wheel.js DeceleratingState stopSpeed

  const RIG = { enabled: false, target: "" };
  let patched = false;

  function norm(s) {
    return (s == null ? "" : String(s)).replace(/\s+/g, " ").trim().toLowerCase();
  }

  // Inverse of Util.getIndexAtPointer: given the display entries and a target
  // index, return an `angle` that puts that index under the pointer.
  function angleForIndex(entries, t) {
    const N = entries.length;
    if (N === 0) return 0;
    const weighted = !!(entries[0] && entries[0].weight);
    if (!weighted) {
      // index = Math.round(angle / (TWO_PI / N))  ->  pick the segment center.
      return (((t % N) * (TWO_PI / N)) % TWO_PI + TWO_PI) % TWO_PI;
    }
    // Weighted wheel: rebuild the cumulative boundary array exactly as the app.
    let totalWeight = 0;
    for (const e of entries) totalWeight += e.weight || 0;
    const radians = entries.map((e) => (TWO_PI * (e.weight || 0)) / totalWeight);
    const endRadians = [];
    let endAngle = radians[0] / 2;
    for (let i = 0; i < entries.length; i++) {
      endRadians.push(endAngle);
      endAngle += radians[i + 1] || 0;
    }
    if (t <= 0) return endRadians[0] / 2; // squarely inside the first segment
    const lower = endRadians[t - 1];
    const upper = t < endRadians.length ? endRadians[t] : TWO_PI;
    return (lower + upper) / 2; // segment midpoint -> maximum tolerance
  }

  // How far the wheel will rotate from setRandomPosition() until it stops.
  // Reproduces Wheel.js: one advance at startSpeed (r^0) plus decelTicks
  // advances at startSpeed*r^k, k = 1..decelTicks, where
  //   r = exp(ln(stopSpeed / startSpeed) / decelTicks).
  function decelerationTravel(wheel) {
    const startSpeed = wheel.speed; // == final accelerating speed at this moment
    let decelTicks;
    try {
      decelTicks = wheel.getStateTimeLengths().decelerating;
    } catch (e) {
      decelTicks = 540; // default: spinTime 10 -> 600 ticks - 60 accel
    }
    if (!(startSpeed > 0) || !(decelTicks > 0)) return 0;
    const r = Math.exp(Math.log(STOP_SPEED / startSpeed) / decelTicks);
    // sum_{k=0}^{decelTicks} startSpeed * r^k
    return (startSpeed * (1 - Math.pow(r, decelTicks + 1))) / (1 - r);
  }

  function findTargetIndex(entries, name) {
    const want = norm(name);
    if (!want) return -1;
    let partial = -1;
    for (let i = 0; i < entries.length; i++) {
      const txt = norm(entries[i] && entries[i].text);
      if (txt === want) return i;
      if (partial < 0 && txt && txt.indexOf(want) !== -1) partial = i;
    }
    return partial;
  }

  function applyRig(wheel) {
    if (!RIG.enabled || !RIG.target) return;
    let entries;
    try {
      entries = wheel.entryPicker.getDisplayEntries();
    } catch (e) {
      return;
    }
    if (!entries || !entries.length) return;
    const idx = findTargetIndex(entries, RIG.target);
    if (idx < 0) return; // target not on the wheel right now -> behave normally
    const targetAngle = angleForIndex(entries, idx);
    const D = decelerationTravel(wheel);
    wheel.angle = (((targetAngle - D) % TWO_PI) + TWO_PI) % TWO_PI;
  }

  // Find setRandomPosition by name, or (if minified differently) by its
  // unmistakable body: `... = Math.random() * 2 * Math.PI`.
  function locateAngleSetter(proto) {
    if (typeof proto.setRandomPosition === "function") return "setRandomPosition";
    for (const n of Object.getOwnPropertyNames(proto)) {
      if (n === "constructor") continue;
      let fn;
      try {
        fn = proto[n];
      } catch (e) {
        continue;
      }
      if (typeof fn !== "function") continue;
      let src = "";
      try {
        src = Function.prototype.toString.call(fn);
      } catch (e) {
        continue;
      }
      if (/Math\.random\(\)\s*\*\s*2\s*\*\s*Math\.PI/.test(src)) return n;
      if (/\.angle\s*=\s*Math\.random\(\)/.test(src)) return n;
    }
    return null;
  }

  function patch(wheel) {
    if (patched) return true;
    const proto = Object.getPrototypeOf(wheel);
    if (!proto) return false;
    const key = locateAngleSetter(proto);
    if (!key) return false;
    const orig = proto[key];
    proto[key] = function () {
      const ret = orig.apply(this, arguments);
      try {
        applyRig(this);
      } catch (e) {
        /* fail open: a thrown error just leaves the spin fair */
      }
      return ret;
    };
    patched = true;
    return true;
  }

  // The wheel instance lives on the spinningwheel.vue component as `myWheel`.
  function getWheel() {
    const canvas = document.getElementById("wheelCanvas");
    let el = canvas;
    while (el) {
      const v = el.__vue__;
      if (v && v.myWheel && typeof v.myWheel.tick === "function") return v.myWheel;
      el = el.parentElement;
    }
    const root = document.getElementById("app");
    const start = root && root.__vue__;
    if (start) {
      const stack = [start];
      const seen = new Set();
      while (stack.length) {
        const c = stack.pop();
        if (!c || seen.has(c)) continue;
        seen.add(c);
        if (c.myWheel && typeof c.myWheel.tick === "function") return c.myWheel;
        if (c.$children) for (const ch of c.$children) stack.push(ch);
      }
    }
    return null;
  }

  function getCurrentNames() {
    const w = getWheel();
    if (!w) return [];
    try {
      return w.entryPicker
        .getDisplayEntries()
        .map((e) => (e && e.text ? e.text : ""))
        .filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  // --- messaging with the isolated-world bridge ---
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d[TAG] !== true || d.dir !== "to-main") return;
    if (d.type === "config") {
      RIG.enabled = !!d.enabled;
      RIG.target = d.target || "";
    } else if (d.type === "getNames") {
      window.postMessage(
        { [TAG]: true, dir: "to-iso", type: "names", names: getCurrentNames() },
        "*"
      );
    }
  });

  function announceReady() {
    window.postMessage({ [TAG]: true, dir: "to-iso", type: "ready" }, "*");
  }

  // Poll until the wheel exists, then patch its prototype once.
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    const w = getWheel();
    if (w && patch(w)) {
      announceReady(); // ask the bridge to (re)send the current config
      clearInterval(timer);
    } else if (tries > 240) {
      clearInterval(timer); // give up after ~2 min
    }
  }, 500);

  announceReady();
})();
