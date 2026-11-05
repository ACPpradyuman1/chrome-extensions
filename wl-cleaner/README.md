# Watch Later Cleaner

A Chrome extension (Manifest V3) to select, calculate watch time for, and bulk-remove videos from your YouTube Watch Later playlist.

---

## Features

- **In-Page Checkbox Integration**: Injects custom selection checkboxes directly alongside each video row on YouTube's Watch Later playlist page.
- **Bulk Selection Tools**:
  - **Select All / Clear**: One-click toggling for all loaded items.
  - **Select Last N**: Target the oldest N videos in the playlist (e.g. the last 20 or 50 additions).
- **Auto-Scroll Playlist Loader**: Built-in "Load all" action that automatically scrolls the playlist container to populate all videos into the DOM before performing selections.
- **Watch Time Analytics**: Parses video durations from the page and calculates both total playlist duration and total selected duration in hours and minutes.
- **Safe Native UI Automation**: Drives YouTube's native action menu (`⋮` > "Remove from Watch later") sequentially with randomized micro-delays to prevent interface dropouts or rate-limiting.
- **Interruptible Processing**: Includes an immediate **Stop** control to safely pause or end deletion mid-batch.
- **SPA Event Lifecycle**: Listens to YouTube's internal `yt-navigate-finish` events and uses `MutationObserver` to maintain synchronization across client-side page transitions.

---

## Architecture

```
wl-cleaner/
├── manifest.json       # Manifest V3 configuration and YouTube URL match patterns
├── content.js          # Injected logic for playlist traversal, time calculation, and menu automation
└── panel.css           # Dark-themed floating control panel styled to match YouTube's interface
```

---

## Installation

1. Clone or download this repository.
2. In Google Chrome, navigate to `chrome://extensions`.
3. Enable **Developer mode** using the toggle switch in the upper-right corner.
4. Click **Load unpacked** in the top toolbar.
5. Select the `wl-cleaner/` directory.

---

## Usage

1. Navigate to your YouTube Watch Later playlist at https://www.youtube.com/playlist?list=WL.
2. The control panel will automatically mount in the upper-right corner of the window.
3. Click **Load all** if you have a large playlist and wish to fetch all entries beyond initial viewport limits.
4. Use the selection checkboxes manually, click **Select all**, or specify a number in **Select last N**.
5. Review the calculated selection duration in the stats bar.
6. Click **Remove selected** to begin the sequential removal.
7. Click **Stop** at any point to cancel remaining items.

---

## Permissions & Scope

- `storage`: Retains user configuration if needed.
- Host Permissions scoped strictly to `https://www.youtube.com/*`. No access to personal data, browsing history on other sites, or remote endpoints.

---

## License

MIT License. See root repository for details.
