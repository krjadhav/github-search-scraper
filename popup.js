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

  // Export to Google Sheets.
  btnExport.addEventListener('click', async () => {
    progressDiv.textContent = 'Exporting to Google Sheets...';
    try {
      const sheetUrl = await exportToSheets(profiles);
      progressDiv.innerHTML = `Exported! <a href="${sheetUrl}" target="_blank">Open Sheet</a>`;
    } catch (err) {
      console.error(err);
      progressDiv.textContent = 'Error exporting to Sheets: ' + err.message;
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
    // NOTE: OAuth & Sheets API logic would be implemented here.
    // For initial scaffold, we'll just simulate.
    return new Promise((resolve) => {
      setTimeout(() => resolve('https://docs.google.com/spreadsheets/d/FAKE_SHEET_ID'), 1000);
    });
  }
});
