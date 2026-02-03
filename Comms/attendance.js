/**
 * ATTENDANCE MODULE
 *
 * Handles voice attendance tracking, burst scheduling, and crew table updates.
 */

/**
 * Takes attendance for today, merging into existing sheet or creating new.
 */
function takeAttendanceTodayMerge(spreadsheet) {
  const crewSs = spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  const mainSheet = crewSs.getSheets()[0];
  const crewName = crewSs.getName();

  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const todayKey = Utilities.formatDate(now, tz, "yyyy-MM-dd");

  const logTab = getOrCreateAttendanceLogTab_(crewSs);

  const existing = findAttendanceLinkForDate_(logTab, todayKey);

  let attendanceSs, attendanceUrl, createdNew = false;
  let logRowToUpdate = existing?.row || null;

  if (existing && existing.url) {
    attendanceUrl = existing.url;
    attendanceSs = SpreadsheetApp.openByUrl(attendanceUrl);
  } else {
    attendanceSs = createPublicAttendanceSpreadsheet_(crewName, todayKey);
    attendanceUrl = attendanceSs.getUrl();
    createdNew = true;

    const linkFormula =
      '=HYPERLINK("' + attendanceUrl + '","' + crewName + " Attendance " + todayKey + '")';

    logTab.appendRow([now, linkFormula, ""]);
    logRowToUpdate = logTab.getLastRow();
  }

  const payload = fetchVoiceAttendance_();
  const members = Array.isArray(payload.members) ? payload.members : [];
  const channelName = payload.channelName || "";

  const addedCount = mergeMembersIntoAttendanceSheet_(attendanceSs, members, channelName);

  updateCrewTableStatus_(mainSheet, members);

  const attendanceTab = attendanceSs.getSheetByName("Attendance") || attendanceSs.getSheets()[0];
  ensureAttendanceSheetHeaders_(attendanceTab);
  const recordedCount = Math.max(0, attendanceTab.getLastRow() - 1);

  if (logRowToUpdate) {
    logTab.getRange(logRowToUpdate, 3).setValue(recordedCount);
  }

  Logger.log(`Attendance Synced: ${members.length} found, ${addedCount} new added to log, Crew Table updated.`);

  return {
    todayKey,
    createdNew,
    attendanceUrl,
    fetchedCount: members.length,
    addedCount,
    recordedCount,
  };
}

/**
 * Takes attendance now and schedules 6 more runs every 10 minutes.
 */
function takeAttendanceNowAndScheduleBurst(spreadsheet) {
  takeAttendanceTodayMerge(spreadsheet);
  startAttendanceBurst_(spreadsheet);
}

function startAttendanceBurst_(spreadsheet) {
  const props = PropertiesService.getScriptProperties();
  const ss = spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  const ssId = ss.getId();
  const countKey = ATTENDANCE_BURST_COUNT_KEY_PREFIX + ssId;

  props.setProperty(countKey, '0');

  deleteTriggersForHandler_('attendanceBurstTick');

  ScriptApp.newTrigger('attendanceBurstTick')
    .timeBased()
    .everyMinutes(ATTENDANCE_BURST_MINUTES)
    .create();

  Logger.log(`Attendance burst started: will run ${ATTENDANCE_BURST_RUNS} more times every ${ATTENDANCE_BURST_MINUTES} minutes.`);
}

function attendanceBurstTick() {
  const props = PropertiesService.getScriptProperties();
  const ssId = SpreadsheetApp.getActiveSpreadsheet().getId();
  const countKey = ATTENDANCE_BURST_COUNT_KEY_PREFIX + ssId;

  let count = parseInt(props.getProperty(countKey) || '0', 10);
  if (isNaN(count)) count = 0;

  if (count >= ATTENDANCE_BURST_RUNS) {
    stopAttendanceBurst_();
    return;
  }

  try {
    takeAttendanceTodayMerge();
  } catch (err) {
    console.error('attendanceBurstTick error:', err);
  }

  count += 1;
  props.setProperty(countKey, String(count));

  Logger.log(`Attendance burst tick complete: ${count}/${ATTENDANCE_BURST_RUNS} additional runs done.`);

  if (count >= ATTENDANCE_BURST_RUNS) {
    stopAttendanceBurst_();
  }
}

