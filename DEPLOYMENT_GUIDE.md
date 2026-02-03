# Website Button Deployment Guide

## Overview
This guide walks you through deploying the web API endpoint and integrating it with your website.

## Step 1: Generate API Key

Generate a secure random API key to protect your endpoint:

**Using Password Generator (recommended):**
1. Use a password generator to create a 32+ character random string
2. Example: `vK9mP3xR7nQ2wL4jH8fT1yB6cE5zN0aS`

**Or use this command:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Save this key securely - you'll need it for both Apps Script and your website.

---

## Step 2: Deploy Web App for Each Crew Spreadsheet

**Repeat these steps for each crew:**
- Ops: https://docs.google.com/spreadsheets/d/1YVUJHWlyivugIWERa2qsaNGTQDN7Ogu1lIhATO8c6kU
- Comms: https://docs.google.com/spreadsheets/d/1TGemZCKSBAC2-ENVHgkrRkQ0xf3pdsgy0u7MOq-IwW4
- Creative: https://docs.google.com/spreadsheets/d/1W5ESCefvjc7QxV_yrRoibfKIuQTtVZy9nnozx-RYIng
- Events: https://docs.google.com/spreadsheets/d/1AVTWcd6Vij1Hi6n_K-f84-lL1BHwfKXUot-boAz--k4

### 2.1 Add API Key to Script Properties

1. Open the crew spreadsheet
2. **Extensions > Apps Script**
3. Click **Project Settings** (⚙️ gear icon) in left sidebar
4. Scroll to **Script Properties**
5. Click **Add script property**
   - **Property**: `WEB_API_KEY`
   - **Value**: Your generated API key (same for all crews)
6. Click **Save script properties**

### 2.2 Deploy as Web App

1. In Apps Script editor, click **Deploy** (top right) > **New deployment**
2. Click **Select type** (⚙️ gear icon) > **Web app**
3. Fill in the settings:
   - **Description**: "Crew Announcement API"
   - **Execute as**: **Me** (your account)
   - **Who has access**: **Anyone**
4. Click **Deploy**
5. **Authorize access** (first time only):
   - Click "Review permissions"
   - Select your Google account
   - Click "Advanced" > "Go to [Project Name] (unsafe)"
   - Click "Allow"
6. **Copy the Web App URL** - it will look like:
   ```
   https://script.google.com/macros/s/AKfycby.../exec
   ```
7. Save this URL for the website integration

**Repeat for all 4 crews** and note down each URL.

---

## Step 3: Test the API with curl

Before integrating with your website, test each endpoint:

```bash
# Ops Crew Test
curl -X POST 'YOUR_OPS_WEB_APP_URL' \
  -H 'Content-Type: application/json' \
  -d '{
    "apiKey": "YOUR_API_KEY",
    "spreadsheetId": "1YVUJHWlyivugIWERa2qsaNGTQDN7Ogu1lIhATO8c6kU"
  }'

# Expected response:
# {
#   "success": true,
#   "message": "Announcement triggered successfully",
#   "tweetUrl": "https://x.com/i/web/status/...",
#   "timestamp": "2026-01-12T..."
# }
```

**Verify in Discord:**
- ✅ General channel: Announcement with ping
- ✅ Band channel: !band command
- ✅ Crew channel: Task embeds

**Verify in Spreadsheet:**
- ✅ "Last Sent:" timestamp updated
- ✅ Attendance tracking started

---

## Step 4: Integrate with Website

### Option A: Using the HTML Template

1. Copy `website-button-integration.html` to your website
2. Update the configuration:
   ```javascript
   const CREW_CONFIG = {
     ops: {
       spreadsheetId: '1YVUJHWlyivugIWERa2qsaNGTQDN7Ogu1lIhATO8c6kU',
       apiUrl: 'YOUR_OPS_WEB_APP_URL'  // From Step 2.2
     },
     comms: {
       spreadsheetId: '1TGemZCKSBAC2-ENVHgkrRkQ0xf3pdsgy0u7MOq-IwW4',
       apiUrl: 'YOUR_COMMS_WEB_APP_URL'
     },
     creative: {
       spreadsheetId: '1W5ESCefvjc7QxV_yrRoibfKIuQTtVZy9nnozx-RYIng',
       apiUrl: 'YOUR_CREATIVE_WEB_APP_URL'
     },
     events: {
       spreadsheetId: '1AVTWcd6Vij1Hi6n_K-f84-lL1BHwfKXUot-boAz--k4',
       apiUrl: 'YOUR_EVENTS_WEB_APP_URL'
     }
   };

   const API_KEY = 'YOUR_API_KEY';  // ⚠️ Store securely!
   ```

