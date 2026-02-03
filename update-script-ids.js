/**
 * Update Script IDs in Crew Mappings sheet
 * Run: node update-script-ids.js
 */

const SPREADSHEET_ID = '19itGq86BRQTVehKhtRFKwK8gZqjsUQ_bG5cuVmem9HU';
const SHEET_GID = 1752382671;

// Script IDs we know
const SCRIPT_IDS = {
  'Ops': '1dgDCVpK8VpyCnITRW6dM2P0eZcqJtwu3vAs37PhsWXWgbyomOox08rL6',
  'Events': '1_t0Usd6aZHzELOQNbPXNqTjwHLgMxyUL8cUeH2VY8IVZ4cdfYeq8OJEj',
  'Creative': '', // Fill in from .clasp.json
  'Comms': ''     // Fill in from .clasp.json
};

console.log('Known Script IDs:');
console.log(JSON.stringify(SCRIPT_IDS, null, 2));
console.log('\nTo update the Google Sheet:');
console.log(`1. Open: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit?gid=${SHEET_GID}`);
console.log('2. Fill in the "Script" column for each crew with these IDs');
