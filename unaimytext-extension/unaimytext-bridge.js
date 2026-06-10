/* ===========================================================================
   UnAIMyText bridge — runs only on unaimytext.com.

   1. If the extension popup stored pending text, drop it into the site's
      input box automatically.
   2. Inject a floating "Send to Auto Typer" button. Clicking it grabs the
      humanized result from the page and stores it as the Auto Typer text,
      so it's loaded the next time the popup opens.

   The site renders its result in a "HUMAN OUTPUT" panel as styled spans
   (not a textarea), so capture works by finding coherent text blocks and
   taking the largest group — with the user's selection as a last resort.
   =========================================================================== */
(() => {
  "use strict";
  if (window.top !== window) return;
  if (window.__uamtBridge) return;
  window.__uamtBridge = true;

  const PENDING_KEY = "uamt_pending_text";
  const LAST_TEXT_KEY = "ht_last_text";
  const ACTIVE_TAB_KEY = "active_tab";
  const BTN_ID = "uamt-bridge-btn";
  const TOAST_ID = "uamt-bridge-toast";

  // Remember what we pasted in, so we never send the input back as "output".
  let lastFilledText = "";

  /* ------------------------------ DOM utils ----------------------------- */
  function isVisible(el) {
    if (!(el instanceof HTMLElement)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 60 || rect.height < 16) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function elementText(el) {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      return el.value ?? "";
    }
    return el.innerText ?? el.textContent ?? "";
  }

  // React and friends ignore plain .value writes; go through the native
  // setter and fire the events frameworks listen for.
  function setNativeValue(el, value) {
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype :
      el instanceof HTMLInputElement ? HTMLInputElement.prototype :
      Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc?.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /* --------------------------- Input detection -------------------------- */
  function findInputBox() {
    const areas = Array.from(document.querySelectorAll("textarea"))
      .filter((t) => isVisible(t) && !t.readOnly && !t.disabled);
    const hinted = areas.find((t) =>
      /input|original|paste|your|source|content/i.test(
        `${t.id} ${t.className} ${t.placeholder ?? ""} ${t.getAttribute("aria-label") ?? ""}`
      )
    );
    if (hinted) return hinted;
    if (areas.length > 0) return areas[0];
    const editable = Array.from(
      document.querySelectorAll('[contenteditable="true"]')
    ).filter(isVisible);
    return editable[0] ?? null;
  }

  function fillInput(text) {
    const box = findInputBox();
    if (!box) return false;
    if (box instanceof HTMLTextAreaElement || box instanceof HTMLInputElement) {
      setNativeValue(box, text);
    } else {
      box.focus();
      document.execCommand("selectAll", false);
      document.execCommand("insertText", false, text);
    }
    lastFilledText = text.trim();
    return true;
  }

  async function tryAutofill() {
    const stored = await chrome.storage.local.get(PENDING_KEY);
    const pending = stored[PENDING_KEY];
    if (!pending?.text) return;
    // Stale handoffs (user opened the site much later) are ignored.
    if (Date.now() - (pending.ts ?? 0) > 5 * 60 * 1000) {
      chrome.storage.local.remove(PENDING_KEY);
      return;
    }
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (fillInput(pending.text)) {
        clearInterval(timer);
        chrome.storage.local.remove(PENDING_KEY);
        showToast("Text pasted from the extension — now humanize it.");
      } else if (attempts > 20) {
        // The site never showed a box we recognize; the popup also copied
        // the text to the clipboard, so pasting by hand still works.
        clearInterval(timer);
        showToast("Couldn't find the input box — your text is on the clipboard, press Ctrl/⌘+V.", true);
      }
    }, 500);
  }

  /* --------------------------- Output detection ------------------------- */
  // Tags that don't break a run of prose.
  const INLINE_TAGS = new Set([
    "SPAN", "B", "I", "EM", "STRONG", "MARK", "A", "BR", "CODE",
    "SMALL", "SUP", "SUB", "U", "S", "ABBR", "TIME", "WBR",
  ]);

  // A "text block" is an element whose children are inline-only — the way
  // the site renders output prose (a div full of styled spans).
  function isTextBlock(el) {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return false;
    if (el.isContentEditable) return false;
    if (el.id && el.id.startsWith("uamt-")) return false;
    if (el.closest('[id^="uamt-"]')) return false;
    if (!isVisible(el)) return false;
    for (const child of el.children) {
      if (!INLINE_TAGS.has(child.tagName)) return false;
    }
    return true;
  }

  function looksLikeEcho(text, inputText) {
    if (!inputText) return false;
    if (text === inputText) return true;
    // Same opening = the site is just mirroring the input.
    const probe = Math.min(120, inputText.length, text.length);
    return probe >= 60 && text.slice(0, probe) === inputText.slice(0, probe);
  }

  // Collect text blocks inside `scope`, group them by parent, and return
  // the biggest group — that's the result prose, never the badges or
  // word-count chrome around it.
  function extractMainText(scope, inputText) {
    const blocks = [];
    for (const el of scope.querySelectorAll("*")) {
      if (!isTextBlock(el)) continue;
      const text = elementText(el).trim();
      if (text.length < 25) continue;
      if (looksLikeEcho(text, inputText)) continue;
      blocks.push(el);
    }
    if (scope !== document.body && scope instanceof HTMLElement && isTextBlock(scope)) {
      const text = elementText(scope).trim();
      if (text.length >= 25 && !looksLikeEcho(text, inputText)) blocks.push(scope);
    }

    const groups = new Map();
    for (const block of blocks) {
      // Skip blocks nested inside another collected block (keep the outer).
      if (blocks.some((other) => other !== block && other.contains(block))) continue;
      const key = block.parentElement ?? block;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(block);
    }

    let best = null;
    let bestLen = 0;
    for (const els of groups.values()) {
      const text = els.map((e) => elementText(e).trim()).join("\n\n");
      if (text.length > bestLen) {
        bestLen = text.length;
        best = text;
      }
    }
    return bestLen >= 25 ? best : null;
  }

  // Find a small element that *is* the "HUMAN OUTPUT" heading, then climb
  // to the panel that holds the result.
  function findOutputPanel() {
    for (const el of document.querySelectorAll("h1,h2,h3,h4,h5,h6,span,div,p,label,strong")) {
      if (el.children.length > 3) continue;
      const text = (el.textContent ?? "").trim();
      if (text.length > 40) continue;
      if (!/human\s*output|humanized\s*(text|output|version)/i.test(text)) continue;
      let panel = el;
      for (let depth = 0; depth < 8 && panel.parentElement; depth++) {
        panel = panel.parentElement;
        const panelText = elementText(panel).trim();
        if (panelText.length > text.length + 120) return panel;
      }
    }
    return null;
  }

  function grabOutput() {
    const inputBox = findInputBox();
    const inputText = lastFilledText || (inputBox ? elementText(inputBox).trim() : "");

    // 1. The site's "HUMAN OUTPUT" panel.
    const panel = findOutputPanel();
    if (panel) {
      const text = extractMainText(panel, inputText);
      if (text) return text;
    }

    // 2. Elements whose id/class say they hold the result.
    const hinted = Array.from(
      document.querySelectorAll(
        '[id*="output" i], [class*="output" i], [id*="result" i], [class*="result" i], [id*="humanized" i], [class*="humanized" i]'
      )
    ).filter((el) => el instanceof HTMLElement && !el.id.startsWith("uamt-"));
    for (const el of hinted) {
      const text = el instanceof HTMLTextAreaElement
        ? el.value.trim()
        : extractMainText(el, inputText);
      if (text && text.length >= 25 && !looksLikeEcho(text, inputText)) return text;
    }

    // 3. A read-only textarea, or the last textarea that isn't the input.
    const areas = Array.from(document.querySelectorAll("textarea")).filter(isVisible);
    const readonly = areas.find(
      (t) => (t.readOnly || t.disabled) && t.value.trim().length >= 25 && !looksLikeEcho(t.value.trim(), inputText)
    );
    if (readonly) return readonly.value.trim();
    for (let i = areas.length - 1; i >= 0; i--) {
      const text = areas[i].value.trim();
      if (areas[i] !== inputBox && text.length >= 25 && !looksLikeEcho(text, inputText)) return text;
    }

    // 4. Biggest prose group anywhere on the page.
    const generic = extractMainText(document.body, inputText);
    if (generic && generic.length >= 60) return generic;

    // 5. Whatever the user has selected on the page.
    const selection = String(window.getSelection() ?? "").trim();
    if (selection.length > 0) return selection;

    return null;
  }

  async function sendToTyper() {
    const text = grabOutput();
    if (!text) {
      showToast("Couldn't find the humanized text — select it on the page, then click this button again.", true);
      return;
    }
    await chrome.storage.local.set({
      [LAST_TEXT_KEY]: text,
      [ACTIVE_TAB_KEY]: "panel-typer",
    });
    try {
      chrome.runtime.sendMessage({ type: "UAMT_CAPTURED", chars: text.length });
    } catch {
      /* service worker may be asleep; storage is already written */
    }
    showToast(`Sent ${text.length} characters to the Auto Typer — open the extension and press Start.`);
  }

  /* ------------------------------- UI ----------------------------------- */
  function injectStyles() {
    if (document.getElementById("uamt-bridge-style")) return;
    const style = document.createElement("style");
    style.id = "uamt-bridge-style";
    style.textContent = `
      #${BTN_ID} {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483646;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 12px 18px;
        border: none;
        border-radius: 999px;
        background: linear-gradient(145deg, #9d83ff, #7c5cff);
        color: #ffffff;
        font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(124, 92, 255, 0.5);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      #${BTN_ID}:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 32px rgba(124, 92, 255, 0.65);
      }
      #${TOAST_ID} {
        position: fixed;
        left: 50%;
        bottom: 80px;
        transform: translateX(-50%);
        z-index: 2147483647;
        max-width: 420px;
        padding: 12px 18px;
        border-radius: 10px;
        border-left: 4px solid #7c5cff;
        background: #181a2e;
        color: #eef0ff;
        font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
        font-size: 13px;
        line-height: 1.5;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.25s ease;
      }
      #${TOAST_ID}[data-show="true"] { opacity: 1; }
      #${TOAST_ID}[data-error="true"] { border-left-color: #e05a6b; }
    `;
    (document.head ?? document.documentElement).append(style);
  }

  let toastTimer;
  function showToast(message, isError = false) {
    let node = document.getElementById(TOAST_ID);
    if (!node) {
      node = document.createElement("div");
      node.id = TOAST_ID;
      (document.body ?? document.documentElement).append(node);
    }
    node.textContent = message;
    node.dataset.error = String(isError);
    node.dataset.show = "true";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (node.dataset.show = "false"), 5000);
  }

  function ensureButton() {
    if (document.getElementById(BTN_ID)) return;
    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.innerHTML = "⚡ Send to Auto Typer";
    btn.title = "Grab the humanized text and load it into the extension's Auto Typer";
    btn.addEventListener("click", () => void sendToTyper());
    (document.body ?? document.documentElement).append(btn);
  }

  /* ------------------------------- Boot ---------------------------------- */
  function boot() {
    injectStyles();
    ensureButton();
    void tryAutofill();
    // SPAs re-render the body; make sure our button survives.
    setInterval(() => {
      injectStyles();
      ensureButton();
    }, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
