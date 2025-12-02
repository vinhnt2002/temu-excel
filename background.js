// Background service worker: open/focus app.html window when action clicked
chrome.action.onClicked.addListener(function() {
  const url = chrome.runtime.getURL('app.html');
  chrome.windows.getAll({ populate: true }, function(windows) {
    for (const w of windows) {
      for (const t of w.tabs) {
        if (!t || !t.url) continue;
        // match exact or trailing slash
        if (t.url === url || t.url === url + '/') {
          // Resize window to proper size and focus
          chrome.windows.update(w.id, { 
            focused: true, 
            width: 420, 
            height: 800,
            state: 'normal' // Ensure it's not maximized
          });
          chrome.tabs.update(t.id, { active: true });
          
          // Update check is handled by popup.js on first load only
          return;
        }
      }
    }
    // not found, create a new popup window - larger size with scroll
    chrome.windows.create({ url: 'app.html', type: 'popup', width: 420, height: 800 }, function(window) {
      // Update check is handled by popup.js on first load only
    });
  });
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  // Handle other messages if needed in the future
});
