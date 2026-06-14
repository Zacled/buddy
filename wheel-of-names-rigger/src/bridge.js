/*
 * bridge.js  (runs in the ISOLATED content-script world on wheelofnames.com)
 *
 * The main-world script can touch the page's Vue/wheel objects but cannot read
 * chrome.storage. This bridge owns that gap: it reads the saved rig config and
 * forwards it into the page, keeps it in sync when it changes, and relays the
 * popup's "what names are on the wheel right now?" request.
 */
(function () {
  "use strict";

  const TAG = "__wheelRig";
  let latestNames = [];
  let pendingNamesResolve = null;

  function pushConfig() {
    chrome.storage.local.get(["enabled", "target"], (cfg) => {
      window.postMessage(
        {
          [TAG]: true,
          dir: "to-main",
          type: "config",
          enabled: !!cfg.enabled,
          target: cfg.target || "",
        },
        "*"
      );
    });
  }

  // Messages coming back from the page's main world.
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d[TAG] !== true || d.dir !== "to-iso") return;
    if (d.type === "ready") {
      pushConfig(); // main world just (re)loaded or patched: resend config
    } else if (d.type === "names") {
      latestNames = Array.isArray(d.names) ? d.names : [];
      if (pendingNamesResolve) {
        pendingNamesResolve(latestNames);
        pendingNamesResolve = null;
      }
    }
  });

  // Keep the page in sync with stored config.
  pushConfig();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") pushConfig();
  });

  // Popup <-> bridge.
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "getNames") {
      const fallback = setTimeout(() => {
        pendingNamesResolve = null;
        sendResponse({ names: latestNames });
      }, 500);
      pendingNamesResolve = (names) => {
        clearTimeout(fallback);
        sendResponse({ names });
      };
      window.postMessage({ [TAG]: true, dir: "to-main", type: "getNames" }, "*");
      return true; // keep the message channel open for the async response
    }
  });
})();
