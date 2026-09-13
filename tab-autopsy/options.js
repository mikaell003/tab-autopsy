const DEFAULTS = {
  idleMinutes: 30,
  autoPurgeDays: 30,
  autoPurgeEnabled: true,
  excludedDomains: [],
  ignorePinned: true
};

function load() {
  chrome.storage.local.get("settings", (res) => {
    const s = { ...DEFAULTS, ...(res.settings || {}) };
    document.getElementById("idleMinutes").value = String(s.idleMinutes);
    document.getElementById("ignorePinned").checked = s.ignorePinned;
    document.getElementById("autoPurgeEnabled").checked = s.autoPurgeEnabled;
    document.getElementById("autoPurgeDays").value = String(s.autoPurgeDays);
    document.getElementById("excludedDomains").value = (s.excludedDomains || []).join("\n");
  });
}

document.getElementById("save").addEventListener("click", () => {
  const settings = {
    idleMinutes: Number(document.getElementById("idleMinutes").value),
    ignorePinned: document.getElementById("ignorePinned").checked,
    autoPurgeEnabled: document.getElementById("autoPurgeEnabled").checked,
    autoPurgeDays: Number(document.getElementById("autoPurgeDays").value),
    excludedDomains: document.getElementById("excludedDomains").value
      .split("\n")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  };
  chrome.storage.local.set({ settings }, () => {
    const note = document.getElementById("savedNote");
    note.textContent = "Saved.";
    setTimeout(() => (note.textContent = ""), 2000);
  });
});

load();
