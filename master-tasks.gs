/***************
 * CONFIG
 ***************/
const CONFIG = {
  masterSpreadsheetId: '1hSzGYowH0qFmODYJF08vrcvfdcCycs7ztSALjTSDpYs',
  masterSheetName: 'Master Tasks',

  crewMappingsTabName: 'Crew Mappings',
  crewNameHeader: 'Crew',
  crewSheetUrlHeader: 'Sheet',

  tasksAnchorText: 'Tasks',       // cell directly above header
  taskTitleHeader: 'Task',        // used to detect table rows & empty rows
  idColumnName: 'TaskID',

  // added to every tasks table (and synced)
  metaColumns: ['UpdatedAt', 'UpdatedBy'],

  // don’t generate IDs for blank template rows
  skipIfTaskBlank: true,
};

/***************
 * MENU (Master sheet only)
 ***************/
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Task Sync')
    .addItem('Validate setup', 'validate_setup')
    .addItem('Bootstrap: add IDs + copy to master', 'bootstrap_add_ids_and_copy_to_master')
    .addSeparator()
    .addItem('Reconcile: push master to crews', 'reconcile_master_to_crews')
    .addToUi();
}

/***************
 * VALIDATE
 ***************/
function validate_setup() {
  const issues = [];
  const crews = loadCrewsFromMappings_();

  try {
    const masterSheet = openSheet_(CONFIG.masterSpreadsheetId, CONFIG.masterSheetName);
    const masterTable = getTasksTable_(masterSheet);
    const missing = requiredHeadersMissing_(masterTable.header);
    if (missing.length) issues.push(`Master "${CONFIG.masterSheetName}" missing headers: ${missing.join(', ')}`);
  } catch (err) {
    issues.push(`Master "${CONFIG.masterSheetName}" error: ${err.message}`);
  }

  for (const crew of crews) {
    const tabName = `${crew.crewName} Crew`;
    try {
      const crewSheet = openSheet_(crew.spreadsheetId, tabName);
      const table = getTasksTable_(crewSheet);
      const missing = requiredHeadersMissing_(table.header);
      if (missing.length) issues.push(`${tabName} missing headers: ${missing.join(', ')}`);
    } catch (err) {
      issues.push(`${tabName} error: ${err.message}`);
    }
  }

  if (!issues.length) {
    SpreadsheetApp.getUi().alert('✅ Setup looks good.');
  } else {
    SpreadsheetApp.getUi().alert('⚠️ Setup issues:\n\n' + issues.join('\n'));
  }
}

function requiredHeadersMissing_(headers) {
  const need = [
    'Priority','Stage','Task','Due','Lead','Lead ID','Crews','Goal','Tags','Notes',CONFIG.idColumnName,
    ...CONFIG.metaColumns
  ];
  const have = new Set(headers.map(h => String(h || '').trim()));
  return need.filter(h => !have.has(h));
}

/***************
 * CREW LOADER (from Crew Mappings)
 ***************/
function loadCrewsFromMappings_() {
  const ss = SpreadsheetApp.openById(CONFIG.masterSpreadsheetId);
  const sh = ss.getSheetByName(CONFIG.crewMappingsTabName);
  if (!sh) throw new Error(`Missing tab: ${CONFIG.crewMappingsTabName}`);

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => String(h || '').trim());
  const crewCol = headers.indexOf(CONFIG.crewNameHeader);
  const urlCol  = headers.indexOf(CONFIG.crewSheetUrlHeader);

  if (crewCol === -1) throw new Error(`Crew Mappings missing header: ${CONFIG.crewNameHeader}`);
  if (urlCol  === -1) throw new Error(`Crew Mappings missing header: ${CONFIG.crewSheetUrlHeader}`);

  const crews = [];
  for (let i = 1; i < values.length; i++) {
    const crewName = String(values[i][crewCol] || '').trim();
    const sheetUrl = String(values[i][urlCol]  || '').trim();
    if (!crewName || !sheetUrl) continue;

    const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) throw new Error(`Could not parse spreadsheetId for crew "${crewName}" from: ${sheetUrl}`);

    crews.push({ crewName, spreadsheetId: match[1] });
  }
  return crews;
}

/***************
 * PATCH: auto-ensure crew membership in comma list
 ***************/
function normalizeCrewName_(name) {
  return String(name || '').trim();
}

