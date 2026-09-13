# Tab Autopsy

A Manifest V3 browser extension that buries idle tabs instead of leaving them
open — and captures *why* each one mattered, so the graveyard is searchable
by content and intent, not just by title.

## Install (unpacked, for testing)

1. Open `chrome://extensions` (or `edge://extensions` in Edge — both are
   Chromium and this loads unmodified).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Pin the extension from the puzzle-piece menu so its icon stays visible.

No build step, no npm install — this is plain JS/HTML/CSS, load it as-is.

## How it works

- **`background.js`** (the service worker) tracks when each tab was last
  active. Once a minute (`chrome.alarms`) it sweeps all windows: any tab
  that's been idle past the configured timeout — and isn't the tab you're
  currently looking at — gets buried.
- Right before a tab is buried, `chrome.scripting.executeScript` grabs a
  short snippet from the page itself (meta description, or the first real
  paragraph) so the graveyard entry says *what the page was about*, not just
  its URL. This fails silently on restricted pages (`chrome://`, the Web
  Store, etc.) — those still get buried, just without a snippet.
- Tabs buried in the same sweep share a `batchId`, so if you had five tabs
  open for one piece of research, they resurface grouped together as
  "Buried together" rather than five unrelated rows.
- Each entry gets a `deathType` ("died young" / "quiet death" / "natural
  causes" / "old age") based on how long the tab was open before it was
  buried — pure flavor, but it's a cheap, honest signal for how throwaway
  vs. long-lived a tab was.
- Everything lives in `chrome.storage.local` (with `unlimitedStorage`
  requested so the graveyard isn't capped at the default 5MB). No network
  calls, no external services — it's fully local.
- The popup (`popup.html/js/css`) reads the graveyard, filters it live
  against the search box (title + snippet + URL), and lets you restore
  (opens the URL, removes it from the graveyard) or delete individual
  entries. The two quick-action buttons close live tabs in the current
  window — they don't touch the graveyard.
- `options.html/js` configures idle timeout, whether pinned tabs are exempt,
  auto-purge age, and a domain exclude-list (e.g. mail/docs you never want
  auto-buried).

## Known limitations worth knowing about before you ship this further

- Snippet capture needs `host_permissions: <all_urls>` and won't work on
  pages Chrome blocks extensions from touching (chrome://, the Web Store,
  most PDF viewers) — those tabs still bury fine, just with no preview text.
- Search is a plain substring match over title/snippet/URL, not real
  full-text/fuzzy search. Fine at hundreds of entries; if the graveyard
  grows into the thousands you'd want an actual index (e.g. a tiny inverted
  index kept alongside the array, or move storage to IndexedDB).
- There's no sync across devices — `chrome.storage.local` is per-machine.
  `chrome.storage.sync` would fix that but has much smaller size quotas,
  so a real cross-device version would need a different storage strategy
  for the graveyard specifically.
- No onboarding/first-run explanation in this build — first-time users hit
  the popup cold. Worth a one-time tooltip or first-run page before a public
  release.
