// KindleFlow Background Service Worker
// Keeps jobs running even if user clicks away or closes the popup window

const NATIVE_HOST = "com.kindleflow.host";

let activeJob = {
  status: "idle", // "idle" | "running" | "done" | "error"
  step: "idle",
  message: "",
  action: null,
  title: null,
  filename: null
};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "START_JOB") {
    startNativeJob(request.payload);
    sendResponse({ status: "started" });
    return true;
  }

  if (request.type === "GET_JOB_STATUS") {
    sendResponse(activeJob);
    return true;
  }

  if (request.type === "RESET_JOB") {
    activeJob = { status: "idle", step: "idle", message: "", action: null, title: null, filename: null };
    chrome.action.setBadgeText({ text: "" });
    sendResponse({ status: "reset" });
    return true;
  }
});

function broadcastToPopup(data) {
  // Try sending to popup if it's currently open
  chrome.runtime.sendMessage({ type: "JOB_UPDATE", ...data }).catch(() => {
    // Popup is closed, ignore error
  });
}

function startNativeJob(payload) {
  activeJob = {
    status: "running",
    step: "gemini",
    message: "Connecting to Native Host & Gemini AI...",
    action: payload.action,
    title: payload.title,
    filename: null
  };

  chrome.action.setBadgeText({ text: "..." });
  chrome.action.setBadgeBackgroundColor({ color: "#c6a869" });

  try {
    const port = chrome.runtime.connectNative(NATIVE_HOST);

    port.onMessage.addListener((msg) => {
      console.log("Background native host msg:", msg);

      if (msg.step) {
        activeJob.step = msg.step;
        activeJob.message = msg.message || "";
        broadcastToPopup({ status: "running", step: msg.step, message: msg.message });
      }

      if (msg.step === "done") {
        activeJob.status = "done";
        activeJob.message = msg.message || "Done!";
        activeJob.filename = msg.filename || null;

        chrome.action.setBadgeText({ text: "✓" });
        chrome.action.setBadgeBackgroundColor({ color: "#10b981" });

        // Trigger Download if downloadUrl is provided
        if (msg.downloadUrl && msg.filename) {
          chrome.downloads.download({
            url: msg.downloadUrl,
            filename: msg.filename,
            saveAs: false
          });

          // Show OS desktop notification
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icons/icon-128.png",
            title: "KindleFlow Complete",
            message: `Downloaded: ${msg.filename}`
          });
        } else if (payload.action === "kindle") {
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icons/icon-128.png",
            title: "KindleFlow Delivered",
            message: `Sent "${payload.title}" to Kindle!`
          });
        }

        broadcastToPopup({ status: "done", message: msg.message, filename: msg.filename });

        setTimeout(() => {
          chrome.action.setBadgeText({ text: "" });
        }, 8000);

        try { port.disconnect(); } catch (e) {}
      } else if (msg.status === "error") {
        activeJob.status = "error";
        activeJob.message = msg.message || "Unknown error";

        chrome.action.setBadgeText({ text: "!" });
        chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });

        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon-128.png",
          title: "KindleFlow Notice",
          message: msg.message || "An error occurred."
        });

        broadcastToPopup({ status: "error", message: msg.message });
        try { port.disconnect(); } catch (e) {}
      }
    });

    port.onDisconnect.addListener(() => {
      if (activeJob.status === "done" || activeJob.status === "error") {
        return; // Expected exit
      }
      const err = chrome.runtime.lastError;
      if (err) {
        console.error("Native port disconnect in background:", err.message);
        activeJob.status = "error";
        let userMsg = err.message || "Native host disconnected.";
        if (userMsg.includes("Specified native messaging host not found")) {
          userMsg = "Native Host not found. Run ./install.sh in the extension folder to complete setup.";
        }
        activeJob.message = userMsg;
        broadcastToPopup({ status: "error", message: userMsg });
      }
    });

    // Send payload to native host
    port.postMessage(payload);

  } catch (err) {
    console.error("Native connection error in background:", err);
    activeJob.status = "error";
    let userMsg = err.message || "Failed to start native host.";
    if (userMsg.includes("Specified native messaging host not found")) {
      userMsg = "Native Host not found. Run ./install.sh in the extension folder to complete setup.";
    }
    activeJob.message = userMsg;
    broadcastToPopup({ status: "error", message: userMsg });
  }
}
