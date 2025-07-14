// Quick test script to check if our selectors work on GitHub search pages
// Run this in the browser console on a GitHub user search page

console.log('Testing GitHub Profile Scraper selectors...');

// Test primary selector
const primary = document.querySelectorAll('a[data-testid="results-list"] div[data-testid="results-list"] a[href^="/"]');
console.log('Primary selector found:', primary.length, 'elements');

// Test fallback selector
const fallback = document.querySelectorAll('div[data-testid="results-list"] a[href^="/"]');
console.log('Fallback selector found:', fallback.length, 'elements');

// Test alternative selector
const alternative = document.querySelectorAll('div.user-list-item a[href^="/"], .search-results a[href^="/"]');
console.log('Alternative selector found:', alternative.length, 'elements');

// Test broad selector to see all links
const allLinks = document.querySelectorAll('a[href^="/"]');
console.log('All profile-like links found:', allLinks.length, 'elements');

// Show first few links for inspection
console.log('Sample links:', Array.from(allLinks).slice(0, 10).map(a => a.href));

// Test the actual extraction logic
function testExtraction() {
  const nodes = alternative.length > 0 ? alternative : allLinks;
  const usernames = Array.from(nodes)
    .map(a => a.getAttribute('href'))
    .filter(Boolean)
    .filter(href => href.match(/^\/[^\/]+$/) && !href.match(/\/(search|explore|notifications|settings|marketplace)/))
    .map(href => href.replace(/^\//, ''));
  
  console.log('Extracted usernames:', [...new Set(usernames)]);
  return [...new Set(usernames)];
}

const extractedUsernames = testExtraction();
console.log('Final result:', extractedUsernames.length, 'unique usernames');
