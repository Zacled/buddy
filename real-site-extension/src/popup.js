/* popup.js — activation gate + master on/off, status, aim-offset.
   The real control is the number keys on the wheel page. */
(function () {
  "use strict";
  const lock = document.getElementById("lock");
  const main = document.getElementById("main");
  const codeEl = document.getElementById("code");
  const activateEl = document.getElementById("activate");
  const lockMsg = document.getElementById("lockMsg");
  const enabledWrap = document.getElementById("enabledWrap");
  const enabledEl = document.getElementById("enabled");
  const statusEl = document.getElementById("status");
  const deltaEl = document.getElementById("delta");
  const resetDeltaEl = document.getElementById("resetDelta");
  const deactivateEl = document.getElementById("deactivate");

  let entries = [];
  let cfg = { enabled: true, forceIndex: -1, delta: 0.363 };

  function setStatus(kind, text) { statusEl.textContent = text; statusEl.className = "status status--" + kind; }

  function showMain(show) {
    lock.hidden = show;
    main.hidden = !show;
    enabledWrap.hidden = !show;
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

  function enterMain() {
    chrome.storage.local.get(["enabled", "forceIndex", "delta", "licenseCode"], async (c) => {
      cfg.enabled = c.enabled !== false;
      cfg.forceIndex = typeof c.forceIndex === "number" ? c.forceIndex : -1;
      cfg.delta = typeof c.delta === "number" ? c.delta : 0.363;
      enabledEl.checked = cfg.enabled;
      deltaEl.value = cfg.delta;
      showMain(true);
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
    activateEl.disabled = false;
    if (ok) {
      chrome.storage.local.set({ licenseCode: code }, enterMain);
    } else {
      lockMsg.className = "status status--warn";
      lockMsg.textContent = "That code isn't valid. Check it and try again.";
    }
  }

  // boot: check stored code
  chrome.storage.local.get(["licenseCode"], async (c) => {
    const ok = c.licenseCode ? await window.WPLicense.verify(c.licenseCode) : false;
    if (ok) enterMain();
    else showMain(false);
  });

  activateEl.addEventListener("click", activate);
  codeEl.addEventListener("keydown", (e) => { if (e.key === "Enter") activate(); });

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "local") return;
    if (ch.forceIndex) cfg.forceIndex = ch.forceIndex.newValue;
    if (ch.enabled) cfg.enabled = ch.enabled.newValue;
    if (!main.hidden) render();
  });

  enabledEl.addEventListener("change", () => { chrome.storage.local.set({ enabled: enabledEl.checked }); cfg.enabled = enabledEl.checked; render(); });
  deltaEl.addEventListener("input", () => { chrome.storage.local.set({ delta: parseFloat(deltaEl.value) || 0.363 }); });
  resetDeltaEl.addEventListener("click", (e) => { e.preventDefault(); deltaEl.value = 0.363; chrome.storage.local.set({ delta: 0.363 }); });
  deactivateEl.addEventListener("click", (e) => { e.preventDefault(); chrome.storage.local.remove("licenseCode", () => { codeEl.value = ""; showMain(false); }); });
})();
