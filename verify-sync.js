const { google } = require('googleapis');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const MASTER_SPREADSHEET_ID = '1hSzGYowH0qFmODYJF08vrcvfdcCycs7ztSALjTSDpYs';

async function getAuthClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
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
    console.error(`Error reading ${range}:`, err.message);
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

async function readSyncLogs(sheets, limit = 20) {
  const data = await readRange(sheets, MASTER_SPREADSHEET_ID, `'Sync Logs'!A1:F${limit + 1}`);
  if (!data || data.length < 2) return [];

  const headers = data[0];
  const logs = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    logs.push({
      timestamp: row[0],
      level: row[1],
      action: row[2],
      taskId: row[3],
      details: row[4] ? JSON.parse(row[4]) : {},
      user: row[5]
    });
  }

  return logs;
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
            rowIndex: r,
            sheetRow: r + 1,
            values: data[r],
            header,
            headerMap
          });
        }

        return { headerRow, header, headerMap, tasks, startCol: col };
      }
    }
  }
  return null;
}

async function getTaskById(sheets, spreadsheetId, sheetName, taskId) {
  const table = await findTasksTable(sheets, spreadsheetId, sheetName);
  if (!table) return null;

  const taskIdCol = table.headerMap['TaskID'];
  for (const task of table.tasks) {
    if (task.values[taskIdCol] === taskId) {
      return { table, task };
    }
  }
  return null;
}

