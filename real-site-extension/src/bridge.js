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

  function askRevoked(jti) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "isRevoked", jti }, (resp) => {
          if (chrome.runtime.lastError) resolve(false); // fail-open
          else resolve(!!(resp && resp.revoked));
        });
      } catch (e) { resolve(false); }
    });
  }
  function codeDead(jti, deviceId) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "codeStatus", jti, deviceId }, (r) => {
          resolve(!chrome.runtime.lastError && r && (r.state === "dead" || r.state === "blocked"));
        });
      } catch (e) { resolve(false); }
    });
  }
  async function isActivated() {
    try {
      const c = await chrome.storage.local.get(["licenseCode", "deviceId"]);
      if (!c.licenseCode) return false;
      if (!(await self.WPLicense.verify(c.licenseCode))) return false; // bad sig or expired
      const inf = await self.WPLicense.info(c.licenseCode);
      if (inf && inf.dev && inf.dev !== c.deviceId) return false; // locked to another device
      if (inf && inf.jti && (await askRevoked(inf.jti))) return false; // revoked by owner
      if (inf && inf.jti && (await codeDead(inf.jti, c.deviceId))) return false; // auto-revoked / not the owner's computer
      return true;
    } catch (e) { return false; }
  }

  async function push() {
    const c = await chrome.storage.local.get(["enabled", "forceIndex", "delta"]);
    const activated = await isActivated();
    window.postMessage({
      [TAG]: true, dir: "to-main", type: "config",
      activated,
      enabled: c.enabled !== false,
      forceIndex: typeof c.forceIndex === "number" ? c.forceIndex : -1,
      delta: typeof c.delta === "number" ? c.delta : 0.363,
    }, "*");
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
