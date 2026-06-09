/**
 * HumanType Pro — Message contracts.
 *
 * All cross-context communication (popup ⇄ background ⇄ content script) flows
 * through `chrome.runtime`/`chrome.tabs` messaging. Centralising the message
 * shapes here keeps senders and receivers in sync and gives us exhaustive
 * `switch` checking in TypeScript.
 */

import type { DetectedEditor, TypingProgress, TypingSettings } from './types';

/** Messages sent FROM the popup TO the content script (via the background). */
export type CommandMessage =
  | { type: 'START_TYPING'; text: string; settings: TypingSettings }
  | { type: 'STOP_TYPING' }
  | { type: 'PAUSE_TYPING' }
  | { type: 'RESUME_TYPING' }
  | { type: 'TOGGLE_PAUSE' }
  | { type: 'TEST_TYPING'; settings: TypingSettings }
  | { type: 'DETECT_EDITOR' }
  | { type: 'GET_STATUS' };

/** Messages broadcast FROM the content script (engine) back to listeners. */
export type EventMessage =
  | { type: 'PROGRESS'; progress: TypingProgress }
  | { type: 'EDITOR_DETECTED'; editor: DetectedEditor };

/** Anything that can travel over the wire. */
export type AppMessage = CommandMessage | EventMessage;

/** Reply returned synchronously to a CommandMessage. */
export interface CommandResponse {
  ok: boolean;
  error?: string;
  editor?: DetectedEditor;
  progress?: TypingProgress;
}

/** Type guard used by receivers to narrow an unknown payload. */
export function isAppMessage(value: unknown): value is AppMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}
