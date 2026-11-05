# Tab Renamer

A Chrome extension (Manifest V3) that allows you to assign custom, persistent titles to any browser tab.

---

## Features

- **Custom Tab Titles**: Rename any active tab to easily identify projects, workspaces, or duplicate documentation tabs.
- **MutationObserver Shielding**: Injects a DOM observer directly on the `<title>` element. If a web application (such as Notion, Jira, Slack, or YouTube) attempts to overwrite `document.title` with dynamic updates or unread badges, the extension immediately re-applies your custom title.
- **Reload & Navigation Persistence**: A background service worker listens to `chrome.tabs.onUpdated` events and automatically restores your custom title when the page finishes reloading.
- **Original Title Recovery**: Stores the page's original title in session memory, allowing you to revert to the default title with a single click.
- **Automatic Lifecycle Cleanup**: Automatically purges session state when a tab is closed via `chrome.tabs.onRemoved`.
- **Zero Disk Footprint**: Uses `chrome.storage.session`, ensuring tab renaming state clears cleanly when the browser session terminates.

---

## Architecture

```
tab-renamer/
├── manifest.json       # Manifest V3 configuration, permissions, and icons
├── background.js       # Session state manager, script injector, and tab lifecycle coordinator
├── popup.html          # Lightweight popup user interface
├── popup.js            # Input controller, rename dispatcher, and reset handler
├── popup.css           # Minimal dark styling for the popup dialog
└── icons/              # Extension icons in standard resolutions (16, 32, 48, 128px)
```

---

## Installation

1. Clone or download this repository.
2. In Google Chrome, navigate to `chrome://extensions`.
3. Enable **Developer mode** using the toggle switch in the upper-right corner.
4. Click **Load unpacked** in the top toolbar.
5. Select the `tab-renamer/` directory.

---

## Usage

1. Switch to the tab you wish to rename.
2. Click the **Tab Renamer** icon in the extensions toolbar (or pin it for quick access).
3. Enter your preferred title in the text field.
4. Click **Rename** (or press Enter).
5. To restore the website's original title, reopen the popup and click **Reset**.

---

## Permissions

- `storage`: Uses `chrome.storage.session` to cache tab identifiers and custom titles for the active browser session.
- `scripting`: Dynamically executes content scripts in the target tab to modify and observe `document.title`.
- `tabs`: Queries tab metadata and retrieves initial page titles.
- `<all_urls>` (Host Permissions): Enables title injection across any web domain.

---

## License

MIT License. See root repository for details.
