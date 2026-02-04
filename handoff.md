# Handoff Notes - Google Apps Scripts

## Session Summary (Feb 4, 2026)

### What Was Done

1. **Git Repository Setup**
   - Added comprehensive `.gitignore` to protect secrets
   - All scripts now tracked in git at `PizzaDAO/google-apps-scripts`
   - Secrets replaced with `YOUR_*_HERE` placeholders in all files

2. **Fixed Discord Task Links Bug**
   - **Problem**: Hyperlinks from task names weren't appearing in Discord posts
   - **Root Cause**: Code was reading rich text from column 2 (Stage) instead of column 3 (Task Name)
   - **Fix**: Changed `sheet.getRange(firstDataRowNumber, 2, ...)` to `sheet.getRange(firstDataRowNumber, 3, ...)`
   - **Files Fixed**:
     - `SecretService/DiscordWebhookService.gs` (main - used by ThinClient)
     - All `Wrappers/*/everything.js` and `.gs` files
     - `Comms/discord-webhooks.js`, `gas-pieces/discord-webhooks.js`

3. **Added Action Selector to CommunityCallHosting**
   - New checkbox dialog for selecting which actions to run
   - Can skip failing actions (Tweet, Discord Event) while running others

### Pending/Needs Attention

1. **CRITICAL: Rotate Exposed Credentials**
   - Secrets were briefly pushed to GitHub (commit reverted)
   - Must rotate immediately:
     - X/Twitter API keys (in X Developer Portal)
     - `BOT_API_KEY` (in Railway or wherever bot is hosted)
     - `ANNOUNCE_PASSWORD` (in all Script Properties)

2. **Twitter 401 Error**
   - Community Call Hosting gets 401 Unauthorized when tweeting
   - Likely expired/invalid credentials
   - Need to regenerate tokens in X Developer Portal and update Script Properties

3. **Discord Event Error**
   - Event ID `1462506828595200000` returns "Unknown Guild Scheduled Event"
   - Event may have been deleted/recreated in Discord
   - Need to find current event ID and update `CommunityCallHosting/X post.js`

4. **Deploy Updated SecretService**
   - The Discord link fix is in local files
   - Need to push to the SecretService Apps Script project via clasp

### Architecture Notes

- **ThinClient**: Lightweight client deployed to each crew sheet, calls SecretService via URL
- **SecretService**: Central service that handles all announcements, stores secrets
- **Wrappers**: Full code copies per crew (legacy, may not be in active use)
- **CommunityCallHosting**: Separate script for community calls, has its own triggers

### Key Files

| File | Purpose |
|------|---------|
| `SecretService/DiscordWebhookService.gs` | Discord posting logic (used by ThinClient) |
| `ThinClient/ThinClient.gs` | Lightweight client for crew sheets |
| `CommunityCallHosting/X post.js` | Twitter posting + action selector |
| `CommunityCallHosting/attendance.js` | Attendance tracking |

### Commands Reference

```bash
# Deploy SecretService
cd SecretService && clasp push

# Deploy ThinClient to a crew
cd ThinClient && clasp push

# Check Apps Script logs
clasp logs --json  # (requires GCP project setup)
```
