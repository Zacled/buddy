/**
 * HumanType Pro — Popup controller.
 *
 * Builds the settings UI (sliders + toggles) from a declarative config,
 * two-way-binds it to the persisted {@link TypingSettings}, drives the
 * Start/Pause/Stop/Test controls by messaging the active tab's content script,
 * and renders live progress received back over `chrome.runtime`.
 */

import { SETTING_BOUNDS } from '../shared/defaults';
import { estimateDurationMs } from '../engine/human-typing-engine';
import { rewrite } from '../rewrite/rewrite-engine';
import type { RewriteStyle } from '../rewrite/rewrite-engine';
import { formatDuration } from '../utils/timing';
import {
  getKeybinds,
  getLastText,
  getRewriteDraft,
  getSettings,
  getTheme,
  resetKeybinds,
  resetTheme,
  saveKeybinds,
  saveSettings,
  saveTheme,
  setLastText,
  setRewriteDraft,
} from '../storage/storage-manager';
import { comboFromKeyboardEvent, formatCombo } from '../utils/keybind';
import type { CommandMessage, CommandResponse } from '../shared/messages';
import type {
  EngineState,
  KeybindSettings,
  ThemeSettings,
  TypingProgress,
  TypingSettings,
} from '../shared/types';

// ---------------------------------------------------------------------------
// Slider configuration (declarative → DOM)
// ---------------------------------------------------------------------------
type NumericKey = keyof typeof SETTING_BOUNDS;

