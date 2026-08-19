// Boss Listers AI Extension Background Service Worker
const CONFIG = {
  SERVER_URL: 'https://bosslisters.ai/api/v1/extension',
  HEARTBEAT_INTERVAL_MIN: 1
};

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Boss Listers AI Extension] Installed successfully.');
  chrome.alarms.create('heartbeatAlarm', { periodInMinutes: CONFIG.HEARTBEAT_INTERVAL_MIN });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'heartbeatAlarm') {
    sendHeartbeat();
  }
});

async function sendHeartbeat() {
  const session = await chrome.storage.local.get(['sessionToken', 'extensionId']);
  if (!session.sessionToken) return;

  try {
    await fetch(`${CONFIG.SERVER_URL}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        extensionId: session.extensionId || 'boss_extension_local',
        timestamp: Date.now(),
        authenticatedPlatforms: ['facebook', 'mercari', 'poshmark', 'vinted', 'depop', 'grailed', 'offerup']
      })
    });
  } catch (e) {
    console.warn('[Boss Listers AI Extension] Heartbeat ping failed:', e);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'EXECUTE_AUTOMATION') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message, sendResponse);
      }
    });
    return true;
  }
});