function stopAttendanceBurst_() {
  const props = PropertiesService.getScriptProperties();
  const ssId = SpreadsheetApp.getActiveSpreadsheet().getId();
  const countKey = ATTENDANCE_BURST_COUNT_KEY_PREFIX + ssId;

  deleteTriggersForHandler_('attendanceBurstTick');
  props.deleteProperty(countKey);

  Logger.log('Attendance burst finished; trigger removed.');
}

/**
 * Updates crew table status based on voice attendance.
 */
function updateCrewTableStatus_(sheet, members) {
  if (!members || members.length === 0) return;

  const fullData = sheet.getDataRange().getValues();
  let crewHeaderRowIndex = -1;

  for (let i = 0; i < fullData.length; i++) {
    if (String(fullData[i][0]).toLowerCase().trim() === "crew") {
      crewHeaderRowIndex = i + 1;
      break;
    }
  }

  if (crewHeaderRowIndex === -1) {
    Logger.log("Could not find 'crew' label in Column A. Skipping table update.");
    return;
  }

  const headers = fullData[crewHeaderRowIndex].map(h => String(h).toLowerCase().replace(/\s/g, ''));
  const statusCol = headers.indexOf('status') + 1;
  const nameCol = headers.indexOf('name') + 1;
  const idCol = headers.indexOf('discordid') + 1;
  const activeCol = headers.indexOf('active') + 1;

  if (idCol === 0 || statusCol === 0) {
    Logger.log("Missing 'discordid' or 'status' columns in crew table.");
    return;
  }

  const dataStartRow = crewHeaderRowIndex + 2;
  const lastRow = sheet.getLastRow();
  const tableRange = lastRow >= dataStartRow ? sheet.getRange(dataStartRow, 1, lastRow - dataStartRow + 1, headers.length) : null;
  const tableData = tableRange ? tableRange.getValues() : [];

  const now = new Date();

  const existingMemberMap = new Map();
  tableData.forEach((row, i) => {
    const id = String(row[idCol - 1]).trim();
    if (id) existingMemberMap.set(id, dataStartRow + i);
  });

  members.forEach(member => {
    const mId = String(member.id).trim();
    const mName = member.displayName || member.username || member.tag;

    if (existingMemberMap.has(mId)) {
      const rowNum = existingMemberMap.get(mId);
      const currentStatus = String(sheet.getRange(rowNum, statusCol).getValue()).trim();

      if (currentStatus !== "0. Lead" && currentStatus !== "1. Capo") {
        sheet.getRange(rowNum, statusCol).setValue("2. active");
      }

      if (activeCol > 0) {
        sheet.getRange(rowNum, activeCol).setValue(now);
      }
    } else {
      const newRow = new Array(headers.length).fill("");
      newRow[statusCol - 1] = "2. active";
      newRow[nameCol - 1] = mName;
      newRow[idCol - 1] = mId;
      if (activeCol > 0) newRow[activeCol - 1] = now;

      sheet.appendRow(newRow);
    }
  });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function fetchVoiceAttendance_() {
  const url = `${BOT_BASE_URL}/voice-attendance?channelId=${encodeURIComponent(VOICE_CHANNEL_ID)}`;

  const res = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + getBotApiKey_() },
  });

  const code = res.getResponseCode();
  const body = res.getContentText();
  Logger.log("Bot response code: " + code);
  Logger.log("Bot response body: " + body);

  if (code < 200 || code >= 300) throw new Error("Bot fetch failed: HTTP " + code + " " + body);

  const json = JSON.parse(body);
  if (!json || json.ok !== true) throw new Error("Bot returned non-ok: " + body);
  return json;
}

function mergeMembersIntoAttendanceSheet_(attendanceSs, members, channelName) {
  const sheet = attendanceSs.getSheetByName("Attendance") || attendanceSs.getSheets()[0];

  ensureAttendanceSheetHeaders_(sheet);
  removeDuplicateDiscordUserIdsKeepFirst_(sheet);

  const lastRow = sheet.getLastRow();
  const existingIds = new Set();

  if (lastRow >= 2) {
    const idValues = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
    idValues.forEach((r) => {
      const v = String(r[0] || "").trim();
      if (v) existingIds.add(v);
    });
  }

  const capturedAt = new Date();

  const newMembers = members.filter((m) => {
    const id = String(m.id || "").trim();
    return id && !existingIds.has(id);
  });

  if (newMembers.length === 0) return 0;

  const rows = newMembers.map((m) => [
    capturedAt,
    m.displayName || m.username || m.tag || "",
    String(m.id || "").trim(),
    m.joinedAt || "",
    "",
    `Channel: ${channelName}`,
  ]);

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
  return rows.length;
}

