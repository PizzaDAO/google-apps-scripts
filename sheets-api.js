const { google } = require('googleapis');
const path = require('path');

// Load credentials
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

// Spreadsheet IDs
const MASTER_SPREADSHEET_ID = '1hSzGYowH0qFmODYJF08vrcvfdcCycs7ztSALjTSDpYs';

/**
 * Get authenticated Google Sheets client
 */
async function getAuthClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
  return auth.getClient();
}

/**
 * Get Sheets API instance
 */
async function getSheetsApi() {
  const authClient = await getAuthClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

/**
 * Get Drive API instance
 */
async function getDriveApi() {
  const authClient = await getAuthClient();
  return google.drive({ version: 'v3', auth: authClient });
}

/**
 * Read a range from a spreadsheet
 */
async function readRange(spreadsheetId, range) {
  const sheets = await getSheetsApi();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  return response.data.values;
}

/**
 * Write values to a range
 */
async function writeRange(spreadsheetId, range, values) {
  const sheets = await getSheetsApi();
  const response = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
  return response.data;
}

/**
 * Append a row to a sheet
 */
async function appendRow(spreadsheetId, range, values) {
  const sheets = await getSheetsApi();
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  });
  return response.data;
}

/**
 * Get spreadsheet metadata (sheet names, etc.)
 */
async function getSpreadsheetInfo(spreadsheetId) {
  const sheets = await getSheetsApi();
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
  });
  return response.data;
}

/**
 * Get list of sheet names in a spreadsheet
 */
async function getSheetNames(spreadsheetId) {
  const info = await getSpreadsheetInfo(spreadsheetId);
  return info.sheets.map(s => s.properties.title);
}

/**
 * Test connection by reading Master Tasks
 */
async function testConnection() {
  console.log('Testing connection to Google Sheets API...\n');

  try {
    // Get sheet names
    const sheetNames = await getSheetNames(MASTER_SPREADSHEET_ID);
    console.log('✓ Connected to Master Tasks spreadsheet');
    console.log('  Sheets:', sheetNames.join(', '));

    // Read Crew Mappings
    const crewMappings = await readRange(MASTER_SPREADSHEET_ID, 'Crew Mappings!A:B');
    console.log('\n✓ Crew Mappings:');
    if (crewMappings) {
      crewMappings.forEach((row, i) => {
        if (i === 0) return; // Skip header
        if (row[0]) console.log(`  - ${row[0]}: ${row[1] || 'no URL'}`);
      });
    }

    // Read first few tasks
    const tasks = await readRange(MASTER_SPREADSHEET_ID, 'Master Tasks!A1:E10');
    console.log('\n✓ Sample tasks from Master Tasks:');
    if (tasks) {
      tasks.slice(0, 5).forEach(row => {
        console.log(`  ${row.join(' | ')}`);
      });
    }

    console.log('\n✅ All tests passed! API access is working.');
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('not found')) {
      console.log('\nMake sure you shared the spreadsheet with:');
      console.log('pizzadao-sheets-bot@pizzadao-scripts.iam.gserviceaccount.com');
    }
    return false;
  }
}

// Export functions for use in other scripts
module.exports = {
  getAuthClient,
  getSheetsApi,
  getDriveApi,
  readRange,
  writeRange,
  appendRow,
  getSpreadsheetInfo,
  getSheetNames,
  testConnection,
  MASTER_SPREADSHEET_ID,
};

// Run test if executed directly
if (require.main === module) {
  testConnection();
}