3. Customize the `getCurrentCrew()` function based on your site structure

### Option B: Custom Integration

**Minimal example:**
```javascript
async function announceCrewCall(crewName) {
  const config = {
    ops: {
      url: 'YOUR_OPS_URL',
      id: '1YVUJHWlyivugIWERa2qsaNGTQDN7Ogu1lIhATO8c6kU'
    },
    // ... other crews
  };

  const crew = config[crewName];

  const response = await fetch(crew.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: 'YOUR_API_KEY',
      spreadsheetId: crew.id
    })
  });

  return await response.json();
}
```

---

## Step 5: Security Best Practices

### ⚠️ API Key Security

**DO NOT** hardcode the API key in client-side JavaScript!

**Instead:**

1. **Server-side proxy (recommended):**
   ```javascript
   // Frontend makes request to your server
   fetch('/api/announce-crew', {
     method: 'POST',
     body: JSON.stringify({ crew: 'ops' })
   });

   // Server-side endpoint (Node.js example)
   app.post('/api/announce-crew', async (req, res) => {
     // API key stored in environment variables
     const apiKey = process.env.CREW_ANNOUNCEMENT_API_KEY;

     const result = await fetch(crewWebAppUrl, {
       method: 'POST',
       body: JSON.stringify({
         apiKey: apiKey,
         spreadsheetId: crewSpreadsheetId
       })
     });

     res.json(await result.json());
   });
   ```

2. **Environment variables:**
   ```javascript
   // If using a framework like Next.js
   const API_KEY = process.env.NEXT_PUBLIC_CREW_API_KEY;
   ```

### 🔒 Additional Security

**Rate Limiting (optional):**
Add this to the `doPost()` function in Apps Script:

```javascript
// At the top of doPost()
const props = PropertiesService.getScriptProperties();
const lastRun = props.getProperty('LAST_ANNOUNCEMENT_TIME');
const now = Date.now();

// Prevent more than 1 announcement per hour
if (lastRun && (now - parseInt(lastRun)) < 3600000) {
  return ContentService.createTextOutput(JSON.stringify({
    success: false,
    error: 'Rate limit: Please wait at least 1 hour between announcements'
  })).setMimeType(ContentService.MimeType.JSON);
}

props.setProperty('LAST_ANNOUNCEMENT_TIME', String(now));
```

---

## Configuration Summary

### Spreadsheet IDs
- **Ops**: `1YVUJHWlyivugIWERa2qsaNGTQDN7Ogu1lIhATO8c6kU`
- **Comms**: `1TGemZCKSBAC2-ENVHgkrRkQ0xf3pdsgy0u7MOq-IwW4`
- **Creative**: `1W5ESCefvjc7QxV_yrRoibfKIuQTtVZy9nnozx-RYIng`
- **Events**: `1AVTWcd6Vij1Hi6n_K-f84-lL1BHwfKXUot-boAz--k4`

### Web App URLs (to be filled in after Step 2.2)
- **Ops**: `_____________________________`
- **Comms**: `_____________________________`
- **Creative**: `_____________________________`
- **Events**: `_____________________________`

### API Key
- Same key for all crews: `_____________________________`

---

## Troubleshooting

### Error: "Unauthorized: Invalid API key"
- Check that `WEB_API_KEY` is set in Script Properties
- Verify the API key matches exactly (no extra spaces)

### Error: "Missing spreadsheetId parameter"
- Check the request body includes `spreadsheetId`
- Verify the spreadsheet ID is correct

### Error: "Exception: Spreadsheet not found"
- Verify the spreadsheet ID is correct
- Ensure your Google account has access to the spreadsheet

### No Discord posts
- Check the execution logs in Apps Script (Executions tab)
- Verify crew is configured in Crew Mappings sheet
- Check webhook URLs in Crew Webhooks sheet

### Spreadsheet trigger stopped working
- Don't worry! The refactoring is 100% backward compatible
- The existing "Send" cell trigger should still work
- If not, try running `setupOnEditSendAllTrigger()` again

---

## Support

If you need help:
1. Check Apps Script execution logs: **Executions** tab (clock icon)
2. Test with curl first before website integration
3. Verify all Script Properties are set correctly
