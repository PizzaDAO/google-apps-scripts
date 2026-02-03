/**
 * =============================================================================
 * SECRETS & ENV CONFIG (Google Apps Script)
 * =============================================================================
 * This script uses Google Apps Script **Script Properties** as a `.env`-style
 * secrets store. Do NOT hardcode secrets in this file.
 *
 * Where to set secrets:
 *   Apps Script Editor → Project Settings → Script properties
 *
 * REQUIRED Script Properties
 * -----------------------------------------------------------------------------
 * ANNOUNCE_PASSWORD
 *   - Password required to run Discord + Tweet actions from the sheet ("Send" flow)
 *
 * X_CONSUMER_KEY
 * X_CONSUMER_SECRET
 * X_ACCESS_TOKEN
 * X_ACCESS_TOKEN_SECRET
 *   - X (Twitter) OAuth 1.0a credentials used for media upload + tweet posting
 *
 * BOT_API_KEY
 *   - API key used to authenticate requests to the PizzaDAO Discord bot endpoints
 *
 * OPTIONAL Script Properties
 * -----------------------------------------------------------------------------
 * DEFAULT_CHANNEL_WEBHOOK_URL
 *   - Fallback Discord webhook URL if a crew-specific webhook is missing
 *
 * How secrets are accessed in code (recommended helpers)
 * -----------------------------------------------------------------------------
 *   function getSecret_(key) {
 *     const v = PropertiesService.getScriptProperties().getProperty(key);
 *     if (!v) throw new Error(`Missing required Script Property: ${key}`);
 *     return String(v).trim();
 *   }
 *
 *   function getSecretOptional_(key, fallback = "") {
 *     const v = PropertiesService.getScriptProperties().getProperty(key);
 *     return v ? String(v).trim() : fallback;
 *   }
 *
 * Example usage:
 *   const PASSWORD = getSecret_('ANNOUNCE_PASSWORD');
 *   const TW_CONSUMER_KEY = getSecret_('X_CONSUMER_KEY');
 *   const BOT_API_KEY = getSecret_('BOT_API_KEY');
 *   const DEFAULT_CHANNEL_WEBHOOK_URL = getSecretOptional_('DEFAULT_CHANNEL_WEBHOOK_URL', '');
 *
 * SECURITY NOTES
 * -----------------------------------------------------------------------------
 * - Never commit secrets into the repository.
 * - If secrets were ever committed, rotate them immediately.
 * - Script Properties are not visible to spreadsheet viewers.
 * - Installed triggers (onEdit/time-based) still have access to Script Properties.
 * =============================================================================
 */

/**
 * ID of the template spreadsheet to copy.
 */
const TEMPLATE_SPREADSHEET_ID = '1mzh9FXF4jiJOcL_45uxtLuohp5hIPbT006AAVZ_zT3U';

/***********************
 * SECRETS (".env"-style)
 * Store these in: Apps Script → Project Settings → Script properties
 ***********************/
function getSecret_(key) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error(`Missing required Script Property: ${key}`);
  return String(v).trim();
}

function getSecretOptional_(key, fallback = "") {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  return v ? String(v).trim() : fallback;
}

/**
 * Add custom menu on open.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Custom Tools')
    .addItem('Create shared copy & link cell', 'createSharedCopyForSelectedCell')
    .addToUi();
}

/**
 * Creates a copy of the template spreadsheet, names it exactly
 * the selected cell’s text, makes it editable by anyone,
 * and hyperlinks the cell to that copy.
 */
function createSharedCopyForSelectedCell() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getActiveSheet();
  const cell = sheet.getActiveCell();

  if (!cell) {
    ui.alert('Please select a cell before running this function.');
    return;
  }

  let displayText = cell.getDisplayValue().trim();

  if (!displayText) {
    const response = ui.prompt(
      'Sheet Name Required',
      'The selected cell is empty. Enter the name for the new sheet:',
      ui.ButtonSet.OK_CANCEL
    );

    if (response.getSelectedButton() !== ui.Button.OK) return;

    displayText = response.getResponseText().trim();
    if (!displayText) {
      ui.alert('A valid name is required.');
      return;
    }

    // Write the name into the cell so it becomes the hyperlink text.
    cell.setValue(displayText);
  }

  // Get the template file.
  const templateFile = DriveApp.getFileById(TEMPLATE_SPREADSHEET_ID);

  // Put the copy in the same folder as the template (or My Drive if none).
  let parentFolder;
  const parents = templateFile.getParents();
  if (parents.hasNext()) {
    parentFolder = parents.next();
  } else {
    parentFolder = DriveApp.getRootFolder();
  }

  // Create the copy and name it after the cell text.
  const copyFile = templateFile.makeCopy(displayText, parentFolder);

  // Make it editable by anyone with the link.
  copyFile.setSharing(
    DriveApp.Access.ANYONE_WITH_LINK,
    DriveApp.Permission.EDIT
  );

  // Link the selected cell text to the new file.
  const richText = SpreadsheetApp
    .newRichTextValue()
    .setText(displayText)
    .setLinkUrl(copyFile.getUrl())
    .build();

  cell.setRichTextValue(richText);
}

/**
 * Runs startDiscordEvent, postCrewToDiscord, and sendCrewTweet
 * when the cell to the RIGHT of the "Announce?" label is edited to "Send",
 * using the exact same password + bypass logic as your Community Call script.
 *
 * ✅ Requires INSTALLED onEdit trigger (for UI prompt).
 * Apps Script → Triggers → Add Trigger → onEdit → From spreadsheet → On edit
 *
 * Assumes these functions exist somewhere in the same Apps Script project:
 *   - startDiscordEvent()
 *   - postCrewToDiscord()
 *   - sendCrewTweet()
 */

// Password gate + labels (match your script)
const SEND_LABEL_TEXT = 'Announce?';
const SEND_VALUE = 'Send';
const SENT_VALUE = 'Sent';
const LAST_SENT_LABEL_TEXT = 'Last Sent:';

// Lazy-load password to avoid errors when running setup functions
function getPassword_() {
  return getSecret_('ANNOUNCE_PASSWORD');
}

// Internal: prevents the script's own setValue() from re-triggering the password prompt
const BYPASS_PROP_KEY = 'BYPASS_NEXT_ONEDIT';

// === Share X URL from sendAll -> postCrewToDiscord ===
const LAST_X_URL_PROP_KEY = 'LAST_X_URL';

function setLastXUrl_(url) {
  PropertiesService.getScriptProperties().setProperty(LAST_X_URL_PROP_KEY, String(url || '').trim());
}

function getLastXUrl_() {
  return String(PropertiesService.getScriptProperties().getProperty(LAST_X_URL_PROP_KEY) || '').trim();
}

function clearLastXUrl_() {
  PropertiesService.getScriptProperties().deleteProperty(LAST_X_URL_PROP_KEY);
}

/**
 * Installed trigger entrypoint.
 * Fires when the cell to the RIGHT of "Announce?" becomes "Send".
 */
