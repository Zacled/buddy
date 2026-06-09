/**
 * HumanType Pro — HumanTypingEngine.
 *
 * The behavioural core of the extension. Given a target string and a set of
 * {@link TypingSettings}, it drives an {@link EditorAdapter} to reproduce the
 * texture of a real person typing:
 *
 *   • variable per-keystroke speed (gaussian jitter around a WPM baseline)
 *   • thinking pauses / breaks at word boundaries
 *   • slow-downs after punctuation and before long words
 *   • believable fat-finger typos that get noticed and back-spaced away
 *   • occasional "false starts" (type a few letters, change your mind, delete)
 *   • fatigue (gradual slow-down) and burst mode (sudden fast runs)
 *
 * The engine is fully cancellable (stop) and resumable (pause/resume) and emits
 * progress snapshots so the popup can render a live progress bar + ETA.
 */

import { isPunctuation, isSentenceEnd, isTypoCandidate, nearbyKey } from '../utils/keyboard';
import { chance, clamp, intRange, jitter, range } from '../utils/random';
import { AbortError, Gate, sleep } from '../utils/timing';
import type { EngineState, TypingProgress, TypingSettings } from '../shared/types';
import type { EditorAdapter } from '../content/editors/editor-adapter';

/** Callback invoked on every meaningful state/progress change. */
export type ProgressListener = (progress: TypingProgress) => void;

export class HumanTypingEngine {
  private settings!: TypingSettings;
  private text = '';
  /** Number of *target* characters committed so far. */
  private index = 0;
  private state: EngineState = 'idle';

  private controller: AbortController | null = null;
  /** Gate is closed while paused; the loop awaits it to resume. */
  private readonly gate = new Gate();

  private startedAt = 0;
  private burstRemaining = 0;

  constructor(
    private readonly adapter: EditorAdapter,
    private readonly onProgress: ProgressListener,
  ) {}

  // ===========================================================================
  // Public control surface
  // ===========================================================================

  /** Begin typing `text`. Any in-flight run is stopped first. */
  async startTyping(text: string, settings: TypingSettings): Promise<void> {
    if (this.state === 'typing' || this.state === 'paused') {
      this.stopTyping();
    }

    this.settings = sanitize(settings);
    this.text = text;
    this.index = 0;
    this.burstRemaining = 0;
    this.controller = new AbortController();
    this.gate.open();
    this.startedAt = Date.now();
    this.setState('typing');

    const ready = await this.adapter.prepare();
    if (!ready) {
      this.fail('Could not focus a writable editor on this page.');
      return;
    }

    try {
      await this.run(this.controller.signal);
      if (this.state === 'typing') {
        this.setState('finished');
      }
    } catch (err) {
      if (err instanceof AbortError) return; // intentional stop/pause-cancel
      this.fail(err instanceof Error ? err.message : 'Unexpected typing error.');
    }
  }

  /** Stop typing immediately and reset to idle. */
  stopTyping(): void {
    this.controller?.abort();
    this.gate.open(); // release any pause waiter so it can reject
    if (this.state !== 'idle') this.setState('idle');
  }

  /** Suspend typing; the caret and progress are preserved. */
  pauseTyping(): void {
    if (this.state !== 'typing') return;
    this.gate.close();
    this.setState('paused');
  }

  /** Resume a paused run from exactly where it stopped. */
  resumeTyping(): void {
    if (this.state !== 'paused') return;
    this.setState('typing');
    this.gate.open();
  }

  getState(): EngineState {
    return this.state;
  }

  // ===========================================================================
  // Main loop
  // ===========================================================================

  private async run(signal: AbortSignal): Promise<void> {
    const text = this.text;

    for (let i = 0; i < text.length; i++) {
      // Respect pause: block here until resumed (or rejects on stop).
      await this.gate.wait(signal);

      const char = text[i];

      if (isWordStart(text, i)) {
        await this.handleWordStart(text, i, signal);
      }

      // A beat before punctuation, like lining up the keystroke.
      if (this.settings.hesitateBeforePunctuation && isPunctuation(char)) {
        await sleep(jitter(120, 0.6, 30), signal);
      }

      // Occasionally fat-finger the key, notice it, and fix it.
      if (chance(this.settings.typoRate) && isTypoCandidate(char)) {
        await this.simulateCorrection(char, signal);
      }

      // Commit the real character.
      await this.adapter.insertChar(char);
      this.index = i + 1;
      this.emitProgress();

      // Pace before the next keystroke.
      await sleep(this.calculateDelay(char, i), signal);
    }
  }

