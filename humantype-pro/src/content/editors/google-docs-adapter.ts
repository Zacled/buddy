/**
 * HumanType Pro — Google Docs adapter (best-effort).
 *
 * Modern Google Docs renders the document to a <canvas>, so there is no DOM
 * text node to mutate. Instead, Docs captures input through a hidden
 * contenteditable iframe (`.docs-texteventtarget-iframe`). The only way to feed
 * it text from a content script is to dispatch a full keyboard-event sequence
 * (and `insertText`) at that iframe's document.
 *
 * NOTE: Google changes this internal surface periodically. This adapter targets
 * the long-standing texteventtarget iframe and degrades gracefully, but Docs is
 * the least guaranteed of all supported editors — see the README.
 */

import { EditorAdapter, dispatchKeySequence, microYield } from './editor-adapter';

export class GoogleDocsAdapter implements EditorAdapter {
  readonly kind = 'google-docs';
  readonly label = 'Google Docs';

  private eventTarget: EventTarget | null = null;
  private targetDoc: Document | null = null;

  private resolveIframe(): HTMLIFrameElement | null {
    return document.querySelector<HTMLIFrameElement>('.docs-texteventtarget-iframe');
  }

  canHandle(): boolean {
    return location.hostname === 'docs.google.com' && this.resolveIframe() !== null;
  }

  async prepare(): Promise<boolean> {
    const iframe = this.resolveIframe();
    const doc = iframe?.contentDocument;
    if (!doc) return false;

    // The iframe body is the contenteditable Docs listens to.
    const editable = doc.querySelector<HTMLElement>('[contenteditable="true"]') ?? doc.body;
    editable.focus();
    this.eventTarget = editable;
    this.targetDoc = doc;
    await microYield();
    return true;
  }

  async insertChar(char: string): Promise<void> {
    if (!this.eventTarget || !this.targetDoc) return;
    dispatchKeySequence(this.eventTarget, char, this.targetDoc);
    // Let Docs' model commit before the next keystroke.
    await microYield();
  }

  async deleteChar(): Promise<void> {
    if (!this.eventTarget || !this.targetDoc) return;
    const init: KeyboardEventInit = {
      key: 'Backspace',
      code: 'Backspace',
      keyCode: 8,
      which: 8,
      bubbles: true,
      cancelable: true,
      composed: true,
    };
    this.eventTarget.dispatchEvent(new KeyboardEvent('keydown', init));
    this.eventTarget.dispatchEvent(
      new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }),
    );
    try {
      this.targetDoc.execCommand('delete', false);
    } catch {
      /* ignore */
    }
    this.eventTarget.dispatchEvent(
      new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true }),
    );
    this.eventTarget.dispatchEvent(new KeyboardEvent('keyup', init));
    await microYield();
  }
}
