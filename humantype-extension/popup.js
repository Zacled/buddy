const sliders = {
  wpm:       { el: null, display: null, fmt: v => `${v} WPM` },
  typo:      { el: null, display: null, fmt: v => `${v}%` },
  fix:       { el: null, display: null, fmt: v => `${v}%` },
  pauseFreq: { el: null, display: null, fmt: v => `${v}%` },
  pauseLen:  { el: null, display: null, fmt: v => `${parseFloat(v).toFixed(1)}s` },
  variance:  { el: null, display: null, fmt: v => ['','Low','Medium','High'][v] },
};

const startBtn   = document.getElementById('startBtn');
const stopBtn    = document.getElementById('stopBtn');
const statusMsg  = document.getElementById('statusMsg');
const statusDot  = document.getElementById('statusDot');
const inputText  = document.getElementById('inputText');

let isTyping = false;

function initSliders() {
  for (const [id, s] of Object.entries(sliders)) {
    s.el      = document.getElementById(id);
    s.display = document.getElementById(id + 'Val');
    s.el.addEventListener('input', () => {
      s.display.textContent = s.fmt(s.el.value);
    });
    s.display.textContent = s.fmt(s.el.value);
  }
}

function getConfig() {
  return {
    wpm:       parseInt(sliders.wpm.el.value),
    typoRate:  parseInt(sliders.typo.el.value) / 100,
    fixRate:   parseInt(sliders.fix.el.value) / 100,
    pauseFreq: parseInt(sliders.pauseFreq.el.value) / 100,
    pauseLen:  parseFloat(sliders.pauseLen.el.value),
    variance:  parseInt(sliders.variance.el.value),
    text:      inputText.value,
  };
}

function setStatus(msg, type = '') {
  statusMsg.textContent = msg;
  statusMsg.className   = 'status' + (type ? ` ${type}` : '');
}

function setDot(state) {
  statusDot.className = 'dot' + (state ? ` ${state}` : '');
}

async function sendToContent(msg) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab');
  return chrome.tabs.sendMessage(tab.id, msg);
}

startBtn.addEventListener('click', async () => {
  const cfg = getConfig();
  if (!cfg.text.trim()) {
    setStatus('Paste some text first.', 'error');
    return;
  }

  isTyping = true;
  startBtn.disabled = true;
  stopBtn.classList.add('visible');
  setDot('typing');
  setStatus('Typing…', 'active');

  try {
    const resp = await sendToContent({ type: 'START_TYPING', config: cfg });
    if (resp && resp.error) {
      setStatus(resp.error, 'error');
      resetUI();
    }
  } catch (e) {
    setStatus('Could not reach the page. Try refreshing it.', 'error');
    resetUI();
  }
});

stopBtn.addEventListener('click', async () => {
  try { await sendToContent({ type: 'STOP_TYPING' }); } catch (_) {}
  resetUI();
  setStatus('Stopped.', '');
});

function resetUI() {
  isTyping = false;
  startBtn.disabled = false;
  stopBtn.classList.remove('visible');
  setDot('');
}

// Listen for completion/stop messages from content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TYPING_DONE') {
    resetUI();
    setStatus(`Done! Typed ${msg.chars} characters.`, 'active');
  } else if (msg.type === 'TYPING_STOPPED') {
    resetUI();
    setStatus('Stopped.', '');
  } else if (msg.type === 'TYPING_ERROR') {
    resetUI();
    setStatus(msg.error, 'error');
  }
});

initSliders();
