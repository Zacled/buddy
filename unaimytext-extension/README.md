# HumanType Pro + UnAIMyText (Chrome extension)

One popup, two tabs:

- **Auto Typer** — realistic human typing simulation into the active page
  (Google Docs, Word for the web, Notion, Gmail, plain text fields).
- **UnAIMyText Rewriter** — a handoff to the real
  [unaimytext.com](https://unaimytext.com/): paste your text, click one
  button, humanize on the site, then send the result straight back into
  the Auto Typer.

Works in Chrome and Safari (see Safari notes below).

## The rewriter flow

1. Paste your writing into the box and click **Humanize on UnAIMyText** —
   the site opens in a new tab and the extension drops your text into the
   site's input box automatically (it's also copied to the clipboard as a
   fallback).
2. Humanize it on the website.
3. Click the floating purple **⚡ Send to Auto Typer** button the extension
   adds to the site — the humanized text is captured and loaded into the
   Auto Typer tab, ready to type. If auto-detection can't find the result,
   select the text on the page and click the button again.

## Auto Typer tab

- Detects the editor on the active tab and types your text with natural
  speed, pauses, typos, corrections and breaks.
- Start / Pause / Stop / Test controls, live progress bar and ETA.
- Built-in presets (Natural, Careful Writer, Fast Typist, Tired &
  Distracted) plus save/load of your own.
- Typing-dynamics sliders and advanced behaviour: hesitation before long
  words and punctuation, fatigue, burst mode.
- Keyboard shortcuts: `Ctrl/⌘+Shift+Space` pause/resume, `Ctrl/⌘+Shift+U` stop.

## Install (Chrome, unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Pin the extension and click its icon.

## Safari

Safari (16.4+) runs this as a converted web extension. On a Mac with
Xcode installed:

1. `xcrun safari-web-extension-converter /path/to/unaimytext-extension`
2. Open the generated Xcode project and press **Run**.
3. Safari → **Settings → Extensions** → enable the extension.
4. If it doesn't appear, enable Safari's **Develop** menu and choose
   **Develop → Allow Unsigned Extensions** (this resets on every Safari
   restart).

Safari-specific behaviour handled by the code: Google Docs typing skips
the `execCommand` insertion path on WebKit (it would otherwise insert
every character twice), and system notifications are skipped where the
API is unavailable.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest (popup + content scripts + service worker) |
| `popup.html` / `popup.css` | Tabbed popup UI (purple theme) |
| `popup.js` | Tabs, typer controls/presets/sliders, UnAIMyText handoff |
| `content-script.js` | Typing engine injected into pages |
| `unaimytext-bridge.js` | Runs on unaimytext.com: autofills your text and adds the "Send to Auto Typer" button |
| `service-worker.js` | Badge progress + notifications + shortcuts |
| `icons/` | Toolbar icons |
