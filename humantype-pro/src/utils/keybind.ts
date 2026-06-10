/**
 * HumanType Pro — Keyboard-combo helpers.
 *
 * Turns a KeyboardEvent into a stable, comparable combo string like
 * "Ctrl+Shift+Space". The same function is used when *recording* a shortcut in
 * Settings and when *matching* a keypress in the content script, so the two can
 * never disagree about ordering or naming.
 */

/**
 * Build a normalised combo string from a keydown event, or `null` if only a
 * modifier key is currently held (so callers can wait for the "real" key).
 */
export function comboFromKeyboardEvent(e: KeyboardEvent): string | null {
  const key = e.key;
  if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') {
    return null;
  }

  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.metaKey) parts.push('Meta');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  let label = key;
  if (label === ' ') label = 'Space';
  else if (label.length === 1) label = label.toUpperCase();

  parts.push(label);
  return parts.join('+');
}

/** Pretty-print a combo for display (Meta → ⌘, joined with thin spaces). */
export function formatCombo(combo: string): string {
  return combo
    .replace(/\bMeta\b/g, '⌘')
    .replace(/\+/g, ' + ');
}
