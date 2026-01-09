/***********************************************************************
 * TaskSyncLib - Standalone Library for Bidirectional Task Sync
 *
 * DEPLOYMENT:
 * 1. Create a new standalone Apps Script project
 * 2. Paste this code
 * 3. Deploy as Library: Deploy → New deployment → Type: Library
 * 4. Copy the deployment ID for use in wrapper scripts
 *
 * All spreadsheets call into this single library, which ensures:
 * - Shared LockService (no concurrent syncs)
 * - Shared ScriptProperties (SYNC_IN_PROGRESS flag works across all)
 * - No cascade triggers
 ***********************************************************************/

/***************
 * CONFIG
 ***************/
const CONFIG = {
  masterSpreadsheetId: '1hSzGYowH0qFmODYJF08vrcvfdcCycs7ztSALjTSDpYs',
  masterSheetName: 'Master Tasks',

  crewMappingsTabName: 'Crew Mappings',
  crewNameHeader: 'Crew',
  crewSheetUrlHeader: 'Sheet',

  tasksAnchorText: 'Tasks',
  taskTitleHeader: 'Task',
  idColumnName: 'TaskID',

  // Column names used in sync logic
  crewsColumnName: 'Crews',
  priorityColumnName: 'Priority',

  // Metadata columns added to every tasks table
  metaColumns: ['UpdatedAt', 'UpdatedBy'],

  // Don't generate IDs for blank template rows
  skipIfTaskBlank: true,

  // Required headers for validation
  requiredHeaders: [
    'Priority', 'Stage', 'Task', 'Due', 'Lead', 'Lead ID',
    'Crews', 'Goal', 'Tags', 'Notes'
  ],
};

/***************
 * MAIN ENTRY POINT - Called by all spreadsheets' onEdit triggers
 ***************/
function handleEdit(e) {
  if (!e || !e.range) return;

  // Library's lock - shared across ALL callers
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    console.log('Could not acquire lock, skipping sync');
    return;
  }

  try {
    // Library's properties - shared across ALL callers
    const props = PropertiesService.getScriptProperties();

    if (props.getProperty('SYNC_IN_PROGRESS') === '1') {
      console.log('Sync already in progress, skipping');
      return;
    }

    const ss = e.source;
    const sheet = e.range.getSheet();

    // Route to appropriate handler
    if (ss.getId() === CONFIG.masterSpreadsheetId &&
        sheet.getName() === CONFIG.masterSheetName) {
      handleMasterEdit_(e, props);
    } else {
      handleCrewEdit_(e, props);
    }

  } catch (err) {
    console.error('TaskSyncLib handleEdit error:', err);
    throw err;
  } finally {
    PropertiesService.getScriptProperties().deleteProperty('SYNC_IN_PROGRESS');
    lock.releaseLock();
  }
}

/***************
 * CREW EDIT HANDLER
 ***************/
