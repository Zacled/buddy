/**
 * HumanType Pro — Microsoft Word for the web adapter.
 *
 * Word Online edits inside a contenteditable surface (historically the
 * `.EditingSurfaceBody` element inside the WAC view panel). It can live in a
 * nested same-origin iframe, so we search the top document and any reachable
 * frames. This is a best-effort target: Microsoft periodically changes the
 * editing surface, so reliability is lower than for textareas/Gmail/Notion.
 */

import { ContentEditableAdapter } from './contenteditable-adapter';

export class WordOnlineAdapter extends ContentEditableAdapter {
  override readonly kind = 'word-online';
  override readonly label = 'Word for the web';

  protected override resolveTarget(): HTMLElement | null {
    const selectors = [
      '.EditingSurfaceBody[contenteditable="true"]',
      '[aria-label="Document body"][contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
    ];

    const search = (doc: Document): HTMLElement | null => {
      for (const sel of selectors) {
        const el = doc.querySelector<HTMLElement>(sel);
        if (el) return el;
      }
      return null;
    };

    const fromTop = search(document);
    if (fromTop) return fromTop;

    // Look one level into same-origin iframes (the WAC view panel).
    for (const frame of Array.from(document.querySelectorAll('iframe'))) {
      try {
        const doc = frame.contentDocument;
        if (doc) {
          const found = search(doc);
          if (found) return found;
        }
      } catch {
        /* cross-origin frame — skip */
      }
    }
    return null;
  }

  override canHandle(): boolean {
    const host = location.hostname;
    const isWordHost =
      host.includes('officeapps.live.com') ||
      host.includes('office.com') ||
      host.includes('sharepoint.com') ||
      host.includes('office.net');
    return isWordHost && this.resolveTarget() !== null;
  }
}