function sendAll(e) {
  const props = PropertiesService.getScriptProperties();

  // Skip the next onEdit if we just edited the sheet from the script (prevents double prompt)
  if (props.getProperty(BYPASS_PROP_KEY) === '1') {
    props.deleteProperty(BYPASS_PROP_KEY);
    return;
  }

  try {
    if (!e || !e.range) return;

    const sheet = e.range.getSheet();

    // single-cell edits only
    if (e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;

    const newValue = String(e.value || '').trim();
    if (newValue !== SEND_VALUE) return;

    // Find label cell and verify edit is to its immediate right
    const labelCell = findCellWithText_(sheet, SEND_LABEL_TEXT);
    if (!labelCell) return;

    const sendCell = labelCell.offset(0, 1);
    if (e.range.getRow() !== sendCell.getRow() || e.range.getColumn() !== sendCell.getColumn()) {
      return;
    }

    const ui = SpreadsheetApp.getUi();
    const resp = ui.prompt(
      'Password Required',
      'Enter password to run Discord + Crew + Tweet actions:',
      ui.ButtonSet.OK_CANCEL
    );

    // Cancel: clear the send cell
    if (resp.getSelectedButton() !== ui.Button.OK) {
      setBypassThenSetValue_(props, sendCell, '');
      return;
    }

    const entered = String(resp.getResponseText() || '').trim();
    if (entered !== getPassword_()) {
      ui.alert('Incorrect password. Actions not run.');
      setBypassThenSetValue_(props, sendCell, '');
      return;
    }

    // === RUN YOUR 4 FUNCTIONS ===
    // Tweet first so we have the URL for Discord
    startDiscordEvent();

    const xUrl = sendCrewTweet(); // now returns URL
    setLastXUrl_(xUrl);

    // Discord can include X URL in its posts
    postCrewToDiscord();

    // optional: clear after posting so it doesn't leak into later runs
    clearLastXUrl_();

    // Take attendance and schedule burst
    takeAttendanceNowAndScheduleBurst();

    // Mark as Sent
    setBypassThenSetValue_(props, sendCell, SENT_VALUE);

    // Write timestamp next to "Last Sent:"
    const lastSentLabelCell = findCellWithText_(sheet, LAST_SENT_LABEL_TEXT);
    if (lastSentLabelCell) {
      const tsCell = lastSentLabelCell.offset(0, 1);
      const tz = Session.getScriptTimeZone();
      const stamp = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
      setBypassThenSetValue_(props, tsCell, stamp);
    }

    ui.alert('Ran: startDiscordEvent + postCrewToDiscord + sendCrewTweet + started attendance burst ✅');
  } catch (err) {
    try {
      SpreadsheetApp.getUi().alert(`Error: ${err && err.message ? err.message : err}`);
    } catch (_) { }
    console.error(err);
  }
}

/**
 * Finds the first cell in the sheet whose display value exactly matches `text`
 * (trimmed, case-insensitive). Searches the used range.
 */
function findCellWithText_(sheet, text) {
  const target = String(text || '').trim().toLowerCase();
  if (!target) return null;

  const range = sheet.getDataRange();
  const vals = range.getDisplayValues();

  for (let r = 0; r < vals.length; r++) {
    for (let c = 0; c < vals[0].length; c++) {
      if (String(vals[r][c] || '').trim().toLowerCase() === target) {
        return range.getCell(r + 1, c + 1);
      }
    }
  }
  return null;
}

/**
 * Helper: sets bypass flag then sets a cell value.
 * This prevents the subsequent onEdit (caused by setValue) from prompting again.
 */
function setBypassThenSetValue_(props, cell, value) {
  props.setProperty(BYPASS_PROP_KEY, '1');
  cell.setValue(value);
}

/***********************
 * CONFIG
 ***********************/
// ====== CONFIG: X app credentials (Script Properties) ======
// Lazy-loaded to avoid errors when running setup functions
function getTwConsumerKey_() { return getSecret_('X_CONSUMER_KEY'); }
function getTwConsumerSecret_() { return getSecret_('X_CONSUMER_SECRET'); }
function getTwAccessToken_() { return getSecret_('X_ACCESS_TOKEN'); }
function getTwAccessTokenSecret_() { return getSecret_('X_ACCESS_TOKEN_SECRET'); }

// Drive folder containing subfolders of GIFs
const DRIVE_GIF_FOLDER_ID = '1DgzVx8aL6PgPm0-Np9gQMPywUEBVBxuA';

// Spreadsheet used for Crew->Emoji lookup (2nd sheet: Col E crew, Col F emoji)
const CREW_LOOKUP_SPREADSHEET_ID = '19itGq86BRQTVehKhtRFKwK8gZqjsUQ_bG5cuVmem9HU';
const CREW_LOOKUP_SHEET_INDEX = 2; // second sheet (1-based index)

// Hard cap for GIF file size (bytes) — 5,242,880 = 5MB
const MAX_GIF_BYTES = 5242880;

// How many different random picks to try before failing
const MAX_PICK_ATTEMPTS = 50;

/***********************
 * MAIN
 ***********************/
function sendTweetFromSheet(text) {
  const mediaId = uploadRandomGifFromDriveFolder_(DRIVE_GIF_FOLDER_ID);

  const url = 'https://api.twitter.com/2/tweets';
  const method = 'POST';

  const payload = {
    text: String(text || ''),
    media: { media_ids: [mediaId] }
  };

  // For v2 JSON tweet create, signature includes only OAuth params (no body params)
  const authHeader = buildOAuth1Header_(method, url, {});

  const params = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: authHeader },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, params);
  Logger.log('Tweet status: ' + response.getResponseCode());
  Logger.log('Tweet body: ' + response.getContentText());

  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Tweet failed (' + code + '): ' + response.getContentText());
  }
}

/***********************
 * DEBUG: Run manually
 ***********************/
function sendCrewTweet(spreadsheet) {
  const crew = getCrewLookupStringFromActiveSpreadsheet_(spreadsheet);
  const emoji = lookupEmojiForCrew_(crew);

  const message =
    `${emoji}🏴‍☠️🤙\n` +
    `${crew} call starts now!\n` +
    `discord.pizzadao.xyz`;

  // Post + return the tweet URL
  return sendTweetWithCrewGif_(crew, message);
}

/***********************
 * SHEETS TRIGGER: D3 -> TRUE
 * (Now posts the standardized message + crew GIF)
 ***********************/
function onEdit(e) {
  if (!e) return; // prevents crashes when run manually

  const sheet = e.source.getActiveSheet();
  const range = e.range;

  const TRIGGER_ROW = 3;
  const TRIGGER_COL = 4; // Column D

  if (range.getRow() !== TRIGGER_ROW || range.getColumn() !== TRIGGER_COL) return;

  const value = range.getValue();
  if (value !== true) return;

  // Determine crew + emoji
  const crew = getCrewLookupStringFromActiveSpreadsheet_();
  const emoji = lookupEmojiForCrew_(crew);

  // Build message exactly as requested
  const message =
    `${emoji}🏴‍☠️🤙\n` +
    `${crew} call starts now!\n` +
    `discord.pizzadao.xyz`;

  // Tweet with GIF from crew subfolder
  // NOTE: if you also want the onEdit tweet trigger to set LAST_X_URL for Discord,
  // you can wrap this similarly, but it currently just tweets.
  sendTweetWithCrewGif_(crew, message);
}

/***********************
 * Tweet with GIF from crew-named subfolder
 * NOW RETURNS THE TWEET URL
 ***********************/
function sendTweetWithCrewGif_(crew, message) {
  const mediaId = uploadRandomGifFromCrewSubfolder_(DRIVE_GIF_FOLDER_ID, crew);

  const url = 'https://api.twitter.com/2/tweets';
  const method = 'POST';

  const payload = {
    text: String(message || ''),
    media: { media_ids: [mediaId] }
  };

  const authHeader = buildOAuth1Header_(method, url, {});

  const params = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: authHeader },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, params);
  const code = response.getResponseCode();
  const body = response.getContentText();

  Logger.log('Tweet status: ' + code);
  Logger.log('Tweet body: ' + body);

  if (code < 200 || code >= 300) {
    throw new Error('Tweet failed (' + code + '): ' + body);
  }

  const json = JSON.parse(body || '{}');
  const tweetId = json.data && json.data.id ? String(json.data.id) : '';
  if (!tweetId) throw new Error('Tweet create response missing tweet id: ' + body);

  // Always works, even without knowing username
  return `https://x.com/i/web/status/${tweetId}`;
}

/***********************
 * Crew name derivation
 * - Uses active spreadsheet name
 * - Removes "PizzaDAO " prefix
 * - Removes " Crew" suffix
 ***********************/
function getCrewLookupStringFromActiveSpreadsheet_(spreadsheet) {
  const ss = spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  const name = String(ss.getName() || '').trim();

  let crew = name;

  if (crew.startsWith('PizzaDAO ')) {
    crew = crew.substring('PizzaDAO '.length);
  }
  if (crew.endsWith(' Crew')) {
    crew = crew.substring(0, crew.length - ' Crew'.length);
  }

  crew = crew.trim();
  if (!crew) throw new Error('Could not derive Crew lookup string from spreadsheet name: "' + name + '"');

  Logger.log('Spreadsheet name: ' + name);
  Logger.log('Crew lookup string: ' + crew);
  return crew;
}

/***********************
 * Emoji lookup
 * Uses roster spreadsheet 2nd sheet:
 * - Finds "Crew" column by header
 * - Finds "Emoji" column by header
 ***********************/
function lookupEmojiForCrew_(crew) {
  const ss = SpreadsheetApp.openById(CREW_LOOKUP_SPREADSHEET_ID);
  const sheet = ss.getSheets()[CREW_LOOKUP_SHEET_INDEX - 1];
  if (!sheet) throw new Error('Crew lookup sheet not found at index ' + CREW_LOOKUP_SHEET_INDEX);

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) throw new Error('Crew lookup sheet is empty.');

  // Read all data including headers
  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map(h => String(h || '').trim().toLowerCase());

  // Find column indices by header name
  const crewColIndex = headers.indexOf('crew');
  const emojiColIndex = headers.indexOf('emoji');

  if (crewColIndex === -1) {
    Logger.log('Could not find "Crew" column header. Headers: ' + JSON.stringify(headers));
    return '🍕';
  }
  if (emojiColIndex === -1) {
    Logger.log('Could not find "Emoji" column header. Headers: ' + JSON.stringify(headers));
    return '🍕';
  }

  // Search for crew (skip header row)
  for (let i = 1; i < values.length; i++) {
    const rowCrew = String(values[i][crewColIndex] || '').trim();
    const rowEmoji = String(values[i][emojiColIndex] || '').trim();
    if (rowCrew && rowCrew.toLowerCase() === crew.toLowerCase()) {
      Logger.log('Emoji lookup match: crew="' + rowCrew + '" emoji="' + rowEmoji + '"');
      return rowEmoji || '🍕';
    }
  }

  Logger.log('No emoji found for crew "' + crew + '". Using default 🍕');
  return '🍕';
}

