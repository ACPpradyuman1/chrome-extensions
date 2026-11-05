// KindleFlow Popup Script
// Communicates with background.js so tasks survive clicking away

let currentArticle = null;
let currentTab = null;

document.addEventListener("DOMContentLoaded", async () => {
  // Load saved settings
  const stored = await chrome.storage.local.get(["geminiApiKey", "kindleEmail", "senderEmail", "useGemini"]);
  if (stored.geminiApiKey) document.getElementById("cfg-gemini-key").value = stored.geminiApiKey;
  if (stored.kindleEmail) document.getElementById("cfg-kindle-email").value = stored.kindleEmail;
  if (stored.senderEmail) document.getElementById("cfg-sender-email").value = stored.senderEmail;

  // Mode Toggle (Google AI vs Direct Offline)
  const toggleGemini = document.getElementById("toggle-gemini");
  const modeTitle = document.getElementById("mode-title");
  const modeDesc = document.getElementById("mode-desc");

  function updateModeUI(enabled) {
    toggleGemini.checked = enabled;
    if (enabled) {
      modeTitle.textContent = "Google AI Processing";
      modeDesc.textContent = "Ad stripping, key takeaways & charts";
    } else {
      modeTitle.textContent = "Direct Clean Mode";
      modeDesc.textContent = "Zero Google processing • 100% offline";
    }
  }

  const isGeminiActive = stored.useGemini !== false; // Default: true
  updateModeUI(isGeminiActive);

  toggleGemini.addEventListener("change", async () => {
    const active = toggleGemini.checked;
    await chrome.storage.local.set({ useGemini: active });
    updateModeUI(active);
  });

  // Toggle Settings Panel
  document.getElementById("btn-toggle-settings").addEventListener("click", () => {
    const p = document.getElementById("settings-panel");
    p.style.display = p.style.display === "block" ? "none" : "block";
  });

  // Save Settings
  document.getElementById("btn-save-settings").addEventListener("click", async () => {
    const key = document.getElementById("cfg-gemini-key").value.trim();
    const kEmail = document.getElementById("cfg-kindle-email").value.trim();
    const sEmail = document.getElementById("cfg-sender-email").value.trim();
    await chrome.storage.local.set({ geminiApiKey: key, kindleEmail: kEmail, senderEmail: sEmail });
    showToast("Settings saved successfully!", "success");
    document.getElementById("settings-panel").style.display = "none";
  });

  // Check background service worker for active job
  chrome.runtime.sendMessage({ type: "GET_JOB_STATUS" }, (job) => {
    if (chrome.runtime.lastError || !job) return;
    if (job.status === "running") {
      document.getElementById("progress-box").style.display = "block";
      document.getElementById("actions-group").style.opacity = "0.4";
      disableButtons(true);
      setProgressStep(job.step, "active");
      updateLog(job.message || "Processing in background...");
    } else if (job.status === "done") {
      document.getElementById("progress-box").style.display = "block";
      setProgressStep("dispatch", "completed");
      updateLog(job.message || "Complete!");
      document.getElementById("progress-spinner").textContent = "✅";
    }
  });

  // Listen for live updates from background worker
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "JOB_UPDATE") {
      if (msg.status === "running") {
        document.getElementById("progress-box").style.display = "block";
        document.getElementById("actions-group").style.opacity = "0.4";
        disableButtons(true);
        if (msg.step === "gemini") {
          setProgressStep("extract", "completed");
          setProgressStep("gemini", "active");
        } else if (msg.step === "package") {
          setProgressStep("gemini", "completed");
          setProgressStep("package", "active");
        } else if (msg.step === "dispatch") {
          setProgressStep("package", "completed");
          setProgressStep("dispatch", "active");
        }
        updateLog(msg.message || "Working...");
      } else if (msg.status === "done") {
        setProgressStep("dispatch", "completed");
        updateLog(msg.message || "Finished!");
        document.getElementById("progress-spinner").textContent = "✅";
        showToast("✅ " + (msg.message || "Done!"), "success");
        setTimeout(() => {
          disableButtons(false);
          document.getElementById("actions-group").style.opacity = "1";
        }, 1500);
      } else if (msg.status === "error") {
        updateLog("Error: " + msg.message);
        showToast(msg.message, "error");
        disableButtons(false);
        document.getElementById("actions-group").style.opacity = "1";
      }
    }
  });

  // Inspect Active Tab
  await analyzeActiveTab();

  // Button Listeners
  document.getElementById("btn-send-kindle").addEventListener("click", () => handleAction("kindle"));
  document.getElementById("btn-download-epub").addEventListener("click", () => handleAction("epub"));
  document.getElementById("btn-download-md").addEventListener("click", () => handleAction("markdown"));
  document.getElementById("btn-download-html").addEventListener("click", () => handleAction("html"));
});

