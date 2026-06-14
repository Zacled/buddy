# Wheel Rigger

A Chrome extension that decides who [wheelofnames.com](https://wheelofnames.com)
lands on. Arm it, pick a name, and every spin glides to that name — the wheel
still accelerates, spins, and decelerates exactly like normal, so it looks
completely real. Flip it off for a genuinely fair spin.

Built for harmless pranks on your own browser. The control panel and the
on/off badge live in *your* toolbar, never on the page.

## Install

1. Open `chrome://extensions` in Chrome (or any Chromium browser — Edge, Brave).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `wheel-of-names-rigger` folder.
4. The wheel icon appears in your toolbar. Pin it for quick access.

Requires Chrome 111+ (for `world: "MAIN"` content scripts).

## Use

1. Open a tab on **wheelofnames.com** and add your friends' names as usual.
2. Click the extension icon.
3. Flip the switch **on** and type/pick the name that should always win.
   The dropdown auto-fills with the names currently on that wheel.
4. Spin. It lands on your chosen name. A green **ON** badge on the toolbar
   icon reminds you the rig is armed.
5. Want a fair spin? Flip the switch off (badge clears).

If the chosen name isn't on the wheel, it spins fairly — so a typo won't expose
you with an obvious mismatch.

## How it works

wheelofnames.com is the open-source app
[`momander/wheel-spinner`](https://github.com/momander/wheel-spinner). The
winner is purely a function of the wheel's final rotation angle. At the moment a
spin switches from accelerating to decelerating, the app picks a random resting
angle:

```js
// Wheel.js -> setRandomPosition()
this.angle = Math.random() * 2 * Math.PI;
```

...then decelerates by a **fully deterministic** amount before reading whichever
entry sits under the pointer (`Util.getIndexAtPointer`). Crucially, the
on-screen pointer and the announced winner read that *same* angle — so there's
never a mismatch to give it away.

The extension reaches the live `Wheel` instance through Vue's `__vue__` handle
and wraps `setRandomPosition`. It lets the original run, then overwrites
`this.angle` with `targetAngle − decelerationTravel`, computed from the wheel's
live speed and spin settings. After the deceleration plays out, the wheel
lands exactly on the target — smoothly, with no snapping.

Because everything is derived from the wheel's own physics, it's independent of
spin duration, slow-spin mode, weighted slices, and how many names are on the
wheel.

### Files

| File | World | Role |
| --- | --- | --- |
| `src/main-world.js` | page (MAIN) | Hooks the wheel and forces the angle |
| `src/bridge.js` | content (ISOLATED) | Syncs config from storage into the page |
| `src/sw.js` | service worker | Keeps the toolbar **ON** badge in sync |
| `src/popup.*` | popup | Control panel: arm/disarm + choose the name |

## Limitations

- Works on **your** browser only (where the extension is installed) — which is
  exactly the "everyone's watching my laptop" prank setup.
- Wheels with **more than 500 names** use a scrolling-window mode where entries
  are swapped during the spin; targeting falls back to a fair spin there.
- Relies on the public wheelofnames.com app structure. If the site is rewritten,
  the hook may need updating.

## Verifying the math

The deceleration/angle math was validated with a faithful physics simulation
(`verify_rig.js` in the development notes): 200,000 rigged spins across random
entry counts, weights, spin durations, and first/repeat spins all landed on the
target (100%), while fair spins stayed evenly distributed.