function ensureCrewListedInCrewsCell_(rowValues, headerMap, crewName) {
  const crewsIdx = headerMap['Crews'];
  if (crewsIdx == null) throw new Error(`Missing required column: "Crews"`);

  const crew = normalizeCrewName_(crewName);
  if (!crew) return false;

  const existing = String(rowValues[crewsIdx] || '').trim();
  const parts = existing
    ? existing.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const lower = new Set(parts.map(p => p.toLowerCase()));
  if (lower.has(crew.toLowerCase())) return false;

  parts.push(crew);
  rowValues[crewsIdx] = parts.join(', ');
  return true;
}

/***************
 * BOOTSTRAP
 ***************/
function bootstrap_add_ids_and_copy_to_master() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const crews = loadCrewsFromMappings_();

    const masterSheet = openSheet_(CONFIG.masterSpreadsheetId, CONFIG.masterSheetName);
    const masterTable = getTasksTable_(masterSheet);
    ensureTableHasColumns_(masterTable, [CONFIG.idColumnName, ...CONFIG.metaColumns]);

    let masterIndex = buildIndexById_(masterTable);

    for (const crew of crews) {
      const crewSheet = openSheet_(crew.spreadsheetId, `${crew.crewName} Crew`);
      const crewTable = getTasksTable_(crewSheet);
      ensureTableHasColumns_(crewTable, [CONFIG.idColumnName, ...CONFIG.metaColumns]);

      const { startRow, startCol, numCols, numRows, headerMap, header } = crewTable;
      if (numRows < 1) continue;

      const idIdx = headerMap[CONFIG.idColumnName];
      const updatedAtIdx = headerMap.UpdatedAt;
      const updatedByIdx = headerMap.UpdatedBy;
      const taskIdx = headerMap[CONFIG.taskTitleHeader];

      const range = crewSheet.getRange(startRow + 1, startCol, numRows, numCols);
      const data = range.getValues();
      const formulas = range.getFormulas();
      const rich = range.getRichTextValues();

      let changed = false;
      const nowIso = new Date().toISOString();
      const by = Session.getActiveUser().getEmail() || '';

      for (let i = 0; i < data.length; i++) {
        const row = data[i];

        if (CONFIG.skipIfTaskBlank && taskIdx != null) {
          const t = row[taskIdx];
          if (t === '' || t == null) continue;
        }

        if (!row[idIdx]) { row[idIdx] = Utilities.getUuid(); changed = true; }

        if (ensureCrewListedInCrewsCell_(row, headerMap, crew.crewName)) {
          changed = true;
        }

        if (!row[updatedAtIdx]) { row[updatedAtIdx] = nowIso; changed = true; }
        if (!row[updatedByIdx]) { row[updatedByIdx] = by; changed = true; }

        upsertIntoMaster_(masterTable, masterIndex, header, row, formulas[i], rich[i]);
      }

      if (changed) range.setValues(data);

      // ✅ NEW: keep crew sheet sorted by Priority after bootstrap changes
      withSyncFlag_(PropertiesService.getDocumentProperties(), () => {
        sortTasksTableByPriority_(crewTable);
      });

      masterIndex = buildIndexById_(masterTable);
    }

    stampMissingMetaInTable_(masterTable);
    reconcile_master_to_crews();

    // ✅ NEW: keep master sorted after bootstrap+reconcile
    const masterTableFinal = getTasksTable_(openSheet_(CONFIG.masterSpreadsheetId, CONFIG.masterSheetName));
    withSyncFlag_(PropertiesService.getDocumentProperties(), () => {
      sortTasksTableByPriority_(masterTableFinal);
    });

  } finally {
    lock.releaseLock();
  }
}

/***************
 * CREW -> MASTER -> CREWS
 * Install this as an INSTALLABLE onEdit trigger in each crew spreadsheet.
 ***************/
