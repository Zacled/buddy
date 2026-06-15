/* ============================================================
   cleanup.js  —  runs in the isolated content-script world
   ------------------------------------------------------------
   Safety net: if an "ad blocker detected" overlay/modal still
   shows up (e.g. an inline detector we couldn't pre-empt), find
   it, remove it, and restore page scrolling.
   ============================================================ */
(function () {
  'use strict';

  // Explicit selectors for known recovery walls + obvious adblock modals.
  var SELECTORS = [
    '[id*="adblock" i]', '[class*="adblock" i]',
    '[id*="ad-block" i]', '[class*="ad-block" i]',
    '[id*="ad_block" i]', '[class*="ad_block" i]',
    '[id*="adblocker" i]', '[class*="adblocker" i]',
    '[id*="ab-overlay" i]', '[class*="ab-overlay" i]',
    '[id*="ab-modal" i]', '[class*="ab-modal" i]',
    // Google Funding Choices (AdSense ad-block recovery) containers:
    '.fc-ab-root', '.fc-dialog-overlay', '.fc-dialog-container',
    '.fc-consent-root', '.fc-monetization-dialog'
  ];

  // Text used by adblock walls — required for the heuristic removal below.
  var KEYWORD_RE = /(ad[\s-]?block(er)?|disable (your )?ad ?block|turn off (your )?ad ?block|whitelist (this|our) site|using an ad ?block|support us by)/i;

  function unlockScroll() {
    [document.documentElement, document.body].forEach(function (el) {
      if (!el) return;
      el.style.setProperty('overflow', 'auto', 'important');
      el.style.removeProperty('position');
      ['modal-open', 'noscroll', 'no-scroll', 'ovh', 'stop-scrolling',
       'fc-html-no-scroll', 'overflow-hidden', 'has-modal'].forEach(function (c) {
        el.classList.remove(c);
      });
    });
  }

  function isBlockingOverlay(el) {
    try {
      var cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') return false;
      var r = el.getBoundingClientRect();
      var big = r.width >= window.innerWidth * 0.5 && r.height >= window.innerHeight * 0.5;
      var z = parseInt(cs.zIndex, 10);
      return big && (isNaN(z) || z >= 100);
    } catch (e) { return false; }
  }

  function nuke(el) {
    if (!el || el === document.body || el === document.documentElement) return;
    try { el.remove(); } catch (e) {}
    unlockScroll();
  }

  function each(list, fn) { Array.prototype.forEach.call(list || [], fn); }

  function sweep(root) {
    if (!root || !root.querySelectorAll) return;
    // 1. Known selectors.
    SELECTORS.forEach(function (sel) {
      var nodes;
      try { nodes = root.querySelectorAll(sel); } catch (e) { return; }
      each(nodes, nuke);
    });
    // 2. Heuristic: large fixed/absolute overlay that talks about ad blocking.
    each(root.querySelectorAll('div,section,aside,dialog'), function (el) {
      if (isBlockingOverlay(el) && KEYWORD_RE.test(el.textContent || '')) nuke(el);
    });
  }

  function checkNode(n) {
    if (n.nodeType !== 1) return;
    SELECTORS.forEach(function (sel) {
      try { if (n.matches && n.matches(sel)) nuke(n); } catch (e) {}
    });
    if (isBlockingOverlay(n) && KEYWORD_RE.test(n.textContent || '')) nuke(n);
    sweep(n);
  }

  function ensureScrollable() {
    var he = document.documentElement;
    var bd = document.body;
    try {
      if (he && getComputedStyle(he).overflow === 'hidden') unlockScroll();
      else if (bd && getComputedStyle(bd).overflow === 'hidden') unlockScroll();
    } catch (e) {}
  }

  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      each(mutations[i].addedNodes, checkNode);
    }
    ensureScrollable();
  });

  function start() {
    sweep(document);
    ensureScrollable();
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Some detectors fire on a timer after load; sweep periodically for ~20s.
    var ticks = 0;
    var iv = setInterval(function () {
      sweep(document);
      ensureScrollable();
      if (++ticks > 40) clearInterval(iv);
    }, 500);
  }

  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
