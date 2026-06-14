# Rigged Wheel (wheelofnames look-alike)

A single self-contained page that looks and behaves like wheelofnames.com but
lets you secretly decide the winner. No install, no server — just open the file.

## Use it

1. Open `index.html` (double-click it, or drag it into a browser tab).
2. Press **F11** to go fullscreen — this hides the address bar so it reads as
   the real site.
3. Type your friends' names in the **Entries** box on the right.
4. **Arm the rig** (see below), then click the wheel (or press **Space**) to spin.
   It glides to your chosen name with a real-looking spin, confetti, and a
   "We have a winner!" popup.

## The secret rig panel

The control that picks the winner is hidden — your friends can't see it. Open it
either way:

- Press **Alt + Shift + R**, or
- **Triple-click the colored logo** in the top-left.

In the panel: type (or pick) the name that should always win and flip **Rig the
wheel** on. Flip it off anytime for a genuinely fair spin. Your choice is
remembered between reloads. Press the same shortcut to hide the panel again.

Shortcut for the impatient: add `#win=NAME` to the URL (e.g.
`index.html#win=Ali`) to arm it for that name automatically.

## Tips for pulling it off

- Do a fair spin or two first (rig off) so it looks legit, then quietly arm it.
- Fullscreen (F11) hides the URL; the tab title and favicon already say
  "Wheel of Names".
- The mute button is bottom-right if you want it silent.

## How the rig works

The winner is whatever slice sits under the pointer when the wheel stops. When
armed, the spin computes the exact final rotation that places your target slice
at the pointer, then animates a normal multi-rotation ease-out to it — so the
visible wheel and the announced winner always agree. Verified: 500,000 simulated
spins landed on the chosen name 100% of the time, while un-rigged spins stay
evenly random.