function removeDuplicateDiscordUserIdsKeepFirst_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return;

  const idCol = 3;
  const numDataRows = lastRow - 1;
  const idValues = sheet.getRange(2, idCol, numDataRows, 1).getValues();

  const seen = new Set();
  const rowsToDelete = [];

  for (let i = 0; i < idValues.length; i++) {
    const rowNum = i + 2;
    const id = String(idValues[i][0] || "").trim();
    if (!id) continue;

    if (seen.has(id)) {
      rowsToDelete.push(rowNum);
    } else {
      seen.add(id);
    }
  }

  for (let i = rowsToDelete.length - 1; i >= 0; i--) {
    sheet.deleteRow(rowsToDelete[i]);
  }
}

function ensureAttendanceSheetHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 6).setValues([[
      "Timestamp",
      "Name",
      "Discord User ID",
      "Joined At",
      "Left At",
      "Notes",
    ]]);
    sheet.setFrozenRows(1);
    return;
  }

  const header = sheet.getRange(1, 1, 1, 6).getValues()[0];
  const allBlank = header.every((v) => String(v || "").trim() === "");
  if (allBlank) {
    sheet.getRange(1, 1, 1, 6).setValues([[
      "Timestamp",
      "Name",
      "Discord User ID",
      "Joined At",
      "Left At",
      "Notes",
    ]]);
    sheet.setFrozenRows(1);
  }
}

function findAttendanceLinkForDate_(logTab, targetDateKey) {
  const tz = Session.getScriptTimeZone();
  const lastRow = logTab.getLastRow();
  if (lastRow < 2) return null;

  const dayValues = logTab.getRange(2, 1, lastRow - 1, 1).getValues();
  const linkValues = logTab.getRange(2, 2, lastRow - 1, 1).getValues();
  const linkFormulas = logTab.getRange(2, 2, lastRow - 1, 1).getFormulas();

  for (let i = dayValues.length - 1; i >= 0; i--) {
    const dayCell = dayValues[i][0];
    const dayKey = toDateKey_(dayCell, tz);

    if (dayKey !== targetDateKey) continue;

    const f = linkFormulas[i][0] || "";
    const url =
      extractUrlFromHyperlinkFormula_(f) || String(linkValues[i][0] || "").trim();

    if (url) return { row: i + 2, url };
  }

  return null;
}

function toDateKey_(value, tz) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, tz, "yyyy-MM-dd");
  }

  const s = String(value || "").trim();
  if (!s) return "";

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, tz, "yyyy-MM-dd");
  }

  return s;
}

function extractUrlFromHyperlinkFormula_(formula) {
  const m = String(formula || "").match(/HYPERLINK\(\s*"([^"]+)"/i);
  return m ? m[1] : "";
}

function createPublicAttendanceSpreadsheet_(crewName, dateKey) {
  const ss = SpreadsheetApp.create(`${crewName} Attendance ${dateKey}`);

  DriveApp.getFileById(ss.getId()).setSharing(
    DriveApp.Access.ANYONE_WITH_LINK,
    DriveApp.Permission.VIEW
  );

  const sheet = ss.getSheets()[0];
  sheet.setName("Attendance");
  sheet.getRange(1, 1, 1, 6).setValues([[
    "Timestamp",
    "Name",
    "Discord User ID",
    "Joined At",
    "Left At",
    "Notes",
  ]]);
  sheet.setFrozenRows(1);

  return ss;
}

function getOrCreateAttendanceLogTab_(ss) {
  let sheet = ss.getSheetByName("Attendance");
  if (!sheet) {
    sheet = ss.insertSheet("Attendance");
    sheet.getRange(1, 1, 1, 3).setValues([["Day", "Link", "Attendees"]]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 3).setValues([["Day", "Link", "Attendees"]]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  const header = sheet.getRange(1, 1, 1, Math.max(3, sheet.getLastColumn())).getValues()[0];
  const h1 = String(header[0] || "").trim();
  const h2 = String(header[1] || "").trim();
  const h3 = String(header[2] || "").trim();

  if (!h1 && !h2 && !h3) {
    sheet.getRange(1, 1, 1, 3).setValues([["Day", "Link", "Attendees"]]);
    sheet.setFrozenRows(1);
  } else if ((h1.toLowerCase() === "day") && (h2.toLowerCase() === "link") && !h3) {
    sheet.getRange(1, 3).setValue("Attendees");
  }

  return sheet;
}
