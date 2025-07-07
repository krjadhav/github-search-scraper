// background.js - GitHub Profile Scraper
// Handles messages from content scripts and manages extension-wide state.

chrome.runtime.onInstalled.addListener(() => {
  console.log('GitHub Profile Scraper extension installed');
});

// Listen for messages from content scripts.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'USER_SEARCH_RESULTS') {
    console.log('Received GitHub user search results:', message.usernames);
    // Persist usernames temporarily for popup access
    chrome.storage.local.set({ scrapedUsernames: message.usernames }, () => {
      console.log('Usernames stored in chrome.storage');
    });
    sendResponse({ status: 'stored', count: message.usernames.length });
  }
});