interface SliderConfig {
  key: NumericKey;
  label: string;
  format: (v: number) => string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;
const secs = (v: number) => `${(v / 1000).toFixed(2)} s`;

/** The nine core "typing dynamics" sliders, in display order. */
const CORE_SLIDERS: SliderConfig[] = [
  { key: 'wpm', label: 'Typing speed (how fast it types)', format: (v) => `${v} WPM` },
  { key: 'speedVariance', label: 'Speed variance (how much typing speed changes)', format: pct },
  { key: 'breakFrequency', label: 'Break frequency (how often pauses happen)', format: pct },
  { key: 'breakVariance', label: 'Break variance (how random the pauses are)', format: pct },
  { key: 'minBreakMs', label: 'Min break length (shortest pause)', format: secs },
  { key: 'maxBreakMs', label: 'Max break length (longest pause)', format: secs },
  { key: 'typoRate', label: 'Typo rate (how often mistakes are made)', format: pct1 },
  { key: 'falseStartRate', label: 'False-start rate (starts typing then corrects itself)', format: pct1 },
  { key: 'correctionDelayMs', label: 'Correction delay (time before fixing mistakes)', format: (v) => `${v} ms` },
];

const LONGWORD_SLIDERS: SliderConfig[] = [
  { key: 'longWordThreshold', label: 'Long-word length (word length considered "long")', format: (v) => `${v} chars` },
];
const FATIGUE_SLIDERS: SliderConfig[] = [
  { key: 'fatigueStrength', label: 'Fatigue strength (how much it slows down)', format: pct },
];
const BURST_SLIDERS: SliderConfig[] = [
  { key: 'burstChance', label: 'Burst chance (chance of a speed burst)', format: pct },
];

// ---------------------------------------------------------------------------
// DOM lookup helpers
// ---------------------------------------------------------------------------
const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const el = {
  textInput: $<HTMLTextAreaElement>('text-input'),
  charCount: $('char-count'),
  eta: $('eta'),
  progressWrap: document.querySelector<HTMLElement>('.progress')!,
  progressFill: $('progress-fill'),
  status: $('status'),
  statusLabel: $('status-label'),
  editorChip: $('editor-chip'),
  editorLabel: $('editor-label'),
  btnStart: $<HTMLButtonElement>('btn-start'),
  btnPause: $<HTMLButtonElement>('btn-pause'),
  btnStop: $<HTMLButtonElement>('btn-stop'),
  btnTest: $<HTMLButtonElement>('btn-test'),
  coreSliders: $('core-sliders'),
  longwordSliders: $('longword-sliders'),
  fatigueSliders: $('fatigue-sliders'),
  burstSliders: $('burst-sliders'),
  toggleLongwords: $<HTMLInputElement>('toggle-longwords'),
  togglePunctuation: $<HTMLInputElement>('toggle-punctuation'),
  toggleFatigue: $<HTMLInputElement>('toggle-fatigue'),
  toggleBurst: $<HTMLInputElement>('toggle-burst'),
  advancedToggle: $<HTMLButtonElement>('advanced-toggle'),
  advancedPanel: $('advanced-panel'),
  toast: $('toast'),
  // Tabs
  tabs: Array.from(document.querySelectorAll<HTMLButtonElement>('.tab')),
  panels: Array.from(document.querySelectorAll<HTMLElement>('.tab-panel')),
  // Paste buttons
  pasteTyping: $<HTMLButtonElement>('paste-typing'),
  pasteRewrite: $<HTMLButtonElement>('paste-rewrite'),
  // Rewrite panel
  rewriteInput: $<HTMLTextAreaElement>('rewrite-input'),
  rewriteOutput: $<HTMLTextAreaElement>('rewrite-output'),
  rewriteStyle: $<HTMLSelectElement>('rewrite-style'),
  rewriteInCount: $('rewrite-in-count'),
  rewriteOutCount: $('rewrite-out-count'),
  btnRewrite: $<HTMLButtonElement>('btn-rewrite'),
  btnRewriteCopy: $<HTMLButtonElement>('btn-rewrite-copy'),
  // Settings panel — theme
  themeBg: $<HTMLInputElement>('theme-bg'),
  themeAccent: $<HTMLInputElement>('theme-accent'),
  themeText: $<HTMLInputElement>('theme-text'),
  btnThemeReset: $<HTMLButtonElement>('btn-theme-reset'),
  // Settings panel — keybinds
  kbPause: $<HTMLButtonElement>('kb-pause'),
  kbStop: $<HTMLButtonElement>('kb-stop'),
  btnKeybindReset: $<HTMLButtonElement>('btn-keybind-reset'),
};

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------
let settings: TypingSettings;
let engineState: EngineState = 'idle';
let saveTimer: number | undefined;

// Map every numeric key to its slider input + value label for quick updates.
const sliderInputs = new Map<NumericKey, HTMLInputElement>();
const sliderValues = new Map<NumericKey, HTMLElement>();

// ===========================================================================
// Build sliders
// ===========================================================================
function buildSliders(configs: SliderConfig[], container: HTMLElement): void {
  for (const config of configs) {
    const bounds = SETTING_BOUNDS[config.key];

    const wrap = document.createElement('div');
    wrap.className = 'slider';

    const head = document.createElement('div');
    head.className = 'slider__head';

    const label = document.createElement('span');
    label.className = 'slider__label';
    label.textContent = config.label;

    const value = document.createElement('span');
    value.className = 'slider__value';

    head.append(label, value);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(bounds.min);
    input.max = String(bounds.max);
    input.step = String(bounds.step);

    input.addEventListener('input', () => {
      const num = Number(input.value);
      (settings[config.key] as number) = num;
      value.textContent = config.format(num);
      keepBreakOrder(config.key);
      scheduleSave();
      refreshEstimate();
    });

    wrap.append(head, input);
    container.append(wrap);

    sliderInputs.set(config.key, input);
    sliderValues.set(config.key, value);
  }
}

/** Min break can never exceed max break — nudge the sibling slider if needed. */
function keepBreakOrder(changed: NumericKey): void {
  if (changed === 'minBreakMs' && settings.minBreakMs > settings.maxBreakMs) {
    settings.maxBreakMs = settings.minBreakMs;
    syncSlider('maxBreakMs');
  } else if (changed === 'maxBreakMs' && settings.maxBreakMs < settings.minBreakMs) {
    settings.minBreakMs = settings.maxBreakMs;
    syncSlider('minBreakMs');
  }
}

// ===========================================================================
// Apply settings → UI
// ===========================================================================
function syncSlider(key: NumericKey): void {
  const input = sliderInputs.get(key);
  const value = sliderValues.get(key);
  if (!input || !value) return;
  const config = [...CORE_SLIDERS, ...LONGWORD_SLIDERS, ...FATIGUE_SLIDERS, ...BURST_SLIDERS].find(
    (c) => c.key === key,
  )!;
  input.value = String(settings[key]);
  value.textContent = config.format(settings[key] as number);
}

function applySettingsToUI(): void {
  sliderInputs.forEach((_input, key) => syncSlider(key));
  el.toggleLongwords.checked = settings.hesitateLongWords;
  el.togglePunctuation.checked = settings.hesitateBeforePunctuation;
  el.toggleFatigue.checked = settings.fatigueEnabled;
  el.toggleBurst.checked = settings.burstModeEnabled;
  updateDependentEnabled();
  refreshEstimate();
}

/** Grey-out dependent sliders when their parent toggle is off. */
function updateDependentEnabled(): void {
  setGroupEnabled(el.longwordSliders, settings.hesitateLongWords);
  setGroupEnabled(el.fatigueSliders, settings.fatigueEnabled);
  setGroupEnabled(el.burstSliders, settings.burstModeEnabled);
}
function setGroupEnabled(group: HTMLElement, enabled: boolean): void {
  group.style.opacity = enabled ? '1' : '0.4';
  group.style.pointerEvents = enabled ? 'auto' : 'none';
}

// ===========================================================================
// Persistence (debounced)
// ===========================================================================
function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveSettings(settings), 250);
}

