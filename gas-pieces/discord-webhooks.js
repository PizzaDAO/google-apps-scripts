/**
 * DISCORD WEBHOOKS MODULE
 *
 * Handles posting messages to Discord channels via webhooks.
 */

/**
 * Posts to Discord webhooks (GENERAL, BAND, and crew channel).
 * @param {Spreadsheet} spreadsheet - Optional spreadsheet to use (defaults to active)
 * @param {Object} options - Optional object to control which posts to make:
 *   - postGeneral: boolean (default true) - Post to general channel
 *   - postBand: boolean (default true) - Post !band command
 *   - postCrew: boolean (default true) - Post embeds to crew channel
 */
function postCrewToDiscord(spreadsheet, options) {
  // Default all options to true for backwards compatibility
  const opts = options || {};
  const doGeneral = opts.postGeneral !== false;
  const doBand = opts.postBand !== false;
  const doCrew = opts.postCrew !== false;
  const CREW_WEBHOOKS_SPREADSHEET_ID = '1bSLN2mL1K-qr3nLiURVjhm31Zxn0J3ta1Pq0txlXsPI';
  const CREW_WEBHOOKS_SHEET_GID = 0;
  const CREW_MAPPINGS_SPREADSHEET_ID = '19itGq86BRQTVehKhtRFKwK8gZqjsUQ_bG5cuVmem9HU';
  const CREW_MAPPINGS_SHEET_NAME = 'Crew Mappings';
  const GENERAL_ROLE_TAG = '<@&815976604710469692>';
  const DEFAULT_CHANNEL_WEBHOOK_URL = getSecretOptional_('DEFAULT_CHANNEL_WEBHOOK_URL', '');
  const DEFAULT_CHANNEL_ROLE_TAG = '<@&1254491244214620190>';

  const TURTLE_TAGS = {
    RAPHAEL: '<@&815277786012975134>',
    LEONARDO: '<@&815269418305191946>',
    MICHELANGELO: '<@&815277933622591531>',
    DONATELLO: '<@&815277900492046356>',
    APRIL: '<@&815976204900499537>'
  };

  const MUSCLE_ROSTER_SPREADSHEET_ID = '16BBOfasVwz8L6fPMungz_Y0EfF6Z9puskLAix3tCHzM';
  const MUSCLE_ROSTER_SHEET_INDEX = 1;
  const MUSCLE_ROSTER_HEADER_ROW = 12;

  const DEBUG = true;

  const ss = spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  const firstSheet = ss.getSheets()[0];
  const sheet = firstSheet;

  const SHEET_NAME = ss.getName();
  const SHEET_URL = ss.getUrl();

  if (DEBUG) {
    console.log('=== DEBUG START ===');
    console.log('[Active Spreadsheet]', SHEET_NAME);
    console.log('[Active Spreadsheet URL]', SHEET_URL);
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    console.log('First sheet is empty.');
    return;
  }

  const normalizeForMatch_ = (s) =>
    String(s || '').trim().replace(/\s+/g, '').toLowerCase();

  // Load crew webhook map
  const crewWebhookMap = loadCrewWebhookMap_(CREW_WEBHOOKS_SPREADSHEET_ID, CREW_WEBHOOKS_SHEET_GID, normalizeForMatch_);

  // Load crew mappings
  const crewMapping = findBestCrewMappingForSpreadsheetName_(
    SHEET_NAME,
    CREW_MAPPINGS_SPREADSHEET_ID,
    CREW_MAPPINGS_SHEET_NAME,
    normalizeForMatch_
  );

  const crewName = crewMapping?.crew || '(Unknown Crew)';
  const crewNorm = crewMapping?.crewNorm || '';

  const GENERAL_WEBHOOK_URL = crewWebhookMap.get(normalizeForMatch_('GENERAL'));
  const BAND_WEBHOOK_URL = crewWebhookMap.get(normalizeForMatch_('BAND'));

  if (!GENERAL_WEBHOOK_URL) throw new Error(`Missing webhook for "GENERAL" in Crew->Webhook sheet.`);
  if (!BAND_WEBHOOK_URL) throw new Error(`Missing webhook for "BAND" in Crew->Webhook sheet.`);

  const CHANNEL_WEBHOOK_URL =
    (crewNorm && crewWebhookMap.get(crewNorm)) ? crewWebhookMap.get(crewNorm) : DEFAULT_CHANNEL_WEBHOOK_URL;

  const ROLE_TAG =
    (crewMapping?.role && String(crewMapping.role).trim()) ? String(crewMapping.role).trim() : DEFAULT_CHANNEL_ROLE_TAG;

  const turtleTagsForGeneral = turtleTagsFromCrewMapping_(crewMapping, TURTLE_TAGS);

  if (DEBUG) {
    console.log('[CrewMapping] matched:', crewMapping);
    console.log('[Routing] crewName:', crewName);
    console.log('[Routing] CHANNEL_WEBHOOK_URL (crew):', CHANNEL_WEBHOOK_URL);
    console.log('[Routing] ROLE_TAG:', ROLE_TAG);
  }

  if (!CHANNEL_WEBHOOK_URL) {
    console.log(`[Routing] No crew webhook found for "${crewName}" in Crew->Webhook sheet.`);
  }

  // Build muscle ID map and task embeds
  const muscleIdToDiscordTag = buildMuscleIdToDiscordTagMap_(
    MUSCLE_ROSTER_SPREADSHEET_ID,
    MUSCLE_ROSTER_SHEET_INDEX,
    MUSCLE_ROSTER_HEADER_ROW
  );

  const { embeds, sheetLinkMd } = buildTaskEmbeds_(sheet, lastRow, muscleIdToDiscordTag, SHEET_NAME, SHEET_URL);

  if (embeds.length === 0) return;

  const xUrl = getLastXUrl_();
  const xLine = xUrl ? `\n\nX: ${xUrl}` : '';

  const DISCORD_GUILD_EVENT_BASE = 'https://discord.com/events/812097286003359764/';

  const turtlePing = turtleTagsForGeneral.length
    ? ` ${turtleTagsForGeneral.join(' ')}`
    : '';

  const eventId = String(crewMapping?.event || '').trim();
  const eventLink = eventId
    ? `[RSVP to the next call](${DISCORD_GUILD_EVENT_BASE}${eventId})`
    : '';

  // Post to GENERAL (conditionally)
  if (doGeneral) {
    postWebhook_(GENERAL_WEBHOOK_URL, {
      content:
        `${sheetLinkMd} starts now! ` +
        `${GENERAL_ROLE_TAG}${turtlePing} ` +
        `you might be interested in this one. ` +
        `Find the crew in <#${VOICE_CHANNEL_ID}>.` +
        (eventLink ? `\n\n${eventLink}` : '') +
        xLine
    });
    Utilities.sleep(250);
  }

  // Post !band (conditionally)
  if (doBand) {
    postWebhook_(BAND_WEBHOOK_URL, { content: `!band` });
    Utilities.sleep(250);
  }

  // Post embeds to crew channel (conditionally)
  if (doCrew) {
    if (!CHANNEL_WEBHOOK_URL) throw new Error(`Missing webhook for crew "${crewName}" in Crew->Webhook sheet.`);

    const EMBEDS_PER_MESSAGE = 10;
    for (let i = 0; i < embeds.length; i += EMBEDS_PER_MESSAGE) {
      postWebhook_(CHANNEL_WEBHOOK_URL, {
        content: i === 0
          ? `${ROLE_TAG} Crew starts now! High-priority task check-in for ${sheetLinkMd}:${xLine}`
          : '',
        embeds: embeds.slice(i, i + EMBEDS_PER_MESSAGE)
      });
      Utilities.sleep(250);
    }
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function postWebhook_(url, payloadObj) {
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payloadObj),
    muteHttpExceptions: true
  });
  console.log('Discord response:', res.getResponseCode(), res.getContentText());
  return res;
}

