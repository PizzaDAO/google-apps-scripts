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
  stageColumnName: 'Stage',

  // Metadata columns added to every tasks table
  metaColumns: ['UpdatedAt', 'UpdatedBy'],

  // Don't generate IDs for blank template rows
  skipIfTaskBlank: true,

  // Required headers for validation
  requiredHeaders: [
    'Priority', 'Stage', 'Task', 'Due', 'Lead', 'Lead ID',
    'Crews', 'Goal', 'Tags', 'Notes'
  ],

  // Logging
  logsSheetName: 'Sync Logs',
  maxLogRows: 500,  // Keep last 500 log entries
};

/***************
 * LOGGING
 ***************/
function log_(level, action, details) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.masterSpreadsheetId);
    let logsSheet = ss.getSheetByName(CONFIG.logsSheetName);

    // Create logs sheet if it doesn't exist
    if (!logsSheet) {
      logsSheet = ss.insertSheet(CONFIG.logsSheetName);
      logsSheet.getRange(1, 1, 1, 6).setValues([[
        'Timestamp', 'Level', 'Action', 'TaskID', 'Details', 'User'
      ]]);
      logsSheet.getRange(1, 1, 1, 6).setFontWeight('bold');
      logsSheet.setFrozenRows(1);
    }

    const timestamp = new Date().toISOString();
    const user = Session.getActiveUser().getEmail() || 'unknown';
    const taskId = details.taskId || '';
    const detailsStr = JSON.stringify(details);

    // Insert at row 2 (after header) to keep newest at top
    logsSheet.insertRowAfter(1);
    logsSheet.getRange(2, 1, 1, 6).setValues([[
      timestamp, level, action, taskId, detailsStr, user
    ]]);

    // Trim old logs if needed
    const lastRow = logsSheet.getLastRow();
    if (lastRow > CONFIG.maxLogRows + 1) {
      logsSheet.deleteRows(CONFIG.maxLogRows + 2, lastRow - CONFIG.maxLogRows - 1);
    }
  } catch (err) {
    console.error('Logging failed:', err);
  }
}

function logInfo_(action, details) {
  log_('INFO', action, details);
}

function logError_(action, details) {
  log_('ERROR', action, details);
}

function logDebug_(action, details) {
  log_('DEBUG', action, details);
}

/***************
 * MAIN ENTRY POINT - Called by all spreadsheets' onEdit triggers
 ***************/
function handleEdit(e) {
  if (!e || !e.range) return;

  const ss = e.source;
  const sheet = e.range.getSheet();
  const editInfo = {
    spreadsheet: ss.getName(),
    sheet: sheet.getName(),
    range: e.range.getA1Notation(),
    value: e.value,
    oldValue: e.oldValue
  };

  // BEFORE LOCK: Validate edit and stamp timestamp to protect from overwrites
  // This prevents race conditions where another sync overwrites our pending edit
  const editContext = validateAndStampEdit_(e);
  if (!editContext) {
    // Not a valid tasks table edit, ignore
    return;
  }

  // Library's lock - shared across ALL callers
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    logInfo_('LOCK_FAILED', { ...editInfo, reason: 'Could not acquire lock' });
    console.log('Could not acquire lock, skipping sync');
    return;
  }

  try {
    // Library's properties - shared across ALL callers
    const props = PropertiesService.getScriptProperties();

    if (props.getProperty('SYNC_IN_PROGRESS') === '1') {
      logInfo_('SYNC_SKIPPED', { ...editInfo, reason: 'Sync already in progress' });
      console.log('Sync already in progress, skipping');
      return;
    }

    // Route to appropriate handler
    if (ss.getId() === CONFIG.masterSpreadsheetId &&
        sheet.getName() === CONFIG.masterSheetName) {
      logInfo_('EDIT_RECEIVED', { ...editInfo, source: 'master' });
      handleMasterEdit_(e, props, editContext);
    } else {
      logInfo_('EDIT_RECEIVED', { ...editInfo, source: 'crew' });
      handleCrewEdit_(e, props, editContext);
    }

  } catch (err) {
    logError_('SYNC_ERROR', { ...editInfo, error: err.message, stack: err.stack });
    console.error('TaskSyncLib handleEdit error:', err);
    throw err;
  } finally {
    PropertiesService.getScriptProperties().deleteProperty('SYNC_IN_PROGRESS');
    lock.releaseLock();
  }
}

