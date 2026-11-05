# KindleFlow: 1-Click Clean Reader & Kindle Publisher

> Transform web articles, deep-dives, and documentation into publication-grade Kindle e-books, clean Markdown, or distraction-free HTML.

KindleFlow is an open-source Chrome extension (Manifest V3) paired with an on-demand Python native host. It combines Mozilla Readability with Google Gemini AI to strip ads, sponsored blocks, and junk while strictly preserving informative diagrams, charts, infographics, and technical tables. The result is compiled into high-contrast e-books tuned specifically for Kindle Paperwhite (12th Gen Carta 1300 / 300 PPI) and modern e-readers.

---

## Features

- **1-Click Smart Extraction**: Instantly extracts article content, metadata, read time, and media using Mozilla's Readability engine.
- **Gemini AI Content Curation**: Leverages Google Gemini Flash to eliminate ads, newsletter popups, cookie disclaimers, and clickbait while intelligently detecting and preserving data charts, architectural diagrams, and screenshots.
- **Executive Summary**: Automatically generates a concise 2–3 bullet takeaway section directly under the title.
- **Kindle Paperwhite (12th Gen) Typography**: Tuned for Carta 1300 E-Ink screens (300 PPI), including dark-mode-safe SVGs/charts, readable code blocks, and custom-styled tables.
- **Automatic 300 PPI Book Covers**: Generates a high-resolution, publisher-style book cover with clean typography and color palettes during the build.
- **Asynchronous & Resilient**: Native processing runs via a background service worker; closing or clicking away from the popup will not interrupt the pipeline.
- **Fast Multi-Threaded Pipeline**: Uses a concurrent thread pool (`ThreadPoolExecutor`) to download article images in parallel while generating the cover concurrently during Gemini's network stream (~2–3 second builds).
- **Zero Idle Footprint**: The Python native host runs strictly on-demand and terminates immediately upon task completion. No background daemons or memory overhead.
- **Local & Private**: Runs entirely locally on your machine with Google Gemini's free-tier API. No subscriptions, third-party proxies, or telemetry.

---

## Actions

| Action | Description | Output |
|---|---|---|
| **Send to Kindle** | Sends the compiled, cover-illustrated EPUB directly to your Kindle device via SMTP. | Delivered to `@kindle.com` inbox |
| **Download Kindle EPUB** | Generates a standalone, validated EPUB 3 file for drag-and-drop onto Amazon Send to Kindle (zero email credentials needed). | `.epub` file in Downloads |
| **Download Markdown** | Exports clean, structured GitHub-Flavored Markdown with the Gemini executive summary and preserved images. | `.md` file in Downloads |
| **Download Clean HTML** | Exports standalone clean HTML with typography and media embedded for offline reading or archiving. | `.html` file in Downloads |

---

## Architecture

```
kindleflow-extension/
├── manifest.json              # Chrome Manifest V3 configuration & permissions
├── popup.html                 # Sleek dark-mode extension popup UI
├── popup.js                   # UI handler & background job communicator
├── background.js              # Service worker managing persistent native messaging
├── install.sh                 # Native host installer for macOS and Linux
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
2. Python 3.8+ with `pip`.
3. A Google Gemini API key from Google AI Studio (available on the free tier).

---

### Step 1: Install Python Dependencies

Open your terminal and install the required packages:

```bash
cd kindleflow-extension
pip3 install -r requirements.txt
```

---

### Step 2: Register the Native Messaging Host

Run the included installer to register the native messaging host with Google Chrome:

```bash
./install.sh
```

This creates the native messaging manifest in `~/Library/Application Support/Google/Chrome/NativeMessagingHosts` on macOS or `~/.config/google-chrome/NativeMessagingHosts` on Linux.

---

### Step 3: Load the Extension in Chrome

1. In Chrome, navigate to `chrome://extensions`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select the `kindleflow-extension/` directory.

---

### Step 4: Configure Settings

1. Click the KindleFlow icon in your Chrome toolbar.
2. Click the Settings icon in the top header.
3. Paste your Gemini API Key from Google AI Studio.
4. *(Optional)* If using direct email delivery via SMTP:
   - Enter your Kindle Email (`your_device@kindle.com`).
   - Enter your Sender Email (`your_email@gmail.com`).
   - Note: If you prefer zero credentials, simply click **Download Kindle EPUB** and drop the file onto https://www.amazon.com/sendtokindle.
5. Click **Save Settings**.

---

## Technical Details

1. **Extraction**: When the popup opens on any webpage, `Readability.js` inspects the DOM and isolates the primary article container, stripping extraneous scripts and stylesheets.
2. **AI Editorial Filtering**: If a Gemini API key is configured, content and image metadata are sent to Gemini Flash. The model strips sponsors, paywalls, and decorative icons, formats tabular data into Markdown, embeds informative diagrams, and crafts an executive summary. If no API key is provided, a heuristic Markdown cleaner is used as a fallback.
3. **Parallel Pipeline**:
   - The native host spins up a worker thread to pre-generate a 300 PPI book cover using Pillow while Gemini streams the cleaned text over the network.
   - All inline diagrams and images identified by Gemini are fetched concurrently using 8 parallel worker threads.
4. **EPUB 3 Compilation**: `ebooklib` packages the text, cover, stylesheets, and downloaded images into an EPUB 3 document conforming to modern e-reader specifications.
5. **Delivery / Download**: The output is either dispatched to Amazon's Whispernet SMTP servers or passed back through Chrome's native messaging bridge to trigger a native download and desktop notification.

---

## Security & Privacy

- **No Remote Telemetry**: The extension connects solely to Google Gemini API (using your own private key) and Amazon's SMTP servers (if configured).
- **Local Native Messaging**: Chrome Native Messaging uses standard input/output (`stdio`) locally on your machine with strict origin verification bound to the extension ID.
- **Credential Storage**: Settings are stored exclusively in Chrome's sandboxed `chrome.storage.local`.

---

## License

MIT License. See root repository for details.
