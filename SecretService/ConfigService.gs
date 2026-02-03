/**
 * CONFIG SERVICE
 *
 * Handles loading configuration data from spreadsheets:
 * - Crew mappings (crew -> role, event, emoji, etc.)
 * - Webhook mappings (crew -> Discord webhook URL)
 * - Muscle roster (muscle ID -> Discord tag)
 */

// ============================================
// CONSTANTS
// ============================================

// Spreadsheet IDs
const CREW_WEBHOOKS_SPREADSHEET_ID = '1bSLN2mL1K-qr3nLiURVjhm31Zxn0J3ta1Pq0txlXsPI';
const CREW_WEBHOOKS_SHEET_GID = 0;

const CREW_MAPPINGS_SPREADSHEET_ID = '19itGq86BRQTVehKhtRFKwK8gZqjsUQ_bG5cuVmem9HU';
const CREW_MAPPINGS_SHEET_NAME = 'Crew Mappings';

const CREW_LOOKUP_SPREADSHEET_ID = '19itGq86BRQTVehKhtRFKwK8gZqjsUQ_bG5cuVmem9HU';
const CREW_LOOKUP_SHEET_INDEX = 2;

const MUSCLE_ROSTER_SPREADSHEET_ID = '16BBOfasVwz8L6fPMungz_Y0EfF6Z9puskLAix3tCHzM';
const MUSCLE_ROSTER_SHEET_INDEX = 1;
const MUSCLE_ROSTER_HEADER_ROW = 12;

// Drive folder containing GIF subfolders
const DRIVE_GIF_FOLDER_ID = '1DgzVx8aL6PgPm0-Np9gQMPywUEBVBxuA';

// GIF constraints
const MAX_GIF_BYTES = 5242880; // 5MB
const MAX_PICK_ATTEMPTS = 50;

// Discord constants
const BOT_BASE_URL = 'https://pizzadao-discord-bot-production.up.railway.app';
const VOICE_CHANNEL_ID = '823956905739026442';
const DISCORD_GUILD_ID = '812097286003359764';

// Role tags
const GENERAL_ROLE_TAG = '<@&815976604710469692>';
const DEFAULT_CHANNEL_ROLE_TAG = '<@&1254491244214620190>';

const TURTLE_TAGS = {
  RAPHAEL: '<@&815277786012975134>',
  LEONARDO: '<@&815269418305191946>',
  MICHELANGELO: '<@&815277933622591531>',
  DONATELLO: '<@&815277900492046356>',
  APRIL: '<@&815976204900499537>'
};

// Attendance burst settings
const ATTENDANCE_BURST_RUNS = 6;
const ATTENDANCE_BURST_MINUTES = 10;
const ATTENDANCE_BURST_COUNT_KEY_PREFIX = 'ATTENDANCE_BURST_COUNT__';

// ============================================
// CREW MAPPINGS
// ============================================

/**
 * Loads crew mappings from the Crew Mappings spreadsheet.
 * Includes caching for performance.
 *
 * @returns {Object[]} Array of crew mapping objects
 */
function loadCrewMappings_() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'crewMappings_v3';

  const cached = cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const mapSs = SpreadsheetApp.openById(CREW_MAPPINGS_SPREADSHEET_ID);
  const mapSheet = mapSs.getSheetByName(CREW_MAPPINGS_SHEET_NAME) || mapSs.getSheets()[0];

  const lr = mapSheet.getLastRow();
  const lc = mapSheet.getLastColumn();
  if (lr < 2) return [];

  const values = mapSheet.getRange(1, 1, lr, lc).getValues();
  const headerNorm = values[0].map(h => normalizeForMatch_(h));
  const idx = (name) => headerNorm.indexOf(normalizeForMatch_(name));

  const iCrew = idx('Crew');
  const iTurtles = idx('Turtles');
  const iRole = idx('Role');
  const iChannel = idx('Channel');
  const iEvent = idx('Event');
  const iEmoji = idx('Emoji');
  const iSheet = idx('Sheet');
  const iSpreadsheetId = idx('SpreadsheetId');

  if (iCrew === -1) throw new Error('Crew Mappings must have a "Crew" column.');

  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const crew = String(row[iCrew] ?? '').trim();
    if (!crew) continue;

    out.push({
      crew,
      crewNorm: normalizeForMatch_(crew),
      turtles: String(row[iTurtles] ?? '').trim(),
      role: String(row[iRole] ?? '').trim(),
      channel: String(row[iChannel] ?? '').trim(),
      event: String(row[iEvent] ?? '').trim(),
      emoji: String(row[iEmoji] ?? '').trim(),
      sheetKey: String(row[iSheet] ?? '').trim(),
      sheetKeyNorm: normalizeForMatch_(String(row[iSheet] ?? '').trim()),
      spreadsheetId: iSpreadsheetId !== -1 ? String(row[iSpreadsheetId] ?? '').trim() : ''
    });
  }

  cache.put(cacheKey, JSON.stringify(out), 600);
  return out;
}

