/**
 * DISCORD WEBHOOK SERVICE
 *
 * Handles posting messages to Discord channels via webhooks.
 */

/**
 * Posts to Discord webhooks (GENERAL, BAND, and crew channel).
 *
 * @param {Spreadsheet} spreadsheet - The crew spreadsheet
 * @param {Object} options - Options for which posts to make:
 *   - postGeneral: boolean (default true) - Post to general channel
 *   - postBand: boolean (default true) - Post !band command
 *   - postCrew: boolean (default true) - Post embeds to crew channel
 */
function postCrewToDiscord_(spreadsheet, options) {
  const opts = options || {};
  const doGeneral = opts.postGeneral !== false;
  const doBand = opts.postBand !== false;
  const doCrew = opts.postCrew !== false;

  const DEFAULT_CHANNEL_WEBHOOK_URL = getSecretOptional_('DEFAULT_CHANNEL_WEBHOOK_URL', '');

  const ss = spreadsheet;
  const firstSheet = ss.getSheets()[0];
  const sheet = firstSheet;

  const SHEET_NAME = ss.getName();
  const SHEET_URL = ss.getUrl();

  const lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    Logger.log('First sheet is empty.');
    return;
  }

  // Load crew webhook map
  const crewWebhookMap = loadCrewWebhookMap_();

  // Load crew mappings
  const crewMapping = findBestCrewMappingForSpreadsheetName_(SHEET_NAME);

  const crewName = crewMapping?.crew || '(Unknown Crew)';
  const crewNorm = crewMapping?.crewNorm || '';

  const GENERAL_WEBHOOK_URL = crewWebhookMap.get(normalizeForMatch_('GENERAL'));
  const BAND_WEBHOOK_URL = crewWebhookMap.get(normalizeForMatch_('BAND'));

  if (!GENERAL_WEBHOOK_URL) {
    throw new Error('Missing webhook for "GENERAL" in Crew->Webhook sheet.');
  }
  if (!BAND_WEBHOOK_URL) {
    throw new Error('Missing webhook for "BAND" in Crew->Webhook sheet.');
  }

  const CHANNEL_WEBHOOK_URL =
    (crewNorm && crewWebhookMap.get(crewNorm)) ? crewWebhookMap.get(crewNorm) : DEFAULT_CHANNEL_WEBHOOK_URL;

  const ROLE_TAG =
    (crewMapping?.role && String(crewMapping.role).trim()) ? String(crewMapping.role).trim() : DEFAULT_CHANNEL_ROLE_TAG;

  const turtleTagsForGeneral = turtleTagsFromCrewMapping_(crewMapping);

  Logger.log('[Routing] crewName: ' + crewName);
  Logger.log('[Routing] CHANNEL_WEBHOOK_URL: ' + CHANNEL_WEBHOOK_URL);
  Logger.log('[Routing] ROLE_TAG: ' + ROLE_TAG);

  if (!CHANNEL_WEBHOOK_URL) {
    Logger.log('No crew webhook found for "' + crewName + '" in Crew->Webhook sheet.');
  }

  // Build muscle ID maps and task embeds
  const { discordMap, nameMap } = buildMuscleIdMaps_();
  const { embeds, sheetLinkMd } = buildTaskEmbeds_(sheet, lastRow, discordMap, nameMap, SHEET_NAME, SHEET_URL);

  if (embeds.length === 0) {
    Logger.log('No tasks to post.');
    return;
  }

  const xUrl = getLastXUrl_();
  const xLine = xUrl ? '\n\nX: ' + xUrl : '';

  const DISCORD_GUILD_EVENT_BASE = 'https://discord.com/events/' + DISCORD_GUILD_ID + '/';

  const turtlePing = turtleTagsForGeneral.length
    ? ' ' + turtleTagsForGeneral.join(' ')
    : '';

  const eventId = String(crewMapping?.event || '').trim();
  const eventLink = eventId
    ? '[RSVP to the next call](' + DISCORD_GUILD_EVENT_BASE + eventId + ')'
    : '';

  // Post to GENERAL (conditionally)
  if (doGeneral) {
    postWebhook_(GENERAL_WEBHOOK_URL, {
      content:
        sheetLinkMd + ' starts now! ' +
        GENERAL_ROLE_TAG + turtlePing + ' ' +
        'you might be interested in this one. ' +
        'Find the crew in <#' + VOICE_CHANNEL_ID + '>.' +
        (eventLink ? '\n\n' + eventLink : '') +
        xLine
    });
    Utilities.sleep(250);
  }

  // Post !band (conditionally)
  if (doBand) {
    postWebhook_(BAND_WEBHOOK_URL, { content: '!band' });
    Utilities.sleep(250);
  }

  // Post embeds to crew channel (conditionally)
  if (doCrew) {
    if (!CHANNEL_WEBHOOK_URL) {
      throw new Error('Missing webhook for crew "' + crewName + '" in Crew->Webhook sheet.');
    }

    const EMBEDS_PER_MESSAGE = 10;
    for (let i = 0; i < embeds.length; i += EMBEDS_PER_MESSAGE) {
      postWebhook_(CHANNEL_WEBHOOK_URL, {
        content: i === 0
          ? ROLE_TAG + ' Crew starts now! High-priority task check-in for ' + sheetLinkMd + ':' + xLine
          : '',
        embeds: embeds.slice(i, i + EMBEDS_PER_MESSAGE)
      });
      Utilities.sleep(250);
    }
  }
}

