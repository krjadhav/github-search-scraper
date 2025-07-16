// background.js - GitHub Profile Scraper
// Handles messages from content scripts and manages extension-wide state.

chrome.runtime.onInstalled.addListener(() => {
  console.log('GitHub Profile Scraper extension installed');
});

// Add fetch function
async function fetchProfileDetails(usernames) {
  const profiles = [];
  await chrome.storage.local.set({ fetchStatus: { status: 'progress', current: 0, total: usernames.length, message: 'Fetching profiles...' } });
  
  for (let i = 0; i < usernames.length; i++) {
    const user = usernames[i];
    try {
      const res = await fetch(`https://api.github.com/users/${user}`);
      if (res.status === 403) {
        throw new Error('API rate limit exceeded. Try again later.');
      }
      if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
      const data = await res.json();
      profiles.push({
        name: data.name || '',
        login: data.login,
        location: data.location || '',
        company: data.company || '',
        email: data.email || '',
        blog: data.blog || '',
        public_repos: data.public_repos || 0,
        followers: data.followers || 0,
        bio: data.bio || ''
      });
      
      await chrome.storage.local.set({ fetchStatus: { status: 'progress', current: i + 1, total: usernames.length, message: `Fetching profiles... (${i + 1}/${usernames.length})` } });
      
      await new Promise(resolve => setTimeout(resolve, 1200));
    } catch (error) {
      console.error(`Error fetching profile for ${user}:`, error);
      await chrome.storage.local.set({ fetchStatus: { status: 'error', message: `Error: ${error.message}` } });
      return [];
    }
  }
  
  await chrome.storage.local.set({ fetchStatus: { status: 'complete', message: `Successfully fetched ${profiles.length} profiles!` }, scrapedProfiles: profiles });
  return profiles;
}

// Update listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'USER_SEARCH_RESULTS') {
    console.log('Received GitHub user search results:', message.usernames);
    chrome.storage.local.set({ scrapedUsernames: message.usernames, scrapingMode: 'complete' }, () => {
      console.log('Usernames and mode stored in chrome.storage');
      chrome.runtime.sendMessage({ type: 'SCRAPING_COMPLETE' });
    });
    sendResponse({ status: 'stored', count: message.usernames.length });
    return true; // In case the set is async, but it's sync
  } else if (message.type === 'START_FETCH_PROFILES') {
    (async () => {
      const { scrapedUsernames } = await chrome.storage.local.get('scrapedUsernames');
      const usernames = scrapedUsernames || [];
      sendResponse({ status: 'started' });
      await fetchProfileDetails(usernames);
    })();
    return true;
  }
});
