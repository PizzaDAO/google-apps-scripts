const { getDriveApi, getSheetsApi } = require('./sheets-api');

const SOURCE_SHEET_ID = '1bRTR85CDHbTAsTG6sVi1jv6H-WjLyf-yvOerLCqeY2Q';

async function copyAndSetupSheet() {
  console.log('Copying pizza-chef sheet for agar.pizza...\n');

  try {
    const drive = await getDriveApi();
    const sheets = await getSheetsApi();

    // 1. Copy the spreadsheet
    console.log('1. Copying spreadsheet...');
    const copyResponse = await drive.files.copy({
      fileId: SOURCE_SHEET_ID,
      requestBody: {
        name: 'agar pizza',
      },
    });
    const newSheetId = copyResponse.data.id;
    console.log(`   ✓ Created new sheet: ${newSheetId}`);

    // 2. Make it public (anyone with link can edit)
    console.log('2. Making sheet public...');
    await drive.permissions.create({
      fileId: newSheetId,
      requestBody: {
        role: 'writer',
        type: 'anyone',
      },
    });
    console.log('   ✓ Sheet is now public (anyone with link can edit)');

    // 3. Get sheet info to find the tasks sheet
    console.log('3. Getting sheet structure...');
    const sheetInfo = await sheets.spreadsheets.get({
      spreadsheetId: newSheetId,
    });
    const sheetNames = sheetInfo.data.sheets.map(s => s.properties.title);
    console.log(`   Found sheets: ${sheetNames.join(', ')}`);

    // 4. Clear tasks from all relevant sheets (keep headers)
    console.log('4. Clearing tasks...');
    for (const sheetName of sheetNames) {
      // Try to clear rows 2 onwards (keeping header row)
      try {
        await sheets.spreadsheets.values.clear({
          spreadsheetId: newSheetId,
          range: `'${sheetName}'!A2:Z1000`,
        });
        console.log(`   ✓ Cleared ${sheetName}`);
      } catch (e) {
        console.log(`   - Skipped ${sheetName}: ${e.message}`);
      }
    }

    // 5. Output the URL
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${newSheetId}/edit`;
    console.log('\n✅ Done!\n');
    console.log(`Sheet URL: ${sheetUrl}`);
    console.log(`\nSheet ID: ${newSheetId}`);

    return { sheetId: newSheetId, sheetUrl };
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

copyAndSetupSheet();
