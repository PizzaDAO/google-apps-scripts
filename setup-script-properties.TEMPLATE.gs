/**
 * TEMPLATE: Setup Script Properties
 *
 * 1. Copy this file to: setup-script-properties.gs
 * 2. Replace all placeholder values with your actual credentials
 * 3. Add it to .gitignore (already done)
 * 4. Run setupAllScriptProperties() once in Apps Script editor
 * 5. Delete the file after use
 *
 * ⚠️ NEVER commit the actual setup-script-properties.gs file to git!
 */
function setupAllScriptProperties() {
  const props = PropertiesService.getScriptProperties();

  const properties = {
    // Twitter/X API credentials
    'X_CONSUMER_KEY': 'YOUR_TWITTER_CONSUMER_KEY_HERE',
    'X_CONSUMER_SECRET': 'YOUR_TWITTER_CONSUMER_SECRET_HERE',
    'X_ACCESS_TOKEN': 'YOUR_TWITTER_ACCESS_TOKEN_HERE',
    'X_ACCESS_TOKEN_SECRET': 'YOUR_TWITTER_ACCESS_TOKEN_SECRET_HERE',

    // PizzaDAO specific
    'ANNOUNCE_PASSWORD': 'YOUR_PASSWORD_HERE',
    'BOT_API_KEY': 'YOUR_DISCORD_BOT_API_KEY_HERE',

    // Optional: Web API key for website button (generate a random 32+ char string)
    'WEB_API_KEY': 'YOUR_WEB_API_KEY_HERE'
  };

  // Set all properties
  props.setProperties(properties);

  // Verify they were set
  console.log('✅ Script Properties set successfully!');
  console.log('');
  console.log('Verification:');

  for (const key in properties) {
    const value = props.getProperty(key);
    if (value) {
      console.log(`✅ ${key}: ${value.substring(0, 10)}...`);
    } else {
      console.log(`❌ ${key}: NOT SET`);
    }
  }

  console.log('');
  console.log('You can now run setupOnEditSendAllTrigger!');
}

/**
 * Optional: Run this to view all current Script Properties
 */
function viewScriptProperties() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();

  console.log('Current Script Properties:');
  for (const key in all) {
    console.log(`  ${key}: ${all[key].substring(0, 20)}...`);
  }
}
