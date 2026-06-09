# HumanType Pro

A **Manifest V3 Chrome extension** that types text into web pages the way a real
person would — variable speed, thinking pauses, believable typos that get
back-spaced away, false starts, fatigue and the occasional fast burst.

> ⚠️ **Use responsibly.** HumanType Pro is a productivity / accessibility /
> testing tool (filling forms, demos, automated content entry, RSI relief).
> Don't use it to misrepresent authorship or to violate the terms of service of
> any site you don't control.

---

## ✨ Features

- **Premium dark UI** with gold accents — a big paste box, Start / Pause / Stop /
  Test controls, a live progress bar, character count and an estimated
  completion time.
- **Nine core sliders:** typing speed, speed variance, break frequency, break
  variance, min break length, max break length, typo rate, false-start rate and
  correction delay.
- **Advanced behaviour toggles:** hesitate before long words, hesitate before
  punctuation, fatigue simulation, and burst-typing mode (each with its own
  fine-tuning slider).
- **Realistic typing engine** — gaussian per-keystroke timing, punctuation
  slow-downs, adjacency-aware "fat-finger" typos, false starts, thinking
  breaks, progressive fatigue and bursts.
- **Multi-editor support:** plain `<textarea>`/`<input>`, any `contenteditable`,
  **Gmail** compose, **Notion**, **Google Docs**, and **Word for the web**.
- **Auto-detection** of the active editor, cursor preserved, with full
  **pause / resume** and keyboard shortcuts.
- **Presets & persistence** via `chrome.storage` — built-in presets plus your
  own saved configurations, all syncable across devices.

---

## 📁 Project structure

```
humantype-pro/
├── manifest.json              # MV3 manifest (paths are relative to dist/)
├── package.json               # scripts + dev dependencies
├── tsconfig.json              # strict TypeScript config (type-check only)
├── build.mjs                  # esbuild bundler → dist/
├── scripts/
│   └── generate-icons.mjs     # dependency-free PNG icon generator
├── icons/                     # icon16/48/128.png (generated)
└── src/
    ├── shared/                # types, message contracts, defaults & presets
    │   ├── types.ts
    │   ├── messages.ts
    │   └── defaults.ts
    ├── utils/                 # randomness, keyboard geometry, timing, logger
    │   ├── random.ts
    │   ├── keyboard.ts
    │   ├── timing.ts
    │   └── logger.ts
    ├── engine/
    │   └── human-typing-engine.ts   # the HumanTypingEngine (core behaviour)
    ├── storage/
    │   └── storage-manager.ts       # chrome.storage facade (settings/presets)
    ├── content/
    │   ├── content-script.ts        # per-tab engine host + message router
    │   └── editors/                 # one adapter per supported editor
    │       ├── editor-adapter.ts        # interface + shared DOM helpers
    │       ├── textarea-adapter.ts
    │       ├── contenteditable-adapter.ts
    │       ├── gmail-adapter.ts
    │       ├── notion-adapter.ts
    │       ├── word-online-adapter.ts
    │       ├── google-docs-adapter.ts
    │       └── editor-detector.ts
    ├── background/
    │   └── service-worker.ts        # badge, notifications, shortcuts
    └── popup/
        ├── popup.html
        ├── popup.css
        └── popup.ts
```

The TypeScript in `src/` is bundled by **esbuild** into a handful of plain
`.js` files in `dist/`, which — together with the copied `manifest.json`,
`popup.html`, `popup.css` and `icons/` — is the folder you load into Chrome.

---

## 🏗️ Build instructions

Requires **Node.js 18+**.

```bash
cd humantype-pro

# 1. Install the dev dependencies (esbuild, typescript, @types/chrome)
npm install

# 2. Generate the toolbar icons (writes icons/icon16|48|128.png)
npm run icons

# 3. Build the extension into ./dist
npm run build
```

Handy shortcuts:

| Command             | What it does                                            |
| ------------------- | ------------------------------------------------------- |
| `npm run dist`      | Generate icons **and** build in one step                |
| `npm run watch`     | Rebuild on every save (sourcemaps, unminified)          |
| `npm run typecheck` | Strict `tsc --noEmit` type check (no output emitted)    |
| `npm run clean`     | Delete `./dist`                                         |

