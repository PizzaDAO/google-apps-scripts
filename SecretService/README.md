# Secret Service

Centralized web app that holds all secrets and announcement logic for PizzaDAO crew sheets.

## Apps Script Project

- **Script ID:** `1LaJ-rKQoB1-9xh_uoaRQFjF81h1iMKZP4OutTIV-pTyhp5KDgOg16U8G`
- **Script URL:** https://script.google.com/d/1LaJ-rKQoB1-9xh_uoaRQFjF81h1iMKZP4OutTIV-pTyhp5KDgOg16U8G/edit
- **Web App URL:** https://script.google.com/macros/s/AKfycbzPzxSZkrq2xbiQfx3-FK6_M5Q8EwSVgTtlduaLAkUKb-tP5D2Q-2g8I8AYBOLzNf5_/exec
- **Owner:** hello@rarepizzas.com

## Architecture

```
┌─────────────────────┐                    ┌─────────────────────────────┐
│  Public Crew Sheet  │   HTTP POST        │      Secret Service         │
│  (Ops, Tech, etc.)  │ ─────────────────> │   (This Project)            │
│                     │  password +        │                             │
│  - ThinClient.gs    │  spreadsheetId +   │  - Holds ALL secrets        │
│  - Dialog.html      │  action + options  │  - ALL announcement logic   │
│                     │ <───────────────── │                             │
└─────────────────────┘   JSON result      └─────────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `Code.gs` | Main `doPost()` handler and action routing |
| `AuthService.gs` | Password validation with rate limiting |
| `Secrets.gs` | Script Properties accessors |
| `ConfigService.gs` | Loads crew/webhook mappings from spreadsheets |
| `TwitterService.gs` | OAuth 1.0a signing, media upload, tweet posting |
| `DriveService.gs` | GIF selection from Drive folders |
| `DiscordWebhookService.gs` | Webhook posting with task embeds |
| `DiscordEventService.gs` | Discord event start/end via bot API |
| `AttendanceService.gs` | Voice attendance tracking |

## Script Properties (Secrets)

Set these in Apps Script Editor → Project Settings → Script Properties:

| Property | Description |
|----------|-------------|
| `ANNOUNCE_PASSWORD` | Password for triggering announcements |
| `X_CONSUMER_KEY` | Twitter OAuth consumer key |
| `X_CONSUMER_SECRET` | Twitter OAuth consumer secret |
| `X_ACCESS_TOKEN` | Twitter OAuth access token |
| `X_ACCESS_TOKEN_SECRET` | Twitter OAuth access token secret |
| `BOT_API_KEY` | PizzaDAO Discord bot API key |

## API Endpoints

All requests are POST to the Web App URL with JSON body:

```json
{
  "password": "string",
  "spreadsheetId": "string",
  "action": "announce|tweet|discord|event|attendance|test",
  "options": {}
}
```

### Actions

- **`announce`** - Full workflow: event + tweet + discord + attendance
- **`tweet`** - Tweet only with crew GIF
- **`discord`** - Discord webhooks only
- **`event`** - Start Discord event only
- **`attendance`** - Take attendance only
- **`test`** - Validate all lookups without posting (no password required)

## Deployment

To redeploy after changes:

```bash
cd SecretService
clasp push --force
```

Then in Apps Script:
1. Deploy → Manage deployments
2. Edit the existing deployment
3. Select "New version"
4. Deploy

## Testing

From any crew sheet with ThinClient installed:
- **Announce menu → Test Connection (No Posts)**

Or run directly in Secret Service script editor:
- Run `testSecretService()` function

## Related Projects

- **ThinClient** (`../ThinClient/`) - Lightweight client for crew sheets
- **Wrappers** (`../Wrappers/`) - Individual crew sheet projects
