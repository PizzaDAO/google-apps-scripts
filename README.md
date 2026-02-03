# PizzaDAO Crew Announcement System

A centralized Google Apps Script system for announcing PizzaDAO crew calls across Discord and Twitter.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Crew Spreadsheets                        │
│  (Ops, Comms, Creative, Events)                                 │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ ThinClient  │  │ ThinClient  │  │ ThinClient  │  ...        │
│  │  (no secrets)│  │  (no secrets)│  │  (no secrets)│            │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          │    HTTPS POST (password + spreadsheetId + action)
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Secret Service                            │
│                    (Deployed Web App)                           │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  - All API keys & secrets stored here                   │   │
│  │  - Twitter OAuth credentials                            │   │
│  │  - Discord bot API key                                  │   │
│  │  - Webhook URLs                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Services:                                                      │
│  ├── ConfigService.gs      - Crew mappings, webhooks, roster   │
│  ├── DiscordWebhookService.gs - Post to Discord channels       │
│  ├── DiscordEventService.gs   - Start/end Discord events       │
│  ├── TwitterService.gs        - Send tweets with GIFs          │
│  ├── AttendanceService.gs     - Voice channel attendance       │
│  └── AuthService.gs           - Password & spreadsheet validation│
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      External Services                          │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐          │
│  │ Discord  │  │ Twitter  │  │ PizzaDAO Discord Bot │          │
│  │ Webhooks │  │   API    │  │   (Railway)          │          │
│  └──────────┘  └──────────┘  └──────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### Secret Service (`SecretService/`)

The central web app that handles all announcements. Contains all secrets and API credentials.

**Files:**
- `Code.gs` - Main entry point, request routing
- `ConfigService.gs` - Loads crew mappings, webhooks, muscle roster
- `DiscordWebhookService.gs` - Posts embeds to Discord channels
- `DiscordEventService.gs` - Starts/ends Discord scheduled events
- `TwitterService.gs` - Sends tweets with random GIFs
- `AttendanceService.gs` - Tracks voice channel attendance
- `AuthService.gs` - Password validation, spreadsheet allowlist
- `Secrets.gs` - Secret retrieval functions
- `DriveService.gs` - GIF folder access

**Deployment:**
```bash
cd SecretService
npx clasp push -f
# Then deploy as web app in Apps Script editor
```

### Thin Client (`ThinClient/`)

Lightweight client deployed to each crew spreadsheet. Contains no secrets - only calls the Secret Service.

**Files:**
- `ThinClient.gs` - Menu creation, dialog handlers, service calls
- `Dialog.html` - Announcement dialog UI
- `appsscript.json` - Manifest with required OAuth scopes

**Features:**
- "Announce" menu with options:
  - Send Announcement (full workflow)
  - Tweet Only
  - Discord Only
  - Start Event Only
  - Take Attendance
  - Test Connection (No Posts)

## Configuration Spreadsheets

### Crew Mappings
**ID:** `19itGq86BRQTVehKhtRFKwK8gZqjsUQ_bG5cuVmem9HU`

Maps crew names to Discord roles, turtle tags, event IDs, etc.

| Column | Purpose |
|--------|---------|
| Crew | Crew name (Ops, Comms, Creative, Events) |
| Turtles | Turtle roles to ping (Leo, Raph, etc.) |
| Role | Discord role tag for crew channel |
| Channel | Discord channel ID |
| Event | Discord scheduled event ID |
| Emoji | Crew emoji |
| Sheet | Spreadsheet name pattern for matching |

### Crew Webhooks
**ID:** `1bSLN2mL1K-qr3nLiURVjhm31Zxn0J3ta1Pq0txlXsPI`

Maps crew names to Discord webhook URLs.

| Key | Webhook |
|-----|---------|
| GENERAL | General channel webhook |
| BAND | Band bot channel webhook |
| Ops | Ops crew channel webhook |
| Comms | Comms crew channel webhook |
| Creative | Creative crew channel webhook |
| Events | Events crew channel webhook |

### Muscle Roster
**ID:** `16BBOfasVwz8L6fPMungz_Y0EfF6Z9puskLAix3tCHzM`

Maps member IDs to Discord IDs and names. Header row is 12.

| Column | Purpose |
|--------|---------|
| Muscle ID | Member's internal ID |
| Name | Member's display name |
| Discord | Discord user ID (for mentions) |

## Announcement Workflow

When "Send Announcement" is triggered:

1. **Start Discord Event** - Ends any active event, starts the crew's scheduled event
2. **Send Tweet** - Posts tweet with random GIF from crew's Drive folder
3. **Post to Discord**:
   - General channel: "@PizzaDAO [Crew] starts now!"
   - Band channel: "!band" command
   - Crew channel: Task embeds with top/high priority items
4. **Take Attendance** - Records voice channel members, schedules burst checks

## Task Display Logic

Tasks are pulled from the crew spreadsheet and displayed in Discord embeds:

