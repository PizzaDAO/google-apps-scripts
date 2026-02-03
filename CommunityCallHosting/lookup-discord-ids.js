/**
 * Look up Discord IDs from previous attendance sheets and the Muscle Roster
 * Run this to see what IDs we can find for Jan 25 attendees
 */
function lookupDiscordIds() {
  var TARGET_ATTENDANCE_SS_ID = "1S7WGjHpMcxw8erA3cBevoGlVX_G253AMGg1kNAU_53o";
  var MUSCLE_ROSTER_ID = "16BBOfasVwz8L6fPMungz_Y0EfF6Z9puskLAix3tCHzM";

  var attendees = [
    "Alonso",
    "Don Heebie Jeebies",
    "Don Malbec",
    "Don Pizza Czech",
    "Don Scrimmy John",
    "Enzo Pepperoni",
    "Jake Anchoas",
    "Keanu Palmitos",
    "Leo Pepperoni",
    "Margherita Ford Coppola",
    "Mozzarella Chief",
    "Mushrooms Caan",
    "Olives Montana",
    "Oscar Frog",
    "Pineapple Ford Coppola",
    "Pizza Lord",
    "Quattro Hanks",
    "Queso De Palma",
    "Ricotta Brando",
    "Saucy Saucier",
    "Tuna Montana",
    "Vera Pineapple",
    "Woody Mushrooms"
  ];

  // Build a map of name -> discord ID from all sources
  var nameToId = {};

  // 1. Check Muscle Roster
  console.log("Checking Muscle Roster...");
  try {
    var rosterSs = SpreadsheetApp.openById(MUSCLE_ROSTER_ID);
    var rosterSheet = rosterSs.getSheets()[0];
    var rosterData = rosterSheet.getDataRange().getValues();
    var rosterHeaders = rosterData[0].map(function(h) { return String(h).toLowerCase().trim(); });

    var nameCol = -1;
    var discordIdCol = -1;

    // Find relevant columns
    for (var i = 0; i < rosterHeaders.length; i++) {
      var h = rosterHeaders[i];
      if (h.indexOf('name') !== -1 || h.indexOf('display') !== -1 || h === 'muscle') {
        nameCol = i;
      }
      if (h.indexOf('discord') !== -1 && h.indexOf('id') !== -1) {
        discordIdCol = i;
      }
    }

    console.log("Roster columns - Name: " + nameCol + ", Discord ID: " + discordIdCol);
    console.log("Headers: " + rosterHeaders.join(", "));

    if (nameCol >= 0 && discordIdCol >= 0) {
      for (var r = 1; r < rosterData.length; r++) {
        var name = String(rosterData[r][nameCol] || '').trim();
        var discordId = String(rosterData[r][discordIdCol] || '').trim();
        if (name && discordId) {
          nameToId[name.toLowerCase()] = discordId;
        }
      }
    }
    console.log("Found " + Object.keys(nameToId).length + " entries in roster");
  } catch (e) {
    console.log("Error reading roster: " + e);
  }

  // 2. Check previous attendance sheets
  console.log("\nChecking previous attendance sheets...");
  try {
    var mainSs = SpreadsheetApp.openById(TARGET_ATTENDANCE_SS_ID);
    var logTab = mainSs.getSheetByName("Attendance");

    if (logTab) {
      var logData = logTab.getDataRange().getValues();

      for (var row = 1; row < logData.length && row < 20; row++) { // Check last 20 entries
        var cellValue = logTab.getRange(row + 1, 2).getFormula() || String(logData[row][1] || '');

        // Extract URL from hyperlink formula
        var urlMatch = cellValue.match(/"(https?:\/\/[^"]+)"/);
        if (urlMatch) {
          var url = urlMatch[1];
          console.log("Checking: " + url);

          try {
            var attendanceSs = SpreadsheetApp.openByUrl(url);
            var attendanceSheet = attendanceSs.getSheets()[0];
            var attendanceData = attendanceSheet.getDataRange().getValues();

            // Find Name and Discord ID columns
            var attHeaders = attendanceData[0].map(function(h) { return String(h).toLowerCase().trim(); });
            var attNameCol = attHeaders.indexOf('name');
            var attIdCol = attHeaders.indexOf('discord id');

            if (attNameCol === -1) attNameCol = 1; // Default to column B
            if (attIdCol === -1) attIdCol = 2; // Default to column C

            for (var ar = 1; ar < attendanceData.length; ar++) {
              var attName = String(attendanceData[ar][attNameCol] || '').trim();
              var attId = String(attendanceData[ar][attIdCol] || '').trim();
              if (attName && attId && attId.match(/^\d+$/)) {
                nameToId[attName.toLowerCase()] = attId;
              }
            }
          } catch (e2) {
            console.log("  Could not open: " + e2);
          }
        }
      }
    }
  } catch (e) {
    console.log("Error checking attendance sheets: " + e);
  }

  console.log("\nTotal unique name->ID mappings: " + Object.keys(nameToId).length);

  // 3. Match our attendees
  console.log("\n=== RESULTS FOR JAN 25 ATTENDEES ===\n");

  var found = [];
  var notFound = [];

  attendees.forEach(function(name) {
    var normalizedName = name.toLowerCase();
    // Try exact match first
    var id = nameToId[normalizedName];

    // Try partial matches if exact not found
    if (!id) {
      for (var key in nameToId) {
        if (key.indexOf(normalizedName) !== -1 || normalizedName.indexOf(key) !== -1) {
          id = nameToId[key];
          break;
        }
      }
    }

    if (id) {
      found.push({ name: name, id: id });
      console.log("FOUND: " + name + " -> " + id);
    } else {
      notFound.push(name);
      console.log("NOT FOUND: " + name);
    }
  });

  console.log("\n=== SUMMARY ===");
  console.log("Found: " + found.length + " / " + attendees.length);
  console.log("Missing: " + notFound.join(", "));

  // Output as JSON for easy copy
  console.log("\n=== JSON OUTPUT ===");
  var idMap = {};
  found.forEach(function(f) { idMap[f.name] = f.id; });
  console.log(JSON.stringify(idMap, null, 2));

  return { found: found, notFound: notFound };
}
