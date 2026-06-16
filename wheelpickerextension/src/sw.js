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
// rejected ("already active on another device"). Blank = off.
const PANTRY_ID = "7d7f229c-0e9b-4be0-b325-1d0537c2c70c";

// ── OWNER ALERTS (Discord webhook) ───────────────────────────────────────────
// Get a real ping the moment someone tries a shared code on another device, and
// when a code auto-revokes after 3 strikes.
//
// SETUP (do this BEFORE you hand out copies — the alert is sent from the
// *sharer's* browser, so the URL must already be baked into their copy):
//   1. Discord → a server you own → Edit Channel → Integrations → Webhooks →
//      "New Webhook" → Copy Webhook URL.
//   2. Paste it between the quotes below.
// Blank = Discord alerts off (strikes are still logged to the Pantry basket).
const BAKED_ALERT_WEBHOOK = ""; // e.g. "https://discord.com/api/webhooks/123456789/abcDEF..."

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

// ---- one-device binding + 3-strike warnings (via Pantry) ----
// Record per code:  wpbind[jti] = { dev:<boundDeviceId>, w:<warnings 0-3> }
const PBIND = PANTRY_ID ? ("https://getpantry.cloud/apiv1/pantry/" + PANTRY_ID + "/basket/wpbind") : "";
const PJSON = { "Content-Type": "application/json" };

function recOf(bindings, jti) {
  const e = bindings ? bindings[jti] : null;
  if (!e) return null;
  if (typeof e === "string") return { dev: e, w: 0, seen: [] }; // migrate old format
  return { dev: e.dev || "", w: e.w || 0, seen: Array.isArray(e.seen) ? e.seen : [] };
}

// Called at activation. The OWNER (first/bound computer) is allowed. Any OTHER
// computer is BLOCKED ("used on another computer"); the first time each new
// computer tries, it counts one strike against the code (the owner sees these).
// Returns { status: "ok" | "blocked" | "dead" }.
async function activateCheck(jti, deviceId, label) {
  if (!PANTRY_ID || !jti || !deviceId) return { status: "ok" };
  try {
    let bindings = null;
    const g = await fetch(PBIND, { headers: PJSON, cache: "no-store" });
    if (g.ok) { try { bindings = await g.json(); } catch (e) { bindings = {}; } }
    const rec = recOf(bindings, jti);
    if (!rec) {
      const method = bindings === null ? "POST" : "PUT";
      await fetch(PBIND, { method, headers: PJSON, body: JSON.stringify({ [jti]: { dev: deviceId, w: 0, seen: [] } }) });
      return { status: "ok" };
    }
    if (rec.w >= 3) return { status: "dead" };
    if (rec.dev === deviceId) return { status: "ok" }; // the owner / bound computer
    // a different computer (the person it was shared with) -> blocked + one strike per new computer
    if (rec.seen.indexOf(deviceId) === -1) {
      rec.seen.push(deviceId);
      const w = rec.seen.length;
      await fetch(PBIND, { method: "PUT", headers: PJSON, body: JSON.stringify({ [jti]: { dev: rec.dev, w: w, seen: rec.seen } }) });
      logAlert(jti, deviceId, label, w);
    }
    return { status: "blocked" };
  } catch (e) { return { status: "ok" }; } // fail-open
}

// Periodic, throttled, never increments. The OWNER sees their warning count;
// any other computer is "blocked". Returns { state: "ok"|"warn"|"dead"|"blocked", n }.
let pcache = { at: 0, bindings: null };
async function codeStatus(jti, deviceId) {
  if (!PANTRY_ID || !jti || !deviceId) return { state: "ok" };
  try {
    if (Date.now() - pcache.at > 20000) {
      const g = await fetch(PBIND, { headers: PJSON, cache: "no-store" });
      if (g.ok) { try { pcache.bindings = await g.json(); } catch (e) {} }
      pcache.at = Date.now();
    }
    const rec = recOf(pcache.bindings, jti);
    if (!rec) return { state: "ok" };
    if (rec.w >= 3) return { state: "dead" };
    if (rec.dev === deviceId) return rec.w > 0 ? { state: "warn", n: rec.w } : { state: "ok" };
    return { state: "blocked" };
  } catch (e) { return { state: "ok" }; }
}

// Record a "code used on another device" attempt so the owner can see it: log it
// to the Pantry basket AND (if configured) push a Discord message right away.
async function logAlert(jti, deviceId, label, n) {
  const who = label ? ('"' + label + '"') : ("code " + jti);
  const revoked = (n || 0) >= 3;

  // 1) Pantry log (history the keygen can read).
  if (PANTRY_ID) {
    const base = "https://getpantry.cloud/apiv1/pantry/" + PANTRY_ID + "/basket/wpalerts";
    const key = "a" + Date.now() + Math.floor(Math.random() * 1000);
    const entry = { jti: jti, dev: deviceId, label: label || "", w: n || 0, t: Date.now() };
    try {
      const g = await fetch(base, { headers: PJSON, cache: "no-store" });
      await fetch(base, { method: g.ok ? "PUT" : "POST", headers: PJSON, body: JSON.stringify({ [key]: entry }) });
    } catch (e) {}
  }

  // 2) Discord push (real-time ping).
  if (BAKED_ALERT_WEBHOOK) {
    const content = revoked
      ? ("🔴 **Code auto-revoked** — " + who + " hit **3/3** strikes and is now dead for everyone.\nLast offending device: `" + deviceId + "`")
      : ("⚠️ **Code shared** — " + who + " was used on another device. Strike **" + (n || 1) + "/3**.\nOffending device: `" + deviceId + "`");
    try {
      await fetch(BAKED_ALERT_WEBHOOK, { method: "POST", headers: PJSON, body: JSON.stringify({ content: content }) });
    } catch (e) {}
  }
}

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (msg && msg.type === "isRevoked") {
    if (!msg.jti) { send({ revoked: false }); return false; }
    getRevokedList().then((list) => send({ revoked: list.indexOf(msg.jti) !== -1 }));
    return true; // async
  }
  if (msg && msg.type === "activateCheck") {
    activateCheck(msg.jti, msg.deviceId, msg.label).then((r) => send(r));
    return true; // async
  }
  if (msg && msg.type === "codeStatus") {
    codeStatus(msg.jti, msg.deviceId).then((r) => send(r));
    return true; // async
  }
});