/**
 * Validates that the edit is within a tasks table and stamps UpdatedAt immediately.
 * This MUST happen before acquiring the lock to protect the row from being overwritten
 * by another sync operation while we're waiting for the lock.
 *
 * Returns edit context if valid, null if edit should be ignored.
 */
function validateAndStampEdit_(e) {
  const ss = e.source;
  const sheet = e.range.getSheet();
  const row = e.range.getRow();
  const col = e.range.getColumn();

  // Try to find the tasks table
  let table;
  try {
    table = getTasksTable_(sheet);
  } catch (err) {
    // No tasks table on this sheet
    return null;
  }

  // Ensure we have the metadata columns
  ensureTableHasColumns_(table, [CONFIG.idColumnName, ...CONFIG.metaColumns]);

  // Check if edit is within the tasks data area
  const dataTop = table.startRow + 1;
  const actualLastRow = sheet.getLastRow();
  const dataBottom = Math.max(dataTop, actualLastRow);
  const dataLeft = table.startCol;
  const dataRight = dataLeft + table.numCols - 1;

  if (row < dataTop || row > dataBottom || col < dataLeft || col > dataRight) {
    return null;
  }

  // Check if the Task column has a value (skip blank rows)
  const taskIdx = table.headerMap[CONFIG.taskTitleHeader];
  if (CONFIG.skipIfTaskBlank && taskIdx != null) {
    const taskValue = sheet.getRange(row, table.startCol + taskIdx).getValue();
    if (taskValue === '' || taskValue == null) {
      return null;
    }
  }

  // CRITICAL: Stamp UpdatedAt immediately to protect this row from overwrites
  // Any propagation that arrives while we're waiting for the lock will see
  // this timestamp and won't overwrite our pending edit
  const updatedAtIdx = table.headerMap.UpdatedAt;
  const updatedByIdx = table.headerMap.UpdatedBy;
  const nowIso = new Date().toISOString();
  const user = Session.getActiveUser().getEmail() || '';

  sheet.getRange(row, table.startCol + updatedAtIdx).setValue(nowIso);
  sheet.getRange(row, table.startCol + updatedByIdx).setValue(user);

  // Track which columns were edited (for field-level sync)
  // Convert absolute column positions to relative indices within the table
  const editedColIndices = new Set();
  const editStartCol = e.range.getColumn();
  const editNumCols = e.range.getNumColumns();

  for (let c = 0; c < editNumCols; c++) {
    const absCol = editStartCol + c;
    const relIdx = absCol - table.startCol;
    if (relIdx >= 0 && relIdx < table.numCols) {
      editedColIndices.add(relIdx);
    }
  }

  return {
    table,
    row,
    col,
    stampedAt: nowIso,
    stampedBy: user,
    editedColIndices: Array.from(editedColIndices)
  };
}

/***************
 * CREW EDIT HANDLER
 ***************/
