/**
 * HumanType Pro — Shared type definitions.
 *
 * These types are imported by every layer of the extension (popup, content
 * script, background service worker and the typing engine) so that the data
 * passed across the messaging boundary always has a single source of truth.
 */

/**
 * The complete set of tunable parameters that drive the typing engine.
 * Every value here is persisted to `chrome.storage` and is editable from the
 * popup UI.
 */
export interface TypingSettings {
  // ---- Core rhythm -------------------------------------------------------
  /** Base typing speed in words-per-minute (1 word ≈ 5 characters). */
  wpm: number;
  /** Fractional jitter applied to each keystroke delay (0 = robotic, 1 = wild). */
  speedVariance: number;

  // ---- Breaks / thinking pauses -----------------------------------------
  /** Probability (0–1) of taking a "thinking" break at any given word boundary. */
  breakFrequency: number;
  /** Fractional jitter applied to the break length (0–1). */
  breakVariance: number;
  /** Minimum break duration in milliseconds. */
  minBreakMs: number;
  /** Maximum break duration in milliseconds. */
  maxBreakMs: number;

  // ---- Human error simulation -------------------------------------------
  /** Probability (0–1) that any individual character is mistyped. */
  typoRate: number;
  /** Probability (0–1) that a word begins with a "false start" (typed then deleted). */
  falseStartRate: number;
  /** How long (ms) the user "notices" a typo before correcting it. */
  correctionDelayMs: number;

  // ---- Advanced behaviour ------------------------------------------------
  /** Pause a little before typing unusually long words. */
  hesitateLongWords: boolean;
  /** A word is considered "long" once it reaches this many characters. */
  longWordThreshold: number;
  /** Pause a little before typing punctuation characters. */
  hesitateBeforePunctuation: boolean;
  /** Gradually slow down as more text is typed (simulated tiredness). */
  fatigueEnabled: boolean;
  /** How strongly fatigue slows typing (0 = none, 1 = strong). */
  fatigueStrength: number;
  /** Occasionally rattle off a fast "burst" of characters. */
  burstModeEnabled: boolean;
  /** Probability (0–1) of a burst starting at a word boundary. */
  burstChance: number;
}

/** A named bundle of settings the user can save and re-apply. */
export interface Preset {
  id: string;
  name: string;
  settings: TypingSettings;
  /** Epoch milliseconds the preset was created/updated. */
  updatedAt: number;
  /** Built-in presets ship with the extension and cannot be deleted. */
  builtIn?: boolean;
}

/** Live status of the typing engine, surfaced to the popup and badge. */
export type EngineState = 'idle' | 'typing' | 'paused' | 'finished' | 'error';

/** Snapshot of progress emitted by the engine as it types. */
export interface TypingProgress {
  state: EngineState;
  /** Characters of the *target* text committed so far. */
  typedChars: number;
  /** Total characters in the target text. */
  totalChars: number;
  /** 0–1 completion ratio. */
  ratio: number;
  /** Estimated milliseconds remaining until completion. */
  etaMs: number;
  /** Human readable detail / error message. */
  message?: string;
}

/** Information about the editor the content script detected on the page. */
export interface DetectedEditor {
  /** Stable id of the adapter that claimed the editor (e.g. "google-docs"). */
  kind: string;
  /** Friendly label shown in the popup (e.g. "Google Docs"). */
  label: string;
  /** Whether a usable editor was actually found and focused. */
  ready: boolean;
}

/** User-customisable popup colours. Stored as 6-digit hex strings. */
export interface ThemeSettings {
  /** Page/background colour. */
  background: string;
  /** Accent colour (buttons, sliders, highlights). */
  accent: string;
  /** Primary text colour. */
  text: string;
}

/**
 * User-editable keyboard shortcuts. Each value is a normalised combo string
 * such as "Ctrl+Shift+Space" produced by {@link comboFromKeyboardEvent}.
 */
export interface KeybindSettings {
  /** Toggle pause/resume while typing. */
  pauseResume: string;
  /** Stop typing. */
  stop: string;
}

