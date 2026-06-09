/**
 * HumanType Pro — Background service worker (Manifest V3).
 *
 * The service worker is the extension's coordinator. It:
 *   • seeds default settings on install,
 *   • reflects live typing progress onto the toolbar badge,
 *   • fires a desktop notification when a run finishes,
 *   • and relays keyboard-shortcut commands (pause/resume, stop) to the
 *     active tab's content script.
 *
 * It deliberately holds no heavy state — MV3 workers are torn down when idle, so
 * all durable data lives in `chrome.storage`.
 */

import { DEFAULT_SETTINGS } from '../shared/defaults';
import { isAppMessage } from '../shared/messages';
import type { CommandMessage } from '../shared/messages';
import type { TypingProgress } from '../shared/types';

const GOLD = '#d4af37';
const NOTIFICATION_ICON = 'icons/icon128.png';

// ---------------------------------------------------------------------------
// Install / first-run
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get('ht_settings');
  if (!existing.ht_settings) {
    await chrome.storage.sync.set({ ht_settings: DEFAULT_SETTINGS });
  }
  chrome.action.setBadgeBackgroundColor({ color: GOLD });
});

// ---------------------------------------------------------------------------
// Progress → badge + notifications
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender) => {
  if (!isAppMessage(message) || message.type !== 'PROGRESS') return;
  const progress = message.progress as TypingProgress;
  const tabId = sender.tab?.id;
  reflectProgress(progress, tabId);
});

function reflectProgress(progress: TypingProgress, tabId?: number): void {
  const badge = (text: string, color = GOLD) => {
    chrome.action.setBadgeBackgroundColor({ color, ...(tabId ? { tabId } : {}) });
    chrome.action.setBadgeText({ text, ...(tabId ? { tabId } : {}) });
  };

  switch (progress.state) {
    case 'typing': {
      const pct = Math.round(progress.ratio * 100);
      badge(`${pct}`);
      break;
    }
    case 'paused':
      badge('II');
      break;
    case 'finished':
      badge('✓', '#2e9e5b');
      notify('Typing complete', `Finished typing ${progress.totalChars} characters.`);
      // Clear the checkmark after a short while.
      setTimeout(() => badge(''), 4000);
      break;
    case 'error':
      badge('!', '#c0392b');
      notify('Typing stopped', progress.message ?? 'An error occurred while typing.');
      break;
    case 'idle':
    default:
      badge('');
      break;
  }
}

function notify(title: string, message: string): void {
  // Notifications are best-effort; ignore failures (e.g. permission revoked).
  try {
    chrome.notifications?.create({
      type: 'basic',
      iconUrl: NOTIFICATION_ICON,
      title,
      message,
      priority: 1,
    });
  } catch {
    /* no-op */
  }
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts → active tab
// ---------------------------------------------------------------------------
chrome.commands?.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  const message: CommandMessage | null =
    command === 'stop-typing'
      ? { type: 'STOP_TYPING' }
      : command === 'toggle-pause'
        ? { type: 'PAUSE_TYPING' } // content script no-ops if not typing
        : null;

  if (message) {
    chrome.tabs.sendMessage(tab.id, message).catch(() => undefined);
  }
});
