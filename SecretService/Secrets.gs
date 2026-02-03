/**
 * SECRETS SERVICE
 *
 * Handles access to Script Properties which store sensitive credentials.
 *
 * REQUIRED Script Properties (set in Apps Script Editor -> Project Settings -> Script Properties):
 * - ANNOUNCE_PASSWORD: Password for triggering announcements
 * - X_CONSUMER_KEY: Twitter/X OAuth 1.0a consumer key
 * - X_CONSUMER_SECRET: Twitter/X OAuth 1.0a consumer secret
 * - X_ACCESS_TOKEN: Twitter/X OAuth 1.0a access token
 * - X_ACCESS_TOKEN_SECRET: Twitter/X OAuth 1.0a access token secret
 * - BOT_API_KEY: API key for PizzaDAO Discord bot
 *
 * OPTIONAL Script Properties:
 * - DEFAULT_CHANNEL_WEBHOOK_URL: Fallback Discord webhook if crew webhook not found
 */

/**
 * Gets a required secret from Script Properties.
 * Throws an error if the secret is not found.
 *
 * @param {string} key - The property key
 * @returns {string} - The property value
 * @throws {Error} - If the property is not set
 */
function getSecret_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    throw new Error(`Missing required Script Property: ${key}`);
  }
  return String(value).trim();
}

/**
 * Gets an optional secret from Script Properties.
 * Returns the fallback value if the secret is not found.
 *
 * @param {string} key - The property key
 * @param {string} fallback - Default value if not found
 * @returns {string} - The property value or fallback
 */
function getSecretOptional_(key, fallback = '') {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  return value ? String(value).trim() : fallback;
}

// ============================================
// Twitter/X Credential Accessors
// ============================================

function getTwConsumerKey_() {
  return getSecret_('X_CONSUMER_KEY');
}

function getTwConsumerSecret_() {
  return getSecret_('X_CONSUMER_SECRET');
}

function getTwAccessToken_() {
  return getSecret_('X_ACCESS_TOKEN');
}

function getTwAccessTokenSecret_() {
  return getSecret_('X_ACCESS_TOKEN_SECRET');
}

// ============================================
// Bot API Key Accessor
// ============================================

function getBotApiKey_() {
  return getSecret_('BOT_API_KEY');
}

// ============================================
// X URL Sharing (for Discord posts)
// ============================================

const LAST_X_URL_PROP_KEY = 'LAST_X_URL';

function setLastXUrl_(url) {
  PropertiesService.getScriptProperties().setProperty(
    LAST_X_URL_PROP_KEY,
    String(url || '').trim()
  );
}

function getLastXUrl_() {
  return String(
    PropertiesService.getScriptProperties().getProperty(LAST_X_URL_PROP_KEY) || ''
  ).trim();
}

function clearLastXUrl_() {
  PropertiesService.getScriptProperties().deleteProperty(LAST_X_URL_PROP_KEY);
}

// ============================================
// Setup Helper
// ============================================

/**
 * Lists all required secrets and their status.
 * Run this to check which secrets need to be configured.
 */
function checkSecretsStatus() {
  const required = [
    'ANNOUNCE_PASSWORD',
    'X_CONSUMER_KEY',
    'X_CONSUMER_SECRET',
    'X_ACCESS_TOKEN',
    'X_ACCESS_TOKEN_SECRET',
    'BOT_API_KEY'
  ];

  const optional = [
    'DEFAULT_CHANNEL_WEBHOOK_URL'
  ];

  const props = PropertiesService.getScriptProperties();

  Logger.log('=== Required Secrets ===');
  required.forEach(key => {
    const value = props.getProperty(key);
    const status = value ? 'SET (' + value.length + ' chars)' : 'MISSING';
    Logger.log(key + ': ' + status);
  });

  Logger.log('\n=== Optional Secrets ===');
  optional.forEach(key => {
    const value = props.getProperty(key);
    const status = value ? 'SET (' + value.length + ' chars)' : 'Not set';
    Logger.log(key + ': ' + status);
  });
}

/**
 * Template function for setting up secrets.
 * IMPORTANT: Never commit actual secret values to source control!
 * Run this function after manually setting the values.
 */
function setupSecrets_TEMPLATE() {
  // NEVER COMMIT ACTUAL VALUES - This is just a template
  // Set these values directly in Apps Script Editor:
  // Project Settings -> Script Properties -> Add Property

  const secrets = {
    'ANNOUNCE_PASSWORD': 'YOUR_PASSWORD_HERE',
    'X_CONSUMER_KEY': 'YOUR_CONSUMER_KEY',
    'X_CONSUMER_SECRET': 'YOUR_CONSUMER_SECRET',
    'X_ACCESS_TOKEN': 'YOUR_ACCESS_TOKEN',
    'X_ACCESS_TOKEN_SECRET': 'YOUR_ACCESS_TOKEN_SECRET',
    'BOT_API_KEY': 'YOUR_BOT_API_KEY'
  };

  // Uncomment to set (but NEVER commit with real values)
  // const props = PropertiesService.getScriptProperties();
  // Object.entries(secrets).forEach(([key, value]) => {
  //   props.setProperty(key, value);
  // });

  Logger.log('Template function - do not use directly. Set secrets via Apps Script Editor.');
}
