/**
 * PIZZADAO ATTENDANCE - DYNAMIC DAILY SHEET VERSION
 */

// ===================== CONFIGURATION =====================
var TARGET_ATTENDANCE_SS_ID = "1S7WGjHpMcxw8erA3cBevoGlVX_G253AMGg1kNAU_53o";
var BOT_BASE_URL = "https://pizzadao-discord-bot-production.up.railway.app";
var VOICE_CHANNEL_ID = "823956905739026442";

/**
 * Get Bot API key from Script Properties
 */
function getAttendanceBotApiKey_() {
  var key = PropertiesService.getScriptProperties().getProperty('BOT_API_KEY');
  if (!key) {
    throw new Error('BOT_API_KEY not set in Script Properties');
  }
  return key;
}

/**
 * Creates the custom menu.
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('PizzaDAO Tools')
    .addItem('Start Attendance (1 Hour)', 'startAttendanceSequence')
    .addItem('Stop Attendance Manually', 'stopAttendanceSequence')
    .addToUi();
}

/**
 * Initiates the 1-hour attendance cycle.
 */
function startAttendanceSequence() {
  var props = PropertiesService.getScriptProperties();
  var startTime = new Date().getTime();

  props.setProperty('ATTENDANCE_START_TIME', startTime.toString());

  // 1. Run immediate check
  var status = recordAttendanceToMaster();

  // 2. Set recurring trigger
  clearAttendanceTriggers_();
  ScriptApp.newTrigger('handleRecurringAttendance')
    .timeBased()
    .everyMinutes(10)
    .create();

  SpreadsheetApp.getUi().alert("Attendance Started!\n\n" + status + "\n\nTracking will continue every 10 mins for 1 hour.");
}

function handleRecurringAttendance() {
  var props = PropertiesService.getScriptProperties();
  var startTimeStr = props.getProperty('ATTENDANCE_START_TIME');

  if (!startTimeStr) {
    stopAttendanceSequence();
    return;
  }

  var startTime = parseInt(startTimeStr);
  var currentTime = new Date().getTime();
  var oneHour = 60 * 60 * 1000;

  if (currentTime - startTime > oneHour) {
    stopAttendanceSequence();
    return;
  }

  recordAttendanceToMaster();
}

/**
 * CORE LOGIC: Find/Create daily sheet and record members
 */
function recordAttendanceToMaster() {
  try {
    var mainSs = SpreadsheetApp.openById(TARGET_ATTENDANCE_SS_ID);
    var logTab = getOrCreateAttendanceLogTab_(mainSs);

    var tz = Session.getScriptTimeZone();
    var now = new Date();
    var todayKey = Utilities.formatDate(now, tz, "yyyy-MM-dd");

    // 1. Find or Create Today's External Spreadsheet
    var dailySs;
    var existing = findAttendanceLinkForDate_(logTab, todayKey);

    if (existing && existing.url) {
      dailySs = SpreadsheetApp.openByUrl(existing.url);
    } else {
      dailySs = SpreadsheetApp.create("PizzaDAO Attendance - " + todayKey);
      // Make it accessible to anyone with the link
      var file = DriveApp.getFileById(dailySs.getId());
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      var linkFormula = '=HYPERLINK("' + dailySs.getUrl() + '", "Attendance ' + todayKey + '")';
      logTab.appendRow([now, linkFormula, 0]);
    }

    // 2. Fetch from Bot
    var botApiKey = getAttendanceBotApiKey_();
    var url = BOT_BASE_URL + "/voice-attendance?channelId=" + encodeURIComponent(VOICE_CHANNEL_ID);
    var res = UrlFetchApp.fetch(url, {
      headers: { Authorization: "Bearer " + botApiKey },
      muteHttpExceptions: true
    });
    var payload = JSON.parse(res.getContentText());
    var members = Array.isArray(payload.members) ? payload.members : [];

    if (members.length === 0) return "No members found in voice.";

    // 3. Merge into the Daily Sheet
    var dailySheet = dailySs.getSheets()[0];
    if (dailySheet.getLastRow() === 0) {
      dailySheet.getRange(1,1,1,6).setValues([["Timestamp", "Name", "Discord ID", "Joined", "Left", "Notes"]]);
      dailySheet.setFrozenRows(1);
    }

    var lastRow = dailySheet.getLastRow();
    var existingIds = {};
    if (lastRow >= 2) {
      var data = dailySheet.getRange(2, 3, lastRow - 1, 1).getValues();
      data.forEach(function(r) { existingIds[String(r[0]).trim()] = true; });
    }

    var newRows = members
      .filter(function(m) { return !existingIds[String(m.id).trim()]; })
      .map(function(m) {
        return [
          now,
          m.displayName || m.username || m.tag,
          String(m.id).trim(),
          "",
          "",
          "Channel: " + (payload.channelName || 'Voice')
        ];
      });

    if (newRows.length > 0) {
      dailySheet.getRange(dailySheet.getLastRow() + 1, 1, newRows.length, 6).setValues(newRows);
    }

    // 4. Update the "Count" in the main log tab
    var finalCount = dailySheet.getLastRow() - 1;
    var currentLogRange = findAttendanceLinkForDate_(logTab, todayKey);
    if (currentLogRange) {
      logTab.getRange(currentLogRange.row, 3).setValue(finalCount);
    }

    return "Processed. Today's Total: " + finalCount + " members.";

  } catch (e) {
    return "Error: " + e.toString();
  }
}

// ===================== HELPER UTILITIES =====================

function getOrCreateAttendanceLogTab_(ss) {
  var sheet = ss.getSheetByName("Attendance");
  if (!sheet) {
    sheet = ss.insertSheet("Attendance");
    sheet.appendRow(["Date", "Sheet Link", "Total Attendees"]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findAttendanceLinkForDate_(logTab, dateKey) {
  var lastRow = logTab.getLastRow();
  if (lastRow < 2) return null;

  var data = logTab.getRange(2, 1, lastRow - 1, 2).getValues();
  var tz = Session.getScriptTimeZone();

  for (var i = 0; i < data.length; i++) {
    var rowDate = data[i][0];
    if (rowDate instanceof Date) {
      var formattedRowDate = Utilities.formatDate(rowDate, tz, "yyyy-MM-dd");
      if (formattedRowDate === dateKey) {
        // Extract URL from Hyperlink formula if possible
        var formula = logTab.getRange(i + 2, 2).getFormula();
        var urlMatch = formula.match(/"(https?:\/\/[^"]+)"/);
        return {
          row: i + 2,
          url: urlMatch ? urlMatch[1] : null
        };
      }
    }
  }
  return null;
}

function stopAttendanceSequence() {
  clearAttendanceTriggers_();
  PropertiesService.getScriptProperties().deleteProperty('ATTENDANCE_START_TIME');
  console.log("Attendance cycle stopped.");
}

function clearAttendanceTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'handleRecurringAttendance') {
      ScriptApp.deleteTrigger(t);
    }
  });
}
