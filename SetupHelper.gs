/***********************************************************************
 * SetupHelper - Run from master spreadsheet to assist with deployment
 *
 * This helps you set up TaskSyncLib across all 18 spreadsheets.
 * Run these functions from the master spreadsheet's Apps Script editor.
 ***********************************************************************/

/**
 * Lists all spreadsheet URLs you need to set up.
 * Run this first to get your checklist.
 */
function listAllSpreadsheetUrls() {
  const masterUrl = 'https://docs.google.com/spreadsheets/d/1hSzGYowH0qFmODYJF08vrcvfdcCycs7ztSALjTSDpYs/edit';

  const ss = SpreadsheetApp.openById('1hSzGYowH0qFmODYJF08vrcvfdcCycs7ztSALjTSDpYs');
  const sh = ss.getSheetByName('Crew Mappings');
  if (!sh) throw new Error('Missing Crew Mappings tab');

  const values = sh.getDataRange().getValues();
  const headers = values[0].map(h => String(h || '').trim());
  const crewCol = headers.indexOf('Crew');
  const urlCol = headers.indexOf('Sheet');

  const lines = [];
  lines.push('=== SPREADSHEETS TO SET UP ===\n');
  lines.push(`[ ] 1. MASTER: ${masterUrl}`);
  lines.push('    └─ Apps Script: ' + masterUrl.replace('/edit', '') + '/edit#gid=0&range=A1');

  let count = 2;
  for (let i = 1; i < values.length; i++) {
    const crew = String(values[i][crewCol] || '').trim();
    const url = String(values[i][urlCol] || '').trim();
    if (!crew || !url) continue;

    lines.push(`\n[ ] ${count}. ${crew}: ${url}`);
    count++;
  }

  lines.push('\n\n=== SETUP STEPS FOR EACH ===');
  lines.push('1. Open spreadsheet');
  lines.push('2. Extensions → Apps Script');
  lines.push('3. Delete all existing code');
  lines.push('4. Paste TaskSyncWrapper.gs code');
  lines.push('5. Libraries (+) → Paste ID → Add');
  lines.push('6. Select setupTrigger → Run');
  lines.push('7. Authorize when prompted');

  console.log(lines.join('\n'));

  // Also show in a dialog for easy copying
  const html = HtmlService.createHtmlOutput(
    '<pre style="font-size:12px;font-family:monospace;white-space:pre-wrap;">' +
    lines.join('\n').replace(/</g, '&lt;') +
    '</pre>'
  ).setWidth(700).setHeight(500);

  SpreadsheetApp.getUi().showModalDialog(html, 'Setup Checklist');
}

/**
 * Opens all spreadsheet Apps Script editors in sequence.
 * Click through each tab that opens.
 */
function openAllAppsScriptEditors() {
  const masterUrl = 'https://docs.google.com/spreadsheets/d/1hSzGYowH0qFmODYJF08vrcvfdcCycs7ztSALjTSDpYs/edit';

  const ss = SpreadsheetApp.openById('1hSzGYowH0qFmODYJF08vrcvfdcCycs7ztSALjTSDpYs');
  const sh = ss.getSheetByName('Crew Mappings');
  if (!sh) throw new Error('Missing Crew Mappings tab');

  const values = sh.getDataRange().getValues();
  const headers = values[0].map(h => String(h || '').trim());
  const urlCol = headers.indexOf('Sheet');

  const urls = [masterUrl];
  for (let i = 1; i < values.length; i++) {
    const url = String(values[i][urlCol] || '').trim();
    if (url) urls.push(url);
  }

  // Generate links to open
  const links = urls.map((url, i) => {
    // Convert spreadsheet URL to Apps Script editor URL
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return null;
    const id = match[1];
    return `<a href="https://script.google.com/macros/d/${id}/edit" target="_blank" style="display:block;margin:5px 0;">
      ${i + 1}. Open Apps Script Editor</a>`;
  }).filter(Boolean);

  // Actually, the above URL format doesn't work. Let me use a different approach.
  // We'll just show the spreadsheet URLs and they click Extensions → Apps Script

  const html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: Arial, sans-serif; font-size: 13px; }
      .url { margin: 8px 0; padding: 8px; background: #f5f5f5; border-radius: 4px; }
      a { color: #1a73e8; }
      .done { background: #e6f4ea; }
    </style>
    <p><strong>Click each link, then: Extensions → Apps Script</strong></p>
    <div id="urls">
      ${urls.map((url, i) => `
        <div class="url" id="url${i}">
          <input type="checkbox" onchange="this.parentElement.classList.toggle('done')">
          <a href="${url}" target="_blank">${i + 1}. ${i === 0 ? 'MASTER' : 'Crew ' + i}</a>
        </div>
      `).join('')}
    </div>
  `).setWidth(500).setHeight(600);

  SpreadsheetApp.getUi().showModalDialog(html, 'Open All Spreadsheets');
}

/**
 * After setup, run this to verify all triggers are working.
 * Checks if each spreadsheet can be accessed.
 */
function verifySetup() {
  const results = [];

  // Check master
  try {
    const masterSs = SpreadsheetApp.openById('1hSzGYowH0qFmODYJF08vrcvfdcCycs7ztSALjTSDpYs');
    const masterSheet = masterSs.getSheetByName('Master Tasks');
    if (masterSheet) {
      results.push('✓ Master: OK');
    } else {
      results.push('✗ Master: Missing "Master Tasks" sheet');
    }
  } catch (err) {
    results.push('✗ Master: ' + err.message);
  }

  // Check crews
  const ss = SpreadsheetApp.openById('1hSzGYowH0qFmODYJF08vrcvfdcCycs7ztSALjTSDpYs');
  const sh = ss.getSheetByName('Crew Mappings');
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(h => String(h || '').trim());
  const crewCol = headers.indexOf('Crew');
  const urlCol = headers.indexOf('Sheet');

  for (let i = 1; i < values.length; i++) {
    const crew = String(values[i][crewCol] || '').trim();
    const url = String(values[i][urlCol] || '').trim();
    if (!crew || !url) continue;

    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      results.push(`✗ ${crew}: Invalid URL`);
      continue;
    }

    try {
      const crewSs = SpreadsheetApp.openById(match[1]);
      const crewSheet = crewSs.getSheetByName(`${crew} Crew`);
      if (crewSheet) {
        results.push(`✓ ${crew}: OK`);
      } else {
        results.push(`✗ ${crew}: Missing "${crew} Crew" sheet`);
      }
    } catch (err) {
      results.push(`✗ ${crew}: ${err.message}`);
    }
  }

  const html = HtmlService.createHtmlOutput(
    '<pre style="font-size:13px;font-family:monospace;">' +
    results.join('\n') +
    '</pre>'
  ).setWidth(500).setHeight(500);

  SpreadsheetApp.getUi().showModalDialog(html, 'Setup Verification');
}

/**
 * Quick test: trigger a manual sync to verify library is working.
 */
function testSync() {
  try {
    // This will fail if library isn't set up, giving a clear error
    TaskSyncLib.validate();
    SpreadsheetApp.getUi().alert('Library is connected and working!');
  } catch (err) {
    SpreadsheetApp.getUi().alert(
      'Library not connected.\n\n' +
      'Make sure you:\n' +
      '1. Created the TaskSyncLib project\n' +
      '2. Deployed it as a Library\n' +
      '3. Added it to this project with identifier "TaskSyncLib"\n\n' +
      'Error: ' + err.message
    );
  }
}
