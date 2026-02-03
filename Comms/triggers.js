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

    // === RUN ALL ACTIONS ===
    startDiscordEvent();

    const xUrl = sendCrewTweet();
    setLastXUrl_(xUrl);

    postCrewToDiscord();
    clearLastXUrl_();

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

    ui.alert('Ran: startDiscordEvent + postCrewToDiscord + sendCrewTweet + started attendance burst');
  } catch (err) {
    try {
      SpreadsheetApp.getUi().alert(`Error: ${err && err.message ? err.message : err}`);
    } catch (_) { }
    console.error(err);
  }
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