function crewSync_onEdit(e) {
  if (!e || !e.range) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;

  try {
    const props = PropertiesService.getDocumentProperties();
    if (props.getProperty('SYNC_IN_PROGRESS') === '1') return;

    const crews = loadCrewsFromMappings_();

    const ss = e.source;
    const sheet = e.range.getSheet();

    const crewEntry = crews.find(c => c.spreadsheetId === ss.getId() && `${c.crewName} Crew` === sheet.getName());
    if (!crewEntry) return;

    const table = getTasksTable_(sheet);
    ensureTableHasColumns_(table, [CONFIG.idColumnName, ...CONFIG.metaColumns]);

    const row = e.range.getRow();
    const col = e.range.getColumn();

    const dataTop = table.startRow + 1;
    const dataBottom = dataTop + table.numRows - 1;
    const dataLeft = table.startCol;
    const dataRight = dataLeft + table.numCols - 1;

    if (row < dataTop || row > dataBottom || col < dataLeft || col > dataRight) return;

    const rowRange = sheet.getRange(row, table.startCol, 1, table.numCols);
    const rowValues = rowRange.getValues()[0];
    const rowFormulas = rowRange.getFormulas()[0];
    const rowRich = rowRange.getRichTextValues()[0];

    const idIdx = table.headerMap[CONFIG.idColumnName];
    const updatedAtIdx = table.headerMap.UpdatedAt;
    const updatedByIdx = table.headerMap.UpdatedBy;
    const taskIdx = table.headerMap[CONFIG.taskTitleHeader];

    if (CONFIG.skipIfTaskBlank && taskIdx != null) {
      const t = rowValues[taskIdx];
      if (t === '' || t == null) return;
    }

    if (!rowValues[idIdx]) {
      const id = Utilities.getUuid();
      withSyncFlag_(props, () => sheet.getRange(row, table.startCol + idIdx).setValue(id));
      rowValues[idIdx] = id;
    }

    // ✅ Crew membership behavior:
    // - Default: if row is in this crew sheet, ensure Crews includes this crew.
    // - Exception: if user is editing the Crews cell and removed this crew, honor that removal.
    const crewsIdx = table.headerMap['Crews'];
    if (crewsIdx == null) throw new Error(`Missing required column: "Crews"`);

    const editedIsSingleCell = e.range.getNumRows() === 1 && e.range.getNumColumns() === 1;
    const editedColAbs = e.range.getColumn(); // absolute column
    const crewsColAbs = table.startCol + crewsIdx;

    const crewsSet = parseCrews_(rowValues[crewsIdx]);
    const thisCrewKey = String(crewEntry.crewName).trim().toLowerCase();
    const currentlyHasThisCrew = crewsSet.has(thisCrewKey);

    const userEditedCrewsCell = editedIsSingleCell && editedColAbs === crewsColAbs;

    if (!currentlyHasThisCrew && userEditedCrewsCell) {
      // User explicitly removed this crew from Crews => do NOT re-add.
      // Propagation will remove this row from this crew sheet.
    } else {
      const crewsChanged = ensureCrewListedInCrewsCell_(rowValues, table.headerMap, crewEntry.crewName);
      if (crewsChanged) {
        withSyncFlag_(props, () => sheet.getRange(row, crewsColAbs).setValue(rowValues[crewsIdx]));
      }
    }

    const nowIso = new Date().toISOString();
    const by = Session.getActiveUser().getEmail() || '';
    withSyncFlag_(props, () => {
      sheet.getRange(row, table.startCol + updatedAtIdx).setValue(nowIso);
      sheet.getRange(row, table.startCol + updatedByIdx).setValue(by);
    });
    rowValues[updatedAtIdx] = nowIso;
    rowValues[updatedByIdx] = by;

    const masterSheet = openSheet_(CONFIG.masterSpreadsheetId, CONFIG.masterSheetName);
    const masterTable = getTasksTable_(masterSheet);
    ensureTableHasColumns_(masterTable, [CONFIG.idColumnName, ...CONFIG.metaColumns]);
    const masterIndex = buildIndexById_(masterTable);

    // ✅ NEW: sort this crew table after the write we control
    withSyncFlag_(props, () => {
      upsertIntoMaster_(masterTable, masterIndex, table.header, rowValues, rowFormulas, rowRich);
      sortTasksTableByPriority_(table);
    });

    propagateTaskFromMaster_(rowValues[idIdx], crews);

  } finally {
    lock.releaseLock();
  }
}

/***************
 * MASTER -> CREWS (optional trigger if you edit master directly)
 ***************/