/***********************
 * DRIVE: Find crew subfolder and pick random GIF under size cap
 ***********************/
function uploadRandomGifFromCrewSubfolder_(parentFolderId, crewFolderName) {
  const crewFolder = findSubfolderByName_(parentFolderId, crewFolderName);
  const file = pickRandomGifFileUnderSize_(crewFolder.getId(), MAX_GIF_BYTES, MAX_PICK_ATTEMPTS);

  const size = file.getSize();
  Logger.log('Selected GIF: ' + file.getName() + ' (' + size + ' bytes) from folder "' + crewFolderName + '"');

  const blob = file.getBlob();
  try { blob.setContentType('image/gif'); } catch (err) { }

  return twitterUploadMediaSimple_(blob);
}

function findSubfolderByName_(parentFolderId, folderName) {
  const parent = DriveApp.getFolderById(parentFolderId);
  const iter = parent.getFoldersByName(folderName);

  if (!iter.hasNext()) {
    // Helpful debugging: list a few folder names
    const all = parent.getFolders();
    const names = [];
    let count = 0;
    while (all.hasNext() && count < 30) {
      names.push(all.next().getName());
      count++;
    }
    throw new Error(
      'No subfolder named "' + folderName + '" found under ' + parentFolderId +
      '. First few subfolders seen: ' + JSON.stringify(names)
    );
  }

  const folder = iter.next();
  // If there are multiple with same name, we take the first.
  return folder;
}

/***********************
 * BACKWARD COMPAT: original random GIF upload (unused now)
 ***********************/
function uploadRandomGifFromDriveFolder_(folderId) {
  const file = pickRandomGifFileUnderSize_(folderId, MAX_GIF_BYTES, MAX_PICK_ATTEMPTS);

  const size = file.getSize();
  Logger.log('Selected GIF: ' + file.getName() + ' (' + size + ' bytes)');

  const blob = file.getBlob();
  try { blob.setContentType('image/gif'); } catch (err) { }

  return twitterUploadMediaSimple_(blob);
}

/**
 * Picks a random GIF file from a Drive folder that is <= maxBytes.
 * Tries up to maxAttempts random picks.
 */
