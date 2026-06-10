/**
 * HumanType Pro — Content script.
 *
 * Injected into every page. It owns the per-tab {@link HumanTypingEngine},
 * detects the active editor on demand, and translates command messages from the
 * popup/background into engine calls. Progress is broadcast back over
 * `chrome.runtime` so the popup (and the background badge) can react live.
 */

import { HumanTypingEngine } from '../engine/human-typing-engine';
import { describeDetection, detectAdapter } from './editors/editor-detector';
import { isAppMessage } from '../shared/messages';
import type { CommandMessage, CommandResponse } from '../shared/messages';
import type { KeybindSettings, TypingProgress, TypingSettings } from '../shared/types';
import { DEFAULT_KEYBINDS } from '../shared/defaults';
import { getKeybinds, onKeybindsChanged } from '../storage/storage-manager';
import { comboFromKeyboardEvent } from '../utils/keybind';
import { log } from '../utils/logger';

/** Short sample used by the "Test" button so users can preview a feel. */
const SAMPLE_TEXT =
  'The quick brown fox jumps over the lazy dog. ' +
  'HumanType Pro makes automated text feel handwritten — pauses, typos and all.';

let engine: HumanTypingEngine | null = null;
let lastProgress: TypingProgress | null = null;

/** Broadcast a progress snapshot to the popup and background. */
function emitProgress(progress: TypingProgress): void {
  lastProgress = progress;
  // The popup/background may be closed — swallow the inevitable "no receiver".
  chrome.runtime.sendMessage({ type: 'PROGRESS', progress }).catch(() => undefined);
}

/** Detect an editor, build a fresh engine and start typing (fire-and-forget). */
function beginTyping(text: string, settings: TypingSettings): CommandResponse {
  const adapter = detectAdapter();
  if (!adapter) {
    const progress: TypingProgress = {
      state: 'error',
      typedChars: 0,
      totalChars: text.length,
      ratio: 0,
      etaMs: 0,
      message: 'No writable editor was found on this page. Click into a text field first.',
    };
    emitProgress(progress);
    return { ok: false, error: progress.message };
  }

  engine = new HumanTypingEngine(adapter, emitProgress);
  // Intentionally not awaited: typing runs across many seconds while we keep
  // the messaging channel free. Progress arrives via emitProgress().
  void engine.startTyping(text, settings);

  return { ok: true, editor: { kind: adapter.kind, label: adapter.label, ready: true } };
}

/** Route a single command message to the engine. */
async function handleCommand(msg: CommandMessage): Promise<CommandResponse> {
  switch (msg.type) {
    case 'START_TYPING':
      return beginTyping(msg.text, msg.settings);

    case 'TEST_TYPING':
      return beginTyping(SAMPLE_TEXT, msg.settings);

    case 'STOP_TYPING':
      engine?.stopTyping();
      return { ok: true };

    case 'PAUSE_TYPING':
      engine?.pauseTyping();
      return { ok: true };

    case 'RESUME_TYPING':
      engine?.resumeTyping();
      return { ok: true };

    case 'TOGGLE_PAUSE':
      // One shortcut for both: pause if typing, resume if paused.
      if (engine?.getState() === 'paused') engine.resumeTyping();
      else engine?.pauseTyping();
      return { ok: true };

    case 'DETECT_EDITOR':
      return { ok: true, editor: describeDetection() };

    case 'GET_STATUS':
      return { ok: true, editor: describeDetection(), progress: lastProgress ?? undefined };

    default:
      return { ok: false, error: 'Unknown command' };
  }
}

// Single message listener for the tab. We only act on *command* messages; the
// PROGRESS events we emit ourselves are ignored here.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isAppMessage(message)) return undefined;
  if (message.type === 'PROGRESS' || message.type === 'EDITOR_DETECTED') return undefined;

  handleCommand(message as CommandMessage)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: String(err) }));

  return true; // keep the channel open for the async response
});

// ---------------------------------------------------------------------------
// Editable keyboard shortcuts (only act while typing, so we never hijack keys)
// ---------------------------------------------------------------------------
let keybinds: KeybindSettings = DEFAULT_KEYBINDS;
void getKeybinds().then((k) => {
  keybinds = k;
});
onKeybindsChanged((k) => {
  keybinds = k;
});

function engineIsActive(): boolean {
  const state = engine?.getState();
  return state === 'typing' || state === 'paused';
}

document.addEventListener(
  'keydown',
  (event) => {
    if (!engineIsActive()) return;
    const combo = comboFromKeyboardEvent(event);
    if (!combo) return;

    if (combo === keybinds.pauseResume) {
      event.preventDefault();
      void handleCommand({ type: 'TOGGLE_PAUSE' });
    } else if (combo === keybinds.stop) {
      event.preventDefault();
      void handleCommand({ type: 'STOP_TYPING' });
    }
  },
  true,
);

log.info('content script ready on', location.host);
