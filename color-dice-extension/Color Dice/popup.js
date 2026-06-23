/* popup.js — shows/sets the blocked colour (synced with the page via chrome.storage).
 * One colour at a time: clicking a colour blocks just that one and drops the rest;
 * clicking the already-blocked colour (or "Clear") blocks nothing. */
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
      statusEl.innerHTML = '🚫 Blocking <b>' + names + '</b> for your next roll. Past rolls keep the colors they were rolled with. Click it again to unblock.';
      statusEl.className = "status on";
    } else {
      statusEl.textContent = "Nothing armed for the next roll. Past rolls keep their colors — use Clear all to reset.";
      statusEl.className = "status";
    }
  }

  // block only the chosen colour for the NEXT roll (replacing whatever was armed);
  // clicking the colour that's already armed un-arms it. Past rolls are untouched.
  function setOnly(color) {
    chrome.storage.local.get("blocked", (c) => {
      const set = normSet(c && c.blocked);
      const next = (set.length === 1 && set[0] === color) ? [] : [color];
      chrome.storage.local.set({ blocked: next });
      render(next);
    });
  }

  // full reset: un-arm AND forget every faked past roll (cdFakes), showing real again
  function clearAll() {
    chrome.storage.local.set({ blocked: [], cdFakes: [] });
    render([]);
  }

  // initial state
  chrome.storage.local.get("blocked", (c) => render(c && c.blocked));

  document.querySelectorAll(".c").forEach((b) => {
    b.addEventListener("click", () => setOnly(b.dataset.c));
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
