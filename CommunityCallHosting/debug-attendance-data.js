/**
 * Debug: See what's actually in the attendance sheets
 */
function debugAttendanceData() {
  var TARGET_ATTENDANCE_SS_ID = "1S7WGjHpMcxw8erA3cBevoGlVX_G253AMGg1kNAU_53o";

  console.log("=== DEBUGGING ATTENDANCE DATA ===\n");

  // 1. Check the main attendance spreadsheet structure
  var mainSs = SpreadsheetApp.openById(TARGET_ATTENDANCE_SS_ID);
  var sheets = mainSs.getSheets();

  console.log("Main spreadsheet has " + sheets.length + " sheets:");
  sheets.forEach(function(sheet, i) {
    console.log("  " + i + ": " + sheet.getName() + " (" + sheet.getLastRow() + " rows)");
  });

  // 2. Check the Attendance tab
  var logTab = mainSs.getSheetByName("Attendance");
  if (!logTab) {
    console.log("\nNo 'Attendance' tab found!");
    console.log("Available sheets: " + sheets.map(function(s) { return s.getName(); }).join(", "));
    return;
  }

  console.log("\n=== ATTENDANCE TAB ===");
  var logData = logTab.getDataRange().getValues();
  console.log("Headers: " + logData[0].join(" | "));
  console.log("Total rows: " + logData.length);

  // Show last 10 entries
  console.log("\nLast 10 entries:");
  for (var i = Math.max(1, logData.length - 10); i < logData.length; i++) {
    var formula = logTab.getRange(i + 1, 2).getFormula();
    console.log("Row " + (i + 1) + ": " + logData[i][0] + " | Formula: " + formula);
  }

  // 3. Try to open one of the attendance sheets and inspect it
  console.log("\n=== INSPECTING LINKED ATTENDANCE SHEETS ===");

  var foundSheets = 0;
  for (var row = 1; row < logData.length && foundSheets < 3; row++) {
    var formula = logTab.getRange(row + 1, 2).getFormula();
    var displayValue = String(logData[row][1] || '');

    // Try to extract URL
    var url = null;
    var urlMatch = formula.match(/"(https?:\/\/[^"]+)"/);
    if (urlMatch) {
      url = urlMatch[1];
    } else if (displayValue.indexOf('http') !== -1) {
      url = displayValue;
    }

    if (url) {
      console.log("\nSheet " + (foundSheets + 1) + ": " + url);
      try {
        var attendanceSs = SpreadsheetApp.openByUrl(url);
        var attendanceSheet = attendanceSs.getSheets()[0];
        var data = attendanceSheet.getDataRange().getValues();

        console.log("  Name: " + attendanceSs.getName());
        console.log("  Headers: " + data[0].join(" | "));
        console.log("  Rows: " + data.length);

        // Show first 5 data rows
        console.log("  Sample data:");
        for (var r = 1; r < Math.min(6, data.length); r++) {
          console.log("    " + data[r].join(" | "));
        }

        foundSheets++;
      } catch (e) {
        console.log("  ERROR: " + e);
      }
    }
  }

  if (foundSheets === 0) {
    console.log("No linked sheets found!");
  }
}

/**
 * Build Discord ID map from all attendance sheets
 */
function buildDiscordIdMap() {
  var TARGET_ATTENDANCE_SS_ID = "1S7WGjHpMcxw8erA3cBevoGlVX_G253AMGg1kNAU_53o";

  var nameToId = {};

  var mainSs = SpreadsheetApp.openById(TARGET_ATTENDANCE_SS_ID);
  var logTab = mainSs.getSheetByName("Attendance");

  if (!logTab) {
    console.log("No Attendance tab found");
    return nameToId;
  }

  var logData = logTab.getDataRange().getValues();

  console.log("Processing " + (logData.length - 1) + " attendance entries...\n");

  for (var row = 1; row < logData.length; row++) {
    var formula = logTab.getRange(row + 1, 2).getFormula();
    var displayValue = String(logData[row][1] || '');

    var url = null;
    var urlMatch = formula.match(/"(https?:\/\/[^"]+)"/);
    if (urlMatch) {
      url = urlMatch[1];
    }

    if (url) {
      try {
        var attendanceSs = SpreadsheetApp.openByUrl(url);
        var attendanceSheet = attendanceSs.getSheets()[0];
        var data = attendanceSheet.getDataRange().getValues();

        if (data.length < 2) continue;

        // Find column indices
        var headers = data[0].map(function(h) { return String(h).toLowerCase().trim(); });
        var nameCol = headers.indexOf('name');
        var idCol = headers.indexOf('discord id');

        if (nameCol === -1) {
          // Try to find a column that looks like names
          for (var c = 0; c < headers.length; c++) {
            if (headers[c].indexOf('name') !== -1) {
              nameCol = c;
              break;
            }
          }
        }

        if (idCol === -1) {
          // Try to find a column that looks like discord IDs
          for (var c = 0; c < headers.length; c++) {
            if (headers[c].indexOf('discord') !== -1 || headers[c].indexOf('id') !== -1) {
              idCol = c;
              break;
            }
          }
        }

        // If still not found, try common positions
        if (nameCol === -1) nameCol = 1;
        if (idCol === -1) idCol = 2;

        var addedFromSheet = 0;
        for (var r = 1; r < data.length; r++) {
          var name = String(data[r][nameCol] || '').trim();
          var discordId = String(data[r][idCol] || '').trim();

          // Discord IDs are numeric strings, usually 17-19 digits
          if (name && discordId && discordId.match(/^\d{15,20}$/)) {
            if (!nameToId[name]) {
              nameToId[name] = discordId;
              addedFromSheet++;
            }
          }
        }

        if (addedFromSheet > 0) {
          console.log("Added " + addedFromSheet + " from " + attendanceSs.getName());
        }

      } catch (e) {
        // Skip sheets we can't access
      }
    }
  }

  console.log("\n=== TOTAL MAPPINGS: " + Object.keys(nameToId).length + " ===\n");

  // Show all mappings
  for (var name in nameToId) {
    console.log(name + " -> " + nameToId[name]);
  }

  return nameToId;
}
