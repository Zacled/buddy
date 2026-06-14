/*
 * sw.js  (service worker)
 *
 * Keeps a small toolbar badge in sync so YOU can see at a glance whether the
 * rig is armed — "ON" (green) when enabled with a target, blank otherwise.
 * The badge sits on the extension icon in your toolbar, not on the page, so
 * your friend won't see it.
 */
const ON_COLOR = "#16a34a";

function refreshBadge() {
  chrome.storage.local.get(["enabled", "target"], (cfg) => {
    const armed = !!cfg.enabled && !!(cfg.target && cfg.target.trim());
    chrome.action.setBadgeText({ text: armed ? "ON" : "" });
    chrome.action.setBadgeBackgroundColor({ color: ON_COLOR });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["enabled", "target"], (cfg) => {
    // Seed defaults on first install.
    const seed = {};
    if (cfg.enabled === undefined) seed.enabled = false;
    if (cfg.target === undefined) seed.target = "";
    if (Object.keys(seed).length) chrome.storage.local.set(seed);
    refreshBadge();
  });
});

chrome.runtime.onStartup.addListener(refreshBadge);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.enabled || changes.target)) refreshBadge();
});
