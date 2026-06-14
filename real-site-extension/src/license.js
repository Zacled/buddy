/* Wheel Picker — activation check (PUBLIC key, safe to distribute). */
(function () {
  "use strict";
  const PUBLIC_JWK = {"kty":"EC","crv":"P-256","x":"f982lK7uURFUI1N6oZZ3tnc5VJGJh3rh2_cL2wF6OqY","y":"m_5_tsG_wVpCx8sIY4XS4sIxVJ80PwmMZKWTc-s2kPM"};
  function b64urlToBytes(s) {
    s = String(s).replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  let keyPromise = null;
  function getKey() {
    if (!keyPromise) keyPromise = crypto.subtle.importKey("jwk", PUBLIC_JWK, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return keyPromise;
  }
  async function parse(code) {
    if (!code) return null;
    const parts = String(code).trim().split(".");
    if (parts.length !== 2) return null;
    const payload = b64urlToBytes(parts[0]);
    const sig = b64urlToBytes(parts[1]);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, await getKey(), sig, payload);
    if (!ok) return null;
    try { return JSON.parse(new TextDecoder().decode(payload)); } catch (e) { return null; }
  }
  async function verify(code) {
    try {
      const obj = await parse(code);
      if (!obj) return false;
      if (obj.exp && Date.now() > obj.exp) return false; // expired
      return true;
    } catch (e) { return false; }
  }
  async function info(code) {
    try {
      const obj = await parse(code);
      if (!obj) return { valid: false };
      const expired = !!(obj.exp && Date.now() > obj.exp);
      return { valid: !expired, expired, id: obj.id || "", exp: obj.exp || null, jti: obj.jti || "" };
    } catch (e) { return { valid: false }; }
  }
  self.WPLicense = { verify, info };
})();
