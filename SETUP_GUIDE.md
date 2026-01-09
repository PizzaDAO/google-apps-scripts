# TaskSync Library Setup Guide

## Overview
- 1 library project (TaskSyncLib)
- 18 spreadsheets with wrapper code (1 master + 17 crews)
- ~40 minutes total

---

## PHASE 1: Library Already Created ✓

Library ID (already deployed):
```
AKfycbzsIBfQQGAlwrppWDiRzc3kjn1qKKWkR8UNEbD95zSkoUVgV04Lu2FkdfrnarwJGTBi
```

This ID is embedded in `TaskSyncWrapper.gs` - just copy-paste the wrapper code.

---

## PHASE 2: Set Up Master First (3 min)

1. Open the master spreadsheet
2. **Extensions** → **Apps Script**
3. Delete ALL existing code
4. Paste contents of `TaskSyncWrapper.gs`
5. Also paste contents of `SetupHelper.gs` (for helper functions)
6. In left sidebar, click **+** next to **Libraries**
7. Paste your Deployment ID → **Look up** → Select version → **Add**
8. In toolbar dropdown, select **setupTrigger** → click **▶ Run**
9. Click through authorization prompts

**Test it:** Run `testSync` - should say "Library is connected!"

---

## PHASE 3: Set Up All Crew Sheets (2 min each × 17)

From master's Apps Script, run `listAllSpreadsheetUrls` to get your checklist.

For each crew spreadsheet:

```
[ ] 1. Open spreadsheet
[ ] 2. Extensions → Apps Script
[ ] 3. Delete all existing code
[ ] 4. Paste TaskSyncWrapper.gs
[ ] 5. Libraries (+) → Paste ID → Look up → Add
[ ] 6. Select setupTrigger → Run
[ ] 7. Authorize
```

**Pro tip:** Open 3-4 spreadsheets in tabs, set them up in parallel while waiting for authorization prompts.

---

## PHASE 4: Verify (2 min)

From master's Apps Script, run `verifySetup` to check all connections.

---

## Quick Reference

| File | Where it goes |
|------|---------------|
| `TaskSyncLib.gs` | Standalone project (deployed as library) |
| `TaskSyncWrapper.gs` | Every spreadsheet (master + 17 crews) |
| `SetupHelper.gs` | Master only (optional helper functions) |

---

## Troubleshooting

**"TaskSyncLib is not defined"**
→ Library not added. Click + next to Libraries, paste ID.

**"You do not have permission"**
→ Run `setupTrigger` again and complete authorization.

**"Cannot read property of undefined"**
→ Check that library identifier is exactly `TaskSyncLib` (case-sensitive).

**Changes not syncing**
→ Run `listTriggers` to verify onEditTrigger exists.
→ Check Executions log for errors.

---

## After Setup

- **Bootstrap:** Run from master menu: Task Sync → Bootstrap
- **Validate:** Task Sync → Validate setup
- **Force sync:** Task Sync → Reconcile

The system will now automatically sync edits bidirectionally!
