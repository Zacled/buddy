# Wheel Picker — real-site extension

Rigs the **actual wheelofnames.com**. It looks 100% real because it *is* the
real site — the extension just steers the outcome behind the scenes.

## How it works

The current wheelofnames.com decides the winner in your browser from
`crypto.getRandomValues`. We measured how that random value maps to the winning
slice:

```
winning index = round( N * ((u + 0.363) mod 1) ) mod N
```

where `N` is the number of names and `u` is the value the site reads from the
RNG. So to land name #t the extension forces `u = (t/N − 0.363) mod 1`. When
armed, it overrides `crypto.getRandomValues` (and briefly `Math.random`) at the
moment you spin, reading the current names straight off the page. Off, the real
RNG is untouched, so spins are genuinely fair.

The `0.363` offset comes from the wheel's deceleration and was measured from
real spins. It's safe for lists up to ~16 names; if a big list ever lands one
name off, nudge **Advanced → Aim offset** by ±0.02.

## Install

1. `chrome://extensions` → turn on **Developer mode**.
2. **Load unpacked** → select this `real-site-extension` folder.
3. Pin the icon. (Requires Chrome 111+.)

## Use

1. Open **wheelofnames.com**, add your names.
2. Click the extension icon, flip it **on**, pick the winning name (the dropdown
   auto-fills from the wheel).
3. Spin the real wheel — click it or press **Ctrl+Enter**. It lands on your pick.
   A green **ON** badge on the toolbar icon reminds you it's armed.
4. Flip it off for a fair spin (do a fair one or two first to sell it).

If the chosen name isn't on the wheel, it spins fairly, so nothing ever looks
mismatched.

## Files

| File | World | Role |
| --- | --- | --- |
| `src/main-world.js` | page | Forces the RNG to the value that lands your pick |
| `src/bridge.js` | content | Syncs config from storage into the page |
| `src/sw.js` | worker | Toolbar ON badge |
| `src/popup.*` | popup | Arm/disarm + choose the name |
