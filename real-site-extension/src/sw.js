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
// GitHub API (not raw) — the API returns the live file immediately; the raw
// CDN can serve a stale copy for minutes.
const BAKED_REVOCATION_URL = "https://api.github.com/repos/Zacled/buddy/contents/revoked.json?ref=claude/stoic-archimedes-7aeh6g";

// One-device auto-binding (optional). Put a free getpantry.cloud Pantry ID here.
// When set, the FIRST device to activate a code claims it; a shared copy is then
// rejected ("already in use on another device"). Blank = off.
const PANTRY_ID = "7d7f229c-0e9b-4be0-b325-1d0537c2c70c";

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
  chrome.storage.local.get(["enabled", "forceIndex", "delta", "deviceId"], (c) => {
    const seed = {};
    if (c.enabled === undefined) seed.enabled = true;
    if (c.forceIndex === undefined) seed.forceIndex = -1;
    if (c.delta === undefined) seed.delta = 0.363;
    if (!c.deviceId) seed.deviceId = (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)));
    if (Object.keys(seed).length) chrome.storage.local.set(seed);
    refreshBadge();
  });
});
chrome.runtime.onStartup.addListener(refreshBadge);
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === "local" && (ch.enabled || ch.forceIndex)) refreshBadge();
});

// ---- revocation list (fetched + cached) ----
let cache = { at: 0, list: [], etag: null };

function parseRevoked(data) {
  // GitHub API returns base64 content; a plain raw URL returns the JSON directly.
  if (data && typeof data.content === "string") {
    try { const o = JSON.parse(atob(data.content.replace(/\s/g, ""))); return Array.isArray(o.revoked) ? o.revoked : []; }
    catch (e) { return []; }
  }
  if (data && Array.isArray(data.revoked)) return data.revoked;
  return [];
}

async function getRevokedList() {
  const url = await revUrl();
  if (!url) return [];
  if (Date.now() - cache.at < 8000) return cache.list; // throttle (304s are free, so this is cheap)
  // restore etag/list across service-worker restarts so we keep getting free 304s
  if (cache.etag == null) {
    const s = await chrome.storage.local.get(["_revEtag", "_revCache"]);
    if (s._revEtag) cache.etag = s._revEtag;
    if (Array.isArray(s._revCache)) cache.list = s._revCache;
  }
  try {
    const headers = { "Accept": "application/vnd.github+json" };
    if (cache.etag) headers["If-None-Match"] = cache.etag; // 304 = unchanged, doesn't count vs rate limit
    const res = await fetch(url, { headers, cache: "no-store" });
    cache.at = Date.now();
    if (res.status === 304) return cache.list;
    if (res.ok) {
      const tag = res.headers.get("ETag");
      if (tag) cache.etag = tag;
      cache.list = parseRevoked(await res.json());
      chrome.storage.local.set({ _revCache: cache.list, _revEtag: cache.etag });
    }
    return cache.list;
  } catch (e) {
    return cache.list; // fail-open: keep last known list
  }
}

// One-device binding: check/claim a code against the shared Pantry store.
// Returns { ok:true } to allow, { ok:false } if the code is bound to another device.
async function claimDevice(jti, deviceId, label) {
  if (!PANTRY_ID || !jti || !deviceId) return { ok: true };
  const base = "https://getpantry.cloud/apiv1/pantry/" + PANTRY_ID + "/basket/wpbind";
  const H = { "Content-Type": "application/json" };
  try {
    let bindings = null;
    const g = await fetch(base, { headers: H, cache: "no-store" });
    if (g.ok) { try { bindings = await g.json(); } catch (e) { bindings = {}; } }
    if (bindings && bindings[jti]) {
      if (bindings[jti] === deviceId) return { ok: true };
      logAlert(jti, deviceId, label); // a different computer is trying this code
      return { ok: false };
    }
    // not yet claimed -> claim it (POST creates the basket, PUT merges into it)
    const method = bindings === null ? "POST" : "PUT";
    await fetch(base, { method, headers: H, body: JSON.stringify({ [jti]: deviceId }) });
    return { ok: true };
  } catch (e) { return { ok: true }; } // fail-open on network/store error
}

// Record a "code used on another device" attempt so the owner can see it.
async function logAlert(jti, deviceId, label) {
  if (!PANTRY_ID) return;
  const base = "https://getpantry.cloud/apiv1/pantry/" + PANTRY_ID + "/basket/wpalerts";
  const H = { "Content-Type": "application/json" };
  const key = "a" + Date.now() + Math.floor(Math.random() * 1000);
  const entry = { jti: jti, dev: deviceId, label: label || "", t: Date.now() };
  try {
    const g = await fetch(base, { headers: H, cache: "no-store" });
    await fetch(base, { method: g.ok ? "PUT" : "POST", headers: H, body: JSON.stringify({ [key]: entry }) });
  } catch (e) {}
}

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (msg && msg.type === "isRevoked") {
    if (!msg.jti) { send({ revoked: false }); return false; }
    getRevokedList().then((list) => send({ revoked: list.indexOf(msg.jti) !== -1 }));
    return true; // async
  }
  if (msg && msg.type === "claimDevice") {
    claimDevice(msg.jti, msg.deviceId, msg.label).then((r) => send(r));
    return true; // async
  }
});