function masterSync_onEdit(e) {
  if (!e || !e.range) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;

  try {
    const props = PropertiesService.getDocumentProperties();
    if (props.getProperty('SYNC_IN_PROGRESS') === '1') return;

    const ss = e.source;
    const sheet = e.range.getSheet();
    if (ss.getId() !== CONFIG.masterSpreadsheetId) return;
    if (sheet.getName() !== CONFIG.masterSheetName) return;

    const crews = loadCrewsFromMappings_();

    const table = getTasksTable_(sheet);
    ensureTableHasColumns_(table, [CONFIG.idColumnName, ...CONFIG.metaColumns]);

    const row = e.range.getRow();
    const col = e.range.getColumn();

    const dataTop = table.startRow + 1;
    const dataBottom = dataTop + table.numRows - 1;
    const dataLeft = table.startCol;
    const dataRight = dataLeft + table.numCols - 1;
    if (row < dataTop || row > dataBottom || col < dataLeft || col > dataRight) return;

    const rowRange = sheet.getRange(row, table.startCol, 1, table.numCols);
    const rowValues = rowRange.getValues()[0];
    const rowFormulas = rowRange.getFormulas()[0];
    const rowRich = rowRange.getRichTextValues()[0];

    const idIdx = table.headerMap[CONFIG.idColumnName];
    const updatedAtIdx = table.headerMap.UpdatedAt;
    const updatedByIdx = table.headerMap.UpdatedBy;

    if (!rowValues[idIdx]) {
      const id = Utilities.getUuid();
      withSyncFlag_(props, () => sheet.getRange(row, table.startCol + idIdx).setValue(id));
      rowValues[idIdx] = id;
    }

    const nowIso = new Date().toISOString();
    const by = Session.getActiveUser().getEmail() || '';
    withSyncFlag_(props, () => {
      sheet.getRange(row, table.startCol + updatedAtIdx).setValue(nowIso);
      sheet.getRange(row, table.startCol + updatedByIdx).setValue(by);
    });
    rowValues[updatedAtIdx] = nowIso;
    rowValues[updatedByIdx] = by;

    // Upsert (preserve links) then propagate
    const masterIndex = buildIndexById_(table);

    // ✅ NEW: sort master after controlled write
    withSyncFlag_(props, () => {
      upsertIntoMaster_(table, masterIndex, table.header, rowValues, rowFormulas, rowRich);
      sortTasksTableByPriority_(table);
    });

    propagateTaskFromMaster_(rowValues[idIdx], crews);

  } finally {
    lock.releaseLock();
  }
}

/***************
 * RECONCILE (manual)
 ***************/
function reconcile_master_to_crews() {
  const crews = loadCrewsFromMappings_();

  const masterSheet = openSheet_(CONFIG.masterSpreadsheetId, CONFIG.masterSheetName);
  const masterTable = getTasksTable_(masterSheet);
  ensureTableHasColumns_(masterTable, [CONFIG.idColumnName, ...CONFIG.metaColumns]);

  const idx = buildIndexById_(masterTable);
  for (const id of Object.keys(idx)) {
    propagateTaskFromMaster_(id, crews);
  }

  // ✅ NEW: sort master after reconcile
  withSyncFlag_(PropertiesService.getDocumentProperties(), () => {
    sortTasksTableByPriority_(masterTable);
  });
}

/***************
 * PROPAGATION (Crews membership)
 ***************/
