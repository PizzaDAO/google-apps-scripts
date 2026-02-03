/***********************
 * CONFIG - Read from Script Properties
 ***********************/

/**
 * Get Twitter credentials from Script Properties
 */
function getTwitterCredentials_() {
  var props = PropertiesService.getScriptProperties();
  var consumerKey = props.getProperty('X_CONSUMER_KEY');
  var consumerSecret = props.getProperty('X_CONSUMER_SECRET');
  var accessToken = props.getProperty('X_ACCESS_TOKEN');
  var accessTokenSecret = props.getProperty('X_ACCESS_TOKEN_SECRET');

  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    throw new Error('Twitter credentials not set in Script Properties.');
  }

  return {
    consumerKey: consumerKey,
    consumerSecret: consumerSecret,
    accessToken: accessToken,
    accessTokenSecret: accessTokenSecret
  };
}

// Drive folder containing GIFs
const DRIVE_GIF_FOLDER_ID = '1DgzVx8aL6PgPm0-Np9gQMPywUEBVBxuA';

// Hard cap for GIF file size (bytes) — 5,242,880 = 5MB
const MAX_GIF_BYTES = 5242880;

// How many different random picks to try before failing
const MAX_PICK_ATTEMPTS = 50;

/***********************
 * "ANNOUNCE?" TRIGGER CONFIG
 ***********************/
const SEND_LABEL_TEXT = 'Announce?';
const SEND_VALUE = 'Send';
const SENT_VALUE = 'Sent';
const BYPASS_PROP_KEY = 'BYPASS_NEXT_ONEDIT';

/**
 * Get the announce password from Script Properties
 */
function getAnnouncePassword_() {
  const password = PropertiesService.getScriptProperties().getProperty('ANNOUNCE_PASSWORD');
  if (!password) {
    throw new Error('ANNOUNCE_PASSWORD not set in Script Properties');
  }
  return password;
}

/***********************
 * MAIN: Called by onEdit when "Announce?" -> "Send"
 * Returns the tweet URL
 ***********************/
