/**
 * SECRET SERVICE - Main Entry Point
 *
 * Centralized web app that handles all announcements for PizzaDAO crew sheets.
 * Public crew sheets call this service with a password to trigger actions.
 *
 * Deploy as: Web app
 * Execute as: Me
 * Who has access: Anyone (authentication handled by password)
 */

/**
 * Handles POST requests from thin clients.
 *
 * Expected payload:
 * {
 *   password: string,
 *   spreadsheetId: string,
 *   action: 'announce' | 'tweet' | 'discord' | 'event' | 'attendance',
 *   options: object (optional)
 * }
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const { password, spreadsheetId, action, options } = data;

    // Validate password (skip for test action)
    if (action !== 'test' && !validatePassword_(password)) {
      return jsonResponse_({ success: false, error: 'Invalid password' }, 401);
    }

    // Validate spreadsheet ID (optional security enhancement)
    if (!validateSpreadsheetId_(spreadsheetId)) {
      return jsonResponse_({ success: false, error: 'Unknown spreadsheet' }, 403);
    }

    // Open the spreadsheet
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);

    // Route to appropriate handler
    switch (action) {
      case 'announce':
        return handleAnnounce_(spreadsheet, options || {});
      case 'tweet':
        return handleTweet_(spreadsheet);
      case 'discord':
        return handleDiscord_(spreadsheet, options || {});
      case 'event':
        return handleEvent_(spreadsheet);
      case 'attendance':
        return handleAttendance_(spreadsheet);
      case 'test':
        return handleTest_(spreadsheet);
      default:
        return jsonResponse_({ success: false, error: `Unknown action: ${action}` }, 400);
    }

  } catch (err) {
    Logger.log('doPost error: ' + err.message);
    return jsonResponse_({ success: false, error: err.message || String(err) }, 500);
  }
}

/**
 * Handles the full announcement workflow.
 * This is the main action that combines all steps.
 */
