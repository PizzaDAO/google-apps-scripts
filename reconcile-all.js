const { google } = require('googleapis');
const path = require('path');

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

  const MASTER_ID = '1hSzGYowH0qFmODYJF08vrcvfdcCycs7ztSALjTSDpYs';

  console.log('=== FULL RECONCILIATION ===\n');

  // Get crew mappings
  const mappings = await sheets.spreadsheets.values.get({
    spreadsheetId: MASTER_ID,
    range: 'Crew Mappings!A:G'
  });
  const mData = mappings.data.values;
  const crewNameCol = mData[0].indexOf('Crew');
  const urlCol = mData[0].indexOf('Sheet');

  const crews = [];
  for (let i = 1; i < mData.length; i++) {
    const name = mData[i][crewNameCol];
    const url = mData[i][urlCol];
    if (name && url) {
      const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (match) crews.push({ name, id: match[1] });
    }
  }
  console.log('Crews:', crews.map(c => c.name).join(', '));

  // Read Master Tasks
  const master = await sheets.spreadsheets.values.get({
    spreadsheetId: MASTER_ID,
    range: "'Master Tasks'!A1:Z500"
  });
  const masterData = master.data.values || [];

  let headerRow = -1;
  for (let r = 0; r < masterData.length; r++) {
    if (masterData[r] && masterData[r].includes('Task')) {
      headerRow = r;
      break;
    }
  }

  const headers = masterData[headerRow];
  const idCol = headers.indexOf('TaskID');
  const taskCol = headers.indexOf('Task');
  const crewsCol = headers.indexOf('Crews');

  // Build master task index
  const masterTasks = {};
  for (let r = headerRow + 1; r < masterData.length; r++) {
    const row = masterData[r];
    if (!row || !row[taskCol]) continue;
    const id = row[idCol];
    if (!id) continue;
    masterTasks[id] = {
      row: r + 1,
      data: row,
      crews: (row[crewsCol] || '').split(',').map(c => c.trim().toLowerCase()).filter(Boolean)
    };
  }

  console.log('Master has', Object.keys(masterTasks).length, 'tasks with IDs\n');

  // Process each crew sheet
  for (const crew of crews) {
    console.log('--- Processing', crew.name, '---');
    const crewKey = crew.name.toLowerCase();
    const crewSheetName = crew.name + ' Crew';

    try {
      // Get sheet metadata to find the correct sheet ID
      const metadata = await sheets.spreadsheets.get({
        spreadsheetId: crew.id
      });
      const sheetInfo = metadata.data.sheets.find(s => s.properties.title === crewSheetName);
      if (!sheetInfo) {
        console.log('  Sheet not found:', crewSheetName);
        continue;
      }
      const sheetId = sheetInfo.properties.sheetId;

      // Read crew data
      const crewResp = await sheets.spreadsheets.values.get({
        spreadsheetId: crew.id,
        range: `'${crewSheetName}'!A1:Z500`
      });
      const crewData = crewResp.data.values || [];

      let crewHeaderRow = -1;
      for (let r = 0; r < crewData.length; r++) {
        if (crewData[r] && crewData[r].includes('Task')) {
          crewHeaderRow = r;
          break;
        }
      }

      if (crewHeaderRow === -1) {
        console.log('  No Tasks table found');
        continue;
      }

      const crewHeaders = crewData[crewHeaderRow];
      const crewIdCol = crewHeaders.indexOf('TaskID');
      const crewTaskCol = crewHeaders.indexOf('Task');

      // Build crew task index
      const crewTasks = {};
      const rowsToDelete = [];

      for (let r = crewHeaderRow + 1; r < crewData.length; r++) {
        const row = crewData[r];
        if (!row || !row[crewTaskCol]) continue;
        const id = row[crewIdCol];

        if (!id) {
          console.log('  Row', r + 1, 'has no TaskID - will skip');
          continue;
        }

        // Check for duplicates
        if (crewTasks[id]) {
          console.log('  Duplicate TaskID at rows', crewTasks[id].row, 'and', r + 1, '- marking later one for delete');
          rowsToDelete.push(r); // 0-indexed
          continue;
        }

        // Check if this task should be in this crew
        const masterTask = masterTasks[id];
        if (!masterTask) {
          console.log('  Task ID', id, 'not in Master - marking for delete');
          rowsToDelete.push(r);
          continue;
        }

        if (!masterTask.crews.includes(crewKey)) {
          console.log('  Task "' + (row[crewTaskCol] || '').substring(0, 30) + '" should not be in', crew.name, '- marking for delete');
          rowsToDelete.push(r);
          continue;
        }

        crewTasks[id] = { row: r + 1, dataRowIndex: r };
      }

      // Delete rows that shouldn't be there (in reverse order to preserve indices)
      if (rowsToDelete.length > 0) {
        console.log('  Deleting', rowsToDelete.length, 'rows...');
        const requests = rowsToDelete
          .sort((a, b) => b - a) // Reverse order
          .map(r => ({
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: 'ROWS',
                startIndex: r,
                endIndex: r + 1
              }
            }
          }));

        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: crew.id,
          requestBody: { requests }
        });
      }

      // Re-read crew data after deletions
      const crewResp2 = await sheets.spreadsheets.values.get({
        spreadsheetId: crew.id,
        range: `'${crewSheetName}'!A1:Z500`
      });
      const crewData2 = crewResp2.data.values || [];

      // Rebuild crew task index after deletions
      const crewTasks2 = {};
      for (let r = crewHeaderRow + 1; r < crewData2.length; r++) {
        const row = crewData2[r];
        if (!row || !row[crewTaskCol]) continue;
        const id = row[crewIdCol];
        if (id) crewTasks2[id] = { row: r + 1 };
      }

      // Find tasks that should be added
      const tasksToAdd = [];
      for (const [id, masterTask] of Object.entries(masterTasks)) {
        if (masterTask.crews.includes(crewKey) && !crewTasks2[id]) {
          tasksToAdd.push(masterTask);
        }
      }

      if (tasksToAdd.length > 0) {
        console.log('  Adding', tasksToAdd.length, 'missing tasks...');

        // Build rows to add
        const rowsToAdd = tasksToAdd.map(t => {
          const newRow = [];
          for (const h of crewHeaders) {
            const masterIdx = headers.indexOf(h);
            newRow.push(masterIdx >= 0 ? (t.data[masterIdx] || '') : '');
          }
          return newRow;
        });

        // Append rows
        await sheets.spreadsheets.values.append({
          spreadsheetId: crew.id,
          range: `'${crewSheetName}'!A${crewHeaderRow + 2}`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: rowsToAdd }
        });
      }

      // Re-read again after additions
      const crewResp3 = await sheets.spreadsheets.values.get({
        spreadsheetId: crew.id,
        range: `'${crewSheetName}'!A1:Z500`
      });
      const crewData3 = crewResp3.data.values || [];

      // Build batch update for all existing tasks to match Master
      const batchData = [];
      let updatedCount = 0;

      for (let r = crewHeaderRow + 1; r < crewData3.length; r++) {
        const row = crewData3[r];
        if (!row || !row[crewTaskCol]) continue;
        const id = row[crewIdCol];
        if (!id) continue;

        const masterTask = masterTasks[id];
        if (!masterTask) continue;

        // Build the expected row from Master
        const expectedRow = [];
        for (const h of crewHeaders) {
          const masterIdx = headers.indexOf(h);
          expectedRow.push(masterIdx >= 0 ? (masterTask.data[masterIdx] || '') : '');
        }

        const lastCol = String.fromCharCode(65 + crewHeaders.length - 1);
        batchData.push({
          range: `'${crewSheetName}'!A${r + 1}:${lastCol}${r + 1}`,
          values: [expectedRow]
        });
        updatedCount++;
      }

      // Execute batch update
      if (batchData.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: crew.id,
          requestBody: {
            valueInputOption: 'RAW',
            data: batchData
          }
        });
      }

      console.log('  Updated', updatedCount, 'tasks to match Master');
      console.log('  Done!\n');

    } catch (err) {
      console.log('  Error:', err.message, '\n');
    }
  }

  console.log('=== RECONCILIATION COMPLETE ===');
}

main().catch(console.error);
