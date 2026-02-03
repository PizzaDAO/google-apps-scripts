/**
 * TRIGGERS MODULE
 *
 * Handles the sendAll trigger and trigger setup/teardown.
 */

/**
 * Installed trigger entrypoint.
 * Fires when the cell to the RIGHT of "Announce?" becomes "Send".
 */
function sendAll(e) {
  const props = PropertiesService.getScriptProperties();

  // Skip if we just edited the sheet from the script
  if (props.getProperty(BYPASS_PROP_KEY) === '1') {
    props.deleteProperty(BYPASS_PROP_KEY);
    return;
  }

  try {
    if (!e || !e.range) return;

    const sheet = e.range.getSheet();

    // Single-cell edits only
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

    // Store context for the callback handler
    props.setProperty('PENDING_SEND_SHEET_ID', sheet.getParent().getId());
    props.setProperty('PENDING_SEND_CELL', sendCell.getA1Notation());

    // Show custom HTML dialog with checkboxes
    const html = HtmlService.createHtmlOutputFromFile('dialog')
      .setWidth(350)
      .setHeight(400);
    SpreadsheetApp.getUi().showModalDialog(html, 'Send Announcement');
  } catch (err) {
    try {
      SpreadsheetApp.getUi().alert(`Error: ${err && err.message ? err.message : err}`);
    } catch (_) { }
    console.error(err);
  }
}

/**
 * Handler called from the HTML dialog when user submits.
 * Receives an object with password and checkbox states.
 */
function handleSendActions(data) {
  const props = PropertiesService.getScriptProperties();

  // Verify password
  if (data.password !== getPassword_()) {
    throw new Error('Incorrect password');
  }

  // Track results for each action
  const results = { ran: [], failed: [] };
  let xUrl = null;

  // Helper to run action with error handling
  function tryAction(name, fn) {
    try {
      fn();
      results.ran.push(name);
    } catch (err) {
      console.error(`${name} failed:`, err);
      results.failed.push(`${name}: ${err.message}`);
    }
  }

  if (data.discordEvent) {
    tryAction('Event', function() { startDiscordEvent(); });
  }

  if (data.tweet) {
    tryAction('Tweet', function() {
      xUrl = sendCrewTweet();
      setLastXUrl_(xUrl);
    });
  }

  // Pass flags for which Discord posts to make
  const discordOptions = {
    postGeneral: data.postGeneral,
    postBand: data.postBand,
    postCrew: data.postCrew
  };

  if (data.postGeneral || data.postBand || data.postCrew) {
    tryAction('Discord', function() { postCrewToDiscord(null, discordOptions); });
  }

  if (xUrl) clearLastXUrl_();

  if (data.attendance) {
    tryAction('Attendance', function() { takeAttendanceNowAndScheduleBurst(); });
  }

  // Update the send cell and timestamp
  const ssId = props.getProperty('PENDING_SEND_SHEET_ID');
  const cellA1 = props.getProperty('PENDING_SEND_CELL');

  if (ssId && cellA1) {
    const ss = SpreadsheetApp.openById(ssId);
    const sheet = ss.getSheets()[0];
    const sendCell = sheet.getRange(cellA1);

    setBypassThenSetValue_(props, sendCell, SENT_VALUE);

    const lastSentLabelCell = findCellWithText_(sheet, LAST_SENT_LABEL_TEXT);
    if (lastSentLabelCell) {
      const tsCell = lastSentLabelCell.offset(0, 1);
      const tz = Session.getScriptTimeZone();
      const stamp = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
      setBypassThenSetValue_(props, tsCell, stamp);
    }
  }

  props.deleteProperty('PENDING_SEND_SHEET_ID');
  props.deleteProperty('PENDING_SEND_CELL');

  // Build summary message
  let msg = 'Ran: ' + (results.ran.length ? results.ran.join(', ') : 'none');
  if (results.failed.length) {
    msg += '\n\nFailed:\n' + results.failed.join('\n');
  }

  SpreadsheetApp.getUi().alert(msg);
}

/**
 * Simple onEdit trigger for D3 checkbox (legacy).
 */
function onEdit(e) {
  if (!e) return;

  const sheet = e.source.getActiveSheet();
  const range = e.range;

  const TRIGGER_ROW = 3;
  const TRIGGER_COL = 4;

  if (range.getRow() !== TRIGGER_ROW || range.getColumn() !== TRIGGER_COL) return;

  const value = range.getValue();
  if (value !== true) return;

  const crew = getCrewLookupStringFromActiveSpreadsheet_();
  const emoji = lookupEmojiForCrew_(crew);

  const message =
    `${emoji}🏴‍☠️🤙\n` +
    `${crew} call starts now!\n` +
    `discord.pizzadao.xyz`;

  sendTweetWithCrewGif_(crew, message);
}

/**
 * Run once to create an installed onEdit trigger that calls sendAll(e).
 */
function setupOnEditSendAllTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  deleteTriggersForHandler_('sendAll');

  ScriptApp.newTrigger('sendAll')
    .forSpreadsheet(ss)
    .onEdit()
    .create();
}

/**
 * Remove the sendAll trigger.
 */
function teardownOnEditSendAllTrigger() {
  deleteTriggersForHandler_('sendAll');
}