function loadCrewWebhookMap_(spreadsheetId, sheetGid, normalizeForMatch_) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'crewWebhooks_v2';
  const cached = cache.get(cacheKey);
  if (cached) {
    return new Map(Object.entries(JSON.parse(cached)));
  }

  const whSs = SpreadsheetApp.openById(spreadsheetId);
  const whSheet =
    whSs.getSheets().find(s => String(s.getSheetId()) === String(sheetGid)) ||
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

function findBestCrewMappingForSpreadsheetName_(spreadsheetName, mappingsSpreadsheetId, mappingsSheetName, normalizeForMatch_) {
  const mappings = loadCrewMappings_(mappingsSpreadsheetId, mappingsSheetName, normalizeForMatch_);
  const nameNorm = normalizeForMatch_(spreadsheetName);

  let best = null;
  for (const m of mappings) {
    if (m.sheetKeyNorm && nameNorm.includes(m.sheetKeyNorm)) {
      if (!best || m.sheetKeyNorm.length > (best.sheetKeyNorm || '').length) best = m;
      continue;
    }
    if (m.crewNorm && nameNorm.includes(m.crewNorm)) {
      if (!best || m.crewNorm.length > (best.crewNorm || '').length) best = m;
    }
  }

  return best;
}

function loadCrewMappings_(spreadsheetId, sheetName, normalizeForMatch_) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'crewMappings_v2';
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const mapSs = SpreadsheetApp.openById(spreadsheetId);
  const mapSheet = mapSs.getSheetByName(sheetName) || mapSs.getSheets()[0];

  const lr = mapSheet.getLastRow();
  const lc = mapSheet.getLastColumn();
  if (lr < 2) return [];

  const values = mapSheet.getRange(1, 1, lr, lc).getValues();
  const headerNorm = values[0].map(h => normalizeForMatch_(h));
  const idx = (name) => headerNorm.indexOf(normalizeForMatch_(name));

  const iCrew = idx('Crew');
  const iTurtles = idx('Turtles');
  const iRole = idx('Role');
  const iEvent = idx('Event');
  const iSheet = idx('Sheet');

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
      event: String(row[iEvent] ?? '').trim(),
      sheetKey: String(row[iSheet] ?? '').trim(),
      sheetKeyNorm: normalizeForMatch_(String(row[iSheet] ?? '').trim())
    });
  }

  cache.put(cacheKey, JSON.stringify(out), 600);
  return out;
}

