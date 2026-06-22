/* popup.js — shows/sets the blocked colours (synced with the page via chrome.storage).
 * Blocks accumulate: clicking a colour toggles it; multiple can be blocked at once. */
(function () {
  "use strict";
  const NAMES = { red: "Red", orange: "Orange", gold: "Yellow", green: "Green", blue: "Blue", purple: "Purple" };
  const ORDER = ["red", "orange", "gold", "green", "blue", "purple"];
  const statusEl = document.getElementById("status");
  const hintEl = document.getElementById("hint");

  // accept legacy single-string storage too, and always return a fresh array
  function normSet(v) {
    if (Array.isArray(v)) return v.filter((c) => ORDER.indexOf(c) !== -1);
    if (typeof v === "string" && v) return ORDER.indexOf(v) !== -1 ? [v] : [];
    return [];
  }

  function render(set) {
    set = normSet(set);
    document.querySelectorAll(".c").forEach((b) => b.classList.toggle("on", set.indexOf(b.dataset.c) !== -1));
    if (set.length) {
      const names = ORDER.filter((c) => set.indexOf(c) !== -1).map((c) => NAMES[c]).join(", ");
      statusEl.innerHTML = '🚫 Blocking <b>' + names + '</b> — swapped out on your next roll. Click again to unblock.';
      statusEl.className = "status on";
    } else {
      statusEl.textContent = "Nothing blocked — every color rolls normally.";
      statusEl.className = "status";
    }
  }

  function toggle(color) {
    chrome.storage.local.get("blocked", (c) => {
      const set = normSet(c && c.blocked);
      const i = set.indexOf(color);
      if (i === -1) set.push(color); else set.splice(i, 1);
      chrome.storage.local.set({ blocked: set });
      render(set);
    });
  }

  function clearAll() {
    chrome.storage.local.set({ blocked: [] });
    render([]);
  }

  // initial state
  chrome.storage.local.get("blocked", (c) => render(c && c.blocked));

  document.querySelectorAll(".c").forEach((b) => {
    b.addEventListener("click", () => toggle(b.dataset.c));
  });
  document.getElementById("none").addEventListener("click", clearAll);

  // keep in sync if it changes elsewhere (e.g. number keys on the page)
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === "local" && ch.blocked) render(ch.blocked.newValue);
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
