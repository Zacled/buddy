/* popup.js — small control panel: arm/disarm + choose the winning name. */
(function () {
  "use strict";

  const enabledEl = document.getElementById("enabled");
  const targetEl = document.getElementById("target");
  const namesEl = document.getElementById("names");
  const statusEl = document.getElementById("status");

  let currentNames = [];

  function norm(s) {
    return (s == null ? "" : String(s)).replace(/\s+/g, " ").trim().toLowerCase();
  }

  function save() {
    chrome.storage.local.set({
      enabled: enabledEl.checked,
      target: targetEl.value,
    });
    render();
  }

  function render() {
    const target = targetEl.value.trim();
    const onWheel =
      currentNames.length > 0 &&
      currentNames.some((n) => norm(n) === norm(target) ||
        (target && norm(n).indexOf(norm(target)) !== -1));

    if (!enabledEl.checked) {
      setStatus("idle", "Rig is off — spins are fair.");
    } else if (!target) {
      setStatus("warn", "Armed, but no name chosen yet.");
    } else if (currentNames.length === 0) {
      setStatus("ok", `Armed: will land on “${target}”.`);
    } else if (onWheel) {
      setStatus("ok", `Armed: the wheel will land on “${target}”.`);
    } else {
      setStatus("warn", `“${target}” isn't on this wheel — it'll spin fairly until it is.`);
    }
  }

  function setStatus(kind, text) {
    statusEl.textContent = text;
    statusEl.className = "status status--" + kind;
  }

  function loadNames() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id || !/wheelofnames\.com/.test(tab.url || "")) {
        currentNames = [];
        render();
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: "getNames" }, (resp) => {
        if (chrome.runtime.lastError) {
          currentNames = [];
          render();
          return;
        }
        currentNames = (resp && resp.names) || [];
        namesEl.innerHTML = "";
        for (const n of currentNames) {
          const opt = document.createElement("option");
          opt.value = n;
          namesEl.appendChild(opt);
        }
        render();
      });
    });
  }

  chrome.storage.local.get(["enabled", "target"], (cfg) => {
    enabledEl.checked = !!cfg.enabled;
    targetEl.value = cfg.target || "";
    render();
    loadNames();
  });

  enabledEl.addEventListener("change", save);
  targetEl.addEventListener("input", save);
})();
