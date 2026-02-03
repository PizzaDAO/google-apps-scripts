const { google } = require('googleapis');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const MASTER_SPREADSHEET_ID = '1hSzGYowH0qFmODYJF08vrcvfdcCycs7ztSALjTSDpYs';

async function getAuthClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth.getClient();
}

async function getSheetsApi() {
  const authClient = await getAuthClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

async function readRange(sheets, spreadsheetId, range) {
  try {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return response.data.values || [];
  } catch (err) {
    console.error(`Error reading ${range} from ${spreadsheetId}:`, err.message);
    return [];
  }
}

function extractSpreadsheetId(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

async function getCrewMappings(sheets) {
  const data = await readRange(sheets, MASTER_SPREADSHEET_ID, 'Crew Mappings!A:G');
  if (!data || data.length < 2) return [];

  const headers = data[0];
  const crewCol = headers.indexOf('Crew');
  const sheetCol = headers.indexOf('Sheet');

  if (crewCol === -1 || sheetCol === -1) return [];

  const crews = [];
  for (let i = 1; i < data.length; i++) {
    const crewName = data[i][crewCol];
    const url = data[i][sheetCol];
    if (crewName && url) {
      const spreadsheetId = extractSpreadsheetId(url);
      if (spreadsheetId) {
        crews.push({ crewName, spreadsheetId, url });
      }
    }
  }
  return crews;
}

async function getSheetId(sheets, spreadsheetId, sheetName) {
  const response = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
  return sheet ? sheet.properties.sheetId : null;
}

async function findTasksTable(sheets, spreadsheetId, sheetName) {
  const data = await readRange(sheets, spreadsheetId, `'${sheetName}'!A1:Z100`);
  if (!data) return null;

  for (let row = 0; row < data.length; row++) {
    for (let col = 0; col < (data[row]?.length || 0); col++) {
      if (data[row][col] === 'Tasks') {
        const headerRow = row + 1;
        if (headerRow >= data.length) return null;

        const header = data[headerRow];
        const headerMap = {};
        header.forEach((h, i) => {
          if (h) headerMap[String(h).trim()] = i;
        });

        const taskIdx = headerMap['Task'];
        const tasks = [];
        for (let r = headerRow + 1; r < data.length; r++) {
          const taskValue = data[r]?.[taskIdx];
          if (!taskValue) break;
          tasks.push({
            rowIndex: r,  // 0-based row in data array
            sheetRow: r + 1,  // 1-based row in sheet
            values: data[r],
            header,
            headerMap
          });
        }

        return {
          anchorRow: row,
          headerRow,
          header,
          headerMap,
          tasks,
          startCol: col
        };
      }
    }
  }
  return null;
}

async function findDuplicatesInSheet(sheets, spreadsheetId, sheetName) {
  const table = await findTasksTable(sheets, spreadsheetId, sheetName);
  if (!table) return { sheetName, duplicates: [] };

  const taskIdCol = table.headerMap['TaskID'];
  const updatedAtCol = table.headerMap['UpdatedAt'];
  const taskNameCol = table.headerMap['Task'];

  if (taskIdCol == null) return { sheetName, duplicates: [] };

  // Group tasks by TaskID
  const byTaskId = {};
  for (const task of table.tasks) {
    const taskId = task.values[taskIdCol];
    if (!taskId) continue;

    if (!byTaskId[taskId]) {
      byTaskId[taskId] = [];
    }
    byTaskId[taskId].push({
      sheetRow: task.sheetRow,
      taskName: task.values[taskNameCol],
      taskId,
      updatedAt: updatedAtCol != null ? task.values[updatedAtCol] : null
    });
  }

  // Find duplicates (same TaskID appears multiple times)
  const duplicates = [];
  for (const [taskId, tasks] of Object.entries(byTaskId)) {
    if (tasks.length > 1) {
      // Sort by UpdatedAt (newer first), then by row (higher row first as tiebreaker)
      tasks.sort((a, b) => {
        if (a.updatedAt && b.updatedAt) {
          return new Date(b.updatedAt) - new Date(a.updatedAt);
        }
        if (a.updatedAt) return -1;
        if (b.updatedAt) return 1;
        return b.sheetRow - a.sheetRow;
      });

      // Keep the first (newest), mark rest for deletion
      const keep = tasks[0];
      const remove = tasks.slice(1);

      duplicates.push({
        taskId,
        taskName: keep.taskName,
        keep: { row: keep.sheetRow, updatedAt: keep.updatedAt },
        remove: remove.map(t => ({ row: t.sheetRow, updatedAt: t.updatedAt }))
      });
    }
  }

  return { sheetName, table, duplicates };
}

async function deleteRows(sheets, spreadsheetId, sheetName, rows) {
  if (rows.length === 0) return;

  const sheetId = await getSheetId(sheets, spreadsheetId, sheetName);
  if (sheetId == null) {
    console.log(`  Could not find sheetId for ${sheetName}`);
    return;
  }

  // Sort rows in descending order to delete from bottom up
  const sortedRows = [...rows].sort((a, b) => b - a);

  const requests = sortedRows.map(row => ({
    deleteDimension: {
      range: {
        sheetId,
        dimension: 'ROWS',
        startIndex: row - 1,  // 0-based
        endIndex: row         // exclusive
      }
    }
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests }
  });
}

async function cleanupDuplicates() {
  console.log('\n' + '='.repeat(60));
  console.log('CLEANUP: Finding and removing duplicate TaskIDs');
  console.log('='.repeat(60) + '\n');

  const sheets = await getSheetsApi();
  const crews = await getCrewMappings(sheets);

  const allSheets = [
    { name: 'Master Tasks', spreadsheetId: MASTER_SPREADSHEET_ID, sheetName: 'Master Tasks' },
    ...crews.map(c => ({
      name: `${c.crewName} Crew`,
      spreadsheetId: c.spreadsheetId,
      sheetName: `${c.crewName} Crew`
    }))
  ];

  let totalRemoved = 0;

  for (const sheet of allSheets) {
    console.log(`\nChecking ${sheet.name}...`);

    try {
      const result = await findDuplicatesInSheet(sheets, sheet.spreadsheetId, sheet.sheetName);

      if (result.duplicates.length === 0) {
        console.log(`  No duplicates found`);
        continue;
      }

      console.log(`  Found ${result.duplicates.length} TaskID(s) with duplicates:`);

      const rowsToDelete = [];
      for (const dup of result.duplicates) {
        console.log(`    TaskID: ${dup.taskId}`);
        console.log(`      Task: "${dup.taskName}"`);
        console.log(`      Keeping row ${dup.keep.row} (UpdatedAt: ${dup.keep.updatedAt || 'N/A'})`);
        for (const rem of dup.remove) {
          console.log(`      Deleting row ${rem.row} (UpdatedAt: ${rem.updatedAt || 'N/A'})`);
          rowsToDelete.push(rem.row);
        }
      }

      console.log(`  Deleting ${rowsToDelete.length} row(s)...`);
      await deleteRows(sheets, sheet.spreadsheetId, sheet.sheetName, rowsToDelete);
      console.log(`  Done!`);
      totalRemoved += rowsToDelete.length;
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`CLEANUP COMPLETE: Removed ${totalRemoved} duplicate row(s)`);
  console.log('='.repeat(60) + '\n');

  return totalRemoved;
}

async function testSyncAfterCleanup(sheets) {
  console.log('\n' + '='.repeat(60));
  console.log('SYNC TEST: Edit a cell and verify propagation');
  console.log('='.repeat(60) + '\n');

  const crews = await getCrewMappings(sheets);
  if (crews.length === 0) {
    console.log('No crews found to test with');
    return false;
  }

  // Find a task in Master that has a crew assignment
  const masterTable = await findTasksTable(sheets, MASTER_SPREADSHEET_ID, 'Master Tasks');
  if (!masterTable || masterTable.tasks.length === 0) {
    console.log('No tasks found in Master Tasks');
    return false;
  }

  const crewsCol = masterTable.headerMap['Crews'];
  const taskIdCol = masterTable.headerMap['TaskID'];
  const notesCol = masterTable.headerMap['Notes'];

  if (notesCol == null) {
    console.log('Notes column not found - cannot test');
    return false;
  }

  // Find a task with a crew assignment
  let testTask = null;
  let testCrew = null;

  for (const task of masterTable.tasks) {
    const taskId = task.values[taskIdCol];
    const crewsValue = task.values[crewsCol];
    if (taskId && crewsValue) {
      const crewNames = crewsValue.split(',').map(c => c.trim().toLowerCase());
      for (const crew of crews) {
        if (crewNames.includes(crew.crewName.toLowerCase())) {
          testTask = task;
          testCrew = crew;
          break;
        }
      }
      if (testTask) break;
    }
  }

  if (!testTask || !testCrew) {
    console.log('Could not find a task with crew assignment to test');
    return false;
  }

  const taskId = testTask.values[taskIdCol];
  const taskName = testTask.values[masterTable.headerMap['Task']];
  const originalNotes = testTask.values[notesCol] || '';
  const testMarker = `[SYNC TEST ${Date.now()}]`;
  const newNotes = originalNotes ? `${originalNotes} ${testMarker}` : testMarker;

  console.log(`Test task: "${taskName}"`);
  console.log(`TaskID: ${taskId}`);
  console.log(`Testing with crew: ${testCrew.crewName}`);
  console.log(`Original Notes: "${originalNotes}"`);
  console.log(`New Notes: "${newNotes}"\n`);

  // Update Notes in Master Tasks
  const notesCell = `'Master Tasks'!${String.fromCharCode(65 + masterTable.startCol + notesCol)}${testTask.sheetRow}`;
  console.log(`Updating Master Tasks at ${notesCell}...`);

  await sheets.spreadsheets.values.update({
    spreadsheetId: MASTER_SPREADSHEET_ID,
    range: notesCell,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[newNotes]] },
  });
  console.log('Master Tasks updated');

  // Wait for Apps Script trigger
  console.log('\nWaiting 15 seconds for sync trigger to run...');
  await new Promise(resolve => setTimeout(resolve, 15000));

  // Check crew sheet
  const crewSheetName = `${testCrew.crewName} Crew`;
  console.log(`\nChecking ${crewSheetName} for sync...`);

  const crewTable = await findTasksTable(sheets, testCrew.spreadsheetId, crewSheetName);
  if (!crewTable) {
    console.log(`Could not find Tasks table in ${crewSheetName}`);
    return false;
  }

  const crewTaskIdCol = crewTable.headerMap['TaskID'];
  const crewNotesCol = crewTable.headerMap['Notes'];

  let syncSuccess = false;
  for (const crewTask of crewTable.tasks) {
    if (crewTask.values[crewTaskIdCol] === taskId) {
      const crewNotes = crewTask.values[crewNotesCol] || '';
      if (crewNotes.includes(testMarker)) {
        console.log(`SYNC SUCCESSFUL! Found test marker in ${crewSheetName}`);
        console.log(`  Notes in crew: "${crewNotes}"`);
        syncSuccess = true;
      } else {
        console.log(`SYNC FAILED - Task found but Notes not updated`);
        console.log(`  Notes in crew: "${crewNotes}"`);
        console.log(`  Expected to contain: "${testMarker}"`);
      }
      break;
    }
  }

  // Clean up
  console.log('\nRestoring original Notes...');
  await sheets.spreadsheets.values.update({
    spreadsheetId: MASTER_SPREADSHEET_ID,
    range: notesCell,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[originalNotes]] },
  });
  console.log('Restored');

  return syncSuccess;
}

async function main() {
  const sheets = await getSheetsApi();

  // Step 1: Clean up duplicates
  const removedCount = await cleanupDuplicates();

  // Step 2: Test sync
  if (removedCount >= 0) {
    console.log('\nWaiting 5 seconds before testing sync...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    const syncSuccess = await testSyncAfterCleanup(sheets);

    console.log('\n' + '='.repeat(60));
    console.log('FINAL RESULTS');
    console.log('='.repeat(60));
    console.log(`Duplicates removed: ${removedCount}`);
    console.log(`Sync test: ${syncSuccess ? 'PASSED' : 'FAILED or not triggered'}`);
    console.log('='.repeat(60) + '\n');
  }
}

main().catch(console.error);
