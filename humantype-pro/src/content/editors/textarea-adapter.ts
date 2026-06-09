/**
 * HumanType Pro — Plain <textarea> / <input> adapter.
 *
 * The most reliable target of all: we mutate `value` around the caret and fire
 * a framework-aware `input` event. Cursor position is preserved by tracking and
 * restoring `selectionStart`/`selectionEnd`.
 */

import { EditorAdapter, setNativeValue } from './editor-adapter';

type TextField = HTMLInputElement | HTMLTextAreaElement;

export class TextareaAdapter implements EditorAdapter {
  readonly kind = 'textarea';
  readonly label = 'Text field';

  private field: TextField | null = null;

  private resolveField(): TextField | null {
    const active = document.activeElement;
    if (this.isEditableField(active)) return active;
    // Fall back to the first visible textarea on the page.
    const candidate = document.querySelector('textarea');
    return this.isEditableField(candidate) ? candidate : null;
  }

  private isEditableField(el: Element | null): el is TextField {
    if (!el) return false;
    if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
    if (el instanceof HTMLInputElement) {
      const typing = ['text', 'search', 'url', 'email', 'tel', 'password', ''];
      return typing.includes(el.type) && !el.disabled && !el.readOnly;
    }
    return false;
  }

  canHandle(): boolean {
    return this.resolveField() !== null;
  }

  async prepare(): Promise<boolean> {
    this.field = this.resolveField();
    if (!this.field) return false;
    this.field.focus();
    // Default the caret to the end if nothing is selected.
    if (this.field.selectionStart == null) {
      const end = this.field.value.length;
      this.field.setSelectionRange(end, end);
    }
    return true;
  }

  async insertChar(char: string): Promise<void> {
    const el = this.field;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + char + el.value.slice(end);
    setNativeValue(el, next);
    const caret = start + char.length;
    el.setSelectionRange(caret, caret);
    el.dispatchEvent(new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true }));
  }

  async deleteChar(): Promise<void> {
    const el = this.field;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    if (start <= 0) return;
    const next = el.value.slice(0, start - 1) + el.value.slice(start);
    setNativeValue(el, next);
    el.setSelectionRange(start - 1, start - 1);
    el.dispatchEvent(
      new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true }),
    );
  }
}
