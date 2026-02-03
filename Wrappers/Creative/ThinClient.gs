/**
 * THIN CLIENT
 *
 * Lightweight client for PizzaDAO crew sheets.
 * All secrets and announcement logic live in the Secret Service.
 * This client only shows a dialog and calls the service.
 *
 * SETUP:
 * 1. Replace SECRET_SERVICE_URL with your deployed Secret Service web app URL
 * 2. Deploy to each crew sheet via clasp
 */

// ============================================
// CONFIGURATION
// ============================================

/**
 * URL of the deployed Secret Service web app.
 * Get this from: Apps Script -> Deploy -> Manage deployments
 *
 * Format: https://script.google.com/macros/s/DEPLOYMENT_ID/exec
 */
const SECRET_SERVICE_URL = 'https://script.google.com/macros/s/AKfycbzPzxSZkrq2xbiQfx3-FK6_M5Q8EwSVgTtlduaLAkUKb-tP5D2Q-2g8I8AYBOLzNf5_/exec';

// ============================================
// MENU SETUP
// ============================================

/**
 * Creates the custom menu when the spreadsheet opens.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Announce')
    .addItem('Send Announcement', 'showAnnounceDialog')
    .addSeparator()
    .addItem('Tweet Only', 'showTweetDialog')
    .addItem('Discord Only', 'showDiscordDialog')
    .addItem('Start Event Only', 'showEventDialog')
    .addItem('Take Attendance', 'showAttendanceDialog')
    .addSeparator()
    .addItem('Test Connection (No Posts)', 'testConnection')
    .addToUi();
}

/**
 * Tests the connection to Secret Service without posting anything.
 * Validates all lookups and credentials.
 */
function testConnection() {
  const ui = SpreadsheetApp.getUi();

  ui.alert('Testing...', 'Connecting to Secret Service...', ui.ButtonSet.OK);

  const result = callSecretService({
    password: '', // Test doesn't need password - it's handled server-side
    action: 'test'
  });

  if (result.success && result.testMode) {
    const r = result.results;
    let message = 'TEST RESULTS:\n\n';
    message += '✓ Spreadsheet: ' + (r.spreadsheet?.name || 'Unknown') + '\n';
    message += (r.crewMapping?.success ? '✓' : '✗') + ' Crew Mapping: ' + (r.crewMapping?.crew || 'Not found') + '\n';
    message += (r.webhooks?.general ? '✓' : '✗') + ' General Webhook\n';
    message += (r.webhooks?.band ? '✓' : '✗') + ' Band Webhook\n';
    message += (r.webhooks?.crew ? '✓' : '✗') + ' Crew Webhook\n';
    message += (r.eventId?.success ? '✓' : '✗') + ' Event ID: ' + (r.eventId?.id || 'Not found') + '\n';
    message += (r.gifFolder?.success ? '✓' : '✗') + ' GIF Folder: ' + (r.gifFolder?.crewName || 'Unknown') + '\n';
    message += (r.twitterCredentials?.success ? '✓' : '✗') + ' Twitter Credentials\n';
    message += (r.botApiKey?.success ? '✓' : '✗') + ' Bot API Key\n';
    message += '\n' + (result.allChecksPass ? '✓ ALL CHECKS PASSED!' : '✗ Some checks failed');

    ui.alert('Test Results', message, ui.ButtonSet.OK);
  } else {
    ui.alert('Test Failed', 'Error: ' + (result.error || 'Unknown error'), ui.ButtonSet.OK);
  }
}

// ============================================
// DIALOG FUNCTIONS
// ============================================

/**
 * Shows the main announcement dialog.
 */
function showAnnounceDialog() {
  const html = HtmlService.createHtmlOutputFromFile('Dialog')
    .setWidth(350)
    .setHeight(450);
  SpreadsheetApp.getUi().showModalDialog(html, 'Send Announcement');
}

/**
 * Shows a simplified dialog for tweet only.
 */
