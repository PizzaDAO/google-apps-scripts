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
    throw new Error('Twitter credentials not set in Script Properties. Run setupCommunityCallSecrets from master.');
  }

  return {
    consumerKey: consumerKey,
    consumerSecret: consumerSecret,
    accessToken: accessToken,
    accessTokenSecret: accessTokenSecret
  };
}

/**
 * Get Bot API key from Script Properties
 */
function getBotApiKey_() {
  var key = PropertiesService.getScriptProperties().getProperty('BOT_API_KEY');
  if (!key) {
    throw new Error('BOT_API_KEY not set in Script Properties. Run setupCommunityCallSecrets from master.');
  }
  return key;
}

/**
 * Get Telegram credentials from Script Properties
 */
function getTelegramCredentials_() {
  var props = PropertiesService.getScriptProperties();
  var botToken = props.getProperty('TELEGRAM_BOT_TOKEN');
  var chatId = props.getProperty('TELEGRAM_CHAT_ID');

  if (!botToken || !chatId) {
    throw new Error('Telegram credentials not set in Script Properties. Run setupCommunityCallSecrets from master.');
  }

  return { botToken: botToken, chatId: chatId };
}

// Drive folder containing GIFs
var DRIVE_GIF_FOLDER_ID = '1DgzVx8aL6PgPm0-Np9gQMPywUEBVBxuA';

// Hard cap for GIF file size (bytes) - 5,242,880 = 5MB
var MAX_GIF_BYTES = 5242880;

// How many different random picks to try before failing
var MAX_PICK_ATTEMPTS = 50;

/***********************
 * "ANNOUNCE?" TRIGGER CONFIG
 ***********************/
var SEND_LABEL_TEXT = 'Announce?';
var SEND_VALUE = 'Send';
var SENT_VALUE = 'Sent';
var BYPASS_PROP_KEY = 'BYPASS_NEXT_ONEDIT';

/**
 * Get the announce password from Script Properties
 */
function getAnnouncePassword_() {
  var password = PropertiesService.getScriptProperties().getProperty('ANNOUNCE_PASSWORD');
  if (!password) {
    throw new Error('ANNOUNCE_PASSWORD not set in Script Properties. Run setupCommunityCallSecrets from master.');
  }
  return password;
}

/***********************
 * MAIN: Called by onEdit when "Announce?" -> "Send"
 * Returns the tweet URL
 ***********************/
function sendTweetFromSheet(text) {
  var url = 'https://api.twitter.com/2/tweets';
  var method = 'POST';

  var payload = {
    text: String(text || '')
  };

  // For v2 JSON tweet create, signature includes only OAuth params (no body params)
  var authHeader = buildOAuth1Header_(method, url, {});

  var params = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: authHeader },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, params);
  Logger.log('Tweet status: ' + response.getResponseCode());
  Logger.log('Tweet body: ' + response.getContentText());

  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Tweet failed (' + code + '): ' + response.getContentText());
  }

  // Extract tweet ID and return URL
  var json = JSON.parse(response.getContentText() || '{}');
  var tweetId = json.data && json.data.id ? String(json.data.id) : '';
  if (!tweetId) {
    throw new Error('Tweet response missing tweet id');
  }

  return 'https://x.com/i/web/status/' + tweetId;
}

/***********************
 * DEBUG: Run this manually
 ***********************/
function debugTest() {
  sendTweetFromSheet('Random GIF test (<=5MB) from Apps Script');
}

/***********************
 * INSTALLED TRIGGER: "Announce?" -> "Send" pattern
 ***********************/
