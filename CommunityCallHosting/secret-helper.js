/**
 * SECRET HELPER FUNCTIONS
 *
 * This file allows the master setup script to push secrets to this project.
 * DO NOT hardcode secrets in this file.
 */

/**
 * Receives secrets from master setup and stores them in Script Properties.
 * Called via Apps Script Execution API from the master spreadsheet.
 *
 * @param {Object} secretsObject - Object with all secrets as key-value pairs
 * @returns {Object} Confirmation of which properties were set
 */
function receiveSecretsAndSetProperties(secretsObject) {
  var props = PropertiesService.getScriptProperties();
  var results = {
    timestamp: new Date().toISOString(),
    propertiesSet: [],
    errors: []
  };

  if (!secretsObject || typeof secretsObject !== 'object') {
    results.errors.push('Invalid input: expected an object with secrets');
    return results;
  }

  // Set each property
  for (var key in secretsObject) {
    if (secretsObject.hasOwnProperty(key)) {
      try {
        props.setProperty(key, secretsObject[key]);
        results.propertiesSet.push(key);
        console.log('Set ' + key);
      } catch (err) {
        results.errors.push(key + ': ' + err.message);
        console.log('Failed to set ' + key + ': ' + err.message);
      }
    }
  }

  console.log('Summary: Set ' + results.propertiesSet.length + ' properties');
  return results;
}

/**
 * Verify that all required properties are set (shows only first 10 chars for security)
 */
function verifySecretsAreSet() {
  var props = PropertiesService.getScriptProperties();
  var expectedKeys = [
    'X_CONSUMER_KEY',
    'X_CONSUMER_SECRET',
    'X_ACCESS_TOKEN',
    'X_ACCESS_TOKEN_SECRET',
    'ANNOUNCE_PASSWORD',
    'BOT_API_KEY',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID'
  ];

  console.log('Verifying script properties:\n');
  var allSet = true;

  for (var i = 0; i < expectedKeys.length; i++) {
    var key = expectedKeys[i];
    var value = props.getProperty(key);
    if (value) {
      console.log('OK: ' + key + ': ' + value.substring(0, 10) + '...');
    } else {
      console.log('MISSING: ' + key);
      allSet = false;
    }
  }

  if (allSet) {
    console.log('\nAll properties are set!');
  } else {
    console.log('\nSome properties are missing. Run setupCommunityCallSecrets from master.');
  }

  return allSet;
}
