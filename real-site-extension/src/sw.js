/* sw.js — toolbar badge + revocation checks.
 *
 * ── REVOCATION ──────────────────────────────────────────────────────────────
 * To kill a code after handing it out, the extension reads a small JSON list
 * you host online:  {"revoked":["<code-id>","<code-id>"]}
 * The Code Generator can host + update that list for you automatically (connect
 * GitHub once). Point the extension at it in one of two ways:
 *   • Popup → Advanced → "Revocation URL"  (easiest, per copy), or
 *   • bake it into BAKED_REVOCATION_URL below (for copies you distribute).
 * Blank in both = revocation off (codes controlled only by expiry).
 * ────────────────────────────────────────────────────────────────────────────
 */
const BAKED_REVOCATION_URL = "https://raw.githubusercontent.com/Zacled/buddy/claude/stoic-archimedes-7aeh6g/revoked.json";

async function revUrl() {
  try {
    const s = await chrome.storage.local.get(["revUrl"]);
    return (s.revUrl || "").trim() || BAKED_REVOCATION_URL;
  } catch (e) { return BAKED_REVOCATION_URL; }
}

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
  const url = await revUrl();
  if (!url) return [];
  if (Date.now() - cache.at < 5000) return cache.list; // throttle to ~5s
  try {
    const bust = url + (url.indexOf("?") === -1 ? "?" : "&") + "_=" + Date.now();
    const res = await fetch(bust, { cache: "no-store" });
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
    if (!msg.jti) { send({ revoked: false }); return false; }
    getRevokedList().then((list) => send({ revoked: list.indexOf(msg.jti) !== -1 }));
    return true; // async
  }
});