function propagateTaskFromMaster_(taskId, crews) {
  if (!taskId) return;

  const props = PropertiesService.getDocumentProperties();

  const masterSheet = openSheet_(CONFIG.masterSpreadsheetId, CONFIG.masterSheetName);
  const masterTable = getTasksTable_(masterSheet);
  ensureTableHasColumns_(masterTable, [CONFIG.idColumnName, ...CONFIG.metaColumns]);

  const masterIndex = buildIndexById_(masterTable);
  const masterRowNum = masterIndex[taskId];
  if (!masterRowNum) return;

  const mRange = masterSheet.getRange(masterRowNum, masterTable.startCol, 1, masterTable.numCols);
  const mRow = mRange.getValues()[0];
  const mFormulas = mRange.getFormulas()[0];
  const mRich = mRange.getRichTextValues()[0];

  const mUpdatedAt = mRow[masterTable.headerMap.UpdatedAt] || '';

  const crewsIdx = masterTable.headerMap['Crews'];
  if (crewsIdx == null) throw new Error(`Missing required column: "Crews"`);

  const allowed = parseCrews_(mRow[crewsIdx]);

  for (const crew of crews) {
    const crewKey = String(crew.crewName).trim().toLowerCase();
    const shouldHave = allowed.has(crewKey);

    const sheet = openSheet_(crew.spreadsheetId, `${crew.crewName} Crew`);
    const table = getTasksTable_(sheet);
    ensureTableHasColumns_(table, [CONFIG.idColumnName, ...CONFIG.metaColumns]);

    const localIndex = buildIndexById_(table);
    const localRowNum = localIndex[taskId];

    if (!shouldHave) {
      if (localRowNum) {
        withSyncFlag_(props, () => {
          sheet.deleteRow(localRowNum);
          // ✅ NEW: sort after delete
          sortTasksTableByPriority_(table);
        });
      }
      continue;
    }

    const aligned = alignRowToHeader_(masterTable.header, mRow, table.header);
    const alignedFormulas = alignFormulasRowToHeader_(masterTable.header, mFormulas, table.header);
    const alignedRich = alignRichRowToHeader_(masterTable.header, mRich, table.header);

    if (!localRowNum) {
      withSyncFlag_(props, () => {
        appendRowAtTable_(sheet, table, aligned, alignedFormulas, alignedRich);
        // ✅ NEW: sort after append
        sortTasksTableByPriority_(table);
      });
      continue;
    }

    const localRange = sheet.getRange(localRowNum, table.startCol, 1, table.numCols);
    const localRow = localRange.getValues()[0];
    const lUpdatedAt = localRow[table.headerMap.UpdatedAt] || '';

    if (lUpdatedAt && mUpdatedAt && lUpdatedAt > mUpdatedAt) {
      const masterIndex2 = buildIndexById_(masterTable);
      const localFormulas = localRange.getFormulas()[0];
      const localRich = localRange.getRichTextValues()[0];
      withSyncFlag_(props, () => {
        upsertIntoMaster_(masterTable, masterIndex2, table.header, localRow, localFormulas, localRich);
        // ✅ NEW: sort master after accepting newer crew change
        sortTasksTableByPriority_(masterTable);
      });
      continue;
    }

    withSyncFlag_(props, () => {
      writeRowPreserveLinks_(sheet, localRowNum, table.startCol, aligned, alignedFormulas, alignedRich);
      // ✅ NEW: sort after update write
      sortTasksTableByPriority_(table);
    });
  }
}

/***************
 * UTILITIES
 ***************/
function parseCrews_(crewsCellValue) {
  const s = String(crewsCellValue || '').trim();
  if (!s) return new Set();
  return new Set(s.split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
}

function openSheet_(spreadsheetId, sheetName) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error(`Sheet not found: ${sheetName} (${spreadsheetId})`);
  return sh;
}

function findTasksAnchor_(sheet) {
  const finder = sheet.createTextFinder(CONFIG.tasksAnchorText).matchEntireCell(true);
  const range = finder.findNext();
  if (!range) throw new Error(`Could not find "${CONFIG.tasksAnchorText}" anchor in "${sheet.getName()}"`);
  return range;
}

function getTasksTable_(sheet) {
  const anchor = findTasksAnchor_(sheet);
  const startRow = anchor.getRow() + 1;
  const startCol = anchor.getColumn();

  const lastCol = sheet.getLastColumn();
  const headerRow = sheet.getRange(startRow, startCol, 1, Math.max(1, lastCol - startCol + 1)).getValues()[0];

  let numCols = 0;
  for (let i = 0; i < headerRow.length; i++) {
    const h = String(headerRow[i] ?? '').trim();
    if (!h) break;
    numCols++;
  }
  if (numCols === 0) throw new Error(`No headers found under "${CONFIG.tasksAnchorText}" on "${sheet.getName()}"`);

  const header = headerRow.slice(0, numCols);
  const headerMap = {};
  header.forEach((h, i) => (headerMap[String(h).trim()] = i));

  const scanColName = headerMap[CONFIG.taskTitleHeader] != null ? CONFIG.taskTitleHeader : header[0];
  const scanIdx = headerMap[scanColName];
  const scanCol = startCol + scanIdx;

  const lastRow = sheet.getLastRow();
  const maxRows = Math.max(0, lastRow - startRow);
  let numRows = 0;

  if (maxRows > 0) {
    const colVals = sheet.getRange(startRow + 1, scanCol, maxRows, 1).getValues();
    for (let i = 0; i < colVals.length; i++) {
      const v = colVals[i][0];
      if (v === '' || v == null) break;
      numRows++;
    }
  }

  return { sheet, anchor, startRow, startCol, header, headerMap, numCols, numRows };
}

