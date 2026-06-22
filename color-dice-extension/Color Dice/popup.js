/* popup.js — shows/sets the blocked colour (synced with the page via chrome.storage). */
(function () {
  "use strict";
  const NAMES = { red: "Red", orange: "Orange", gold: "Yellow", green: "Green", blue: "Blue", purple: "Purple" };
  const statusEl = document.getElementById("status");
  const hintEl = document.getElementById("hint");

  function render(blocked) {
    document.querySelectorAll(".c").forEach((b) => b.classList.toggle("on", b.dataset.c === blocked));
    if (blocked) {
      statusEl.innerHTML = '🚫 Blocking <b>' + NAMES[blocked] + '</b> — it will be swapped out on your next roll.';
      statusEl.className = "status on";
    } else {
      statusEl.textContent = "Nothing blocked — every color rolls normally.";
      statusEl.className = "status";
    }
  }

  function setBlocked(color) {
    chrome.storage.local.set({ blocked: color });
    render(color);
  }

  // initial state
  chrome.storage.local.get("blocked", (c) => render((c && c.blocked) || null));

  document.querySelectorAll(".c").forEach((b) => {
    b.addEventListener("click", () => setBlocked(b.dataset.c));
  });
  document.getElementById("none").addEventListener("click", () => setBlocked(null));

  // keep in sync if it changes elsewhere (e.g. number keys on the page)
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === "local" && ch.blocked) render(ch.blocked.newValue || null);
  });

  // tell the user if they're not on the dice page (so "it's not working" is obvious)
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    const onPage = tab && /online-dice\.com\/roll-color-dice/.test(tab.url || "");
    if (!onPage) {
      hintEl.textContent = "Open online-dice.com/roll-color-dice to use this.";
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "ping" }, (resp) => {
      if (chrome.runtime.lastError || !resp) {
        hintEl.textContent = "On the dice page but not connected — refresh the tab once.";
      } else {
        hintEl.textContent = "Connected to the dice page ✓";
      }
    });
  });
})();
