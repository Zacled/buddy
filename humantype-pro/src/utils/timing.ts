/**
 * HumanType Pro — Cancellable timing utilities.
 *
 * The engine sleeps between every keystroke. Because the user can stop or pause
 * at any moment, every sleep must be interruptible. `CancellableSleep` wires a
 * timer to an `AbortSignal` so a pending delay rejects immediately on stop.
 */

/** Error thrown when a sleep is aborted (used as control-flow, not a bug). */
export class AbortError extends Error {
  constructor() {
    super('aborted');
    this.name = 'AbortError';
  }
}

/**
 * Resolve after `ms` milliseconds, or reject with {@link AbortError} if the
 * provided signal fires first.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError());
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new AbortError());
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * A small gate that blocks `wait()` callers until `open()` is called. Used to
 * implement pause/resume: while paused the engine awaits the gate, and resuming
 * opens it so the typing loop continues exactly where it left off.
 */
export class Gate {
  private open_ = true;
  private waiters: Array<() => void> = [];

  isOpen(): boolean {
    return this.open_;
  }

  open(): void {
    this.open_ = true;
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((resolve) => resolve());
  }

  close(): void {
    this.open_ = false;
  }

  /** Resolves immediately if open, otherwise when the gate next opens. */
  wait(signal?: AbortSignal): Promise<void> {
    if (this.open_) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new AbortError());
        return;
      }
      const onOpen = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      const onAbort = () => {
        this.waiters = this.waiters.filter((w) => w !== onOpen);
        reject(new AbortError());
      };
      this.waiters.push(onOpen);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}

/** Format a millisecond duration as a compact "1m 23s" / "12s" string. */
export function formatDuration(ms: number): string {
  if (!isFinite(ms) || ms < 0) return '—';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}
