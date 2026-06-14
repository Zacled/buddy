/* sw.js — toolbar badge + revocation checks.
 *
 * ── REVOCATION SETUP (optional) ─────────────────────────────────────────────
 * To be able to kill a code after you've handed it out, host a tiny JSON file
 * online and paste its RAW url below. The file's contents look like:
 *     {"revoked":["<code-id>","<code-id>"]}
 * Use the Code Generator's "Revoke" buttons to build that list, then paste it
 * into your hosted file. The extension checks it every couple of minutes and
 * locks any revoked code. Leave this blank to disable revocation (codes are
 * then controlled only by their expiry).
 *
 * Easiest host: a PUBLIC GitHub Gist — create one with a file revoked.json,
 * then use its "Raw" button URL, e.g.
 *   https://gist.githubusercontent.com/<you>/<id>/raw/revoked.json
 * ────────────────────────────────────────────────────────────────────────────
 */
const REVOCATION_URL = "";

// ---- badge ----
function refreshBadge() {
  chrome.storage.local.get(["enabled", "forceIndex"], (c) => {
    const armed = c.enabled !== false && typeof c.forceIndex === "number" && c.forceIndex >= 0;
    chrome.action.setBadgeText({ text: armed ? String(c.forceIndex + 1) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
  });
}
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["enabled", "forceIndex", "delta"], (c) => {
    const seed = {};
    if (c.enabled === undefined) seed.enabled = true;
    if (c.forceIndex === undefined) seed.forceIndex = -1;
    if (c.delta === undefined) seed.delta = 0.363;
    if (Object.keys(seed).length) chrome.storage.local.set(seed);
    refreshBadge();
  });
});
chrome.runtime.onStartup.addListener(refreshBadge);
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === "local" && (ch.enabled || ch.forceIndex)) refreshBadge();
});

// ---- revocation list (fetched + cached) ----
let cache = { at: 0, list: [] };
async function getRevokedList() {
  if (!REVOCATION_URL) return [];
  if (Date.now() - cache.at < 120000) return cache.list; // throttle to ~2 min
  try {
    const res = await fetch(REVOCATION_URL, { cache: "no-store" });
    const data = await res.json();
    cache = { at: Date.now(), list: Array.isArray(data.revoked) ? data.revoked : [] };
    chrome.storage.local.set({ _revCache: cache.list, _revAt: cache.at });
  } catch (e) {
    // fail-open: reuse the last cached list we successfully fetched
    const s = await chrome.storage.local.get(["_revCache"]);
    cache = { at: cache.at || Date.now(), list: Array.isArray(s._revCache) ? s._revCache : cache.list };
  }
  return cache.list;
}

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (msg && msg.type === "isRevoked") {
    if (!REVOCATION_URL || !msg.jti) { send({ revoked: false }); return false; }
    getRevokedList().then((list) => send({ revoked: list.indexOf(msg.jti) !== -1 }));
    return true; // async
  }
});