function sendAll(e) {
  var props = PropertiesService.getScriptProperties();

  // Skip if we just set the cell ourselves (prevents recursive trigger)
  if (props.getProperty(BYPASS_PROP_KEY) === '1') {
    props.deleteProperty(BYPASS_PROP_KEY);
    return;
  }

  try {
    if (!e || !e.range) return;

    var sheet = e.range.getSheet();

    // Only handle single-cell edits
    if (e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;

    var newValue = String(e.value || '').trim();
    if (newValue !== SEND_VALUE) return;

    // Find the "Announce?" label cell
    var labelCell = findCellWithText_(sheet, SEND_LABEL_TEXT);
    if (!labelCell) return;

    // Check if edit is in the cell immediately to the right of the label
    var sendCell = labelCell.offset(0, 1);
    if (e.range.getRow() !== sendCell.getRow() || e.range.getColumn() !== sendCell.getColumn()) {
      return;
    }

    // Store sheet ID for the dialog callback
    props.setProperty('PENDING_SHEET_ID', sheet.getParent().getId());
    props.setProperty('PENDING_SEND_CELL', sendCell.getA1Notation());

    // Show the action selector dialog
    showActionSelectorDialog_();

  } catch (err) {
    try {
      SpreadsheetApp.getUi().alert('Error: ' + (err.message || err));
    } catch (_) {}
    console.error(err);
  }
}

/**
 * Shows HTML dialog with checkboxes for selecting which actions to run
 */
function showActionSelectorDialog_() {
  var html = HtmlService.createHtmlOutput(getActionSelectorHtml_())
    .setWidth(400)
    .setHeight(450);
  SpreadsheetApp.getUi().showModalDialog(html, 'Select Actions to Run');
}

/**
 * Returns HTML for the action selector dialog
 */
function getActionSelectorHtml_() {
  return '<!DOCTYPE html>\n' +
    '<html>\n' +
    '<head>\n' +
    '  <base target="_top">\n' +
    '  <style>\n' +
    '    body { font-family: Arial, sans-serif; padding: 16px; }\n' +
    '    .action-item { margin: 12px 0; display: flex; align-items: center; }\n' +
    '    .action-item input { margin-right: 10px; width: 18px; height: 18px; }\n' +
    '    .action-item label { cursor: pointer; }\n' +
    '    .password-section { margin-top: 20px; padding-top: 16px; border-top: 1px solid #ddd; }\n' +
    '    .password-section input { width: 100%; padding: 8px; margin-top: 8px; }\n' +
    '    .buttons { margin-top: 20px; text-align: right; }\n' +
    '    .buttons button { padding: 10px 20px; margin-left: 10px; cursor: pointer; }\n' +
    '    .buttons button.primary { background: #4285f4; color: white; border: none; border-radius: 4px; }\n' +
    '    .buttons button.secondary { background: #f1f1f1; border: 1px solid #ddd; border-radius: 4px; }\n' +
    '    .select-all { margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #eee; }\n' +
    '    .error { color: red; margin-top: 10px; }\n' +
    '  </style>\n' +
    '</head>\n' +
    '<body>\n' +
    '  <div class="select-all">\n' +
    '    <label><input type="checkbox" id="selectAll" checked onchange="toggleAll()"> <strong>Select All</strong></label>\n' +
    '  </div>\n' +
    '  \n' +
    '  <div class="action-item">\n' +
    '    <input type="checkbox" id="discordEvent" checked>\n' +
    '    <label for="discordEvent">Start Discord Event</label>\n' +
    '  </div>\n' +
    '  \n' +
    '  <div class="action-item">\n' +
    '    <input type="checkbox" id="tweet" checked>\n' +
    '    <label for="tweet">Tweet (B5)</label>\n' +
    '  </div>\n' +
    '  \n' +
    '  <div class="action-item">\n' +
    '    <input type="checkbox" id="telegram" checked>\n' +
    '    <label for="telegram">Telegram (B7)</label>\n' +
    '  </div>\n' +
    '  \n' +
    '  <div class="action-item">\n' +
    '    <input type="checkbox" id="discordGeneral" checked>\n' +
    '    <label for="discordGeneral">Discord GENERAL (B10)</label>\n' +
    '  </div>\n' +
    '  \n' +
    '  <div class="action-item">\n' +
    '    <input type="checkbox" id="discordVoice" checked>\n' +
    '    <label for="discordVoice">Discord Voice Channel (B11)</label>\n' +
    '  </div>\n' +
    '  \n' +
    '  <div class="action-item">\n' +
    '    <input type="checkbox" id="attendance" checked>\n' +
    '    <label for="attendance">Start Attendance</label>\n' +
    '  </div>\n' +
    '  \n' +
    '  <div class="password-section">\n' +
    '    <label for="password"><strong>Password:</strong></label>\n' +
    '    <input type="password" id="password" placeholder="Enter password">\n' +
    '  </div>\n' +
    '  \n' +
    '  <div id="errorMsg" class="error"></div>\n' +
    '  \n' +
    '  <div class="buttons">\n' +
    '    <button class="secondary" onclick="cancel()">Cancel</button>\n' +
    '    <button class="primary" onclick="submit()">Run Selected</button>\n' +
    '  </div>\n' +
    '  \n' +
    '  <script>\n' +
    '    function toggleAll() {\n' +
    '      var checked = document.getElementById("selectAll").checked;\n' +
    '      var checkboxes = ["discordEvent", "tweet", "telegram", "discordGeneral", "discordVoice", "attendance"];\n' +
    '      checkboxes.forEach(function(id) {\n' +
    '        document.getElementById(id).checked = checked;\n' +
    '      });\n' +
    '    }\n' +
    '    \n' +
    '    function submit() {\n' +
    '      var actions = {\n' +
    '        discordEvent: document.getElementById("discordEvent").checked,\n' +
    '        tweet: document.getElementById("tweet").checked,\n' +
    '        telegram: document.getElementById("telegram").checked,\n' +
    '        discordGeneral: document.getElementById("discordGeneral").checked,\n' +
    '        discordVoice: document.getElementById("discordVoice").checked,\n' +
    '        attendance: document.getElementById("attendance").checked\n' +
    '      };\n' +
    '      var password = document.getElementById("password").value;\n' +
    '      \n' +
    '      if (!password) {\n' +
    '        document.getElementById("errorMsg").textContent = "Please enter the password.";\n' +
    '        return;\n' +
    '      }\n' +
    '      \n' +
    '      var anySelected = Object.values(actions).some(function(v) { return v; });\n' +
    '      if (!anySelected) {\n' +
    '        document.getElementById("errorMsg").textContent = "Please select at least one action.";\n' +
    '        return;\n' +
    '      }\n' +
    '      \n' +
    '      document.getElementById("errorMsg").textContent = "";\n' +
    '      google.script.run\n' +
    '        .withSuccessHandler(function(result) {\n' +
    '          if (result.success) {\n' +
    '            google.script.host.close();\n' +
    '          } else {\n' +
    '            document.getElementById("errorMsg").textContent = result.error || "An error occurred.";\n' +
    '          }\n' +
    '        })\n' +
    '        .withFailureHandler(function(err) {\n' +
    '          document.getElementById("errorMsg").textContent = err.message || "An error occurred.";\n' +
    '        })\n' +
    '        .executeSelectedActions(actions, password);\n' +
    '    }\n' +
    '    \n' +
    '    function cancel() {\n' +
    '      google.script.run.cancelActionDialog();\n' +
    '      google.script.host.close();\n' +
    '    }\n' +
    '  </script>\n' +
    '</body>\n' +
    '</html>';
}

/**
 * Called from the HTML dialog to execute selected actions
 */
function executeSelectedActions(actions, password) {
  var props = PropertiesService.getScriptProperties();

  // Verify password
  if (password !== getAnnouncePassword_()) {
    return { success: false, error: 'Incorrect password.' };
  }

  try {
    var ssId = props.getProperty('PENDING_SHEET_ID');
    var sendCellA1 = props.getProperty('PENDING_SEND_CELL');

    if (!ssId || !sendCellA1) {
      return { success: false, error: 'Session expired. Please try again.' };
    }

    var ss = SpreadsheetApp.openById(ssId);
    var sheet = ss.getSheets()[0];
    var sendCell = sheet.getRange(sendCellA1);

    var results = [];
    var tweetUrl = '';

    // 1. Start Discord Event
    if (actions.discordEvent) {
      startDiscordEvent_();
      results.push('Discord event started');
    }

    // 2. Send Tweet (B5)
    if (actions.tweet) {
      var tweetMessage = sheet.getRange(5, 2).getValue(); // B5
      tweetUrl = sendTweetFromSheet(tweetMessage);
      results.push('Tweet sent');
    }

    // 3. Send Telegram (B7)
    if (actions.telegram) {
      var telegramMessage = sheet.getRange(7, 2).getValue(); // B7
      sendTelegramAnnouncement_(telegramMessage);
      results.push('Telegram sent');
    }

    // 4. Send Discord to GENERAL channel (B10)
    if (actions.discordGeneral) {
      var discordMessage = sheet.getRange(10, 2).getValue(); // B10
      sendDiscordAnnouncement_(discordMessage);
      results.push('Discord GENERAL sent');
    }

    // 5. Send Discord to voice channel chat (B11 with placeholders)
    if (actions.discordVoice) {
      var voiceMessageTemplate = sheet.getRange(11, 2).getValue(); // B11
      var voiceMessage = processVoiceMessageTemplate_(voiceMessageTemplate, tweetUrl);
      sendToVoiceChannel_(voiceMessage);
      results.push('Discord voice channel sent');
    }

    // 6. Start Attendance sequence
    if (actions.attendance) {
      startAttendanceSequence();
      results.push('Attendance started');
    }

    // Mark as Sent
    setBypassThenSetValue_(props, sendCell, SENT_VALUE);

    // Clean up
    props.deleteProperty('PENDING_SHEET_ID');
    props.deleteProperty('PENDING_SEND_CELL');

    // Show success message
    SpreadsheetApp.getUi().alert('Completed:\n\n- ' + results.join('\n- '));

    return { success: true };

  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Called when user cancels the dialog
 */
function cancelActionDialog() {
  var props = PropertiesService.getScriptProperties();

  try {
    var ssId = props.getProperty('PENDING_SHEET_ID');
    var sendCellA1 = props.getProperty('PENDING_SEND_CELL');

    if (ssId && sendCellA1) {
      var ss = SpreadsheetApp.openById(ssId);
      var sheet = ss.getSheets()[0];
      var sendCell = sheet.getRange(sendCellA1);
      setBypassThenSetValue_(props, sendCell, '');
    }
  } catch (err) {
    console.error('Error in cancelActionDialog:', err);
  }

  props.deleteProperty('PENDING_SHEET_ID');
  props.deleteProperty('PENDING_SEND_CELL');
}

/**
 * Helper: Process voice message template - replace placeholders
 */
function processVoiceMessageTemplate_(template, tweetUrl) {
  var CALL_HOSTING_GUIDE_URL = 'https://docs.google.com/spreadsheets/d/1S7WGjHpMcxw8erA3cBevoGlVX_G253AMGg1kNAU_53o/edit?gid=0#gid=0';

  var tz = Session.getScriptTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'MMMM d, yyyy');

  var message = String(template || '');
  message = message.replace(/\{date\}/gi, today);
  message = message.replace(/\{call hosting guide\}/gi, CALL_HOSTING_GUIDE_URL);
  message = message.replace(/\{x-link\}/gi, tweetUrl || '');

  return message;
}

/**
 * Helper: Send message to voice channel chat via bot
 */
function sendToVoiceChannel_(message) {
  var VOICE_CHANNEL_ID = '823956905739026442';
  var BOT_URL = 'https://pizzadao-discord-bot-production.up.railway.app/send-message';
  var botApiKey = getBotApiKey_();

  var convertedMessage = convertMarkdownLinksToUrls(message);

  var response = UrlFetchApp.fetch(BOT_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + botApiKey
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
  var EVENT_ID = '1462506828595200000';
  var BOT_URL = 'https://pizzadao-discord-bot-production.up.railway.app/start-event-by-id';
  var botApiKey = getBotApiKey_();

  var response = UrlFetchApp.fetch(BOT_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + botApiKey
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
  var creds = getTelegramCredentials_();
  sendTelegramMessage(creds.botToken, creds.chatId, message);
}

/**
 * Helper: Convert markdown links to plain URLs for Discord
 */
function convertMarkdownLinksToUrls(message) {
  if (!message) return message;
  var markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  return String(message).replace(markdownLinkRegex, '$2');
}

/**
 * Helper: Send Discord announcement via webhook to GENERAL channel
 */
function sendDiscordAnnouncement_(message) {
  var CREW_WEBHOOKS_SPREADSHEET_ID = '1bSLN2mL1K-qr3nLiURVjhm31Zxn0J3ta1Pq0txlXsPI';

  var webhookUrl = getGeneralWebhook_(CREW_WEBHOOKS_SPREADSHEET_ID);

  if (!webhookUrl) {
    throw new Error('Could not find GENERAL webhook in Crew Webhooks spreadsheet');
  }

  var convertedMessage = convertMarkdownLinksToUrls(message);

  var payload = {
    content: convertedMessage
  };

  var params = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(webhookUrl, params);
  Logger.log('Discord response: ' + response.getResponseCode());

  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error('Discord post failed: ' + response.getContentText());
  }
}

/**
 * Helper: Get GENERAL webhook URL from Crew Webhooks spreadsheet
 */
function getGeneralWebhook_(spreadsheetId) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheets()[0];

  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });

  var crewCol = headers.indexOf('crew');
  var webhookCol = headers.indexOf('webhook');

  if (crewCol === -1 || webhookCol === -1) {
    throw new Error('Crew Webhooks sheet must have "Crew" and "Webhook" columns');
  }

  for (var i = 1; i < data.length; i++) {
    var crew = String(data[i][crewCol] || '').trim().toLowerCase();
    if (crew === 'general') {
      return String(data[i][webhookCol] || '').trim();
    }
  }

  return null;
}

