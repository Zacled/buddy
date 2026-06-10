# HumanType Pro + UnAIMyText (Chrome extension)

One popup, two tools, switched with tabs:

- **Auto Typer** — realistic human typing simulation into the active page
  (Google Docs, Word for the web, Notion, Gmail, plain text fields).
- **UnAIMyText Rewriter** — an AI text humanizer modelled on
  [unaimytext.com](https://unaimytext.com/), running fully in your browser.
  A header link opens the full website when you want the complete toolset.

## Auto Typer tab

- Detects the editor on the active tab and types your pasted text with
  natural speed, pauses, typos, corrections and breaks.
- Start / Pause / Stop / Test controls, live progress bar and ETA.
- Built-in presets (Natural, Careful Writer, Fast Typist, Tired & Distracted)
  plus save/load of your own.
- Typing-dynamics sliders and advanced behaviour: hesitation before long
  words and punctuation, fatigue, burst mode.
- Keyboard shortcuts: `Ctrl/⌘+Shift+Space` pause/resume, `Ctrl/⌘+Shift+U` stop.

## UnAIMyText Rewriter tab

- **Three levels** — Standard (light fixes), Enhanced (deeper rewrite),
  Aggressive (remove all tells).
- **Advanced cleanup toggles** — em-dashes → commas (or remove dashes),
  straighten smart quotes, strip hidden Unicode (zero-width chars, NBSP),
  remove persistent whitespace, natural contractions.
- **Humanizing rewrites** — replaces AI-cliché phrases ("utilize" → "use",
  "delve into" → "explore"), softens stock transitions, trims hedges,
  breaks up run-on sentences, fixes spelling/capitalization.
- **Estimated AI-marker meter** — a before→after guide (heuristic, not a
  guaranteed detector score).
- **Send to Typer** — pushes the humanized text straight into the Auto Typer.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Pin the extension and click its icon.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest (popup + content script + service worker) |
| `popup.html` / `popup.css` | Tabbed popup UI (purple theme) |
| `popup.js` | Tabs, typer controls/presets/sliders, rewriter UI |
| `humanizer.js` | Text-transform engine (`window.Humanizer`) |
| `content-script.js` | Typing engine injected into pages |
| `service-worker.js` | Badge progress + notifications + shortcuts |
| `icons/` | Toolbar icons |
