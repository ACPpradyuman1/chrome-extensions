# KindleFlow: 1-Click Clean Reader & Kindle Publisher

> Transform web articles, deep-dives, and documentation into publication-grade Kindle e-books, clean Markdown, or distraction-free HTML.

**Version:** 1.1.0 • **Manifest:** V3 • **Kindle Target:** Paperwhite (12th Gen Carta 1300 / 300 PPI)

KindleFlow is an open-source Chrome extension (Manifest V3) paired with an on-demand Python native host. It combines Mozilla Readability with Google Gemini AI to strip ads, sponsored blocks, and junk while strictly preserving informative diagrams, charts, infographics, and technical tables. The result is compiled into high-contrast e-books tuned specifically for Kindle Paperwhite (12th Gen Carta 1300 / 300 PPI) and modern e-readers.

---

## Features

- **1-Click Smart Extraction**: Instantly extracts article content, metadata, read time, and media using Mozilla's Readability engine.
- **Dual Processing Modes**:
  - **Google AI Enhanced Mode**: Uses Gemini Flash to strip ads, sponsored links, cookie popups, and clickbait while intelligently detecting and preserving data charts, diagrams, and code snippets. Automatically generates an executive summary.
  - **Direct Clean Mode (Zero Google Processing)**: Bypasses cloud AI completely. Generates clean Markdown or clean HTML directly inside your browser in 5 milliseconds with zero network requests to Google, zero API keys required, and 100% offline privacy.
- **Kindle Paperwhite (12th Gen) Typography**: Tuned for Carta 1300 E-Ink screens (300 PPI), including dark-mode-safe SVGs/charts, readable code blocks, and custom-styled tables.
- **Automatic 300 PPI Book Covers**: Generates a high-resolution, publisher-style book cover with clean typography and color palettes during the build.
- **Asynchronous & Resilient**: Native processing runs via a background service worker; closing or clicking away from the popup will not interrupt the pipeline.
- **Fast Multi-Threaded Pipeline**: Uses a concurrent thread pool (`ThreadPoolExecutor`) to download article images in parallel while generating the cover concurrently during Gemini's network stream (~2–3 second builds).
- **Zero Idle Footprint**: The Python native host runs strictly on-demand and terminates immediately upon task completion. No background daemons or memory overhead.
- **100% Free & Private**: Runs locally on your machine with Google Gemini's free-tier API or purely offline. No subscriptions, third-party proxies, or tracking.

---

## Actions

| Action | Description | Output |
|---|---|---|
| **Send to Kindle** | Sends the compiled, cover-illustrated EPUB directly to your Kindle device via SMTP. | Delivered to `@kindle.com` inbox |
| **Download Kindle EPUB** | Generates a standalone, validated EPUB 3 file for drag-and-drop onto Amazon Send to Kindle (zero email credentials needed). | `.epub` file in Downloads |
| **Download Markdown** | Exports clean, structured GitHub-Flavored Markdown (with Gemini executive summary or in direct offline mode without Google processing). | `.md` file in Downloads |
| **Download Clean HTML** | Exports standalone clean HTML with embedded reader typography and media for offline reading or archiving (zero Google processing in direct mode). | `.html` file in Downloads |

---

## Google Gemini API (100% Free Tier)

KindleFlow uses Google's official Gemini Flash model for intelligent ad removal, diagram preservation, and executive takeaways.

