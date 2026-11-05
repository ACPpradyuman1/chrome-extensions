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

  // If settings not yet in Chrome storage, fetch from native host's local config
  if (!stored.geminiApiKey) {
    try {
      const port = chrome.runtime.connectNative("com.kindleflow.host");
      port.onMessage.addListener((msg) => {
        if (msg.step === "config" && msg.geminiApiKey) {
          chrome.storage.local.set({
            geminiApiKey: msg.geminiApiKey,
            kindleEmail: msg.kindleEmail || "",
            senderEmail: msg.senderEmail || ""
          });
          const keyInput = document.getElementById("cfg-gemini-key");
          if (keyInput) keyInput.value = msg.geminiApiKey;
          const kindleInput = document.getElementById("cfg-kindle-email");
          if (kindleInput) kindleInput.value = msg.kindleEmail || "";
          const senderInput = document.getElementById("cfg-sender-email");
          if (senderInput) senderInput.value = msg.senderEmail || "";
        }
        port.disconnect();
      });
      port.postMessage({ action: "get_config" });
    } catch (e) {}
  }

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
    try {
      const port = chrome.runtime.connectNative("com.kindleflow.host");
      port.postMessage({
        action: "save_config",
        geminiApiKey: key,
        kindleEmail: kEmail,
        senderEmail: sEmail
      });
      setTimeout(() => port.disconnect(), 500);
    } catch (e) {}
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

    if (!tab || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
      document.getElementById("article-site").textContent = "RESTRICTED PAGE";
      document.getElementById("article-title").textContent = "Cannot clip internal browser pages. Navigate to any article or website.";
      disableButtons(true);
      return;
    }

    const domain = new URL(tab.url).hostname.replace(/^www\./, "");
    document.getElementById("article-site").textContent = domain;

    // First inject Mozilla Readability into the active tab
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["libs/Readability.js"]
      });
    } catch (injectErr) {
      console.warn("Readability injection notice:", injectErr);
    }

    // Run extraction logic inside tab
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
  const url = window.location.href;
  const hostname = window.location.hostname;
  let title = document.title || "";
  let byline = "";
  let subtitle = "";
  let leadImage = "";

  // 1. Extract metadata before DOM manipulation
  try {
    const metaTitle = document.querySelector('meta[property="og:title"], meta[name="twitter:title"]');
    if (metaTitle && metaTitle.content) title = metaTitle.content.trim();

    const metaAuthor = document.querySelector('meta[name="author"], meta[property="article:author"], meta[name="twitter:creator"], .nws-author, .author, .byline, [rel="author"]');
    if (metaAuthor) {
      byline = metaAuthor.content || metaAuthor.innerText || "";
      byline = byline.replace(/^by\s+/i, "").trim();
    }

    const metaSub = document.querySelector('.nws-strap, .article-strap, .subtitle, .entry-subtitle, meta[name="description"], meta[property="og:description"]');
    if (metaSub) {
      subtitle = (metaSub.innerText || metaSub.content || "").trim();
    }

    const leadImgEl = document.querySelector('.nws-single-featured-img, .featured-image img, .hero-image img, .hero img, .article-hero img, [data-hero] img, meta[property="og:image"]');
    if (leadImgEl) {
      let src = leadImgEl.content || leadImgEl.currentSrc || leadImgEl.src || leadImgEl.getAttribute('data-src') || "";
      if (src && !src.startsWith("data:") && src.length > 5) {
        try { leadImage = new URL(src, window.location.href).href; } catch(e) { leadImage = src; }
      }
    }
  } catch (e) {}

  // 2. Clone document for clean pruning
  const docClone = document.cloneNode(true);

  // 3. Remove all known site chrome, modals, navigation, comments, and recommendation carousels
  const junkSelectors = [
    'script', 'style', 'noscript', 'iframe', 'input', 'button', 'form', 'select', 'textarea',
    'nav', 'footer', 'aside',
    '.modal', '[role="dialog"]', '[aria-modal="true"]', '[aria-hidden="true"]', '.popup', '.overlay',
    '.explore-panel-container', '.explore-second-panel-container',
    '.comment-panel-container', '.comments', '.comment-container', '[class*="comment-"]', '[id*="comment"]',
    '.story-homepage-container', '#newsletter-recommendation-container',
    '[class*="recommendation"]', '[id*="recommendation"]',
    '[class*="related-"]', '[id*="related-"]', '[class*="recirc"]', '[class*="read-next"]',
    '[class*="share-"]', '[class*="social-share"]',
    '#corporate_ip_details',
    '.email-nudge-container', '[role="bfo-web-hide"]', '.footer-link', '.footer-logo',
    '.email-header-3', '.newsletter-callout', '.whitelisting-modal'
  ];

  for (const sel of junkSelectors) {
    try {
      docClone.querySelectorAll(sel).forEach(el => el.remove());
    } catch(e) {}
  }

  // Remove elements with inline display:none or hidden attribute
  try {
    docClone.querySelectorAll('*').forEach(el => {
      const style = el.getAttribute('style') || '';
      const s = style.toLowerCase().replace(/\s+/g, '');
      if (s.includes('display:none') || s.includes('visibility:hidden') || el.hasAttribute('hidden')) {
        el.remove();
      }
    });
  } catch(e) {}

  // 4. Run Mozilla Readability on the sanitized clone
  let article = null;
  if (typeof Readability !== "undefined") {
    try {
      const reader = new Readability(docClone, {
        keepClasses: false,
        charThreshold: 150
      });
      article = reader.parse();
    } catch (e) {
      console.warn("Readability parse error:", e);
    }
  }

  let cleanHtml = "";
  let textContent = "";

  if (article && article.content && article.content.trim().length > 200) {
    title = article.title || title;
    byline = article.byline || byline;
    cleanHtml = article.content;
    textContent = article.textContent || "";
  } else {
    // Robust fallback if Readability yields nothing
    const mainEl = docClone.querySelector('.db-post-content, .content-wrapper, .entry-content, .post-content, .article-content, .article__content, .article-body, .story-content, main, [role="main"]') || docClone.body;
    cleanHtml = mainEl ? mainEl.innerHTML : "";
    textContent = mainEl ? (mainEl.innerText || mainEl.textContent || "") : "";
  }

  // Post-clean: Ensure no lingering promo paywalls or empty headers in cleanHtml
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = cleanHtml;
  tempDiv.querySelectorAll('.email-nudge-container, [role="bfo-web-hide"], .footer-link, .footer-logo, .newsletter-callout, .whitelisting-modal').forEach(el => el.remove());
  cleanHtml = tempDiv.innerHTML;
  textContent = tempDiv.innerText || textContent;

  // 5. Extract images strictly from the clean article body
  const images = [];
  const seenSrcs = new Set();

  if (leadImage && !leadImage.includes("default") && !leadImage.includes("logo") && !leadImage.includes("icon")) {
    seenSrcs.add(leadImage);
    images.push({
      src: leadImage,
      alt: title,
      title: title,
      width: 1200,
      height: 675
    });
  }

  const imgElements = Array.from(tempDiv.querySelectorAll("img, picture img"));
  for (const img of imgElements) {
    let src = img.currentSrc || img.src || img.getAttribute("data-src") || img.getAttribute("data-original") || img.getAttribute("data-lazy-src") || img.getAttribute("data-highres");
    if (!src || src.startsWith("data:") || src.length < 5) continue;

    try { src = new URL(src, window.location.href).href; } catch(e) {}

    const lowerSrc = src.toLowerCase();
    if (lowerSrc.includes("divider") || lowerSrc.includes("icon") || lowerSrc.includes("pixel") || lowerSrc.includes("tracker") || lowerSrc.includes("loader")) {
      continue;
    }

    if (seenSrcs.has(src)) continue;
    seenSrcs.add(src);

    images.push({
      src: src,
      alt: img.alt || "",
      title: img.title || "",
      width: parseInt(img.width) || 800,
      height: parseInt(img.height) || 600
    });
  }

  return {
    title: title,
    byline: byline,
    subtitle: subtitle,
    leadImage: leadImage,
    url: url,
    hostname: hostname,
    html: cleanHtml,
    textContent: textContent,
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
    const md = htmlToCleanMarkdown(
      currentArticle.html,
      currentArticle.title,
      currentArticle.url,
      currentArticle.hostname,
      currentArticle.byline,
      currentArticle.subtitle,
      currentArticle.leadImage
    );
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(blob);
    const filename = `${sanitizeSlug(currentArticle.title)}.md`;
    chrome.downloads.download({ url: downloadUrl, filename: filename, saveAs: false });
    showToast("Downloaded clean Markdown without Google processing!", "success");
    return;
  }

  if (!isGeminiActive && actionType === "html") {
    const cleanHtml = generateCleanHtmlDoc(
      currentArticle.html,
      currentArticle.title,
      currentArticle.url,
      currentArticle.hostname,
      currentArticle.byline,
      currentArticle.subtitle,
      currentArticle.leadImage
    );
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
    byline: currentArticle.byline,
    subtitle: currentArticle.subtitle,
    leadImage: currentArticle.leadImage,
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

function htmlToCleanMarkdown(html, title, url, hostname, byline = "", subtitle = "", leadImage = "") {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  function walk(node) {
    if (!node) return "";
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent.replace(/\s+/g, " ");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const tag = node.tagName.toLowerCase();

    if (["script", "style", "noscript", "svg", "button", "nav", "footer", "form", "input", "select", "textarea"].includes(tag)) {
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
      case "ul": case "ol": return `\n\n${children}\n\n`;
      case "li": return `- ${children.trim()}\n`;
      case "hr": return `\n\n---\n\n`;
      case "br": return `\n`;
      case "a": {
        const href = node.getAttribute("href");
        if (!href || href.startsWith("javascript:")) return children.trim();
        return children.trim() ? `[${children.trim()}](${href})` : children;
      }
      case "img": {
        const src = node.getAttribute("src") || node.getAttribute("data-src") || "";
        const alt = node.getAttribute("alt") || "Figure";
        const lsrc = src.toLowerCase();
        if (!src || lsrc.includes("divider") || lsrc.includes("icon") || lsrc.includes("pixel") || lsrc.includes("tracker")) {
          return "";
        }
        return `\n\n![${alt}](${src})\n\n`;
      }
      default:
        return children;
    }
  }

  let bodyMd = walk(doc.body).replace(/\n{3,}/g, "\n\n").trim();
  const dateStr = new Date().toISOString().split("T")[0];

  const frontmatter = [
    "---",
    `title: "${(title || "").replace(/"/g, '\\"')}"`,
    byline ? `author: "${(byline || "").replace(/"/g, '\\"')}"` : null,
    `source: "${url}"`,
    `site: "${hostname}"`,
    `date: "${dateStr}"`,
    'cleaner: "KindleFlow Direct (Offline)"',
    "---\n\n"
  ].filter(Boolean).join("\n");

  let headerMd = `# ${title}\n\n`;
  if (subtitle) headerMd += `*${subtitle}*\n\n`;
  if (byline) headerMd += `**By ${byline}** • *${hostname}*\n\n`;

  // Prepend lead hero image if not already inside the body markdown
  if (leadImage && !bodyMd.includes(leadImage)) {
    headerMd += `![${title}](${leadImage})\n\n`;
  }

  return frontmatter + headerMd + bodyMd;
}

function generateCleanHtmlDoc(cleanBodyHtml, title, url, hostname, byline = "", subtitle = "", leadImage = "") {
  const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const bylineHtml = byline ? `By <strong>${escapeHtml(byline)}</strong> • ` : '';
  const subtitleHtml = subtitle ? `<p class="subtitle" style="font-size: 1.15rem; color: #555; margin-bottom: 14px; line-height: 1.5; font-style: italic;">${escapeHtml(subtitle)}</p>` : '';

  const hasLeadInBody = leadImage && cleanBodyHtml.includes(leadImage);
  const leadImgHtml = (leadImage && !hasLeadInBody)
    ? `<figure class="lead-figure" style="margin: 20px 0;"><img src="${escapeHtml(leadImage)}" alt="${escapeHtml(title)}" style="width: 100%; border-radius: 6px; display: block;" /></figure>`
    : '';

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
    article h2, article h3, article h4 { margin-top: 1.6em; margin-bottom: 0.6em; color: #222; }
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
    ${subtitleHtml}
    <div class="meta">
      ${bylineHtml}Published from <strong>${escapeHtml(hostname)}</strong> • Saved on ${dateStr} • 
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener">Original Article</a>
    </div>
  </header>
  <article>
    ${leadImgHtml}
    ${cleanBodyHtml}
  </article>
</body>
</html>`;
}