function pickRandomGifFileUnderSize_(folderId, maxBytes, maxAttempts) {
  const folder = DriveApp.getFolderById(folderId);
  const iter = folder.getFilesByType(MimeType.GIF);

  const files = [];
  while (iter.hasNext()) files.push(iter.next());

  if (files.length === 0) throw new Error('No GIF files found in folder: ' + folderId);

  const eligible = files.filter(f => f.getSize() <= maxBytes);
  if (eligible.length > 0) {
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  const attempts = Math.min(maxAttempts, files.length * 3);
  for (let i = 0; i < attempts; i++) {
    const f = files[Math.floor(Math.random() * files.length)];
    if (f.getSize() <= maxBytes) return f;
  }

  const largestAllowedMb = (maxBytes / (1024 * 1024)).toFixed(2);
  throw new Error(
    'No GIFs <= ' + maxBytes + ' bytes (' + largestAllowedMb + 'MB) found in folder ' + folderId +
    '. Upload smaller GIFs or raise MAX_GIF_BYTES.'
  );
}

/***********************
 * X MEDIA UPLOAD (v1.1): SIMPLE upload (best for <=5MB)
 ***********************/
function twitterUploadMediaSimple_(blob) {
  const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';

  // media is binary; do not include it in signature params
  const sigParams = {};
  const authHeader = buildOAuth1Header_('POST', uploadUrl, sigParams);

  const resp = UrlFetchApp.fetch(uploadUrl, {
    method: 'post',
    headers: { Authorization: authHeader },
    payload: { media: blob }, // multipart
    muteHttpExceptions: true
  });

  const code = resp.getResponseCode();
  const text = resp.getContentText();

  Logger.log('MEDIA upload status: ' + code);
  Logger.log('MEDIA upload body: ' + text);

  if (code < 200 || code >= 300) {
    throw new Error('Media upload failed (' + code + '): ' + text);
  }

  const json = JSON.parse(text || '{}');
  const mediaId = json.media_id_string || (json.media_id ? String(json.media_id) : null);
  if (!mediaId) throw new Error('Media upload missing media_id: ' + text);

  return mediaId;
}

/***********************
 * OAuth 1.0a signing + header
 ***********************/
function buildOAuth1Header_(method, url, requestParams) {
  const baseUrl = normalizeUrl_(url);
  const queryParams = parseQueryParams_(url);

  const oauthParams = {
    oauth_consumer_key: getTwConsumerKey_(),
    oauth_nonce: generateNonce_(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: getTwAccessToken_(),
    oauth_version: '1.0'
  };

  const sigParams = Object.assign({}, oauthParams, queryParams, requestParams || {});
  const baseString = buildSignatureBaseString_(method, baseUrl, sigParams);

  const signingKey =
    percentEncode_(getTwConsumerSecret_()) + '&' + percentEncode_(getTwAccessTokenSecret_());

  const rawSig = Utilities.computeHmacSignature(
    Utilities.MacAlgorithm.HMAC_SHA_1,
    baseString,
    signingKey
  );

  oauthParams.oauth_signature = Utilities.base64Encode(rawSig);
  return buildAuthHeader_(oauthParams);
}

function buildSignatureBaseString_(method, url, params) {
  const paramString = Object.keys(params)
    .sort()
    .map(k => percentEncode_(k) + '=' + percentEncode_(params[k]))
    .join('&');

  return [
    method.toUpperCase(),
    percentEncode_(url),
    percentEncode_(paramString)
  ].join('&');
}

function buildAuthHeader_(oauthParams) {
  return 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map(k => percentEncode_(k) + '="' + percentEncode_(oauthParams[k]) + '"')
    .join(', ');
}

function parseQueryParams_(url) {
  const out = {};
  const q = (url.split('?')[1] || '').trim();
  if (!q) return out;

  q.split('&').forEach(pair => {
    const [k, v] = pair.split('=');
    if (!k) return;
    out[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });

  return out;
}

function normalizeUrl_(url) {
  return url.split('?')[0];
}

function percentEncode_(str) {
  return encodeURIComponent(String(str))
    .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function generateNonce_() {
  return Utilities.getUuid().replace(/-/g, '');
}

function postCrewToDiscord(spreadsheet) {
  /**
   * ============================================================
   * Webhooks now come ONLY from:
   *   https://docs.google.com/spreadsheets/d/1bSLN2mL1K-qr3nLiURVjhm31Zxn0J3ta1Pq0txlXsPI/edit?gid=0
   * Columns: Crew | Webhook
   *
   * Crew/Role/Turtles/etc come ONLY from "Crew Mappings" tab:
   *   https://docs.google.com/spreadsheets/d/19itGq86BRQTVehKhtRFKwK8gZqjsUQ_bG5cuVmem9HU/edit?gid=1752382671
   * Columns: Crew | Turtles | Role | Channel | Event | Emoji | Sheet
   * ============================================================
   */

  // === Webhook lookup sheet (Crew -> Webhook) ===
  const CREW_WEBHOOKS_SPREADSHEET_ID = '1bSLN2mL1K-qr3nLiURVjhm31Zxn0J3ta1Pq0txlXsPI';
  const CREW_WEBHOOKS_SHEET_GID = 0; // gid=0

  // Keys to use in that sheet for fixed destinations
  const GENERAL_CREW_KEY = 'GENERAL';
  const BAND_CREW_KEY = 'BAND';

  // === Crew mappings sheet ===
  const CREW_MAPPINGS_SPREADSHEET_ID = '19itGq86BRQTVehKhtRFKwK8gZqjsUQ_bG5cuVmem9HU';
  const CREW_MAPPINGS_SHEET_NAME = 'Crew Mappings';

  // General channel role tag (kept as a constant; change if you prefer it in Crew Mappings too)
  const GENERAL_ROLE_TAG = '<@&815976604710469692>';

  // Fallbacks if lookups fail
  const DEFAULT_CHANNEL_WEBHOOK_URL = getSecretOptional_('DEFAULT_CHANNEL_WEBHOOK_URL', ''); // optional
  const DEFAULT_CHANNEL_ROLE_TAG = '<@&1254491244214620190>'; // OPS fallback

  // Turtle Role Tags (must be strings)
  const TURTLE_TAGS = {
    RAPHAEL: '<@&815277786012975134>',
    LEONARDO: '<@&815269418305191946>',
    MICHELANGELO: '<@&815277933622591531>',
    DONATELLO: '<@&815277900492046356>',
    APRIL: '<@&815976204900499537>'
  };

  // === Muscle roster lookup sheet (Muscle ID -> Discord tag) ===
  const MUSCLE_ROSTER_SPREADSHEET_ID = '16BBOfasVwz8L6fPMungz_Y0EfF6Z9puskLAix3tCHzM';
  const MUSCLE_ROSTER_SHEET_INDEX = 1;  // SECOND sheet (0-based index)
  const MUSCLE_ROSTER_HEADER_ROW = 12;  // row where roster headers live

  // Debug knobs
  const DEBUG = true;
  const DEBUG_MAX_OWNER_LOOKUPS = 50;
  const DEBUG_SAMPLE_ROSTER_KEYS = 20;
  const DEBUG_PRINT_HEADERS = true;

  // === GET SHEET DATA ===
  const ss = spreadsheet || SpreadsheetApp.getActiveSpreadsheet();

  // We read tasks from the FIRST sheet in the spreadsheet
  const firstSheet = ss.getSheets()[0];
  const sheet = firstSheet;

  // Spreadsheet display name + URL for linking in Discord posts
  const SHEET_NAME = ss.getName();
  const SHEET_URL = ss.getUrl();

  if (DEBUG) {
    console.log('=== DEBUG START ===');
    console.log('[Active Spreadsheet]', SHEET_NAME);
    console.log('[Active Spreadsheet URL]', SHEET_URL);
    console.log('[Task Sheet Tab]', sheet.getName(), 'gid:', sheet.getSheetId());
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    console.log('First sheet is empty.');
    return;
  }

  // === normalizers ===
  const normalizeForMatch_ = (s) =>
    String(s || '').trim().replace(/\s+/g, '').toLowerCase();

  // === Webhook lookup loader (Crew -> Webhook) ===
  function loadCrewWebhookMap_() {
    const cache = CacheService.getScriptCache();
    const cacheKey = 'crewWebhooks_v2';
    const cached = cache.get(cacheKey);
    if (cached) {
      const obj = JSON.parse(cached);
      return new Map(Object.entries(obj));
    }

    const whSs = SpreadsheetApp.openById(CREW_WEBHOOKS_SPREADSHEET_ID);
    const whSheet =
      whSs.getSheets().find(s => String(s.getSheetId()) === String(CREW_WEBHOOKS_SHEET_GID)) ||
      whSs.getSheets()[0];

    const lr = whSheet.getLastRow();
    const lc = whSheet.getLastColumn();
    if (lr < 2) return new Map();

    const values = whSheet.getRange(1, 1, lr, lc).getValues();
    const headers = values[0].map(h => String(h || '').trim());
    const headerNorm = headers.map(h => normalizeForMatch_(h));

    const iCrew = headerNorm.indexOf('crew');
    const iWebhook = headerNorm.indexOf('webhook');
    if (iCrew === -1 || iWebhook === -1) {
      throw new Error('Webhook sheet must have headers: "Crew" and "Webhook".');
    }

    const map = new Map();
    for (let r = 1; r < values.length; r++) {
      const crew = String(values[r][iCrew] ?? '').trim();
      const webhook = String(values[r][iWebhook] ?? '').trim();
      if (!crew || !webhook) continue;
      map.set(normalizeForMatch_(crew), webhook);
    }

    const obj = {};
    for (const [k, v] of map.entries()) obj[k] = v;
    cache.put(cacheKey, JSON.stringify(obj), 600);

    return map;
  }

  // === Crew mappings loader ===
  function loadCrewMappings_() {
    const cache = CacheService.getScriptCache();
    const cacheKey = 'crewMappings_v2';
    const cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const mapSs = SpreadsheetApp.openById(CREW_MAPPINGS_SPREADSHEET_ID);
    const mapSheet = mapSs.getSheetByName(CREW_MAPPINGS_SHEET_NAME) || mapSs.getSheets()[0];

    const lr = mapSheet.getLastRow();
    const lc = mapSheet.getLastColumn();
    if (lr < 2) return [];

    const values = mapSheet.getRange(1, 1, lr, lc).getValues();
    const headers = values[0].map(h => String(h || '').trim());
    const headerNorm = headers.map(h => normalizeForMatch_(h));
    const idx = (name) => headerNorm.indexOf(normalizeForMatch_(name));

    const iCrew = idx('Crew');
    const iTurtles = idx('Turtles');
    const iRole = idx('Role');
    const iChannel = idx('Channel');
    const iEvent = idx('Event');
    const iEmoji = idx('Emoji');
    const iSheet = idx('Sheet');

    if (iCrew === -1) throw new Error('Crew Mappings must have a "Crew" column.');

    const out = [];
    for (let r = 1; r < values.length; r++) {
      const row = values[r];
      const crew = String(row[iCrew] ?? '').trim();
      if (!crew) continue;

      out.push({
        crew,
        crewNorm: normalizeForMatch_(crew),
        turtles: String(row[iTurtles] ?? '').trim(),
        role: String(row[iRole] ?? '').trim(),
        channel: String(row[iChannel] ?? '').trim(),
        event: String(row[iEvent] ?? '').trim(),
        emoji: String(row[iEmoji] ?? '').trim(),
        sheetKey: String(row[iSheet] ?? '').trim(),
        sheetKeyNorm: normalizeForMatch_(String(row[iSheet] ?? '').trim())
      });
    }

    cache.put(cacheKey, JSON.stringify(out), 600);
    return out;
  }

  function findBestCrewMappingForSpreadsheetName_(spreadsheetName) {
    const nameNorm = normalizeForMatch_(spreadsheetName);
    const mappings = loadCrewMappings_();

    let best = null;

    for (const m of mappings) {
      // Prefer matching by "Sheet" column if present
      if (m.sheetKeyNorm && nameNorm.includes(m.sheetKeyNorm)) {
        if (!best || m.sheetKeyNorm.length > (best.sheetKeyNorm || '').length) best = m;
        continue;
      }
      // Fallback: match by "Crew"
      if (m.crewNorm && nameNorm.includes(m.crewNorm)) {
        if (!best || m.crewNorm.length > (best.crewNorm || '').length) best = m;
      }
    }

    return best;
  }

  // === Turtle parsing ===
  function parseTurtleToken_(token) {
    const t = String(token || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!t) return null;

    if (t === 'RAPH' || t === 'RAPHAEL') return 'RAPHAEL';
    if (t === 'LEO' || t === 'LEONARDO') return 'LEONARDO';
    if (t === 'MIKE' || t === 'MICHELANGELO') return 'MICHELANGELO';
    if (t === 'DON' || t === 'DONATELLO') return 'DONATELLO';
    if (TURTLE_TAGS[t]) return t;

    return null;
  }

  function turtleTagsFromCrewMapping_(m) {
    if (!m?.turtles) return [];
    const turtleKeys = String(m.turtles)
      .split(',')
      .map(parseTurtleToken_)
      .filter(Boolean);

    const tags = [];
    const seen = new Set();
    for (const k of turtleKeys) {
      const tag = TURTLE_TAGS[k];
      if (tag && !seen.has(tag)) {
        seen.add(tag);
        tags.push(tag);
      }
    }
    return tags;
  }

  // === Resolve crew + role + turtles via Crew Mappings ===
  const crewMapping = findBestCrewMappingForSpreadsheetName_(SHEET_NAME);
  const crewName = crewMapping?.crew || '(Unknown Crew)';
  const crewNorm = crewMapping?.crewNorm || '';

  // === Resolve webhooks via Crew->Webhook sheet ===
  const crewWebhookMap = loadCrewWebhookMap_();

  const GENERAL_WEBHOOK_URL = crewWebhookMap.get(normalizeForMatch_('GENERAL'));
  const BAND_WEBHOOK_URL = crewWebhookMap.get(normalizeForMatch_('BAND'));

  if (!GENERAL_WEBHOOK_URL) throw new Error(`Missing webhook for "GENERAL" in Crew->Webhook sheet.`);
  if (!BAND_WEBHOOK_URL) throw new Error(`Missing webhook for "BAND" in Crew->Webhook sheet.`);

  const CHANNEL_WEBHOOK_URL =
    (crewNorm && crewWebhookMap.get(crewNorm)) ? crewWebhookMap.get(crewNorm) : DEFAULT_CHANNEL_WEBHOOK_URL;

  const ROLE_TAG =
    (crewMapping?.role && String(crewMapping.role).trim()) ? String(crewMapping.role).trim() : DEFAULT_CHANNEL_ROLE_TAG;

  const turtleTagsForGeneral = turtleTagsFromCrewMapping_(crewMapping);

  if (DEBUG) {
    console.log('[CrewMapping] matched:', crewMapping);
    console.log('[Routing] crewName:', crewName);
    console.log('[Routing] GENERAL_WEBHOOK_URL:', GENERAL_WEBHOOK_URL);
    console.log('[Routing] BAND_WEBHOOK_URL:', BAND_WEBHOOK_URL);
    console.log('[Routing] CHANNEL_WEBHOOK_URL (crew):', CHANNEL_WEBHOOK_URL);
    console.log('[Routing] ROLE_TAG:', ROLE_TAG);
    console.log('[Turtles] tagsForGeneral:', turtleTagsForGeneral);
  }

  if (!CHANNEL_WEBHOOK_URL) {
    console.log(`[Routing] No crew webhook found for "${crewName}" in Crew->Webhook sheet. (Embeds posting is currently commented out.)`);
  }

  // === Load Muscle ID -> Discord tag map (robust: supports header row not at 1) ===
  function buildMuscleIdToDiscordTagMap_() {
    const rosterSs = SpreadsheetApp.openById(MUSCLE_ROSTER_SPREADSHEET_ID);

    const rosterSheets = rosterSs.getSheets();
    if (DEBUG) {
      console.log('[Roster] Spreadsheet opened:', MUSCLE_ROSTER_SPREADSHEET_ID);
      console.log('[Roster] Sheet count:', rosterSheets.length);
      rosterSheets.forEach((s, i) => console.log(`  [Roster] idx=${i} name="${s.getName()}" gid=${s.getSheetId()}`));
      console.log('[Roster] Using MUSCLE_ROSTER_SHEET_INDEX:', MUSCLE_ROSTER_SHEET_INDEX, 'HEADER_ROW:', MUSCLE_ROSTER_HEADER_ROW);
    }

    const rosterSheet = rosterSheets[MUSCLE_ROSTER_SHEET_INDEX];
    if (!rosterSheet) throw new Error('Muscle roster sheet not found at MUSCLE_ROSTER_SHEET_INDEX=' + MUSCLE_ROSTER_SHEET_INDEX);

    const lr = rosterSheet.getLastRow();
    const lc = rosterSheet.getLastColumn();
    if (DEBUG) console.log('[Roster] Selected sheet:', rosterSheet.getName(), 'lr:', lr, 'lc:', lc);

    if (lr <= MUSCLE_ROSTER_HEADER_ROW) return new Map();

    const normalizeId_ = (v) => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'number') return String(v);
      return String(v).trim().replace(/\s+/g, '');
    };

    const rawHeaders = rosterSheet.getRange(MUSCLE_ROSTER_HEADER_ROW, 1, 1, lc).getValues()[0];
    const headersNorm = rawHeaders.map(h => String(h || '').trim().toLowerCase().replace(/\s+/g, ''));

    if (DEBUG && DEBUG_PRINT_HEADERS) {
      console.log('[Roster] Raw headers (row ' + MUSCLE_ROSTER_HEADER_ROW + '):', rawHeaders);
      console.log('[Roster] Norm headers:', headersNorm);
    }

    const idIdx =
      headersNorm.indexOf('muscleid') !== -1 ? headersNorm.indexOf('muscleid') :
        headersNorm.indexOf('id') !== -1 ? headersNorm.indexOf('id') :
          0;

    const discordIdx =
      headersNorm.indexOf('discord') !== -1 ? headersNorm.indexOf('discord') :
        headersNorm.indexOf('discordtag') !== -1 ? headersNorm.indexOf('discordtag') :
          headersNorm.indexOf('discordid') !== -1 ? headersNorm.indexOf('discordid') :
            18;

    const numRows = lr - MUSCLE_ROSTER_HEADER_ROW;
    const readCols = Math.max(lc, 19);
    const values = rosterSheet.getRange(MUSCLE_ROSTER_HEADER_ROW + 1, 1, numRows, readCols).getValues();

    const map = new Map();
    for (let r = 0; r < values.length; r++) {
      const idKey = normalizeId_(values[r][idIdx]);
      const tagVal = String(values[r][discordIdx] || '').trim();
      if (!idKey || !tagVal) continue;
      map.set(idKey, tagVal);
    }

    if (DEBUG) {
      console.log('[Roster] mapSize:', map.size);
      console.log('[Roster] Sample entries:', Array.from(map.entries()).slice(0, DEBUG_SAMPLE_ROSTER_KEYS));
    }

    return map;
  }

  const muscleIdToDiscordTag = buildMuscleIdToDiscordTagMap_();

  // === FIND THE START OF THE "Tasks" TABLE (scan ONLY column A) ===
  const colA = sheet.getRange(1, 1, lastRow, 1).getValues();
  let tasksHeaderRowNumber = null;
  for (let i = 0; i < colA.length; i++) {
    if (String(colA[i][0]).trim().toLowerCase() === 'tasks') {
      tasksHeaderRowNumber = i + 1;
      break;
    }
  }
  if (!tasksHeaderRowNumber) throw new Error('Could not find a row where column A = "Tasks"');

  const headerRowNumber = tasksHeaderRowNumber + 1;
  const firstDataRowNumber = headerRowNumber + 1;

  if (firstDataRowNumber > lastRow) return;

  const numTaskRows = lastRow - firstDataRowNumber + 1;
  const taskTable = sheet.getRange(firstDataRowNumber, 1, numTaskRows, 6).getValues();
  const taskRichTexts = sheet.getRange(firstDataRowNumber, 2, numTaskRows, 1).getRichTextValues();

  const clean = (v) => {
    if (v === null || v === undefined) return '—';
    let s = String(v).replace(/\r?\n|\r/g, ' ').trim();
    if (!s || s.toUpperCase() === '#N/A') return '—';
    s = s.replace(/[`]/g, "'");
    return s;
  };

  const trunc = (v, max) => {
    const s = clean(v);
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  };

  const normPriority = (p) => clean(p).toLowerCase();
  const isTop = (p) => normPriority(p) === '0. top';
  const isHigh = (p) => normPriority(p) === '1. high';

  function getNormalHyperlinkFromRichTextByIndex_(idx) {
    const rt = taskRichTexts[idx]?.[0];
    if (!rt) return null;

    const whole = rt.getLinkUrl && rt.getLinkUrl();
    if (whole) return whole;

    const runs = rt.getRuns ? (rt.getRuns() || []) : [];
    for (const run of runs) {
      const u = run.getLinkUrl && run.getLinkUrl();
      if (u) return u;
    }
    return null;
  }

  function formatTaskName_(taskText, url) {
    return url ? `[**${taskText}**](${url})` : `**${taskText}**`;
  }

  function resolveOwnerLabel_(muscleIdCell, muscleNameCell) {
    const rawId = (muscleIdCell === null || muscleIdCell === undefined) ? '' : String(muscleIdCell);
    const idKey = rawId.trim().replace(/\s+/g, '');
    if (idKey) {
      const tag = muscleIdToDiscordTag.get(idKey);
      if (tag && String(tag).trim()) {
        const tagStr = String(tag).trim();
        // If it's a numeric Discord ID, format it as a mention
        if (/^\d+$/.test(tagStr)) {
          return `<@${tagStr}>`;
        }
        return tagStr;
      }
    }
    return clean(muscleNameCell || 'Unassigned');
  }

  const topLines = [];
  const highLines = [];

  for (let i = 0; i < taskTable.length; i++) {
    const row = taskTable[i];

    const priority = row[0];
    if (!priority) continue;

    const stage = row[1];
    const taskName = row[2];
    const muscleId = row[4];
    const muscleNm = row[5];

    const stageNorm = clean(stage).toLowerCase();
    // Filter out tasks with these stages
    const excludedStages = ['complete', 'skipped', 'done', 'skip', 'stuck', 'later'];
    if (excludedStages.includes(stageNorm)) continue;
    if (!isTop(priority) && !isHigh(priority)) continue;

    const url = getNormalHyperlinkFromRichTextByIndex_(i);

    const taskText = trunc(taskName || '(No task name)', 42);
    const taskLabel = formatTaskName_(taskText, url);

    const ownerLabel = trunc(resolveOwnerLabel_(muscleId, muscleNm), 24);
    const line = `• ${taskLabel} — ${trunc(stage, 16)} — ${ownerLabel}`;

    if (isTop(priority)) topLines.push(line);
    else highLines.push(line);
  }

  if (topLines.length === 0 && highLines.length === 0) return;

  function chunkLines(lines, maxChars = 950) {
    const chunks = [];
    let buf = '';
    for (const l of lines) {
      const next = (buf ? buf + '\n' : '') + l;
      if (next.length > maxChars) {
        if (buf) chunks.push(buf);
        buf = l;
      } else {
        buf = next;
      }
    }
    if (buf) chunks.push(buf);
    return chunks.length ? chunks : ['—'];
  }

  const topChunks = chunkLines(topLines);
  const highChunks = chunkLines(highLines);
  const pages = Math.max(topChunks.length, highChunks.length);

  const sheetLinkMd = `[${SHEET_NAME}](${SHEET_URL})`;

  // === PATCH: include X URL from sendAll (if present) ===
  const xUrl = getLastXUrl_();
  const xLine = xUrl ? `\n\nX: ${xUrl}` : '';

  const embeds = [];
  for (let p = 0; p < pages; p++) {
    embeds.push({
      title: `Top & High Priority Tasks`,
      description:
        (p === 0 ? `` : `\n\n_Continued (page ${p + 1}/${pages})_`),
      fields: [
        {
          name: '<a:frankpepe_spin:1076175161549652128> Top',
          value: topChunks[p] || '—',
          inline: true
        },
        {
          name: '<a:frankpepe_munch:1076175341955076116> High',
          value: highChunks[p] || '—',
          inline: true
        }
      ]
    });
  }

  function postWebhook(url, payloadObj) {
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payloadObj),
      muteHttpExceptions: true
    });
    if (DEBUG) console.log('Discord response:', res.getResponseCode(), res.getContentText());
    return res;
  }

  // === 0) ALWAYS POST A “GENERAL” PING ===
  const DISCORD_GUILD_EVENT_BASE =
    'https://discord.com/events/812097286003359764/';
  const VOICE_CHANNEL_ID = '823956905739026442';

  const turtlePing = turtleTagsForGeneral.length
    ? ` ${turtleTagsForGeneral.join(' ')}`
    : '';

  const eventId = String(crewMapping?.event || '').trim();

  const eventLink = eventId
    ? `[RSVP to the next call](${DISCORD_GUILD_EVENT_BASE}${eventId})`
    : '';

  postWebhook(GENERAL_WEBHOOK_URL, {
    content:
      `${sheetLinkMd} starts now! ` +
      `${GENERAL_ROLE_TAG}${turtlePing} ` +
      `you might be interested in this one. ` +
      `Find the crew in <#${VOICE_CHANNEL_ID}>.` +
      (eventLink ? `\n\n${eventLink}` : '') +
      xLine
  });

  Utilities.sleep(250);

  // === 1) POST !band (always) ===
  postWebhook(BAND_WEBHOOK_URL, { content: `!band` });
  Utilities.sleep(250);

  // === 2) POST EMBEDS TO THE CREW’S WEBHOOK + ROLE TAG ===
  const EMBEDS_PER_MESSAGE = 10;
  if (!CHANNEL_WEBHOOK_URL) throw new Error(`Missing webhook for crew "${crewName}" in Crew->Webhook sheet.`);
  for (let i = 0; i < embeds.length; i += EMBEDS_PER_MESSAGE) {
    postWebhook(CHANNEL_WEBHOOK_URL, {
      content: i === 0
        ? `${ROLE_TAG} Crew starts now! High-priority task check-in for ${sheetLinkMd}:${xLine}`
        : '',
      embeds: embeds.slice(i, i + EMBEDS_PER_MESSAGE)
    });
    Utilities.sleep(250);
  }
}

function startDiscordEvent(spreadsheet) {
  // === CONFIG ===
  const LOOKUP_SPREADSHEET_ID = '19itGq86BRQTVehKhtRFKwK8gZqjsUQ_bG5cuVmem9HU';
  const EVENT_ID_COLUMN = 5; // Column E
  const NAME_PREFIX_TO_REMOVE = 'PizzaDAO ';
  const NAME_SUFFIX_TO_REMOVE = ' Crew';

  const url = 'https://pizzadao-discord-bot-production.up.railway.app/start-event-by-id';
  const apiKey = getSecret_('BOT_API_KEY');

  // === GET CURRENT SPREADSHEET NAME ===
  const activeSS = spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  const fullName = activeSS.getName();

  if (!fullName.startsWith(NAME_PREFIX_TO_REMOVE)) {
    throw new Error(`Spreadsheet name does not start with "${NAME_PREFIX_TO_REMOVE}": ${fullName}`);
  }

  // Remove prefix
  let eventName = fullName.replace(NAME_PREFIX_TO_REMOVE, '').trim();

  // Remove " Crew" suffix if present
  if (eventName.endsWith(NAME_SUFFIX_TO_REMOVE)) {
    eventName = eventName.slice(0, -NAME_SUFFIX_TO_REMOVE.length).trim();
  }

  Logger.log('Looking up event name: ' + eventName);

  // === OPEN LOOKUP SHEET (SECOND SHEET) ===
  const lookupSS = SpreadsheetApp.openById(LOOKUP_SPREADSHEET_ID);
  const lookupSheet = lookupSS.getSheets()[1]; // second sheet (index 1)

  if (!lookupSheet) {
    throw new Error('Second sheet not found in lookup spreadsheet');
  }

  const data = lookupSheet.getDataRange().getValues();

  // === FIND MATCHING EVENT ID ===
  let eventId = null;

  for (let i = 1; i < data.length; i++) { // skip header
    const rowEventName = String(data[i][0]).trim(); // column A assumed to be event name

    if (rowEventName === eventName) {
      eventId = String(data[i][EVENT_ID_COLUMN - 1]).trim();
      break;
    }
  }

  if (!eventId) {
    throw new Error(`No event ID found for event name "${eventName}"`);
  }

  Logger.log('Found event ID: ' + eventId);

  // === END ANY ACTIVE EVENTS FIRST (ONLY IF ACTUALLY ACTIVE) ===
  const botBase = 'https://pizzadao-discord-bot-production.up.railway.app';
  const commonHeaders = {
    Authorization: 'Bearer ' + apiKey
  };

  Logger.log('Checking for active events in the guild...');
  let hasActiveEvent = false;
  try {
    const checkRes = UrlFetchApp.fetch(`${botBase}/get-active-event`, {
      method: 'get',
      headers: commonHeaders,
      muteHttpExceptions: true
    });
    const checkData = JSON.parse(checkRes.getContentText());
    hasActiveEvent = checkData && checkData.eventId;
    Logger.log('Active event check response: ' + checkRes.getContentText());
  } catch (e) {
    Logger.log('Could not check active events (non-critical): ' + e.message);
  }

  // Only end the event if there's actually an active one
  if (hasActiveEvent) {
    Logger.log('Found active event, cleaning it up...');
    try {
      const endRes = UrlFetchApp.fetch(`${botBase}/end-active-events`, {
        method: 'post',
        headers: commonHeaders,
        muteHttpExceptions: true
      });
      Logger.log('Cleanup Response: ' + endRes.getContentText());
      // Short pause to ensure Discord API registers the end before the start
      Utilities.sleep(2000);
    } catch (e) {
      Logger.log('Cleanup failed (non-critical): ' + e.message);
    }
  } else {
    Logger.log('No active event found, skipping cleanup');
  }

  // === START NEW EVENT ===
  Logger.log('Attempting to start event for ID: ' + eventId);
  const res = UrlFetchApp.fetch(`${botBase}/start-event-by-id`, {
    method: 'post',
    contentType: 'application/json',
    headers: commonHeaders,
    payload: JSON.stringify({ eventId }),
    muteHttpExceptions: true
  });

  Logger.log('Start Event Status: ' + res.getResponseCode());
  Logger.log('Start Event Response: ' + res.getContentText());
}

/**
 * Run this FIRST to delete all triggers (prevents background errors)
 */
function deleteAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('Deleted ' + triggers.length + ' triggers');
}

/**
 * Run this SECOND to set ALL required secrets
 */
function setAllSecrets() {
  const props = PropertiesService.getScriptProperties();

  // Password
  props.setProperty('ANNOUNCE_PASSWORD', 'YOUR_ANNOUNCE_PASSWORD_HERE');

  // Bot API
  props.setProperty('BOT_API_KEY', 'YOUR_BOT_API_KEY_HERE');

  // Twitter/X credentials
  props.setProperty('X_CONSUMER_KEY', 'YOUR_X_CONSUMER_KEY_HERE');
  props.setProperty('X_CONSUMER_SECRET', 'YOUR_X_CONSUMER_SECRET_HERE');
  props.setProperty('X_ACCESS_TOKEN', 'YOUR_X_ACCESS_TOKEN_HERE');
  props.setProperty('X_ACCESS_TOKEN_SECRET', 'YOUR_X_ACCESS_TOKEN_SECRET_HERE');

  Logger.log('All secrets set!');
}

/**
 * Run once to create an installed onEdit trigger that calls sendAll(e).
 * This will run on "HEAD" (current code in the script project).
 */
function setupOnEditSendAllTrigger() {
  // Remove existing triggers for sendAll to avoid duplicates
  deleteTriggersForHandler_('sendAll');

  // Create installed onEdit trigger using spreadsheet ID directly
  ScriptApp.newTrigger('sendAll')
    .forSpreadsheet('1PGb50v1wu3QVEyft5IR6wF_qnO8KRboeLghp48cbuEg')
    .onEdit()
    .create();

  Logger.log('Trigger installed for sendAll!');
}

/**
 * Optional: remove the trigger later.
 */
function teardownOnEditSendAllTrigger() {
  deleteTriggersForHandler_('sendAll');
}

/**
 * Utility: delete all project triggers for a given handler function name.
 */
function deleteTriggersForHandler_(handlerName) {
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    if (t.getHandlerFunction && t.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(t);
    }
  }
}

// ===================== CONFIG =====================
const BOT_BASE_URL = "https://pizzadao-discord-bot-production.up.railway.app"; // no trailing slash
function getBotApiKey_() { return getSecret_('BOT_API_KEY'); } // Lazy-loaded
const VOICE_CHANNEL_ID = "823956905739026442";
// ==================================================

/**
 * One attendance sheet per day.
 * - If today's attendance link already exists in THIS spreadsheet's "Attendance" tab,
 *   open that attendance spreadsheet and append ONLY new attendees (dedupe by Discord User ID).
 * - Otherwise create a new attendance spreadsheet (public view), log it, then write attendees.
 */
/**
 * One attendance sheet per day.
 * Updated: Now also updates the local "crew" table's status and activity.
 */
function takeAttendanceTodayMerge(spreadsheet) {
  const crewSs = spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  const mainSheet = crewSs.getSheets()[0]; // Assumes crew table is on the first tab
  const crewName = crewSs.getName();

  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const todayKey = Utilities.formatDate(now, tz, "yyyy-MM-dd");

  const logTab = getOrCreateAttendanceLogTab_(crewSs);

  // 1) Find today's existing attendance sheet link (if any)
  const existing = findAttendanceLinkForDate_(logTab, todayKey);

  let attendanceSs, attendanceUrl, createdNew = false;
  let logRowToUpdate = existing?.row || null;

  if (existing && existing.url) {
    attendanceUrl = existing.url;
    attendanceSs = SpreadsheetApp.openByUrl(attendanceUrl);
  } else {
    // 2) Create new attendance sheet + log it
    attendanceSs = createPublicAttendanceSpreadsheet_(crewName, todayKey);
    attendanceUrl = attendanceSs.getUrl();
    createdNew = true;

    const linkFormula =
      '=HYPERLINK("' + attendanceUrl + '","' + crewName + " Attendance " + todayKey + '")';

    logTab.appendRow([now, linkFormula, ""]);
    logRowToUpdate = logTab.getLastRow();
  }

  // 3) Fetch current voice members snapshot from your bot
  const payload = fetchVoiceAttendance_();
  const members = Array.isArray(payload.members) ? payload.members : [];
  const channelName = payload.channelName || "";

  // 4) Merge into external attendance sheet (dedupe by Discord User ID)
  const addedCount = mergeMembersIntoAttendanceSheet_(attendanceSs, members, channelName);

  // 5) ✅ UPDATE LOCAL CREW TABLE
  updateCrewTableStatus_(mainSheet, members);

  // Count how many members are RECORDED
  const attendanceTab = attendanceSs.getSheetByName("Attendance") || attendanceSs.getSheets()[0];
  ensureAttendanceSheetHeaders_(attendanceTab);
  const recordedCount = Math.max(0, attendanceTab.getLastRow() - 1);

  if (logRowToUpdate) {
    logTab.getRange(logRowToUpdate, 3).setValue(recordedCount);
  }

  Logger.log(`Attendance Synced: ${members.length} found, ${addedCount} new added to log, Crew Table updated.`);

  return {
    todayKey,
    createdNew,
    attendanceUrl,
    fetchedCount: members.length,
    addedCount,
    recordedCount,
  };
}

/***********************
 * Attendance burst scheduler
 * - Run once now
 * - Then run every 10 min, 6 more times
 ***********************/

// Runs AFTER the first immediate run:
const ATTENDANCE_BURST_RUNS = 6;        // additional runs
const ATTENDANCE_BURST_MINUTES = 10;    // interval

const ATTENDANCE_BURST_COUNT_KEY_PREFIX = 'ATTENDANCE_BURST_COUNT__';

/**
 * Call this instead of calling takeAttendanceTodayMerge() directly.
 * It will:
 *  1) take attendance immediately
 *  2) schedule 6 more runs, 10 minutes apart (via a repeating trigger)
 */
function takeAttendanceNowAndScheduleBurst(spreadsheet) {
  // 1) Run now (the "first time")
  takeAttendanceTodayMerge(spreadsheet);

  // 2) Schedule the burst (6 more runs every 10 min)
  startAttendanceBurst_(spreadsheet);
}

/**
 * Internal: starts (or restarts) the repeating trigger and resets the count.
 */
function startAttendanceBurst_(spreadsheet) {
  const props = PropertiesService.getScriptProperties();
  const ss = spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  const ssId = ss.getId();
  const countKey = ATTENDANCE_BURST_COUNT_KEY_PREFIX + ssId;

  // Reset run counter
  props.setProperty(countKey, '0');

  // Avoid duplicate triggers if someone clicks twice
  deleteTriggersForHandler_('attendanceBurstTick');

  // Create a repeating time-based trigger every 10 minutes
  ScriptApp.newTrigger('attendanceBurstTick')
    .timeBased()
    .everyMinutes(ATTENDANCE_BURST_MINUTES)
    .create();

  Logger.log(`Attendance burst started: will run ${ATTENDANCE_BURST_RUNS} more times every ${ATTENDANCE_BURST_MINUTES} minutes.`);
}

/**
 * Trigger handler: runs attendance, increments count, stops after 6 additional runs.
 * IMPORTANT: this is run by the time-based trigger.
 */
function attendanceBurstTick() {
  const props = PropertiesService.getScriptProperties();
  const ssId = SpreadsheetApp.getActiveSpreadsheet().getId();
  const countKey = ATTENDANCE_BURST_COUNT_KEY_PREFIX + ssId;

  let count = parseInt(props.getProperty(countKey) || '0', 10);
  if (isNaN(count)) count = 0;

  // If we somehow already completed, clean up and exit
  if (count >= ATTENDANCE_BURST_RUNS) {
    stopAttendanceBurst_();
    return;
  }

  // Run attendance
  try {
    takeAttendanceTodayMerge();
  } catch (err) {
    // Don’t kill the whole burst if one tick errors; log it and keep going
    console.error('attendanceBurstTick error:', err);
  }

  // Increment additional-run count
  count += 1;
  props.setProperty(countKey, String(count));

  Logger.log(`Attendance burst tick complete: ${count}/${ATTENDANCE_BURST_RUNS} additional runs done.`);

  // Stop when we've done 6 additional runs
  if (count >= ATTENDANCE_BURST_RUNS) {
    stopAttendanceBurst_();
  }
}

/**
 * Internal: stops the repeating trigger and clears the counter.
 */
function stopAttendanceBurst_() {
  const props = PropertiesService.getScriptProperties();
  const ssId = SpreadsheetApp.getActiveSpreadsheet().getId();
  const countKey = ATTENDANCE_BURST_COUNT_KEY_PREFIX + ssId;

  deleteTriggersForHandler_('attendanceBurstTick');
  props.deleteProperty(countKey);

  Logger.log('Attendance burst finished; trigger removed.');
}

/**
 * ✅ NEW HELPER: Updates everyone's status in the "crew" table below the "crew" label.
 */
function updateCrewTableStatus_(sheet, members) {
  if (!members || members.length === 0) return;

  const fullData = sheet.getDataRange().getValues();
  let crewHeaderRowIndex = -1;

  // Find the first cell in Column A containing "crew"
  for (let i = 0; i < fullData.length; i++) {
    if (String(fullData[i][0]).toLowerCase().trim() === "crew") {
      crewHeaderRowIndex = i + 1; // Row where headers (Status, Name, etc.) exist
      break;
    }
  }

  if (crewHeaderRowIndex === -1) {
    Logger.log("Could not find 'crew' label in Column A. Skipping table update.");
    return;
  }

  const headers = fullData[crewHeaderRowIndex].map(h => String(h).toLowerCase().replace(/\s/g, ''));
  const statusCol = headers.indexOf('status') + 1;
  const nameCol = headers.indexOf('name') + 1;
  const idCol = headers.indexOf('discordid') + 1;
  const activeCol = headers.indexOf('active') + 1;

  if (idCol === 0 || statusCol === 0) {
    Logger.log("Missing 'discordid' or 'status' columns in crew table.");
    return;
  }

  const dataStartRow = crewHeaderRowIndex + 2;
  const lastRow = sheet.getLastRow();
  const tableRange = lastRow >= dataStartRow ? sheet.getRange(dataStartRow, 1, lastRow - dataStartRow + 1, headers.length) : null;
  const tableData = tableRange ? tableRange.getValues() : [];

  const now = new Date();

  // Map existing members by Discord ID for fast lookup
  const existingMemberMap = new Map();
  tableData.forEach((row, i) => {
    const id = String(row[idCol - 1]).trim();
    if (id) existingMemberMap.set(id, dataStartRow + i);
  });

  members.forEach(member => {
    const mId = String(member.id).trim();
    const mName = member.displayName || member.username || member.tag;

    if (existingMemberMap.has(mId)) {
      // Update existing member
      const rowNum = existingMemberMap.get(mId);
      const currentStatus = String(sheet.getRange(rowNum, statusCol).getValue()).trim();

      // Don't downgrade Leads or Capos
      if (currentStatus !== "0. Lead" && currentStatus !== "1. Capo") {
        sheet.getRange(rowNum, statusCol).setValue("2. active");
      }

      // Update Active timestamp
      if (activeCol > 0) {
        sheet.getRange(rowNum, activeCol).setValue(now);
      }
    } else {
      // Add new member to the bottom of the table
      const newRow = new Array(headers.length).fill("");
      newRow[statusCol - 1] = "2. active";
      newRow[nameCol - 1] = mName;
      newRow[idCol - 1] = mId;
      if (activeCol > 0) newRow[activeCol - 1] = now;

      sheet.appendRow(newRow);
    }
  });
}

// ---------- Discord fetch ----------
function fetchVoiceAttendance_() {
  const url = `${BOT_BASE_URL}/voice-attendance?channelId=${encodeURIComponent(VOICE_CHANNEL_ID)}`;

  const res = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + getBotApiKey_() },
  });

  const code = res.getResponseCode();
  const body = res.getContentText();
  Logger.log("Bot response code: " + code);
  Logger.log("Bot response body: " + body);

  if (code < 200 || code >= 300) throw new Error("Bot fetch failed: HTTP " + code + " " + body);

  const json = JSON.parse(body);
  if (!json || json.ok !== true) throw new Error("Bot returned non-ok: " + body);
  return json;
}

