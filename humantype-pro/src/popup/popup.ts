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
import { formatDuration } from '../utils/timing';
import {
  getAllPresets,
  getLastText,
  getSettings,
  resetSettings,
  savePreset,
  saveSettings,
  setLastText,
} from '../storage/storage-manager';
import type { CommandMessage, CommandResponse } from '../shared/messages';
import type { EngineState, Preset, TypingProgress, TypingSettings } from '../shared/types';

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
  { key: 'wpm', label: 'Typing speed', format: (v) => `${v} WPM` },
  { key: 'speedVariance', label: 'Speed variance', format: pct },
  { key: 'breakFrequency', label: 'Break frequency', format: pct },
  { key: 'breakVariance', label: 'Break variance', format: pct },
  { key: 'minBreakMs', label: 'Min break length', format: secs },
  { key: 'maxBreakMs', label: 'Max break length', format: secs },
  { key: 'typoRate', label: 'Typo rate', format: pct1 },
  { key: 'falseStartRate', label: 'False-start rate', format: pct1 },
  { key: 'correctionDelayMs', label: 'Correction delay', format: (v) => `${v} ms` },
];

const LONGWORD_SLIDERS: SliderConfig[] = [
  { key: 'longWordThreshold', label: 'Long-word length', format: (v) => `${v} chars` },
];
const FATIGUE_SLIDERS: SliderConfig[] = [
  { key: 'fatigueStrength', label: 'Fatigue strength', format: pct },
];
const BURST_SLIDERS: SliderConfig[] = [
  { key: 'burstChance', label: 'Burst chance', format: pct },
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
  presetSelect: $<HTMLSelectElement>('preset-select'),
  presetName: $<HTMLInputElement>('preset-name'),
  btnLoad: $<HTMLButtonElement>('btn-load'),
  btnSave: $<HTMLButtonElement>('btn-save'),
  btnReset: $<HTMLButtonElement>('btn-reset'),
  toast: $('toast'),
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
    return null; // no content script on this page (chrome://, web store, …)
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
// Presets
// ===========================================================================
let presetCache: Preset[] = [];

async function refreshPresets(selectId?: string): Promise<void> {
  presetCache = await getAllPresets();
  el.presetSelect.innerHTML = '';
  for (const preset of presetCache) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.builtIn ? `★ ${preset.name}` : preset.name;
    el.presetSelect.append(option);
  }
  if (selectId) el.presetSelect.value = selectId;
}

async function onLoadPreset(): Promise<void> {
  const preset = presetCache.find((p) => p.id === el.presetSelect.value);
  if (!preset) return;
  settings = { ...preset.settings };
  applySettingsToUI();
  await saveSettings(settings);
  toast(`Loaded “${preset.name}”.`, 'success');
}

async function onSavePreset(): Promise<void> {
  const name = el.presetName.value.trim();
  if (!name) {
    toast('Name your preset first.', 'error');
    return;
  }
  const preset = await savePreset(name, settings);
  el.presetName.value = '';
  await refreshPresets(preset.id);
  toast(`Saved “${preset.name}”.`, 'success');
}

async function onReset(): Promise<void> {
  settings = await resetSettings();
  applySettingsToUI();
  toast('Settings reset to defaults.', 'success');
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

  el.btnLoad.addEventListener('click', () => void onLoadPreset());
  el.btnSave.addEventListener('click', () => void onSavePreset());
  el.btnReset.addEventListener('click', () => void onReset());

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

  await refreshPresets();
  attachEvents();

  // Sync with the active tab: which editor, and any in-progress typing.
  await detectEditor();
  const status = await sendToActiveTab({ type: 'GET_STATUS' });
  if (status?.progress) renderProgress(status.progress);
}

document.addEventListener('DOMContentLoaded', () => void init());
