/**
 * HumanType Pro — Notion adapter.
 *
 * Notion renders each block as its own `contenteditable`. The block the user is
 * editing is the focused one, so we target `document.activeElement` first and
 * fall back to the main page content region. Notion reacts to standard
 * `beforeinput`/`input` events, which the base adapter already emits.
 */

import { ContentEditableAdapter } from './contenteditable-adapter';

export class NotionAdapter extends ContentEditableAdapter {
  override readonly kind = 'notion';
  override readonly label = 'Notion';

  protected override resolveTarget(): HTMLElement | null {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.isContentEditable) return active;
    return (
      document.querySelector<HTMLElement>('.notion-page-content [contenteditable="true"]') ??
      document.querySelector<HTMLElement>('[contenteditable="true"]')
    );
  }

  override canHandle(): boolean {
    return location.hostname.endsWith('notion.so') && this.resolveTarget() !== null;
  }
}
