const NEIGHBORS = {
  a:['q','w','s','z'], b:['v','g','h','n'], c:['x','d','f','v'],
  d:['s','e','r','f','c','x'], e:['w','r','d','s'], f:['d','r','t','g','v','c'],
  g:['f','t','y','h','b','v'], h:['g','y','u','j','n','b'], i:['u','o','k','j'],
  j:['h','u','i','k','n','m'], k:['j','i','o','l','m'], l:['k','o','p'],
  m:['n','j','k'], n:['b','h','j','m'], o:['i','p','l','k'],
  p:['o','l'], q:['w','a'], r:['e','t','f','d'], s:['a','w','e','d','x','z'],
  t:['r','y','g','f'], u:['y','i','j','h'], v:['c','f','g','b'],
  w:['q','e','s','a'], x:['z','s','d','c'], y:['t','u','h','g'],
  z:['a','s','x'], ' ':['c','v','b','n','m'],
};

// ── Detect which frame context we're in ──────────────────────────────────────
//
// Google Docs injects a tiny iframe whose only job is to capture keystrokes.
// It contains a single <textarea>. We detect that here so this content script
// instance (running inside the iframe) owns all the typing for Google Docs.

const isInIframe = window.self !== window.top;

function isGDocsKeyIframe() {
  if (!isInIframe) return false;
  return document.querySelectorAll('textarea').length === 1;
}

const IN_GDOCS_IFRAME = isGDocsKeyIframe();

// ── Shared state ─────────────────────────────────────────────────────────────

let stopFlag     = false;
let typingActive = false;

// Main frame tracks the last standard input the user focused
let lastFocusedEl = null;

if (!isInIframe) {
  document.addEventListener('focusin', (e) => {
    const tag = e.target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) {
      lastFocusedEl = e.target;
    }
  }, true);
}

// ── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function jitter(base, variance) {
  const factor = 1 + (Math.random() * 2 - 1) * variance * 0.35;
  return Math.max(20, Math.round(base * factor));
}

function getNeighbor(ch) {
  const neighbors = NEIGHBORS[ch.toLowerCase()];
  if (!neighbors) return null;
  const t = neighbors[Math.floor(Math.random() * neighbors.length)];
  return ch === ch.toUpperCase() ? t.toUpperCase() : t;
}

// ── Google Docs iframe typing ────────────────────────────────────────────────

function gdocsInsert(ta, char) {
  const code = char.charCodeAt(0);
  ta.dispatchEvent(new KeyboardEvent('keydown',  { key: char, keyCode: code, which: code, charCode: 0,    bubbles: true, cancelable: true }));
  ta.dispatchEvent(new KeyboardEvent('keypress', { key: char, keyCode: code, which: code, charCode: code, bubbles: true, cancelable: true }));
  ta.dispatchEvent(new KeyboardEvent('keyup',    { key: char, keyCode: code, which: code, charCode: 0,    bubbles: true, cancelable: true }));
}

function gdocsBackspace(ta) {
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, which: 8, bubbles: true, cancelable: true }));
  ta.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Backspace', keyCode: 8, which: 8, bubbles: true, cancelable: true }));
}

// ── Standard input typing ────────────────────────────────────────────────────

function standardInsert(el, char) {
  if (el.isContentEditable) {
    document.execCommand('insertText', false, char);
  } else {
    const s = el.selectionStart;
    el.value = el.value.slice(0, s) + char + el.value.slice(el.selectionEnd);
    el.selectionStart = el.selectionEnd = s + 1;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' }));
  }
}

function standardDelete(el) {
  if (el.isContentEditable) {
    document.execCommand('delete', false);
  } else {
    const s = el.selectionStart;
    if (s > 0) {
      el.value = el.value.slice(0, s - 1) + el.value.slice(s);
      el.selectionStart = el.selectionEnd = s - 1;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    }
  }
}

