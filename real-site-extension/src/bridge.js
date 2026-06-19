/*
 * bridge.js  (isolated content-script world)
 * Syncs enabled / forceIndex / aim-offset from chrome.storage into the page, and
 * relays the popup's "what names are on the wheel?" request.
 */
(function () {
  "use strict";
  const TAG = "__wnrig";
  let latestEntries = [], pending = null;
  function ctxAlive() { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } }

  async function push() {
    if (!ctxAlive()) return;
    const c = await chrome.storage.local.get(["enabled", "forceIndex", "delta"]);
    window.postMessage({
      [TAG]: true, dir: "to-main", type: "config",
      enabled: c.enabled !== false,
      forceIndex: typeof c.forceIndex === "number" ? c.forceIndex : -1,
      delta: typeof c.delta === "number" ? c.delta : 0.363,
    }, "*");
  }
  function setIndex(index) { if (ctxAlive()) chrome.storage.local.set({ forceIndex: index }); }

  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d[TAG] !== true || d.dir !== "to-iso") return;
    if (d.type === "ready" || d.type === "recheck") push();
    else if (d.type === "setIndex") setIndex(d.index);
    else if (d.type === "entries") {
      latestEntries = Array.isArray(d.entries) ? d.entries : [];
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