/**
 * Finds the best matching crew mapping for a spreadsheet name.
 *
 * @param {string} spreadsheetName - The spreadsheet name to match
 * @returns {Object|null} The best matching crew mapping
 */
function findBestCrewMappingForSpreadsheetName_(spreadsheetName) {
  const nameNorm = normalizeForMatch_(spreadsheetName);
  const mappings = loadCrewMappings_();

  let best = null;

  for (const m of mappings) {
    // Prefer matching by "Sheet" column if present
    if (m.sheetKeyNorm && nameNorm.includes(m.sheetKeyNorm)) {
      if (!best || m.sheetKeyNorm.length > (best.sheetKeyNorm || '').length) best = m;
      continue;
    }
    // Fallback: match by "Crew"
    if (m.crewNorm && nameNorm.includes(m.crewNorm)) {
      if (!best || m.crewNorm.length > (best.crewNorm || '').length) best = m;
    }
  }

  return best;
}

// ============================================
// WEBHOOK MAPPINGS
// ============================================

/**
 * Loads crew webhook mappings from the Crew Webhooks spreadsheet.
 *
 * @returns {Map} Map of normalized crew name -> webhook URL
 */
function loadCrewWebhookMap_() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'crewWebhooks_v3';

  const cached = cache.get(cacheKey);
  if (cached) {
    return new Map(Object.entries(JSON.parse(cached)));
  }

  const whSs = SpreadsheetApp.openById(CREW_WEBHOOKS_SPREADSHEET_ID);
  const whSheet =
    whSs.getSheets().find(s => String(s.getSheetId()) === String(CREW_WEBHOOKS_SHEET_GID)) ||
    whSs.getSheets()[0];

  const lr = whSheet.getLastRow();
  const lc = whSheet.getLastColumn();
  if (lr < 2) return new Map();

  const values = whSheet.getRange(1, 1, lr, lc).getValues();
  const headerNorm = values[0].map(h => normalizeForMatch_(h));

  const iCrew = headerNorm.indexOf('crew');
  const iWebhook = headerNorm.indexOf('webhook');
  if (iCrew === -1 || iWebhook === -1) {
    throw new Error('Webhook sheet must have headers: "Crew" and "Webhook".');
  }

  const map = new Map();
  for (let r = 1; r < values.length; r++) {
    const crew = String(values[r][iCrew] ?? '').trim();
    const webhook = String(values[r][iWebhook] ?? '').trim();
    if (!crew || !webhook) continue;
    map.set(normalizeForMatch_(crew), webhook);
  }

  const obj = {};
  for (const [k, v] of map.entries()) obj[k] = v;
  cache.put(cacheKey, JSON.stringify(obj), 600);

  return map;
}

// ============================================
// MUSCLE ROSTER
// ============================================

/**
 * Builds maps of Muscle ID -> Discord tag and Muscle ID -> Name from the roster spreadsheet.
 *
 * @returns {Object} Object containing { discordMap: Map, nameMap: Map }
 */
function buildMuscleIdMaps_() {
  const rosterSs = SpreadsheetApp.openById(MUSCLE_ROSTER_SPREADSHEET_ID);
  const rosterSheet = rosterSs.getSheets()[MUSCLE_ROSTER_SHEET_INDEX];

  if (!rosterSheet) {
    throw new Error('Muscle roster sheet not found at index ' + MUSCLE_ROSTER_SHEET_INDEX);
  }

  const lr = rosterSheet.getLastRow();
  const lc = rosterSheet.getLastColumn();

  if (lr <= MUSCLE_ROSTER_HEADER_ROW) return { discordMap: new Map(), nameMap: new Map() };

  const rawHeaders = rosterSheet.getRange(MUSCLE_ROSTER_HEADER_ROW, 1, 1, lc).getValues()[0];
  const headersNorm = rawHeaders.map(h => String(h || '').trim().toLowerCase().replace(/\s+/g, ''));

  const idIdx = headersNorm.indexOf('muscleid') !== -1 ? headersNorm.indexOf('muscleid') :
    headersNorm.indexOf('id') !== -1 ? headersNorm.indexOf('id') : 0;

  const discordIdx = headersNorm.indexOf('discord') !== -1 ? headersNorm.indexOf('discord') :
    headersNorm.indexOf('discordtag') !== -1 ? headersNorm.indexOf('discordtag') :
      headersNorm.indexOf('discordid') !== -1 ? headersNorm.indexOf('discordid') : 18;

  const nameIdx = headersNorm.indexOf('name') !== -1 ? headersNorm.indexOf('name') :
    headersNorm.indexOf('member') !== -1 ? headersNorm.indexOf('member') :
      headersNorm.indexOf('membername') !== -1 ? headersNorm.indexOf('membername') : -1;

  const numRows = lr - MUSCLE_ROSTER_HEADER_ROW;
  const values = rosterSheet.getRange(MUSCLE_ROSTER_HEADER_ROW + 1, 1, numRows, Math.max(lc, 19)).getValues();

  const discordMap = new Map();
  const nameMap = new Map();

  for (let r = 0; r < values.length; r++) {
    const idKey = normalizeId_(values[r][idIdx]);
    const tagVal = String(values[r][discordIdx] || '').trim();
    const nameVal = nameIdx !== -1 ? String(values[r][nameIdx] || '').trim() : '';

    if (!idKey) continue;
    if (tagVal) discordMap.set(idKey, tagVal);
    if (nameVal) nameMap.set(idKey, nameVal);
  }

  return { discordMap, nameMap };
}

