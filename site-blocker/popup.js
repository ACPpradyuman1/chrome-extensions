const input = document.getElementById('input');
const addBtn = document.getElementById('add');
const list = document.getElementById('list');
const empty = document.getElementById('empty');

function clean(raw) {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  s = s.split('/')[0];
  return s || null;
}

async function getSites() {
  const { sites = [] } = await chrome.storage.local.get('sites');
  return sites;
}

async function setSites(sites) {
  await chrome.storage.local.set({ sites });
}

async function render() {
  const sites = await getSites();
  list.innerHTML = '';
  empty.style.display = sites.length ? 'none' : 'block';

  for (const site of sites) {
    const li = document.createElement('li');

    const label = document.createElement('span');
    label.textContent = site;

    const del = document.createElement('button');
    del.className = 'remove';
    del.textContent = '✕';
    del.title = `Unblock ${site}`;
    del.addEventListener('click', async () => {
      const updated = (await getSites()).filter((s) => s !== site);
      await setSites(updated);
      render();
    });

    li.append(label, del);
    list.appendChild(li);
  }
}

async function addSite() {
  const domain = clean(input.value);
  if (!domain) return;

  const sites = await getSites();
  if (!sites.includes(domain)) {
    sites.push(domain);
    await setSites(sites);
  }
  input.value = '';
  input.focus();
  render();
}

addBtn.addEventListener('click', addSite);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addSite();
});

render();
