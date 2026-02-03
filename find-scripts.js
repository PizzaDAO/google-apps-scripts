const { google } = require('googleapis');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

async function getAuthClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/script.projects',
    ],
  });
  return auth.getClient();
}

async function findBoundScripts() {
  const authClient = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth: authClient });

  // Search for Apps Script files
  const response = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.script'",
    fields: 'files(id, name, parents)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  console.log('Apps Script projects found:');
  if (!response.data.files || response.data.files.length === 0) {
    console.log('  None found');
  } else {
    for (const file of response.data.files) {
      console.log('  Name:', file.name);
      console.log('  Script ID:', file.id);
      console.log('  Parents:', file.parents);
      console.log('');
    }
  }
}

findBoundScripts().catch(console.error);