function handleCrewEdit_(e, props, editContext) {
  const crews = loadCrewsFromMappings_();
  const ss = e.source;
  const sheet = e.range.getSheet();

  // Find which crew this sheet belongs to
  const crewEntry = crews.find(c =>
    c.spreadsheetId === ss.getId() &&
    `${c.crewName} Crew` === sheet.getName()
  );
  if (!crewEntry) return;

  // Use the table from editContext (already validated and has fresh columns)
  const table = editContext.table;
  const row = editContext.row;

  // Get the edited row's data (re-read to get current values including our timestamp)
  const rowRange = sheet.getRange(row, table.startCol, 1, table.numCols);
  const rowValues = rowRange.getValues()[0];
  const rowFormulas = rowRange.getFormulas()[0];
  const rowRich = rowRange.getRichTextValues()[0];

  const idIdx = table.headerMap[CONFIG.idColumnName];
  const updatedAtIdx = table.headerMap.UpdatedAt;
  const updatedByIdx = table.headerMap.UpdatedBy;
  const taskIdx = table.headerMap[CONFIG.taskTitleHeader];
  const crewsIdx = table.headerMap[CONFIG.crewsColumnName];

  props.setProperty('SYNC_IN_PROGRESS', '1');

  // Ensure task has an ID
  const hadIdBefore = !!rowValues[idIdx];
  if (!hadIdBefore) {
    const id = Utilities.getUuid();
    sheet.getRange(row, table.startCol + idIdx).setValue(id);
    rowValues[idIdx] = id;
  }

  // Check if task exists in Master (to determine if it's truly new)
  const masterSheet = openSheet_(CONFIG.masterSpreadsheetId, CONFIG.masterSheetName);
  const masterTable = getTasksTable_(masterSheet);
  ensureTableHasColumns_(masterTable, [CONFIG.idColumnName, ...CONFIG.metaColumns]);
  const masterIndex = buildIndexById_(masterTable);
  const existsInMaster = !!masterIndex[rowValues[idIdx]];

  // Handle crew membership
  if (crewsIdx == null) throw new Error(`Missing required column: "${CONFIG.crewsColumnName}"`);

  const editedIsSingleCell = e.range.getNumRows() === 1 && e.range.getNumColumns() === 1;
  const editedColAbs = e.range.getColumn();
  const crewsColAbs = table.startCol + crewsIdx;

  const crewsSet = parseCrews_(rowValues[crewsIdx]);
  const thisCrewKey = String(crewEntry.crewName).trim().toLowerCase();
  const currentlyHasThisCrew = crewsSet.has(thisCrewKey);
  const userEditedCrewsCell = editedIsSingleCell && editedColAbs === crewsColAbs;

  // Task is "new" if it doesn't exist in Master yet
  // For NEW tasks: always add this crew to Crews (task was created here)
  // For EXISTING tasks: if user explicitly removed this crew from Crews column, honor that
  const isNewTask = !existsInMaster;
  const userRemovingThisCrew = !isNewTask && !currentlyHasThisCrew && userEditedCrewsCell;

  if (userRemovingThisCrew) {
    // User removed this crew from existing task - propagation will delete row from this sheet
    logInfo_('CREW_REMOVED', {
      taskId: rowValues[idIdx],
      crew: crewEntry.crewName,
      newCrews: rowValues[crewsIdx]
    });
  } else {
    if (ensureCrewListedInCrewsCell_(rowValues, table.headerMap, crewEntry.crewName)) {
      sheet.getRange(row, crewsColAbs).setValue(rowValues[crewsIdx]);
      logInfo_('CREW_ADDED', {
        taskId: rowValues[idIdx],
        crew: crewEntry.crewName,
        isNewTask,
        crews: rowValues[crewsIdx]
      });
    }
  }

  // Use the timestamp from editContext (already stamped before lock)
  rowValues[updatedAtIdx] = editContext.stampedAt;
  rowValues[updatedByIdx] = editContext.stampedBy;

  // Build the set of edited columns (user's edit + any columns we modified)
  const editedColIndices = new Set(editContext.editedColIndices);
  // Always include metadata columns
  editedColIndices.add(updatedAtIdx);
  editedColIndices.add(updatedByIdx);
  // If we added an ID, include that
  if (!hadIdBefore) editedColIndices.add(idIdx);
  // If we modified Crews, include that
  if (crewsIdx != null) editedColIndices.add(crewsIdx);

  // Sync to master (reuse masterTable from earlier, rebuild index in case rows changed)
  const freshMasterIndex = buildIndexById_(masterTable);

  const taskName = rowValues[taskIdx] || '';
  logInfo_('CREW_TO_MASTER', {
    taskId: rowValues[idIdx],
    taskName,
    fromCrew: crewEntry.crewName,
    row,
    editedCols: Array.from(editedColIndices)
  });

  const editedColsArray = Array.from(editedColIndices);
  upsertIntoMaster_(masterTable, freshMasterIndex, table.header, rowValues, rowFormulas, rowRich, editedColsArray);

  // Propagate to all crews (including back to source for consistency)
  propagateTaskFromMaster_(rowValues[idIdx], crews, editedColsArray, table.header);

  logInfo_('SYNC_COMPLETE', {
    taskId: rowValues[idIdx],
    taskName,
    source: 'crew',
    fromCrew: crewEntry.crewName
  });
}

