// popup.js - Handles UI interactions and communicates with background for data.

document.addEventListener('DOMContentLoaded', async () => {
  const btnFetch = document.getElementById('btnFetch');
  const btnExport = document.getElementById('btnExport');
  const progressDiv = document.getElementById('progress');
  const resultsTBody = document.querySelector('#resultsTable tbody');

  let profiles = [];
  let isMultiPageMode = false;
  let statusInterval = null;

  // Fetch stored usernames then query GitHub API.
  btnFetch.addEventListener('click', async () => {
    try {
      // Ask user if they want single page or multi-page scraping
      const useMultiPage = confirm('Multi-page scraping?\n\nOK = Scrape ALL pages automatically\nCancel = Scrape current page only');
      
      if (useMultiPage) {
        startMultiPageScraping();
      } else {
        startSinglePageScraping();
      }
      
    } catch (error) {
      console.error('Error starting scraping:', error);
      progressDiv.textContent = 'Error starting scraping.';
      btnFetch.disabled = false;
    }
  });

  async function checkFetchStatus() {
    const { fetchStatus, scrapedProfiles } = await chrome.storage.local.get(['fetchStatus', 'scrapedProfiles']);
    if (fetchStatus) {
      progressDiv.textContent = fetchStatus.message || 'Processing...';
      if (fetchStatus.status === 'complete') {
        profiles = scrapedProfiles || [];
        renderTable(profiles);
        btnExport.disabled = profiles.length === 0;
        await chrome.storage.local.remove(['fetchStatus', 'scrapedProfiles', 'scrapedUsernames', 'scrapingMode']);
        clearInterval(statusInterval);
        statusInterval = null;
      } else if (fetchStatus.status === 'error') {
        btnFetch.disabled = false;
        clearInterval(statusInterval);
        statusInterval = null;
      } else {
        // Progress, keep checking
        if (!statusInterval) {
          statusInterval = setInterval(checkFetchStatus, 2000);
        }
      }
    } else {
      clearInterval(statusInterval);
      statusInterval = null;
    }
  }

  // Call on load
  checkFetchStatus();

  // Update checkScrapingState
  async function checkScrapingState() {
    const {scrapingMode} = await chrome.storage.local.get('scrapingMode');
    if (scrapingMode === 'complete') {
      chrome.runtime.sendMessage({ type: 'START_FETCH_PROFILES' });
      checkFetchStatus();
    } else if (scrapingMode === 'multi-ongoing') {
      progressDiv.textContent = 'Multi-page scraping in progress. Please keep the tab open and reopen this popup when complete to fetch profile details.';
      btnFetch.disabled = false;
    }
  }
  checkScrapingState();

  async function startMultiPageScraping() {
    progressDiv.textContent = 'Starting multi-page scraping...';
    btnFetch.disabled = true;
    btnExport.disabled = true;
    resultsTBody.innerHTML = '';
    isMultiPageMode = true;
    
    // Send message to content script to start multi-page scraping
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { type: 'START_MULTI_PAGE_SCRAPING' }, async (response) => {
      if (chrome.runtime.lastError) {
        progressDiv.textContent = 'Error: Make sure you are on a GitHub search page.';
        btnFetch.disabled = false;
        isMultiPageMode = false;
      } else {
        await chrome.storage.local.set({ scrapingMode: 'multi-ongoing' });
        progressDiv.textContent = 'Multi-page scraping started. Please keep the tab open and reopen this popup when complete.';
        btnFetch.disabled = false;
      }
    });
  }
  
  async function startSinglePageScraping() {
    progressDiv.textContent = 'Fetching profiles from current page...';
    btnFetch.disabled = true;
    btnExport.disabled = true;
    resultsTBody.innerHTML = '';
    isMultiPageMode = false;
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { type: 'FETCH_CURRENT_PAGE' }, (response) => {
      if (chrome.runtime.lastError) {
        progressDiv.textContent = 'Error: Make sure you are on a GitHub search page.';
        btnFetch.disabled = false;
      }
    });
  }
  
  // In btnFetch click, after confirm, in startMultiPageScraping it's already handled via scrapingMode
  // Remove the await chrome.storage.local.remove('scrapedUsernames') since handled in checkFetchStatus

  // Export to CSV.
  btnExport.addEventListener('click', async () => {
    progressDiv.textContent = 'Exporting to CSV...';
    try {
      const message = await exportToSheets(profiles);
      progressDiv.textContent = message;
    } catch (err) {
      console.error(err);
      progressDiv.textContent = 'Error exporting to CSV: ' + err.message;
    }
  });

  function renderTable(data) {
    resultsTBody.innerHTML = '';
    data.forEach(profile => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${profile.name || profile.login}</td>
        <td>${profile.login}</td>
        <td>${profile.location || ''}</td>
        <td>${profile.company || ''}</td>
        <td>${profile.email || ''}</td>
        <td>${profile.blog || ''}</td>
        <td>${profile.public_repos || 0}</td>
        <td>${profile.followers || 0}</td>
      `;
      resultsTBody.appendChild(row);
    });
  }

  async function exportToSheets(rows) {
    try {
      // Generate CSV content
      const csvContent = generateCSV(rows);
      
      // Create and trigger download
      downloadCSV(csvContent, `github-profiles-${new Date().toISOString().split('T')[0]}.csv`);
      
      return 'CSV file downloaded successfully!';
    } catch (error) {
      console.error('Error exporting CSV:', error);
      throw new Error(`Export failed: ${error.message}`);
    }
  }

  // Generate CSV content from profile data
  function generateCSV(profiles) {
    // Define headers
    const headers = ['Name', 'Username', 'Location', 'Company', 'Email', 'Website', 'Public Repos', 'Followers', 'Bio'];
    
    // Convert profiles to CSV rows
    const csvRows = [];
    
    // Add header row
    csvRows.push(headers.join(','));
    
    // Add data rows
    profiles.forEach(profile => {
      const row = [
        escapeCSVField(profile.name || ''),
        escapeCSVField(profile.login || ''),
        escapeCSVField(profile.location || ''),
        escapeCSVField(profile.company || ''),
        escapeCSVField(profile.email || ''),
        escapeCSVField(profile.blog || ''),
        profile.public_repos || 0,
        profile.followers || 0,
        escapeCSVField(profile.bio || '')
      ];
      csvRows.push(row.join(','));
    });
    
    return csvRows.join('\n');
  }

  // Escape CSV fields that contain commas, quotes, or newlines
  function escapeCSVField(field) {
    if (typeof field !== 'string') return field;
    
    // If field contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return '"' + field.replace(/"/g, '""') + '"';
    }
    
    return field;
  }

  // Download CSV file
  function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      // Use HTML5 download attribute
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      // Fallback for older browsers
      if (navigator.msSaveBlob) {
        navigator.msSaveBlob(blob, filename);
      } else {
        const url = URL.createObjectURL(blob);
        window.open(url);
      }
    }
  }
  
  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SCRAPING_PROGRESS') {
      progressDiv.textContent = message.message;
    } else if (message.type === 'USER_SEARCH_RESULTS') {
      if (isMultiPageMode) {
        // Multi-page scraping completed, now fetch profile details
        const usernames = message.usernames || [];
        if (usernames.length > 0) {
          progressDiv.textContent = `Multi-page scraping completed! Found ${usernames.length} profiles. Fetching details...`;
          // The actual fetching logic is now in background.js
          // We just update the UI to show progress and then wait for checkFetchStatus
          // to handle the final state.
          // For now, we just acknowledge completion and let checkFetchStatus handle it.
          // The checkFetchStatus will be called by checkScrapingState when scrapingMode is 'complete'.
        } else {
          progressDiv.textContent = 'No profiles found.';
          btnFetch.disabled = false;
          isMultiPageMode = false;
        }
      }
      // For single-page mode, usernames are already handled by storage
    } else if (message.type === 'SCRAPING_COMPLETE') {
      checkScrapingState();
    }
  });
});
