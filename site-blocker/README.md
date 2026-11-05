# Simple Site Blocker

A lightweight, distraction-free Chrome extension (Manifest V3) to block user-specified websites using the Chrome declarativeNetRequest API.

**Version:** 1.0.0 • **Manifest:** V3

---

## Features

- **Network-Level Blocking**: Uses Chrome's `declarativeNetRequest` dynamic rules to intercept and redirect requests at the network layer before page content loads, ensuring zero CPU overhead on unblocked sites.
- **Persistent Rules**: Dynamic rules are automatically rebuilt on extension installation, update, and browser launch (`onInstalled` and `onStartup`), maintaining persistent protection across restarts.
- **Automatic Domain Normalization**: Automatically strips protocols (`http://`, `https://`), `www.` subdomains, and trailing paths from user input.
- **Custom Blocked Screen**: Redirects blocked requests to an offline, clean local warning page (`blocked.html`) indicating the target site has been restricted.
- **Local Storage**: All site entries are stored strictly on-device in `chrome.storage.local`.

---

## Architecture

```
site-blocker/
├── manifest.json       # Manifest V3 configuration, permissions, and web accessible resources
├── background.js       # Service worker listening for storage updates and managing dynamic rules
├── popup.html          # Clean popup interface for managing the blocklist
├── popup.js            # Input sanitization and storage update handler
├── popup.css           # Styling for the blocklist management popup
├── blocked.html        # Local interstitial warning page for blocked domains
└── blocked.js          # Displays the blocked domain name parsed from the query string
```

---

## Installation

1. Clone or download this repository.
2. In Google Chrome, navigate to `chrome://extensions`.
3. Enable **Developer mode** using the toggle switch in the upper-right corner.
4. Click **Load unpacked** in the top toolbar.
5. Select the `site-blocker/` directory.

---

## Usage

1. Click the **Simple Site Blocker** icon in your Chrome extensions toolbar.
2. Type a domain into the input field (e.g. `example.com`, `news.ycombinator.com`, or `reddit.com`).
3. Press **Enter** or click **Add**.
4. To remove a domain, click the removal button adjacent to the domain in the active list.

---

## Permissions

- `storage`: Persists the list of blocked domains in `chrome.storage.local`.
- `declarativeNetRequest`: Grants programmatic control to register high-priority redirection rules for blocked domains.
- `<all_urls>` (Host Permissions): Required to match and intercept user-specified domains across the web.

---

## License

MIT License. See root repository for details.
