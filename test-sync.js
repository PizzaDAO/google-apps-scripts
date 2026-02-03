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

async function writeCell(sheets, spreadsheetId, range, value) {
  const response = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value]] },
  });
  return response.data;
}

function extractSpreadsheetId(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

async function getCrewMappings(sheets) {
  const data = await readRange(sheets, MASTER_SPREADSHEET_ID, 'Crew Mappings!A:G');
  if (!data || data.length < 2) return [];

  // Find column indices from header
  const headers = data[0];
  const crewCol = headers.indexOf('Crew');
  const sheetCol = headers.indexOf('Sheet');

  if (crewCol === -1 || sheetCol === -1) {
    console.log('Crew Mappings missing Crew or Sheet column');
    return [];
  }

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

async function findTasksTable(sheets, spreadsheetId, sheetName) {
  // Read a large range to find the "Tasks" anchor
  const data = await readRange(sheets, spreadsheetId, `'${sheetName}'!A1:Z100`);
  if (!data) return null;

  for (let row = 0; row < data.length; row++) {
    for (let col = 0; col < (data[row]?.length || 0); col++) {
      if (data[row][col] === 'Tasks') {
        // Header is the next row
        const headerRow = row + 1;
        if (headerRow >= data.length) return null;

        const header = data[headerRow];
        const headerMap = {};
        header.forEach((h, i) => {
          if (h) headerMap[String(h).trim()] = i;
        });

        // Find task data rows
        const taskIdx = headerMap['Task'];
        const tasks = [];
        for (let r = headerRow + 1; r < data.length; r++) {
          const taskValue = data[r]?.[taskIdx];
          if (!taskValue) break;
          tasks.push({
            rowIndex: r,
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

async function runAudit(sheets) {
  console.log('\n' + '='.repeat(60));
  console.log('AUDIT: Checking for duplicates and issues');
  console.log('='.repeat(60) + '\n');

  const crews = await getCrewMappings(sheets);
  console.log(`Found ${crews.length} crews in Crew Mappings\n`);

  const allTasks = [];
  const issuesBySheet = {};

  // Read master tasks
  console.log('Reading Master Tasks...');
  const masterTable = await findTasksTable(sheets, MASTER_SPREADSHEET_ID, 'Master Tasks');
  if (masterTable) {
    console.log(`  Found ${masterTable.tasks.length} tasks in Master Tasks`);
    masterTable.tasks.forEach(task => {
      allTasks.push({
        source: 'Master Tasks',
        spreadsheetId: MASTER_SPREADSHEET_ID,
        ...task
      });
    });
  }

  // Read each crew sheet
  for (const crew of crews) {
    const sheetName = `${crew.crewName} Crew`;
    console.log(`Reading ${sheetName}...`);

    try {
      const table = await findTasksTable(sheets, crew.spreadsheetId, sheetName);
      if (table) {
        console.log(`  Found ${table.tasks.length} tasks in ${sheetName}`);
        table.tasks.forEach(task => {
          allTasks.push({
            source: sheetName,
            spreadsheetId: crew.spreadsheetId,
            ...task
          });
        });
      } else {
        console.log(`  Could not find Tasks table in ${sheetName}`);
      }
    } catch (err) {
      console.log(`  Error reading ${sheetName}: ${err.message}`);
    }
  }

  console.log(`\nTotal tasks collected: ${allTasks.length}\n`);

  // Check for issues
  const taskIdIndex = {};
  const taskNameIndex = {};
  const issues = [];

  for (const task of allTasks) {
    const taskIdCol = task.headerMap['TaskID'];
    const taskNameCol = task.headerMap['Task'];

    const taskId = taskIdCol != null ? task.values[taskIdCol] : null;
    const taskName = taskNameCol != null ? task.values[taskNameCol] : null;

    // Check for missing TaskID
    if (!taskId && taskName) {
      issues.push({
        type: 'MISSING_ID',
        source: task.source,
        taskName,
        row: task.rowIndex + 1
      });
    }

    // Check for duplicate TaskIDs
    if (taskId) {
      if (!taskIdIndex[taskId]) {
        taskIdIndex[taskId] = [];
      }
      taskIdIndex[taskId].push({ source: task.source, taskName, row: task.rowIndex + 1 });
    }

    // Check for duplicate task names (potential unintended duplicates)
    if (taskName) {
      const nameKey = taskName.toLowerCase().trim();
      if (!taskNameIndex[nameKey]) {
        taskNameIndex[nameKey] = [];
      }
      taskNameIndex[nameKey].push({
        source: task.source,
        taskName,
        taskId,
        row: task.rowIndex + 1
      });
    }
  }

  // Report duplicate TaskIDs (shouldn't happen - indicates bug)
  console.log('--- DUPLICATE TASK IDs (bug if found) ---');
  let dupIdCount = 0;
  for (const [taskId, occurrences] of Object.entries(taskIdIndex)) {
    if (occurrences.length > 1) {
      // Only flag if same TaskID in same sheet (cross-sheet is expected)
      const bySheet = {};
      occurrences.forEach(o => {
        if (!bySheet[o.source]) bySheet[o.source] = [];
        bySheet[o.source].push(o);
      });
      for (const [sheet, items] of Object.entries(bySheet)) {
        if (items.length > 1) {
          dupIdCount++;
          console.log(`\n  TaskID: ${taskId}`);
          items.forEach(o => console.log(`    - ${o.source} row ${o.row}: "${o.taskName}"`));
          issues.push({ type: 'DUPLICATE_ID_SAME_SHEET', taskId, occurrences: items });
        }
      }
    }
  }
  if (dupIdCount === 0) console.log('  None found ✓\n');

  // Report duplicate task names with different IDs
  console.log('--- DUPLICATE TASK NAMES (different TaskIDs) ---');
  let dupNameCount = 0;
  for (const [nameKey, occurrences] of Object.entries(taskNameIndex)) {
    // Get unique TaskIDs
    const uniqueIds = new Set(occurrences.map(o => o.taskId).filter(Boolean));
    if (uniqueIds.size > 1) {
      dupNameCount++;
      console.log(`\n  Task: "${occurrences[0].taskName}"`);
      occurrences.forEach(o => console.log(`    - ${o.source} row ${o.row}: ID=${o.taskId || 'NONE'}`));
      issues.push({ type: 'DUPLICATE_NAME_DIFF_ID', taskName: occurrences[0].taskName, occurrences });
    }
  }
  if (dupNameCount === 0) console.log('  None found ✓\n');

  // Report missing TaskIDs
  console.log('--- MISSING TASK IDs ---');
  const missingIds = issues.filter(i => i.type === 'MISSING_ID');
  if (missingIds.length === 0) {
    console.log('  None found ✓\n');
  } else {
    missingIds.forEach(i => console.log(`  - ${i.source} row ${i.row}: "${i.taskName}"`));
    console.log();
  }

  // Summary
  console.log('='.repeat(60));
  console.log('AUDIT SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total tasks: ${allTasks.length}`);
  console.log(`Duplicate TaskIDs in same sheet: ${dupIdCount}`);
  console.log(`Duplicate names with different IDs: ${dupNameCount}`);
  console.log(`Missing TaskIDs: ${missingIds.length}`);
  console.log();

  return { allTasks, issues, taskIdIndex, taskNameIndex };
}

async function testSync(sheets) {
  console.log('\n' + '='.repeat(60));
  console.log('SYNC TEST: Edit a cell and verify propagation');
  console.log('='.repeat(60) + '\n');

  const crews = await getCrewMappings(sheets);
  if (crews.length === 0) {
    console.log('No crews found to test with');
    return false;
  }

  // Find a task that exists in Master and at least one crew
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

  // Find a task with a crew assignment and TaskID
  let testTask = null;
  let testCrew = null;

  for (const task of masterTable.tasks) {
    const taskId = task.values[taskIdCol];
    const crewsValue = task.values[crewsCol];
    if (taskId && crewsValue) {
      // Find which crew this task belongs to
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
  console.log(`New Notes: "${newNotes}"`);

  // Update Notes in Master Tasks
  const notesCell = `'Master Tasks'!${String.fromCharCode(65 + masterTable.startCol + notesCol)}${testTask.rowIndex + 1}`;
  console.log(`\nUpdating Master Tasks at ${notesCell}...`);

  await writeCell(sheets, MASTER_SPREADSHEET_ID, notesCell, newNotes);
  console.log('✓ Master Tasks updated');

  // Note: The Apps Script trigger should fire and sync to crews
  console.log('\n⏳ Waiting 10 seconds for sync trigger to run...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Check if it synced to the crew sheet
  const crewSheetName = `${testCrew.crewName} Crew`;
  console.log(`\nChecking ${crewSheetName} for sync...`);

  const crewTable = await findTasksTable(sheets, testCrew.spreadsheetId, crewSheetName);
  if (!crewTable) {
    console.log(`Could not find Tasks table in ${crewSheetName}`);
    return false;
  }

  const crewTaskIdCol = crewTable.headerMap['TaskID'];
  const crewNotesCol = crewTable.headerMap['Notes'];

  let foundInCrew = false;
  for (const crewTask of crewTable.tasks) {
    if (crewTask.values[crewTaskIdCol] === taskId) {
      const crewNotes = crewTask.values[crewNotesCol] || '';
      if (crewNotes.includes(testMarker)) {
        console.log(`✓ SYNC SUCCESSFUL! Found test marker in ${crewSheetName}`);
        console.log(`  Notes in crew: "${crewNotes}"`);
        foundInCrew = true;
      } else {
        console.log(`✗ SYNC FAILED - Task found but Notes not updated`);
        console.log(`  Notes in crew: "${crewNotes}"`);
        console.log(`  Expected to contain: "${testMarker}"`);
      }
      break;
    }
  }

  if (!foundInCrew) {
    console.log(`✗ Task with ID ${taskId} not found in ${crewSheetName}`);
  }

  // Clean up - restore original notes
  console.log('\nCleaning up - restoring original Notes...');
  await writeCell(sheets, MASTER_SPREADSHEET_ID, notesCell, originalNotes);
  console.log('✓ Restored original Notes');

  // Wait and check crew cleanup
  console.log('⏳ Waiting 10 seconds for cleanup sync...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  return foundInCrew;
}

async function main() {
  const sheets = await getSheetsApi();

  // Run audit first
  const auditResults = await runAudit(sheets);

  // Then test sync
  const syncSuccess = await testSync(sheets);

  console.log('\n' + '='.repeat(60));
  console.log('FINAL RESULTS');
  console.log('='.repeat(60));
  console.log(`Audit: ${auditResults.issues.length === 0 ? '✓ No issues' : `⚠ ${auditResults.issues.length} issues found`}`);
  console.log(`Sync test: ${syncSuccess ? '✓ Working' : '✗ Failed or not triggered'}`);
}

main().catch(console.error);
