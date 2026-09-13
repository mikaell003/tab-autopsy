// common.js — shared constants + helpers (loaded via importScripts in the
// service worker, and as a plain <script> in popup/options).

const DEFAULT_SETTINGS = {
  idleMinutes: 30,
  autoPurgeDays: 30,
  autoPurgeEnabled: true,
  excludedDomains: [],
  ignorePinned: true
};

const STORAGE_KEYS = {
  SETTINGS: "settings",
  GRAVEYARD: "graveyard",
  ACTIVITY: "activity"
};

// Classify how a tab died, based on how long it lived before burial.
function classifyDeath(lifespanMs) {
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  if (lifespanMs < 5 * MIN) return "died young";
  if (lifespanMs < HOUR) return "quiet death";
  if (lifespanMs < DAY) return "natural causes";
  return "old age";
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return "";
  }
}

function isExcluded(url, excludedDomains) {
  const host = hostnameOf(url);
  if (!host) return false;
  return excludedDomains.some((d) => d && (host === d || host.endsWith("." + d)));
}

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  if (diff < MIN) return "just now";
  if (diff < HOUR) return Math.floor(diff / MIN) + "m ago";
  if (diff < DAY) return Math.floor(diff / HOUR) + "h ago";
  const days = Math.floor(diff / DAY);
  if (days < 30) return days + "d ago";
  return new Date(ts).toLocaleDateString();
}

function formatLifespan(ms) {
  const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  if (ms < MIN) return "under a minute";
  if (ms < HOUR) return Math.round(ms / MIN) + " min";
  if (ms < DAY) return Math.round(ms / HOUR) + " hr";
  return Math.round(ms / DAY) + " days";
}

// Node/importScripts compatibility isn't needed here; both contexts can see
// these as globals since we load this file before the others.
