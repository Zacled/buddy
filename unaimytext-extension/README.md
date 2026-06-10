# UnAIMyText — AI Text Humanizer (Chrome extension)

A browser-action popup that humanizes AI-generated text, modelled on
[unaimytext.com](https://unaimytext.com/). Paste text, pick a humanization
level, hit **Humanize Text**, and copy the result. Everything runs locally —
no signup, no network calls, nothing leaves the device. A header link opens
the full UnAIMyText website when you want the complete toolset.

## What it does

- **Three levels** — Standard (light fixes), Enhanced (deeper rewrite),
  Aggressive (remove all tells).
- **Advanced cleanup toggles**
  - Convert em-dashes (—) to commas, or remove dashes completely
  - Straighten smart quotes (“ ” → " ')
  - Remove hidden Unicode (zero-width characters, non-breaking spaces)
  - Remove persistent whitespace
  - Use natural contractions
- **Humanizing rewrites** — replaces AI-cliché phrases ("utilize" → "use",
  "in order to" → "to", "delve into" → "explore"), softens stock transitions
  ("furthermore" → "also"), trims hedges, breaks up run-on sentences, and
  fixes spelling/capitalization.
- **Estimated AI-marker meter** — a before→after guide based on how many
  common AI tells remain. It's a heuristic, not a guaranteed detector score.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `unaimytext-extension/` folder.
4. Pin the extension and click its icon to open the humanizer.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest (popup action + `storage` permission only) |
| `popup.html` / `popup.css` | Popup UI |
| `popup.js` | UI wiring, persistence, copy/open-site |
| `humanizer.js` | The text-transform engine (`window.Humanizer`) |
| `icons/` | Toolbar icons |