function ensureTableHasColumns_(table, requiredCols) {
  const sheet = table.sheet;
  const fresh = getTasksTable_(sheet);

  table.header = fresh.header;
  table.headerMap = fresh.headerMap;
  table.numCols = fresh.numCols;
  table.numRows = fresh.numRows;

  let added = 0;
  for (const colName of requiredCols) {
    if (table.headerMap[colName] != null) continue;
    sheet.getRange(table.startRow, table.startCol + table.numCols + added).setValue(colName);
    added++;
  }

  if (added > 0) {
    const updated = getTasksTable_(sheet);
    table.header = updated.header;
    table.headerMap = updated.headerMap;
    table.numCols = updated.numCols;
    table.numRows = updated.numRows;
  }
  return table;
}

function buildIndexById_(table) {
  const { sheet, startRow, startCol, numRows, headerMap } = table;
  const idIdx = headerMap[CONFIG.idColumnName];
  if (idIdx == null || numRows < 1) return {};

  const idCol = startCol + idIdx;
  const ids = sheet.getRange(startRow + 1, idCol, numRows, 1).getValues();
  const index = {};
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i][0];
    if (id) index[id] = startRow + 1 + i;
  }
  return index;
}

function upsertIntoMaster_(masterTable, masterIndex, sourceHeader, sourceRow, sourceFormulasRow = null, sourceRichRow = null) {
  const masterSheet = masterTable.sheet;

  const sMap = {};
  sourceHeader.forEach((h, i) => (sMap[String(h).trim()] = i));

  const taskId = sourceRow[sMap[CONFIG.idColumnName]];
  if (!taskId) return;

  const aligned = alignRowToHeader_(sourceHeader, sourceRow, masterTable.header);
  const alignedFormulas = sourceFormulasRow
    ? alignFormulasRowToHeader_(sourceHeader, sourceFormulasRow, masterTable.header)
    : new Array(masterTable.header.length).fill('');
  const alignedRich = sourceRichRow
    ? alignRichRowToHeader_(sourceHeader, sourceRichRow, masterTable.header)
    : new Array(masterTable.header.length).fill(null);

  const existingRowNum = masterIndex[taskId];
  if (!existingRowNum) {
    appendRowAtTable_(masterSheet, masterTable, aligned, alignedFormulas, alignedRich);
    return;
  }

  const mUpdatedIdx = masterTable.headerMap.UpdatedAt;
  const incomingUpdated = aligned[mUpdatedIdx] || '';
  const existing = masterSheet.getRange(existingRowNum, masterTable.startCol, 1, masterTable.numCols).getValues()[0];
  const existingUpdated = existing[mUpdatedIdx] || '';

  if (existingUpdated && incomingUpdated && existingUpdated > incomingUpdated) return;

  writeRowPreserveLinks_(masterSheet, existingRowNum, masterTable.startCol, aligned, alignedFormulas, alignedRich);
}

function alignRowToHeader_(fromHeader, fromRow, toHeader) {
  const fromMap = {};
  fromHeader.forEach((h, i) => (fromMap[String(h).trim()] = i));
  const out = new Array(toHeader.length).fill('');
  for (let i = 0; i < toHeader.length; i++) {
    const name = String(toHeader[i] ?? '').trim();
    const idx = fromMap[name];
    if (idx != null) out[i] = fromRow[idx];
  }
  return out;
}

function alignFormulasRowToHeader_(fromHeader, fromFormulasRow, toHeader) {
  const fromMap = {};
  fromHeader.forEach((h, i) => (fromMap[String(h).trim()] = i));
  const out = new Array(toHeader.length).fill('');
  for (let i = 0; i < toHeader.length; i++) {
    const name = String(toHeader[i] ?? '').trim();
    const idx = fromMap[name];
    if (idx != null) out[i] = fromFormulasRow[idx] || '';
  }
  return out;
}

function alignRichRowToHeader_(fromHeader, fromRichRow, toHeader) {
  const fromMap = {};
  fromHeader.forEach((h, i) => (fromMap[String(h).trim()] = i));
  const out = new Array(toHeader.length).fill(null);
  for (let i = 0; i < toHeader.length; i++) {
    const name = String(toHeader[i] ?? '').trim();
    const idx = fromMap[name];
    if (idx != null) out[i] = fromRichRow[idx] || null;
  }
  return out;
}