async function analyzeActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;

    if (!tab || !tab.url || tab.url.startsWith("chrome://")) {
      document.getElementById("article-site").textContent = "RESTRICTED PAGE";
      document.getElementById("article-title").textContent = "Cannot clip internal Chrome pages. Navigate to any article or website.";
      disableButtons(true);
      return;
    }

    const domain = new URL(tab.url).hostname.replace(/^www\./, "");
    document.getElementById("article-site").textContent = domain;

    // Inject extraction script into active tab
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageDataInTab
    });

    if (results && results[0] && results[0].result) {
      currentArticle = results[0].result;
      document.getElementById("article-title").textContent = currentArticle.title || tab.title;
      const wordCount = currentArticle.textContent ? currentArticle.textContent.trim().split(/\s+/).length : 0;
      document.getElementById("article-words").textContent = `~${wordCount.toLocaleString()} words`;
      document.getElementById("article-images").textContent = `${currentArticle.images ? currentArticle.images.length : 0} images`;
      disableButtons(false);
    } else {
      document.getElementById("article-title").textContent = tab.title;
      disableButtons(false);
    }
  } catch (err) {
    console.error("Tab analysis error:", err);
    document.getElementById("article-site").textContent = "BROWSER ERROR";
    document.getElementById("article-title").textContent = "Could not inspect page: " + err.message;
  }
}

// Executed inside active tab
function extractPageDataInTab() {
  const title = document.title || "";
  const url = window.location.href;
  const hostname = window.location.hostname;

  const imgElements = Array.from(document.querySelectorAll("img, picture img"));
  const images = [];
  const seenSrcs = new Set();

  for (const img of imgElements) {
    let src = img.currentSrc || img.src || img.getAttribute("data-src") || img.getAttribute("data-original") || img.getAttribute("data-lazy-src") || img.getAttribute("data-highres");
    if (!src || src.startsWith("data:") || src.length < 5) continue;

    // Ensure absolute URL
    if (!src.startsWith("http://") && !src.startsWith("https://")) {
      try { src = new URL(src, window.location.href).href; } catch(e) {}
    }

    if (seenSrcs.has(src)) continue;
    seenSrcs.add(src);

    const rect = img.getBoundingClientRect();
    const width = img.naturalWidth || rect.width || 0;
    const height = img.naturalHeight || rect.height || 0;

    // Discard tiny icons / tracking pixels (< 80px)
    if (width > 0 && height > 0 && (width < 80 || height < 80)) continue;

    images.push({
      src: src,
      alt: img.alt || "",
      title: img.title || "",
      width: Math.round(width),
      height: Math.round(height)
    });
  }

  // Broad article selector covering WordPress, Substack, Medium, Ghost, News sites
  let mainEl = document.querySelector("article, [role='main'], main, .post-content, .article-content, .article-body, .article__content, .entry-content, .story-body, #content, .content, .single-post");
  if (!mainEl || (mainEl.innerText && mainEl.innerText.trim().length < 300)) {
    mainEl = document.body;
  }

  return {
    title: title,
    url: url,
    hostname: hostname,
    html: mainEl.innerHTML,
    textContent: mainEl.innerText || "",
    images: images
  };
}