- **Completely Free**: Google AI Studio provides free API keys with no credit card required.
- **Where to Get Your Key**: Generate a free API key at **[Google AI Studio](https://aistudio.google.com/app/apikey)**.
- **Generous Free Quota**: The free tier includes **15 Requests Per Minute (RPM)** and **1,500 Requests Per Day** on `gemini-flash-lite-latest` and `gemini-flash-latest`. This is more than sufficient to process dozens of long-form articles, technical whitepapers, and book chapters every day at zero cost ($0.00).
- **Optional Use**: If you do not wish to use an API key or prefer not to send article text to Google, simply toggle off **Google AI Processing** in the popup to use **Direct Clean Mode** (powered offline by Mozilla Readability).

---

## Architecture

```
kindleflow-extension/
├── manifest.json              # Chrome Manifest V3 configuration & permissions
├── popup.html                 # Sleek dark-mode extension popup UI with AI toggle
├── popup.js                   # UI controller, client-side Markdown/HTML exporter, & job worker
├── background.js              # Service worker managing persistent native messaging
├── install.sh                 # 1-click native host installer for macOS and Linux
├── install.bat                # 1-click native host installer for Windows
├── run_host.sh                # Isolated native host launcher script
├── native_host.py             # Native messaging bridge & Gemini AI orchestrator
├── requirements.txt           # Python dependencies
├── libs/
│   └── Readability.js         # Mozilla Readability engine for DOM extraction
├── core/
│   ├── generate_cover.py      # 300 PPI Pillow cover generator
│   ├── package_epub.py        # EPUB 3 compiler with Carta 1300 e-ink CSS
│   ├── send_to_kindle.py      # Secure SMTP client for Kindle email delivery
│   └── style.css              # Typography & layout stylesheet for e-readers
└── icons/                     # Extension branding icons (16, 48, 128px)
```

---

## Getting Started

### Prerequisites

1. Google Chrome (or Chromium-based browser like Brave or Edge).
2. Python 3.8+.
3. *(Optional)* A Google Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey) for AI cleaning.

---

### Step 1: Run the 1-Click Setup Script

Open your terminal, navigate to the extension directory, and run the automated installer:

```bash
cd kindleflow-extension
./install.sh
```

*(On Windows, simply double-click `install.bat`).*

This single automated command:
- Verifies Python 3 and automatically resolves and installs required dependencies in an isolated environment.
- Configures the native host launcher.
- Automatically registers the native messaging host across all detected Chromium browsers (Chrome, Brave, Edge, Chromium, Arc, Vivaldi).
- Automatically copies the extension directory path directly to your clipboard.

---

### Step 2: Load the Extension in Chrome

1. Open `chrome://extensions` in your browser.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked** in the top toolbar.
4. Select the `kindleflow-extension/` directory (or press Cmd+Shift+G / Ctrl+V to paste the path copied from Step 1).

---

### Step 3: Configure Settings

1. Click the KindleFlow icon in your Chrome toolbar.
2. Click the Settings icon in the top header.
3. Paste your Gemini API Key from [Google AI Studio](https://aistudio.google.com/app/apikey).
4. *(Optional)* If using direct email delivery via SMTP:
   - Enter your Kindle Email (`your_device@kindle.com`).
   - Enter your Sender Email (`your_email@gmail.com`).
   - Note: If you prefer zero credentials, simply click **Download Kindle EPUB** and drop the file onto https://www.amazon.com/sendtokindle.
5. Click **Save Settings**.

---

## Technical Details

1. **Extraction**: When the popup opens on any webpage, `Readability.js` inspects the DOM and isolates the primary article container, stripping extraneous scripts and stylesheets.
2. **AI Editorial Filtering vs. Direct Offline Mode**:
   - In **AI Mode**, content and image metadata are sent to Gemini Flash. The model strips sponsors, paywalls, and decorative icons, formats tabular data into Markdown, embeds informative diagrams, and crafts an executive summary.
   - In **Direct Mode**, Mozilla Readability data is converted client-side into clean Markdown or standalone responsive HTML in milliseconds without contacting Google servers.
3. **Parallel Pipeline**:
   - The native host spins up a worker thread to pre-generate a 300 PPI book cover using Pillow while Gemini streams the cleaned text over the network.
   - All inline diagrams and images identified by Gemini are fetched concurrently using 8 parallel worker threads.
4. **EPUB 3 Compilation**: `ebooklib` packages the text, cover, stylesheets, and downloaded images into an EPUB 3 document conforming to modern e-reader specifications.
5. **Delivery / Download**: The output is either dispatched to Amazon's Whispernet SMTP servers or passed back through Chrome's native messaging bridge to trigger a native download and desktop notification.

---

## Security & Privacy

- **No Remote Telemetry**: The extension connects solely to Google Gemini API (using your own private key) and Amazon's SMTP servers (if configured). In Direct Mode, zero network requests are made.
- **Local Native Messaging**: Chrome Native Messaging uses standard input/output (`stdio`) locally on your machine with strict origin verification bound to the extension ID.
- **Credential Storage**: Settings are stored exclusively in Chrome's sandboxed `chrome.storage.local`.

---

## License

MIT License. See root repository for details.
