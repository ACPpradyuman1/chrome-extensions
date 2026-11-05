# WhatsApp Web Bulk Deleter

A Chrome extension (Manifest V3) that provides automated, keyword-targeted bulk deletion of messages on WhatsApp Web.

---

## Features

- **Keyword Matching**: Search and delete messages in the active chat matching specific words, phrases, or regex-like terms.
- **Configurable Filters**:
  - **Case Sensitivity**: Toggle exact case matching or case-insensitive search.
  - **Sender Scoping**: Option to restrict deletion strictly to your own sent messages.
- **History Back-Scroller**: Built-in "Load full history" mode that scrolls up through past messages with randomized pacing to load older conversation segments before deletion.
- **Safe Native UI Automation**: Drives WhatsApp Web's native interface (hover, menu selection, "Delete", and "Delete for me") sequentially with human-like randomized delays to avoid rate-limiting or interface desynchronization.
- **Live Control & Safety**:
  - Live progress counter and visual status indicators.
  - Instant **Stop** toggle to safely halt processing at any moment.
- **Keyboard Shortcut**: Open or close the floating panel at any time using `Alt+Shift+D`.
- **Remembered Preferences**: Persists your last keyword and configuration choices via `chrome.storage.local`.

---

## Architecture

```
wa-cleaner/
├── manifest.json       # Manifest V3 configuration, keyboard shortcuts, and host permissions
├── background.js       # Service worker routing keyboard shortcut commands to active tabs
├── content.js          # Injected controller handling UI panel, chat scanning, and deletion loop
└── panel.css           # Styling for the floating controller panel and visual highlight markers
```

---

## Installation

1. Clone or download this repository.
2. In Google Chrome, navigate to `chrome://extensions`.
3. Enable **Developer mode** using the toggle switch in the upper-right corner.
4. Click **Load unpacked** in the top toolbar.
5. Select the `wa-cleaner/` directory.

---

## Usage

1. Open WhatsApp Web at https://web.whatsapp.com and open the target conversation.
2. Click the floating cleaner button in the top corner or press `Alt+Shift+D` to display the control panel.
3. Enter your keyword into the search field.
4. Select optional filters (e.g. "Case-sensitive" or "Only my messages").
5. Choose your execution mode:
   - Click **Scan** to inspect the currently visible chat window.
   - Click **Load full history** to automatically scroll up and preload older conversation logs.
6. Click **Delete matches** to start the sequential deletion process.
7. Click **Stop** at any time to pause or terminate the operation.

---

## Permissions & Scope

- `storage`: Retains user filter preferences between sessions.
- Host Permissions scoped strictly to `https://web.whatsapp.com/*`. No access to external domains or telemetry.

---

## Disclaimer

This extension interacts with WhatsApp Web via DOM inspection and automated UI clicks. Because WhatsApp Web's underlying markup and class structures update periodically, element selectors are written on robust role and aria attributes. Always verify your matched message count before confirming deletion.

---

## License

MIT License. See root repository for details.