> `dist/` and `node_modules/` are git-ignored. Run the build before loading.

---

## 🚀 Installation (load unpacked)

1. Run the build steps above so `humantype-pro/dist/` exists.
2. Open `chrome://extensions` in Chrome (or any Chromium browser).
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked** and select the **`humantype-pro/dist`** folder.
5. Pin **HumanType Pro** from the puzzle-piece menu for quick access.

To update after code changes: run `npm run build` again and click the **reload**
icon on the extension card.

---

## 🖱️ Usage

1. Open the page you want to type into and **click into the editor** (textarea,
   doc body, Gmail compose, etc.) so it's focused.
2. Click the HumanType Pro toolbar icon. The popup shows the **detected editor**.
3. Paste your text into the big box.
4. Tune the sliders (or pick a **preset**), then press **Start**.
   - **Pause / Resume** — `Ctrl/⌘ + Shift + Space`
   - **Stop** — `Ctrl/⌘ + Shift + U`
   - **Test** types a short sample so you can feel the current settings.
5. Watch the progress bar, character count and live ETA. The toolbar badge
   mirrors progress even when the popup is closed, and a desktop notification
   fires on completion.

### Presets

- Pick a built-in preset (★ Natural, Careful Writer, Fast Typist, Tired &
  Distracted) and press **Load**.
- Type a name and press **Save** to store your own (synced via Chrome).
- **Reset** restores the factory defaults.

---

## ⚙️ How the engine works

`HumanTypingEngine` walks the target string and, for every character, folds
together:

- `calculateDelay()` — a WPM baseline with **gaussian jitter**, longer pauses
  after punctuation/newlines, a **fatigue** multiplier that grows with progress,
  and a **burst** multiplier for fast runs.
- `simulateThinkingPause()` — break-frequency-gated pauses bounded by your
  min/max break sliders.
- `generateTypo()` / `simulateCorrection()` — picks a physically **adjacent
  QWERTY key**, types it, waits the correction delay, then back-spaces and
  retypes (sometimes compounding into a two-key slip).
- `simulateFalseStart()` — types a couple of letters, hesitates, deletes them.
- `startTyping()` / `stopTyping()` / `pauseTyping()` / `resumeTyping()` — fully
  cancellable via `AbortSignal` and resumable via an internal gate, so the caret
  position and progress are always preserved.

Each editor is reached through a small **adapter** implementing
`insertChar` / `deleteChar`, so adding a new target never touches the engine.

---

## 🧩 Editor support & limitations

| Editor                         | Reliability | Notes                                                        |
| ------------------------------ | ----------- | ------------------------------------------------------------ |
| `<textarea>` / `<input>`       | ★★★★★       | Framework-aware (`input` events fire for React, etc.).       |
| `contenteditable`              | ★★★★☆       | Uses `execCommand('insertText')` at the live caret.          |
| Gmail compose                  | ★★★★☆       | Targets the "Message Body" editable.                         |
| Notion                         | ★★★★☆       | Types into the focused block.                                |
| Google Docs                    | ★★☆☆☆       | **Best-effort.** Docs renders to `<canvas>`; we dispatch key events at the hidden text-event iframe. Google changes this internal surface periodically. |
| Word for the web               | ★★☆☆☆       | **Best-effort.** Cross-origin editing iframes can't be reached from the top frame. |

For Google Docs / Word, click directly inside the document body first, and keep
the tab focused while typing.

---

## 🔒 Permissions

| Permission           | Why                                                            |
| -------------------- | ------------------------------------------------------------- |
| `storage`            | Persist settings and presets.                                 |
| `activeTab`          | Interact with the tab you explicitly act on.                  |
| `notifications`      | "Typing complete" desktop notification.                       |
| `host_permissions: <all_urls>` | Inject the content script so typing works on any site. |

No data ever leaves your browser — there are no network requests.

---

## 📝 License

Provided as-is for personal, educational and authorized testing use.