/**
 * Posts a payload to a Discord webhook URL.
 */
function postWebhook_(url, payloadObj) {
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payloadObj),
    muteHttpExceptions: true
  });
  Logger.log('Discord response: ' + res.getResponseCode() + ' ' + res.getContentText());
  return res;
}

/**
 * Builds task embeds for Discord from the spreadsheet.
 */
function buildTaskEmbeds_(sheet, lastRow, muscleIdToDiscordTag, muscleIdToName, SHEET_NAME, SHEET_URL) {
  const colA = sheet.getRange(1, 1, lastRow, 1).getValues();
  let tasksHeaderRowNumber = null;

  for (let i = 0; i < colA.length; i++) {
    if (String(colA[i][0]).trim().toLowerCase() === 'tasks') {
      tasksHeaderRowNumber = i + 1;
      break;
    }
  }

  const sheetLinkMd = '[' + SHEET_NAME + '](' + SHEET_URL + ')';

  if (!tasksHeaderRowNumber) {
    return { embeds: [], sheetLinkMd };
  }

  const headerRowNumber = tasksHeaderRowNumber + 1;
  const firstDataRowNumber = headerRowNumber + 1;

  if (firstDataRowNumber > lastRow) {
    return { embeds: [], sheetLinkMd };
  }

  const numTaskRows = lastRow - firstDataRowNumber + 1;
  const taskTable = sheet.getRange(firstDataRowNumber, 1, numTaskRows, 6).getValues();
  // Column 3 = C = Task Name (where hyperlinks are)
  const taskRichTexts = sheet.getRange(firstDataRowNumber, 3, numTaskRows, 1).getRichTextValues();

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
          if (u) {
            url = u;
            break;
          }
        }
      }
    }

    const taskText = trunc(taskName || '(No task name)', 42);
    const taskLabel = url ? '[**' + taskText + '**](' + url + ')' : '**' + taskText + '**';

    const rawId = String(muscleId ?? '').trim().replace(/\s+/g, '');
    let ownerLabel = 'Unassigned';
    if (rawId) {
      const discordTag = muscleIdToDiscordTag.get(rawId);
      if (discordTag) {
        ownerLabel = /^\d+$/.test(discordTag.trim()) ? '<@' + discordTag.trim() + '>' : discordTag.trim();
      } else {
        const name = muscleIdToName.get(rawId);
        if (name) {
          ownerLabel = name;
        }
      }
    }

    const line = '• ' + taskLabel + ' — ' + trunc(stage, 16) + ' — ' + trunc(ownerLabel, 24);

    if (isTop(priority)) {
      topLines.push(line);
    } else {
      highLines.push(line);
    }
  }

  if (topLines.length === 0 && highLines.length === 0) {
    return { embeds: [], sheetLinkMd };
  }

  const chunkLines = (lines, maxChars) => {
    maxChars = maxChars || 950;
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
      title: 'Top & High Priority Tasks',
      description: (p === 0 ? '' : '\n\n_Continued (page ' + (p + 1) + '/' + pages + ')_'),
      fields: [
        { name: '<a:frankpepe_spin:1076175161549652128> Top', value: topChunks[p] || '—', inline: true },
        { name: '<a:frankpepe_munch:1076175341955076116> High', value: highChunks[p] || '—', inline: true }
      ]
    });
  }

  return { embeds, sheetLinkMd };
}
