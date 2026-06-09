/**
 * HumanType Pro — Default settings and built-in presets.
 */

import type { Preset, TypingSettings } from './types';

/** Sensible, natural-feeling defaults used on first install and by "Reset". */
export const DEFAULT_SETTINGS: TypingSettings = {
  // Core rhythm
  wpm: 55,
  speedVariance: 0.35,

  // Breaks
  breakFrequency: 0.05,
  breakVariance: 0.5,
  minBreakMs: 400,
  maxBreakMs: 2500,

  // Human error
  typoRate: 0.04,
  falseStartRate: 0.02,
  correctionDelayMs: 350,

  // Advanced
  hesitateLongWords: true,
  longWordThreshold: 9,
  hesitateBeforePunctuation: true,
  fatigueEnabled: true,
  fatigueStrength: 0.3,
  burstModeEnabled: true,
  burstChance: 0.08,
};

/**
 * Built-in presets covering common writing "moods". These are merged with the
 * user's own saved presets in the popup and are never editable/deletable.
 */
export const BUILT_IN_PRESETS: Preset[] = [
  {
    id: 'builtin-natural',
    name: 'Natural',
    builtIn: true,
    updatedAt: 0,
    settings: { ...DEFAULT_SETTINGS },
  },
  {
    id: 'builtin-careful',
    name: 'Careful Writer',
    builtIn: true,
    updatedAt: 0,
    settings: {
      ...DEFAULT_SETTINGS,
      wpm: 38,
      speedVariance: 0.25,
      breakFrequency: 0.09,
      typoRate: 0.015,
      falseStartRate: 0.01,
      correctionDelayMs: 250,
      fatigueStrength: 0.2,
      burstModeEnabled: false,
    },
  },
  {
    id: 'builtin-fast',
    name: 'Fast Typist',
    builtIn: true,
    updatedAt: 0,
    settings: {
      ...DEFAULT_SETTINGS,
      wpm: 95,
      speedVariance: 0.45,
      breakFrequency: 0.03,
      typoRate: 0.06,
      falseStartRate: 0.03,
      correctionDelayMs: 180,
      burstChance: 0.18,
    },
  },
  {
    id: 'builtin-tired',
    name: 'Tired & Distracted',
    builtIn: true,
    updatedAt: 0,
    settings: {
      ...DEFAULT_SETTINGS,
      wpm: 42,
      speedVariance: 0.5,
      breakFrequency: 0.14,
      minBreakMs: 800,
      maxBreakMs: 6000,
      typoRate: 0.07,
      falseStartRate: 0.05,
      fatigueEnabled: true,
      fatigueStrength: 0.7,
      burstModeEnabled: false,
    },
  },
];

/**
 * Hard clamp ranges for every numeric setting. The popup sliders use these for
 * their min/max/step and the engine re-clamps defensively at runtime so a bad
 * stored value can never break typing.
 */
export const SETTING_BOUNDS: Record<
  keyof Pick<
    TypingSettings,
    | 'wpm'
    | 'speedVariance'
    | 'breakFrequency'
    | 'breakVariance'
    | 'minBreakMs'
    | 'maxBreakMs'
    | 'typoRate'
    | 'falseStartRate'
    | 'correctionDelayMs'
    | 'longWordThreshold'
    | 'fatigueStrength'
    | 'burstChance'
  >,
  { min: number; max: number; step: number }
> = {
  wpm: { min: 10, max: 160, step: 1 },
  speedVariance: { min: 0, max: 1, step: 0.01 },
  breakFrequency: { min: 0, max: 0.4, step: 0.005 },
  breakVariance: { min: 0, max: 1, step: 0.01 },
  minBreakMs: { min: 100, max: 5000, step: 50 },
  maxBreakMs: { min: 300, max: 12000, step: 50 },
  typoRate: { min: 0, max: 0.2, step: 0.005 },
  falseStartRate: { min: 0, max: 0.15, step: 0.005 },
  correctionDelayMs: { min: 50, max: 1500, step: 10 },
  longWordThreshold: { min: 5, max: 16, step: 1 },
  fatigueStrength: { min: 0, max: 1, step: 0.01 },
  burstChance: { min: 0, max: 0.4, step: 0.01 },
};