/***************
 * MASTER EDIT HANDLER
 ***************/
function handleMasterEdit_(e, props, editContext) {
  const ss = e.source;
  const sheet = e.range.getSheet();
  const crews = loadCrewsFromMappings_();

  // Use the table from editContext (already validated and has fresh columns)
  const table = editContext.table;
  const row = editContext.row;

  // Get the edited row's data (re-read to get current values including our timestamp)
  const rowRange = sheet.getRange(row, table.startCol, 1, table.numCols);
  const rowValues = rowRange.getValues()[0];
  const rowFormulas = rowRange.getFormulas()[0];
  const rowRich = rowRange.getRichTextValues()[0];

  const idIdx = table.headerMap[CONFIG.idColumnName];
  const updatedAtIdx = table.headerMap.UpdatedAt;
  const updatedByIdx = table.headerMap.UpdatedBy;
  const taskIdx = table.headerMap[CONFIG.taskTitleHeader];

  props.setProperty('SYNC_IN_PROGRESS', '1');

  // Track if we added an ID
  const hadIdBefore = !!rowValues[idIdx];

  // Ensure task has an ID
  if (!rowValues[idIdx]) {
    const id = Utilities.getUuid();
    sheet.getRange(row, table.startCol + idIdx).setValue(id);
    rowValues[idIdx] = id;
  }

  // Use the timestamp from editContext (already stamped before lock)
  rowValues[updatedAtIdx] = editContext.stampedAt;
  rowValues[updatedByIdx] = editContext.stampedBy;

  // Build the set of edited columns (user's edit + any columns we modified)
  const editedColIndices = new Set(editContext.editedColIndices);
  // Always include metadata columns
  editedColIndices.add(updatedAtIdx);
  editedColIndices.add(updatedByIdx);
  // If we added an ID, include that
  if (!hadIdBefore) editedColIndices.add(idIdx);

  const editedColsArray = Array.from(editedColIndices);

  // Update master's own record (for field-level, just update the edited cells directly)
  // No need to call upsertIntoMaster_ for Master edits since we already wrote the row
  // The timestamp was already stamped in validateAndStampEdit_

  const taskName = rowValues[taskIdx] || '';
  logInfo_('MASTER_TO_CREWS', {
    taskId: rowValues[idIdx],
    taskName,
    row,
    crewCount: crews.length,
    editedCols: editedColsArray
  });

  // Propagate to all crews (only the edited columns)
  propagateTaskFromMaster_(rowValues[idIdx], crews, editedColsArray, table.header);

  logInfo_('SYNC_COMPLETE', {
    taskId: rowValues[idIdx],
    taskName,
    source: 'master'
  });
}

/***************
 * HEALTH CHECK & DIAGNOSTICS
 ***************/
