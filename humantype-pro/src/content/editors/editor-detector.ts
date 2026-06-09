/**
 * HumanType Pro — Editor auto-detection.
 *
 * Picks the most specific adapter that can handle the current page. Site
 * specific adapters (Docs, Notion, Word, Gmail) are tried before the generic
 * contenteditable/textarea fallbacks so they always win on their own domains.
 */

import type { DetectedEditor } from '../../shared/types';
import { ContentEditableAdapter } from './contenteditable-adapter';
import type { EditorAdapter } from './editor-adapter';
import { GmailAdapter } from './gmail-adapter';
import { GoogleDocsAdapter } from './google-docs-adapter';
import { NotionAdapter } from './notion-adapter';
import { TextareaAdapter } from './textarea-adapter';
import { WordOnlineAdapter } from './word-online-adapter';

/** Build the ordered candidate list. Order = priority (most specific first). */
function candidateAdapters(): EditorAdapter[] {
  return [
    new GoogleDocsAdapter(),
    new WordOnlineAdapter(),
    new NotionAdapter(),
    new GmailAdapter(),
    new TextareaAdapter(),
    new ContentEditableAdapter(),
  ];
}

/**
 * Return the first adapter that reports it can handle the page, or `null`.
 * The returned adapter has NOT yet been prepared/focused.
 */
export function detectAdapter(): EditorAdapter | null {
  for (const adapter of candidateAdapters()) {
    try {
      if (adapter.canHandle()) return adapter;
    } catch {
      // A misbehaving site shouldn't break detection of the others.
    }
  }
  return null;
}

/** Lightweight description of the detected editor for the popup UI. */
export function describeDetection(): DetectedEditor {
  const adapter = detectAdapter();
  if (!adapter) {
    return { kind: 'none', label: 'No editor found', ready: false };
  }
  return { kind: adapter.kind, label: adapter.label, ready: true };
}
