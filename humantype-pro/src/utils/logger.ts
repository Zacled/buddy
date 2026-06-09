/**
 * HumanType Pro — Tiny namespaced logger.
 *
 * Wraps `console` so every line is prefixed and can be silenced in one place.
 * Flip `ENABLED` to false to mute the extension entirely in production.
 */

const ENABLED = true;
const PREFIX = '%c[HumanType Pro]';
const STYLE = 'color:#d4af37;font-weight:600';

export const log = {
  info(...args: unknown[]): void {
    if (ENABLED) console.log(PREFIX, STYLE, ...args);
  },
  warn(...args: unknown[]): void {
    if (ENABLED) console.warn(PREFIX, STYLE, ...args);
  },
  error(...args: unknown[]): void {
    if (ENABLED) console.error(PREFIX, STYLE, ...args);
  },
};