function healthCheck() {
  const results = {
    timestamp: new Date().toISOString(),
    master: { status: 'unknown', taskCount: 0, issues: [] },
    crews: [],
    duplicates: { sameId: [], sameName: [] }
  };

  try {
    // Check master
    const masterSheet = openSheet_(CONFIG.masterSpreadsheetId, CONFIG.masterSheetName);
    const masterTable = getTasksTable_(masterSheet);
    const lastRow = masterSheet.getLastRow();
    const actualRows = Math.max(0, lastRow - masterTable.startRow);

    results.master.status = 'ok';
    results.master.taskCount = actualRows;
    results.master.cachedRows = masterTable.numRows;

    if (actualRows !== masterTable.numRows) {
      results.master.issues.push(`Row count mismatch: actual=${actualRows}, cached=${masterTable.numRows}`);
    }

    // Build index to find duplicates
    const masterIndex = {};
    const masterNames = {};
    const idCol = masterTable.startCol + masterTable.headerMap[CONFIG.idColumnName];
    const nameCol = masterTable.startCol + masterTable.headerMap[CONFIG.taskTitleHeader];

    if (actualRows > 0) {
      const ids = masterSheet.getRange(masterTable.startRow + 1, idCol, actualRows, 1).getValues();
      const names = masterSheet.getRange(masterTable.startRow + 1, nameCol, actualRows, 1).getValues();

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i][0];
        const name = String(names[i][0] || '').trim().toLowerCase();

        if (id) {
          if (masterIndex[id]) {
            results.duplicates.sameId.push({ id, rows: [masterIndex[id], masterTable.startRow + 1 + i], sheet: 'Master' });
          } else {
            masterIndex[id] = masterTable.startRow + 1 + i;
          }
        }

        if (name) {
          if (!masterNames[name]) masterNames[name] = [];
          masterNames[name].push({ row: masterTable.startRow + 1 + i, id });
        }
      }
    }

    // Check for same names with different IDs
    for (const [name, occurrences] of Object.entries(masterNames)) {
      const uniqueIds = new Set(occurrences.map(o => o.id).filter(Boolean));
      if (uniqueIds.size > 1) {
        results.duplicates.sameName.push({ name, occurrences, sheet: 'Master' });
      }
    }

    // Check crews
    const crews = loadCrewsFromMappings_();
    for (const crew of crews) {
      const crewResult = { name: crew.crewName, status: 'unknown', taskCount: 0, issues: [] };
      try {
        const crewSheet = openSheet_(crew.spreadsheetId, `${crew.crewName} Crew`);
        const crewTable = getTasksTable_(crewSheet);
        const crewLastRow = crewSheet.getLastRow();
        const crewActualRows = Math.max(0, crewLastRow - crewTable.startRow);

        crewResult.status = 'ok';
        crewResult.taskCount = crewActualRows;

        // Check for duplicates in crew sheet
        if (crewActualRows > 0) {
          const crewIdCol = crewTable.startCol + crewTable.headerMap[CONFIG.idColumnName];
          const crewIds = crewSheet.getRange(crewTable.startRow + 1, crewIdCol, crewActualRows, 1).getValues();
          const crewIndex = {};

          for (let i = 0; i < crewIds.length; i++) {
            const id = crewIds[i][0];
            if (id) {
              if (crewIndex[id]) {
                results.duplicates.sameId.push({
                  id,
                  rows: [crewIndex[id], crewTable.startRow + 1 + i],
                  sheet: crew.crewName
                });
              } else {
                crewIndex[id] = crewTable.startRow + 1 + i;
              }
            }
          }
        }
      } catch (err) {
        crewResult.status = 'error';
        crewResult.issues.push(err.message);
      }
      results.crews.push(crewResult);
    }

  } catch (err) {
    results.master.status = 'error';
    results.master.issues.push(err.message);
  }

  return results;
}

/**
 * Run health check and return formatted string for UI display
 */
function runHealthCheck() {
  const results = healthCheck();
  const lines = [];

  lines.push(`Health Check - ${results.timestamp}`);
  lines.push('');
  lines.push(`Master Tasks: ${results.master.status} (${results.master.taskCount} tasks)`);
  if (results.master.issues.length > 0) {
    results.master.issues.forEach(i => lines.push(`  ⚠ ${i}`));
  }

  lines.push('');
  lines.push('Crew Sheets:');
  for (const crew of results.crews) {
    lines.push(`  ${crew.name}: ${crew.status} (${crew.taskCount} tasks)`);
    if (crew.issues.length > 0) {
      crew.issues.forEach(i => lines.push(`    ⚠ ${i}`));
    }
  }

  lines.push('');
  lines.push('Duplicates:');
  if (results.duplicates.sameId.length === 0 && results.duplicates.sameName.length === 0) {
    lines.push('  None found ✓');
  } else {
    if (results.duplicates.sameId.length > 0) {
      lines.push(`  Same TaskID: ${results.duplicates.sameId.length} issues`);
      results.duplicates.sameId.forEach(d => {
        lines.push(`    - ${d.sheet}: ID ${d.id} in rows ${d.rows.join(', ')}`);
      });
    }
    if (results.duplicates.sameName.length > 0) {
      lines.push(`  Same Name (diff IDs): ${results.duplicates.sameName.length} issues`);
    }
  }

  return lines.join('\n');
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

    // Reconcile (no sorting)
    reconcile();

  } finally {
    PropertiesService.getScriptProperties().deleteProperty('SYNC_IN_PROGRESS');
    lock.releaseLock();
  }
}