// ---------- Merge logic ----------
function mergeMembersIntoAttendanceSheet_(attendanceSs, members, channelName) {
  const sheet = attendanceSs.getSheetByName("Attendance") || attendanceSs.getSheets()[0];

  // Ensure headers exist (if someone deleted them)
  ensureAttendanceSheetHeaders_(sheet);

  // ✅ PATCH: Remove any duplicates already in the sheet (by Discord User ID, col C)
  removeDuplicateDiscordUserIdsKeepFirst_(sheet);

  // Build set of existing Discord User IDs already recorded
  // Assumes "Discord User ID" is column C (3).
  const lastRow = sheet.getLastRow();
  const existingIds = new Set();

  if (lastRow >= 2) {
    const idValues = sheet.getRange(2, 3, lastRow - 1, 1).getValues(); // col C
    idValues.forEach((r) => {
      const v = String(r[0] || "").trim();
      if (v) existingIds.add(v);
    });
  }

  const capturedAt = new Date();

  // Filter to only new members by ID
  const newMembers = members.filter((m) => {
    const id = String(m.id || "").trim();
    return id && !existingIds.has(id);
  });

  if (newMembers.length === 0) return 0;

  const rows = newMembers.map((m) => [
    capturedAt,
    m.displayName || m.username || m.tag || "",
    String(m.id || "").trim(),
    m.joinedAt || "", // will be blank unless your bot endpoint provides it
    "", // leftAt
    `Channel: ${channelName}`,
  ]);

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
  return rows.length;
}

