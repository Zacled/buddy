// Adjacent keys on a QWERTY keyboard for realistic typos
const NEIGHBORS = {
  a:['q','w','s','z'], b:['v','g','h','n'], c:['x','d','f','v'],
  d:['s','e','r','f','c','x'], e:['w','r','d','s'], f:['d','r','t','g','v','c'],
  g:['f','t','y','h','b','v'], h:['g','y','u','j','n','b'], i:['u','o','k','j'],
  j:['h','u','i','k','n','m'], k:['j','i','o','l','m'], l:['k','o','p'],
  m:['n','j','k'], n:['b','h','j','m'], o:['i','p','l','k'],
  p:['o','l'], q:['w','a'], r:['e','t','f','d'], s:['a','w','e','d','x','z'],
  t:['r','y','g','f'], u:['y','i','j','h'], v:['c','f','g','b'],
  w:['q','e','s','a'], x:['z','s','d','c'], y:['t','u','h','g'],
  z:['a','s','x'],
  ' ':['c','v','b','n','m'],
};

let stopFlag = false;
let typingActive = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function jitter(base, variance) {
  // variance: 1=low, 2=medium, 3=high
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

function dispatchKey(el, eventType, key, code) {
  const ev = new KeyboardEvent(eventType, {
    key, code: code || `Key${key.toUpperCase()}`,
    bubbles: true, cancelable: true,
    composed: true,
  });
  el.dispatchEvent(ev);
}

function insertChar(el, char) {
  // Works with both input/textarea and contenteditable
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
    const end   = el.selectionEnd;
    const val   = el.value;
    el.value    = val.slice(0, start) + char + val.slice(end);
    el.selectionStart = el.selectionEnd = start + 1;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' }));
  }
}

function deleteChar(el) {
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

async function typeText(el, config) {
  const { wpm, typoRate, fixRate, pauseFreq, pauseLen, variance, text } = config;
  // Base delay per character in ms (WPM * avg ~5 chars/word)
  const baseDelay = 60000 / (wpm * 5);

  el.focus();
  let charsTyped = 0;

  for (let i = 0; i < text.length; i++) {
    if (stopFlag) return { stopped: true, chars: charsTyped };

    const char = text[i];

    // Random long pause (thinking break)
    if (Math.random() < pauseFreq) {
      const pauseMs = (0.3 + Math.random() * pauseLen) * 1000;
      await sleep(pauseMs);
      if (stopFlag) return { stopped: true, chars: charsTyped };
    }

    // Decide whether to make a typo on this character
    const makeTypo = char.trim() !== '' && Math.random() < typoRate;

    if (makeTypo) {
      const wrongChar = getNeighbor(char) || char;
      dispatchKey(el, 'keydown', wrongChar);
      insertChar(el, wrongChar);
      dispatchKey(el, 'keyup', wrongChar);
      charsTyped++;

      // Short delay before noticing mistake
      await sleep(jitter(baseDelay * 1.5, variance));
      if (stopFlag) return { stopped: true, chars: charsTyped };

      // Maybe type 1 more char before catching it
      if (Math.random() < 0.4 && i + 1 < text.length) {
        const nextChar = text[i + 1];
        dispatchKey(el, 'keydown', nextChar);
        insertChar(el, nextChar);
        dispatchKey(el, 'keyup', nextChar);
        charsTyped++;
        i++;
        await sleep(jitter(baseDelay, variance));
        if (stopFlag) return { stopped: true, chars: charsTyped };
      }

      // Decide to fix or leave the typo
      if (Math.random() < fixRate) {
        // Pause, then backspace the mistake(s)
        await sleep(jitter(baseDelay * 2, variance));
        if (stopFlag) return { stopped: true, chars: charsTyped };

        // Count how many chars were typed after the mistake
        const extra = (i + 1 < text.length && text[i] !== text[i]) ? 1 : 0;
        const backspaces = 1 + extra;
        for (let b = 0; b < backspaces; b++) {
          dispatchKey(el, 'keydown', 'Backspace', 'Backspace');
          deleteChar(el);
          dispatchKey(el, 'keyup', 'Backspace', 'Backspace');
          await sleep(jitter(baseDelay * 0.8, variance));
          if (stopFlag) return { stopped: true, chars: charsTyped };
        }

        // Re-type the correct char
        dispatchKey(el, 'keydown', char);
        insertChar(el, char);
        dispatchKey(el, 'keyup', char);
        charsTyped++;
        await sleep(jitter(baseDelay, variance));
      }
      // else: leave typo, continue
    } else {
      dispatchKey(el, 'keydown', char);
      insertChar(el, char);
      dispatchKey(el, 'keyup', char);
      charsTyped++;
      await sleep(jitter(baseDelay, variance));
    }
  }

  return { stopped: false, chars: charsTyped };
}

function findTargetElement() {
  const active = document.activeElement;
  if (!active) return null;
  const tag = active.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return active;
  if (active.isContentEditable) return active;
  return null;
}

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

    const el = findTargetElement();
    if (!el) {
      sendResponse({ error: 'No input focused. Click on a text field on the page first.' });
      return;
    }

    stopFlag    = false;
    typingActive = true;

    typeText(el, msg.config).then(result => {
      typingActive = false;
      if (result.stopped) {
        chrome.runtime.sendMessage({ type: 'TYPING_STOPPED' });
      } else {
        chrome.runtime.sendMessage({ type: 'TYPING_DONE', chars: result.chars });
      }
    });

    sendResponse({ ok: true });
    return true; // keep channel open
  }
});
