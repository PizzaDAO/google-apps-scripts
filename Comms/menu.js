/**
 * MENU MODULE
 *
 * Custom menu and sheet copy functionality.
 */

/**
 * Adds custom menu on spreadsheet open.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Custom Tools')
    .addItem('Create shared copy & link cell', 'createSharedCopyForSelectedCell')
    .addToUi();
}

/**
 * Creates a copy of the template spreadsheet, names it after the selected cell,
 * makes it editable by anyone, and hyperlinks the cell to that copy.
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

    cell.setValue(displayText);
  }

  const templateFile = DriveApp.getFileById(TEMPLATE_SPREADSHEET_ID);

  let parentFolder;
  const parents = templateFile.getParents();
  if (parents.hasNext()) {
    parentFolder = parents.next();
  } else {
    parentFolder = DriveApp.getRootFolder();
  }

  const copyFile = templateFile.makeCopy(displayText, parentFolder);

  copyFile.setSharing(
    DriveApp.Access.ANYONE_WITH_LINK,
    DriveApp.Permission.EDIT
  );

  const richText = SpreadsheetApp
    .newRichTextValue()
    .setText(displayText)
    .setLinkUrl(copyFile.getUrl())
    .build();

  cell.setRichTextValue(richText);
}

/**
 * Web app endpoint for triggering announcements from website.
 */
function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const apiKey = e.parameter.apiKey || params.apiKey;
    const spreadsheetId = params.spreadsheetId;

    const validApiKey = getSecret_('WEB_API_KEY');
    if (!apiKey || apiKey !== validApiKey) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Unauthorized: Invalid API key'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (!spreadsheetId) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Missing spreadsheetId parameter'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheets()[0];

    startDiscordEvent(ss);
    const xUrl = sendCrewTweet(ss);
    setLastXUrl_(xUrl);
    postCrewToDiscord(ss);
    clearLastXUrl_();
    takeAttendanceNowAndScheduleBurst(ss);

    const lastSentLabelCell = findCellWithText_(sheet, 'Last Sent:');
    if (lastSentLabelCell) {
      const tsCell = lastSentLabelCell.offset(0, 1);
      const tz = Session.getScriptTimeZone();
      const stamp = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
      tsCell.setValue(stamp);
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Announcement triggered successfully',
      tweetUrl: xUrl,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.message || String(err)
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