/**
 * Finds the first cell in the sheet whose display value matches text
 */
function findCellWithText_(sheet, text) {
  var target = String(text || '').trim().toLowerCase();
  if (!target) return null;

  var range = sheet.getDataRange();
  var vals = range.getDisplayValues();

  for (var r = 0; r < vals.length; r++) {
    for (var c = 0; c < vals[0].length; c++) {
      if (String(vals[r][c] || '').trim().toLowerCase() === target) {
        return range.getCell(r + 1, c + 1);
      }
    }
  }
  return null;
}

/**
 * Helper: sets bypass flag then sets a cell value.
 */
function setBypassThenSetValue_(props, cell, value) {
  props.setProperty(BYPASS_PROP_KEY, '1');
  cell.setValue(value);
}

/***********************
 * DRIVE: Pick random GIF under size cap
 ***********************/
function uploadRandomGifFromDriveFolder_(folderId) {
  var file = pickRandomGifFileUnderSize_(folderId, MAX_GIF_BYTES, MAX_PICK_ATTEMPTS);

  var size = file.getSize();
  Logger.log('Selected GIF: ' + file.getName() + ' (' + size + ' bytes)');

  var blob = file.getBlob();
  try { blob.setContentType('image/gif'); } catch (err) {}

  return twitterUploadMediaSimple_(blob);
}

