const input = document.getElementById('input');
const saveBtn = document.getElementById('save');
const resetBtn = document.getElementById('reset');
const status = document.getElementById('status');

let tabId = null;

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function send(msg) {
  return chrome.runtime.sendMessage(msg);
}

(async () => {
  const tab = await currentTab();
  tabId = tab.id;

  const existing = await send({ type: 'get', tabId });
  input.value = existing ? existing.custom : (tab.title || '');
  input.focus();
  input.select();
})();

saveBtn.addEventListener('click', async () => {
  const title = input.value.trim();
  if (!title) return;
  await send({ type: 'rename', tabId, title });
  status.textContent = 'Renamed.';
});

resetBtn.addEventListener('click', async () => {
  const res = await send({ type: 'reset', tabId });
  if (res?.original) input.value = res.original;
  status.textContent = 'Reset to original title.';
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveBtn.click();
});