function handleCrewEdit_(e, props) {
  const crews = loadCrewsFromMappings_();
  const ss = e.source;
  const sheet = e.range.getSheet();

  // Find which crew this sheet belongs to
  const crewEntry = crews.find(c =>
    c.spreadsheetId === ss.getId() &&
    `${c.crewName} Crew` === sheet.getName()
  );
  if (!crewEntry) return;

  const table = getTasksTable_(sheet);
  ensureTableHasColumns_(table, [CONFIG.idColumnName, ...CONFIG.metaColumns]);

  // Check if edit is within the tasks data area
  const row = e.range.getRow();
  const col = e.range.getColumn();
  const dataTop = table.startRow + 1;
  const dataBottom = dataTop + table.numRows - 1;
  const dataLeft = table.startCol;
  const dataRight = dataLeft + table.numCols - 1;

  if (row < dataTop || row > dataBottom || col < dataLeft || col > dataRight) return;

  // Get the edited row's data
  const rowRange = sheet.getRange(row, table.startCol, 1, table.numCols);
  const rowValues = rowRange.getValues()[0];
  const rowFormulas = rowRange.getFormulas()[0];
  const rowRich = rowRange.getRichTextValues()[0];

  const idIdx = table.headerMap[CONFIG.idColumnName];
  const updatedAtIdx = table.headerMap.UpdatedAt;
  const updatedByIdx = table.headerMap.UpdatedBy;
  const taskIdx = table.headerMap[CONFIG.taskTitleHeader];
  const crewsIdx = table.headerMap[CONFIG.crewsColumnName];

  // Skip blank rows
  if (CONFIG.skipIfTaskBlank && taskIdx != null) {
    const t = rowValues[taskIdx];
    if (t === '' || t == null) return;
  }

  props.setProperty('SYNC_IN_PROGRESS', '1');

  // Ensure task has an ID
  if (!rowValues[idIdx]) {
    const id = Utilities.getUuid();
    sheet.getRange(row, table.startCol + idIdx).setValue(id);
    rowValues[idIdx] = id;
  }

  // Handle crew membership
  if (crewsIdx == null) throw new Error(`Missing required column: "${CONFIG.crewsColumnName}"`);

  const editedIsSingleCell = e.range.getNumRows() === 1 && e.range.getNumColumns() === 1;
  const editedColAbs = e.range.getColumn();
  const crewsColAbs = table.startCol + crewsIdx;

  const crewsSet = parseCrews_(rowValues[crewsIdx]);
  const thisCrewKey = String(crewEntry.crewName).trim().toLowerCase();
  const currentlyHasThisCrew = crewsSet.has(thisCrewKey);
  const userEditedCrewsCell = editedIsSingleCell && editedColAbs === crewsColAbs;

  // If user explicitly removed this crew from Crews column, honor that
  // Otherwise ensure this crew is listed
  if (!currentlyHasThisCrew && userEditedCrewsCell) {
    // User removed this crew - propagation will delete row from this sheet
  } else {
    if (ensureCrewListedInCrewsCell_(rowValues, table.headerMap, crewEntry.crewName)) {
      sheet.getRange(row, crewsColAbs).setValue(rowValues[crewsIdx]);
    }
  }

  // Update metadata
  const nowIso = new Date().toISOString();
  const by = Session.getActiveUser().getEmail() || '';
  sheet.getRange(row, table.startCol + updatedAtIdx).setValue(nowIso);
  sheet.getRange(row, table.startCol + updatedByIdx).setValue(by);
  rowValues[updatedAtIdx] = nowIso;
  rowValues[updatedByIdx] = by;

  // Sync to master
  const masterSheet = openSheet_(CONFIG.masterSpreadsheetId, CONFIG.masterSheetName);
  const masterTable = getTasksTable_(masterSheet);
  ensureTableHasColumns_(masterTable, [CONFIG.idColumnName, ...CONFIG.metaColumns]);
  const masterIndex = buildIndexById_(masterTable);

  upsertIntoMaster_(masterTable, masterIndex, table.header, rowValues, rowFormulas, rowRich);

  // Propagate to all crews (including back to source for consistency)
  propagateTaskFromMaster_(rowValues[idIdx], crews);

  // Sort once at the end
  sortTasksTableByPriority_(getTasksTable_(sheet));
  sortTasksTableByPriority_(getTasksTable_(masterSheet));
}

/***************
 * MASTER EDIT HANDLER
 ***************/
function handleMasterEdit_(e, props) {
  const ss = e.source;
  const sheet = e.range.getSheet();
  const crews = loadCrewsFromMappings_();

  const table = getTasksTable_(sheet);
  ensureTableHasColumns_(table, [CONFIG.idColumnName, ...CONFIG.metaColumns]);

  // Check if edit is within the tasks data area
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

  // Skip blank rows
  if (CONFIG.skipIfTaskBlank && taskIdx != null) {
    const t = rowValues[taskIdx];
    if (t === '' || t == null) return;
  }

  props.setProperty('SYNC_IN_PROGRESS', '1');

  // Ensure task has an ID
  if (!rowValues[idIdx]) {
    const id = Utilities.getUuid();
    sheet.getRange(row, table.startCol + idIdx).setValue(id);
    rowValues[idIdx] = id;
  }

  // Update metadata
  const nowIso = new Date().toISOString();
  const by = Session.getActiveUser().getEmail() || '';
  sheet.getRange(row, table.startCol + updatedAtIdx).setValue(nowIso);
  sheet.getRange(row, table.startCol + updatedByIdx).setValue(by);
  rowValues[updatedAtIdx] = nowIso;
  rowValues[updatedByIdx] = by;

  // Update master's own record
  const masterIndex = buildIndexById_(table);
  upsertIntoMaster_(table, masterIndex, table.header, rowValues, rowFormulas, rowRich);

  // Propagate to all crews
  propagateTaskFromMaster_(rowValues[idIdx], crews);

  // Sort master once at the end
  sortTasksTableByPriority_(getTasksTable_(sheet));
}

/***************
 * MENU FUNCTIONS (called from wrapper)
 ***************/
function buildMenu() {
  SpreadsheetApp.getUi()
    .createMenu('Task Sync')
    .addItem('Validate setup', 'runValidate')
    .addItem('Bootstrap: add IDs + copy to master', 'runBootstrap')
    .addSeparator()
    .addItem('Reconcile: push master to crews', 'runReconcile')
    .addToUi();
}

function validate() {
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

  return issues;
}

