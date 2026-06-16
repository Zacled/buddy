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

## Revoking a code (kill switch)

Expiry is the simplest control, but you can also kill a code on demand. One-time
setup (in the generator, `keygen.html`):

1. Under **Step 1 — Revocation hosting**, make a **classic GitHub token** with
   only the `gist` scope, paste it in, and click **Connect**. The generator
   creates a private gist for your kill-list and shows a **REVOCATION_URL**.
2. Put that URL into the extension: **popup → Advanced → Revocation URL**
   (or bake it into `BAKED_REVOCATION_URL` in `src/sw.js` for copies you hand
   out, so each person doesn't have to set it).

Then, to kill a code: in the generator's **Codes** list, click **Revoke**. It
publishes to your gist automatically; within a few seconds the extension
re-checks (it polls every ~6s, on tab focus, and on every spin, with
cache-busting) and locks that code — the popup shows "deactivated." Click
**Restore** to bring it back. (No GitHub? Use **Copy revocation list** and paste
it into any hosted `revoked.json` yourself.)

Notes: revocation needs the person online (if the list can't be fetched it
fails *open*, so a network blip won't lock people out). Leave the URL blank to
disable revocation and rely on expiry only.

## Locking a code to one device (stop key-sharing)

Each install shows a unique **Device ID** on the activation screen. To make a
code that only works on that one machine:

1. The person sends you their Device ID (copy button on the activation screen).
2. In the generator, paste it into **"Lock to one device"** before generating.
3. The Device ID is signed into the code, so the extension activates only when
   the code's Device ID matches that machine — a shared copy says "locked to a
   different device."

Leave the field blank for a code that works on any device. (Like all
client-side locks this isn't unbreakable by a determined coder, but it stops
ordinary key-sharing.)

## One code = one computer (automatic) + sharing alerts

You don't have to pre-lock a code to a device. With a free
[getpantry.cloud](https://getpantry.cloud) Pantry ID baked into `src/sw.js`
(`PANTRY_ID`), **the first computer that activates a code claims it forever**:

- **First device to enter the code → the only device that works.**
- If someone you shared with enters the same code on **another** computer, their
  popup says *"This code is already active on another device,"* and the
  extension stays locked for them.
- Each new computer that tries adds **one strike** to that code. The real
  owner's popup shows a red **"Warning 1 of 3 / 2 of 3 / 3 of 3"** banner.
- On the **3rd strike the code auto-revokes** — it goes dead for *everyone*,
  including the original owner.

### Getting pinged on Discord when it happens

To get a real-time notification (not just the Pantry log) the moment a code is
used on another device — and when one auto-revokes — set up a Discord webhook:

1. In a Discord server you own: **Edit channel → Integrations → Webhooks → New
   Webhook → Copy Webhook URL**.
2. Paste that URL into `BAKED_ALERT_WEBHOOK` in `src/sw.js`.
3. **Do this *before* you hand out copies** — the alert is sent from the
   sharer's browser, so the URL has to already be in the copy they run.

Leave `BAKED_ALERT_WEBHOOK` blank to keep Discord alerts off (strikes are still
recorded to the Pantry `wpalerts` basket either way). Leave `PANTRY_ID` blank to
turn the whole auto-binding/warning/auto-revoke system off.

## Undercover disguise

In `chrome://extensions` it appears as **Google Docs Offline** — that name, the
layered Docs/Sheets/Slides icon, the version, and the Google description — so a
glance at the extensions list shows a normal Google utility. Clicking the icon
opens the real Wheel Picker controls directly (only you click your own
extension).

## For users: activating

1. `chrome://extensions` → **Developer mode** → **Load unpacked** → pick this
   folder. (Chrome 111+.)
2. Click the icon, paste the activation code, hit **Activate**.
3. Done — it stays unlocked until the code expires.

To switch accounts or hand the machine back, click **⎋ Log out** at the top-left
of the popup — it forgets the stored code and returns you to the activation
screen. (Re-entering the same code on the *same* computer still works; it stays
locked on any other computer.)

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
