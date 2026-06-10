/* ===========================================================================
   UnAIMyText bridge — runs only on unaimytext.com.

   1. If the extension popup stored pending text, drop it into the site's
      input box automatically.
   2. Inject a floating "Send to Auto Typer" button. Clicking it grabs the
      humanized result from the page and stores it as the Auto Typer text,
      so it's loaded the next time the popup opens.
   =========================================================================== */
(() => {
  "use strict";
  if (window.top !== window) return;

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
    if (rect.width < 60 || rect.height < 30) return false;
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
      /input|original|paste|your|source/i.test(
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
  function grabOutput() {
    const inputText = lastFilledText || (findInputBox() ? elementText(findInputBox()).trim() : "");
    const notEcho = (text) => text.length >= 20 && text !== inputText;

    // 1. Elements that say they hold the result.
    const hinted = Array.from(
      document.querySelectorAll(
        '[id*="output" i], [class*="output" i], [id*="result" i], [class*="result" i], [id*="humanized" i], [class*="humanized" i]'
      )
    ).filter((el) => isVisible(el) && !el.id.startsWith("uamt-"));
    for (const el of hinted) {
      const text = elementText(el).trim();
      if (notEcho(text)) return text;
    }

    // 2. A read-only textarea, or the last textarea that isn't the input.
    const areas = Array.from(document.querySelectorAll("textarea")).filter(isVisible);
    const readonly = areas.find((t) => (t.readOnly || t.disabled) && notEcho(t.value.trim()));
    if (readonly) return readonly.value.trim();
    for (let i = areas.length - 1; i >= 0; i--) {
      const text = areas[i].value.trim();
      if (notEcho(text)) return text;
    }

    // 3. Whatever the user has selected on the page.
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