function bootstrap() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const props = PropertiesService.getScriptProperties();
    props.setProperty('SYNC_IN_PROGRESS', '1');

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
        if (ensureCrewListedInCrewsCell_(row, headerMap, crew.crewName)) { changed = true; }
        if (!row[updatedAtIdx]) { row[updatedAtIdx] = nowIso; changed = true; }
        if (!row[updatedByIdx]) { row[updatedByIdx] = by; changed = true; }

        upsertIntoMaster_(masterTable, masterIndex, header, row, formulas[i], rich[i]);
      }

      if (changed) range.setValues(data);

      // Refresh master index after processing each crew
      masterIndex = buildIndexById_(masterTable);
    }

    stampMissingMetaInTable_(masterTable);

    // Reconcile and sort
    reconcile(false); // Don't sort individually, we'll sort once at the end

    // Final sort of master
    sortTasksTableByPriority_(getTasksTable_(openSheet_(CONFIG.masterSpreadsheetId, CONFIG.masterSheetName)));

    // Sort all crew tables
    for (const crew of crews) {
      const crewSheet = openSheet_(crew.spreadsheetId, `${crew.crewName} Crew`);
      sortTasksTableByPriority_(getTasksTable_(crewSheet));
    }

  } finally {
    PropertiesService.getScriptProperties().deleteProperty('SYNC_IN_PROGRESS');
    lock.releaseLock();
  }
}

function reconcile(sortAfterEach = false) {
  const crews = loadCrewsFromMappings_();

  const masterSheet = openSheet_(CONFIG.masterSpreadsheetId, CONFIG.masterSheetName);
  const masterTable = getTasksTable_(masterSheet);
  ensureTableHasColumns_(masterTable, [CONFIG.idColumnName, ...CONFIG.metaColumns]);

  const idx = buildIndexById_(masterTable);
  for (const id of Object.keys(idx)) {
    propagateTaskFromMaster_(id, crews, sortAfterEach);
  }

  if (!sortAfterEach) {
    // Sort everything once at the end
    sortTasksTableByPriority_(getTasksTable_(masterSheet));
    for (const crew of crews) {
      try {
        const crewSheet = openSheet_(crew.spreadsheetId, `${crew.crewName} Crew`);
        sortTasksTableByPriority_(getTasksTable_(crewSheet));
      } catch (err) {
        console.error(`Failed to sort ${crew.crewName}: ${err.message}`);
      }
    }
  }
}

/***************
 * PROPAGATION
 ***************/
function propagateTaskFromMaster_(taskId, crews, sortAfterEach = false) {
  if (!taskId) return;

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
  const crewsIdx = masterTable.headerMap[CONFIG.crewsColumnName];
  if (crewsIdx == null) throw new Error(`Missing required column: "${CONFIG.crewsColumnName}"`);

  const allowed = parseCrews_(mRow[crewsIdx]);

  for (const crew of crews) {
    const crewKey = String(crew.crewName).trim().toLowerCase();
    const shouldHave = allowed.has(crewKey);

    let sheet, table;
    try {
      sheet = openSheet_(crew.spreadsheetId, `${crew.crewName} Crew`);
      table = getTasksTable_(sheet);
      ensureTableHasColumns_(table, [CONFIG.idColumnName, ...CONFIG.metaColumns]);
    } catch (err) {
      console.error(`Failed to open ${crew.crewName}: ${err.message}`);
      continue;
    }

    const localIndex = buildIndexById_(table);
    const localRowNum = localIndex[taskId];

    if (!shouldHave) {
      if (localRowNum) {
        sheet.deleteRow(localRowNum);
        if (sortAfterEach) sortTasksTableByPriority_(getTasksTable_(sheet));
      }
      continue;
    }

    const aligned = alignRowToHeader_(masterTable.header, mRow, table.header);
    const alignedFormulas = alignFormulasRowToHeader_(masterTable.header, mFormulas, table.header);
    const alignedRich = alignRichRowToHeader_(masterTable.header, mRich, table.header);

    if (!localRowNum) {
      appendRowAtTable_(sheet, table, aligned, alignedFormulas, alignedRich);
      if (sortAfterEach) sortTasksTableByPriority_(getTasksTable_(sheet));
      continue;
    }

    const localRange = sheet.getRange(localRowNum, table.startCol, 1, table.numCols);
    const localRow = localRange.getValues()[0];
    const lUpdatedAt = localRow[table.headerMap.UpdatedAt] || '';

    // If local is newer, pull it back to master
    if (lUpdatedAt && mUpdatedAt && lUpdatedAt > mUpdatedAt) {
      const localFormulas = localRange.getFormulas()[0];
      const localRich = localRange.getRichTextValues()[0];
      const masterIndex2 = buildIndexById_(masterTable);
      upsertIntoMaster_(masterTable, masterIndex2, table.header, localRow, localFormulas, localRich);
      if (sortAfterEach) sortTasksTableByPriority_(getTasksTable_(masterSheet));
      continue;
    }

    // Push master to local
    writeRowPreserveLinks_(sheet, localRowNum, table.startCol, aligned, alignedFormulas, alignedRich);
    if (sortAfterEach) sortTasksTableByPriority_(getTasksTable_(sheet));
  }
}

