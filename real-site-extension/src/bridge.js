/*
 * bridge.js  (isolated content-script world)
 * Syncs config from chrome.storage into the page, persists the chosen position,
 * gives a brief on-screen confirmation when you press a number, and relays the
 * popup's "what names are on the wheel?" request.
 */
(function () {
  "use strict";
  const TAG = "__wnrig";
  let latestEntries = [];
  let pending = null;
  let pendingIndicatorIndex = null;

  function push() {
    chrome.storage.local.get(["enabled", "forceIndex", "delta"], (c) => {
      window.postMessage({
        [TAG]: true, dir: "to-main", type: "config",
        enabled: c.enabled !== false,
        forceIndex: typeof c.forceIndex === "number" ? c.forceIndex : -1,
        delta: typeof c.delta === "number" ? c.delta : 0.363,
      }, "*");
    });
  }

  function setIndex(index) {
    chrome.storage.local.set({ forceIndex: index });
    showIndicator(index, null);
    // fetch the name at that position for a clearer confirmation
    pendingIndicatorIndex = index;
    window.postMessage({ [TAG]: true, dir: "to-main", type: "getEntries" }, "*");
  }

  // small, brief, low-key confirmation in the corner (operator feedback)
  let indEl = null, indTimer = null;
  function showIndicator(index, name) {
    if (!indEl) {
      indEl = document.createElement("div");
      indEl.style.cssText =
        "position:fixed;left:14px;bottom:12px;z-index:2147483647;" +
        "font:600 12px -apple-system,Segoe UI,Roboto,sans-serif;color:#e8edf5;" +
        "background:rgba(16,20,28,.78);padding:4px 9px;border-radius:7px;" +
        "pointer-events:none;opacity:0;transition:opacity .15s;box-shadow:0 2px 8px rgba(0,0,0,.35)";
      (document.body || document.documentElement).appendChild(indEl);
    }
    indEl.textContent = index >= 0 ? (name ? name : "#" + (index + 1)) : "fair";
    indEl.style.opacity = "0.85";
    clearTimeout(indTimer);
    indTimer = setTimeout(() => { if (indEl) indEl.style.opacity = "0"; }, 1100);
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d[TAG] !== true || d.dir !== "to-iso") return;
    if (d.type === "ready") push();
    else if (d.type === "setIndex") setIndex(d.index);
    else if (d.type === "entries") {
      latestEntries = Array.isArray(d.entries) ? d.entries : [];
      if (pendingIndicatorIndex != null) {
        const i = pendingIndicatorIndex;
        if (i >= 0 && i < latestEntries.length) showIndicator(i, latestEntries[i]);
        pendingIndicatorIndex = null;
      }
      if (pending) { pending(latestEntries); pending = null; }
    }
  });

  push();
  chrome.storage.onChanged.addListener((ch, area) => { if (area === "local") push(); });

  chrome.runtime.onMessage.addListener((msg, sender, send) => {
    if (msg && msg.type === "getEntries") {
      const to = setTimeout(() => { pending = null; send({ entries: latestEntries }); }, 500);
      pending = (ents) => { clearTimeout(to); send({ entries: ents }); };
      window.postMessage({ [TAG]: true, dir: "to-main", type: "getEntries" }, "*");
      return true;
    }
  });
})();