// ── Main typing loop ─────────────────────────────────────────────────────────

async function typeText(config) {
  const { wpm, typoRate, fixRate, pauseFreq, pauseLen, variance, text } = config;
  const baseDelay = 60000 / (wpm * 5);

  let ta = null;
  let el = null;

  if (IN_GDOCS_IFRAME) {
    ta = document.querySelector('textarea');
    if (!ta) return { stopped: false, chars: 0, error: 'No Google Docs textarea found.' };
    ta.focus();
  } else {
    el = lastFocusedEl || document.activeElement;
    const tag = el && el.tagName.toLowerCase();
    if (!el || (tag !== 'input' && tag !== 'textarea' && !el.isContentEditable)) {
      return { stopped: false, chars: 0, error: 'No input focused.' };
    }
    el.focus();
  }

  let charsTyped = 0;

  function doInsert(char) {
    if (IN_GDOCS_IFRAME) gdocsInsert(ta, char);
    else standardInsert(el, char);
  }

  function doDelete() {
    if (IN_GDOCS_IFRAME) gdocsBackspace(ta);
    else standardDelete(el);
  }

  for (let i = 0; i < text.length; i++) {
    if (stopFlag) return { stopped: true, chars: charsTyped };

    const char = text[i];

    if (Math.random() < pauseFreq) {
      await sleep((0.3 + Math.random() * pauseLen) * 1000);
      if (stopFlag) return { stopped: true, chars: charsTyped };
    }

    const makeTypo = char.trim() !== '' && Math.random() < typoRate;

    if (makeTypo) {
      const wrongChar = getNeighbor(char) || char;
      doInsert(wrongChar);
      charsTyped++;

      await sleep(jitter(baseDelay * 1.5, variance));
      if (stopFlag) return { stopped: true, chars: charsTyped };

      if (Math.random() < 0.4 && i + 1 < text.length) {
        doInsert(text[i + 1]);
        charsTyped++;
        i++;
        await sleep(jitter(baseDelay, variance));
        if (stopFlag) return { stopped: true, chars: charsTyped };
      }

      if (Math.random() < fixRate) {
        await sleep(jitter(baseDelay * 2, variance));
        if (stopFlag) return { stopped: true, chars: charsTyped };

        const backspaces = text[i] !== char ? 2 : 1;
        for (let b = 0; b < backspaces; b++) {
          doDelete();
          await sleep(jitter(baseDelay * 0.8, variance));
          if (stopFlag) return { stopped: true, chars: charsTyped };
        }

        doInsert(char);
        charsTyped++;
        await sleep(jitter(baseDelay, variance));
      }
    } else {
      doInsert(char);
      charsTyped++;
      await sleep(jitter(baseDelay, variance));
    }
  }

  return { stopped: false, chars: charsTyped };
}

// ── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'STOP_TYPING') {
    stopFlag = true;
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'START_TYPING') {
    const gdocsIframePresent = !isInIframe &&
      !!document.querySelector('.docs-texteventtarget-iframe');

    if (IN_GDOCS_IFRAME) {
      // We are inside the Google Docs key-capture iframe — handle it here
    } else if (gdocsIframePresent) {
      // Main frame on a Google Docs page: the iframe instance handles it
      sendResponse({ ok: true });
      return;
    } else if (isInIframe) {
      // Some unrelated iframe — ignore
      return;
    }

    if (typingActive) { sendResponse({ error: 'Already typing.' }); return; }

    stopFlag     = false;
    typingActive = true;

    typeText(msg.config).then(result => {
      typingActive = false;
      if (result.error) {
        chrome.runtime.sendMessage({ type: 'TYPING_ERROR', error: result.error });
      } else {
        chrome.runtime.sendMessage({
          type: result.stopped ? 'TYPING_STOPPED' : 'TYPING_DONE',
          chars: result.chars,
        });
      }
    });

    sendResponse({ ok: true });
    return true;
  }
});