function showTweetDialog() {
  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; padding: 15px; }
        .field { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; }
        input[type="password"] { width: 100%; padding: 8px; box-sizing: border-box; }
        .buttons { margin-top: 20px; text-align: right; }
        button { padding: 8px 16px; margin-left: 10px; cursor: pointer; }
        .error { color: red; margin-top: 10px; display: none; }
        .info { color: #666; font-size: 12px; margin-bottom: 15px; }
      </style>
    </head>
    <body>
      <div class="info">This will send a tweet only (no Discord).</div>
      <div class="field">
        <label for="password">Password:</label>
        <input type="password" id="password" autofocus>
      </div>
      <div id="error" class="error"></div>
      <div class="buttons">
        <button onclick="google.script.host.close()">Cancel</button>
        <button onclick="submit()">Send Tweet</button>
      </div>
      <script>
        function submit() {
          var password = document.getElementById('password').value;
          document.getElementById('error').style.display = 'none';
          google.script.run
            .withSuccessHandler(function(result) {
              if (result.success) {
                alert('Tweet sent! ' + (result.url || ''));
                google.script.host.close();
              } else {
                document.getElementById('error').textContent = result.error || 'An error occurred';
                document.getElementById('error').style.display = 'block';
              }
            })
            .withFailureHandler(function(err) {
              document.getElementById('error').textContent = err.message || 'An error occurred';
              document.getElementById('error').style.display = 'block';
            })
            .callSecretService({ password: password, action: 'tweet' });
        }
        document.getElementById('password').addEventListener('keypress', function(e) {
          if (e.key === 'Enter') submit();
        });
      </script>
    </body>
    </html>
  `)
    .setWidth(300)
    .setHeight(200);
  SpreadsheetApp.getUi().showModalDialog(html, 'Send Tweet');
}

/**
 * Shows a simplified dialog for Discord only.
 */
function showDiscordDialog() {
  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; padding: 15px; }
        .field { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; }
        input[type="password"] { width: 100%; padding: 8px; box-sizing: border-box; }
        .buttons { margin-top: 20px; text-align: right; }
        button { padding: 8px 16px; margin-left: 10px; cursor: pointer; }
        .error { color: red; margin-top: 10px; display: none; }
        .info { color: #666; font-size: 12px; margin-bottom: 15px; }
      </style>
    </head>
    <body>
      <div class="info">This will post to Discord only (no tweet).</div>
      <div class="field">
        <label for="password">Password:</label>
        <input type="password" id="password" autofocus>
      </div>
      <div id="error" class="error"></div>
      <div class="buttons">
        <button onclick="google.script.host.close()">Cancel</button>
        <button onclick="submit()">Post to Discord</button>
      </div>
      <script>
        function submit() {
          var password = document.getElementById('password').value;
          document.getElementById('error').style.display = 'none';
          google.script.run
            .withSuccessHandler(function(result) {
              if (result.success) {
                alert('Posted to Discord!');
                google.script.host.close();
              } else {
                document.getElementById('error').textContent = result.error || 'An error occurred';
                document.getElementById('error').style.display = 'block';
              }
            })
            .withFailureHandler(function(err) {
              document.getElementById('error').textContent = err.message || 'An error occurred';
              document.getElementById('error').style.display = 'block';
            })
            .callSecretService({ password: password, action: 'discord' });
        }
        document.getElementById('password').addEventListener('keypress', function(e) {
          if (e.key === 'Enter') submit();
        });
      </script>
    </body>
    </html>
  `)
    .setWidth(300)
    .setHeight(200);
  SpreadsheetApp.getUi().showModalDialog(html, 'Post to Discord');
}

/**
 * Shows a simplified dialog for event start only.
 */