/**
 * ✅ NEW: Removes duplicate Discord User IDs in-place.
 * Keeps the first occurrence (topmost) and deletes later duplicates.
 *
 * Assumes:
 * - Header row is row 1
 * - Discord User ID is column C (3)
 * - Data rows begin at row 2
 */
function removeDuplicateDiscordUserIdsKeepFirst_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return; // header + <=1 row => nothing to dedupe

  const idCol = 3; // C
  const numDataRows = lastRow - 1;
  const idValues = sheet.getRange(2, idCol, numDataRows, 1).getValues();

  const seen = new Set();
  const rowsToDelete = [];

  for (let i = 0; i < idValues.length; i++) {
    const rowNum = i + 2;
    const id = String(idValues[i][0] || "").trim();
    if (!id) continue;

    if (seen.has(id)) {
      rowsToDelete.push(rowNum);
    } else {
      seen.add(id);
    }
  }

  // Delete bottom-up so row indices don't shift
  for (let i = rowsToDelete.length - 1; i >= 0; i--) {
    sheet.deleteRow(rowsToDelete[i]);
  }
}

function ensureAttendanceSheetHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 6).setValues([[
      "Timestamp",
      "Name",
      "Discord User ID",
      "Joined At",
      "Left At",
      "Notes",
    ]]);
    sheet.setFrozenRows(1);
    return;
  }

  // If row 1 is blank, rewrite headers
  const header = sheet.getRange(1, 1, 1, 6).getValues()[0];
  const allBlank = header.every((v) => String(v || "").trim() === "");
  if (allBlank) {
    sheet.getRange(1, 1, 1, 6).setValues([[
      "Timestamp",
      "Name",
      "Discord User ID",
      "Joined At",
      "Left At",
      "Notes",
    ]]);
    sheet.setFrozenRows(1);
  }
}

