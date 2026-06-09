/**
 * HumanType Pro — Storage manager.
 *
 * A thin, typed facade over `chrome.storage`. Settings and user presets live in
 * `sync` storage (so they roam across the user's signed-in Chrome instances);
 * the last pasted text lives in `local` storage (it can be large and is
 * device-specific). Built-in presets are never persisted — they are merged in
 * at read time.
 */

import { BUILT_IN_PRESETS, DEFAULT_SETTINGS } from '../shared/defaults';
import type { Preset, TypingSettings } from '../shared/types';

const KEYS = {
  settings: 'ht_settings',
  presets: 'ht_user_presets',
  lastText: 'ht_last_text',
  rewriteDraft: 'ht_rewrite_draft',
} as const;

/** Read settings, transparently filling any missing keys with defaults. */
export async function getSettings(): Promise<TypingSettings> {
  const stored = await chrome.storage.sync.get(KEYS.settings);
  const saved = (stored[KEYS.settings] ?? {}) as Partial<TypingSettings>;
  // Merge so newly-added settings keys always have a value.
  return { ...DEFAULT_SETTINGS, ...saved };
}

/** Persist the full settings object. */
export async function saveSettings(settings: TypingSettings): Promise<void> {
  await chrome.storage.sync.set({ [KEYS.settings]: settings });
}

/** Restore the factory defaults and return them. */
export async function resetSettings(): Promise<TypingSettings> {
  await chrome.storage.sync.set({ [KEYS.settings]: DEFAULT_SETTINGS });
  return { ...DEFAULT_SETTINGS };
}

/** User-created presets only (excludes the built-ins). */
export async function getUserPresets(): Promise<Preset[]> {
  const stored = await chrome.storage.sync.get(KEYS.presets);
  return (stored[KEYS.presets] ?? []) as Preset[];
}

/** Built-in presets first, then the user's own (most-recent first). */
export async function getAllPresets(): Promise<Preset[]> {
  const user = await getUserPresets();
  user.sort((a, b) => b.updatedAt - a.updatedAt);
  return [...BUILT_IN_PRESETS, ...user];
}

/** Create or overwrite a named preset and return it. */
export async function savePreset(name: string, settings: TypingSettings): Promise<Preset> {
  const presets = await getUserPresets();
  const trimmed = name.trim() || 'Untitled preset';
  const existing = presets.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());

  const preset: Preset = {
    id: existing?.id ?? `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: trimmed,
    settings,
    updatedAt: Date.now(),
  };

  const next = existing
    ? presets.map((p) => (p.id === existing.id ? preset : p))
    : [...presets, preset];

  await chrome.storage.sync.set({ [KEYS.presets]: next });
  return preset;
}

/** Delete a user preset by id. Built-ins are silently ignored. */
export async function deletePreset(id: string): Promise<void> {
  const presets = await getUserPresets();
  await chrome.storage.sync.set({ [KEYS.presets]: presets.filter((p) => p.id !== id) });
}

/** The last block of text the user pasted (so the popup survives reopen). */
export async function getLastText(): Promise<string> {
  const stored = await chrome.storage.local.get(KEYS.lastText);
  return (stored[KEYS.lastText] ?? '') as string;
}

export async function setLastText(text: string): Promise<void> {
  await chrome.storage.local.set({ [KEYS.lastText]: text });
}

/** A saved Rewrite-tab draft so the user's work survives a popup reopen. */
export interface RewriteDraft {
  original: string;
  rewritten: string;
  style: string;
}

export async function getRewriteDraft(): Promise<RewriteDraft> {
  const stored = await chrome.storage.local.get(KEYS.rewriteDraft);
  return (stored[KEYS.rewriteDraft] ?? {
    original: '',
    rewritten: '',
    style: 'professional',
  }) as RewriteDraft;
}

export async function setRewriteDraft(draft: RewriteDraft): Promise<void> {
  await chrome.storage.local.set({ [KEYS.rewriteDraft]: draft });
}

/** Subscribe to settings changes from other contexts. Returns an unsubscribe fn. */
export function onSettingsChanged(callback: (settings: TypingSettings) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ): void => {
    if (area === 'sync' && changes[KEYS.settings]?.newValue) {
      callback({ ...DEFAULT_SETTINGS, ...(changes[KEYS.settings].newValue as Partial<TypingSettings>) });
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
