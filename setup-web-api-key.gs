/**
 * Run this function ONCE in each crew's Apps Script editor to add WEB_API_KEY
 *
 * Steps:
 * 1. This file will be pushed to all 4 crews via clasp
 * 2. Open each crew's Apps Script editor
 * 3. Select "addWebApiKey" from function dropdown
 * 4. Click Run
 * 5. Check logs to confirm success
 */
function addWebApiKey() {
  const apiKey = 'fce433591b097407735b8396bd5400183bee1715090b17d2e263de99f28e8573';

  PropertiesService.getScriptProperties().setProperty('WEB_API_KEY', apiKey);

  // Verify it was set
  const stored = PropertiesService.getScriptProperties().getProperty('WEB_API_KEY');

  if (stored === apiKey) {
    console.log('✅ WEB_API_KEY successfully added!');
    console.log('Value: ' + apiKey.substring(0, 16) + '...');
  } else {
    console.log('❌ Failed to set WEB_API_KEY');
  }
}
