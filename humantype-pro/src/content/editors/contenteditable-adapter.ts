/**
 * HumanType Pro — Generic contenteditable adapter.
 *
 * Works for the large family of rich editors built on `contenteditable`
 * (including Gmail and Notion, which subclass this with a site-specific target
 * lookup). We rely on `document.execCommand('insertText' | 'delete')` because
 * it inserts at the live caret and fires the `beforeinput`/`input` events these
 * editors listen for — the closest thing to a "real" keystroke from script.
 */

import { EditorAdapter, microYield } from './editor-adapter';

export class ContentEditableAdapter implements EditorAdapter {
  readonly kind: string = 'contenteditable';
  readonly label: string = 'Rich text area';

  protected target: HTMLElement | null = null;

  /** Locate the editable host element. Subclasses override for specific sites. */
  protected resolveTarget(): HTMLElement | null {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.isContentEditable) return active;

    // Otherwise find the first focusable contenteditable region on the page.
    const candidate = document.querySelector<HTMLElement>('[contenteditable="true"]');
    return candidate ?? null;
  }

  canHandle(): boolean {
    return this.resolveTarget() !== null;
  }

  async prepare(): Promise<boolean> {
    this.target = this.resolveTarget();
    if (!this.target) return false;
    this.target.focus();
    this.ensureCaretInside(this.target);
    await microYield();
    return true;
  }

  /** Make sure there is a collapsed selection inside the editable element. */
  protected ensureCaretInside(host: HTMLElement): void {
    const selection = window.getSelection();
    if (!selection) return;
    const anchor = selection.anchorNode;
    const inside = anchor && host.contains(anchor);
    if (!inside) {
      const range = document.createRange();
      range.selectNodeContents(host);
      range.collapse(false); // caret at end
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  async insertChar(char: string): Promise<void> {
    if (!this.target) return;
    this.target.dispatchEvent(
      new InputEvent('beforeinput', { data: char, inputType: 'insertText', bubbles: true, cancelable: true }),
    );
    const ok = document.execCommand('insertText', false, char);
    if (!ok) {
      // Fallback: manual range insertion when execCommand is blocked.
      this.manualInsert(char);
    }
    this.target.dispatchEvent(
      new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true }),
    );
  }

  async deleteChar(): Promise<void> {
    if (!this.target) return;
    this.target.dispatchEvent(
      new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }),
    );
    const ok = document.execCommand('delete', false);
    if (!ok) this.manualDelete();
    this.target.dispatchEvent(
      new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true }),
    );
  }

  private manualInsert(char: string): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(char);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  private manualDelete(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed) {
      // Extend one character backwards then delete.
      selection.modify('extend', 'backward', 'character');
    }
    selection.deleteFromDocument();
  }
}
