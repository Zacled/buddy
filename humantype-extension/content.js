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

let stopFlag     = false;
let typingActive = false;
let lastFocusedEl = null;

// Track focus so we know where to type after the popup steals it
document.addEventListener('focusin', (e) => {
  const tag = e.target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) {
    lastFocusedEl = e.target;
  }
}, true);

// ── Target detection ─────────────────────────────────────────────────────────
//
// Google Docs' key-capture iframe runs at about:blank so all_frames+<all_urls>
// never injects into it. Instead: stay in the main frame, reach into the iframe
// via same-origin contentDocument, and call execCommand on THAT document.

function getGDocsIframeDoc() {
  const iframe = document.querySelector('.docs-texteventtarget-iframe');
  if (!iframe) return null;
  try { return iframe.contentDocument || null; } catch (_) { return null; }
}

function resolveTarget() {
  const gdoc = getGDocsIframeDoc();
  if (gdoc) return { kind: 'gdocs', doc: gdoc };

  const el = lastFocusedEl || document.activeElement;
  if (!el) return null;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || el.isContentEditable) {
    return { kind: 'standard', el };
  }
  return null;
}

// ── Insert / delete ───────────────────────────────────────────────────────────

function doInsert(target, char) {
  if (target.kind === 'gdocs') {
    const ta = target.doc.querySelector('textarea');
    if (ta) ta.focus();
    target.doc.execCommand('insertText', false, char);
  } else {
    const el = target.el;
    if (el.isContentEditable) {
      document.execCommand('insertText', false, char);
    } else {
      const s = el.selectionStart;
      el.value = el.value.slice(0, s) + char + el.value.slice(el.selectionEnd);
      el.selectionStart = el.selectionEnd = s + 1;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' }));
    }
  }
}

function doDelete(target) {
  if (target.kind === 'gdocs') {
    const ta = target.doc.querySelector('textarea');
    if (ta) ta.focus();
    target.doc.execCommand('delete', false);
  } else {
    const el = target.el;
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

// ── Main typing loop ─────────────────────────────────────────────────────────

async function typeText(target, config) {
  const { wpm, typoRate, fixRate, pauseFreq, pauseLen, variance, text } = config;
  const baseDelay = 60000 / (wpm * 5);

  if (target.kind === 'gdocs') {
    const ta = target.doc.querySelector('textarea');
    if (ta) ta.focus();
  } else {
    target.el.focus();
  }

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
      const wrong = getNeighbor(char) || char;
      doInsert(target, wrong);
      charsTyped++;

      await sleep(jitter(baseDelay * 1.5, variance));
      if (stopFlag) return { stopped: true, chars: charsTyped };

      if (Math.random() < 0.4 && i + 1 < text.length) {
        doInsert(target, text[i + 1]);
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
          doDelete(target);
          await sleep(jitter(baseDelay * 0.8, variance));
          if (stopFlag) return { stopped: true, chars: charsTyped };
        }

        doInsert(target, char);
        charsTyped++;
        await sleep(jitter(baseDelay, variance));
      }
    } else {
      doInsert(target, char);
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
    if (typingActive) { sendResponse({ error: 'Already typing.' }); return; }

    const target = resolveTarget();
    if (!target) {
      sendResponse({ error: 'Click inside the Google Doc or a text field first.' });
      return;
    }

    stopFlag     = false;
    typingActive = true;
    sendResponse({ ok: true });

    typeText(target, msg.config).then(result => {
      typingActive = false;
      chrome.runtime.sendMessage({
        type: result.stopped ? 'TYPING_STOPPED' : 'TYPING_DONE',
        chars: result.chars,
      });
    });

    return true;
  }
});
