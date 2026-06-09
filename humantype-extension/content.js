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

let stopFlag    = false;
let typingActive = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function jitter(base, variance) {
  const spread = variance * 0.35;
  const factor = 1 + (Math.random() * 2 - 1) * spread;
  return Math.max(20, Math.round(base * factor));
}

function getNeighbor(ch) {
  const lower = ch.toLowerCase();
  const neighbors = NEIGHBORS[lower];
  if (!neighbors) return null;
  const typo = neighbors[Math.floor(Math.random() * neighbors.length)];
  return ch === ch.toUpperCase() ? typo.toUpperCase() : typo;
}

// ── Target detection ────────────────────────────────────────────────────────

const TARGET = { STANDARD: 'standard', EXEC: 'exec' };

function detectTarget() {
  const active = document.activeElement;
  if (!active) return null;

  const tag = active.tagName.toLowerCase();

  // Normal input or textarea
  if (tag === 'input' || tag === 'textarea') return { type: TARGET.STANDARD, el: active };

  // Standard contenteditable (e.g. Notion, Slack, most editors)
  if (active.isContentEditable) return { type: TARGET.STANDARD, el: active };

  // Google Docs / Slides / canvas-based editors:
  // The active element is usually <body> or a non-editable div, but
  // execCommand('insertText') still works because the editor traps keyboard
  // events at the document level.
  if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
    return { type: TARGET.EXEC, el: active };
  }

  return null;
}

// ── Low-level insert / delete ────────────────────────────────────────────────

function dispatchKey(el, eventType, key, code) {
  el.dispatchEvent(new KeyboardEvent(eventType, {
    key,
    code: code || `Key${key.toUpperCase()}`,
    bubbles: true, cancelable: true, composed: true,
  }));
}

function insertChar(target, char) {
  if (target.type === TARGET.EXEC) {
    // Works in Google Docs, Google Slides, etc.
    document.execCommand('insertText', false, char);
    return;
  }

  const el = target.el;
  if (el.isContentEditable) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(char));
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      el.textContent += char;
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' }));
  } else {
    const start = el.selectionStart;
    const val   = el.value;
    el.value    = val.slice(0, start) + char + val.slice(el.selectionEnd);
    el.selectionStart = el.selectionEnd = start + 1;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' }));
  }
}

function deleteChar(target) {
  if (target.type === TARGET.EXEC) {
    document.execCommand('delete', false);
    return;
  }

  const el = target.el;
  if (el.isContentEditable) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (range.startOffset > 0) {
        range.setStart(range.startContainer, range.startOffset - 1);
        range.deleteContents();
      }
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
  } else {
    const start = el.selectionStart;
    if (start > 0) {
      const val = el.value;
      el.value  = val.slice(0, start - 1) + val.slice(start);
      el.selectionStart = el.selectionEnd = start - 1;
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
  }
}

// ── Main typing loop ─────────────────────────────────────────────────────────

async function typeText(target, config) {
  const { wpm, typoRate, fixRate, pauseFreq, pauseLen, variance, text } = config;
  const baseDelay = 60000 / (wpm * 5);

  if (target.el && target.el.focus) target.el.focus();
  let charsTyped = 0;

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
      dispatchKey(target.el, 'keydown', wrongChar);
      insertChar(target, wrongChar);
      dispatchKey(target.el, 'keyup', wrongChar);
      charsTyped++;

      await sleep(jitter(baseDelay * 1.5, variance));
      if (stopFlag) return { stopped: true, chars: charsTyped };

      // Occasionally type one more char before noticing
      if (Math.random() < 0.4 && i + 1 < text.length) {
        const nextChar = text[i + 1];
        dispatchKey(target.el, 'keydown', nextChar);
        insertChar(target, nextChar);
        dispatchKey(target.el, 'keyup', nextChar);
        charsTyped++;
        i++;
        await sleep(jitter(baseDelay, variance));
        if (stopFlag) return { stopped: true, chars: charsTyped };
      }

      if (Math.random() < fixRate) {
        await sleep(jitter(baseDelay * 2, variance));
        if (stopFlag) return { stopped: true, chars: charsTyped };

        const backspaces = i > 0 && text[i] !== text[i - 1] ? 2 : 1;
        for (let b = 0; b < backspaces; b++) {
          dispatchKey(target.el, 'keydown', 'Backspace', 'Backspace');
          deleteChar(target);
          dispatchKey(target.el, 'keyup', 'Backspace', 'Backspace');
          await sleep(jitter(baseDelay * 0.8, variance));
          if (stopFlag) return { stopped: true, chars: charsTyped };
        }

        dispatchKey(target.el, 'keydown', char);
        insertChar(target, char);
        dispatchKey(target.el, 'keyup', char);
        charsTyped++;
        await sleep(jitter(baseDelay, variance));
      }
    } else {
      dispatchKey(target.el, 'keydown', char);
      insertChar(target, char);
      dispatchKey(target.el, 'keyup', char);
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
    if (typingActive) {
      sendResponse({ error: 'Already typing.' });
      return;
    }

    const target = detectTarget();
    if (!target) {
      sendResponse({ error: 'No editable area focused. Click inside the document first.' });
      return;
    }

    stopFlag     = false;
    typingActive = true;

    typeText(target, msg.config).then(result => {
      typingActive = false;
      chrome.runtime.sendMessage({
        type: result.stopped ? 'TYPING_STOPPED' : 'TYPING_DONE',
        chars: result.chars,
      });
    });

    sendResponse({ ok: true });
    return true;
  }
});
