/**
 * DISCORD EVENT SERVICE
 *
 * Handles starting and ending Discord scheduled events via the bot API.
 */

/**
 * Starts a Discord scheduled event for the current crew.
 * - Looks up the event ID from the Crew Mappings spreadsheet
 * - Ends any active events first
 * - Starts the new event
 *
 * @param {Spreadsheet} spreadsheet - The crew spreadsheet
 */
function startDiscordEvent_(spreadsheet) {
  const LOOKUP_SPREADSHEET_ID = '19itGq86BRQTVehKhtRFKwK8gZqjsUQ_bG5cuVmem9HU';
  const EVENT_ID_COLUMN = 5;
  const NAME_PREFIX_TO_REMOVE = 'PizzaDAO ';
  const NAME_SUFFIX_TO_REMOVE = ' Crew';

  const apiKey = getBotApiKey_();

  const activeSS = spreadsheet;
  const fullName = activeSS.getName();

  if (!fullName.startsWith(NAME_PREFIX_TO_REMOVE)) {
    throw new Error('Spreadsheet name does not start with "' + NAME_PREFIX_TO_REMOVE + '": ' + fullName);
  }

  let eventName = fullName.replace(NAME_PREFIX_TO_REMOVE, '').trim();
  if (eventName.endsWith(NAME_SUFFIX_TO_REMOVE)) {
    eventName = eventName.slice(0, -NAME_SUFFIX_TO_REMOVE.length).trim();
  }

  Logger.log('Looking up event name: ' + eventName);

  const lookupSS = SpreadsheetApp.openById(LOOKUP_SPREADSHEET_ID);
  const lookupSheet = lookupSS.getSheets()[1];

  if (!lookupSheet) {
    throw new Error('Second sheet not found in lookup spreadsheet');
  }

  const data = lookupSheet.getDataRange().getValues();
  let eventId = null;

  for (let i = 1; i < data.length; i++) {
    const rowEventName = String(data[i][0]).trim();
    if (rowEventName === eventName) {
      eventId = String(data[i][EVENT_ID_COLUMN - 1]).trim();
      break;
    }
  }

  if (!eventId) {
    throw new Error('No event ID found for event name "' + eventName + '"');
  }

  Logger.log('Found event ID: ' + eventId);

  // End any active events first
  endActiveEventsIfNeeded_(apiKey);

  // Start new event
  startEventById_(apiKey, eventId);
}

/**
 * Checks for active events and ends them if found.
 *
 * @param {string} apiKey - The bot API key
 */
function endActiveEventsIfNeeded_(apiKey) {
  const botBase = BOT_BASE_URL;
  const commonHeaders = { Authorization: 'Bearer ' + apiKey };

  Logger.log('Checking for active events in the guild...');
  let hasActiveEvent = false;

  try {
    const checkRes = UrlFetchApp.fetch(botBase + '/get-active-event', {
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

  if (hasActiveEvent) {
    Logger.log('Found active event, cleaning it up...');
    try {
      const endRes = UrlFetchApp.fetch(botBase + '/end-active-events', {
        method: 'post',
        headers: commonHeaders,
        muteHttpExceptions: true
      });
      Logger.log('Cleanup Response: ' + endRes.getContentText());
      Utilities.sleep(2000);
    } catch (e) {
      Logger.log('Cleanup failed (non-critical): ' + e.message);
    }
  } else {
    Logger.log('No active event found, skipping cleanup');
  }
}

/**
 * Starts a Discord event by ID.
 *
 * @param {string} apiKey - The bot API key
 * @param {string} eventId - The Discord event ID to start
 */
function startEventById_(apiKey, eventId) {
  const botBase = BOT_BASE_URL;
  const commonHeaders = { Authorization: 'Bearer ' + apiKey };

  Logger.log('Attempting to start event for ID: ' + eventId);
  const res = UrlFetchApp.fetch(botBase + '/start-event-by-id', {
    method: 'post',
    contentType: 'application/json',
    headers: commonHeaders,
    payload: JSON.stringify({ eventId: eventId }),
    muteHttpExceptions: true
  });

  Logger.log('Start Event Status: ' + res.getResponseCode());
  Logger.log('Start Event Response: ' + res.getContentText());

  const code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Failed to start Discord event: ' + res.getContentText());
  }
}

/**
 * Manually ends all active Discord events.
 * Can be run directly for cleanup.
 */
function endAllActiveEvents() {
  const apiKey = getBotApiKey_();
  const botBase = BOT_BASE_URL;
  const commonHeaders = { Authorization: 'Bearer ' + apiKey };

  Logger.log('Ending all active events...');

  const res = UrlFetchApp.fetch(botBase + '/end-active-events', {
    method: 'post',
    headers: commonHeaders,
    muteHttpExceptions: true
  });

  Logger.log('End Events Response: ' + res.getResponseCode() + ' ' + res.getContentText());
}

/**
 * Gets the currently active Discord event, if any.
 */
function getActiveEvent() {
  const apiKey = getBotApiKey_();
  const botBase = BOT_BASE_URL;
  const commonHeaders = { Authorization: 'Bearer ' + apiKey };

  const res = UrlFetchApp.fetch(botBase + '/get-active-event', {
    method: 'get',
    headers: commonHeaders,
    muteHttpExceptions: true
  });

  Logger.log('Active Event Response: ' + res.getResponseCode() + ' ' + res.getContentText());

  return JSON.parse(res.getContentText());
}
