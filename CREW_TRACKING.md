# PizzaDAO Crew Tracking

Master list of all crew spreadsheets and their deployments.

## Crews Overview

| Crew | Spreadsheet | Apps Script | Local Clasp Folder | Status |
|------|-------------|-------------|-------------------|--------|
| **Ops** | [Sheet](https://docs.google.com/spreadsheets/d/1YVUJHWlyivugIWERa2qsaNGTQDN7Ogu1lIhATO8c6kU) | `1dgDCVpK8VpyCnITRW6dM2P0eZcqJtwu3vAs37PhsWXWgbyomOox08rL6` | `/tmp/ops-crew-script` | ✅ Deployed |
| **Comms** | [Sheet](https://docs.google.com/spreadsheets/d/1TGemZCKSBAC2-ENVHgkrRkQ0xf3pdsgy0u7MOq-IwW4) | (see .clasp.json) | `/tmp/comms-crew-script` | ✅ Deployed |
| **Creative** | [Sheet](https://docs.google.com/spreadsheets/d/1W5ESCefvjc7QxV_yrRoibfKIuQTtVZy9nnozx-RYIng) | (see .clasp.json) | `/tmp/new-crew-script` | ✅ Deployed |
| **Events** | [Sheet](https://docs.google.com/spreadsheets/d/1AVTWcd6Vij1Hi6n_K-f84-lL1BHwfKXUot-boAz--k4) | `1_t0Usd6aZHzELOQNbPXNqTjwHLgMxyUL8cUeH2VY8IVZ4cdfYeq8OJEj` | `/c/tmp/events-crew-script` | ✅ Deployed |

---

## Spreadsheet IDs (for API calls)

```javascript
const CREW_SPREADSHEET_IDS = {
  ops:      '1YVUJHWlyivugIWERa2qsaNGTQDN7Ogu1lIhATO8c6kU',
  comms:    '1TGemZCKSBAC2-ENVHgkrRkQ0xf3pdsgy0u7MOq-IwW4',
  creative: '1W5ESCefvjc7QxV_yrRoibfKIuQTtVZy9nnozx-RYIng',
  events:   '1AVTWcd6Vij1Hi6n_K-f84-lL1BHwfKXUot-boAz--k4'
};
```

---

## Web App URLs (fill in after deployment)

After deploying each crew as a web app (Step 3 in deployment guide):

- **Ops**: `_____________________________`
- **Comms**: `_____________________________`
- **Creative**: `_____________________________`
- **Events**: `_____________________________`

---

## Shared Configuration

### API Key (same for all crews)
```
fce433591b097407735b8396bd5400183bee1715090b17d2e263de99f28e8573
```

### Script Properties Required (each crew)
- ✅ `X_CONSUMER_KEY` - Twitter OAuth
- ✅ `X_CONSUMER_SECRET` - Twitter OAuth
- ✅ `X_ACCESS_TOKEN` - Twitter OAuth
- ✅ `X_ACCESS_TOKEN_SECRET` - Twitter OAuth
- ✅ `ANNOUNCE_PASSWORD` - Spreadsheet trigger password
- ✅ `BOT_API_KEY` - Discord bot API key
- ⏳ `WEB_API_KEY` - Website button API key (run `addWebApiKey()` to add)

---

## Deployment Workflow

### Push code updates to all crews:
```bash
# Update Ops
cd /tmp/ops-crew-script
cp "C:\Users\samgo\OneDrive\Documents\PizzaDAO\Code\google-apps-scripts\everything.gs" .
clasp push

# Update Comms
cd /tmp/comms-crew-script
cp "C:\Users\samgo\OneDrive\Documents\PizzaDAO\Code\google-apps-scripts\everything.gs" .
clasp push

# Update Creative
cd /tmp/new-crew-script
cp "C:\Users\samgo\OneDrive\Documents\PizzaDAO\Code\google-apps-scripts\everything.gs" .
clasp push

# Update Events
cd /c/tmp/events-crew-script
cp "C:\Users\samgo\OneDrive\Documents\PizzaDAO\Code\google-apps-scripts\everything.gs" .
clasp push
```

---

## Current Features

### Spreadsheet Trigger ("Send" cell)
- ✅ Password-protected
- ✅ Posts to Discord (general + band + crew channels)
- ✅ Sends tweet with GIF
- ✅ Starts Discord event (ends any existing event first)
- ✅ Takes attendance (immediate + 10-minute burst for 60 minutes)

### Website API Trigger (doPost endpoint)
- ✅ API key authentication
- ✅ Same functionality as spreadsheet trigger
- ⏳ Needs web app deployment per crew
- ⏳ Needs `WEB_API_KEY` Script Property added

---

## Lookup Sheets

### Crew Mappings
**Spreadsheet:** `19itGq86BRQTVehKhtRFKwK8gZqjsUQ_bG5cuVmem9HU`
- Maps crew names to Discord roles, turtles, event IDs
- Used by: `postCrewToDiscord()`, `startDiscordEvent()`

### Crew Webhooks
**Spreadsheet:** `1bSLN2mL1K-qr3nLiURVjhm31Zxn0J3ta1Pq0txlXsPI`
- Maps crew names to Discord webhook URLs
- Columns: Crew | Webhook
- Keys: "GENERAL", "BAND", crew names (Ops, Comms, Creative, Events)
- Used by: `postCrewToDiscord()`

### Muscle Roster
**Spreadsheet:** `1r94qiYMy2e-_FqWNiUVY5v9dWEzRR4H2Z82Cl6Vh7bY`
- Sheet: "Muscle Roster"
- Maps Muscle IDs to Discord tags
- Used by: `postCrewToDiscord()` for owner resolution

---

## Next Steps

1. ⏳ Run `addWebApiKey()` in each crew's Apps Script editor
2. ⏳ Deploy each crew as web app (Deploy > New deployment > Web app)
3. ⏳ Copy web app URLs and add to website config
4. ⏳ Test with curl before website integration
