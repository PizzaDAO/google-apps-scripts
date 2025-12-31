const SEND_LABEL_TEXT = 'Announce?';
const SEND_VALUE = 'Send';
const SENT_VALUE = 'Sent';
const BYPASS_PROP_KEY = 'BYPASS_NEXT_ONEDIT';

function sendAll(e) {
  const scriptProps = PropertiesService.getScriptProperties();
  if (scriptProps.getProperty(BYPASS_PROP_KEY) === '1') {
    scriptProps.deleteProperty(BYPASS_PROP_KEY);
    return;
  }

  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    if (String(e.value || '').trim() !== SEND_VALUE) return;

    const labelCell = findCellWithText_(sheet, SEND_LABEL_TEXT);
    if (!labelCell || e.range.getColumn() !== labelCell.offset(0,1).getColumn()) return;

    const ui = SpreadsheetApp.getUi();
    const resp = ui.prompt('Password Required', 'Enter password:', ui.ButtonSet.OK_CANCEL);

    if (resp.getSelectedButton() !== ui.Button.OK || resp.getResponseText() !== scriptProps.getProperty('INTERNAL_PASSWORD')) {
      ui.alert('Access Denied.');
      setBypassThenSetValue_(scriptProps, e.range, '');
      return;
    }

    // Run Actions
    startDiscordEvent();
    const xUrl = sendCrewTweet();
    scriptProps.setProperty('LAST_X_URL', xUrl);
    postCrewToDiscord();
    
    setBypassThenSetValue_(scriptProps, e.range, SENT_VALUE);
    ui.alert('Announcements Sent! ✅');
  } catch (err) {
    console.error(err);
  }
}

function setBypassThenSetValue_(p, cell, val) {
  p.setProperty(BYPASS_PROP_KEY, '1');
  cell.setValue(val);
}