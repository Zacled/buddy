/* popup.js — activation gate + number-key controls, with the 3-strike
   sharing-warning flow (lock / warn / main views). */
(function () {
  "use strict";
  const codeEl = document.getElementById("code");
  const activateEl = document.getElementById("activate");
  const lockMsg = document.getElementById("lockMsg");
  const lockSec = document.getElementById("lock");
  const warnSec = document.getElementById("warn");
  const warnNum = document.getElementById("warnNum");
  const proceedBtn = document.getElementById("proceedBtn");
  const warnBanner = document.getElementById("warnBanner");
  const mainSec = document.getElementById("main");
  const enabledWrap = document.getElementById("enabledWrap");
  const enabledEl = document.getElementById("enabled");
  const statusEl = document.getElementById("status");
  const deltaEl = document.getElementById("delta");
  const revUrlEl = document.getElementById("revUrl");
  const resetDeltaEl = document.getElementById("resetDelta");
  const deactivateEl = document.getElementById("deactivate");

  let entries = [];
  let cfg = { enabled: true, forceIndex: -1, delta: 0.363 };
  let currentWarnN = 0; // the warning number currently on the warning screen

  function setStatus(kind, text) { statusEl.textContent = text; statusEl.className = "status status--" + kind; }

  function showView(view) { // "lock" | "warn" | "main"
    lockSec.hidden = view !== "lock";
    warnSec.hidden = view !== "warn";
    mainSec.hidden = view !== "main";
    enabledWrap.hidden = view !== "main";
    if (view !== "main") { document.body.classList.remove("warned"); warnBanner.hidden = true; }
  }
  function lock(text) { lockMsg.className = "status status--warn"; lockMsg.textContent = text; showView("lock"); }
  function setWarnBanner(n) {
    if (n > 0) {
      warnBanner.hidden = false;
      warnBanner.textContent = "⚠ Warning " + n + " of 3 — your code was used on another computer. One more and it's deactivated.";
      document.body.classList.add("warned");
    } else { warnBanner.hidden = true; document.body.classList.remove("warned"); }
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

  function enterMain(warnN) {
    chrome.storage.local.get(["enabled", "forceIndex", "delta", "licenseCode", "revUrl"], async (c) => {
      cfg.enabled = c.enabled !== false;
      cfg.forceIndex = typeof c.forceIndex === "number" ? c.forceIndex : -1;
      cfg.delta = typeof c.delta === "number" ? c.delta : 0.363;
      enabledEl.checked = cfg.enabled;
      deltaEl.value = cfg.delta;
      revUrlEl.value = c.revUrl || "";
      showView("main");
      setWarnBanner(warnN || 0);
      const info = c.licenseCode ? await window.WPLicense.info(c.licenseCode) : null;
      const el = document.getElementById("activeInfo");
      if (info && info.valid) {
        el.textContent = "🔓 Activated" + (info.id ? ` · ${info.id}` : "") +
          (info.exp ? ` · expires ${new Date(info.exp).toLocaleDateString()}` : " · never expires");
      } else el.textContent = "";
      render();
      loadEntries();
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
    if (result.status === "dead") return lock("This code has been deactivated (shared too many times).");
    if (result.status === "blocked") return lock("This code is already in use on another computer.");
    chrome.storage.local.set({ licenseCode: code }, () => enterMain(0));
  }

  // Owner acknowledges the current warning; we remember it so the full red
  // screen won't reappear for the same warning number (a new strike bumps it).
  function proceed() {
    chrome.storage.local.set({ ackWarn: currentWarnN }, () => enterMain(currentWarnN));
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

  // Live re-check (on open, focus, every few seconds): locks on revoke/3rd-strike,
  // unlocks on restore, keeps the red banner accurate.
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
      if (st.state === "dead") return lock("This code has been deactivated (shared too many times).");
      if (st.state === "blocked") return lock("This code is already in use on another computer.");
      const warnN = st.state === "warn" ? (st.n || 1) : 0;
      const ack = c.ackWarn || 0;
      if (warnN > ack) { currentWarnN = warnN; warnNum.textContent = warnN; showView("warn"); return; }
      if (mainSec.hidden) enterMain(warnN);
      else setWarnBanner(warnN);
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
  resetDeltaEl.addEventListener("click", (e) => { e.preventDefault(); deltaEl.value = 0.363; chrome.storage.local.set({ delta: 0.363 }); });
  deactivateEl.addEventListener("click", (e) => { e.preventDefault(); chrome.storage.local.remove("licenseCode", () => { codeEl.value = ""; showView("lock"); }); });
})();