  /** Word-boundary behaviours: breaks, false starts, bursts, long-word hesitation. */
  private async handleWordStart(text: string, i: number, signal: AbortSignal): Promise<void> {
    const s = this.settings;

    // Thinking pause / break.
    if (chance(s.breakFrequency)) {
      await this.simulateThinkingPause(signal);
    }

    // False start: start a different word, then reconsider.
    if (chance(s.falseStartRate)) {
      await this.simulateFalseStart(signal);
    }

    // Kick off a burst of fast typing.
    if (s.burstModeEnabled && this.burstRemaining === 0 && chance(s.burstChance)) {
      this.burstRemaining = intRange(4, 12);
    }

    // Hesitate before unusually long words.
    if (s.hesitateLongWords && wordLengthAt(text, i) >= s.longWordThreshold) {
      await sleep(jitter(260, 0.5, 80), signal);
    }
  }

  // ===========================================================================
  // Behaviour primitives (the named functions from the spec)
  // ===========================================================================

  /**
   * Compute the delay (ms) to wait *after* committing `char`. Folds together
   * baseline WPM, gaussian variance, punctuation slow-downs, fatigue and burst
   * mode.
   */
  calculateDelay(char: string, position: number): number {
    const s = this.settings;
    const base = 60_000 / (s.wpm * 5); // 5 chars ≈ 1 word
    let delay = jitter(base, s.speedVariance, base * 0.25);

    // Punctuation gives the "hands" a moment.
    if (isSentenceEnd(char)) delay *= 2.2;
    else if (isPunctuation(char)) delay *= 1.5;
    else if (char === ' ') delay *= 1.15;
    else if (char === '\n') delay *= 1.8;

    // Fatigue: progressively slower as the passage goes on.
    if (s.fatigueEnabled && this.text.length > 0) {
      const progress = position / this.text.length;
      delay *= 1 + s.fatigueStrength * progress;
    }

    // Burst: rattle off a quick run of characters.
    if (this.burstRemaining > 0) {
      delay *= 0.45;
      this.burstRemaining--;
    }

    return delay;
  }

  /**
   * Produce a believable wrong key for `char` — an adjacent QWERTY key with the
   * original casing preserved. Returns `null` when no good substitute exists.
   */
  generateTypo(char: string): string | null {
    return nearbyKey(char);
  }

  /**
   * Type a typo, "notice" it after a beat, back-space it, then return so the
   * caller types the correct character.
   */
  async simulateCorrection(char: string, signal: AbortSignal): Promise<void> {
    const wrong = this.generateTypo(char);
    if (!wrong) return;

    await this.adapter.insertChar(wrong);
    // Small chance of compounding the error with a second wrong key.
    let extra = 0;
    if (chance(0.18)) {
      const second = this.generateTypo(char);
      if (second) {
        await sleep(this.calculateDelay(wrong, this.index), signal);
        await this.adapter.insertChar(second);
        extra = 1;
      }
    }

    // The "wait, that's wrong" moment.
    await sleep(jitter(this.settings.correctionDelayMs, 0.4, 60), signal);

    for (let k = 0; k <= extra; k++) {
      await this.adapter.deleteChar();
      await sleep(jitter(90, 0.5, 30), signal);
    }
  }

  /**
   * Begin a couple of characters of the "wrong" word, hesitate, then delete
   * them — the keyboard equivalent of starting a sentence and rephrasing.
   */
  async simulateFalseStart(signal: AbortSignal): Promise<void> {
    const length = intRange(2, 4);
    const letters = 'etaoinshrdlu';
    const typed: string[] = [];

    for (let k = 0; k < length; k++) {
      const ch = letters[intRange(0, letters.length - 1)];
      typed.push(ch);
      await this.adapter.insertChar(ch);
      await sleep(jitter(110, 0.4, 40), signal);
    }

    // "Hmm, no."
    await sleep(jitter(this.settings.correctionDelayMs * 1.3, 0.4, 120), signal);

    for (let k = 0; k < typed.length; k++) {
      await this.adapter.deleteChar();
      await sleep(jitter(80, 0.5, 25), signal);
    }
  }

