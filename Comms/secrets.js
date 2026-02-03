/**
 * SECRETS MODULE
 *
 * Provides lazy-loaded access to Script Properties.
 * NEVER hardcode secrets - store them in: Apps Script → Project Settings → Script properties
 *
 * Required properties:
 * - ANNOUNCE_PASSWORD
 * - X_CONSUMER_KEY, X_CONSUMER_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
 * - BOT_API_KEY
 *
 * Optional properties:
 * - DEFAULT_CHANNEL_WEBHOOK_URL
 * - WEB_API_KEY
 */

/**
 * Gets a required secret from Script Properties.
 * Throws if not found.
 */
function getSecret_(key) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error(`Missing required Script Property: ${key}`);
  return String(v).trim();
}

/**
 * Gets an optional secret from Script Properties.
 * Returns fallback if not found.
 */
function getSecretOptional_(key, fallback = "") {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  return v ? String(v).trim() : fallback;
}

// ============================================
// LAZY-LOADED CREDENTIAL GETTERS
// These avoid errors when running setup functions
// ============================================

function getPassword_() {
  return getSecret_('ANNOUNCE_PASSWORD');
}

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

function getBotApiKey_() {
  return getSecret_('BOT_API_KEY');
}
