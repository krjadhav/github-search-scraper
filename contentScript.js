// contentScript.js - Runs in the context of GitHub search results pages.
// Detects user search results and sends usernames back to the background script.

(function () {
  // Only run if on GitHub user search results page.
  if (!location.href.match(/https:\/\/github\.com\/search.*type=users/)) {
    return;
  }

  console.log('[GitHub Profile Scraper] Content script loaded on', location.href);

  // Add state persistence functions
  async function loadScrapingState() {
    const { scrapingState } = await chrome.storage.local.get('scrapingState');
    return scrapingState;
  }

  async function saveScrapingState(state) {
    await chrome.storage.local.set({ scrapingState: state });
  }

  async function clearScrapingState() {
    await chrome.storage.local.remove('scrapingState');
  }

  // Update globals
  let allUsernames = new Set();
  let currentPage = 1;
  let isProcessing = false;
  let isMultiPage = false;
  let baseUrl = '';

  // Add init function
  async function init() {
    const state = await loadScrapingState();
    const currentBase = new URL(window.location.href);
    currentBase.searchParams.delete('p');
    
    if (state && state.isMultiPage && state.baseUrl === currentBase.href) {
      allUsernames = new Set(state.usernames);
      currentPage = parseInt(new URL(window.location.href).searchParams.get('p') || '1', 10);
      isMultiPage = true;
      baseUrl = state.baseUrl;
      console.log('[GitHub Profile Scraper] Resuming multi-page scraping at page', currentPage);
      processCurrentPage();
    } else {
      console.log('[GitHub Profile Scraper] No ongoing multi-page scraping');
      tryExtractUsernames();
    }
  }

  // Call init on load
  init();

  // Extract usernames from the DOM.
  function extractUsernames() {
    const container = document.querySelector('div[data-testid="results-list"]') || document.querySelector('.search-results') || document.body;
    
    let userNodes = [];
    
    // Primary
    userNodes = container.querySelectorAll('a[href^="/"]:not([href*="/search"]):not([href*="/explore"]):not([href*="/orgs"])');
    console.log('[GitHub Profile Scraper] Primary selector found:', userNodes.length);
    
    if (userNodes.length === 0) {
      // Fallback 1
      userNodes = container.querySelectorAll('a[href^="/"]:not([href*="/search"]):not([href*="/explore"]):not([href*="/orgs"])');
      console.log('[GitHub Profile Scraper] Fallback 1 found:', userNodes.length);
    }
    
    if (userNodes.length === 0) {
      // Fallback 2
      userNodes = container.querySelectorAll('a[data-hovercard-type="user"]');
      console.log('[GitHub Profile Scraper] Fallback 2 (avatar links) found:', userNodes.length);
    }
    
    if (userNodes.length === 0) {
      // Fallback 3
      userNodes = container.querySelectorAll('a[href^="/"]:not([href*="/search"]):not([href*="/explore"]):not([href*="/marketplace"]):not([href*="/settings"]):not([href*="/notifications"])');
      const filteredNodes = Array.from(userNodes).filter(a => {
        const href = a.getAttribute('href');
        return href && href.match(/^\/[^/]+$/) && !href.includes('?') && !href.includes('#');
      });
      console.log('[GitHub Profile Scraper] Fallback 3 (filtered links) found:', filteredNodes.length);
      return extractUsernamesFromNodes(filteredNodes);
    }
    
    return extractUsernamesFromNodes(userNodes);
  }

  function extractUsernamesFromNodes(nodes) {
    console.log('[GitHub Profile Scraper] Processing', nodes.length, 'nodes');
    
    const hrefs = Array.from(nodes).map(a => a.getAttribute('href')).filter(Boolean);
    console.log('[GitHub Profile Scraper] Found hrefs:', hrefs);
    
    const usernames = hrefs
      .filter(href => href.match(/^\/[^\/]+$/) && !href.match(/\/(search|explore|notifications|settings|marketplace)/)) // Only user profiles
      .map(href => href.replace(/^\//, ''));
    
    console.log('[GitHub Profile Scraper] Filtered usernames:', usernames);
    return [...new Set(usernames)]; // unique
  }

  // Update getNextPageUrl to extract from DOM
  function getNextPageUrl() {
    const nextLink = document.querySelector('a[rel="next"]') || document.querySelector('a[aria-label="Next Page"]') || document.querySelector('.next_page');
    if (nextLink && nextLink.getAttribute('href')) {
      return nextLink.href;
    }
    return null;
  }

  // Send progress update to popup
  function sendProgress(message) {
    chrome.runtime.sendMessage({ 
      type: 'SCRAPING_PROGRESS', 
      message: message,
      page: currentPage,
      totalUsernames: allUsernames.size
    });
  }

  // Update processCurrentPage to check for nextUrl before navigating
  async function processCurrentPage() {
    if (isProcessing) return;
    isProcessing = true;

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const usernames = extractUsernames();
      console.log(`[GitHub Profile Scraper] Page ${currentPage}: Found ${usernames.length} usernames`);
      
      if (usernames.length === 0 && currentPage > 1) {
        // Reached end
        console.log(`[GitHub Profile Scraper] Completed! Total usernames: ${allUsernames.size}`);
        sendProgress(`Completed scanning ${currentPage - 1} pages. Found ${allUsernames.size} unique profiles.`);
        chrome.runtime.sendMessage({ 
          type: 'USER_SEARCH_RESULTS', 
          usernames: Array.from(allUsernames),
          totalPages: currentPage - 1
        }, response => {
          console.log('[GitHub Profile Scraper] Final results sent:', response);
        });
        await clearScrapingState();
        isMultiPage = false;
        return;
      }
      
      if (usernames.length === 0) {
        chrome.runtime.sendMessage({ type: 'USER_SEARCH_RESULTS', usernames: [] });
        await clearScrapingState();
        isMultiPage = false;
        return;
      }
      
      usernames.forEach(username => allUsernames.add(username));
      await saveScrapingState({
        isMultiPage: true,
        usernames: Array.from(allUsernames),
        baseUrl: baseUrl
      });
      
      sendProgress(`Page ${currentPage}: Found ${usernames.length} profiles (Total: ${allUsernames.size})`);
      
      const nextUrl = getNextPageUrl();
      if (nextUrl) {
        currentPage += 1;
        sendProgress(`Moving to page ${currentPage}...`);
        window.location.href = nextUrl;
      } else {
        // No more pages, complete
        console.log(`[GitHub Profile Scraper] Completed! Total usernames: ${allUsernames.size}`);
        sendProgress(`Completed scanning ${currentPage} pages. Found ${allUsernames.size} unique profiles.`);
        chrome.runtime.sendMessage({ 
          type: 'USER_SEARCH_RESULTS', 
          usernames: Array.from(allUsernames),
          totalPages: currentPage
        }, response => {
          console.log('[GitHub Profile Scraper] Final results sent:', response);
        });
        await clearScrapingState();
        isMultiPage = false;
      }
      
    } catch (error) {
      console.error('[GitHub Profile Scraper] Error processing page:', error);
      sendProgress(`Error on page ${currentPage}: ${error.message}`);
      await clearScrapingState();
      isMultiPage = false;
    } finally {
      isProcessing = false;
    }
  }

  // Wait for content to load then extract usernames (single page mode)
  function tryExtractUsernames() {
    const usernames = extractUsernames();
    if (usernames.length) {
      chrome.runtime.sendMessage({ type: 'USER_SEARCH_RESULTS', usernames }, response => {
        console.log('[GitHub Profile Scraper] Stored usernames response:', response);
      });
    } else {
      console.log('[GitHub Profile Scraper] No usernames found, retrying in 2 seconds...');
      // Retry after a delay as content might still be loading
      setTimeout(tryExtractUsernames, 2000);
    }
  }

  // Listen for messages from popup to start scraping
  chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.type === 'START_MULTI_PAGE_SCRAPING') {
      console.log('[GitHub Profile Scraper] Starting multi-page scraping...');
      isMultiPage = true;
      allUsernames.clear();
      const pageOneUrl = new URL(window.location.href);
      pageOneUrl.searchParams.delete('p');
      baseUrl = pageOneUrl.href;
      await saveScrapingState({
        isMultiPage: true,
        usernames: [],
        baseUrl: baseUrl
      });
      sendProgress('Starting multi-page scraping...');
      
      // Navigate to page 1 if necessary
      if (pageOneUrl.href !== window.location.href) {
        sendProgress('Navigating to page 1...');
        window.location.href = pageOneUrl.href;
      } else {
        currentPage = 1;
        processCurrentPage();
      }
      sendResponse({ status: 'started' });
    } else if (message.type === 'FETCH_CURRENT_PAGE') {
      // Single page extraction for backward compatibility
      tryExtractUsernames();
      sendResponse({ status: 'started' });
    }
  });

  // Update observer to call init() if URL changed to a search page
  let lastUrl = location.href;
  const observer = new MutationObserver(async () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (location.href.match(/https:\/\/github\.com\/search.*type=users/)) {
        await init();
      }
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
})();
