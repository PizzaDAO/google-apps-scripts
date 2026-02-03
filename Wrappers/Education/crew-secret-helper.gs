/**
 * CREW SECRET HELPER FUNCTION
 *
 * Add this to EVERY crew spreadsheet's Apps Script.
 * This function receives secrets from the master setup script and stores them.
 *
 * DO NOT hardcode secrets in this file.
 * This function is SAFE to have in public scripts because it only receives
 * and stores secrets - it doesn't expose them.
 */

/**
 * Receives secrets from master setup and stores them in Script Properties.
 * Called via Apps Script Execution API from the master spreadsheet.
 *
 * @param {Object} secretsObject - Object with all secrets as key-value pairs
 * @returns {Object} Confirmation of which properties were set
 */
function receiveSecretsAndSetProperties(secretsObject) {
  const props = PropertiesService.getScriptProperties();
  const results = {
    timestamp: new Date().toISOString(),
    propertiesSet: [],
    errors: []
  };

  if (!secretsObject || typeof secretsObject !== 'object') {
    results.errors.push('Invalid input: expected an object with secrets');
    return results;
  }

  // Set each property
  for (const [key, value] of Object.entries(secretsObject)) {
    try {
      props.setProperty(key, value);
      results.propertiesSet.push(key);
      console.log('✅ Set ' + key);
    } catch (err) {
      results.errors.push(key + ': ' + err.message);
      console.log('❌ Failed to set ' + key + ': ' + err.message);
    }
  }

  console.log('Summary: Set ' + results.propertiesSet.length + ' properties');
  return results;
}

/**
 * Optional: Verify that properties were set correctly (shows only first 10 chars)
 */
function verifySecretsAreSet() {
  const props = PropertiesService.getScriptProperties();
  const expectedKeys = [
    'X_CONSUMER_KEY',
    'X_CONSUMER_SECRET',
    'X_ACCESS_TOKEN',
    'X_ACCESS_TOKEN_SECRET',
    'ANNOUNCE_PASSWORD',
    'BOT_API_KEY'
  ];

  console.log('Verifying script properties:\n');
  let allSet = true;

  for (const key of expectedKeys) {
    const value = props.getProperty(key);
    if (value) {
      console.log('✅ ' + key + ': ' + value.substring(0, 10) + '...');
    } else {
      console.log('❌ ' + key + ': NOT SET');
      allSet = false;
    }
  }

  if (allSet) {
    console.log('\n✅ All properties are set!');
  } else {
    console.log('\n❌ Some properties are missing');
  }

  return allSet;
}