function appendRowAtTable_(sheet, table, rowValues, formulasRow = null, richRow = null) {
  const { startRow, startCol, numCols, headerMap, header } = table;
  const scanColName = headerMap[CONFIG.taskTitleHeader] != null ? CONFIG.taskTitleHeader : header[0];
  const scanIdx = headerMap[scanColName];
  const scanCol = startCol + scanIdx;

  let r = startRow + 1;
  while (true) {
    const v = sheet.getRange(r, scanCol).getValue();
    if (v === '' || v == null) break;
    r++;
  }

  writeRowPreserveLinks_(
    sheet,
    r,
    startCol,
    rowValues,
    formulasRow || new Array(numCols).fill(''),
    richRow || new Array(numCols).fill(null)
  );
}

function withSyncFlag_(props, fn) {
  props.setProperty('SYNC_IN_PROGRESS', '1');
  try { return fn(); }
  finally { props.deleteProperty('SYNC_IN_PROGRESS'); }
}

function stampMissingMetaInTable_(table) {
  ensureTableHasColumns_(table, [CONFIG.idColumnName, ...CONFIG.metaColumns]);
  if (table.numRows < 1) return;

  const sheet = table.sheet;
  const range = sheet.getRange(table.startRow + 1, table.startCol, table.numRows, table.numCols);
  const data = range.getValues();

  const idIdx = table.headerMap[CONFIG.idColumnName];
  const updatedAtIdx = table.headerMap.UpdatedAt;
  const updatedByIdx = table.headerMap.UpdatedBy;
  const taskIdx = table.headerMap[CONFIG.taskTitleHeader];

  const nowIso = new Date().toISOString();
  const by = Session.getActiveUser().getEmail() || '';

  let changed = false;
  for (const row of data) {
    if (CONFIG.skipIfTaskBlank && taskIdx != null) {
      const t = row[taskIdx];
      if (t === '' || t == null) continue;
    }
    if (!row[idIdx]) { row[idIdx] = Utilities.getUuid(); changed = true; }
    if (!row[updatedAtIdx]) { row[updatedAtIdx] = nowIso; changed = true; }
    if (!row[updatedByIdx]) { row[updatedByIdx] = by; changed = true; }
  }

  if (changed) range.setValues(data);
}

/***************
 * SORTING
 * After any controlled update, sort tasks by Priority A->Z.
 ***************/
function sortTasksTableByPriority_(table) {
  const sheet = table.sheet;

  const priorityIdx = table.headerMap['Priority'];
  if (priorityIdx == null) return;

  if (!table.numRows || table.numRows < 2) return;

  const range = sheet.getRange(
    table.startRow + 1,
    table.startCol,
    table.numRows,
    table.numCols
  );

  range.sort({ column: table.startCol + priorityIdx, ascending: true });
}

/***************
 * LINK + FORMULA PRESERVATION HELPERS
 ***************/
function rowHasAny_(arr, predicate) {
  for (const x of arr) if (predicate(x)) return true;
  return false;
}

function richHasLink_(rt) {
  if (!rt) return false;
  const direct = rt.getLinkUrl && rt.getLinkUrl();
  if (direct) return true;

  const runs = rt.getRuns ? rt.getRuns() : null;
  if (!runs) return false;
  return runs.some(r => r.getLinkUrl && r.getLinkUrl());
}

function writeRowPreserveLinks_(sheet, rowNumber, startCol, valuesRow, formulasRow, richRow) {
  const numCols = valuesRow.length;
  sheet.getRange(rowNumber, startCol, 1, numCols).setValues([valuesRow]);

  if (formulasRow && rowHasAny_(formulasRow, f => f && String(f).trim() !== '')) {
    for (let i = 0; i < numCols; i++) {
      const f = formulasRow[i];
      if (f && String(f).trim() !== '') {
        sheet.getRange(rowNumber, startCol + i).setFormula(f);
      }
    }
  }

  if (richRow && rowHasAny_(richRow, rt => richHasLink_(rt))) {
    for (let i = 0; i < numCols; i++) {
      const f = formulasRow ? formulasRow[i] : '';
      if (f && String(f).trim() !== '') continue;

      const rt = richRow[i];
      if (richHasLink_(rt)) {
        sheet.getRange(rowNumber, startCol + i).setRichTextValue(rt);
      }
    }
  }
}

/**
 * IMPORTANT:
 * Do NOT use a simple-trigger onEdit wrapper.
 * Use an INSTALLABLE trigger in each crew spreadsheet for crewSync_onEdit.
 */

/**
 * Optional helper for Master: create an installable trigger pointing at this.
 * (If you want master edits to propagate.)
 */
function masterOnEdit(e) {
  return masterSync_onEdit(e);
}
