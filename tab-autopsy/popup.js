let allEntries = [];

function groupByBatch(entries) {
  const order = [];
  const groups = {};
  for (const e of entries) {
    if (!groups[e.batchId]) {
      groups[e.batchId] = [];
      order.push(e.batchId);
    }
    groups[e.batchId].push(e);
  }
  return order.map((id) => ({ batchId: id, entries: groups[id] }));
}

function matches(entry, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    (entry.title || "").toLowerCase().includes(q) ||
    (entry.snippet || "").toLowerCase().includes(q) ||
    (entry.url || "").toLowerCase().includes(q)
  );
}

function render() {
  const query = document.getElementById("search").value.trim();
  const filtered = allEntries.filter((e) => matches(e, query));

  const list = document.getElementById("list");
  const empty = document.getElementById("empty");
  list.innerHTML = "";

  document.getElementById("caseCount").textContent =
    `${allEntries.length} interred`;

  if (filtered.length === 0) {
    empty.style.display = "block";
    empty.textContent = query
      ? "No buried tab matches that search."
      : "Nothing buried yet. Tabs left idle past the configured time end up here — search still works after they're gone.";
    return;
  }
  empty.style.display = "none";

  const batchTpl = document.getElementById("batchTemplate");
  const entryTpl = document.getElementById("entryTemplate");

  for (const group of groupByBatch(filtered)) {
    const batchNode = batchTpl.content.cloneNode(true);
    const label = batchNode.querySelector(".batch-label");
    const buriedAt = group.entries[0].buriedAt;
    label.textContent = group.entries.length > 1
      ? `Buried together — ${relativeTime(buriedAt)}`
      : `Buried ${relativeTime(buriedAt)}`;

    const container = batchNode.querySelector(".batch-entries");
    for (const entry of group.entries) {
      const node = entryTpl.content.cloneNode(true);
      const img = node.querySelector(".favicon");
      img.src = entry.favicon || "icons/icon16.png";
      img.onerror = () => { img.src = "icons/icon16.png"; };

      node.querySelector(".entry-title").textContent = entry.title || entry.url;
      node.querySelector(".entry-title").title = entry.url;
      node.querySelector(".entry-snippet").textContent =
        entry.snippet || "No preview captured for this page.";
      node.querySelector(".death-tag").textContent = entry.deathType;
      node.querySelector(".buried-ago").textContent =
        `lived ${formatLifespan(entry.lifespanMs)}`;

      node.querySelector(".restore").addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "restoreTab", id: entry.id }, () => load());
      });
      node.querySelector(".delete").addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "deleteEntry", id: entry.id }, () => load());
      });

      container.appendChild(node);
    }
    list.appendChild(batchNode);
  }
}

function load() {
  chrome.storage.local.get(STORAGE_KEYS.GRAVEYARD, (res) => {
    allEntries = (res[STORAGE_KEYS.GRAVEYARD] || []).sort((a, b) => b.buriedAt - a.buriedAt);
    render();
  });
}

document.getElementById("search").addEventListener("input", render);

document.getElementById("closeAll").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "closeAll" });
});

document.getElementById("closeAllExcept").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "closeAllExceptCurrent" });
});

document.getElementById("clearAll").addEventListener("click", () => {
  if (allEntries.length === 0) return;
  chrome.runtime.sendMessage({ type: "clearGraveyard" }, () => load());
});

document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

load();
