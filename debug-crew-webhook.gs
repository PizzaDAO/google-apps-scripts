/**
 * DEBUG FUNCTION
 * Run this manually from the Ops Crew spreadsheet's Apps Script editor
 * to see what crew mapping and webhook are being resolved.
 *
 * This will help diagnose why the Ops channel webhook wasn't found.
 */
function debugCrewWebhookLookup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const SHEET_NAME = ss.getName();

  console.log('=== DEBUGGING CREW WEBHOOK LOOKUP ===');
  console.log('Spreadsheet Name:', SHEET_NAME);
  console.log('Spreadsheet ID:', ss.getId());

  const normalizeForMatch_ = (s) =>
    String(s || '').trim().replace(/\s+/g, '').toLowerCase();

  const nameNorm = normalizeForMatch_(SHEET_NAME);
  console.log('Normalized spreadsheet name:', nameNorm);

  // === Load Crew Mappings ===
  const CREW_MAPPINGS_SPREADSHEET_ID = '19itGq86BRQTVehKhtRFKwK8gZqjsUQ_bG5cuVmem9HU';
  const CREW_MAPPINGS_SHEET_NAME = 'Crew Mappings';

  // Clear cache first to get fresh data
  CacheService.getScriptCache().remove('crewMappings_v2');
  CacheService.getScriptCache().remove('crewWebhooks_v2');
  console.log('✅ Cleared caches');

  const mapSs = SpreadsheetApp.openById(CREW_MAPPINGS_SPREADSHEET_ID);
  const mapSheet = mapSs.getSheetByName(CREW_MAPPINGS_SHEET_NAME) || mapSs.getSheets()[0];

  const lr = mapSheet.getLastRow();
  const lc = mapSheet.getLastColumn();
  const values = mapSheet.getRange(1, 1, lr, lc).getValues();
  const headers = values[0].map(h => String(h || '').trim());
  const headerNorm = headers.map(h => normalizeForMatch_(h));

  const idx = (name) => headerNorm.indexOf(normalizeForMatch_(name));
  const iCrew = idx('Crew');
  const iSheet = idx('Sheet');

  console.log('\n--- ALL CREW MAPPINGS ---');
  for (let r = 1; r < values.length; r++) {
    const crew = String(values[r][iCrew] ?? '').trim();
    const sheetKey = String(values[r][iSheet] ?? '').trim();
    if (crew) {
      const crewNorm = normalizeForMatch_(crew);
      const sheetKeyNorm = normalizeForMatch_(sheetKey);
      console.log(`  Crew: "${crew}" (norm: "${crewNorm}")`);
      console.log(`    Sheet: "${sheetKey}" (norm: "${sheetKeyNorm}")`);
      console.log(`    Match by sheet? ${sheetKeyNorm && nameNorm.includes(sheetKeyNorm)}`);
      console.log(`    Match by crew? ${crewNorm && nameNorm.includes(crewNorm)}`);
    }
  }

  // Find best match
  let best = null;
  for (let r = 1; r < values.length; r++) {
    const crew = String(values[r][iCrew] ?? '').trim();
    const sheetKey = String(values[r][iSheet] ?? '').trim();
    if (!crew) continue;

    const crewNorm = normalizeForMatch_(crew);
    const sheetKeyNorm = normalizeForMatch_(sheetKey);

    if (sheetKeyNorm && nameNorm.includes(sheetKeyNorm)) {
      if (!best || sheetKeyNorm.length > (best.sheetKeyNorm || '').length) {
        best = { crew, crewNorm, sheetKey, sheetKeyNorm };
      }
      continue;
    }
    if (crewNorm && nameNorm.includes(crewNorm)) {
      if (!best || crewNorm.length > (best.crewNorm || '').length) {
        best = { crew, crewNorm, sheetKey, sheetKeyNorm };
      }
    }
  }

  console.log('\n--- BEST MATCH ---');
  if (best) {
    console.log('✅ Matched Crew:', best.crew);
    console.log('   Normalized:', best.crewNorm);
  } else {
    console.log('❌ NO MATCH FOUND!');
    return;
  }

  // === Load Webhooks ===
  const CREW_WEBHOOKS_SPREADSHEET_ID = '1bSLN2mL1K-qr3nLiURVjhm31Zxn0J3ta1Pq0txlXsPI';
  const CREW_WEBHOOKS_SHEET_GID = 0;

  const whSs = SpreadsheetApp.openById(CREW_WEBHOOKS_SPREADSHEET_ID);
  const whSheet = whSs.getSheets().find(s => String(s.getSheetId()) === String(CREW_WEBHOOKS_SHEET_GID)) || whSs.getSheets()[0];

  const wlr = whSheet.getLastRow();
  const wlc = whSheet.getLastColumn();
  const wvalues = whSheet.getRange(1, 1, wlr, wlc).getValues();
  const wheaders = wvalues[0].map(h => String(h || '').trim());
  const wheaderNorm = wheaders.map(h => normalizeForMatch_(h));

  const iCrew2 = wheaderNorm.indexOf('crew');
  const iWebhook = wheaderNorm.indexOf('webhook');

  console.log('\n--- ALL WEBHOOKS ---');
  const webhookMap = new Map();
  for (let r = 1; r < wvalues.length; r++) {
    const crew = String(wvalues[r][iCrew2] ?? '').trim();
    const webhook = String(wvalues[r][iWebhook] ?? '').trim();
    if (!crew || !webhook) continue;

    const crewNorm = normalizeForMatch_(crew);
    webhookMap.set(crewNorm, webhook);
    console.log(`  "${crew}" (norm: "${crewNorm}") → ${webhook.substring(0, 50)}...`);
  }

  console.log('\n--- WEBHOOK LOOKUP FOR MATCHED CREW ---');
  console.log('Looking for webhook with key:', best.crewNorm);
  const foundWebhook = webhookMap.get(best.crewNorm);

  if (foundWebhook) {
    console.log('✅ WEBHOOK FOUND:', foundWebhook);
  } else {
    console.log('❌ NO WEBHOOK FOUND!');
    console.log('Available webhook keys:', Array.from(webhookMap.keys()));
  }

  console.log('\n=== END DEBUG ===');
}