// ============================================
// EMOJI LOOKUP
// ============================================

/**
 * Looks up the emoji for a crew from the lookup spreadsheet.
 *
 * @param {string} crew - The crew name to look up
 * @returns {string} The emoji for the crew, or default pizza emoji
 */
function lookupEmojiForCrew_(crew) {
  const ss = SpreadsheetApp.openById(CREW_LOOKUP_SPREADSHEET_ID);
  const sheet = ss.getSheets()[CREW_LOOKUP_SHEET_INDEX - 1];

  if (!sheet) {
    throw new Error('Crew lookup sheet not found at index ' + CREW_LOOKUP_SHEET_INDEX);
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    throw new Error('Crew lookup sheet is empty.');
  }

  // Read columns E:F
  const values = sheet.getRange(1, 5, lastRow, 2).getValues();

  for (let i = 0; i < values.length; i++) {
    const rowCrew = String(values[i][0] || '').trim();
    const rowEmoji = String(values[i][1] || '').trim();
    if (rowCrew && rowCrew.toLowerCase() === crew.toLowerCase()) {
      return rowEmoji || '🍕';
    }
  }

  return '🍕';
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Normalizes a string for matching (removes spaces, lowercase).
 */
function normalizeForMatch_(s) {
  return String(s || '').trim().replace(/\s+/g, '').toLowerCase();
}

/**
 * Normalizes an ID value (handles numbers and strings).
 */
function normalizeId_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  return String(v).trim().replace(/\s+/g, '');
}

/**
 * Parses turtle tokens from a comma-separated string.
 */
function parseTurtleToken_(token) {
  const t = String(token || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!t) return null;

  if (t === 'RAPH' || t === 'RAPHAEL') return 'RAPHAEL';
  if (t === 'LEO' || t === 'LEONARDO') return 'LEONARDO';
  if (t === 'MIKE' || t === 'MICHELANGELO') return 'MICHELANGELO';
  if (t === 'DON' || t === 'DONATELLO') return 'DONATELLO';
  if (TURTLE_TAGS[t]) return t;

  return null;
}

/**
 * Gets turtle tags from a crew mapping.
 */
function turtleTagsFromCrewMapping_(m) {
  if (!m?.turtles) return [];

  const turtleKeys = String(m.turtles)
    .split(',')
    .map(parseTurtleToken_)
    .filter(Boolean);

  const tags = [];
  const seen = new Set();
  for (const k of turtleKeys) {
    const tag = TURTLE_TAGS[k];
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }
  return tags;
}

/**
 * Derives the crew lookup string from a spreadsheet name.
 */
function getCrewLookupStringFromSpreadsheet_(spreadsheet) {
  const name = String(spreadsheet.getName() || '').trim();
  let crew = name;

  if (crew.startsWith('PizzaDAO ')) {
    crew = crew.substring('PizzaDAO '.length);
  }
  if (crew.endsWith(' Crew')) {
    crew = crew.substring(0, crew.length - ' Crew'.length);
  }

  crew = crew.trim();
  if (!crew) {
    throw new Error('Could not derive Crew lookup string from spreadsheet name: "' + name + '"');
  }

  return crew;
}

/**
 * Clears all configuration caches.
 * Useful after updating spreadsheets.
 */
function clearConfigCaches() {
  const cache = CacheService.getScriptCache();
  cache.removeAll(['crewMappings_v3', 'crewWebhooks_v3', 'known_spreadsheet_ids']);
  Logger.log('Config caches cleared');
}
