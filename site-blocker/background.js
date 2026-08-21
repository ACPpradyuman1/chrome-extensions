/* Simple Site Blocker — background service worker.
   Keeps chrome.declarativeNetRequest dynamic rules in sync with the
   site list stored in chrome.storage.local under "sites". */

const RULE_ID_BASE = 1000;

function toDomain(raw) {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  s = s.split('/')[0];
  return s || null;
}

async function rebuildRules() {
  const { sites = [] } = await chrome.storage.local.get('sites');

  const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = oldRules.map((r) => r.id);

  const addRules = sites
    .map(toDomain)
    .filter(Boolean)
    .map((domain, i) => ({
      id: RULE_ID_BASE + i,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: { extensionPath: `/blocked.html?site=${encodeURIComponent(domain)}` }
      },
      condition: {
        requestDomains: [domain],
        resourceTypes: ['main_frame']
      }
    }));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules
  });
}

chrome.runtime.onInstalled.addListener(rebuildRules);
chrome.runtime.onStartup.addListener(rebuildRules);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.sites) rebuildRules();
});
