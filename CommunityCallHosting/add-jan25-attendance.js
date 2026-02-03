/**
 * ONE-TIME: Update January 25, 2026 attendance with Discord IDs
 */
function addJan25Attendance() {
  // The existing Jan 25 attendance sheet
  var EXISTING_SHEET_URL = "https://docs.google.com/spreadsheets/d/1aOfp3dOjNfrKaE-kyKYyLImHIb7BdZ-heLrXpo81Ntc/edit";
  var timestamp = new Date("2026-01-25T19:37:00");

  // Discord IDs extracted from previous attendance sheets
  var discordIds = {
    "Don Heebie Jeebies": "794594001835393044",
    "Don Malbec": "715701149499654168",
    "Don Pizza Czech": "410053654414884865",
    "Don Scrimmy John": "756664634622083180",
    "Enzo Pepperoni": "403065718914154516",
    "Keanu Palmitos": "614823331253977104",
    "Leo Pepperoni": "392406014374445056",
    "Margherita Ford Coppola": "1145647122805424170",
    "Mozzarella Chief": "1140441157856415744",
    "Mushrooms Caan": "1039030487177506817",
    "Olives Montana": "945163446134132786",
    "Pineapple Ford Coppola": "950444455767466014",
    "Pizza Lord": "1333281060389261394",
    "Queso De Palma": "874076939349020763",
    "Saucy Saucier": "811415547354284044",
    "Tuna Montana": "1013536003740410007",
    "Vera Pineapple": "543783882852532240",
    "Woody Mushrooms": "655525580401410078"
  };

  // Attendees extracted from screenshots
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

  // Open the existing sheet
  var dailySs = SpreadsheetApp.openByUrl(EXISTING_SHEET_URL);
  var dailySheet = dailySs.getSheets()[0];

  console.log("Updating sheet: " + dailySs.getName());

  // Clear and rewrite the sheet
  dailySheet.clear();
  dailySheet.getRange(1, 1, 1, 6).setValues([["Timestamp", "Name", "Discord ID", "Joined", "Left", "Notes"]]);
  dailySheet.setFrozenRows(1);

  // Add all attendees with Discord IDs where available
  var rows = attendees.map(function(name) {
    var discordId = discordIds[name] || "";
    var note = discordId ? "From screenshot" : "From screenshot (ID not found)";
    return [timestamp, name, discordId, "", "", note];
  });

  dailySheet.getRange(2, 1, rows.length, 6).setValues(rows);

  // Summary
  var withIds = attendees.filter(function(n) { return discordIds[n]; }).length;
  var withoutIds = attendees.length - withIds;

  console.log("=== ATTENDANCE UPDATED ===");
  console.log("Sheet: " + dailySs.getUrl());
  console.log("Total attendees: " + attendees.length);
  console.log("With Discord IDs: " + withIds);
  console.log("Without Discord IDs: " + withoutIds);
  console.log("Missing IDs for: " + attendees.filter(function(n) { return !discordIds[n]; }).join(", "));

  return dailySs.getUrl();
}