function reconcile() {
  const crews = loadCrewsFromMappings_();

  const masterSheet = openSheet_(CONFIG.masterSpreadsheetId, CONFIG.masterSheetName);
  const masterTable = getTasksTable_(masterSheet);
  ensureTableHasColumns_(masterTable, [CONFIG.idColumnName, ...CONFIG.metaColumns]);

  const idx = buildIndexById_(masterTable);
  for (const id of Object.keys(idx)) {
    propagateTaskFromMaster_(id, crews);
  }
}

/***************
 * PROPAGATION
 ***************/
function propagateTaskFromMaster_(taskId, crews, editedColIndices = null, sourceHeader = null) {
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

  // Convert source column indices to master column indices (by header name)
  // This handles the case where source and master might have different column orders
  let editedMasterCols = null;
  if (editedColIndices && editedColIndices.length > 0 && sourceHeader) {
    editedMasterCols = new Set();
    for (const srcIdx of editedColIndices) {
      const headerName = sourceHeader[srcIdx];
      if (headerName) {
        const masterIdx = masterTable.headerMap[String(headerName).trim()];
        if (masterIdx != null) {
          editedMasterCols.add(masterIdx);
        }
      }
    }
  }

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
        logInfo_('PROPAGATE_DELETE', {
          taskId,
          crew: crew.crewName,
          row: localRowNum,
          reason: 'Crew not in allowed list'
        });
        sheet.deleteRow(localRowNum);
      } else {
        logDebug_('PROPAGATE_SKIP', {
          taskId,
          crew: crew.crewName,
          reason: 'shouldHave=false, no local row'
        });
      }
      continue;
    }

    const aligned = alignRowToHeader_(masterTable.header, mRow, table.header);
    const alignedFormulas = alignFormulasRowToHeader_(masterTable.header, mFormulas, table.header);
    const alignedRich = alignRichRowToHeader_(masterTable.header, mRich, table.header);

    if (!localRowNum) {
      logInfo_('PROPAGATE_ADD', {
        taskId,
        crew: crew.crewName,
        reason: 'Task not in crew, adding'
      });
      insertRowAtTableTop_(sheet, table, aligned, alignedFormulas, alignedRich);
      continue;
    }

    const localRange = sheet.getRange(localRowNum, table.startCol, 1, table.numCols);
    const localRow = localRange.getValues()[0];
    const lUpdatedAt = localRow[table.headerMap.UpdatedAt] || '';

    // If local is newer, pull it back to master (don't overwrite local edits)
    if (lUpdatedAt && mUpdatedAt && lUpdatedAt > mUpdatedAt) {
      const localFormulas = localRange.getFormulas()[0];
      const localRich = localRange.getRichTextValues()[0];
      const masterIndex2 = buildIndexById_(masterTable);
      upsertIntoMaster_(masterTable, masterIndex2, table.header, localRow, localFormulas, localRich);
      continue;
    }

    // Push master to local - field-level if we have that info
    if (editedMasterCols && editedMasterCols.size > 0) {
      // Map master column indices to local (crew) column indices by header name
      for (const masterIdx of editedMasterCols) {
        const headerName = masterTable.header[masterIdx];
        if (!headerName) continue;

        const localIdx = table.headerMap[String(headerName).trim()];
        if (localIdx == null) continue;

        const colNum = table.startCol + localIdx;
        const value = aligned[localIdx];
        const formula = alignedFormulas[localIdx];
        const rich = alignedRich[localIdx];

        if (formula && String(formula).trim() !== '') {
          sheet.getRange(localRowNum, colNum).setFormula(formula);
        } else if (richHasLink_(rich)) {
          sheet.getRange(localRowNum, colNum).setRichTextValue(rich);
        } else {
          sheet.getRange(localRowNum, colNum).setValue(value);
        }
      }
    } else {
      // No field-level info - update entire row (fallback for reconcile)
      writeRowPreserveLinks_(sheet, localRowNum, table.startCol, aligned, alignedFormulas, alignedRich);
    }
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
  const { sheet, startRow, startCol, headerMap } = table;
  const idIdx = headerMap[CONFIG.idColumnName];
  if (idIdx == null) return {};

  // Always use fresh row count from sheet, not stale table.numRows
  const lastRow = sheet.getLastRow();
  const actualNumRows = Math.max(0, lastRow - startRow);
  if (actualNumRows < 1) return {};

  const idCol = startCol + idIdx;
  const ids = sheet.getRange(startRow + 1, idCol, actualNumRows, 1).getValues();
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
function upsertIntoMaster_(masterTable, masterIndex, sourceHeader, sourceRow, sourceFormulasRow = null, sourceRichRow = null, editedColIndices = null) {
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
    // New task - insert entire row
    insertRowAtTableTop_(masterSheet, masterTable, aligned, alignedFormulas, alignedRich);
    return;
  }

  const mUpdatedIdx = masterTable.headerMap.UpdatedAt;
  const incomingUpdated = aligned[mUpdatedIdx] || '';
  const existing = masterSheet.getRange(existingRowNum, masterTable.startCol, 1, masterTable.numCols).getValues()[0];
  const existingUpdated = existing[mUpdatedIdx] || '';

  // Skip if existing is newer (overall row timestamp check)
  if (existingUpdated && incomingUpdated && existingUpdated > incomingUpdated) return;

  // Field-level sync: only update the edited columns if specified
  if (editedColIndices && editedColIndices.length > 0) {
    // Map source column indices to master column indices by header name
    const editedMasterCols = new Set();
    for (const srcIdx of editedColIndices) {
      const headerName = sourceHeader[srcIdx];
      if (headerName) {
        const masterIdx = masterTable.headerMap[String(headerName).trim()];
        if (masterIdx != null) {
          editedMasterCols.add(masterIdx);
        }
      }
    }

    // Update only the edited columns
    for (const masterIdx of editedMasterCols) {
      const colNum = masterTable.startCol + masterIdx;
      const value = aligned[masterIdx];
      const formula = alignedFormulas[masterIdx];
      const rich = alignedRich[masterIdx];

      if (formula && String(formula).trim() !== '') {
        masterSheet.getRange(existingRowNum, colNum).setFormula(formula);
      } else if (richHasLink_(rich)) {
        masterSheet.getRange(existingRowNum, colNum).setRichTextValue(rich);
      } else {
        masterSheet.getRange(existingRowNum, colNum).setValue(value);
      }
    }
  } else {
    // No field-level info - update entire row (fallback for bootstrap/reconcile)
    writeRowPreserveLinks_(masterSheet, existingRowNum, masterTable.startCol, aligned, alignedFormulas, alignedRich);
  }
}