// ===========================================================================
// Character count + ETA
// ===========================================================================
function refreshEstimate(): void {
  const text = el.textInput.value;
  el.charCount.textContent = String(text.length);
  if (engineState === 'typing' || engineState === 'paused') return; // live ETA wins
  el.eta.textContent = text.length === 0 ? '—' : formatDuration(estimateDurationMs(text, settings));
}

// ===========================================================================
// Messaging the content script
// ===========================================================================
async function sendToActiveTab(message: CommandMessage): Promise<CommandResponse | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  try {
    return (await chrome.tabs.sendMessage(tab.id, message)) as CommandResponse;
  } catch {
    // The content script isn't in this tab yet — common on tabs that were
    // already open when the extension was (re)loaded. Inject it and retry once.
    if (await injectContentScript(tab.id)) {
      try {
        return (await chrome.tabs.sendMessage(tab.id, message)) as CommandResponse;
      } catch {
        return null;
      }
    }
    return null; // genuinely unsupported page (chrome://, Web Store, …)
  }
}

/** Programmatically inject the content script into a tab that's missing it. */
async function injectContentScript(tabId: number): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content-script.js'] });
    return true;
  } catch {
    return false; // restricted page where injection isn't allowed
  }
}

async function detectEditor(): Promise<void> {
  const res = await sendToActiveTab({ type: 'DETECT_EDITOR' });
  if (!res?.editor || !res.editor.ready) {
    el.editorChip.dataset.ready = 'false';
    el.editorLabel.textContent = res ? 'No editor on this page' : 'Page not supported';
    return;
  }
  el.editorChip.dataset.ready = 'true';
  el.editorLabel.textContent = res.editor.label;
}

// ===========================================================================
// Controls
// ===========================================================================
async function onStart(): Promise<void> {
  const text = el.textInput.value;
  if (!text.trim()) {
    toast('Paste some text to type first.', 'error');
    return;
  }
  await setLastText(text);
  const res = await sendToActiveTab({ type: 'START_TYPING', text, settings });
  if (!res) {
    toast('Open a normal web page and click into an editor.', 'error');
    return;
  }
  if (!res.ok) {
    toast(res.error ?? 'Could not start typing.', 'error');
    return;
  }
  if (res.editor) el.editorLabel.textContent = res.editor.label;
  setEngineState('typing');
  toast(`Typing into ${res.editor?.label ?? 'editor'}…`, 'success');
}

async function onPauseResume(): Promise<void> {
  if (engineState === 'typing') {
    await sendToActiveTab({ type: 'PAUSE_TYPING' });
    setEngineState('paused');
  } else if (engineState === 'paused') {
    await sendToActiveTab({ type: 'RESUME_TYPING' });
    setEngineState('typing');
  }
}

async function onStop(): Promise<void> {
  await sendToActiveTab({ type: 'STOP_TYPING' });
  setEngineState('idle');
}

async function onTest(): Promise<void> {
  const res = await sendToActiveTab({ type: 'TEST_TYPING', settings });
  if (!res) {
    toast('Open a normal web page and click into an editor.', 'error');
    return;
  }
  if (!res.ok) {
    toast(res.error ?? 'Could not run the test.', 'error');
    return;
  }
  setEngineState('typing');
  toast('Running a short test…', 'success');
}

// ===========================================================================
// Live progress
// ===========================================================================
function setEngineState(state: EngineState): void {
  engineState = state;
  el.status.dataset.state = state;

  const labels: Record<EngineState, string> = {
    idle: 'Idle',
    typing: 'Typing…',
    paused: 'Paused',
    finished: 'Done',
    error: 'Error',
  };
  el.statusLabel.textContent = labels[state];

  const typing = state === 'typing';
  const paused = state === 'paused';
  const active = typing || paused;

  el.btnStart.disabled = active;
  el.btnTest.disabled = active;
  el.btnPause.disabled = !active;
  el.btnStop.disabled = !active;
  el.btnPause.innerHTML = paused
    ? '<span class="btn__icon">▶</span> Resume'
    : '<span class="btn__icon">II</span> Pause';

  el.progressWrap.dataset.active = String(typing);

  if (state === 'idle' || state === 'finished' || state === 'error') {
    refreshEstimate();
  }
}

