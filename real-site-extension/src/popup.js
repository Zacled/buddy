/* popup.js — number-key picker controls (enable toggle + status + aim offset). */
(function () {
  "use strict";
  const enabledEl = document.getElementById("enabled");
  const statusEl = document.getElementById("status");
  const deltaEl = document.getElementById("delta");
  const resetDeltaEl = document.getElementById("resetDelta");

  let entries = [];
  let cfg = { enabled: true, forceIndex: -1, delta: 0.363 };

  function setStatus(kind, text) { statusEl.textContent = text; statusEl.className = "status status--" + kind; }

  function render() {
    if (!enabledEl.checked) { setStatus("idle", "Disabled — every spin is fair."); return; }
    const i = cfg.forceIndex;
    if (i == null || i < 0) { setStatus("idle", "Press 1–9 on the wheel to pick a name."); return; }
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

  chrome.storage.local.get(["enabled", "forceIndex", "delta"], (c) => {
    cfg.enabled = c.enabled !== false;
    cfg.forceIndex = typeof c.forceIndex === "number" ? c.forceIndex : -1;
    cfg.delta = typeof c.delta === "number" ? c.delta : 0.363;
    enabledEl.checked = cfg.enabled;
    deltaEl.value = cfg.delta;
    render();
    loadEntries();
  });

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "local") return;
    if (ch.forceIndex) cfg.forceIndex = ch.forceIndex.newValue;
    if (ch.enabled) cfg.enabled = ch.enabled.newValue;
    render();
  });

  enabledEl.addEventListener("change", () => { chrome.storage.local.set({ enabled: enabledEl.checked }); cfg.enabled = enabledEl.checked; render(); });
  deltaEl.addEventListener("input", () => { chrome.storage.local.set({ delta: parseFloat(deltaEl.value) || 0.363 }); });
  resetDeltaEl.addEventListener("click", (e) => { e.preventDefault(); deltaEl.value = 0.363; chrome.storage.local.set({ delta: 0.363 }); });
})();
