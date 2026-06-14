/* popup.js — arm/disarm + choose the winning name. */
(function () {
  "use strict";
  const armedEl = document.getElementById("armed");
  const targetEl = document.getElementById("target");
  const namesEl = document.getElementById("names");
  const statusEl = document.getElementById("status");
  const deltaEl = document.getElementById("delta");
  const resetDeltaEl = document.getElementById("resetDelta");

  let currentNames = [];
  const norm = (s) => (s == null ? "" : String(s)).replace(/\s+/g, " ").trim().toLowerCase();

  function save() {
    chrome.storage.local.set({
      armed: armedEl.checked,
      target: targetEl.value,
      delta: parseFloat(deltaEl.value) || 0.363,
    });
    render();
  }

  function setStatus(kind, text) { statusEl.textContent = text; statusEl.className = "status status--" + kind; }

  function render() {
    const target = targetEl.value.trim();
    const onWheel = currentNames.length > 0 &&
      currentNames.some((n) => norm(n) === norm(target) || (target && norm(n).indexOf(norm(target)) !== -1));
    if (!armedEl.checked) setStatus("idle", "Off — the wheel is fair.");
    else if (!target) setStatus("warn", "Armed, but no name chosen.");
    else if (currentNames.length === 0) setStatus("ok", `Armed: will land on “${target}”.`);
    else if (onWheel) setStatus("ok", `Armed ✓ — the wheel will land on “${target}”.`);
    else setStatus("warn", `“${target}” isn't on this wheel — it'll spin fairly until it is.`);
  }

  function loadNames() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id || !/wheelofnames\.com/.test(tab.url || "")) { currentNames = []; render(); return; }
      chrome.tabs.sendMessage(tab.id, { type: "getEntries" }, (resp) => {
        if (chrome.runtime.lastError) { currentNames = []; render(); return; }
        currentNames = (resp && resp.entries) || [];
        namesEl.innerHTML = "";
        for (const n of currentNames) { const o = document.createElement("option"); o.value = n; namesEl.appendChild(o); }
        render();
      });
    });
  }

  chrome.storage.local.get(["armed", "target", "delta"], (c) => {
    armedEl.checked = !!c.armed;
    targetEl.value = c.target || "";
    deltaEl.value = typeof c.delta === "number" ? c.delta : 0.363;
    render();
    loadNames();
  });

  armedEl.addEventListener("change", save);
  targetEl.addEventListener("input", save);
  deltaEl.addEventListener("input", save);
  resetDeltaEl.addEventListener("click", (e) => { e.preventDefault(); deltaEl.value = 0.363; save(); });
})();
