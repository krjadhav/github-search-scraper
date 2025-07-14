// popup.js - Handles UI interactions and communicates with background for data.

document.addEventListener('DOMContentLoaded', async () => {
  const btnFetch = document.getElementById('btnFetch');
  const btnExport = document.getElementById('btnExport');
  const progressDiv = document.getElementById('progress');
  const resultsTBody = document.querySelector('#resultsTable tbody');

  let profiles = [];

  // Fetch stored usernames then query GitHub API.
  btnFetch.addEventListener('click', async () => {
    progressDiv.textContent = 'Fetching usernames...';
    chrome.storage.local.get('scrapedUsernames', async ({ scrapedUsernames }) => {
      if (!scrapedUsernames || !scrapedUsernames.length) {
        progressDiv.textContent = 'No usernames found. Visit a GitHub search page first.';
        return;
      }
      progressDiv.textContent = `Found ${scrapedUsernames.length} usernames. Fetching profiles...`;
      profiles = await fetchProfiles(scrapedUsernames);
      renderTable(profiles);
      btnExport.disabled = profiles.length === 0;
    });
  });

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
    data.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${p.name || ''}</td><td>${p.login}</td><td>${p.location || ''}</td><td>${p.company || ''}</td><td>${p.email || ''}</td><td>${p.blog || ''}</td><td>${p.public_repos}</td><td>${p.followers}</td><td>${p.bio || ''}</td>`;
      resultsTBody.appendChild(tr);
    });
  }

  async function fetchProfiles(usernames) {
    const fetched = [];
    for (let i = 0; i < usernames.length; i++) {
      const user = usernames[i];
      progressDiv.textContent = `Fetching ${i + 1}/${usernames.length}: ${user}`;
      try {
        const res = await fetch(`https://api.github.com/users/${user}`);
        if (res.status === 403) {
          throw new Error('API rate limit exceeded. Try again later.');
        }
        if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
        const data = await res.json();
        fetched.push(data);
      } catch (e) {
        console.error('Failed fetching profile for', user, e);
      }
      // simple rate limit: wait 1.2s between calls (~50/hr)
      await new Promise(r => setTimeout(r, 1200));
    }
    progressDiv.textContent = `Fetched ${fetched.length} profiles.`;
    return fetched;
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
});
