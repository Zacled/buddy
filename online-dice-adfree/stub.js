/* ============================================================
   stub.js  —  runs in the PAGE's JS world, at document_start
   ------------------------------------------------------------
   Goal: make ad-block detectors believe ads loaded fine, so the
   "ad blocker detected" wall never gets triggered in the first
   place. This runs BEFORE the site's own scripts, so our stubs
   are what the detector sees.
   ============================================================ */
(function () {
  'use strict';

  /* ---- 1. Fake a working Google AdSense ------------------------------
     Detectors commonly check `window.adsbygoogle` (does it exist? did it
     load?). Provide a benign array with a no-op push and loaded=true.   */
  try {
    var ab = window.adsbygoogle;
    if (!Array.isArray(ab)) ab = [];
    ab.loaded = true;
    // Replace the queue push with a no-op so nothing actually requests ads.
    ab.push = function () { return 1; };
    window.adsbygoogle = ab;
  } catch (e) {}

  /* ---- 2. "Can run ads" sentinels checked by homemade detectors ------
     Many sites ship a tiny external file (e.g. ads.js) that sets a flag;
     if an ad blocker eats that file the flag stays undefined and the
     site shows a wall. We pre-set the friendly values.                  */
  try {
    window.canRunAds      = true;
    window.canShowAds     = true;
    window.isAdBlockActive = false;
    window.adBlockEnabled = false;
    window.adblockDetected = false;
    window.adBlockDetected = false;
  } catch (e) {}

  /* ---- 3. Neutralize the FuckAdBlock / BlockAdBlock family -----------
     These libraries expose onDetected()/onNotDetected()/check(). We
     replace the constructor with a harmless one that only ever fires
     the "not detected" path and never the "detected" path.            */
  function FakeAdBlock() { this._notDetected = null; }
  var ret = function () { return this; };
  FakeAdBlock.prototype.setOption      = ret;
  FakeAdBlock.prototype.options        = {};
  FakeAdBlock.prototype.onDetected     = ret;                 // ignore "detected" handlers
  FakeAdBlock.prototype.onNotDetected  = function (cb) {
    if (typeof cb === 'function') { this._notDetected = cb; setTimeout(cb, 1); }
    return this;
  };
  FakeAdBlock.prototype.on = function (detected, cb) {        // .on(true, cb) = detected
    if (!detected && typeof cb === 'function') setTimeout(cb, 1);
    return this;
  };
  FakeAdBlock.prototype.emitEvent  = ret;
  FakeAdBlock.prototype.clearEvent = ret;
  FakeAdBlock.prototype.check      = function () {
    if (typeof this._notDetected === 'function') setTimeout(this._notDetected, 1);
    return true;
  };

  // Expose the constructors via getters that swallow any reassignment,
  // and provide ready-made singletons some pages reference directly.
  ['FuckAdBlock', 'BlockAdBlock'].forEach(function (name) {
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        get: function () { return FakeAdBlock; },
        set: function () { /* ignore the page's real definition */ }
      });
    } catch (e) {}
  });
  try {
    window.fuckAdBlock = new FakeAdBlock();
    window.blockAdBlock = new FakeAdBlock();
  } catch (e) {}

  /* ---- 4. Google Funding Choices / AdSense "ad blocking recovery" ----
     This is what most AdSense sites use for the "Please disable your ad
     blocker" wall. The network rules block its script; here we also stub
     its API so any queued callbacks no-op instead of throwing/retrying. */
  try {
    var fc = window.googlefc || {};
    fc.callbackQueue = fc.callbackQueue || [];
    if (typeof fc.callbackQueue.push !== 'function') fc.callbackQueue.push = function () {};
    fc.controlledMessagingFunction = function () {};
    fc.showRevocationMessage = function () {};
    window.googlefc = fc;
  } catch (e) {}
})();
