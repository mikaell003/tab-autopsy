importScripts("common.js");

const SWEEP_ALARM = "tabAutopsy:sweep";
const PURGE_ALARM = "tabAutopsy:purge";

// ---- storage helpers -------------------------------------------------

async function getSettings() {
  const { [STORAGE_KEYS.SETTINGS]: settings } = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

async function getActivity() {
  const { [STORAGE_KEYS.ACTIVITY]: activity } = await chrome.storage.local.get(STORAGE_KEYS.ACTIVITY);
  return activity || {};
}

async function setActivity(activity) {
  await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVITY]: activity });
}

async function getGraveyard() {
  const { [STORAGE_KEYS.GRAVEYARD]: graveyard } = await chrome.storage.local.get(STORAGE_KEYS.GRAVEYARD);
  return graveyard || [];
}

async function setGraveyard(graveyard) {
  await chrome.storage.local.set({ [STORAGE_KEYS.GRAVEYARD]: graveyard });
  updateBadge(graveyard.length);
}

function updateBadge(count) {
  chrome.action.setBadgeBackgroundColor({ color: "#C9A227" });
  chrome.action.setBadgeTextColor && chrome.action.setBadgeTextColor({ color: "#14171A" });
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
}

// ---- activity tracking --------------------------------------------
// activity[tabId] = { lastActive: ms, opened: ms }

async function touchTab(tabId, opts = {}) {
  if (tabId == null || tabId < 0) return;
  const activity = await getActivity();
  const now = Date.now();
  const existing = activity[tabId] || { opened: now };
  activity[tabId] = {
    opened: existing.opened || now,
    lastActive: now,
    ...opts
  };
  await setActivity(activity);
}

async function forgetTab(tabId) {
  const activity = await getActivity();
  if (activity[tabId]) {
    delete activity[tabId];
    await setActivity(activity);
  }
}

chrome.tabs.onCreated.addListener((tab) => {
  touchTab(tab.id);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  touchTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    // navigation counts as fresh intent
    touchTab(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  forgetTab(tabId);
});

// ---- capturing a snapshot of a tab before burial -------------------

async function captureSnapshot(tab) {
  let snippet = "";
  try {
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const meta = document.querySelector('meta[name="description"]') ||
                     document.querySelector('meta[property="og:description"]');
        if (meta && meta.content) return meta.content.trim().slice(0, 220);
        const p = Array.from(document.querySelectorAll("p"))
          .map((el) => el.innerText.trim())
          .find((t) => t.length > 40);
        return (p || "").slice(0, 220);
      }
    });
    snippet = result || "";
  } catch (e) {
    // restricted page (chrome://, web store, pdf viewer, etc.) — no snippet available
    snippet = "";
  }
  return snippet;
}

// ---- the sweep: find idle tabs, bury them --------------------------

async function sweep() {
  const settings = await getSettings();
  const idleMs = settings.idleMinutes * 60 * 1000;
  const activity = await getActivity();
  const now = Date.now();

  const windows = await chrome.windows.getAll({ populate: true });

  // Refresh "lastActive" for whichever tab is currently focused in each window,
  // so the tab someone is actually looking at is never buried out from under them.
  for (const win of windows) {
    const activeTab = win.tabs.find((t) => t.active);
    if (activeTab) {
      const existing = activity[activeTab.id] || { opened: now };
      activity[activeTab.id] = { opened: existing.opened || now, lastActive: now };
    }
  }
  await setActivity(activity);

  const toBury = [];
  for (const win of windows) {
    for (const tab of win.tabs) {
      if (tab.active) continue;
      if (settings.ignorePinned && tab.pinned) continue;
      if (isExcluded(tab.url || "", settings.excludedDomains)) continue;
      if (!tab.url || tab.url.startsWith("chrome-extension://")) continue;

      const rec = activity[tab.id];
      const lastActive = rec ? rec.lastActive : now;
      if (now - lastActive >= idleMs) {
        toBury.push({ tab, windowId: win.id, opened: rec ? rec.opened : now, lastActive });
      }
    }
  }

  if (toBury.length === 0) return;

  const batchId = `${now}-${Math.random().toString(36).slice(2, 8)}`;
  const graveyard = await getGraveyard();

  for (const entry of toBury) {
    const { tab, opened } = entry;
    const snippet = await captureSnapshot(tab);
    const lifespanMs = now - opened;
    graveyard.unshift({
      id: `${tab.id}-${now}-${Math.random().toString(36).slice(2, 6)}`,
      batchId,
      windowId: entry.windowId,
      url: tab.url,
      title: tab.title || tab.url,
      favicon: tab.favIconUrl || "",
      snippet,
      openedAt: opened,
      buriedAt: now,
      lifespanMs,
      deathType: classifyDeath(lifespanMs)
    });
    try {
      await chrome.tabs.remove(tab.id);
    } catch (e) {
      // tab may have already closed itself
    }
    await forgetTab(tab.id);
  }

  await setGraveyard(graveyard);
}

// ---- auto-purge of very old graveyard entries ----------------------

async function purgeOld() {
  const settings = await getSettings();
  if (!settings.autoPurgeEnabled) return;
  const cutoff = Date.now() - settings.autoPurgeDays * 24 * 60 * 60 * 1000;
  const graveyard = await getGraveyard();
  const kept = graveyard.filter((r) => r.buriedAt >= cutoff);
  if (kept.length !== graveyard.length) {
    await setGraveyard(kept);
  }
}

// ---- alarms ----------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
  chrome.alarms.create(SWEEP_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(PURGE_ALARM, { periodInMinutes: 60 * 12 });
  // seed activity for tabs already open
  const tabs = await chrome.tabs.query({});
  const now = Date.now();
  const activity = {};
  for (const t of tabs) activity[t.id] = { opened: now, lastActive: now };
  await setActivity(activity);
  const graveyard = await getGraveyard();
  updateBadge(graveyard.length);
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(SWEEP_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(PURGE_ALARM, { periodInMinutes: 60 * 12 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SWEEP_ALARM) sweep();
  if (alarm.name === PURGE_ALARM) purgeOld();
});

// ---- messages from popup/options -------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === "restoreTab") {
      const graveyard = await getGraveyard();
      const rec = graveyard.find((r) => r.id === msg.id);
      if (rec) {
        await chrome.tabs.create({ url: rec.url });
        const remaining = graveyard.filter((r) => r.id !== msg.id);
        await setGraveyard(remaining);
      }
      sendResponse({ ok: true });
    } else if (msg.type === "deleteEntry") {
      const graveyard = await getGraveyard();
      const remaining = graveyard.filter((r) => r.id !== msg.id);
      await setGraveyard(remaining);
      sendResponse({ ok: true });
    } else if (msg.type === "clearGraveyard") {
      await setGraveyard([]);
      sendResponse({ ok: true });
    } else if (msg.type === "closeAll") {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const ids = tabs.filter((t) => !t.pinned).map((t) => t.id);
      if (ids.length) await chrome.tabs.remove(ids);
      sendResponse({ ok: true });
    } else if (msg.type === "closeAllExceptCurrent") {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const ids = tabs.filter((t) => !t.active && !t.pinned).map((t) => t.id);
      if (ids.length) await chrome.tabs.remove(ids);
      sendResponse({ ok: true });
    } else if (msg.type === "sweepNow") {
      await sweep();
      sendResponse({ ok: true });
    }
  })();
  return true; // keep the message channel open for the async response
});