function sendTweetFromSheet(text) {
  const url = 'https://api.twitter.com/2/tweets';
  const method = 'POST';

  const payload = {
    text: String(text || '')
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

  // Extract tweet ID and return URL
  const json = JSON.parse(response.getContentText() || '{}');
  const tweetId = json.data && json.data.id ? String(json.data.id) : '';
  if (!tweetId) {
    throw new Error('Tweet response missing tweet id');
  }

  return `https://x.com/i/web/status/${tweetId}`;
}

/***********************
 * DEBUG: Run this manually
 ***********************/
function debugTest() {
  sendTweetFromSheet('Random GIF test (<=5MB) from Apps Script 🧪🍕');
}

/**
 * Test function: Verify markdown link conversion
 * Run this in the Apps Script editor to verify the function works correctly
 */
function testConvertMarkdownLinksToUrls() {
  // Test case 1: Single markdown link
  const test1 = "Check out [this guide](https://example.com)";
  const result1 = convertMarkdownLinksToUrls(test1);
  Logger.log("Test 1 Input: " + test1);
  Logger.log("Test 1 Output: " + result1);
  Logger.log("Test 1 Expected: Check out https://example.com");
  Logger.log("Test 1 Pass: " + (result1 === "Check out https://example.com"));
  Logger.log("");

  // Test case 2: Multiple markdown links
  const test2 = "Check out [this guide](https://example.com) and [this link](https://other.com)";
  const result2 = convertMarkdownLinksToUrls(test2);
  Logger.log("Test 2 Input: " + test2);
  Logger.log("Test 2 Output: " + result2);
  Logger.log("Test 2 Expected: Check out https://example.com and https://other.com");
  Logger.log("Test 2 Pass: " + (result2 === "Check out https://example.com and https://other.com"));
  Logger.log("");

  // Test case 3: No markdown links (should pass through unchanged)
  const test3 = "Just a plain message with no links";
  const result3 = convertMarkdownLinksToUrls(test3);
  Logger.log("Test 3 Input: " + test3);
  Logger.log("Test 3 Output: " + result3);
  Logger.log("Test 3 Expected: Just a plain message with no links");
  Logger.log("Test 3 Pass: " + (result3 === "Just a plain message with no links"));
  Logger.log("");

  // Test case 4: Empty string
  const test4 = "";
  const result4 = convertMarkdownLinksToUrls(test4);
  Logger.log("Test 4 Input: (empty string)");
  Logger.log("Test 4 Output: " + result4);
  Logger.log("Test 4 Pass: " + (result4 === ""));
  Logger.log("");

  // Test case 5: Complex message with mixed content
  const test5 = "Announcement: Please read [our guide](https://docs.example.com/guide) before the call at [this link](https://zoom.example.com) at 3pm";
  const result5 = convertMarkdownLinksToUrls(test5);
  Logger.log("Test 5 Input: " + test5);
  Logger.log("Test 5 Output: " + result5);
  Logger.log("Test 5 Expected: Announcement: Please read https://docs.example.com/guide before the call at https://zoom.example.com at 3pm");
  Logger.log("Test 5 Pass: " + (result5 === "Announcement: Please read https://docs.example.com/guide before the call at https://zoom.example.com at 3pm"));
}

/***********************
 * INSTALLED TRIGGER: "Announce?" -> "Send" pattern
 *
 * This replaces the old D3 checkbox trigger.
 * Now looks for a cell labeled "Announce?" and triggers when
 * the cell to its right is set to "Send".
 *
 * Requires an INSTALLED onEdit trigger (for UI prompt):
 * Apps Script → Triggers → Add Trigger → sendAll → From spreadsheet → On edit
 ***********************/
function sendAll(e) {
  const props = PropertiesService.getScriptProperties();

  // Skip if we just set the cell ourselves (prevents recursive trigger)
  if (props.getProperty(BYPASS_PROP_KEY) === '1') {
    props.deleteProperty(BYPASS_PROP_KEY);
    return;
  }

  try {
    if (!e || !e.range) return;

    const sheet = e.range.getSheet();

    // Only handle single-cell edits
    if (e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;

    const newValue = String(e.value || '').trim();
    if (newValue !== SEND_VALUE) return;

    // Find the "Announce?" label cell
    const labelCell = findCellWithText_(sheet, SEND_LABEL_TEXT);
    if (!labelCell) return;

    // Check if edit is in the cell immediately to the right of the label
    const sendCell = labelCell.offset(0, 1);
    if (e.range.getRow() !== sendCell.getRow() || e.range.getColumn() !== sendCell.getColumn()) {
      return;
    }

    // Prompt for password
    const ui = SpreadsheetApp.getUi();
    const resp = ui.prompt(
      'Password Required',
      'Enter password to run all actions:\n• Start Discord event\n• Tweet (B5)\n• Telegram (B7)\n• Discord GENERAL (B10)\n• Discord voice (B11)\n• Attendance',
      ui.ButtonSet.OK_CANCEL
    );

    // Cancel: clear the send cell
    if (resp.getSelectedButton() !== ui.Button.OK) {
      setBypassThenSetValue_(props, sendCell, '');
      return;
    }

    const entered = String(resp.getResponseText() || '').trim();
    if (entered !== getAnnouncePassword_()) {
      ui.alert('Incorrect password. Actions not run.');
      setBypassThenSetValue_(props, sendCell, '');
      return;
    }

    // === RUN ALL ANNOUNCE ACTIONS ===

    // 1. Start Discord Event
    startDiscordEvent_();

    // 2. Send Tweet (B5) - returns tweet URL
    const tweetMessage = sheet.getRange(5, 2).getValue(); // B5
    const tweetUrl = sendTweetFromSheet(tweetMessage);

    // 3. Send Telegram (B7)
    const telegramMessage = sheet.getRange(7, 2).getValue(); // B7
    sendTelegramAnnouncement_(telegramMessage);

    // 4. Send Discord to GENERAL channel (B10)
    const discordMessage = sheet.getRange(10, 2).getValue(); // B10
    sendDiscordAnnouncement_(discordMessage);

    // 5. Send Discord to voice channel chat (B11 with placeholders)
    const voiceMessageTemplate = sheet.getRange(11, 2).getValue(); // B11
    const voiceMessage = processVoiceMessageTemplate_(voiceMessageTemplate, tweetUrl);
    sendToVoiceChannel_(voiceMessage);

    // 6. Start Attendance sequence
    startAttendanceSequence();

    // Mark as Sent
    setBypassThenSetValue_(props, sendCell, SENT_VALUE);

    ui.alert('Announced successfully!\n\n✅ Discord event started\n✅ Tweet sent (B5)\n✅ Telegram sent (B7)\n✅ Discord GENERAL (B10)\n✅ Discord voice channel (B11)\n✅ Attendance started');

  } catch (err) {
    try {
      SpreadsheetApp.getUi().alert('Error: ' + (err.message || err));
    } catch (_) {}
    console.error(err);
  }
}

/**
 * Helper: Process voice message template - replace placeholders
 * {date} -> today's date
 * {call hosting guide} -> spreadsheet URL
 * {x-link} -> tweet URL
 */
function processVoiceMessageTemplate_(template, tweetUrl) {
  const CALL_HOSTING_GUIDE_URL = 'https://docs.google.com/spreadsheets/d/1S7WGjHpMcxw8erA3cBevoGlVX_G253AMGg1kNAU_53o/edit?gid=0#gid=0';

  const tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'MMMM d, yyyy');

  let message = String(template || '');
  message = message.replace(/\{date\}/gi, today);
  message = message.replace(/\{call hosting guide\}/gi, CALL_HOSTING_GUIDE_URL);
  message = message.replace(/\{x-link\}/gi, tweetUrl || '');

  return message;
}

/**
 * Helper: Send message to voice channel chat via bot
 */
function sendToVoiceChannel_(message) {
  const VOICE_CHANNEL_ID = '823956905739026442';
  const BOT_URL = 'https://pizzadao-discord-bot-production.up.railway.app/send-message';
  const BOT_API_KEY = 'YOUR_BOT_API_KEY_HERE';

  // Convert markdown links to plain URLs for Discord compatibility
  const convertedMessage = convertMarkdownLinksToUrls(message);

  const response = UrlFetchApp.fetch(BOT_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + BOT_API_KEY
    },
    payload: JSON.stringify({
      channelId: VOICE_CHANNEL_ID,
      message: convertedMessage
    }),
    muteHttpExceptions: true
  });

  Logger.log('Voice channel message response: ' + response.getResponseCode());
  Logger.log('Voice channel message body: ' + response.getContentText());

  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    Logger.log('Warning: Voice channel message may have failed');
  }
}

