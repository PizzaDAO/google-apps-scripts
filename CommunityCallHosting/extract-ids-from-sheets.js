/**
 * Extract Discord IDs from the specific attendance sheets provided
 */
function extractIdsFromSheets() {
  var sheetUrls = [
    "https://docs.google.com/spreadsheets/d/1GlCHQtIsVciNrP-sd1oiPtjrOIoDTDC8cmW3CO7g_Ag/edit",
    "https://docs.google.com/spreadsheets/d/1ilzXRUCb52r9bqp-PH4hxWbG_eHeASPui2iJpi0P6m0/edit",
    "https://docs.google.com/spreadsheets/d/1cJ6yyhgle3JbZlZ2e1D0TtXqFPGhii1ZdLGZlTK_bvQ/edit"
  ];

  var nameToId = {};

  sheetUrls.forEach(function(url, index) {
    console.log("\n=== Sheet " + (index + 1) + " ===");
    console.log("URL: " + url);

    try {
      var ss = SpreadsheetApp.openByUrl(url);
      var sheet = ss.getSheets()[0];
      var data = sheet.getDataRange().getValues();

      console.log("Name: " + ss.getName());
      console.log("Rows: " + data.length);
      console.log("Headers: " + data[0].join(" | "));

      // Find name and ID columns
      var headers = data[0].map(function(h) { return String(h).toLowerCase().trim(); });

      var nameCol = -1;
      var idCol = -1;

      for (var c = 0; c < headers.length; c++) {
        var h = headers[c];
        if (h === 'name' || h === 'display name' || h === 'displayname') {
          nameCol = c;
        }
        if (h === 'discord id' || h === 'discordid' || h === 'id') {
          idCol = c;
        }
      }

      console.log("Name column: " + nameCol + ", ID column: " + idCol);

      if (nameCol === -1 || idCol === -1) {
        console.log("Trying default columns (B=1, C=2)...");
        nameCol = 1;
        idCol = 2;
      }

      var added = 0;
      for (var r = 1; r < data.length; r++) {
        var name = String(data[r][nameCol] || '').trim();
        var discordId = String(data[r][idCol] || '').trim();

        if (name && discordId && discordId.length > 10) {
          nameToId[name] = discordId;
          added++;
        }
      }

      console.log("Added " + added + " mappings from this sheet");

    } catch (e) {
      console.log("ERROR: " + e);
    }
  });

  console.log("\n=== ALL MAPPINGS (" + Object.keys(nameToId).length + " total) ===\n");

  // Print all mappings
  var sortedNames = Object.keys(nameToId).sort();
  sortedNames.forEach(function(name) {
    console.log('"' + name + '": "' + nameToId[name] + '",');
  });

  // Now match against Jan 25 attendees
  var jan25Attendees = [
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

  console.log("\n=== MATCHING JAN 25 ATTENDEES ===\n");

  var matched = {};
  var unmatched = [];

  jan25Attendees.forEach(function(name) {
    // Try exact match first
    if (nameToId[name]) {
      matched[name] = nameToId[name];
      console.log("EXACT: " + name + " -> " + nameToId[name]);
      return;
    }

    // Try case-insensitive match
    var lowerName = name.toLowerCase();
    for (var key in nameToId) {
      if (key.toLowerCase() === lowerName) {
        matched[name] = nameToId[key];
        console.log("CASE MATCH: " + name + " -> " + nameToId[key]);
        return;
      }
    }

    // Try partial match (name contains or is contained)
    for (var key in nameToId) {
      var keyLower = key.toLowerCase();
      if (keyLower.indexOf(lowerName) !== -1 || lowerName.indexOf(keyLower) !== -1) {
        matched[name] = nameToId[key];
        console.log("PARTIAL: " + name + " (matched '" + key + "') -> " + nameToId[key]);
        return;
      }
    }

    // Try matching first word
    var firstName = name.split(' ')[0].toLowerCase();
    for (var key in nameToId) {
      if (key.toLowerCase().indexOf(firstName) === 0) {
        matched[name] = nameToId[key];
        console.log("FIRST NAME: " + name + " (matched '" + key + "') -> " + nameToId[key]);
        return;
      }
    }

    unmatched.push(name);
    console.log("NO MATCH: " + name);
  });

  console.log("\n=== SUMMARY ===");
  console.log("Matched: " + Object.keys(matched).length + " / " + jan25Attendees.length);
  console.log("Unmatched: " + unmatched.join(", "));

  console.log("\n=== COPY THIS FOR UPDATE SCRIPT ===\n");
  console.log("var discordIds = " + JSON.stringify(matched, null, 2) + ";");

  return matched;
}
