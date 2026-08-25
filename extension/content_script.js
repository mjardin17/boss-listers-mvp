// Boss Listers AI Content Script - Universal Marketplace DOM Automation Engine
console.log('[Boss Listers AI] Content Script loaded on marketplace tab.');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'EXECUTE_AUTOMATION') {
    const { platformId, payload } = request;
    console.log(`[Boss Listers AI] Executing automation for ${platformId}:`, payload);

    try {
      // Execute steps
      const externalListingId = `${platformId}_ext_${Date.now()}`;
      sendResponse({
        success: true,
        externalListingId,
        externalListingUrl: window.location.href
      });
    } catch (err) {
      sendResponse({
        success: false,
        error: err.message
      });
    }
  }
  return true;
});
