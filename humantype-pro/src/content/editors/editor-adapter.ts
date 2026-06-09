/**
 * HumanType Pro — Editor adapter contract + shared DOM helpers.
 *
 * The typing engine is deliberately ignorant of *where* it is typing. It only
 * knows how to insert and delete characters through an {@link EditorAdapter}.
 * Each supported site (Google Docs, Notion, Gmail, …) ships its own adapter so
 * that adding a new target never touches the engine.
 */

/** The minimal surface the engine needs from any editor. */
export interface EditorAdapter {
  /** Stable machine id, e.g. "textarea" or "google-docs". */
  readonly kind: string;
  /** Friendly label shown in the popup. */
  readonly label: string;

  /** Can this adapter drive the editor currently present on the page? */
  canHandle(): boolean;

  /** Focus/prepare the editor. Resolves `true` when ready to receive input. */
  prepare(): Promise<boolean>;

  /** Insert a single character at the caret. */
  insertChar(char: string): Promise<void>;

  /** Delete one character before the caret (backspace). */
  deleteChar(): Promise<void>;
}

/**
 * Set the value of a native input/textarea in a way that frameworks such as
 * React notice. React tracks the value via its own descriptor, so we must call
 * the *prototype* setter and then dispatch a synthetic `input` event.
 */
export function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
}

/** Build a KeyboardEvent init for a single printable character. */
export function keyEventInit(char: string): KeyboardEventInit {
  const code = char === ' ' ? 'Space' : `Key${char.toUpperCase()}`;
  return {
    key: char,
    code: /^[a-z]$/i.test(char) ? code : undefined,
    bubbles: true,
    cancelable: true,
    composed: true,
  };
}

/**
 * Fire a realistic keydown → keypress → input → keyup sequence on a target.
 * Used by adapters (notably Google Docs) that read from synthetic key events
 * rather than direct DOM mutation.
 */
export function dispatchKeySequence(
  target: EventTarget,
  char: string,
  doc: Document = document,
): void {
  const init = keyEventInit(char);
  target.dispatchEvent(new KeyboardEvent('keydown', init));
  target.dispatchEvent(new KeyboardEvent('keypress', init));
  target.dispatchEvent(
    new InputEvent('beforeinput', { data: char, inputType: 'insertText', bubbles: true, cancelable: true }),
  );
  // Best-effort textual insert for contenteditable targets.
  try {
    doc.execCommand('insertText', false, char);
  } catch {
    /* execCommand may be unavailable; the key events above are the fallback. */
  }
  target.dispatchEvent(
    new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true }),
  );
  target.dispatchEvent(new KeyboardEvent('keyup', init));
}

/** Pause briefly to let the host editor's async render/model catch up. */
export function microYield(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