- **Priority filtering:** Only "0. Top" and "1. High" priority tasks shown
- **Stage filtering:** Excludes "Complete", "Skipped", "Done", "Skip", "Stuck", "Later"
- **Owner resolution:**
  1. If member has Discord ID in Muscle Roster → `<@discordId>` mention
  2. Else if member has name in Muscle Roster → display name
  3. Else → "Unassigned"

## Deploying to a New Crew

1. **Create the crew spreadsheet** with tasks section

2. **Add crew to configuration spreadsheets:**
   - Add row to Crew Mappings
   - Add webhook to Crew Webhooks
   - Create GIF folder in Drive

3. **Deploy ThinClient:**
   ```bash
   # Create deployment directory
   mkdir deployments/newcrew

   # Create .clasp.json pointing to ThinClient
   # (Get script ID from spreadsheet: Extensions > Apps Script > Project Settings)
   echo '{"scriptId": "YOUR_SCRIPT_ID", "rootDir": "../../ThinClient"}' > deployments/newcrew/.clasp.json

   # Push from the deployment directory
   cd deployments/newcrew
   npx clasp push -f
   ```

4. **Authorize the script:**
   - Open Apps Script editor
   - Run `onOpen` function
   - Authorize when prompted

5. **Test:**
   - Refresh spreadsheet
   - Use "Announce > Test Connection (No Posts)"

## Secret Service Secrets

Stored in Script Properties of the Secret Service project:

| Key | Purpose |
|-----|---------|
| `ANNOUNCE_PASSWORD` | Password for announcements |
| `X_CONSUMER_KEY` | Twitter API consumer key |
| `X_CONSUMER_SECRET` | Twitter API consumer secret |
| `X_ACCESS_TOKEN` | Twitter API access token |
| `X_ACCESS_TOKEN_SECRET` | Twitter API access token secret |
| `BOT_API_KEY` | PizzaDAO Discord bot API key |
| `DEFAULT_CHANNEL_WEBHOOK_URL` | Fallback webhook URL |

## Crew Script IDs

All crew Apps Script IDs for ThinClient deployment:

| Crew | Script ID |
|------|-----------|
| Ops | `1BL1_04yfc7St02zu_XA6s1scSZzdko69scru7axDg_CKZZIrIpHWXrd0` |
| Comms | `15YPn7i6Y6QAWKLmcS5HiFF47A3z6EESEcg5hXhAaB_YrOQCKopanJ9vB` |
| Creative | `11lDzGzITNY5bdTEyht4QZCG7v6TKRjB0TWbvKpm1fYOpj6HnoM5Qmluc` |
| Events | `1_t0Usd6aZHzELOQNbPXNqTjwHLgMxyUL8cUeH2VY8IVZ4cdfYeq8OJEj` |
| BizDev | `1NliKo-Y0vkvwxVXpGmFKGnjRy2V4UT1xsOtYyXYg8JlV9-K4OvDEZetE` |
| Education | `1gbmINUSCmcKwmuCBN6FLpNAL428nbP53SKPPr-QHn2X_miUg6oXxiRtv` |
| Tech | `1ohPBIXlzwH2ZeI9dwj9jdrf6kHioJ8WVTPo7VIRDs94kJD7v5_JHRfIb` |
| Africa | `1pZEwgNcNVALY0SsnkpJ8tK3rHbjQw9wI-RnWx7AmLdYt6Hyfa32qrUmb` |
| Music | `1qTqw3eu3yMz2mrZxP8I2uOcfC8QTttPKNbUyyC7gf9PT_7W--Ng0YYRM` |

## Local Development

### Prerequisites
- Node.js
- clasp (`npm install -g @google/clasp`)
- Authenticated with Google (`clasp login`)

### Push Changes

**Secret Service:**
```bash
cd SecretService
npx clasp push -f
```

**ThinClient to specific crew:**
```bash
cd deployments/events  # or bizdev, education, ops, etc.
npx clasp push -f
```

**ThinClient to all crews:**
```bash
for crew in ops comms creative events bizdev education tech africa music; do
  echo "Pushing to $crew..."
  cd deployments/$crew && npx clasp push -f && cd ../..
done
```

## Troubleshooting

### "No menu appears"
- Refresh the spreadsheet
- Run `onOpen` manually from Apps Script editor
- Check for authorization prompts

### "Permission denied" errors
- Ensure `appsscript.json` includes required OAuth scopes:
  - `https://www.googleapis.com/auth/spreadsheets`
  - `https://www.googleapis.com/auth/script.external_request`
  - `https://www.googleapis.com/auth/script.container.ui`

### "Invalid password"
- Check the password matches `ANNOUNCE_PASSWORD` in Secret Service

### "Unknown spreadsheet"
- Add spreadsheet ID to `KNOWN_SPREADSHEET_IDS` in `AuthService.gs`

### Task owners showing as IDs instead of names
- Ensure member is in Muscle Roster with Discord ID or Name
- Check Muscle ID in crew spreadsheet matches roster