/**
 * Helper: Start the Discord scheduled event
 */
function startDiscordEvent_() {
  const EVENT_ID = '1462506828595200000';
  const BOT_URL = 'https://pizzadao-discord-bot-production.up.railway.app/start-event-by-id';
  const BOT_API_KEY = 'YOUR_BOT_API_KEY_HERE';

  const response = UrlFetchApp.fetch(BOT_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + BOT_API_KEY
    },
    payload: JSON.stringify({ eventId: EVENT_ID }),
    muteHttpExceptions: true
  });

  Logger.log('Discord event start response: ' + response.getResponseCode());
  Logger.log('Discord event start body: ' + response.getContentText());

  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    Logger.log('Warning: Discord event start may have failed');
  }
}

/**
 * Helper: Send Telegram announcement
 */
function sendTelegramAnnouncement_(message) {
  const BOT_TOKEN = '8456308928:AAGC6En5aDQO6Ghah9Rtq6nwPsH_2ZYa2Qc';
  const CHAT_ID = '-5011258237';

  // Send the message from B7 directly
  sendTelegramMessage(BOT_TOKEN, CHAT_ID, message);
}

/**
 * Helper: Convert markdown links to plain URLs for Discord
 * Discord webhooks don't support markdown link syntax, so we convert:
 * "[text](url)" -> "url"
 *
 * @param {string} message - The message potentially containing markdown links
 * @returns {string} The message with markdown links converted to plain URLs
 */
function convertMarkdownLinksToUrls(message) {
  if (!message) return message;

  // Regex to match [text](url) pattern
  // Captures: Group 1 = text, Group 2 = url
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  // Replace each markdown link with just the URL (group 2)
  return String(message).replace(markdownLinkRegex, '$2');
}

/**
 * Helper: Send Discord announcement via webhook to GENERAL channel
 * Loads webhook URL from the Crew Webhooks spreadsheet
 */
function sendDiscordAnnouncement_(message) {
  const CREW_WEBHOOKS_SPREADSHEET_ID = '1bSLN2mL1K-qr3nLiURVjhm31Zxn0J3ta1Pq0txlXsPI';

  // Load webhook from spreadsheet
  const webhookUrl = getGeneralWebhook_(CREW_WEBHOOKS_SPREADSHEET_ID);

  if (!webhookUrl) {
    throw new Error('Could not find GENERAL webhook in Crew Webhooks spreadsheet');
  }

  // Convert markdown links to plain URLs for Discord compatibility
  const convertedMessage = convertMarkdownLinksToUrls(message);

  const payload = {
    content: convertedMessage
  };

  const params = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(webhookUrl, params);
  Logger.log('Discord response: ' + response.getResponseCode());

  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error('Discord post failed: ' + response.getContentText());
  }
}

