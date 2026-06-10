/**
 * HumanType Pro — Background service worker (Manifest V3).
 *
 * Lightweight coordinator. It:
 *   • seeds default settings on install, and
 *   • fires a desktop notification when a run finishes or errors.
 *
 * It no longer paints a progress number on the toolbar icon (kept quiet by
 * request), and keyboard shortcuts are handled in-page by the content script so
 * they can be edited from the Settings tab.
 *
 * MV3 workers are torn down when idle, so all durable data lives in
 * `chrome.storage`.
 */

import { DEFAULT_SETTINGS } from '../shared/defaults';
import { isAppMessage } from '../shared/messages';
import type { TypingProgress } from '../shared/types';

const NOTIFICATION_ICON = 'icons/icon128.png';

// ---------------------------------------------------------------------------
// Install / first-run
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get('ht_settings');
  if (!existing.ht_settings) {
    await chrome.storage.sync.set({ ht_settings: DEFAULT_SETTINGS });
  }
});

// ---------------------------------------------------------------------------
// Progress → notifications only (no toolbar badge)
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message) => {
  if (!isAppMessage(message) || message.type !== 'PROGRESS') return;
  const progress = message.progress as TypingProgress;

  if (progress.state === 'finished') {
    notify('Typing complete', `Finished typing ${progress.totalChars} characters.`);
  } else if (progress.state === 'error') {
    notify('Typing stopped', progress.message ?? 'An error occurred while typing.');
  }
});

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
