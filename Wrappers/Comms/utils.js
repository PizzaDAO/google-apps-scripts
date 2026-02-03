/**
 * UTILS MODULE
 *
 * Helper functions used across multiple modules.
 */

/**
 * Gets the crew name from the spreadsheet name.
 * Removes "PizzaDAO " prefix and " Crew" suffix.
 */
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

/**
 * Looks up the emoji for a crew from the Crew Mappings sheet.
 * Finds columns by header name ("Crew" and "Emoji").
 */
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

/**
 * Finds the first cell in the sheet whose display value matches text.
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
 * Prevents the subsequent onEdit from prompting again.
 */
function setBypassThenSetValue_(props, cell, value) {
  props.setProperty(BYPASS_PROP_KEY, '1');
  cell.setValue(value);
}

/**
 * Stores the X URL for use by Discord posting.
 */
function setLastXUrl_(url) {
  PropertiesService.getScriptProperties().setProperty(LAST_X_URL_PROP_KEY, String(url || '').trim());
}

/**
 * Gets the stored X URL.
 */
function getLastXUrl_() {
  return String(PropertiesService.getScriptProperties().getProperty(LAST_X_URL_PROP_KEY) || '').trim();
}

/**
 * Clears the stored X URL.
 */
function clearLastXUrl_() {
  PropertiesService.getScriptProperties().deleteProperty(LAST_X_URL_PROP_KEY);
}

/**
 * Deletes all project triggers for a given handler function name.
 */
function deleteTriggersForHandler_(handlerName) {
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    if (t.getHandlerFunction && t.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(t);
    }
  }
}