function handleAnnounce_(spreadsheet, options) {
  const results = {
    discordEvent: null,
    tweet: null,
    discord: null,
    attendance: null
  };

  const doDiscordEvent = options.discordEvent !== false;
  const doTweet = options.tweet !== false;
  const doDiscord = options.postGeneral !== false || options.postBand !== false || options.postCrew !== false;
  const doAttendance = options.attendance !== false;

  try {
    // 1. Start Discord event
    if (doDiscordEvent) {
      startDiscordEvent_(spreadsheet);
      results.discordEvent = { success: true };
    }

    // 2. Send tweet and capture URL
    let tweetUrl = null;
    if (doTweet) {
      tweetUrl = sendCrewTweet_(spreadsheet);
      setLastXUrl_(tweetUrl);
      results.tweet = { success: true, url: tweetUrl };
    }

    // 3. Post to Discord webhooks
    if (doDiscord) {
      postCrewToDiscord_(spreadsheet, {
        postGeneral: options.postGeneral !== false,
        postBand: options.postBand !== false,
        postCrew: options.postCrew !== false
      });
      results.discord = { success: true };
    }

    // Clear the X URL after Discord posts
    clearLastXUrl_();

    // 4. Start attendance tracking
    if (doAttendance) {
      const attendanceResult = takeAttendanceNowAndScheduleBurst_(spreadsheet);
      results.attendance = { success: true, ...attendanceResult };
    }

    // Update "Last Sent" timestamp
    updateLastSentTimestamp_(spreadsheet);

    return jsonResponse_({
      success: true,
      message: 'Announcement completed successfully',
      results,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    return jsonResponse_({
      success: false,
      error: err.message,
      partialResults: results
    }, 500);
  }
}

/**
 * Handles tweet-only action.
 */
function handleTweet_(spreadsheet) {
  try {
    const tweetUrl = sendCrewTweet_(spreadsheet);
    return jsonResponse_({
      success: true,
      url: tweetUrl,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse_({ success: false, error: err.message }, 500);
  }
}

/**
 * Handles Discord webhook posting only.
 */
function handleDiscord_(spreadsheet, options) {
  try {
    postCrewToDiscord_(spreadsheet, {
      postGeneral: options.postGeneral !== false,
      postBand: options.postBand !== false,
      postCrew: options.postCrew !== false
    });
    return jsonResponse_({
      success: true,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse_({ success: false, error: err.message }, 500);
  }
}

/**
 * Handles Discord event start only.
 */
function handleEvent_(spreadsheet) {
  try {
    startDiscordEvent_(spreadsheet);
    return jsonResponse_({
      success: true,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse_({ success: false, error: err.message }, 500);
  }
}

/**
 * Handles attendance tracking only.
 */
function handleAttendance_(spreadsheet) {
  try {
    const result = takeAttendanceNowAndScheduleBurst_(spreadsheet);
    return jsonResponse_({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse_({ success: false, error: err.message }, 500);
  }
}

/**
 * Test mode - validates all lookups without posting anything.
 * Use this to verify the service works before going live.
 */
function handleTest_(spreadsheet) {
  const results = {
    spreadsheet: null,
    crewMapping: null,
    webhooks: null,
    eventId: null,
    gifFolder: null,
    twitterCredentials: null,
    botApiKey: null
  };

  try {
    // 1. Spreadsheet info
    results.spreadsheet = {
      success: true,
      name: spreadsheet.getName(),
      id: spreadsheet.getId()
    };

    // 2. Crew mapping lookup
    const crewMapping = findBestCrewMappingForSpreadsheetName_(spreadsheet.getName());
    results.crewMapping = {
      success: !!crewMapping,
      crew: crewMapping?.crew || null,
      role: crewMapping?.role || null,
      event: crewMapping?.event || null
    };

    // 3. Webhook lookups
    const webhookMap = loadCrewWebhookMap_();
    const crewNorm = crewMapping?.crewNorm || '';
    results.webhooks = {
      success: true,
      general: !!webhookMap.get(normalizeForMatch_('GENERAL')),
      band: !!webhookMap.get(normalizeForMatch_('BAND')),
      crew: !!(crewNorm && webhookMap.get(crewNorm))
    };

    // 4. Event ID
    results.eventId = {
      success: !!crewMapping?.event,
      id: crewMapping?.event || null
    };

    // 5. GIF folder check
    const crew = getCrewLookupStringFromSpreadsheet_(spreadsheet);
    try {
      const parent = DriveApp.getFolderById(DRIVE_GIF_FOLDER_ID);
      const iter = parent.getFoldersByName(crew);
      const hasFolder = iter.hasNext();
      results.gifFolder = {
        success: hasFolder,
        crewName: crew,
        folderFound: hasFolder
      };
    } catch (e) {
      results.gifFolder = { success: false, error: e.message };
    }

    // 6. Twitter credentials (check they exist, don't expose values)
    try {
      const hasConsumerKey = !!getTwConsumerKey_();
      const hasConsumerSecret = !!getTwConsumerSecret_();
      const hasAccessToken = !!getTwAccessToken_();
      const hasAccessSecret = !!getTwAccessTokenSecret_();
      results.twitterCredentials = {
        success: hasConsumerKey && hasConsumerSecret && hasAccessToken && hasAccessSecret,
        consumerKey: hasConsumerKey,
        consumerSecret: hasConsumerSecret,
        accessToken: hasAccessToken,
        accessTokenSecret: hasAccessSecret
      };
    } catch (e) {
      results.twitterCredentials = { success: false, error: e.message };
    }

    // 7. Bot API key
    try {
      const hasKey = !!getBotApiKey_();
      results.botApiKey = { success: hasKey };
    } catch (e) {
      results.botApiKey = { success: false, error: e.message };
    }

    // Overall success
    const allSuccess = Object.values(results).every(r => r && r.success);

    return jsonResponse_({
      success: true,
      testMode: true,
      allChecksPass: allSuccess,
      results: results,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    return jsonResponse_({
      success: false,
      testMode: true,
      error: err.message,
      partialResults: results
    }, 500);
  }
}

/**
 * Creates a JSON response with the specified status code.
 */
function jsonResponse_(data, statusCode) {
  // Note: Apps Script web apps always return 200, but we include status in body
  const response = {
    ...data,
    statusCode: statusCode || 200
  };

  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Updates the "Last Sent" timestamp in the spreadsheet.
 */
function updateLastSentTimestamp_(spreadsheet) {
  try {
    const sheet = spreadsheet.getSheets()[0];
    const lastSentLabelCell = findCellWithText_(sheet, 'Last Sent:');
    if (lastSentLabelCell) {
      const tsCell = lastSentLabelCell.offset(0, 1);
      const tz = Session.getScriptTimeZone();
      const stamp = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
      tsCell.setValue(stamp);
    }
  } catch (err) {
    Logger.log('Could not update Last Sent timestamp: ' + err.message);
  }
}

/**
 * Finds the first cell in the sheet whose display value exactly matches text.
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
 * Test function - can be run manually to verify the service works.
 */
function testSecretService() {
  const testSpreadsheetId = '1YVUJHWlyivugIWERa2qsaNGTQDN7Ogu1lIhATO8c6kU'; // Replace with a test sheet
  const ss = SpreadsheetApp.openById(testSpreadsheetId);

  Logger.log('Testing Secret Service...');
  Logger.log('Spreadsheet: ' + ss.getName());

  // Test individual components
  Logger.log('Auth validation: ' + validatePassword_(getSecret_('ANNOUNCE_PASSWORD')));
  Logger.log('Spreadsheet validation: ' + validateSpreadsheetId_(testSpreadsheetId));
}