function disableButtons(disabled) {
  document.getElementById("btn-send-kindle").disabled = disabled;
  document.getElementById("btn-download-epub").disabled = disabled;
  document.getElementById("btn-download-md").disabled = disabled;
  document.getElementById("btn-download-html").disabled = disabled;
}

function setProgressStep(stepName, status) {
  const el = document.getElementById(`step-${stepName}`);
  if (!el) return;

  el.classList.remove("active", "completed");
  if (status === "active") el.classList.add("active");
  if (status === "completed") el.classList.add("completed");
}

function updateLog(text) {
  const el = document.getElementById("live-log");
  el.textContent = text;
}

function showToast(msg, type = "success") {
  const t = document.getElementById("toast-banner");
  t.textContent = msg;
  t.className = `toast toast-${type}`;
  t.style.display = "block";
  setTimeout(() => {
    t.style.display = "none";
  }, 5000);
}

async function handleAction(actionType) {
  if (!currentArticle) {
    showToast("No article content extracted.", "error");
    return;
  }

  const isGeminiActive = document.getElementById("toggle-gemini").checked;

  // Direct offline export for Markdown and HTML (Zero Google processing)
  if (!isGeminiActive && actionType === "markdown") {
    const md = htmlToCleanMarkdown(currentArticle.html, currentArticle.title, currentArticle.url, currentArticle.hostname);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(blob);
    const filename = `${sanitizeSlug(currentArticle.title)}.md`;
    chrome.downloads.download({ url: downloadUrl, filename: filename, saveAs: false });
    showToast("Downloaded clean Markdown without Google processing!", "success");
    return;
  }

  if (!isGeminiActive && actionType === "html") {
    const cleanHtml = generateCleanHtmlDoc(currentArticle.html, currentArticle.title, currentArticle.url, currentArticle.hostname);
    const blob = new Blob([cleanHtml], { type: "text/html;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(blob);
    const filename = `${sanitizeSlug(currentArticle.title)}.html`;
    chrome.downloads.download({ url: downloadUrl, filename: filename, saveAs: false });
    showToast("Downloaded clean HTML without Google processing!", "success");
    return;
  }

  const stored = await chrome.storage.local.get(["geminiApiKey", "kindleEmail", "senderEmail"]);
  const apiKey = (stored.geminiApiKey || "").trim();

  // Show progress box
  document.getElementById("progress-box").style.display = "block";
  document.getElementById("actions-group").style.opacity = "0.4";
  disableButtons(true);

  setProgressStep("extract", "completed");
  setProgressStep("gemini", "active");
  updateLog(isGeminiActive ? "Delegating task to background worker..." : "Packaging offline EPUB in background...");

  const payload = {
    action: actionType,
    title: currentArticle.title,
    url: currentArticle.url,
    hostname: currentArticle.hostname,
    html: currentArticle.html,
    textContent: currentArticle.textContent,
    images: currentArticle.images,
    geminiApiKey: apiKey,
    skipGemini: !isGeminiActive,
    kindleEmail: (stored.kindleEmail || "").trim(),
    senderEmail: (stored.senderEmail || "").trim()
  };

  // Delegate directly to background.js so it survives closing/clicking away!
  chrome.runtime.sendMessage({
    type: "START_JOB",
    payload: payload
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Background message error:", chrome.runtime.lastError);
      showToast("Error starting job: " + chrome.runtime.lastError.message, "error");
      disableButtons(false);
      document.getElementById("actions-group").style.opacity = "1";
    }
  });
}

function sanitizeSlug(text) {
  return (text || "article")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[-\s]+/g, "-")
    .slice(0, 45);
}

