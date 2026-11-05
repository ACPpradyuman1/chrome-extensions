// KindleFlow Popup Script
// Communicates with background.js so tasks survive clicking away

let currentArticle = null;
let currentTab = null;

document.addEventListener("DOMContentLoaded", async () => {
  // Load saved settings
  const stored = await chrome.storage.local.get(["geminiApiKey", "kindleEmail", "senderEmail"]);
  if (stored.geminiApiKey) document.getElementById("cfg-gemini-key").value = stored.geminiApiKey;
  if (stored.kindleEmail) document.getElementById("cfg-kindle-email").value = stored.kindleEmail;
  if (stored.senderEmail) document.getElementById("cfg-sender-email").value = stored.senderEmail;

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

  const stored = await chrome.storage.local.get(["geminiApiKey", "kindleEmail", "senderEmail"]);
  const apiKey = (stored.geminiApiKey || "").trim();

  // Show progress box
  document.getElementById("progress-box").style.display = "block";
  document.getElementById("actions-group").style.opacity = "0.4";
  disableButtons(true);

  setProgressStep("extract", "completed");
  setProgressStep("gemini", "active");
  updateLog("Delegating task to background worker...");

  const payload = {
    action: actionType,
    title: currentArticle.title,
    url: currentArticle.url,
    hostname: currentArticle.hostname,
    html: currentArticle.html,
    textContent: currentArticle.textContent,
    images: currentArticle.images,
    geminiApiKey: apiKey,
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
