# Chrome Extensions

A collection of small, focused Chrome extensions (Manifest V3).

| Extension | Purpose |
|---|---|
| [kindleflow-extension](kindleflow-extension) | 1-Click Clean Reader: Strip ads, preserve diagrams, and compile to Kindle EPUB / Markdown / HTML |
| [site-blocker](site-blocker) | Block a list of sites you choose |
| [tab-renamer](tab-renamer) | Give any tab a custom title |
| [wl-cleaner](wl-cleaner) | Bulk-select and remove videos from your YouTube Watch Later list |
| [wa-cleaner](wa-cleaner) | Bulk-delete WhatsApp Web messages matching a keyword |

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

## wa-cleaner

**WhatsApp Web Bulk Deleter** — bulk-delete WhatsApp Web messages matching a keyword.

- Adds a floating button + panel on `web.whatsapp.com` (toggle with the button or the `Alt+Shift+D` shortcut — Chrome reserves `Ctrl+F` for native page search, so it can't be used here).
- Enter a keyword, optionally restrict to case-sensitive or "only my messages", then **Scan** to count matches in the currently loaded chat or **Load full history** to scroll up and load older messages first.
- **Delete matches** drives WhatsApp's own per-message menu (hover → "⋮" → "Delete" → "Delete for me") one message at a time with a randomized delay between each, and can be stopped mid-run.
- Uses "Delete for me" (removes from your view only) rather than "Delete for everyone", since the latter only works on your own messages within WhatsApp's short edit window.
- WhatsApp Web's DOM/class names change frequently and aren't a stable public API — selectors here are best-effort (role/aria-label/text based) and may need updating if WhatsApp changes its UI.

**Files:** `background.js`, `content.js`, `panel.css`, `manifest.json`

**Permissions:** `storage` (remembers your last keyword/options), host access scoped to `https://web.whatsapp.com/*`.

## kindleflow-extension

**KindleFlow** — 1-click clean reader and Kindle publisher powered by Mozilla Readability and Google Gemini AI.

- Extracts article text and figures using Mozilla's Readability engine.
- Filters out ads, sponsored sections, clickbait, and cookie banners using Google Gemini AI while intelligently preserving informative diagrams, charts, infographics, and technical tables.
- Automatically generates an executive summary bullet list and formats content with high-contrast typography optimized for Kindle Paperwhite (12th Gen Carta 1300 / 300 PPI).
- Offers 4 instant actions: direct delivery to `@kindle.com` via SMTP, standalone Kindle EPUB download (for zero-credential manual upload via [amazon.com/sendtokindle](https://www.amazon.com/sendtokindle)), structured Markdown download, or clean offline HTML download.
- Fast multi-threaded pipeline: concurrently downloads inline images with an 8-worker thread pool and renders custom 300 PPI book covers during the AI network stream (~2–3s builds).
- Resilient background worker: operations run via a background service worker so tasks continue uninterrupted even if the user clicks away from the popup.
- Runs strictly on-demand via a local Python Native Messaging host (zero idle memory footprint).

**Files:** `popup.html`, `popup.js`, `background.js`, `native_host.py`, `install.sh`, `requirements.txt`, `manifest.json`, `libs/Readability.js`, `core/package_epub.py`, `core/generate_cover.py`, `core/send_to_kindle.py`, `core/style.css`, `icons/`

**Permissions:** `activeTab`, `scripting`, `nativeMessaging`, `storage`, `downloads`, `notifications`.