/***************
 * CREW LOADER
 ***************/
function loadCrewsFromMappings_() {
  const ss = SpreadsheetApp.openById(CONFIG.masterSpreadsheetId);
  const sh = ss.getSheetByName(CONFIG.crewMappingsTabName);
  if (!sh) throw new Error(`Missing tab: ${CONFIG.crewMappingsTabName}`);

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => String(h || '').trim());
  const crewCol = headers.indexOf(CONFIG.crewNameHeader);
  const urlCol = headers.indexOf(CONFIG.crewSheetUrlHeader);

  if (crewCol === -1) throw new Error(`Crew Mappings missing header: ${CONFIG.crewNameHeader}`);
  if (urlCol === -1) throw new Error(`Crew Mappings missing header: ${CONFIG.crewSheetUrlHeader}`);

  const crews = [];
  for (let i = 1; i < values.length; i++) {
    const crewName = String(values[i][crewCol] || '').trim();
    const sheetUrl = String(values[i][urlCol] || '').trim();
    if (!crewName || !sheetUrl) continue;

    const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) throw new Error(`Could not parse spreadsheetId for crew "${crewName}" from: ${sheetUrl}`);

    crews.push({ crewName, spreadsheetId: match[1] });
  }
  return crews;
}

/***************
 * TABLE UTILITIES
 ***************/
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

function requiredHeadersMissing_(headers) {
  const need = [...CONFIG.requiredHeaders, CONFIG.idColumnName, ...CONFIG.metaColumns];
  const have = new Set(headers.map(h => String(h || '').trim()));
  return need.filter(h => !have.has(h));
}

/***************
 * CREW MEMBERSHIP HELPERS
 ***************/
function parseCrews_(crewsCellValue) {
  const s = String(crewsCellValue || '').trim();
  if (!s) return new Set();
  return new Set(s.split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
}

function normalizeCrewName_(name) {
  return String(name || '').trim();
}

function ensureCrewListedInCrewsCell_(rowValues, headerMap, crewName) {
  const crewsIdx = headerMap[CONFIG.crewsColumnName];
  if (crewsIdx == null) throw new Error(`Missing required column: "${CONFIG.crewsColumnName}"`);

  const crew = normalizeCrewName_(crewName);
  if (!crew) return false;

  const existing = String(rowValues[crewsIdx] || '').trim();
  const parts = existing ? existing.split(',').map(s => s.trim()).filter(Boolean) : [];

  const lower = new Set(parts.map(p => p.toLowerCase()));
  if (lower.has(crew.toLowerCase())) return false;

  parts.push(crew);
  rowValues[crewsIdx] = parts.join(', ');
  return true;
}

/***************
 * ROW OPERATIONS
 ***************/
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

  // Skip if existing is newer
  if (existingUpdated && incomingUpdated && existingUpdated > incomingUpdated) return;

  writeRowPreserveLinks_(masterSheet, existingRowNum, masterTable.startCol, aligned, alignedFormulas, alignedRich);
}

function appendRowAtTable_(sheet, table, rowValues, formulasRow = null, richRow = null) {
  const { startRow, startCol, numCols, headerMap, header } = table;
  const scanColName = headerMap[CONFIG.taskTitleHeader] != null ? CONFIG.taskTitleHeader : header[0];
  const scanIdx = headerMap[scanColName];
  const scanCol = startCol + scanIdx;

  // Find next empty row - get all values at once instead of one at a time
  const lastRow = sheet.getLastRow();
  const maxScan = Math.max(0, lastRow - startRow);
  let r = startRow + 1;

  if (maxScan > 0) {
    const colVals = sheet.getRange(startRow + 1, scanCol, maxScan, 1).getValues();
    for (let i = 0; i < colVals.length; i++) {
      const v = colVals[i][0];
      if (v === '' || v == null) break;
      r++;
    }
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
 * ALIGNMENT HELPERS
 ***************/
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

/***************
 * SORTING
 ***************/
function sortTasksTableByPriority_(table) {
  const sheet = table.sheet;
  const priorityIdx = table.headerMap[CONFIG.priorityColumnName];
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
 * LINK + FORMULA PRESERVATION
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