// ---------- Find existing link in log tab ----------
function findAttendanceLinkForDate_(logTab, targetDateKey) {
  const tz = Session.getScriptTimeZone();
  const lastRow = logTab.getLastRow();
  if (lastRow < 2) return null;

  // Col A = Day, Col B = Link
  const dayValues = logTab.getRange(2, 1, lastRow - 1, 1).getValues(); // A
  const linkValues = logTab.getRange(2, 2, lastRow - 1, 1).getValues(); // B
  const linkFormulas = logTab.getRange(2, 2, lastRow - 1, 1).getFormulas(); // B

  // Scan bottom-up so if duplicates exist, we reuse the most recent row.
  for (let i = dayValues.length - 1; i >= 0; i--) {
    const dayCell = dayValues[i][0];
    const dayKey = toDateKey_(dayCell, tz);

    if (dayKey !== targetDateKey) continue;

    const f = linkFormulas[i][0] || "";
    const url =
      extractUrlFromHyperlinkFormula_(f) || String(linkValues[i][0] || "").trim();

    if (url) return { row: i + 2, url };
  }

  return null;
}

function toDateKey_(value, tz) {
  // Handles Date objects and strings like "10/7/2024"
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, tz, "yyyy-MM-dd");
  }

  const s = String(value || "").trim();
  if (!s) return "";

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, tz, "yyyy-MM-dd");
  }

  return s; // fallback
}

