/* Watch Later Cleaner
   Adds checkboxes to each row of the Watch Later playlist and removes the
   selected videos by driving YouTube's own row menu, one video at a time. */

(() => {
  'use strict';

  const ROW = 'ytd-playlist-video-renderer';
  const picked = new Set();   // videoIds
  let panel = null;
  let observer = null;
  let stopRequested = false;
  let busy = false;

  /* ---------- helpers ---------- */

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const onWatchLater = () =>
    new URLSearchParams(location.search).get('list') === 'WL';

  const rows = () => Array.from(document.querySelectorAll(ROW));

  function videoId(row) {
    const a = row.querySelector('a#video-title, a#thumbnail');
    if (!a || !a.href) return null;
    try {
      return new URL(a.href, location.origin).searchParams.get('v');
    } catch {
      return null;
    }
  }

  function rowFor(id) {
    return rows().find((r) => videoId(r) === id) || null;
  }

  function seconds(row) {
    const el = row.querySelector(
      'ytd-thumbnail-overlay-time-status-renderer #text, .badge-shape-wiz__text'
    );
    if (!el) return 0;
    const parts = el.textContent.trim().split(':').map(Number);
    if (parts.some(Number.isNaN)) return 0;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }

  function humanTime(total) {
    const h = Math.floor(total / 3600);
    const m = Math.round((total % 3600) / 60);
    return h ? `${h}h ${m}m` : `${m}m`;
  }

  async function waitFor(fn, timeout = 4000, step = 100) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const v = fn();
      if (v) return v;
      await sleep(step);
    }
    return null;
  }

  /* ---------- checkboxes ---------- */

  function decorate() {
    for (const row of rows()) {
      const id = videoId(row);
      if (!id) continue;

      let box = row.querySelector('.wlc-check');
      if (!box) {
        box = document.createElement('input');
        box.type = 'checkbox';
        box.className = 'wlc-check';
        box.addEventListener('mousedown', (e) => e.stopPropagation());
        box.addEventListener('pointerdown', (e) => e.stopPropagation());
        box.addEventListener('click', (e) => e.stopPropagation());
        box.addEventListener('change', () => {
          box.checked ? picked.add(id) : picked.delete(id);
          row.classList.toggle('wlc-picked', box.checked);
          refresh();
        });
        (row.querySelector('#content') || row).prepend(box);
      }
      box.checked = picked.has(id);
      row.classList.toggle('wlc-picked', box.checked);
    }
  }

  function setAll(on) {
    picked.clear();
    if (on) rows().forEach((r) => { const id = videoId(r); if (id) picked.add(id); });
    decorate();
    refresh();
  }

  function selectTail(n) {
    const all = rows().map(videoId).filter(Boolean);
    picked.clear();
    all.slice(Math.max(0, all.length - n)).forEach((id) => picked.add(id));
    decorate();
    refresh();
  }

  /* ---------- load the full list ---------- */

  async function loadAll() {
    let stable = 0;
    let last = rows().length;
    status(`Loading list… ${last} videos`);

    for (let i = 0; i < 400 && stable < 3 && !stopRequested; i++) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(650);
      const now = rows().length;
      stable = now === last ? stable + 1 : 0;
      last = now;
      status(`Loading list… ${now} videos`);
    }

    window.scrollTo(0, 0);
    decorate();
    refresh();
    status(`Loaded ${rows().length} videos.`);
  }

  /* ---------- removal ---------- */

  async function removeById(id) {
    const row = rowFor(id);
    if (!row) return 'gone';

    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    await sleep(120);

    const menuBtn = row.querySelector(
      'ytd-menu-renderer button, #menu button, yt-icon-button#button, ' +
      'button[aria-label*="Action menu" i], button[aria-label*="More actions" i]'
    );
    if (!menuBtn) {
      console.warn('[WLC] no menu button found for', id, row);
      return 'no-menu';
    }

    row.scrollIntoView({ block: 'center' });
    menuBtn.click();

    const item = await waitFor(() => {
      const nodes = document.querySelectorAll(
        'ytd-popup-container ytd-menu-service-item-renderer, ' +
        'ytd-popup-container yt-list-item-view-model, ' +
        'ytd-popup-container tp-yt-paper-item, ' +
        'tp-yt-iron-dropdown ytd-menu-service-item-renderer, ' +
        'tp-yt-iron-dropdown yt-list-item-view-model, ' +
        'tp-yt-iron-dropdown tp-yt-paper-item, ' +
        'ytd-menu-popup-renderer tp-yt-paper-item, ' +
        '[role="menuitem"]'
      );
      return Array.from(nodes).find(
        (n) => n.offsetParent !== null && /remove from/i.test(n.textContent)
      );
    }, 3000);

    if (!item) {
      console.warn(
        '[WLC] menu opened but no "Remove from" item matched for',
        id,
        '— visible popup text:',
        document.querySelector('ytd-popup-container, tp-yt-iron-dropdown')?.textContent?.trim()
      );
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      );
      return 'no-item';
    }

    item.click();
    const gone = await waitFor(() => !rowFor(id), 4000);
    if (!gone) console.warn('[WLC] clicked remove but row still present for', id);
    return gone ? 'ok' : 'stuck';
  }

  async function removeSelected() {
    const ids = Array.from(picked);
    if (!ids.length) return;
    if (!confirm(`Remove ${ids.length} video${ids.length > 1 ? 's' : ''} from Watch Later?`)) return;

    busy = true;
    stopRequested = false;
    refresh();

    let done = 0;
    let failed = 0;

    for (const id of ids) {
      if (stopRequested) break;
      const result = await removeById(id);
      if (result === 'ok' || result === 'gone') {
        picked.delete(id);
        done++;
      } else {
        failed++;
      }
      status(`Removed ${done} of ${ids.length}${failed ? ` · ${failed} skipped` : ''}`);
      await sleep(350 + Math.random() * 250);
    }

    busy = false;
    decorate();
    refresh();
    status(
      stopRequested
        ? `Stopped. Removed ${done}.`
        : `Done. Removed ${done}${failed ? `, skipped ${failed}` : ''}.`
    );
  }

  /* ---------- panel ---------- */

  function status(text) {
    const el = document.getElementById('wlc-status');
    if (el) el.textContent = text;
  }

  function refresh() {
    if (!panel) return;
    const all = rows();
    const totalSecs = all.reduce((s, r) => s + seconds(r), 0);
    const pickedSecs = all
      .filter((r) => picked.has(videoId(r)))
      .reduce((s, r) => s + seconds(r), 0);

    panel.querySelector('#wlc-stats').textContent =
      `${all.length} loaded · ${humanTime(totalSecs)} total`;

    const btn = panel.querySelector('#wlc-remove');
    btn.textContent = busy
      ? 'Stop'
      : picked.size
        ? `Remove ${picked.size} (${humanTime(pickedSecs)})`
        : 'Remove selected';
    btn.disabled = !busy && picked.size === 0;

    panel
      .querySelectorAll('.wlc-row button, .wlc-tail button, .wlc-tail input')
      .forEach((el) => { el.disabled = busy; });
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'wlc-panel';
    panel.innerHTML = `
      <h2>Watch Later Cleaner</h2>
      <div id="wlc-stats">0 loaded</div>
      <div class="wlc-row">
        <button id="wlc-load">Load all</button>
        <button id="wlc-all">Select all</button>
        <button id="wlc-none">Clear</button>
      </div>
      <div class="wlc-tail">
        <input id="wlc-n" type="number" min="1" value="20">
        <button id="wlc-tailbtn">Select last N</button>
      </div>
      <button id="wlc-remove" disabled>Remove selected</button>
      <div id="wlc-status">Sort by date added, then Load all.</div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('#wlc-load').addEventListener('click', loadAll);
    panel.querySelector('#wlc-all').addEventListener('click', () => setAll(true));
    panel.querySelector('#wlc-none').addEventListener('click', () => setAll(false));
    panel.querySelector('#wlc-tailbtn').addEventListener('click', () => {
      const n = parseInt(panel.querySelector('#wlc-n').value, 10);
      if (n > 0) selectTail(n);
    });
    panel.querySelector('#wlc-remove').addEventListener('click', () => {
      if (busy) { stopRequested = true; status('Stopping…'); return; }
      removeSelected();
    });
  }

  /* ---------- lifecycle ---------- */

  function teardown() {
    observer?.disconnect();
    observer = null;
    panel?.remove();
    panel = null;
    picked.clear();
    document.querySelectorAll('.wlc-check').forEach((b) => b.remove());
  }

  function init() {
    if (!onWatchLater()) return teardown();
    if (panel) return;

    buildPanel();
    decorate();
    refresh();

    let queued = false;
    observer = new MutationObserver(() => {
      if (queued || busy) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; decorate(); refresh(); });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.addEventListener('yt-navigate-finish', () => setTimeout(init, 600));
  setTimeout(init, 900);
})();