  /** A longer "thinking" pause bounded by the user's min/max break settings. */
  async simulateThinkingPause(signal: AbortSignal): Promise<void> {
    const s = this.settings;
    const min = Math.min(s.minBreakMs, s.maxBreakMs);
    const max = Math.max(s.minBreakMs, s.maxBreakMs);
    const base = range(min, max);
    const duration = jitter(base, s.breakVariance, min);
    await sleep(duration, signal);
  }

  // ===========================================================================
  // Progress / state plumbing
  // ===========================================================================

  private setState(state: EngineState, message?: string): void {
    this.state = state;
    this.emitProgress(message);
  }

  private fail(message: string): void {
    this.state = 'error';
    this.emitProgress(message);
  }

  private emitProgress(message?: string): void {
    const total = this.text.length || 1;
    const ratio = clamp(this.index / total, 0, 1);

    // Adaptive ETA from observed pace so far.
    const elapsed = Date.now() - this.startedAt;
    const perChar = this.index > 0 ? elapsed / this.index : 0;
    const remaining = this.text.length - this.index;
    const etaMs = this.state === 'typing' ? perChar * remaining : 0;

    this.onProgress({
      state: this.state,
      typedChars: this.index,
      totalChars: this.text.length,
      ratio,
      etaMs,
      message,
    });
  }
}

// =============================================================================
// Pure helpers
// =============================================================================

/** True if index `i` is the first character of a word (preceded by whitespace). */
function isWordStart(text: string, i: number): boolean {
  if (i === 0) return /\S/.test(text[0]);
  return /\s/.test(text[i - 1]) && /\S/.test(text[i]);
}

/** Length of the word that begins at index `i`. */
function wordLengthAt(text: string, i: number): number {
  let len = 0;
  while (i + len < text.length && /\S/.test(text[i + len])) len++;
  return len;
}

/** Defensive clamping so a corrupt stored setting can never break typing. */
function sanitize(s: TypingSettings): TypingSettings {
  return {
    ...s,
    wpm: clamp(s.wpm, 5, 240),
    speedVariance: clamp(s.speedVariance, 0, 1),
    breakFrequency: clamp(s.breakFrequency, 0, 0.6),
    breakVariance: clamp(s.breakVariance, 0, 1),
    minBreakMs: clamp(s.minBreakMs, 50, 20_000),
    maxBreakMs: clamp(s.maxBreakMs, 50, 30_000),
    typoRate: clamp(s.typoRate, 0, 0.4),
    falseStartRate: clamp(s.falseStartRate, 0, 0.3),
    correctionDelayMs: clamp(s.correctionDelayMs, 20, 4000),
    longWordThreshold: clamp(s.longWordThreshold, 4, 24),
    fatigueStrength: clamp(s.fatigueStrength, 0, 1),
    burstChance: clamp(s.burstChance, 0, 0.6),
  };
}

/**
 * Estimate how long typing `text` with `settings` will take, in milliseconds.
 * Shared by the popup (pre-run "estimated completion time") so the number shown
 * before pressing Start matches the engine's behaviour reasonably well.
 */
export function estimateDurationMs(text: string, settings: TypingSettings): number {
  const s = sanitize(settings);
  const n = text.length;
  if (n === 0) return 0;

  const base = 60_000 / (s.wpm * 5);
  const fatigueAvg = s.fatigueEnabled ? 1 + s.fatigueStrength * 0.5 : 1;
  const typingMs = n * base * fatigueAvg;

  const words = n / 5;
  const avgBreak = (s.minBreakMs + s.maxBreakMs) / 2;
  const breakMs = words * s.breakFrequency * avgBreak;

  const typoMs = n * s.typoRate * (s.correctionDelayMs + 3 * base);
  const falseStartMs = words * s.falseStartRate * (3 * base + s.correctionDelayMs * 1.3);

  return typingMs + breakMs + typoMs + falseStartMs;
}