function showEventDialog() {
  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; padding: 15px; }
        .field { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; }
        input[type="password"] { width: 100%; padding: 8px; box-sizing: border-box; }
        .buttons { margin-top: 20px; text-align: right; }
        button { padding: 8px 16px; margin-left: 10px; cursor: pointer; }
        .error { color: red; margin-top: 10px; display: none; }
        .info { color: #666; font-size: 12px; margin-bottom: 15px; }
      </style>
    </head>
    <body>
      <div class="info">This will start the Discord event only.</div>
      <div class="field">
        <label for="password">Password:</label>
        <input type="password" id="password" autofocus>
      </div>
      <div id="error" class="error"></div>
      <div class="buttons">
        <button onclick="google.script.host.close()">Cancel</button>
        <button onclick="submit()">Start Event</button>
      </div>
      <script>
        function submit() {
          var password = document.getElementById('password').value;
          document.getElementById('error').style.display = 'none';
          google.script.run
            .withSuccessHandler(function(result) {
              if (result.success) {
                alert('Discord event started!');
                google.script.host.close();
              } else {
                document.getElementById('error').textContent = result.error || 'An error occurred';
                document.getElementById('error').style.display = 'block';
              }
            })
            .withFailureHandler(function(err) {
              document.getElementById('error').textContent = err.message || 'An error occurred';
              document.getElementById('error').style.display = 'block';
            })
            .callSecretService({ password: password, action: 'event' });
        }
        document.getElementById('password').addEventListener('keypress', function(e) {
          if (e.key === 'Enter') submit();
        });
      </script>
    </body>
    </html>
  `)
    .setWidth(300)
    .setHeight(200);
  SpreadsheetApp.getUi().showModalDialog(html, 'Start Discord Event');
}

/**
 * Shows a simplified dialog for attendance only.
 */
function showAttendanceDialog() {
  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; padding: 15px; }
        .field { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; }
        input[type="password"] { width: 100%; padding: 8px; box-sizing: border-box; }
        .buttons { margin-top: 20px; text-align: right; }
        button { padding: 8px 16px; margin-left: 10px; cursor: pointer; }
        .error { color: red; margin-top: 10px; display: none; }
        .info { color: #666; font-size: 12px; margin-bottom: 15px; }
      </style>
    </head>
    <body>
      <div class="info">This will take attendance and start the burst scheduler.</div>
      <div class="field">
        <label for="password">Password:</label>
        <input type="password" id="password" autofocus>
      </div>
      <div id="error" class="error"></div>
      <div class="buttons">
        <button onclick="google.script.host.close()">Cancel</button>
        <button onclick="submit()">Take Attendance</button>
      </div>
      <script>
        function submit() {
          var password = document.getElementById('password').value;
          document.getElementById('error').style.display = 'none';
          google.script.run
            .withSuccessHandler(function(result) {
              if (result.success) {
                alert('Attendance started! Found ' + (result.fetchedCount || 0) + ' members.');
                google.script.host.close();
              } else {
                document.getElementById('error').textContent = result.error || 'An error occurred';
                document.getElementById('error').style.display = 'block';
              }
            })
            .withFailureHandler(function(err) {
              document.getElementById('error').textContent = err.message || 'An error occurred';
              document.getElementById('error').style.display = 'block';
            })
            .callSecretService({ password: password, action: 'attendance' });
        }
        document.getElementById('password').addEventListener('keypress', function(e) {
          if (e.key === 'Enter') submit();
        });
      </script>
    </body>
    </html>
  `)
    .setWidth(300)
    .setHeight(200);
  SpreadsheetApp.getUi().showModalDialog(html, 'Take Attendance');
}

// ============================================
// SERVICE COMMUNICATION
// ============================================

/**
 * Calls the Secret Service with the provided data.
 * This is the main function called by the dialog.
 *
 * @param {Object} data - Request data including password, action, and options
 * @returns {Object} Response from the Secret Service
 */
