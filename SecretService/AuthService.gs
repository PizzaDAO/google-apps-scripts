/**
 * AUTH SERVICE
 *
 * Handles password validation and rate limiting for the Secret Service.
 */

/**
 * Validates the provided password against the stored ANNOUNCE_PASSWORD.
 * Includes rate limiting to prevent brute force attacks.
 *
 * @param {string} password - The password to validate
 * @returns {boolean} - True if password is valid
 */
function validatePassword_(password) {
  const cache = CacheService.getScriptCache();
  const attemptKey = 'auth_attempts';
  const lockoutKey = 'auth_lockout';

  // Check if currently locked out
  const lockoutUntil = cache.get(lockoutKey);
  if (lockoutUntil && Date.now() < parseInt(lockoutUntil)) {
    Logger.log('Auth locked out until: ' + new Date(parseInt(lockoutUntil)));
    throw new Error('Too many failed attempts. Please try again later.');
  }

  // Get current attempt count
  let attempts = parseInt(cache.get(attemptKey) || '0');

  // Check if max attempts exceeded
  const MAX_ATTEMPTS = 10;
  const LOCKOUT_SECONDS = 300; // 5 minutes
  const ATTEMPT_WINDOW_SECONDS = 300; // 5 minutes

  if (attempts >= MAX_ATTEMPTS) {
    // Set lockout
    const lockoutTime = Date.now() + (LOCKOUT_SECONDS * 1000);
    cache.put(lockoutKey, String(lockoutTime), LOCKOUT_SECONDS);
    cache.remove(attemptKey);
    Logger.log('Auth lockout triggered after ' + attempts + ' attempts');
    throw new Error('Too many failed attempts. Please try again in 5 minutes.');
  }

  // Validate password
  const storedPassword = getSecret_('ANNOUNCE_PASSWORD');

  if (!password || password !== storedPassword) {
    // Increment failure count
    attempts += 1;
    cache.put(attemptKey, String(attempts), ATTEMPT_WINDOW_SECONDS);
    Logger.log('Auth failed. Attempt ' + attempts + ' of ' + MAX_ATTEMPTS);
    return false;
  }

  // Password valid - reset attempt counter
  cache.remove(attemptKey);
  Logger.log('Auth successful');
  return true;
}

/**
 * Validates that the spreadsheet ID is a known crew spreadsheet.
 * This provides an additional layer of security by only allowing
 * requests for registered crew sheets.
 *
 * @param {string} spreadsheetId - The spreadsheet ID to validate
 * @returns {boolean} - True if spreadsheet is known/allowed
 */
function validateSpreadsheetId_(spreadsheetId) {
  if (!spreadsheetId) return false;

  try {
    // Load known spreadsheet IDs from crew mappings
    const knownSheets = getKnownSpreadsheetIds_();

    // Check if this spreadsheet is in the known list
    if (knownSheets.includes(spreadsheetId)) {
      return true;
    }

    // Fallback: try to open the spreadsheet to verify it exists and we have access
    // This is less strict but ensures the service can still work
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const name = ss.getName();

    // Verify it looks like a PizzaDAO crew sheet
    if (name.startsWith('PizzaDAO ') && name.includes('Crew')) {
      Logger.log('Allowing unlisted but valid-looking crew sheet: ' + name);
      return true;
    }

    Logger.log('Rejecting unknown spreadsheet: ' + name);
    return false;

  } catch (err) {
    Logger.log('Spreadsheet validation error: ' + err.message);
    return false;
  }
}

/**
 * Gets the list of known spreadsheet IDs from crew mappings.
 * Uses caching to avoid repeated lookups.
 *
 * @returns {string[]} - Array of known spreadsheet IDs
 */
function getKnownSpreadsheetIds_() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'known_spreadsheet_ids';

  const cached = cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  try {
    const mappings = loadCrewMappings_();
    const ids = mappings
      .map(m => m.spreadsheetId)
      .filter(id => id && id.trim());

    // Cache for 10 minutes
    cache.put(cacheKey, JSON.stringify(ids), 600);
    return ids;

  } catch (err) {
    Logger.log('Could not load known spreadsheet IDs: ' + err.message);
    return [];
  }
}

/**
 * Clears all auth-related cache entries.
 * Useful for testing or manual reset.
 */
function clearAuthCache() {
  const cache = CacheService.getScriptCache();
  cache.remove('auth_attempts');
  cache.remove('auth_lockout');
  Logger.log('Auth cache cleared');
}

/**
 * Gets current auth status for debugging.
 */
function getAuthStatus() {
  const cache = CacheService.getScriptCache();
  const attempts = cache.get('auth_attempts') || '0';
  const lockout = cache.get('auth_lockout');

  return {
    attempts: parseInt(attempts),
    lockedOut: lockout ? Date.now() < parseInt(lockout) : false,
    lockoutUntil: lockout ? new Date(parseInt(lockout)).toISOString() : null
  };
}
