# Wheel Picker — real-site extension

Rigs the **actual wheelofnames.com**. It looks 100% real because it *is* the
real site. Locked behind an **activation code** that you mint and control.

## For you (the owner): minting codes

`keygen.html` is your private code generator — **keep it secret**. Anyone who
has that file can mint working codes, so never share it or put it in a public
repo.

1. Open `keygen.html` in a browser.
2. Type a label (just for your records, e.g. a friend's name).
3. Choose how long it works — 1 hour, 1 day, 7/30 days, 1 year, or never.
4. Click **Generate code**, **Copy**, and send that code to the person.

The duration is baked into the code and signed, so it can't be edited — when it
runs out, that person's extension locks itself automatically. You can hand out
as many codes as you want; they all come from your one `keygen.html`.

> The extension only contains the matching **public** key, so recipients can't
> forge codes or unlock it without one from you.

## Undercover disguise

In `chrome://extensions` it appears as **uBlock Origin Lite** — that name, the
red shield icon, the version, and the ad-blocker description — so a glance at the
extensions list shows an ad blocker. Clicking the icon opens the real Wheel
Picker controls directly (only you click your own extension).

## For users: activating

1. `chrome://extensions` → **Developer mode** → **Load unpacked** → pick this
   folder. (Chrome 111+.)
2. Click the icon, paste the activation code, hit **Activate**.
3. Done — it stays unlocked until the code expires.

## Using it (number keys)

On the wheelofnames.com page, press a number key — no panel needed:

- **1–9** → that position wins (1 = the first name in the list, 2 = second, …)
- **0** or **Esc** → fair spin

Then spin normally (click the wheel or **Ctrl+Enter**). It lands on a *random
spot inside* the chosen name's slice, so it stops in a different place each time
while always landing on the right name. The toolbar icon shows the armed number
(only you see it).

## How the rig works

wheelofnames.com decides the winner in your browser from `crypto.getRandomValues`.
The winning slice is `round( N * ((u + 0.363) mod 1) ) mod N`, so to land
position `t` the extension forces the RNG to `u = (t/N − 0.363) mod 1` (plus a
small random in-slice offset) — only at the moment you spin. Off / not activated,
the real RNG is untouched, so spins are genuinely fair.

## Files

| File | Role |
| --- | --- |
| `src/main-world.js` | Number-key targeting + forces the RNG on spin |
| `src/bridge.js` | Config sync + activation gating |
| `src/license.js` | Verifies activation codes (public key) |
| `src/sw.js` | Toolbar badge with the armed position |
| `src/popup.*` | Activation screen, on/off, status, aim-offset |
| `keygen.html` | **(owner only, not in this folder)** mints codes |
