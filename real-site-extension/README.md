# Wheel Picker — real-site extension

Rigs the **actual wheelofnames.com**. It looks 100% real because it *is* the
real site — the extension just steers the outcome behind the scenes.

## Use it (number keys)

On the wheelofnames.com page, just press a number key — no panel needed:

- **1–9** → that position wins (1 = the first name in the list, 2 = second, …)
- **0** or **Esc** → fair spin (rig off)

Then spin the wheel normally (click it or **Ctrl+Enter**) and it lands on the
position you picked. A tiny confirmation flashes in the bottom-left corner when
you press a key, and the toolbar icon shows the armed number (only you see it).

Tip: press **0** for a fair spin or two first to sell it, then quietly press the
number for the friend you want to win.

## Install / update

1. `chrome://extensions` → turn on **Developer mode**.
2. **Load unpacked** → select this `real-site-extension` folder.
   (Updating? Replace the folder, then click the **reload ⟳** icon on the card.)
3. Pin the icon. (Requires Chrome 111+.)

## How it works

The current wheelofnames.com decides the winner in your browser from
`crypto.getRandomValues`. We measured how that value maps to the winning slice:

```
winning index = round( N * ((u + 0.363) mod 1) ) mod N
```

where `N` is the number of names and `u` is the value the site reads from the
RNG. So to land position `t` the extension forces `u = (t/N − 0.363) mod 1`,
only at the moment you spin. Off, the real RNG is untouched, so spins are
genuinely fair.

The `0.363` offset (from the wheel's deceleration) is safe for lists up to ~16
names. If a big list ever lands one name off, nudge **Advanced → Aim offset** by
±0.02.

## Files

| File | World | Role |
| --- | --- | --- |
| `src/main-world.js` | page | Number-key targeting + forces the RNG on spin |
| `src/bridge.js` | content | Config sync, on-screen confirmation, name lookup |
| `src/sw.js` | worker | Toolbar badge with the armed position number |
| `src/popup.*` | popup | On/off, status, aim-offset safety valve |
