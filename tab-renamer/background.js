/* Tab Renamer — keeps a map of tabId -> { custom, original } and
   re-applies the custom title whenever the tab (re)loads or a page
   script tries to overwrite document.title. */

const STORE_KEY = 'renames'; // { [tabId]: { custom, original } }

async function getMap() {
  const { [STORE_KEY]: map = {} } = await chrome.storage.session.get(STORE_KEY);
  return map;
}

async function setMap(map) {
  await chrome.storage.session.set({ [STORE_KEY]: map });
}

function applyTitle(title) {
  // Runs inside the target page.
  document.title = title;

  if (!window.__tabRenamerObserving) {
    window.__tabRenamerObserving = true;
    const el = document.querySelector('title') || (() => {
      const t = document.createElement('title');
      document.head.appendChild(t);
      return t;
    })();

    new MutationObserver(() => {
      if (document.title !== window.__tabRenamerTitle) {
        document.title = window.__tabRenamerTitle;
      }
    }).observe(el, { childList: true, characterData: true, subtree: true });
  }
  window.__tabRenamerTitle = title;
}

async function inject(tabId, title) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: applyTitle,
      args: [title]
    });
  } catch {
    // Tab may be a chrome:// page or closed; nothing we can do.
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'rename') {
    (async () => {
      const map = await getMap();
      const tab = await chrome.tabs.get(msg.tabId);
      map[msg.tabId] = { custom: msg.title, original: map[msg.tabId]?.original ?? tab.title };
      await setMap(map);
      await inject(msg.tabId, msg.title);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === 'reset') {
    (async () => {
      const map = await getMap();
      const entry = map[msg.tabId];
      delete map[msg.tabId];
      await setMap(map);
      if (entry) await inject(msg.tabId, entry.original);
      sendResponse({ ok: true, original: entry?.original });
    })();
    return true;
  }

  if (msg.type === 'get') {
    (async () => {
      const map = await getMap();
      sendResponse(map[msg.tabId] || null);
    })();
    return true;
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'complete') return;
  const map = await getMap();
  const entry = map[tabId];
  if (entry) await inject(tabId, entry.custom);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const map = await getMap();
  if (map[tabId]) {
    delete map[tabId];
    await setMap(map);
  }
});
