/* sw.js — toolbar badge: green ON when armed with a target (only you see it). */
function refreshBadge() {
  chrome.storage.local.get(["armed", "target"], (c) => {
    const on = !!c.armed && !!(c.target && c.target.trim());
    chrome.action.setBadgeText({ text: on ? "ON" : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
  });
}
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["armed", "target", "delta"], (c) => {
    const seed = {};
    if (c.armed === undefined) seed.armed = false;
    if (c.target === undefined) seed.target = "";
    if (c.delta === undefined) seed.delta = 0.363;
    if (Object.keys(seed).length) chrome.storage.local.set(seed);
    refreshBadge();
  });
});
chrome.runtime.onStartup.addListener(refreshBadge);
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === "local" && (ch.armed || ch.target)) refreshBadge();
});
