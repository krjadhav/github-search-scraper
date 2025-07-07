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
    const userNodes = document.querySelectorAll('div.user-list-item div.d-flex > div > a');
    const usernames = Array.from(userNodes)
      .map(a => a.getAttribute('href'))
      .filter(Boolean)
      .map(href => href.replace(/^\//, ''));
    return [...new Set(usernames)]; // unique
  }

  // Send usernames to background.
  const usernames = extractUsernames();
  if (usernames.length) {
    chrome.runtime.sendMessage({ type: 'USER_SEARCH_RESULTS', usernames }, response => {
      console.log('[GitHub Profile Scraper] Stored usernames response:', response);
    });
  }
})();
