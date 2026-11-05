# Chrome Extensions

A curated collection of focused, lightweight Chrome extensions built on Manifest V3. Each extension is completely self-contained in its own directory with dedicated documentation, configuration, and zero extraneous runtime overhead.

---

## Directory Index

| Extension | Summary | Key Capabilities | Documentation |
|---|---|---|---|
| [kindleflow-extension](kindleflow-extension) | Clean Reader & Kindle Publisher | Gemini AI ad-stripping, diagram preservation, 300 PPI Paperwhite styling, SMTP & direct EPUB 3 export | [Read Guide](kindleflow-extension/README.md) |
| [site-blocker](site-blocker) | Simple Site Blocker | Network-level domain blocking via `declarativeNetRequest` with custom interstitial page | [Read Guide](site-blocker/README.md) |
| [tab-renamer](tab-renamer) | Custom Tab Renamer | Custom tab titles with MutationObserver protection against SPA overwrites and session recovery | [Read Guide](tab-renamer/README.md) |
| [wa-cleaner](wa-cleaner) | WhatsApp Web Bulk Deleter | Keyword-targeted message scanning, back-scrolling history loader, and automated message deletion | [Read Guide](wa-cleaner/README.md) |
| [wl-cleaner](wl-cleaner) | YouTube Watch Later Cleaner | In-page checkboxes, duration analytics, auto-scrolling loader, and automated playlist cleaning | [Read Guide](wl-cleaner/README.md) |

---

## Local Installation

To load any of the extensions locally in Google Chrome:

1. Open `chrome://extensions` in the address bar.
2. Enable **Developer mode** using the toggle switch in the upper-right corner.
3. Click **Load unpacked** in the top toolbar.
4. Select the specific directory of the extension you wish to install (e.g. `kindleflow-extension/` or `site-blocker/`).

*Note for KindleFlow: KindleFlow utilizes a local Python Native Messaging host for AI structuring and EPUB compilation. Run `./install.sh` inside `kindleflow-extension/` prior to use. Refer to the [KindleFlow Documentation](kindleflow-extension/README.md) for details.*

---

## Extensions Overview

### KindleFlow

**1-Click Clean Reader & Kindle Publisher** powered by Mozilla Readability and Google Gemini AI.

- Extracts article text and figures using Mozilla's Readability engine.
- Filters out ads, sponsored sections, clickbait, and cookie banners using Google Gemini AI while intelligently preserving informative diagrams, charts, infographics, and technical tables.
- Automatically generates an executive summary bullet list and formats content with high-contrast typography optimized for Kindle Paperwhite (12th Gen Carta 1300 / 300 PPI).
- Offers 4 instant actions: direct delivery to `@kindle.com` via SMTP, standalone Kindle EPUB download (for zero-credential manual upload via Amazon Send to Kindle), structured Markdown download, or clean offline HTML download.
- Fast multi-threaded pipeline: concurrently downloads inline images with an 8-worker thread pool and renders custom 300 PPI book covers during the AI network stream (~2–3s builds).
- Resilient background worker: operations run via a background service worker so tasks continue uninterrupted even if the user clicks away from the popup.
- Runs strictly on-demand via a local Python Native Messaging host (zero idle memory footprint).

**Files:** `popup.html`, `popup.js`, `background.js`, `native_host.py`, `install.sh`, `requirements.txt`, `manifest.json`, `libs/Readability.js`, `core/package_epub.py`, `core/generate_cover.py`, `core/send_to_kindle.py`, `core/style.css`, `icons/`

**Permissions:** `activeTab`, `scripting`, `nativeMessaging`, `storage`, `downloads`, `notifications`.

---

### Simple Site Blocker

**Lightweight Domain Blocker** built on Chrome's `declarativeNetRequest` API.

- Add or remove domains from a blocklist via the popup. Input is automatically normalized (strips `http(s)://`, `www.`, and paths) and saved to `chrome.storage.local`.
- A background service worker listens for storage changes and rebuilds `declarativeNetRequest` rules that redirect blocked domains to a local `blocked.html` page.
- Rules are rebuilt on extension install and browser startup (`onInstalled` and `onStartup`), maintaining persistent protection across restarts.
- Executes directly at the browser network layer with zero runtime CPU overhead on unblocked domains.

**Files:** `background.js`, `blocked.html`, `blocked.js`, `popup.html`, `popup.js`, `popup.css`, `manifest.json`

**Permissions:** `storage`, `declarativeNetRequest`, host access to `<all_urls>` (required to intercept specified domains).

---

### Tab Renamer

**Dynamic Tab Renamer** with DOM mutation protection.

- Popup allows assigning custom titles to any active tab.
- A background service worker tracks original and custom titles per tab in `chrome.storage.session`.
- Injects a script that sets `document.title` and attaches a `MutationObserver` to ensure custom titles survive Single Page Application title updates (such as unread counters or dynamic routing).
- Custom titles are reapplied automatically whenever a tab finishes reloading and cleaned up when the tab closes.
- "Reset" restores the original title.

**Files:** `background.js`, `popup.html`, `popup.js`, `popup.css`, `manifest.json`, `icons/`

**Permissions:** `storage`, `scripting`, `tabs`, host access to `<all_urls>`.

---

### WhatsApp Web Bulk Deleter

**Automated Message Deleter** for WhatsApp Web conversations.

- Adds a floating control panel on `web.whatsapp.com` (toggle with the floating launcher or `Alt+Shift+D`).
- Enter a search term, optionally configure case sensitivity or restrict to "only my messages".
- Scan modes: "Scan" counts matches in the visible viewport; "Load full history" automatically scrolls up with randomized pacing to fetch older messages first.
- Deletion loop drives WhatsApp Web's native interface (context menu > "Delete" > "Delete for me") one message at a time with randomized human-like delays to prevent rate limits.
- Features real-time progress indicators and an immediate "Stop" control.

**Files:** `background.js`, `content.js`, `panel.css`, `manifest.json`

**Permissions:** `storage`, host access scoped to `https://web.whatsapp.com/*`.

---

### Watch Later Cleaner

**Bulk Removal & Analytics Tool** for YouTube Watch Later playlists.

- Injects custom checkboxes onto each video row and mounts a floating control panel on `youtube.com/playlist?list=WL`.
- Actions: "Load all" (auto-scrolls to load complete playlist), "Select all / Clear", "Select last N", and "Remove selected".
- Calculates and displays total playlist watch duration alongside total duration of selected items.
- Removal drives YouTube's native action menu (`⋮` > "Remove from Watch later") one video at a time with randomized delays.
- Resilient against YouTube's Single Page Application navigation via `MutationObserver` and `yt-navigate-finish` event listeners.

**Files:** `content.js`, `panel.css`, `manifest.json`

**Permissions:** `storage`, host access scoped to `https://www.youtube.com/*`.

---

## License

This project is licensed under the MIT License.
