"use strict";
(() => {
  const { humanize, aiMarkerScore, DEFAULT_OPTS } = window.Humanizer;

  const STORE_KEY = "uamt_state";

  const $ = (id) => document.getElementById(id);
  const el = {
    modes: Array.from(document.querySelectorAll(".mode")),
    input: $("input"),
    output: $("output"),
    inWords: $("in-words"),
    inChars: $("in-chars"),
    outWords: $("out-words"),
    advancedToggle: $("advanced-toggle"),
    advancedPanel: $("advanced-panel"),
    optEmdash: $("opt-emdash"),
    optRemoveDash: $("opt-removedash"),
    optQuotes: $("opt-quotes"),
    optUnicode: $("opt-unicode"),
    optWhitespace: $("opt-whitespace"),
    optContractions: $("opt-contractions"),
    btnHumanize: $("btn-humanize"),
    btnCopy: $("btn-copy"),
    score: $("score"),
    scoreBefore: $("score-before"),
    scoreAfter: $("score-after"),
    scoreFill: $("score-fill"),
    toast: $("toast"),
  };

  let mode = "standard";

  // ---- Helpers ------------------------------------------------------------
  const countWords = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

  function currentOptions() {
    return {
      mode,
      emdashToComma: el.optEmdash.checked,
      removeDashes: el.optRemoveDash.checked,
      straightenQuotes: el.optQuotes.checked,
      removeHiddenUnicode: el.optUnicode.checked,
      removeWhitespace: el.optWhitespace.checked,
      contractions: el.optContractions.checked,
    };
  }

  let toastTimer;
  function toast(message, kind = "info") {
    el.toast.textContent = message;
    el.toast.dataset.kind = kind;
    el.toast.dataset.show = "true";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.toast.dataset.show = "false"), 2400);
  }

  let saveTimer;
  function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const state = {
        mode,
        input: el.input.value,
        output: el.output.value,
        opts: currentOptions(),
      };
      chrome.storage.local.set({ [STORE_KEY]: state });
    }, 250);
  }

  // ---- UI updates ---------------------------------------------------------
  function refreshInputMeta() {
    el.inWords.textContent = String(countWords(el.input.value));
    el.inChars.textContent = String(el.input.value.length);
  }

  function setMode(next) {
    mode = next;
    for (const btn of el.modes) {
      const active = btn.dataset.mode === next;
      btn.classList.toggle("mode--active", active);
      btn.setAttribute("aria-checked", String(active));
    }
    saveState();
  }

  function showScore(before, after) {
    el.score.hidden = false;
    el.scoreBefore.textContent = `${before}%`;
    el.scoreAfter.textContent = `${after}%`;
    // The bar visualizes how much was removed (higher fill = bigger drop).
    const reduction = before > 0 ? Math.round(((before - after) / before) * 100) : 0;
    el.scoreFill.style.width = `${Math.max(0, reduction)}%`;
  }

  // ---- Actions ------------------------------------------------------------
  function runHumanize() {
    const text = el.input.value;
    if (!text.trim()) {
      toast("Paste some text to humanize first.", "error");
      return;
    }
    const before = aiMarkerScore(text);
    const result = humanize(text, currentOptions());
    el.output.value = result;
    el.outWords.textContent = String(countWords(result));
    showScore(before, aiMarkerScore(result));
    saveState();
    toast("Humanized — runs locally, meaning preserved.", "success");
  }

  async function copyOutput() {
    const text = el.output.value;
    if (!text) {
      toast("Nothing to copy yet.", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      el.output.removeAttribute("readonly");
      el.output.select();
      document.execCommand("copy");
      el.output.setAttribute("readonly", "");
    }
    toast("Copied to clipboard.", "success");
  }

  // ---- Wiring -------------------------------------------------------------
  function bind() {
    for (const btn of el.modes) {
      btn.addEventListener("click", () => setMode(btn.dataset.mode));
    }

    el.input.addEventListener("input", () => {
      refreshInputMeta();
      saveState();
    });

    el.advancedToggle.addEventListener("click", () => {
      const open = el.advancedToggle.getAttribute("aria-expanded") === "true";
      el.advancedToggle.setAttribute("aria-expanded", String(!open));
      el.advancedPanel.hidden = open;
    });

    // "Convert to commas" and "Remove completely" are mutually exclusive.
    el.optEmdash.addEventListener("change", () => {
      if (el.optEmdash.checked) el.optRemoveDash.checked = false;
      saveState();
    });
    el.optRemoveDash.addEventListener("change", () => {
      if (el.optRemoveDash.checked) el.optEmdash.checked = false;
      saveState();
    });
    for (const opt of [el.optQuotes, el.optUnicode, el.optWhitespace, el.optContractions]) {
      opt.addEventListener("change", saveState);
    }

    el.btnHumanize.addEventListener("click", runHumanize);
    el.btnCopy.addEventListener("click", copyOutput);

    // Ctrl/Cmd+Enter from the input box runs the humanizer.
    el.input.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runHumanize();
      }
    });
  }

  // ---- Restore ------------------------------------------------------------
  async function restore() {
    const stored = (await chrome.storage.local.get(STORE_KEY))[STORE_KEY];
    if (stored) {
      el.input.value = stored.input ?? "";
      el.output.value = stored.output ?? "";
      const opts = { ...DEFAULT_OPTS, ...(stored.opts ?? {}) };
      el.optEmdash.checked = opts.emdashToComma;
      el.optRemoveDash.checked = opts.removeDashes;
      el.optQuotes.checked = opts.straightenQuotes;
      el.optUnicode.checked = opts.removeHiddenUnicode;
      el.optWhitespace.checked = opts.removeWhitespace;
      el.optContractions.checked = opts.contractions;
      setMode(stored.mode ?? "standard");
      el.outWords.textContent = String(countWords(el.output.value));
    }
    refreshInputMeta();
  }

  document.addEventListener("DOMContentLoaded", async () => {
    bind();
    await restore();
  });
})();