function callSecretService(data) {
  const payload = {
    password: data.password,
    spreadsheetId: SpreadsheetApp.getActiveSpreadsheet().getId(),
    action: data.action || 'announce',
    options: {
      discordEvent: data.discordEvent,
      tweet: data.tweet,
      postGeneral: data.postGeneral,
      postBand: data.postBand,
      postCrew: data.postCrew,
      attendance: data.attendance
    }
  };

  try {
    const response = UrlFetchApp.fetch(SECRET_SERVICE_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const result = JSON.parse(response.getContentText());

    // Log for debugging
    Logger.log('Secret Service response: ' + JSON.stringify(result));

    return result;

  } catch (err) {
    Logger.log('Secret Service error: ' + err.message);
    return {
      success: false,
      error: 'Failed to contact Secret Service: ' + err.message
    };
  }
}

/**
 * Handler called from the main Dialog.html
 * Maps the dialog form data to the service call format.
 *
 * @param {Object} data - Form data from the dialog
 */
function handleSendActions(data) {
  const result = callSecretService({
    password: data.password,
    action: 'announce',
    discordEvent: data.discordEvent,
    tweet: data.tweet,
    postGeneral: data.postGeneral,
    postBand: data.postBand,
    postCrew: data.postCrew,
    attendance: data.attendance
  });

  if (!result.success) {
    throw new Error(result.error || 'Announcement failed');
  }

  return result;
}

// ============================================
// OPTIONAL: TRIGGER-BASED FLOW
// ============================================

/**
 * Labels for the trigger-based flow (optional).
 * If you want to keep the "Edit cell to Send" functionality,
 * you can use this trigger handler.
 */
const SEND_LABEL_TEXT = 'Announce?';
const SEND_VALUE = 'Send';
const SENT_VALUE = 'Sent';
const LAST_SENT_LABEL_TEXT = 'Last Sent:';
const BYPASS_PROP_KEY = 'BYPASS_NEXT_ONEDIT';

/**
 * Installed trigger handler for cell-based announcements.
 * Set this up via: Apps Script -> Triggers -> Add Trigger -> sendAll -> On edit
 *
 * When the cell next to "Announce?" is set to "Send", prompts for password
 * and calls the Secret Service.
 */
function sendAll(e) {
  const props = PropertiesService.getScriptProperties();

  if (props.getProperty(BYPASS_PROP_KEY) === '1') {
    props.deleteProperty(BYPASS_PROP_KEY);
    return;
  }

  try {
    if (!e || !e.range) return;

    const sheet = e.range.getSheet();

    if (e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;

    const newValue = String(e.value || '').trim();
    if (newValue !== SEND_VALUE) return;

    const labelCell = findCellWithText_(sheet, SEND_LABEL_TEXT);
    if (!labelCell) return;

    const sendCell = labelCell.offset(0, 1);
    if (e.range.getRow() !== sendCell.getRow() || e.range.getColumn() !== sendCell.getColumn()) {
      return;
    }

    const ui = SpreadsheetApp.getUi();
    const resp = ui.prompt(
      'Password Required',
      'Enter password to send announcement:',
      ui.ButtonSet.OK_CANCEL
    );

    if (resp.getSelectedButton() !== ui.Button.OK) {
      setBypassThenSetValue_(props, sendCell, '');
      return;
    }

    const password = String(resp.getResponseText() || '').trim();

    // Call Secret Service
    const result = callSecretService({
      password: password,
      action: 'announce',
      discordEvent: true,
      tweet: true,
      postGeneral: true,
      postBand: true,
      postCrew: true,
      attendance: true
    });

    if (!result.success) {
      ui.alert('Error: ' + (result.error || 'Unknown error'));
      setBypassThenSetValue_(props, sendCell, '');
      return;
    }

    // Mark as Sent
    setBypassThenSetValue_(props, sendCell, SENT_VALUE);

    // Update timestamp
    const lastSentLabelCell = findCellWithText_(sheet, LAST_SENT_LABEL_TEXT);
    if (lastSentLabelCell) {
      const tsCell = lastSentLabelCell.offset(0, 1);
      const tz = Session.getScriptTimeZone();
      const stamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
      setBypassThenSetValue_(props, tsCell, stamp);
    }

    ui.alert('Announcement sent successfully!');

  } catch (err) {
    try {
      SpreadsheetApp.getUi().alert('Error: ' + (err.message || err));
    } catch (_) { }
    Logger.log('sendAll error: ' + err);
  }
}

/**
 * Finds the first cell matching the given text.
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
 * Sets bypass flag then sets a cell value.
 */
function setBypassThenSetValue_(props, cell, value) {
  props.setProperty(BYPASS_PROP_KEY, '1');
  cell.setValue(value);
}

// ============================================
// SETUP HELPERS
// ============================================

/**
 * Run once to set up the sendAll trigger.
 */
function setupOnEditTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Remove existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    if (t.getHandlerFunction && t.getHandlerFunction() === 'sendAll') {
      ScriptApp.deleteTrigger(t);
    }
  }

  // Create new trigger
  ScriptApp.newTrigger('sendAll')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  Logger.log('sendAll trigger created');
}

/**
 * Remove the sendAll trigger.
 */
function removeOnEditTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    if (t.getHandlerFunction && t.getHandlerFunction() === 'sendAll') {
      ScriptApp.deleteTrigger(t);
    }
  }
  Logger.log('sendAll trigger removed');
}
