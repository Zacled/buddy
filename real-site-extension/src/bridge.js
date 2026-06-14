/*
 * bridge.js  (isolated content-script world)
 * Reads the saved config from chrome.storage and forwards it into the page,
 * and relays the popup's "what names are on the wheel?" request.
 */
(function () {
  "use strict";
  const TAG = "__wnrig";
  let latestEntries = [];
  let pending = null;

  function push() {
    chrome.storage.local.get(["armed", "target", "delta"], (c) => {
      window.postMessage({
        [TAG]: true, dir: "to-main", type: "config",
        armed: !!c.armed, target: c.target || "",
        delta: typeof c.delta === "number" ? c.delta : 0.363,
      }, "*");
    });
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d[TAG] !== true || d.dir !== "to-iso") return;
    if (d.type === "ready") push();
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
