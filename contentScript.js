// contentScript.js - Runs in the context of GitHub search results pages.
// Detects user search results and sends usernames back to the background script.

(function () {
  // Only run if on GitHub user search results page.
  if (!location.href.match(/https:\/\/github\.com\/search.*type=users/)) {
    return;
  }

  console.log('[GitHub Profile Scraper] Content script loaded on', location.href);

  // Extract usernames from the DOM.
  function extractUsernames() {
    // Updated selectors to match current GitHub structure
    const userNodes = document.querySelectorAll('a[data-testid="results-list"] div[data-testid="results-list"] a[href^="/"]');
    
    if (userNodes.length === 0) {
      // Fallback to alternative selectors
      const fallbackNodes = document.querySelectorAll('div[data-testid="results-list"] a[href^="/"]');
      if (fallbackNodes.length === 0) {
        // Try another common pattern
        const altNodes = document.querySelectorAll('div.user-list-item a[href^="/"], .search-results a[href^="/"]');
        console.log('[GitHub Profile Scraper] Using alternative selector, found:', altNodes.length);
        return extractUsernamesFromNodes(altNodes);
      }
      console.log('[GitHub Profile Scraper] Using fallback selector, found:', fallbackNodes.length);
      return extractUsernamesFromNodes(fallbackNodes);
    }
    
    console.log('[GitHub Profile Scraper] Using primary selector, found:', userNodes.length);
    return extractUsernamesFromNodes(userNodes);
  }

  function extractUsernamesFromNodes(nodes) {
    const usernames = Array.from(nodes)
      .map(a => a.getAttribute('href'))
      .filter(Boolean)
      .filter(href => href.match(/^\/[^\/]+$/) && !href.match(/\/(search|explore|notifications|settings|marketplace)/)) // Only user profiles
      .map(href => href.replace(/^\//, ''));
    
    console.log('[GitHub Profile Scraper] Extracted usernames:', usernames);
    return [...new Set(usernames)]; // unique
  }

  // Wait for content to load then extract usernames
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

  // Initial extraction
  tryExtractUsernames();
  
  // Also listen for page changes (GitHub uses AJAX navigation)
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (location.href.match(/https:\/\/github\.com\/search.*type=users/)) {
        setTimeout(tryExtractUsernames, 1000);
      }
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
})();