/**
 * Insert a new row at the top of the tasks table (right after the header row).
 * This avoids issues with sorting changing row positions during sync.
 */
function insertRowAtTableTop_(sheet, table, rowValues, formulasRow = null, richRow = null) {
  const { startRow, startCol, numCols } = table;

  // Insert a new row right after the header
  const insertRowNum = startRow + 1;
  sheet.insertRowAfter(startRow);

  writeRowPreserveLinks_(
    sheet,
    insertRowNum,
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
 * Sort by: Done at bottom, then Priority A→Z
 ***************/
function sortTasksTableByPriority_(table) {
  const sheet = table.sheet;
  const priorityIdx = table.headerMap[CONFIG.priorityColumnName];
  const stageIdx = table.headerMap[CONFIG.stageColumnName];

  if (priorityIdx == null) return;
  if (!table.numRows || table.numRows < 2) return;

  const range = sheet.getRange(
    table.startRow + 1,
    table.startCol,
    table.numRows,
    table.numCols
  );

  // Get all data for custom sort
  const data = range.getValues();
  const formulas = range.getFormulas();
  const richTexts = range.getRichTextValues();

  // Custom sort: Done at bottom, then by Priority A→Z
  const indexed = data.map((row, i) => ({ row, formulas: formulas[i], rich: richTexts[i], idx: i }));

  indexed.sort((a, b) => {
    const stageA = stageIdx != null ? String(a.row[stageIdx] || '').toLowerCase() : '';
    const stageB = stageIdx != null ? String(b.row[stageIdx] || '').toLowerCase() : '';

    // Done/Complete/Skipped go to bottom
    const doneStages = ['done', 'complete', 'completed', 'skipped'];
    const aIsDone = doneStages.some(s => stageA.includes(s));
    const bIsDone = doneStages.some(s => stageB.includes(s));

    if (aIsDone && !bIsDone) return 1;   // a goes after b
    if (!aIsDone && bIsDone) return -1;  // a goes before b

    // Both done or both not done: sort by Priority A→Z
    const priA = String(a.row[priorityIdx] || '').toLowerCase();
    const priB = String(b.row[priorityIdx] || '').toLowerCase();
    return priA.localeCompare(priB);
  });

  // Write back sorted data
  const sortedData = indexed.map(item => item.row);
  range.setValues(sortedData);

  // Restore formulas
  for (let r = 0; r < indexed.length; r++) {
    for (let c = 0; c < indexed[r].formulas.length; c++) {
      const f = indexed[r].formulas[c];
      if (f && String(f).trim() !== '') {
        sheet.getRange(table.startRow + 1 + r, table.startCol + c).setFormula(f);
      }
    }
  }

  // Restore rich text (links)
  for (let r = 0; r < indexed.length; r++) {
    for (let c = 0; c < indexed[r].rich.length; c++) {
      const rt = indexed[r].rich[c];
      if (richHasLink_(rt)) {
        const f = indexed[r].formulas[c];
        if (!f || String(f).trim() === '') {
          sheet.getRange(table.startRow + 1 + r, table.startCol + c).setRichTextValue(rt);
        }
      }
    }
  }

  // Apply filter to hide Done/Complete/Skipped stages
  if (stageIdx != null) {
    applyStageFilter_(sheet, table, stageIdx, indexed);
  }
}

/**
 * Applies a filter to the tasks table that hides Done/Complete/Skipped stages.
 * Preserves any existing filter criteria on other columns.
 */
function applyStageFilter_(sheet, table, stageIdx, sortedData) {
  // Use fresh row count from sheet
  const actualLastRow = sheet.getLastRow();
  const actualNumRows = Math.max(0, actualLastRow - table.startRow);

  const filterRange = sheet.getRange(
    table.startRow,  // Include header row
    table.startCol,
    actualNumRows + 1,  // +1 for header
    table.numCols
  );

  // Check for existing filter and preserve other column criteria
  let existingFilter = sheet.getFilter();
  const preservedCriteria = {};

  if (existingFilter) {
    // Save criteria from other columns before removing filter
    for (let col = 1; col <= table.numCols; col++) {
      if (col !== stageIdx + 1) {  // Don't preserve Stage column criteria
        const criteria = existingFilter.getColumnFilterCriteria(col);
        if (criteria) {
          preservedCriteria[col] = criteria;
        }
      }
    }
    existingFilter.remove();
  }

  // Create new filter on the table range
  const filter = filterRange.createFilter();

  // Restore preserved criteria from other columns
  for (const [col, criteria] of Object.entries(preservedCriteria)) {
    filter.setColumnFilterCriteria(parseInt(col), criteria);
  }

  // Collect all unique stage values that should be hidden
  const hiddenStages = new Set();
  const donePatterns = ['done', 'complete', 'completed', 'skipped'];

  for (const item of sortedData) {
    const stage = String(item.row[stageIdx] || '').trim();
    const stageLower = stage.toLowerCase();
    if (donePatterns.some(p => stageLower.includes(p))) {
      hiddenStages.add(stage);  // Add the original case version
    }
  }

  // Only apply Stage filter if there are stages to hide
  if (hiddenStages.size > 0) {
    const criteria = SpreadsheetApp.newFilterCriteria()
      .setHiddenValues(Array.from(hiddenStages))
      .build();

    // Stage column position relative to filter range (1-indexed)
    const stageColPosition = stageIdx + 1;
    filter.setColumnFilterCriteria(stageColPosition, criteria);
  }
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