/**
 * Helper: Get GENERAL webhook URL from Crew Webhooks spreadsheet
 */
function getGeneralWebhook_(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheets()[0]; // First sheet

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toLowerCase());

  const crewCol = headers.indexOf('crew');
  const webhookCol = headers.indexOf('webhook');

  if (crewCol === -1 || webhookCol === -1) {
    throw new Error('Crew Webhooks sheet must have "Crew" and "Webhook" columns');
  }

  // Find GENERAL row
  for (let i = 1; i < data.length; i++) {
    const crew = String(data[i][crewCol] || '').trim().toLowerCase();
    if (crew === 'general') {
      return String(data[i][webhookCol] || '').trim();
    }
  }

  return null;
}

/**
 * Finds the first cell in the sheet whose display value matches `text`
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
 * This prevents the subsequent onEdit from triggering again.
 */
function setBypassThenSetValue_(props, cell, value) {
  props.setProperty(BYPASS_PROP_KEY, '1');
  cell.setValue(value);
}

/***********************
 * DRIVE: Pick random GIF under size cap
 ***********************/
function uploadRandomGifFromDriveFolder_(folderId) {
  const file = pickRandomGifFileUnderSize_(folderId, MAX_GIF_BYTES, MAX_PICK_ATTEMPTS);

  const size = file.getSize();
  Logger.log('Selected GIF: ' + file.getName() + ' (' + size + ' bytes)');

  const blob = file.getBlob();
  try { blob.setContentType('image/gif'); } catch (err) {}

  // Since we cap at 5MB, we can use SIMPLE upload (no chunking) to reduce auth headaches
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

  // If there are few files, try filtering first
  const eligible = files.filter(f => f.getSize() <= maxBytes);
  if (eligible.length > 0) {
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  // Otherwise, do random attempts (useful if Drive reports size oddities or you later change logic)
  const attempts = Math.min(maxAttempts, files.length * 3);
  for (let i = 0; i < attempts; i++) {
    const f = files[Math.floor(Math.random() * files.length)];
    if (f.getSize() <= maxBytes) return f;
  }

  // Nothing eligible
  const largestAllowedMb = (maxBytes / (1024 * 1024)).toFixed(2);
  throw new Error(
    'No GIFs <= ' + maxBytes + ' bytes (' + largestAllowedMb + 'MB) found in folder ' + folderId +
    '. Upload smaller GIFs or raise MAX_GIF_BYTES.'
  );
}

/***********************
 * X MEDIA UPLOAD (v1.1): SIMPLE upload (best for <=5MB)
 * Endpoint: https://upload.twitter.com/1.1/media/upload.json
 ***********************/
function twitterUploadMediaSimple_(blob) {
  const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';

  // media is binary; do not include it in signature params
  const sigParams = {}; // no form fields required for simple upload besides the binary
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
  const baseUrl = normalizeUrl_(url);     // no query
  const queryParams = parseQueryParams_(url);

  const oauthParams = {
    oauth_consumer_key: TW_CONSUMER_KEY,
    oauth_nonce: generateNonce_(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: TW_ACCESS_TOKEN,
    oauth_version: '1.0'
  };

  // Signature params: OAuth params + query params + request params (no binary fields)
  const sigParams = Object.assign({}, oauthParams, queryParams, requestParams || {});
  const baseString = buildSignatureBaseString_(method, baseUrl, sigParams);

  const signingKey =
    percentEncode_(TW_CONSUMER_SECRET) + '&' + percentEncode_(TW_ACCESS_TOKEN_SECRET);

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

/***********************
 * SETUP: Run these two functions separately
 ***********************/

// Step 1: Run this to set the password
function setPassword() {
  PropertiesService.getScriptProperties().setProperty('ANNOUNCE_PASSWORD', 'YOUR_ANNOUNCE_PASSWORD_HERE');
  Logger.log('Password set to YOUR_ANNOUNCE_PASSWORD_HERE');
}

// Step 2: Run this to install the trigger (run from spreadsheet, not editor)
function installTrigger() {
  // Remove existing triggers for sendAll to avoid duplicates
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'sendAll') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Create installed onEdit trigger
  ScriptApp.newTrigger('sendAll')
    .forSpreadsheet('1S7WGjHpMcxw8erA3cBevoGlVX_G253AMGg1kNAU_53o')
    .onEdit()
    .create();

  Logger.log('Trigger installed!');
}
