"use strict";
(() => {
  /* ========================================================================
     Shared helpers
     ===================================================================== */
  const $ = (id) => document.getElementById(id);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const countWords = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

  let toastTimer;
  function toast(message, kind = "info") {
    const node = $("toast");
    node.textContent = message;
    node.dataset.kind = kind;
    node.dataset.show = "true";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (node.dataset.show = "false"), 2400);
  }

  /* ========================================================================
     Tabs
     ===================================================================== */
  const tabs = Array.from(document.querySelectorAll(".tab"));
  const panels = Array.from(document.querySelectorAll(".tab-panel"));

  function setTab(panelId) {
    for (const tab of tabs) {
      const active = tab.dataset.panel === panelId;
      tab.classList.toggle("tab--active", active);
      tab.setAttribute("aria-selected", String(active));
    }
    for (const panel of panels) panel.hidden = panel.id !== panelId;
    chrome.storage.local.set({ active_tab: panelId });
  }

  /* ========================================================================
     Auto Typer
     ===================================================================== */
  const TYPE_DEFAULTS = {
    wpm: 55, speedVariance: 0.35,
    breakFrequency: 0.05, breakVariance: 0.5, minBreakMs: 400, maxBreakMs: 2500,
    typoRate: 0.04, falseStartRate: 0.02, correctionDelayMs: 350,
    hesitateLongWords: true, longWordThreshold: 9,
    hesitateBeforePunctuation: true,
    fatigueEnabled: true, fatigueStrength: 0.3,
    burstModeEnabled: true, burstChance: 0.08,
  };

  const BUILTIN_PRESETS = [
    { id: "builtin-natural", name: "Natural", builtIn: true, updatedAt: 0,
      settings: { ...TYPE_DEFAULTS } },
    { id: "builtin-careful", name: "Careful Writer", builtIn: true, updatedAt: 0,
      settings: { ...TYPE_DEFAULTS, wpm: 38, speedVariance: 0.25, breakFrequency: 0.09,
        typoRate: 0.015, falseStartRate: 0.01, correctionDelayMs: 250,
        fatigueStrength: 0.2, burstModeEnabled: false } },
    { id: "builtin-fast", name: "Fast Typist", builtIn: true, updatedAt: 0,
      settings: { ...TYPE_DEFAULTS, wpm: 95, speedVariance: 0.45, breakFrequency: 0.03,
        typoRate: 0.06, falseStartRate: 0.03, correctionDelayMs: 180, burstChance: 0.18 } },
    { id: "builtin-tired", name: "Tired & Distracted", builtIn: true, updatedAt: 0,
      settings: { ...TYPE_DEFAULTS, wpm: 42, speedVariance: 0.5, breakFrequency: 0.14,
        minBreakMs: 800, maxBreakMs: 6000, typoRate: 0.07, falseStartRate: 0.05,
        fatigueEnabled: true, fatigueStrength: 0.7, burstModeEnabled: false } },
  ];

  const RANGES = {
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

  const pct = (v) => `${Math.round(v * 100)}%`;
  const pct1 = (v) => `${(v * 100).toFixed(1)}%`;
  const secs = (v) => `${(v / 1000).toFixed(2)} s`;

  const CORE_SLIDERS = [
    { key: "wpm", label: "Typing speed (how fast it types)", format: (v) => `${v} WPM` },
    { key: "speedVariance", label: "Speed variance (how much typing speed changes)", format: pct },
    { key: "breakFrequency", label: "Break frequency (how often pauses happen)", format: pct },
    { key: "breakVariance", label: "Break variance (how random the pauses are)", format: pct },
    { key: "minBreakMs", label: "Min break length (shortest pause)", format: secs },
    { key: "maxBreakMs", label: "Max break length (longest pause)", format: secs },
    { key: "typoRate", label: "Typo rate (how often mistakes are made)", format: pct1 },
    { key: "falseStartRate", label: "False-start rate (starts typing then corrects itself)", format: pct1 },
    { key: "correctionDelayMs", label: "Correction delay (time before fixing mistakes)", format: (v) => `${v} ms` },
  ];
  const LONGWORD_SLIDERS = [
    { key: "longWordThreshold", label: 'Long-word length (word length considered "long")', format: (v) => `${v} chars` },
  ];
  const FATIGUE_SLIDERS = [
    { key: "fatigueStrength", label: "Fatigue strength (how much it slows down)", format: pct },
  ];
  const BURST_SLIDERS = [
    { key: "burstChance", label: "Burst chance (chance of a speed burst)", format: pct },
  ];
  const ALL_SLIDERS = [...CORE_SLIDERS, ...LONGWORD_SLIDERS, ...FATIGUE_SLIDERS, ...BURST_SLIDERS];

  const KEYS = {
    settings: "ht_settings",
    presets: "ht_user_presets",
    lastText: "ht_last_text",
  };

  function sanitizeSettings(s) {
    return {
      ...s,
      wpm: clamp(s.wpm, 5, 240),
      speedVariance: clamp(s.speedVariance, 0, 1),
      breakFrequency: clamp(s.breakFrequency, 0, 0.6),
      breakVariance: clamp(s.breakVariance, 0, 1),
      minBreakMs: clamp(s.minBreakMs, 50, 20000),
      maxBreakMs: clamp(s.maxBreakMs, 50, 30000),
      typoRate: clamp(s.typoRate, 0, 0.4),
      falseStartRate: clamp(s.falseStartRate, 0, 0.3),
      correctionDelayMs: clamp(s.correctionDelayMs, 20, 4000),
      longWordThreshold: clamp(s.longWordThreshold, 4, 24),
      fatigueStrength: clamp(s.fatigueStrength, 0, 1),
      burstChance: clamp(s.burstChance, 0, 0.6),
    };
  }

  function formatDuration(ms) {
    if (!isFinite(ms) || ms < 0) return "—";
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m <= 0 ? `${s}s` : `${m}m ${s.toString().padStart(2, "0")}s`;
  }

  function estimateTypingMs(text, settings) {
    const s = sanitizeSettings(settings);
    const len = text.length;
    if (len === 0) return 0;
    const msPerChar = 60000 / (s.wpm * 5);
    const fatigueFactor = s.fatigueEnabled ? 1 + s.fatigueStrength * 0.5 : 1;
    const base = len * msPerChar * fatigueFactor;
    const words = len / 5;
    const avgBreak = (s.minBreakMs + s.maxBreakMs) / 2;
    const breaks = words * s.breakFrequency * avgBreak;
    const typos = len * s.typoRate * (s.correctionDelayMs + 3 * msPerChar);
    const falseStarts = words * s.falseStartRate * (3 * msPerChar + s.correctionDelayMs * 1.3);
    return base + breaks + typos + falseStarts;
  }

  // ---- Typer elements ----------------------------------------------------
  const ty = {
    input: $("type-input"),
    chars: $("type-chars"),
    eta: $("type-eta"),
    progressWrap: document.querySelector(".progress"),
    progressFill: $("progress-fill"),
    status: $("status"),
    statusLabel: $("status-label"),
    editorChip: $("editor-chip"),
    editorLabel: $("editor-label"),
    btnStart: $("btn-start"),
    btnPause: $("btn-pause"),
    btnStop: $("btn-stop"),
    btnTest: $("btn-test"),
    coreSliders: $("core-sliders"),
    longwordSliders: $("longword-sliders"),
    fatigueSliders: $("fatigue-sliders"),
    burstSliders: $("burst-sliders"),
    toggleLongwords: $("toggle-longwords"),
    togglePunctuation: $("toggle-punctuation"),
    toggleFatigue: $("toggle-fatigue"),
    toggleBurst: $("toggle-burst"),
    advancedToggle: $("typer-advanced-toggle"),
    advancedPanel: $("typer-advanced-panel"),
    presetSelect: $("preset-select"),
    presetName: $("preset-name"),
    btnLoad: $("btn-load"),
    btnSave: $("btn-save"),
    btnReset: $("btn-reset"),
  };

  let settings;
  let typeState = "idle";
  const sliderInputs = new Map();
  const sliderValues = new Map();

  // ---- Settings persistence ----------------------------------------------
  async function loadSettings() {
    const stored = (await chrome.storage.sync.get(KEYS.settings))[KEYS.settings] ?? {};
    return { ...TYPE_DEFAULTS, ...stored };
  }
  let settingsSaveTimer;
  function saveSettingsSoon() {
    clearTimeout(settingsSaveTimer);
    settingsSaveTimer = setTimeout(
      () => chrome.storage.sync.set({ [KEYS.settings]: settings }),
      250
    );
  }

  // ---- Sliders -------------------------------------------------------------
  function buildSliders(defs, container) {
    for (const def of defs) {
      const range = RANGES[def.key];
      const wrap = document.createElement("div");
      wrap.className = "slider";

      const head = document.createElement("div");
      head.className = "slider__head";
      const label = document.createElement("span");
      label.className = "slider__label";
      label.textContent = def.label;
      const value = document.createElement("span");
      value.className = "slider__value";
      head.append(label, value);

      const input = document.createElement("input");
      input.type = "range";
      input.min = String(range.min);
      input.max = String(range.max);
      input.step = String(range.step);
      input.addEventListener("input", () => {
        settings[def.key] = Number(input.value);
        value.textContent = def.format(Number(input.value));
        linkBreakBounds(def.key);
        saveSettingsSoon();
        refreshTyperMeta();
      });

      wrap.append(head, input);
      container.append(wrap);
      sliderInputs.set(def.key, input);
      sliderValues.set(def.key, value);
    }
  }

  // Keep min break <= max break when either slider moves.
  function linkBreakBounds(changedKey) {
    if (changedKey === "minBreakMs" && settings.minBreakMs > settings.maxBreakMs) {
      settings.maxBreakMs = settings.minBreakMs;
      syncSlider("maxBreakMs");
    } else if (changedKey === "maxBreakMs" && settings.maxBreakMs < settings.minBreakMs) {
      settings.minBreakMs = settings.maxBreakMs;
      syncSlider("minBreakMs");
    }
  }

  function syncSlider(key) {
    const input = sliderInputs.get(key);
    const value = sliderValues.get(key);
    if (!input || !value) return;
    const def = ALL_SLIDERS.find((d) => d.key === key);
    input.value = String(settings[key]);
    value.textContent = def.format(settings[key]);
  }

  function syncTyperUi() {
    sliderInputs.forEach((_, key) => syncSlider(key));
    ty.toggleLongwords.checked = settings.hesitateLongWords;
    ty.togglePunctuation.checked = settings.hesitateBeforePunctuation;
    ty.toggleFatigue.checked = settings.fatigueEnabled;
    ty.toggleBurst.checked = settings.burstModeEnabled;
    syncSubSliderState();
    refreshTyperMeta();
  }

  function syncSubSliderState() {
    dimSliders(ty.longwordSliders, settings.hesitateLongWords);
    dimSliders(ty.fatigueSliders, settings.fatigueEnabled);
    dimSliders(ty.burstSliders, settings.burstModeEnabled);
  }
  function dimSliders(container, enabled) {
    container.style.opacity = enabled ? "1" : "0.4";
    container.style.pointerEvents = enabled ? "auto" : "none";
  }

  function refreshTyperMeta() {
    const text = ty.input.value;
    ty.chars.textContent = String(text.length);
    if (typeState === "typing" || typeState === "paused") return;
    ty.eta.textContent = text.length === 0 ? "—" : formatDuration(estimateTypingMs(text, settings));
  }

  // ---- Messaging to the page ----------------------------------------------
  async function sendToActiveTab(message) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;
    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      return null;
    }
  }

  async function detectEditor() {
    const res = await sendToActiveTab({ type: "DETECT_EDITOR" });
    if (!res?.editor || !res.editor.ready) {
      ty.editorChip.dataset.ready = "false";
      ty.editorLabel.textContent = res ? "No editor on this page" : "Page not supported";
      return;
    }
    ty.editorChip.dataset.ready = "true";
    ty.editorLabel.textContent = res.editor.label;
  }

  // ---- Typing controls ------------------------------------------------------
  async function startTyping() {
    const text = ty.input.value;
    if (!text.trim()) {
      toast("Paste some text to type first.", "error");
      return;
    }
    chrome.storage.local.set({ [KEYS.lastText]: text });
    const res = await sendToActiveTab({ type: "START_TYPING", text, settings });
    if (!res) {
      toast("Open a normal web page and click into an editor.", "error");
      return;
    }
    if (!res.ok) {
      toast(res.error ?? "Could not start typing.", "error");
      return;
    }
    if (res.editor) ty.editorLabel.textContent = res.editor.label;
    setTypeState("typing");
    toast(`Typing into ${res.editor?.label ?? "editor"}…`, "success");
  }

  async function togglePause() {
    if (typeState === "typing") {
      await sendToActiveTab({ type: "PAUSE_TYPING" });
      setTypeState("paused");
    } else if (typeState === "paused") {
      await sendToActiveTab({ type: "RESUME_TYPING" });
      setTypeState("typing");
    }
  }

  async function stopTyping() {
    await sendToActiveTab({ type: "STOP_TYPING" });
    setTypeState("idle");
  }

  async function testTyping() {
    const res = await sendToActiveTab({ type: "TEST_TYPING", settings });
    if (!res) {
      toast("Open a normal web page and click into an editor.", "error");
      return;
    }
    if (!res.ok) {
      toast(res.error ?? "Could not run the test.", "error");
      return;
    }
    setTypeState("typing");
    toast("Running a short test…", "success");
  }

  function setTypeState(state) {
    typeState = state;
    ty.status.dataset.state = state;
    const labels = { idle: "Idle", typing: "Typing…", paused: "Paused", finished: "Done", error: "Error" };
    ty.statusLabel.textContent = labels[state];

    const typing = state === "typing";
    const paused = state === "paused";
    const busy = typing || paused;
    ty.btnStart.disabled = busy;
    ty.btnTest.disabled = busy;
    ty.btnPause.disabled = !busy;
    ty.btnStop.disabled = !busy;
    ty.btnPause.innerHTML = paused
      ? '<span class="btn__icon">▶</span> Resume'
      : '<span class="btn__icon">II</span> Pause';
    ty.progressWrap.dataset.active = String(typing);
    if (state === "idle" || state === "finished" || state === "error") refreshTyperMeta();
  }

  function onProgress(progress) {
    setTypeState(progress.state);
    ty.progressFill.style.width = `${Math.round(progress.ratio * 100)}%`;
    if (progress.state === "typing" || progress.state === "paused") {
      ty.eta.textContent = formatDuration(progress.etaMs);
      ty.chars.textContent = `${progress.typedChars}/${progress.totalChars}`;
    }
    if (progress.state === "finished") {
      ty.progressFill.style.width = "100%";
      toast("Finished typing.", "success");
    }
    if (progress.state === "error") toast(progress.message ?? "Typing stopped.", "error");
  }

  // ---- Presets ---------------------------------------------------------------
  let presetList = [];

  async function getUserPresets() {
    return (await chrome.storage.sync.get(KEYS.presets))[KEYS.presets] ?? [];
  }

  async function refreshPresets(selectId) {
    const user = await getUserPresets();
    user.sort((a, b) => b.updatedAt - a.updatedAt);
    presetList = [...BUILTIN_PRESETS, ...user];
    ty.presetSelect.innerHTML = "";
    for (const preset of presetList) {
      const opt = document.createElement("option");
      opt.value = preset.id;
      opt.textContent = preset.builtIn ? `★ ${preset.name}` : preset.name;
      ty.presetSelect.append(opt);
    }
    if (selectId) ty.presetSelect.value = selectId;
  }

  async function loadPreset() {
    const preset = presetList.find((p) => p.id === ty.presetSelect.value);
    if (!preset) return;
    settings = { ...preset.settings };
    syncTyperUi();
    await chrome.storage.sync.set({ [KEYS.settings]: settings });
    toast(`Loaded “${preset.name}”.`, "success");
  }

  async function savePreset() {
    const name = ty.presetName.value.trim();
    if (!name) {
      toast("Name your preset first.", "error");
      return;
    }
    const user = await getUserPresets();
    const existing = user.find((p) => p.name.toLowerCase() === name.toLowerCase());
    const preset = {
      id: existing?.id ?? `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      settings: { ...settings },
      updatedAt: Date.now(),
    };
    const next = existing ? user.map((p) => (p.id === existing.id ? preset : p)) : [...user, preset];
    await chrome.storage.sync.set({ [KEYS.presets]: next });
    ty.presetName.value = "";
    await refreshPresets(preset.id);
    toast(`Saved “${preset.name}”.`, "success");
  }

  async function resetSettings() {
    settings = { ...TYPE_DEFAULTS };
    await chrome.storage.sync.set({ [KEYS.settings]: settings });
    syncTyperUi();
    toast("Settings reset to defaults.", "success");
  }

  function bindTypeToggle(input, key) {
    input.addEventListener("change", () => {
      settings[key] = input.checked;
      syncSubSliderState();
      saveSettingsSoon();
      refreshTyperMeta();
    });
  }

  /* ========================================================================
     UnAIMyText handoff
     ===================================================================== */
  const PENDING_KEY = "uamt_pending_text";
  const DRAFT_KEY = "uamt_draft";
  const SITE_URL = "https://unaimytext.com/";

  const rw = {
    text: $("rewrite-text"),
    words: $("rewrite-words"),
    chars: $("rewrite-chars"),
    btnOpen: $("btn-open-unaimytext"),
  };

  function refreshRewriteMeta() {
    rw.words.textContent = String(countWords(rw.text.value));
    rw.chars.textContent = String(rw.text.value.length);
  }

  let draftTimer;
  function saveDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(
      () => chrome.storage.local.set({ [DRAFT_KEY]: rw.text.value }),
      250
    );
  }

  async function openUnaimytext() {
    const text = rw.text.value.trim();
    if (!text) {
      toast("Paste some text first.", "error");
      return;
    }
    // The bridge content script on unaimytext.com picks this up and fills
    // the site's input box. Clipboard copy is the manual fallback.
    await chrome.storage.local.set({ [PENDING_KEY]: { text, ts: Date.now() } });
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard is best-effort */
    }
    chrome.tabs.create({ url: SITE_URL });
    window.close();
  }

  /* ========================================================================
     Wiring
     ===================================================================== */
  function bind() {
    for (const tab of tabs) {
      tab.addEventListener("click", () => setTab(tab.dataset.panel));
    }

    // --- Typer ---
    ty.input.addEventListener("input", () => {
      chrome.storage.local.set({ [KEYS.lastText]: ty.input.value });
      refreshTyperMeta();
    });
    ty.btnStart.addEventListener("click", () => void startTyping());
    ty.btnPause.addEventListener("click", () => void togglePause());
    ty.btnStop.addEventListener("click", () => void stopTyping());
    ty.btnTest.addEventListener("click", () => void testTyping());

    bindTypeToggle(ty.toggleLongwords, "hesitateLongWords");
    bindTypeToggle(ty.togglePunctuation, "hesitateBeforePunctuation");
    bindTypeToggle(ty.toggleFatigue, "fatigueEnabled");
    bindTypeToggle(ty.toggleBurst, "burstModeEnabled");

    ty.advancedToggle.addEventListener("click", () => {
      const open = ty.advancedToggle.getAttribute("aria-expanded") === "true";
      ty.advancedToggle.setAttribute("aria-expanded", String(!open));
      ty.advancedPanel.hidden = open;
    });

    ty.btnLoad.addEventListener("click", () => void loadPreset());
    ty.btnSave.addEventListener("click", () => void savePreset());
    ty.btnReset.addEventListener("click", () => void resetSettings());

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "PROGRESS") onProgress(msg.progress);
    });

    // If the bridge captures text while this popup is open, show it live.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[KEYS.lastText]) return;
      const next = changes[KEYS.lastText].newValue ?? "";
      if (ty.input.value !== next) {
        ty.input.value = next;
        refreshTyperMeta();
        setTab("panel-typer");
        toast("Received text from UnAIMyText.", "success");
      }
    });

    // --- UnAIMyText handoff ---
    rw.text.addEventListener("input", () => {
      refreshRewriteMeta();
      saveDraft();
    });
    rw.btnOpen.addEventListener("click", () => void openUnaimytext());
    rw.text.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        void openUnaimytext();
      }
    });
  }

  /* ========================================================================
     Init
     ===================================================================== */
  async function init() {
    buildSliders(CORE_SLIDERS, ty.coreSliders);
    buildSliders(LONGWORD_SLIDERS, ty.longwordSliders);
    buildSliders(FATIGUE_SLIDERS, ty.fatigueSliders);
    buildSliders(BURST_SLIDERS, ty.burstSliders);

    settings = await loadSettings();
    syncTyperUi();

    const local = await chrome.storage.local.get([KEYS.lastText, DRAFT_KEY, "active_tab"]);
    ty.input.value = local[KEYS.lastText] ?? "";
    refreshTyperMeta();

    rw.text.value = local[DRAFT_KEY] ?? "";
    refreshRewriteMeta();

    if (local.active_tab === "panel-rewriter") setTab("panel-rewriter");

    await refreshPresets();
    bind();
    await detectEditor();

    const status = await sendToActiveTab({ type: "GET_STATUS" });
    if (status?.progress) onProgress(status.progress);
  }

  document.addEventListener("DOMContentLoaded", () => void init());
})();
