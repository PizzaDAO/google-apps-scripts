/**
 * PIZZADAO ATTENDANCE - DYNAMIC DAILY SHEET VERSION
 */

// ===================== CONFIGURATION =====================
const TARGET_ATTENDANCE_SS_ID = "1S7WGjHpMcxw8erA3cBevoGlVX_G253AMGg1kNAU_53o";
const BOT_BASE_URL = "https://pizzadao-discord-bot-production.up.railway.app";
const BOT_API_KEY = "YOUR_BOT_API_KEY_HERE";
const VOICE_CHANNEL_ID = "823956905739026442";

/**
 * Creates the custom menu.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('PizzaDAO Tools')
    .addItem('Start Attendance (1 Hour)', 'startAttendanceSequence')
    .addItem('Stop Attendance Manually', 'stopAttendanceSequence')
    .addToUi();
}

/**
 * Initiates the 1-hour attendance cycle.
 */
function startAttendanceSequence() {
  const props = PropertiesService.getScriptProperties();
  const startTime = new Date().getTime();
  
  props.setProperty('ATTENDANCE_START_TIME', startTime.toString());
  
  // 1. Run immediate check
  const status = recordAttendanceToMaster();
  
  // 2. Set recurring trigger
  clearAttendanceTriggers_();
  ScriptApp.newTrigger('handleRecurringAttendance')
    .timeBased()
    .everyMinutes(10)
    .create();

  SpreadsheetApp.getUi().alert("Attendance Started!\n\n" + status + "\n\nTracking will continue every 10 mins for 1 hour.");
}

function handleRecurringAttendance() {
  const props = PropertiesService.getScriptProperties();
  const startTimeStr = props.getProperty('ATTENDANCE_START_TIME');
  
  if (!startTimeStr) {
    stopAttendanceSequence();
    return;
  }
  
  const startTime = parseInt(startTimeStr);
  const currentTime = new Date().getTime();
  const oneHour = 60 * 60 * 1000;
  
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
    const mainSs = SpreadsheetApp.openById(TARGET_ATTENDANCE_SS_ID);
    const logTab = getOrCreateAttendanceLogTab_(mainSs);
    
    const tz = Session.getScriptTimeZone();
    const now = new Date();
    const todayKey = Utilities.formatDate(now, tz, "yyyy-MM-dd");

    // 1. Find or Create Today's External Spreadsheet
    let dailySs;
    const existing = findAttendanceLinkForDate_(logTab, todayKey);

    if (existing && existing.url) {
      dailySs = SpreadsheetApp.openByUrl(existing.url);
    } else {
      dailySs = SpreadsheetApp.create("PizzaDAO Attendance - " + todayKey);
      // Make it accessible to anyone with the link (optional, matches 2nd script behavior)
      const file = DriveApp.getFileById(dailySs.getId());
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      
      const linkFormula = `=HYPERLINK("${dailySs.getUrl()}", "Attendance ${todayKey}")`;
      logTab.appendRow([now, linkFormula, 0]);
    }

    // 2. Fetch from Bot
    const url = `${BOT_BASE_URL}/voice-attendance?channelId=${encodeURIComponent(VOICE_CHANNEL_ID)}`;
    const res = UrlFetchApp.fetch(url, {
      headers: { Authorization: "Bearer " + BOT_API_KEY },
      muteHttpExceptions: true
    });
    const payload = JSON.parse(res.getContentText());
    const members = Array.isArray(payload.members) ? payload.members : [];

    if (members.length === 0) return "No members found in voice.";

    // 3. Merge into the Daily Sheet
    const dailySheet = dailySs.getSheets()[0];
    if (dailySheet.getLastRow() === 0) {
      dailySheet.getRange(1,1,1,6).setValues([["Timestamp", "Name", "Discord ID", "Joined", "Left", "Notes"]]);
      dailySheet.setFrozenRows(1);
    }

    const lastRow = dailySheet.getLastRow();
    const existingIds = new Set();
    if (lastRow >= 2) {
      const data = dailySheet.getRange(2, 3, lastRow - 1, 1).getValues();
      data.forEach(r => existingIds.add(String(r[0]).trim()));
    }

    const newRows = members
      .filter(m => !existingIds.has(String(m.id).trim()))
      .map(m => [
        now, 
        m.displayName || m.username || m.tag, 
        String(m.id).trim(), 
        "", 
        "", 
        `Channel: ${payload.channelName || 'Voice'}`
      ]);

    if (newRows.length > 0) {
      dailySheet.getRange(dailySheet.getLastRow() + 1, 1, newRows.length, 6).setValues(newRows);
    }

    // 4. Update the "Count" in the main log tab
    const finalCount = dailySheet.getLastRow() - 1;
    const currentLogRange = findAttendanceLinkForDate_(logTab, todayKey);
    if (currentLogRange) {
      logTab.getRange(currentLogRange.row, 3).setValue(finalCount);
    }

    return `Processed. Today's Total: ${finalCount} members.`;

  } catch (e) {
    return "Error: " + e.toString();
  }
}

// ===================== HELPER UTILITIES =====================

function getOrCreateAttendanceLogTab_(ss) {
  let sheet = ss.getSheetByName("Attendance");
  if (!sheet) {
    sheet = ss.insertSheet("Attendance");
    sheet.appendRow(["Date", "Sheet Link", "Total Attendees"]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findAttendanceLinkForDate_(logTab, dateKey) {
  const lastRow = logTab.getLastRow();
  if (lastRow < 2) return null;
  
  const data = logTab.getRange(2, 1, lastRow - 1, 2).getValues();
  const tz = Session.getScriptTimeZone();
  
  for (let i = 0; i < data.length; i++) {
    const rowDate = data[i][0];
    if (rowDate instanceof Date) {
      const formattedRowDate = Utilities.formatDate(rowDate, tz, "yyyy-MM-dd");
      if (formattedRowDate === dateKey) {
        // Extract URL from Hyperlink formula if possible
        const formula = logTab.getRange(i + 2, 2).getFormula();
        const urlMatch = formula.match(/"(https?:\/\/[^"]+)"/);
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
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'handleRecurringAttendance') {
      ScriptApp.deleteTrigger(t);
    }
  });
}