/**
 * Picks a random GIF file from a Drive folder that is <= maxBytes.
 */
function pickRandomGifFileUnderSize_(folderId, maxBytes, maxAttempts) {
  var folder = DriveApp.getFolderById(folderId);
  var iter = folder.getFilesByType(MimeType.GIF);

  var files = [];
  while (iter.hasNext()) files.push(iter.next());

  if (files.length === 0) throw new Error('No GIF files found in folder: ' + folderId);

  var eligible = files.filter(function(f) { return f.getSize() <= maxBytes; });
  if (eligible.length > 0) {
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  var attempts = Math.min(maxAttempts, files.length * 3);
  for (var i = 0; i < attempts; i++) {
    var f = files[Math.floor(Math.random() * files.length)];
    if (f.getSize() <= maxBytes) return f;
  }

  var largestAllowedMb = (maxBytes / (1024 * 1024)).toFixed(2);
  throw new Error(
    'No GIFs <= ' + maxBytes + ' bytes (' + largestAllowedMb + 'MB) found in folder ' + folderId +
    '. Upload smaller GIFs or raise MAX_GIF_BYTES.'
  );
}

/***********************
 * X MEDIA UPLOAD (v1.1): SIMPLE upload (best for <=5MB)
 ***********************/
function twitterUploadMediaSimple_(blob) {
  var uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';

  var sigParams = {};
  var authHeader = buildOAuth1Header_('POST', uploadUrl, sigParams);

  var resp = UrlFetchApp.fetch(uploadUrl, {
    method: 'post',
    headers: { Authorization: authHeader },
    payload: { media: blob },
    muteHttpExceptions: true
  });

  var code = resp.getResponseCode();
  var text = resp.getContentText();

  Logger.log('MEDIA upload status: ' + code);
  Logger.log('MEDIA upload body: ' + text);

  if (code < 200 || code >= 300) {
    throw new Error('Media upload failed (' + code + '): ' + text);
  }

  var json = JSON.parse(text || '{}');
  var mediaId = json.media_id_string || (json.media_id ? String(json.media_id) : null);
  if (!mediaId) throw new Error('Media upload missing media_id: ' + text);

  return mediaId;
}

/***********************
 * OAuth 1.0a signing + header
 ***********************/
function buildOAuth1Header_(method, url, requestParams) {
  var creds = getTwitterCredentials_();

  var baseUrl = normalizeUrl_(url);
  var queryParams = parseQueryParams_(url);

  var oauthParams = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: generateNonce_(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: '1.0'
  };

  var sigParams = Object.assign({}, oauthParams, queryParams, requestParams || {});
  var baseString = buildSignatureBaseString_(method, baseUrl, sigParams);

  var signingKey =
    percentEncode_(creds.consumerSecret) + '&' + percentEncode_(creds.accessTokenSecret);

  var rawSig = Utilities.computeHmacSignature(
    Utilities.MacAlgorithm.HMAC_SHA_1,
    baseString,
    signingKey
  );

  oauthParams.oauth_signature = Utilities.base64Encode(rawSig);
  return buildAuthHeader_(oauthParams);
}

function buildSignatureBaseString_(method, url, params) {
  var paramString = Object.keys(params)
    .sort()
    .map(function(k) { return percentEncode_(k) + '=' + percentEncode_(params[k]); })
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
    .map(function(k) { return percentEncode_(k) + '="' + percentEncode_(oauthParams[k]) + '"'; })
    .join(', ');
}

function parseQueryParams_(url) {
  var out = {};
  var q = (url.split('?')[1] || '').trim();
  if (!q) return out;

  q.split('&').forEach(function(pair) {
    var parts = pair.split('=');
    var k = parts[0];
    var v = parts[1] || '';
    if (!k) return;
    out[decodeURIComponent(k)] = decodeURIComponent(v);
  });

  return out;
}

function normalizeUrl_(url) {
  return url.split('?')[0];
}

function percentEncode_(str) {
  return encodeURIComponent(String(str))
    .replace(/[!'()*]/g, function(c) { return '%' + c.charCodeAt(0).toString(16).toUpperCase(); });
}

function generateNonce_() {
  return Utilities.getUuid().replace(/-/g, '');
}

/***********************
 * SETUP: Install trigger (run once from spreadsheet)
 ***********************/
function installTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'sendAll') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('sendAll')
    .forSpreadsheet('1S7WGjHpMcxw8erA3cBevoGlVX_G253AMGg1kNAU_53o')
    .onEdit()
    .create();

  Logger.log('Trigger installed!');
}
