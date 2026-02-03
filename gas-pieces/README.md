# gas-pieces - PizzaDAO Crew Announcement System

Modular Google Apps Script code for crew call announcements. This package handles Discord events, Twitter posts, Discord webhook messages, and attendance tracking.

## Overview

When a user types "Send" next to the "Announce?" label in a crew spreadsheet, this system:
1. Shows a dialog with password field and 6 action checkboxes
2. On correct password, runs the selected actions
3. Marks the cell as "Sent" and timestamps it

## File Structure

| File | Purpose |
|------|---------|
| `config.js` | Central configuration constants |
| `secrets.js` | Lazy-loaded credential getters from Script Properties |
| `triggers.js` | Main `sendAll()` trigger and `handleSendActions()` dialog handler |
| `dialog.html` | HTML dialog with password + action checkboxes |
| `discord-events.js` | Start/end Discord scheduled events via bot API |
| `discord-webhooks.js` | Post to Discord channels via webhooks |
| `twitter.js` | OAuth 1.0a signing, media upload, tweet posting |
| `drive.js` | Random GIF selection from Drive folders |
| `attendance.js` | Voice attendance tracking and burst scheduling |
| `menu.js` | Custom menu, sheet copy utility, `doPost()` web endpoint |
| `utils.js` | Shared helper functions |
| `appsscript.json` | Apps Script manifest (timezone, dependencies) |

## Actions (Selectable via Checkboxes)

| Action | Function | Description |
|--------|----------|-------------|
| Start Discord Event | `startDiscordEvent()` | Starts the crew's scheduled Discord event |
| Send Tweet | `sendCrewTweet()` | Posts tweet with crew emoji + random GIF |
| Post to General | `postCrewToDiscord()` | Posts announcement to #general channel |
| Post !band | `postCrewToDiscord()` | Sends !band command to trigger band bot |
| Post to Crew Channel | `postCrewToDiscord()` | Posts task embeds to crew-specific channel |
| Take Attendance | `takeAttendanceNowAndScheduleBurst()` | Records voice attendance, schedules 6 more checks |

## Required Script Properties

Set these in Apps Script > Project Settings > Script Properties:

| Property | Description |
|----------|-------------|
| `ANNOUNCE_PASSWORD` | Password to authorize announcements |
| `BOT_API_KEY` | API key for PizzaDAO Discord bot |
| `X_CONSUMER_KEY` | Twitter OAuth 1.0a consumer key |
| `X_CONSUMER_SECRET` | Twitter OAuth 1.0a consumer secret |
| `X_ACCESS_TOKEN` | Twitter OAuth 1.0a access token |
| `X_ACCESS_TOKEN_SECRET` | Twitter OAuth 1.0a access token secret |

Optional:
| Property | Description |
|----------|-------------|
| `DEFAULT_CHANNEL_WEBHOOK_URL` | Fallback webhook if crew-specific not found |
| `WEB_API_KEY` | API key for `doPost()` web endpoint |

## External Dependencies

### Spreadsheets
- **Crew Webhooks** (`1bSLN2mL1K-qr3nLiURVjhm31Zxn0J3ta1Pq0txlXsPI`) - Maps crew names to Discord webhook URLs
- **Crew Mappings** (`19itGq86BRQTVehKhtRFKwK8gZqjsUQ_bG5cuVmem9HU`) - Maps crews to emojis, event IDs, role tags
- **Template Spreadsheet** (`1mzh9FXF4jiJOcL_45uxtLuohp5hIPbT006AAVZ_zT3U`) - Template for new task sheets

### Drive
- **GIF Folder** (`1DgzVx8aL6PgPm0-Np9gQMPywUEBVBxuA`) - Contains crew subfolders with GIFs for tweets

### Bot API
- **Base URL**: `https://pizzadao-discord-bot-production.up.railway.app`
- Endpoints: `/start-event-by-id`, `/end-active-events`, `/get-active-event`, `/voice-attendance`

## Deployment

### Option 1: Deploy as Single File
Concatenate all `.js` files into one `everything.js` and push via clasp.

### Option 2: Deploy as Modules
Push all files directly - Apps Script will load them in alphabetical order.

### Setup Steps
1. Push code to the crew's Apps Script project
2. Set all required Script Properties
3. Create an **installable** onEdit trigger for `sendAll`:
   - Apps Script > Triggers > Add Trigger
   - Function: `sendAll`
   - Event source: From spreadsheet
   - Event type: On edit

## Web API Endpoint

`doPost()` in `menu.js` allows triggering announcements via HTTP POST:

```javascript
POST /exec?apiKey=YOUR_WEB_API_KEY
Content-Type: application/json

{
  "spreadsheetId": "CREW_SPREADSHEET_ID"
}
```

Returns: `{ success: true, tweetUrl: "...", timestamp: "..." }`

## Not Included

This package does NOT include:
- **TaskSyncWrapper** - Separate system for task synchronization between sheets
- **Telegram integration** - Only in CommunityCallHosting script
- **Cell-based messaging** - Only in CommunityCallHosting script

## Security Notes

- Never commit secrets to git
- Use `getSecret_()` and `getSecretOptional_()` for credential access
- Delete `temp-set-secrets.js` after initial setup (contains hardcoded values)
- Webhook URLs are stored in a separate spreadsheet, not in code
