const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const OAUTH_CREDENTIALS_PATH = path.join(__dirname, 'oauth-credentials.json');
const TOKEN_PATH = path.join(__dirname, 'oauth-token.json');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
];

/**
 * Get OAuth2 client - either from saved token or by prompting user
 */
async function getOAuthClient() {
  // Check for OAuth credentials
  if (!fs.existsSync(OAUTH_CREDENTIALS_PATH)) {
    console.log('\n❌ OAuth credentials not found!\n');
    console.log('Please create OAuth 2.0 credentials:');
    console.log('1. Go to: https://console.cloud.google.com/apis/credentials?project=pizzadao-scripts');
    console.log('2. Click "Create Credentials" → "OAuth client ID"');
    console.log('3. Select "Desktop app" as application type');
    console.log('4. Name it "PizzaDAO CLI"');
    console.log('5. Download the JSON and save it as:');
    console.log(`   ${OAUTH_CREDENTIALS_PATH}\n`);
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(OAUTH_CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret } = credentials.installed || credentials.web;

  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    'http://localhost:3939/oauth2callback'
  );

  // Check for saved token
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oauth2Client.setCredentials(token);

    // Check if token is expired
    if (token.expiry_date && token.expiry_date < Date.now()) {
      console.log('Token expired, refreshing...');
      const { credentials: newCreds } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(newCreds);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(newCreds, null, 2));
      console.log('Token refreshed and saved.\n');
    } else {
      console.log('Using saved OAuth token.\n');
    }

    return oauth2Client;
  }

  // Need to authenticate
  console.log('No saved token found. Starting OAuth flow...\n');
  return await authenticateUser(oauth2Client);
}

/**
 * Start OAuth flow and get user consent
 */
async function authenticateUser(oauth2Client) {
  return new Promise((resolve, reject) => {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });

    console.log('Opening browser for authentication...');
    console.log('If browser doesn\'t open, visit this URL:\n');
    console.log(authUrl + '\n');

    // Create local server to receive callback
    const server = http.createServer(async (req, res) => {
      try {
        const queryParams = url.parse(req.url, true).query;

        if (queryParams.code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>✅ Authentication successful!</h1><p>You can close this window.</p></body></html>');

          server.close();

          // Exchange code for tokens
          const { tokens } = await oauth2Client.getToken(queryParams.code);
          oauth2Client.setCredentials(tokens);

          // Save token
          fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
          console.log('\n✅ Authentication successful! Token saved.\n');

          resolve(oauth2Client);
        }
      } catch (error) {
        res.writeHead(500);
        res.end('Authentication failed');
        reject(error);
      }
    });

    server.listen(3939, () => {
      // Open browser (Windows)
      exec(`start "" "${authUrl}"`, (err) => {
        if (err) console.log('Could not open browser automatically.');
      });
    });
  });
}

/**
 * Get authenticated Drive API
 */
async function getOAuthDriveApi() {
  const auth = await getOAuthClient();
  return google.drive({ version: 'v3', auth });
}

/**
 * Get authenticated Sheets API
 */
async function getOAuthSheetsApi() {
  const auth = await getOAuthClient();
  return google.sheets({ version: 'v4', auth });
}

// Export for use in other scripts
module.exports = {
  getOAuthClient,
  getOAuthDriveApi,
  getOAuthSheetsApi,
  TOKEN_PATH,
  OAUTH_CREDENTIALS_PATH,
};

// If run directly, test the authentication
if (require.main === module) {
  (async () => {
    try {
      const auth = await getOAuthClient();
      const drive = google.drive({ version: 'v3', auth });

      const about = await drive.about.get({ fields: 'user,storageQuota' });
      console.log('Authenticated as:', about.data.user.emailAddress);

      const quota = about.data.storageQuota;
      if (quota && quota.limit) {
        const usedGB = (parseInt(quota.usage) / 1024 / 1024 / 1024).toFixed(2);
        const limitGB = (parseInt(quota.limit) / 1024 / 1024 / 1024).toFixed(2);
        console.log(`Storage: ${usedGB} GB / ${limitGB} GB`);
      }

      console.log('\n✅ OAuth setup complete! You can now run copy-sheet-oauth.js');
    } catch (error) {
      console.error('Error:', error.message);
    }
  })();
}
