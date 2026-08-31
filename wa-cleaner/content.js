// WhatsApp Web Bulk Deleter
// Drives WhatsApp Web's own per-message "Delete" menu, one message at a time.
// WhatsApp's DOM/class names are unstable and change over time, so selectors
// below are written to be as structure-based (role/aria-label/text) as possible.

const STORAGE_KEY = 'wac_settings';
let stopRequested = false;
let running = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay(min = 400, max = 750) {
  return sleep(min + Math.random() * (max - min));
}

async function waitFor(fn, { timeout = 4000, interval = 100 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const val = fn();
    if (val) return val;
    await sleep(interval);
  }
  return null;
}

function isVisible(el) {
  return !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function findByText(selector, text, root = document) {
  const els = root.querySelectorAll(selector);
  const target = text.trim().toLowerCase();
  for (const el of els) {
    const t = (el.textContent || '').trim().toLowerCase();
    if (t === target && isVisible(el)) return el;
  }
  return null;
}

function findContainingText(selector, text, root = document) {
  const els = root.querySelectorAll(selector);
  const target = text.trim().toLowerCase();
  for (const el of els) {
    const t = (el.textContent || '').trim().toLowerCase();
    if (t.includes(target) && isVisible(el)) return el;
  }
  return null;
}

function getMessageRows() {
  return Array.from(document.querySelectorAll('div[role="row"]'));
}

function getRowText(row) {
  return Array.from(row.querySelectorAll('span.selectable-text'))
    .map((s) => s.textContent || '')
    .join(' ');
}

function isOutgoing(row) {
  return !!row.querySelector('.message-out') || row.className.includes('message-out');
}

function rowMatches(row, keyword, caseSensitive, onlyMine) {
  if (onlyMine && !isOutgoing(row)) return false;
  const text = getRowText(row);
  if (!text) return false;
  return caseSensitive ? text.includes(keyword) : text.toLowerCase().includes(keyword.toLowerCase());
}

function getScrollContainer() {
  const rows = getMessageRows();
  let el = rows[0];
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

async function loadFullHistory(log, shouldStop) {
  const container = getScrollContainer();
  if (!container) {
    log('Could not find the chat scroll container — is a chat open?');
    return;
  }
  let lastHeight = -1;
  let stableCount = 0;
  for (let i = 0; i < 400; i++) {
    if (shouldStop()) return;
    container.scrollTop = 0;
    await sleep(350);
    const h = container.scrollHeight;
    if (h === lastHeight) {
      stableCount++;
      if (stableCount >= 4) break;
    } else {
      stableCount = 0;
    }
    lastHeight = h;
  }
  log('Finished loading chat history (or reached the top).');
}

function countMatches(keyword, caseSensitive, onlyMine) {
  return getMessageRows().filter((r) => rowMatches(r, keyword, caseSensitive, onlyMine)).length;
}

async function hoverRow(row) {
  const target = row.querySelector('div.copyable-text') || row;
  target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await sleep(120);
}

function findContextMenuButton(row) {
  return (
    row.querySelector('div[aria-label="Context menu"]') ||
    row.querySelector('button[aria-label="Context menu"]') ||
    row.querySelector('div[data-icon="down-context"]')?.closest('div[role="button"], button, span[role="button"]') ||
    null
  );
}

async function deleteRow(row) {
  await hoverRow(row);

  const menuBtn = await waitFor(() => findContextMenuButton(row), { timeout: 1500 });
  if (!menuBtn) throw new Error('context menu button not found (WhatsApp UI may have changed)');
  menuBtn.click();

  const deleteItem = await waitFor(
    () => findContainingText('li, div[role="button"]', 'delete', document),
    { timeout: 1500 }
  );
  if (!deleteItem) {
    document.body.click();
    throw new Error('"Delete" menu item not found');
  }
  deleteItem.click();

  const confirmBtn = await waitFor(
    () => findByText('button, div[role="button"]', 'Delete for me', document),
    { timeout: 2000 }
  );
  if (!confirmBtn) {
    document.body.click();
    throw new Error('"Delete for me" confirmation not found');
  }
  confirmBtn.click();

  await waitFor(() => !document.body.contains(row), { timeout: 2000 });
}

async function runDeletion({ keyword, caseSensitive, onlyMine }, log, setStatus) {
  if (running) return;
  running = true;
  stopRequested = false;
  let deleted = 0;
  let failed = 0;

  try {
    while (!stopRequested) {
      const row = getMessageRows().find(
        (r) => !r.dataset.wacDone && rowMatches(r, keyword, caseSensitive, onlyMine)
      );
      if (!row) break;

      row.dataset.wacDone = '1';
      row.scrollIntoView({ block: 'center' });
      await sleep(150);

      try {
        await deleteRow(row);
        deleted++;
        setStatus(`Deleted ${deleted} (failed ${failed})...`);
      } catch (err) {
        failed++;
        log(`Skipped one message: ${err.message}`);
      }

      await randomDelay();
    }
  } finally {
    running = false;
  }

  log(stopRequested ? `Stopped. Deleted ${deleted}, skipped ${failed}.` : `Done. Deleted ${deleted}, skipped ${failed}.`);
  setStatus('Idle');
}

function buildPanel() {
  if (document.getElementById('wac-panel')) return;

  const fab = document.createElement('button');
  fab.id = 'wac-fab';
  fab.title = 'WhatsApp Bulk Deleter';
  fab.textContent = '🗑';
  document.body.appendChild(fab);

  const panel = document.createElement('div');
  panel.id = 'wac-panel';
  panel.className = 'wac-hidden';
  panel.innerHTML = `
    <h3>Bulk Delete <button class="wac-close">&times;</button></h3>
    <input type="text" id="wac-keyword" placeholder="Keyword to match..." />
    <label><input type="checkbox" id="wac-case" /> Case sensitive</label>
    <label><input type="checkbox" id="wac-mine" /> Only my messages</label>
    <div class="wac-row">
      <button class="wac-btn" id="wac-load">Load full history</button>
      <button class="wac-btn" id="wac-scan">Scan</button>
    </div>
    <div class="wac-row">
      <button class="wac-btn wac-primary" id="wac-run">Delete matches</button>
      <button class="wac-btn" id="wac-stop" disabled>Stop</button>
    </div>
    <div id="wac-log">Open a chat, enter a keyword, then Scan or Delete.</div>
  `;
  document.body.appendChild(panel);

  const logEl = panel.querySelector('#wac-log');
  const log = (msg) => {
    logEl.textContent += `\n${msg}`;
    logEl.scrollTop = logEl.scrollHeight;
  };
  const setStatus = (msg) => {
    logEl.textContent = msg;
  };

  const keywordEl = panel.querySelector('#wac-keyword');
  const caseEl = panel.querySelector('#wac-case');
  const mineEl = panel.querySelector('#wac-mine');
  const runBtn = panel.querySelector('#wac-run');
  const stopBtn = panel.querySelector('#wac-stop');

  chrome.storage.local.get(STORAGE_KEY).then((res) => {
    const s = res[STORAGE_KEY];
    if (s) {
      keywordEl.value = s.keyword || '';
      caseEl.checked = !!s.caseSensitive;
      mineEl.checked = !!s.onlyMine;
    }
  });

  function saveSettings() {
    chrome.storage.local.set({
      [STORAGE_KEY]: {
        keyword: keywordEl.value,
        caseSensitive: caseEl.checked,
        onlyMine: mineEl.checked,
      },
    });
  }

  function getSettings() {
    return { keyword: keywordEl.value.trim(), caseSensitive: caseEl.checked, onlyMine: mineEl.checked };
  }

  panel.querySelector('.wac-close').addEventListener('click', () => panel.classList.add('wac-hidden'));
  fab.addEventListener('click', () => panel.classList.toggle('wac-hidden'));

  panel.querySelector('#wac-load').addEventListener('click', async () => {
    saveSettings();
    setStatus('Loading full chat history (this can take a while)...');
    await loadFullHistory(log, () => stopRequested);
  });

  panel.querySelector('#wac-scan').addEventListener('click', () => {
    saveSettings();
    const { keyword, caseSensitive, onlyMine } = getSettings();
    if (!keyword) return setStatus('Enter a keyword first.');
    const n = countMatches(keyword, caseSensitive, onlyMine);
    setStatus(`${n} currently-loaded message(s) match "${keyword}".`);
  });

  runBtn.addEventListener('click', async () => {
    saveSettings();
    const settings = getSettings();
    if (!settings.keyword) return setStatus('Enter a keyword first.');
    runBtn.disabled = true;
    stopBtn.disabled = false;
    setStatus('Starting...');
    await runDeletion(settings, log, setStatus);
    runBtn.disabled = false;
    stopBtn.disabled = true;
  });

  stopBtn.addEventListener('click', () => {
    stopRequested = true;
  });
}

function togglePanel() {
  const panel = document.getElementById('wac-panel');
  if (panel) panel.classList.toggle('wac-hidden');
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'toggle-panel') togglePanel();
});

const initInterval = setInterval(() => {
  if (document.getElementById('wac-panel')) {
    clearInterval(initInterval);
    return;
  }
  if (document.querySelector('div[role="row"]') || document.getElementById('app')) {
    buildPanel();
  }
}, 1000);
