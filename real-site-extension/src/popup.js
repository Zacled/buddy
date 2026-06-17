/* popup.js — activation gate + number-key controls, with the 3-strike
   sharing-warning flow (lock / warn / main / denied views). */
(function () {
  "use strict";
  const codeEl = document.getElementById("code");
  const activateEl = document.getElementById("activate");
  const lockMsg = document.getElementById("lockMsg");
  const lockSec = document.getElementById("lock");
  const warnSec = document.getElementById("warn");
  const warnNum = document.getElementById("warnNum");
  const proceedBtn = document.getElementById("proceedBtn");
  const warnFoot = document.getElementById("warnFoot");
  const deniedSec = document.getElementById("denied");
  const deniedLogoutEl = document.getElementById("deniedLogout");
  const mainSec = document.getElementById("main");
  const enabledWrap = document.getElementById("enabledWrap");
  const enabledEl = document.getElementById("enabled");
  const statusEl = document.getElementById("status");
  const deltaEl = document.getElementById("delta");
  const revUrlEl = document.getElementById("revUrl");
  const resetDeltaEl = document.getElementById("resetDelta");
  const logoutEl = document.getElementById("logout");
  const testConnEl = document.getElementById("testConn");
  const shareConnEl = document.getElementById("shareConn");
  const calAimedEl = document.getElementById("calAimed");
  const calActualEl = document.getElementById("calActual");
  const calFixEl = document.getElementById("calFix");
  const calMsgEl = document.getElementById("calMsg");
  const varietyBtns = document.getElementById("varietyBtns");

  let entries = [];
  let cfg = { enabled: true, forceIndex: -1, delta: 0.363, wobble: 0.45 };
  let currentWarnN = 0; // the warning number currently on the warning screen

  function setStatus(kind, text) { statusEl.textContent = text; statusEl.className = "status status--" + kind; }

  function showView(view) { // "lock" | "warn" | "main" | "denied"
    lockSec.hidden = view !== "lock";
    warnSec.hidden = view !== "warn";
    mainSec.hidden = view !== "main";
    deniedSec.hidden = view !== "denied";
    enabledWrap.hidden = view !== "main";
    // header log-out shows on main/warn; the denied screen has its own big button
    logoutEl.hidden = (view === "lock" || view === "denied");
    document.body.classList.toggle("denied", view === "denied");
  }
  function lock(text) { lockMsg.className = "status status--warn"; lockMsg.textContent = text; showView("lock"); }
  // Small "Warning N/3" note at the bottom of the normal screen (no red takeover).
  function setWarnFoot(n) {
    if (n > 0) { warnFoot.hidden = false; warnFoot.textContent = "⚠ Warning " + n + "/3"; }
    else { warnFoot.hidden = true; }
  }

  function render() {
    if (!enabledEl.checked) { setStatus("idle", "Disabled — every spin is fair."); return; }
    const i = cfg.forceIndex;
    if (i == null || i < 0) { setStatus("idle", "Fair — press 1–9 on the wheel to rig a position."); return; }
    const name = i < entries.length ? entries[i] : null;
    if (entries.length && i >= entries.length) setStatus("warn", `Position ${i + 1} set, but the wheel only has ${entries.length} names.`);
    else setStatus("ok", `Armed ✓ — position ${i + 1}${name ? ` (“${name}”)` : ""} will win.`);
  }

  function loadEntries() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id || !/wheelofnames\.com/.test(tab.url || "")) { entries = []; render(); return; }
      chrome.tabs.sendMessage(tab.id, { type: "getEntries" }, (resp) => {
        if (chrome.runtime.lastError) { entries = []; render(); return; }
        entries = (resp && resp.entries) || [];
        render();
      });
    });
  }

  function renderVariety(w) {
    Array.prototype.forEach.call(varietyBtns.querySelectorAll(".var-btn"), (b) => {
      b.classList.toggle("on", Math.abs(parseFloat(b.dataset.w) - w) < 0.001);
    });
  }

  function enterMain(warnN) {
    chrome.storage.local.get(["enabled", "forceIndex", "delta", "licenseCode", "revUrl", "wobble"], async (c) => {
      cfg.enabled = c.enabled !== false;
      cfg.forceIndex = typeof c.forceIndex === "number" ? c.forceIndex : -1;
      cfg.delta = typeof c.delta === "number" ? c.delta : 0.363;
      cfg.wobble = typeof c.wobble === "number" ? c.wobble : 0.45;
      enabledEl.checked = cfg.enabled;
      deltaEl.value = cfg.delta;
      revUrlEl.value = c.revUrl || "";
      renderVariety(cfg.wobble);
      showView("main");
      setWarnFoot(warnN || 0);
      const info = c.licenseCode ? await window.WPLicense.info(c.licenseCode) : null;
      const el = document.getElementById("activeInfo");
      if (info && info.valid) {
        el.textContent = "🔓 Activated" + (info.id ? ` · ${info.id}` : "") +
          (info.exp ? ` · expires ${new Date(info.exp).toLocaleDateString()}` : " · never expires");
      } else el.textContent = "";
      render();
      loadEntries();
      pingConn();
    });
  }

  async function activate() {
    const code = codeEl.value.trim();
    activateEl.disabled = true;
    const ok = await window.WPLicense.verify(code);
    const inf = ok ? await window.WPLicense.info(code) : null;
    const deviceId = await getDeviceId();
    const wrongDevice = !!(inf && inf.dev && inf.dev !== deviceId);
    const revoked = (ok && inf && inf.jti) ? await askRevoked(inf.jti) : false;
    let result = { status: "ok" };
    if (ok && !revoked && !wrongDevice && inf && inf.jti) result = await activateCheck(inf.jti, deviceId, inf.id);
    activateEl.disabled = false;
    if (!ok) return lock("That code isn't valid. Check it and try again.");
    if (wrongDevice) return lock("This code is locked to a different device.");
    if (revoked) return lock("This code has been deactivated by the owner.");
    if (result.status === "dead") return showView("denied");
    if (result.status === "blocked") return lock("This code is already in use on another computer.");
    chrome.storage.local.set({ licenseCode: code }, () => enterMain(0));
  }

  // Owner acknowledges the current warning; we remember it so the full red
  // screen won't reappear for the same warning number (a new strike bumps it).
  function proceed() {
    chrome.storage.local.set({ ackWarn: currentWarnN }, () => enterMain(currentWarnN));
  }

  // Log out: drop the stored code (and warning ack) and return to the code entry
  // page. The device lock stays in place, so logging back in on THIS computer is
  // still recognised as the bound device.
  function logout() {
    chrome.storage.local.remove(["licenseCode", "ackWarn"], () => {
      codeEl.value = "";
      lockMsg.className = "status status--idle";
      lockMsg.textContent = "A code is required. Ask the owner for one.";
      showView("lock");
    });
  }

  // Probe whether the sharing-protection store (Pantry) is reachable from this
  // computer, so the owner can confirm the share-detection is actually live.
  function pingConn() {
    if (!shareConnEl) return;
    shareConnEl.textContent = "checking…"; shareConnEl.className = "share-conn";
    try {
      chrome.runtime.sendMessage({ type: "pantryPing" }, (r) => {
        if (chrome.runtime.lastError || !r) { shareConnEl.textContent = "can't check"; shareConnEl.className = "share-conn bad"; return; }
        if (r.ok) { shareConnEl.textContent = "connected ✓"; shareConnEl.className = "share-conn ok"; }
        else { shareConnEl.textContent = "unreachable ✗ (" + (r.reason || "error") + ")"; shareConnEl.className = "share-conn bad"; }
      });
    } catch (e) { shareConnEl.textContent = "can't check"; shareConnEl.className = "share-conn bad"; }
  }

  function activateCheck(jti, deviceId, label) {
    return new Promise((resolve) => {
      try { chrome.runtime.sendMessage({ type: "activateCheck", jti, deviceId, label }, (r) => resolve(chrome.runtime.lastError ? { status: "ok" } : (r || { status: "ok" }))); }
      catch (e) { resolve({ status: "ok" }); }
    });
  }
  function codeStatus(jti, deviceId) {
    return new Promise((resolve) => {
      try { chrome.runtime.sendMessage({ type: "codeStatus", jti, deviceId }, (r) => resolve(chrome.runtime.lastError ? { state: "ok" } : (r || { state: "ok" }))); }
      catch (e) { resolve({ state: "ok" }); }
    });
  }
  function getDeviceId() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["deviceId"], (c) => {
        if (c.deviceId) return resolve(c.deviceId);
        const id = (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)));
        chrome.storage.local.set({ deviceId: id }, () => resolve(id));
      });
    });
  }
  function askRevoked(jti) {
    return new Promise((resolve) => {
      try { chrome.runtime.sendMessage({ type: "isRevoked", jti }, (resp) => resolve(chrome.runtime.lastError ? false : !!(resp && resp.revoked))); }
      catch (e) { resolve(false); }
    });
  }

  // Live re-check (on open, focus, every few seconds): locks on revoke, shows the
  // full-red Access Denied screen on the 3rd strike, keeps the bottom note accurate.
  function refreshState() {
    if (!warnSec.hidden) return; // don't disturb the warning screen
    chrome.storage.local.get(["licenseCode", "deviceId", "ackWarn"], async (c) => {
      if (!c.licenseCode) { if (!mainSec.hidden) showView("lock"); return; }
      const okSig = await window.WPLicense.verify(c.licenseCode);
      const inf = await window.WPLicense.info(c.licenseCode);
      const wrongDevice = !!(inf && inf.dev && inf.dev !== c.deviceId);
      const rev = (okSig && inf && inf.jti) ? await askRevoked(inf.jti) : false;
      const st = (okSig && inf && inf.jti) ? await codeStatus(inf.jti, c.deviceId) : { state: "ok" };
      if (!okSig) return lock("This code is no longer valid (expired or removed).");
      if (wrongDevice) return lock("This code is locked to a different device.");
      if (rev) return lock("This code has been deactivated by the owner.");
      if (st.state === "dead") return showView("denied");
      if (st.state === "blocked") return lock("This code is already in use on another computer.");
      const warnN = st.state === "warn" ? (st.n || 1) : 0;
      const ack = c.ackWarn || 0;
      if (warnN > ack) { currentWarnN = warnN; warnNum.textContent = warnN; showView("warn"); return; }
      if (mainSec.hidden) enterMain(warnN);
      else setWarnFoot(warnN);
    });
  }
  refreshState();
  setInterval(refreshState, 5000);
  window.addEventListener("focus", refreshState);

  activateEl.addEventListener("click", activate);
  codeEl.addEventListener("keydown", (e) => { if (e.key === "Enter") activate(); });
  proceedBtn.addEventListener("click", proceed);
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "local") return;
    if (ch.forceIndex) cfg.forceIndex = ch.forceIndex.newValue;
    if (ch.enabled) cfg.enabled = ch.enabled.newValue;
    if (!mainSec.hidden) render();
  });
  enabledEl.addEventListener("change", () => { chrome.storage.local.set({ enabled: enabledEl.checked }); cfg.enabled = enabledEl.checked; render(); });
  deltaEl.addEventListener("input", () => { chrome.storage.local.set({ delta: parseFloat(deltaEl.value) || 0.363 }); });
  revUrlEl.addEventListener("input", () => { chrome.storage.local.set({ revUrl: revUrlEl.value.trim() }); });
  resetDeltaEl.addEventListener("click", (e) => { e.preventDefault(); deltaEl.value = 0.363; chrome.storage.local.set({ delta: 0.363 }); calMsgEl.textContent = ""; });
  logoutEl.addEventListener("click", logout);
  deniedLogoutEl.addEventListener("click", logout);
  testConnEl.addEventListener("click", (e) => { e.preventDefault(); pingConn(); });
  calFixEl.addEventListener("click", (e) => { e.preventDefault(); calibrate(); });
  calActualEl.addEventListener("keydown", (e) => { if (e.key === "Enter") calibrate(); });
  varietyBtns.addEventListener("click", (e) => {
    const b = e.target.closest(".var-btn"); if (!b) return;
    const w = parseFloat(b.dataset.w);
    if (!(w >= 0)) return;
    cfg.wobble = w;
    chrome.storage.local.set({ wobble: w });
    renderVariety(w);
  });

  // One-spin self-calibration: you pressed `aimed` but it landed on `actual`,
  // so the wheel's offset is off by (actual-aimed) slices. Nudge delta by that
  // fraction (delta drives the winner = round(N*((u+delta) mod 1)) mapping).
  function calibrate() {
    const aimed = parseInt(calAimedEl.value, 10);
    const actual = parseInt(calActualEl.value, 10);
    if (!(aimed >= 1) || !(actual >= 1)) { calMsgEl.textContent = "Type the number you pressed and the number it landed on."; return; }
    const N = entries.length;
    if (!N) { calMsgEl.textContent = "Open wheelofnames.com (with your names) first, then Fix."; return; }
    if (aimed === actual) { calMsgEl.textContent = "Those match — if it's landing right, nothing to fix."; return; }
    let d = (parseFloat(deltaEl.value) || 0.363) + (actual - aimed) / N;
    d = ((d % 1) + 1) % 1;
    cfg.delta = d;
    deltaEl.value = d.toFixed(4);
    chrome.storage.local.set({ delta: d }, () => {
      calMsgEl.textContent = "Aim fixed ✓ Spin again — pressing a number should land on it. (Repeat if still off.)";
      calAimedEl.value = ""; calActualEl.value = "";
    });
  }
})();
