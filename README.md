# Chrome Extensions

A collection of small, focused Chrome extensions (Manifest V3).

| Extension | Purpose |
|---|---|
| [site-blocker](site-blocker) | Block a list of sites you choose |
| [tab-renamer](tab-renamer) | Give any tab a custom title |
| [wl-cleaner](wl-cleaner) | Bulk-select and remove videos from your YouTube Watch Later list |

## Installing an extension locally

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the extension's folder (e.g. `site-blocker/`).

---

## site-blocker

**Simple Site Blocker** — block a list of sites you choose.

- Add or remove domains from a blocklist via the popup. Input is normalized (strips `http(s)://`, `www.`, and paths) and saved to `chrome.storage.local`.
- A background service worker listens for storage changes and rebuilds `declarativeNetRequest` rules that redirect blocked domains to a local `blocked.html` page.
- Rules are also rebuilt on install/browser startup so blocking persists across restarts.

**Files:** `background.js`, `blocked.html`, `blocked.js`, `popup.html`, `popup.js`, `popup.css`, `manifest.json`

**Permissions:** `storage`, `declarativeNetRequest`, host access to `<all_urls>` (needed since the user can block any domain).

## tab-renamer

**Tab Renamer** — give any tab a custom title.

- Popup lets you type a new title for the active tab.
- A background service worker tracks original/custom titles per tab (`chrome.storage.session`) and injects a script that sets `document.title` and watches it with a `MutationObserver`, so the custom title survives the page trying to change it back.
- The custom title is reapplied automatically whenever the tab finishes (re)loading, and cleaned up when the tab closes.
- "Reset" restores the page's original title.

**Files:** `background.js`, `popup.html`, `popup.js`, `popup.css`, `manifest.json`, `icons/`

**Permissions:** `storage`, `scripting`, `tabs`, host access to `<all_urls>` (needed for script injection on any site).

## wl-cleaner

**Watch Later Cleaner** — select and bulk-remove videos from your YouTube Watch Later playlist.

- Injects a checkbox onto each video row and a floating control panel on `youtube.com/playlist?list=WL`.
- Panel actions: **Load all** (auto-scrolls to load the full list), **Select all / Clear**, **Select last N**, and **Remove selected** (with a Stop toggle).
- Removal drives YouTube's own row menu ("⋮" → "Remove from…") one video at a time with a randomized delay between each, and tracks total/selected watch time.
- A `MutationObserver` and YouTube's `yt-navigate-finish` SPA event keep the panel in sync as the page re-renders or the user navigates.

**Files:** `content.js`, `panel.css`, `manifest.json`

**Permissions:** `storage` (currently unused, left in as a placeholder for future settings), host access scoped to `https://www.youtube.com/*`.