function extractUrlFromHyperlinkFormula_(formula) {
  // Example: =HYPERLINK("https://...","Label")
  const m = String(formula || "").match(/HYPERLINK\(\s*"([^"]+)"/i);
  return m ? m[1] : "";
}

// ---------- Sheet creation + setup ----------
function createPublicAttendanceSpreadsheet_(crewName, dateKey) {
  const ss = SpreadsheetApp.create(`${crewName} Attendance ${dateKey}`);

  DriveApp.getFileById(ss.getId()).setSharing(
    DriveApp.Access.ANYONE_WITH_LINK,
    DriveApp.Permission.VIEW
  );

  const sheet = ss.getSheets()[0];
  sheet.setName("Attendance");
  sheet.getRange(1, 1, 1, 6).setValues([[
    "Timestamp",
    "Name",
    "Discord User ID",
    "Joined At",
    "Left At",
    "Notes",
  ]]);
  sheet.setFrozenRows(1);

  return ss;
}

function getOrCreateAttendanceLogTab_(ss) {
  let sheet = ss.getSheetByName("Attendance");
  if (!sheet) {
    sheet = ss.insertSheet("Attendance");
    sheet.getRange(1, 1, 1, 3).setValues([["Day", "Link", "Attendees"]]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 3).setValues([["Day", "Link", "Attendees"]]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  // If headers exist but are only 2 columns, upgrade to 3 columns
  const header = sheet.getRange(1, 1, 1, Math.max(3, sheet.getLastColumn())).getValues()[0];
  const h1 = String(header[0] || "").trim();
  const h2 = String(header[1] || "").trim();
  const h3 = String(header[2] || "").trim();

  if (!h1 && !h2 && !h3) {
    sheet.getRange(1, 1, 1, 3).setValues([["Day", "Link", "Attendees"]]);
    sheet.setFrozenRows(1);
  } else if ((h1.toLowerCase() === "day") && (h2.toLowerCase() === "link") && !h3) {
    sheet.getRange(1, 3).setValue("Attendees");
  }

  return sheet;
}

/**
 * Web app endpoint for triggering announcements from website.
 * 
 * Deploy as: Apps Script → Deploy → New deployment → Web app
 * Execute as: Me
 * Who has access: Anyone (authentication handled by API key)
 * 
 * Usage from website:
 * POST to the deployed web app URL with JSON body:
 * {
 *   "apiKey": "YOUR_API_KEY",
 *   "spreadsheetId": "1YVUJHWlyivugIWERa2qsaNGTQDN7Ogu1lIhATO8c6kU"
 * }
 */
function doPost(e) {
  try {
    // Parse request
    const params = JSON.parse(e.postData.contents);
    const apiKey = e.parameter.apiKey || params.apiKey;
    const spreadsheetId = params.spreadsheetId;

    // Validate API key
    const validApiKey = getSecret_('WEB_API_KEY');
    if (!apiKey || apiKey !== validApiKey) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Unauthorized: Invalid API key'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Validate spreadsheet ID
    if (!spreadsheetId) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Missing spreadsheetId parameter'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Open the specified spreadsheet (validates it exists and we have access)
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheets()[0];

    // Execute the announcement workflow
    // (Same as sendAll but without cell edit validation)
    startDiscordEvent(ss);
    const xUrl = sendCrewTweet(ss);
    setLastXUrl_(xUrl);
    postCrewToDiscord(ss);
    clearLastXUrl_();
    takeAttendanceNowAndScheduleBurst(ss);

    // Update "Last Sent" timestamp in spreadsheet
    const lastSentLabelCell = findCellWithText_(sheet, 'Last Sent:');
    if (lastSentLabelCell) {
      const tsCell = lastSentLabelCell.offset(0, 1);
      const tz = Session.getScriptTimeZone();
      const stamp = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
      tsCell.setValue(stamp);
    }

    // Return success response
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Announcement triggered successfully',
      tweetUrl: xUrl,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    // Return error response
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.message || String(err)
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