function renderProgress(progress: TypingProgress): void {
  setEngineState(progress.state);
  el.progressFill.style.width = `${Math.round(progress.ratio * 100)}%`;

  if (progress.state === 'typing' || progress.state === 'paused') {
    el.eta.textContent = formatDuration(progress.etaMs);
    el.charCount.textContent = `${progress.typedChars}/${progress.totalChars}`;
  }
  if (progress.state === 'finished') {
    el.progressFill.style.width = '100%';
    toast('Finished typing.', 'success');
  }
  if (progress.state === 'error') {
    toast(progress.message ?? 'Typing stopped.', 'error');
  }
}

// ===========================================================================
// Paste buttons
// ===========================================================================
async function pasteInto(target: HTMLTextAreaElement): Promise<void> {
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch {
    toast('Couldn’t read the clipboard. Press Ctrl/⌘ + V instead.', 'error');
    return;
  }
  if (!text) {
    toast('Your clipboard is empty.', 'error');
    return;
  }
  // Insert at the caret (replacing any selection), like a real paste.
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? start;
  target.value = target.value.slice(0, start) + text + target.value.slice(end);
  const caret = start + text.length;
  target.focus();
  target.setSelectionRange(caret, caret);
  target.dispatchEvent(new Event('input', { bubbles: true }));
  toast('Pasted from clipboard.', 'success');
}

// ===========================================================================
// Theme (custom colours)
// ===========================================================================
let theme: ThemeSettings;
let themeSaveTimer: number | undefined;

/**
 * The original (default) dark palette. The surface/border shades sit a few
 * steps above the background; we keep their *offset* from the default
 * background and re-apply it to whatever background the user picks, so changing
 * the background recolours every panel — not just the padding behind them.
 */
const DEFAULT_PALETTE = {
  bg: '#0e0f13',
  surface: '#15171c',
  surface2: '#1b1e25',
  surface3: '#20242c',
  border: '#2a2f3a',
  borderSoft: '#23272f',
};

/** Push the theme colours onto the CSS custom properties the whole UI uses. */
function applyTheme(t: ThemeSettings): void {
  const root = document.documentElement.style;

  // Background + derived surfaces/borders (shifted together so the whole UI
  // tracks the chosen background).
  root.setProperty('--bg', t.background);
  root.setProperty('--surface', shiftFromBg(t.background, DEFAULT_PALETTE.surface));
  root.setProperty('--surface-2', shiftFromBg(t.background, DEFAULT_PALETTE.surface2));
  root.setProperty('--surface-3', shiftFromBg(t.background, DEFAULT_PALETTE.surface3));
  root.setProperty('--border', shiftFromBg(t.background, DEFAULT_PALETTE.border));
  root.setProperty('--border-soft', shiftFromBg(t.background, DEFAULT_PALETTE.borderSoft));
  root.setProperty(
    '--bg-grad',
    `radial-gradient(120% 120% at 50% 0%, ${lighten(t.background, 0.08)} 0%, ${t.background} 60%)`,
  );

  // Text.
  root.setProperty('--text', t.text);

  // Accent (gold family).
  root.setProperty('--gold', t.accent);
  root.setProperty('--gold-bright', lighten(t.accent, 0.18));
  const { r, g, b } = hexToRgb(t.accent);
  root.setProperty('--gold-soft', `rgba(${r}, ${g}, ${b}, 0.16)`);
  root.setProperty('--gold-line', `rgba(${r}, ${g}, ${b}, 0.4)`);
}

/**
 * Take a default palette colour and re-base it onto the user's background,
 * preserving the original channel offsets (so at the default background the
 * result is identical to the original theme).
 */
function shiftFromBg(bgHex: string, defaultHex: string): string {
  const bg = hexToRgb(bgHex);
  const base = hexToRgb(DEFAULT_PALETTE.bg);
  const target = hexToRgb(defaultHex);
  const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `rgb(${clampByte(target.r + (bg.r - base.r))}, ${clampByte(
    target.g + (bg.g - base.g),
  )}, ${clampByte(target.b + (bg.b - base.b))})`;
}