function turtleTagsFromCrewMapping_(m, TURTLE_TAGS) {
  if (!m?.turtles) return [];

  const parseTurtleToken_ = (token) => {
    const t = String(token || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!t) return null;
    if (t === 'RAPH' || t === 'RAPHAEL') return 'RAPHAEL';
    if (t === 'LEO' || t === 'LEONARDO') return 'LEONARDO';
    if (t === 'MIKE' || t === 'MICHELANGELO') return 'MICHELANGELO';
    if (t === 'DON' || t === 'DONATELLO') return 'DONATELLO';
    if (TURTLE_TAGS[t]) return t;
    return null;
  };

  const turtleKeys = String(m.turtles).split(',').map(parseTurtleToken_).filter(Boolean);

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

function buildMuscleIdToDiscordTagMap_(spreadsheetId, sheetIndex, headerRow) {
  const rosterSs = SpreadsheetApp.openById(spreadsheetId);
  const rosterSheet = rosterSs.getSheets()[sheetIndex];
  if (!rosterSheet) throw new Error('Muscle roster sheet not found');

  const lr = rosterSheet.getLastRow();
  const lc = rosterSheet.getLastColumn();

  if (lr <= headerRow) return new Map();

  const rawHeaders = rosterSheet.getRange(headerRow, 1, 1, lc).getValues()[0];
  const headersNorm = rawHeaders.map(h => String(h || '').trim().toLowerCase().replace(/\s+/g, ''));

  const idIdx = headersNorm.indexOf('muscleid') !== -1 ? headersNorm.indexOf('muscleid') :
    headersNorm.indexOf('id') !== -1 ? headersNorm.indexOf('id') : 0;

  const discordIdx = headersNorm.indexOf('discord') !== -1 ? headersNorm.indexOf('discord') :
    headersNorm.indexOf('discordtag') !== -1 ? headersNorm.indexOf('discordtag') :
      headersNorm.indexOf('discordid') !== -1 ? headersNorm.indexOf('discordid') : 18;

  const numRows = lr - headerRow;
  const values = rosterSheet.getRange(headerRow + 1, 1, numRows, Math.max(lc, 19)).getValues();

  const map = new Map();
  for (let r = 0; r < values.length; r++) {
    const idKey = String(values[r][idIdx] ?? '').trim().replace(/\s+/g, '');
    const tagVal = String(values[r][discordIdx] || '').trim();
    if (!idKey || !tagVal) continue;
    map.set(idKey, tagVal);
  }

  return map;
}

function buildTaskEmbeds_(sheet, lastRow, muscleIdToDiscordTag, SHEET_NAME, SHEET_URL) {
  const colA = sheet.getRange(1, 1, lastRow, 1).getValues();
  let tasksHeaderRowNumber = null;
  for (let i = 0; i < colA.length; i++) {
    if (String(colA[i][0]).trim().toLowerCase() === 'tasks') {
      tasksHeaderRowNumber = i + 1;
      break;
    }
  }

  const sheetLinkMd = `[${SHEET_NAME}](${SHEET_URL})`;

  if (!tasksHeaderRowNumber) {
    return { embeds: [], sheetLinkMd };
  }

  const headerRowNumber = tasksHeaderRowNumber + 1;
  const firstDataRowNumber = headerRowNumber + 1;

  if (firstDataRowNumber > lastRow) return { embeds: [], sheetLinkMd };

  const numTaskRows = lastRow - firstDataRowNumber + 1;
  const taskTable = sheet.getRange(firstDataRowNumber, 1, numTaskRows, 6).getValues();
  const taskRichTexts = sheet.getRange(firstDataRowNumber, 2, numTaskRows, 1).getRichTextValues();

  const clean = (v) => {
    if (v === null || v === undefined) return '—';
    let s = String(v).replace(/\r?\n|\r/g, ' ').trim();
    if (!s || s.toUpperCase() === '#N/A') return '—';
    return s.replace(/[`]/g, "'");
  };

  const trunc = (v, max) => {
    const s = clean(v);
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  };

  const normPriority = (p) => clean(p).toLowerCase();
  const isTop = (p) => normPriority(p) === '0. top';
  const isHigh = (p) => normPriority(p) === '1. high';

  const topLines = [];
  const highLines = [];

  for (let i = 0; i < taskTable.length; i++) {
    const row = taskTable[i];
    const priority = row[0];
    if (!priority) continue;

    const stage = row[1];
    const taskName = row[2];
    const muscleId = row[4];
    const muscleNm = row[5];

    const stageNorm = clean(stage).toLowerCase();
    const excludedStages = ['complete', 'skipped', 'done', 'skip', 'stuck', 'later'];
    if (excludedStages.includes(stageNorm)) continue;
    if (!isTop(priority) && !isHigh(priority)) continue;

    const rt = taskRichTexts[i]?.[0];
    let url = null;
    if (rt) {
      url = rt.getLinkUrl && rt.getLinkUrl();
      if (!url) {
        const runs = rt.getRuns ? (rt.getRuns() || []) : [];
        for (const run of runs) {
          const u = run.getLinkUrl && run.getLinkUrl();
          if (u) { url = u; break; }
        }
      }
    }

    const taskText = trunc(taskName || '(No task name)', 42);
    const taskLabel = url ? `[**${taskText}**](${url})` : `**${taskText}**`;

    const rawId = String(muscleId ?? '').trim().replace(/\s+/g, '');
    let ownerLabel = clean(muscleNm || 'Unassigned');
    if (rawId) {
      const tag = muscleIdToDiscordTag.get(rawId);
      if (tag) {
        ownerLabel = /^\d+$/.test(tag.trim()) ? `<@${tag.trim()}>` : tag.trim();
      }
    }

    const line = `• ${taskLabel} — ${trunc(stage, 16)} — ${trunc(ownerLabel, 24)}`;

    if (isTop(priority)) topLines.push(line);
    else highLines.push(line);
  }

  if (topLines.length === 0 && highLines.length === 0) return { embeds: [], sheetLinkMd };

  const chunkLines = (lines, maxChars = 950) => {
    const chunks = [];
    let buf = '';
    for (const l of lines) {
      const next = (buf ? buf + '\n' : '') + l;
      if (next.length > maxChars) {
        if (buf) chunks.push(buf);
        buf = l;
      } else {
        buf = next;
      }
    }
    if (buf) chunks.push(buf);
    return chunks.length ? chunks : ['—'];
  };

  const topChunks = chunkLines(topLines);
  const highChunks = chunkLines(highLines);
  const pages = Math.max(topChunks.length, highChunks.length);

  const embeds = [];
  for (let p = 0; p < pages; p++) {
    embeds.push({
      title: `Top & High Priority Tasks`,
      description: (p === 0 ? `` : `\n\n_Continued (page ${p + 1}/${pages})_`),
      fields: [
        { name: '<a:frankpepe_spin:1076175161549652128> Top', value: topChunks[p] || '—', inline: true },
        { name: '<a:frankpepe_munch:1076175341955076116> High', value: highChunks[p] || '—', inline: true }
      ]
    });
  }

  return { embeds, sheetLinkMd };
}
