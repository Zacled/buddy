# Online-Dice Ad-Free

A small browser extension that blocks the ads on **online-dice.com** *and*
gets past its "ad blocker detected" wall, so the page works normally with no
ads and no nag screen.

It is scoped strictly to `*.online-dice.com` — it does nothing on any other
site.

## How it works

The tricky part of this site is that simply blocking ads triggers an
"ad blocker detected" message. This extension defeats that with three layers:

1. **Network blocking** (`rules.json`, via `declarativeNetRequest`) — blocks
   requests to ad/tracker domains (AdSense, DoubleClick, Funding Choices, and
   ~25 others), but only when the request comes from online-dice.com.

2. **Anti-detection** (`stub.js`, runs in the page's JS context *before* the
   site's own scripts) — makes detectors think ads loaded fine:
   - stubs `window.adsbygoogle` with a working-looking, no-op queue;
   - sets the "can run ads" sentinel flags (`canRunAds`, etc.);
   - replaces the **FuckAdBlock / BlockAdBlock** libraries with a fake that
     only ever fires the "not detected" path;
   - stubs Google **Funding Choices** (`googlefc`), which is the usual source
     of the "disable your ad blocker" wall on AdSense sites.

3. **Cleanup safety net** (`cleanup.js` + `hide-ads.css`) — if a wall still
   slips through (e.g. an inline detector), a `MutationObserver` finds the
   overlay (known selectors *or* a large fixed/absolute element whose text
   mentions ad blocking), removes it, and restores page scrolling.

> Note: it deliberately does **not** blanket-hide generic `.ad` / `.adsbox`
> class names. Detectors create bait elements with those exact names and check
> if something hid them — hiding them is what gets you flagged.

## Install (Chrome / Edge / Brave)

1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top-right)
3. Click **Load unpacked**
4. Select this `online-dice-adfree/` folder
5. Open <https://www.online-dice.com/roll-color-dice/> — ads gone, no wall.

## Install (Firefox)

Requires Firefox 128+ (for `declarativeNetRequest` + `world: "MAIN"` support).

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select the `manifest.json` inside this folder.

(For a permanent install you'd need to sign the extension via AMO.)

## Tuning

If a new wall variant ever appears:

- Add the ad/host to **`rules.json`** to block it at the network level.
- Add its container's id/class to the `SELECTORS` list in **`cleanup.js`**,
  or to **`hide-ads.css`**.
- The keyword heuristic in `cleanup.js` (`KEYWORD_RE`) catches most generic
  walls automatically; widen it if needed.

To confirm what to add, open DevTools → Network (see which ad host loads) and
Elements (inspect the overlay's id/class).