async function verifySync(taskId) {
  console.log('\n' + '='.repeat(60));
  console.log(`VERIFY SYNC: TaskID ${taskId || '(most recent)'}`);
  console.log('='.repeat(60) + '\n');

  const sheets = await getSheetsApi();

  // Read sync logs
  console.log('Reading Sync Logs...');
  const logs = await readSyncLogs(sheets, 50);

  if (logs.length === 0) {
    console.log('No sync logs found. The Sync Logs sheet may not exist yet.');
    console.log('Make an edit in one of the sheets to trigger logging.\n');
    return;
  }

  // Find the task to verify
  let targetTaskId = taskId;
  if (!targetTaskId) {
    // Find most recent SYNC_COMPLETE log
    const syncComplete = logs.find(l => l.action === 'SYNC_COMPLETE');
    if (syncComplete) {
      targetTaskId = syncComplete.taskId;
      console.log(`Using most recent synced task: ${targetTaskId}`);
    } else {
      console.log('No SYNC_COMPLETE logs found yet.\n');
      console.log('Recent log entries:');
      logs.slice(0, 10).forEach(l => {
        console.log(`  ${l.timestamp} | ${l.action} | ${l.taskId || 'N/A'}`);
      });
      return;
    }
  }

  // Get logs for this task
  const taskLogs = logs.filter(l => l.taskId === targetTaskId);
  console.log(`\nFound ${taskLogs.length} log entries for this task:`);
  taskLogs.forEach(l => {
    console.log(`  ${l.timestamp} | ${l.level} | ${l.action}`);
    if (l.details.error) {
      console.log(`    ERROR: ${l.details.error}`);
    }
  });

  // Verify task exists in all expected locations
  console.log('\n--- Verifying task data across sheets ---\n');

  // Get task from Master
  const masterResult = await getTaskById(sheets, MASTER_SPREADSHEET_ID, 'Master Tasks', targetTaskId);
  if (!masterResult) {
    console.log('ERROR: Task not found in Master Tasks!');
    return;
  }

  const { table: masterTable, task: masterTask } = masterResult;
  const crewsCol = masterTable.headerMap['Crews'];
  const taskNameCol = masterTable.headerMap['Task'];
  const updatedAtCol = masterTable.headerMap['UpdatedAt'];
  const notesCol = masterTable.headerMap['Notes'];

  const taskName = masterTask.values[taskNameCol];
  const crews = masterTask.values[crewsCol] || '';
  const masterUpdatedAt = masterTask.values[updatedAtCol];
  const masterNotes = masterTask.values[notesCol] || '';

  console.log(`Task: "${taskName}"`);
  console.log(`Master UpdatedAt: ${masterUpdatedAt}`);
  console.log(`Master Notes: "${masterNotes}"`);
  console.log(`Crews: ${crews || '(none)'}`);

  // Check each crew sheet
  const crewMappings = await getCrewMappings(sheets);
  const assignedCrews = crews.split(',').map(c => c.trim().toLowerCase()).filter(Boolean);

  console.log('\nCrew sheet verification:');

  for (const crew of crewMappings) {
    const crewKey = crew.crewName.toLowerCase();
    const shouldExist = assignedCrews.includes(crewKey);
    const sheetName = `${crew.crewName} Crew`;

    try {
      const crewResult = await getTaskById(sheets, crew.spreadsheetId, sheetName, targetTaskId);

      if (shouldExist) {
        if (crewResult) {
          const crewUpdatedAt = crewResult.task.values[crewResult.table.headerMap['UpdatedAt']];
          const crewNotes = crewResult.task.values[crewResult.table.headerMap['Notes']] || '';
          const inSync = crewUpdatedAt === masterUpdatedAt && crewNotes === masterNotes;

          if (inSync) {
            console.log(`  ${crew.crewName}: IN SYNC`);
          } else {
            console.log(`  ${crew.crewName}: OUT OF SYNC`);
            console.log(`    Master UpdatedAt: ${masterUpdatedAt}`);
            console.log(`    Crew UpdatedAt:   ${crewUpdatedAt}`);
            if (crewNotes !== masterNotes) {
              console.log(`    Master Notes: "${masterNotes}"`);
              console.log(`    Crew Notes:   "${crewNotes}"`);
            }
          }
        } else {
          console.log(`  ${crew.crewName}: MISSING (should exist)`);
        }
      } else {
        if (crewResult) {
          console.log(`  ${crew.crewName}: UNEXPECTED (should not exist)`);
        } else {
          console.log(`  ${crew.crewName}: Correctly absent`);
        }
      }
    } catch (err) {
      console.log(`  ${crew.crewName}: ERROR - ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

async function showRecentLogs(limit = 20) {
  console.log('\n' + '='.repeat(60));
  console.log('RECENT SYNC LOGS');
  console.log('='.repeat(60) + '\n');

  const sheets = await getSheetsApi();
  const logs = await readSyncLogs(sheets, limit);

  if (logs.length === 0) {
    console.log('No sync logs found.');
    console.log('The Sync Logs sheet will be created on the first edit after deploying v7.\n');
    return;
  }

  console.log(`Showing ${logs.length} most recent log entries:\n`);

  for (const log of logs) {
    const taskInfo = log.details.taskName ? ` "${log.details.taskName}"` : '';
    const source = log.details.source || log.details.fromCrew || '';
    console.log(`${log.timestamp}`);
    console.log(`  ${log.level} | ${log.action}${taskInfo}`);
    if (log.taskId) console.log(`  TaskID: ${log.taskId}`);
    if (source) console.log(`  Source: ${source}`);
    if (log.details.error) console.log(`  ERROR: ${log.details.error}`);
    console.log();
  }
}

async function runAudit(sheets) {
  console.log('\n' + '='.repeat(60));
  console.log('AUDIT: Checking for sync issues');
  console.log('='.repeat(60) + '\n');

  if (!sheets) sheets = await getSheetsApi();

  const crews = await getCrewMappings(sheets);
  const issues = [];

  // Read master tasks
  const masterTable = await findTasksTable(sheets, MASTER_SPREADSHEET_ID, 'Master Tasks');
  if (!masterTable) {
    console.log('ERROR: Could not find Tasks table in Master Tasks');
    return;
  }

  const taskIdCol = masterTable.headerMap['TaskID'];
  const crewsCol = masterTable.headerMap['Crews'];
  const updatedAtCol = masterTable.headerMap['UpdatedAt'];

  console.log(`Master Tasks: ${masterTable.tasks.length} tasks\n`);

  // Check for duplicates in master
  const masterIds = {};
  for (const task of masterTable.tasks) {
    const id = task.values[taskIdCol];
    if (id) {
      if (masterIds[id]) {
        issues.push({ type: 'DUPLICATE_IN_MASTER', taskId: id, rows: [masterIds[id], task.sheetRow] });
      } else {
        masterIds[id] = task.sheetRow;
      }
    }
  }

  // Check each crew sheet
  for (const crew of crews) {
    const sheetName = `${crew.crewName} Crew`;
    console.log(`Checking ${sheetName}...`);

    try {
      const crewTable = await findTasksTable(sheets, crew.spreadsheetId, sheetName);
      if (!crewTable) {
        console.log(`  WARNING: Could not find Tasks table`);
        continue;
      }

      const crewTaskIdCol = crewTable.headerMap['TaskID'];
      const crewUpdatedAtCol = crewTable.headerMap['UpdatedAt'];

      console.log(`  ${crewTable.tasks.length} tasks`);

      // Check for duplicates in crew
      const crewIds = {};
      for (const task of crewTable.tasks) {
        const id = task.values[crewTaskIdCol];
        if (id) {
          if (crewIds[id]) {
            issues.push({ type: 'DUPLICATE_IN_CREW', crew: crew.crewName, taskId: id, rows: [crewIds[id], task.sheetRow] });
          } else {
            crewIds[id] = task.sheetRow;
          }
        }
      }

      // Check sync status
      let inSync = 0, outOfSync = 0, missingInMaster = 0;
      for (const crewTask of crewTable.tasks) {
        const id = crewTask.values[crewTaskIdCol];
        if (!id) continue;

        const masterRow = masterIds[id];
        if (!masterRow) {
          missingInMaster++;
          issues.push({ type: 'MISSING_IN_MASTER', crew: crew.crewName, taskId: id });
          continue;
        }

        // Find master task
        const masterTask = masterTable.tasks.find(t => t.values[taskIdCol] === id);
        if (masterTask) {
          const masterUpdated = masterTask.values[updatedAtCol];
          const crewUpdated = crewTask.values[crewUpdatedAtCol];
          if (masterUpdated === crewUpdated) {
            inSync++;
          } else {
            outOfSync++;
          }
        }
      }

      console.log(`  In sync: ${inSync}, Out of sync: ${outOfSync}, Missing in master: ${missingInMaster}`);
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('AUDIT SUMMARY');
  console.log('='.repeat(60));

  if (issues.length === 0) {
    console.log('No issues found!');
  } else {
    console.log(`Found ${issues.length} issue(s):\n`);
    for (const issue of issues) {
      if (issue.type === 'DUPLICATE_IN_MASTER') {
        console.log(`  DUPLICATE in Master: TaskID ${issue.taskId} in rows ${issue.rows.join(', ')}`);
      } else if (issue.type === 'DUPLICATE_IN_CREW') {
        console.log(`  DUPLICATE in ${issue.crew}: TaskID ${issue.taskId} in rows ${issue.rows.join(', ')}`);
      } else if (issue.type === 'MISSING_IN_MASTER') {
        console.log(`  MISSING in Master: TaskID ${issue.taskId} (found in ${issue.crew})`);
      }
    }
  }

  console.log('\n');
  return issues;
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'logs';

  switch (command) {
    case 'logs':
      await showRecentLogs(parseInt(args[1]) || 20);
      break;
    case 'verify':
      await verifySync(args[1]);
      break;
    case 'audit':
      await runAudit();
      break;
    default:
      console.log('Usage:');
      console.log('  node verify-sync.js logs [limit]     - Show recent sync logs');
      console.log('  node verify-sync.js verify [taskId]  - Verify a task is synced correctly');
      console.log('  node verify-sync.js audit            - Run full audit for issues');
  }
}

main().catch(console.error);
