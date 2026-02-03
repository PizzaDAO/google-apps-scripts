const { getDriveApi } = require('./sheets-api');

async function checkDriveStorage() {
  console.log('Checking service account Drive storage...\n');

  try {
    const drive = await getDriveApi();

    // Get storage quota
    console.log('=== STORAGE QUOTA ===');
    const about = await drive.about.get({
      fields: 'storageQuota,user',
    });

    const quota = about.data.storageQuota;
    const user = about.data.user;

    console.log(`User: ${user.emailAddress}`);
    console.log(`Display Name: ${user.displayName || 'N/A'}`);

    if (quota) {
      const limitGB = quota.limit ? (parseInt(quota.limit) / 1024 / 1024 / 1024).toFixed(2) : 'Unlimited';
      const usageGB = (parseInt(quota.usage || 0) / 1024 / 1024 / 1024).toFixed(2);
      const usageInDriveGB = (parseInt(quota.usageInDrive || 0) / 1024 / 1024 / 1024).toFixed(2);
      const usageInTrashGB = (parseInt(quota.usageInDriveTrash || 0) / 1024 / 1024 / 1024).toFixed(2);

      console.log(`\nStorage Limit: ${limitGB} GB`);
      console.log(`Total Usage: ${usageGB} GB`);
      console.log(`Usage in Drive: ${usageInDriveGB} GB`);
      console.log(`Usage in Trash: ${usageInTrashGB} GB`);

      if (quota.limit) {
        const percentUsed = (parseInt(quota.usage) / parseInt(quota.limit) * 100).toFixed(1);
        console.log(`Percent Used: ${percentUsed}%`);
      }
    }

    // List all files owned by the service account
    console.log('\n\n=== FILES OWNED BY SERVICE ACCOUNT ===');

    let allFiles = [];
    let pageToken = null;

    do {
      const response = await drive.files.list({
        q: "'me' in owners",
        fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, trashed)',
        pageSize: 1000,
        pageToken: pageToken,
      });

      allFiles = allFiles.concat(response.data.files || []);
      pageToken = response.data.nextPageToken;
    } while (pageToken);

    console.log(`\nTotal files: ${allFiles.length}`);

    // Separate trashed and active files
    const trashedFiles = allFiles.filter(f => f.trashed);
    const activeFiles = allFiles.filter(f => !f.trashed);

    console.log(`Active files: ${activeFiles.length}`);
    console.log(`Trashed files: ${trashedFiles.length}`);

    // Group by mime type
    const byType = {};
    for (const file of allFiles) {
      const type = file.mimeType || 'unknown';
      if (!byType[type]) byType[type] = [];
      byType[type].push(file);
    }

    console.log('\n--- Files by Type ---');
    for (const [type, files] of Object.entries(byType).sort((a, b) => b[1].length - a[1].length)) {
      const totalSize = files.reduce((sum, f) => sum + parseInt(f.size || 0), 0);
      const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
      console.log(`${type}: ${files.length} files (${sizeMB} MB)`);
    }

    // List all files with details
    console.log('\n\n--- All Files (sorted by size) ---');
    const sortedFiles = allFiles.sort((a, b) => parseInt(b.size || 0) - parseInt(a.size || 0));

    for (const file of sortedFiles.slice(0, 50)) { // Top 50 by size
      const sizeMB = (parseInt(file.size || 0) / 1024 / 1024).toFixed(2);
      const status = file.trashed ? '[TRASH]' : '';
      const created = file.createdTime ? new Date(file.createdTime).toLocaleDateString() : 'N/A';
      console.log(`${status} ${sizeMB} MB - ${file.name} (${file.mimeType}) - Created: ${created}`);
      console.log(`   ID: ${file.id}`);
    }

    if (sortedFiles.length > 50) {
      console.log(`\n... and ${sortedFiles.length - 50} more files`);
    }

    // Summary recommendations
    console.log('\n\n=== RECOMMENDATIONS ===');
    if (trashedFiles.length > 0) {
      const trashSize = trashedFiles.reduce((sum, f) => sum + parseInt(f.size || 0), 0);
      const trashSizeMB = (trashSize / 1024 / 1024).toFixed(2);
      console.log(`1. Empty trash to recover ${trashSizeMB} MB (${trashedFiles.length} files)`);
    }

    // Find Google Sheets (they don't count toward quota but copies might)
    const spreadsheets = allFiles.filter(f => f.mimeType === 'application/vnd.google-apps.spreadsheet');
    if (spreadsheets.length > 0) {
      console.log(`2. Found ${spreadsheets.length} spreadsheets (Google Sheets don't count toward quota)`);
    }

    return { quota, files: allFiles };
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

checkDriveStorage();
