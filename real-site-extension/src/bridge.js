/*
 * bridge.js  (isolated content-script world)
 * Syncs config from chrome.storage into the page — but only forwards the
 * "active" state if a valid activation code is stored. Also relays the popup's
 * "what names are on the wheel?" request.
 */
(function () {
  "use strict";
  const TAG = "__wnrig";
  let latestEntries = [];
  let pending = null;
  let warnEl = null, warnBig = null, warnDismissN = 0; // on-page warning overlay

  function ctxAlive() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  }
  // Tri-state checks: { ok:false } means we couldn't reach the background worker —
  // most often because the extension was reloaded and this script is now an orphan
  // on a tab that wasn't refreshed. We treat "can't confirm" as "do NOT rig".
  function checkRevoked(jti) {
    return new Promise((resolve) => {
      try {
        if (!ctxAlive()) return resolve({ ok: false });
        chrome.runtime.sendMessage({ type: "isRevoked", jti }, (resp) => {
          if (chrome.runtime.lastError || !resp) resolve({ ok: false });
          else resolve({ ok: true, revoked: !!resp.revoked });
        });
      } catch (e) { resolve({ ok: false }); }
    });
  }
  function checkStatus(jti, deviceId) {
    return new Promise((resolve) => {
      try {
        if (!ctxAlive()) return resolve({ ok: false });
        chrome.runtime.sendMessage({ type: "codeStatus", jti, deviceId }, (r) => {
          if (chrome.runtime.lastError || !r) resolve({ ok: false });
          else resolve({ ok: true, state: r.state, n: r.n || 0 });
        });
      } catch (e) { resolve({ ok: false }); }
    });
  }
  // Returns { activated, warnN }. activated gates the rigging; warnN (1-3) drives
  // the big on-page warning the owner sees when their code is used elsewhere.
  async function evalState() {
    try {
      if (!ctxAlive()) return { activated: false, warnN: 0 }; // extension reloaded/disabled
      const c = await chrome.storage.local.get(["licenseCode", "deviceId"]);
      if (!c.licenseCode) return { activated: false, warnN: 0 };
      if (!(await self.WPLicense.verify(c.licenseCode))) return { activated: false, warnN: 0 }; // bad sig/expired
      const inf = await self.WPLicense.info(c.licenseCode);
      if (inf && inf.dev && inf.dev !== c.deviceId) return { activated: false, warnN: 0 }; // other device
      if (!(inf && inf.jti)) return { activated: true, warnN: 0 };
      const r = await checkRevoked(inf.jti);
      if (!r.ok || r.revoked) return { activated: false, warnN: 0 }; // unconfirmable or revoked -> off
      const s = await checkStatus(inf.jti, c.deviceId);
      if (s.ok && (s.state === "dead" || s.state === "blocked")) return { activated: false, warnN: 0 };
      const warnN = (s.ok && s.state === "warn") ? (s.n || 1) : 0;
      return { activated: true, warnN: warnN };
    } catch (e) { return { activated: false, warnN: 0 }; }
  }

  // ---- big on-page warning overlay (the owner sees this on wheelofnames.com
  // when their code gets used on another computer) ----
  function buildWarn() {
    const wrap = document.createElement("div");
    wrap.id = "__wp_warn_overlay";
    Object.assign(wrap.style, {
      position: "fixed", inset: "0", zIndex: "2147483647", background: "rgba(0,0,0,0.6)",
      display: "none", alignItems: "center", justifyContent: "center",
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
    });
    const card = document.createElement("div");
    Object.assign(card.style, {
      background: "#7f1d1d", color: "#fff", border: "2px solid #dc2626", borderRadius: "18px",
      padding: "34px 30px", width: "min(460px, 88vw)", textAlign: "center",
      boxShadow: "0 24px 70px rgba(0,0,0,0.55)"
    });
    warnBig = document.createElement("div");
    Object.assign(warnBig.style, { fontSize: "44px", fontWeight: "800", lineHeight: "1.1", margin: "0 0 16px" });
    const txt = document.createElement("div");
    Object.assign(txt.style, { fontSize: "16px", lineHeight: "1.55", color: "#fecaca", margin: "0 0 26px" });
    txt.textContent = "Your code was used on another computer. Don't share it — on the 3rd time it's permanently deactivated for everyone.";
    const btn = document.createElement("button");
    btn.type = "button"; btn.textContent = "Dismiss";
    Object.assign(btn.style, {
      background: "#fff", color: "#7f1d1d", border: "none", borderRadius: "11px",
      padding: "14px 22px", fontSize: "17px", fontWeight: "800", cursor: "pointer", width: "100%"
    });
    btn.addEventListener("click", () => {
      if (ctxAlive()) chrome.storage.local.set({ ackWarn: warnDismissN });
      hideWarn();
    });
    card.appendChild(warnBig); card.appendChild(txt); card.appendChild(btn);
    wrap.appendChild(card);
    (document.body || document.documentElement).appendChild(wrap);
    return wrap;
  }
  function showWarn(n) {
    warnDismissN = n;
    if (!warnEl || !document.documentElement.contains(warnEl)) warnEl = buildWarn();
    warnBig.textContent = "⚠ Warning " + n + " of 3";
    warnEl.style.display = "flex";
  }
  function hideWarn() { if (warnEl) warnEl.style.display = "none"; }

  async function push() {
    // Orphaned (extension reloaded without refreshing this tab): actively tell the
    // page to stop rigging instead of leaving it on a stale "activated" flag.
    if (!ctxAlive()) {
      window.postMessage({ [TAG]: true, dir: "to-main", type: "config", activated: false, enabled: true, forceIndex: -1, delta: 0.363 }, "*");
      hideWarn();
      return;
    }
    const c = await chrome.storage.local.get(["enabled", "forceIndex", "delta", "ackWarn", "wobble"]);
    const st = await evalState();
    window.postMessage({
      [TAG]: true, dir: "to-main", type: "config",
      activated: st.activated,
      enabled: c.enabled !== false,
      forceIndex: typeof c.forceIndex === "number" ? c.forceIndex : -1,
      delta: typeof c.delta === "number" ? c.delta : 0.363,
      wobble: typeof c.wobble === "number" ? c.wobble : 0.45,
    }, "*");
    // big on-page warning for the owner whose code is being shared
    if (st.warnN > 0 && st.warnN > (c.ackWarn || 0)) showWarn(st.warnN);
    else hideWarn();
  }

  function setIndex(index) {
    chrome.storage.local.set({ forceIndex: index });
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d[TAG] !== true || d.dir !== "to-iso") return;
    if (d.type === "ready") push();
    else if (d.type === "recheck") push();
    else if (d.type === "setIndex") setIndex(d.index);
    else if (d.type === "entries") {
      latestEntries = Array.isArray(d.entries) ? d.entries : [];
      if (pending) { pending(latestEntries); pending = null; }
    }
  });

  push();
  chrome.storage.onChanged.addListener((ch, area) => { if (area === "local") push(); });
  // re-check often (and on focus / each spin) so a revoked or expired code locks fast
  setInterval(() => { if (!document.hidden) push(); }, 2000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) push(); });

  chrome.runtime.onMessage.addListener((msg, sender, send) => {
    if (msg && msg.type === "getEntries") {
      const to = setTimeout(() => { pending = null; send({ entries: latestEntries }); }, 500);
      pending = (ents) => { clearTimeout(to); send({ entries: ents }); };
      window.postMessage({ [TAG]: true, dir: "to-main", type: "getEntries" }, "*");
      return true;
    }
  });
})();