function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function htmlToCleanMarkdown(html, title, url, hostname) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  function walk(node) {
    if (!node) return "";
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent.replace(/\s+/g, " ");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const tag = node.tagName.toLowerCase();

    if (["script", "style", "noscript", "svg", "button", "nav", "footer"].includes(tag)) {
      return "";
    }

    let children = Array.from(node.childNodes).map(walk).join("");

    switch (tag) {
      case "h1": return `\n\n# ${children.trim()}\n\n`;
      case "h2": return `\n\n## ${children.trim()}\n\n`;
      case "h3": return `\n\n### ${children.trim()}\n\n`;
      case "h4": return `\n\n#### ${children.trim()}\n\n`;
      case "h5": case "h6": return `\n\n##### ${children.trim()}\n\n`;
      case "p": return `\n\n${children.trim()}\n\n`;
      case "strong": case "b": return `**${children.trim()}**`;
      case "em": case "i": return `*${children.trim()}*`;
      case "code":
        return node.parentElement && node.parentElement.tagName.toLowerCase() === "pre"
          ? node.textContent
          : `\`${children.trim()}\``;
      case "pre": return `\n\n\`\`\`\n${node.textContent.trim()}\n\`\`\`\n\n`;
      case "blockquote": return `\n\n> ${children.trim().replace(/\n/g, "\n> ")}\n\n`;
      case "ul": return `\n\n${children}\n\n`;
      case "ol": return `\n\n${children}\n\n`;
      case "li": return `- ${children.trim()}\n`;
      case "hr": return `\n\n---\n\n`;
      case "br": return `\n`;
      case "a": {
        const href = node.getAttribute("href");
        return href && children.trim() ? `[${children.trim()}](${href})` : children;
      }
      case "img": {
        const src = node.getAttribute("src") || node.getAttribute("data-src");
        const alt = node.getAttribute("alt") || "Image";
        return src ? `\n\n![${alt}](${src})\n\n` : "";
      }
      default:
        return children;
    }
  }

  let bodyMd = walk(doc.body).replace(/\n{3,}/g, "\n\n").trim();
  const dateStr = new Date().toISOString().split("T")[0];
  const frontmatter = `---\ntitle: "${(title || "").replace(/"/g, '\\"')}"\nsource: "${url}"\nsite: "${hostname}"\ndate: "${dateStr}"\ncleaner: "KindleFlow Direct (Offline)"\n---\n\n`;
  return frontmatter + `# ${title}\n\n` + bodyMd;
}

function generateCleanHtmlDoc(cleanBodyHtml, title, url, hostname) {
  const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Georgia, serif;
      line-height: 1.7;
      color: #1a1a1a;
      max-width: 780px;
      margin: 40px auto;
      padding: 0 24px;
      background: #fafafa;
    }
    header {
      margin-bottom: 32px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e0e0e0;
    }
    h1 {
      font-size: 2.2rem;
      line-height: 1.25;
      margin-bottom: 12px;
      color: #111;
    }
    .meta {
      font-size: 0.9rem;
      color: #666;
    }
    .meta a { color: #3b82f6; text-decoration: none; }
    article img {
      max-width: 100%;
      height: auto;
      border-radius: 6px;
      margin: 20px auto;
      display: block;
    }
    article p { margin-bottom: 1.4em; font-size: 1.08rem; }
    article h2, article h3 { margin-top: 1.6em; margin-bottom: 0.6em; }
    article blockquote {
      border-left: 3px solid #c6a869;
      margin: 20px 0;
      padding-left: 16px;
      color: #444;
      font-style: italic;
    }
    article pre {
      background: #24292e;
      color: #f6f8fa;
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
    }
    article code { font-family: monospace; font-size: 0.92em; }
    article table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    article th, article td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    article th { background: #f0f0f0; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      Published from <strong>${escapeHtml(hostname)}</strong> • Saved on ${dateStr} • 
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener">Original Article</a>
    </div>
  </header>
  <article>
    ${cleanBodyHtml}
  </article>
</body>
</html>`;
}