function syncThemeInputs(): void {
  el.themeBg.value = theme.background;
  el.themeAccent.value = theme.accent;
  el.themeText.value = theme.text;
}

function scheduleThemeSave(): void {
  clearTimeout(themeSaveTimer);
  themeSaveTimer = window.setTimeout(() => void saveTheme(theme), 250);
}

function onThemeInput(): void {
  theme = {
    background: el.themeBg.value,
    accent: el.themeAccent.value,
    text: el.themeText.value,
  };
  applyTheme(theme);
  scheduleThemeSave();
}

async function onThemeReset(): Promise<void> {
  theme = await resetTheme();
  syncThemeInputs();
  applyTheme(theme);
  toast('Colours reset to default.', 'success');
}

// ---- hex helpers --------------------------------------------------------
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const up = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${up(r)}, ${up(g)}, ${up(b)})`;
}

// ===========================================================================
// Keybinds (editable shortcuts)
// ===========================================================================
let keybinds: KeybindSettings;
let recording = false;

function syncKeybindLabels(): void {
  el.kbPause.textContent = formatCombo(keybinds.pauseResume);
  el.kbStop.textContent = formatCombo(keybinds.stop);
}

/** Capture the next key combo the user presses and assign it to a shortcut. */
function recordKeybind(button: HTMLButtonElement, which: keyof KeybindSettings): void {
  if (recording) return;
  recording = true;
  button.dataset.recording = 'true';
  button.textContent = 'Press keys…';

  const onKey = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const combo = comboFromKeyboardEvent(e);
    if (!combo) return; // ignore lone modifier keys; wait for the real key
    keybinds = { ...keybinds, [which]: combo };
    document.removeEventListener('keydown', onKey, true);
    recording = false;
    button.removeAttribute('data-recording');
    syncKeybindLabels();
    void saveKeybinds(keybinds);
    toast('Shortcut updated.', 'success');
  };

  document.addEventListener('keydown', onKey, true);
}

async function onKeybindReset(): Promise<void> {
  keybinds = await resetKeybinds();
  syncKeybindLabels();
  toast('Shortcuts reset to default.', 'success');
}

/** When the popup is focused, let the shortcuts drive pause/resume + stop too. */
function handlePopupShortcut(e: KeyboardEvent): void {
  if (recording) return;
  const combo = comboFromKeyboardEvent(e);
  if (!combo) return;
  if (combo === keybinds.pauseResume && (engineState === 'typing' || engineState === 'paused')) {
    e.preventDefault();
    void onPauseResume();
  } else if (combo === keybinds.stop && (engineState === 'typing' || engineState === 'paused')) {
    e.preventDefault();
    void onStop();
  }
}

// ===========================================================================
// Tabs
// ===========================================================================
function activateTab(panelId: string): void {
  for (const tab of el.tabs) {
    tab.classList.toggle('tab--active', tab.dataset.panel === panelId);
  }
  for (const panel of el.panels) {
    panel.hidden = panel.id !== panelId;
  }
}

// ===========================================================================
// Rewrite
// ===========================================================================
let rewriteSaveTimer: number | undefined;

function persistRewriteDraft(): void {
  clearTimeout(rewriteSaveTimer);
  rewriteSaveTimer = window.setTimeout(() => {
    void setRewriteDraft({
      original: el.rewriteInput.value,
      rewritten: el.rewriteOutput.value,
      style: el.rewriteStyle.value,
    });
  }, 250);
}

function onRewrite(): void {
  const original = el.rewriteInput.value;
  if (!original.trim()) {
    toast('Paste some text to rewrite first.', 'error');
    return;
  }
  const style = el.rewriteStyle.value as RewriteStyle;
  const result = rewrite(original, style);
  el.rewriteOutput.value = result;
  el.rewriteOutCount.textContent = String(result.length);
  persistRewriteDraft();
  toast('Rewritten — meaning preserved.', 'success');
}

async function onRewriteCopy(): Promise<void> {
  const text = el.rewriteOutput.value;
  if (!text) {
    toast('Nothing to copy yet.', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard.', 'success');
  } catch {
    // Fallback for restricted clipboard access.
    el.rewriteOutput.select();
    document.execCommand('copy');
    toast('Copied to clipboard.', 'success');
  }
}

// ===========================================================================
// Toast
// ===========================================================================
let toastTimer: number | undefined;
function toast(message: string, kind: 'info' | 'success' | 'error' = 'info'): void {
  el.toast.textContent = message;
  el.toast.dataset.kind = kind;
  el.toast.dataset.show = 'true';
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.toast.dataset.show = 'false';
  }, 2600);
}

// ===========================================================================
// Wire up + init
// ===========================================================================
function bindToggle(input: HTMLInputElement, key: keyof TypingSettings): void {
  input.addEventListener('change', () => {
    (settings[key] as boolean) = input.checked;
    updateDependentEnabled();
    scheduleSave();
    refreshEstimate();
  });
}

function attachEvents(): void {
  el.textInput.addEventListener('input', () => {
    void setLastText(el.textInput.value);
    refreshEstimate();
  });

  el.btnStart.addEventListener('click', () => void onStart());
  el.btnPause.addEventListener('click', () => void onPauseResume());
  el.btnStop.addEventListener('click', () => void onStop());
  el.btnTest.addEventListener('click', () => void onTest());

  bindToggle(el.toggleLongwords, 'hesitateLongWords');
  bindToggle(el.togglePunctuation, 'hesitateBeforePunctuation');
  bindToggle(el.toggleFatigue, 'fatigueEnabled');
  bindToggle(el.toggleBurst, 'burstModeEnabled');

  el.advancedToggle.addEventListener('click', () => {
    const open = el.advancedToggle.getAttribute('aria-expanded') === 'true';
    el.advancedToggle.setAttribute('aria-expanded', String(!open));
    el.advancedPanel.hidden = open;
  });

  // Tabs
  for (const tab of el.tabs) {
    tab.addEventListener('click', () => activateTab(tab.dataset.panel!));
  }

  // Paste buttons
  el.pasteTyping.addEventListener('click', () => void pasteInto(el.textInput));
  el.pasteRewrite.addEventListener('click', () => void pasteInto(el.rewriteInput));

  // Rewrite panel
  el.rewriteInput.addEventListener('input', () => {
    el.rewriteInCount.textContent = String(el.rewriteInput.value.length);
    persistRewriteDraft();
  });
  el.rewriteStyle.addEventListener('change', () => persistRewriteDraft());
  el.btnRewrite.addEventListener('click', () => onRewrite());
  el.btnRewriteCopy.addEventListener('click', () => void onRewriteCopy());

  // Settings — theme colours
  el.themeBg.addEventListener('input', onThemeInput);
  el.themeAccent.addEventListener('input', onThemeInput);
  el.themeText.addEventListener('input', onThemeInput);
  el.btnThemeReset.addEventListener('click', () => void onThemeReset());

  // Settings — editable keybinds
  el.kbPause.addEventListener('click', () => recordKeybind(el.kbPause, 'pauseResume'));
  el.kbStop.addEventListener('click', () => recordKeybind(el.kbStop, 'stop'));
  el.btnKeybindReset.addEventListener('click', () => void onKeybindReset());

  // Let the shortcuts work while the popup itself is focused.
  document.addEventListener('keydown', handlePopupShortcut);

  // Progress events broadcast by the content script.
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'PROGRESS') {
      renderProgress(message.progress as TypingProgress);
    }
  });
}

async function init(): Promise<void> {
  buildSliders(CORE_SLIDERS, el.coreSliders);
  buildSliders(LONGWORD_SLIDERS, el.longwordSliders);
  buildSliders(FATIGUE_SLIDERS, el.fatigueSliders);
  buildSliders(BURST_SLIDERS, el.burstSliders);

  settings = await getSettings();
  applySettingsToUI();

  el.textInput.value = await getLastText();
  refreshEstimate();

  // Restore the Rewrite-tab draft.
  const draft = await getRewriteDraft();
  el.rewriteInput.value = draft.original;
  el.rewriteOutput.value = draft.rewritten;
  el.rewriteStyle.value = draft.style;
  el.rewriteInCount.textContent = String(draft.original.length);
  el.rewriteOutCount.textContent = String(draft.rewritten.length);

  // Theme + editable shortcuts.
  theme = await getTheme();
  syncThemeInputs();
  applyTheme(theme);

  keybinds = await getKeybinds();
  syncKeybindLabels();

  attachEvents();

  // Sync with the active tab: which editor, and any in-progress typing.
  await detectEditor();
  const status = await sendToActiveTab({ type: 'GET_STATUS' });
  if (status?.progress) renderProgress(status.progress);
}

document.addEventListener('DOMContentLoaded', () => void init());
