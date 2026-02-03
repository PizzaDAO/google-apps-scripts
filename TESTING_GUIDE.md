# TaskSyncLib Testing Guide

This guide covers all functionality of the bidirectional task sync system between Master Tasks and Crew sheets.

## Overview

The system syncs tasks between:
- **Master Tasks** (source of truth) - contains all tasks
- **Crew Sheets** (Ops, Biz Dev, etc.) - contain tasks assigned to that crew

Key features:
- Bidirectional sync via onEdit triggers
- Field-level sync (only changed columns are synced)
- Early timestamp protection (prevents overwrites during concurrent edits)
- New rows inserted at top of table (no sorting during sync)

---

## Test 1: Basic Sync - Master to Crew

**Purpose:** Verify edits in Master propagate to crew sheets.

**Steps:**
1. Open **Master Tasks** spreadsheet
2. Find a task that has `Crews = "Biz Dev"` (or any crew)
3. Edit the **Notes** field for that task
4. Wait 5-10 seconds for sync

**Expected Result:**
- The same task in **Biz Dev Crew** sheet should have the updated Notes
- Check the **Sync Logs** sheet in Master for `MASTER_TO_CREWS` and `SYNC_COMPLETE` entries

---

## Test 2: Basic Sync - Crew to Master

**Purpose:** Verify edits in a crew sheet propagate to Master and other crews.

**Steps:**
1. Open **Biz Dev Crew** spreadsheet
2. Find a task that has `Crews = "Biz Dev, Ops"` (shared with another crew)
3. Edit the **Notes** field for that task
4. Wait 5-10 seconds for sync

**Expected Result:**
- **Master Tasks** should have the updated Notes
- **Ops Crew** should also have the updated Notes (since task is shared)
- Check **Sync Logs** for `CREW_TO_MASTER` and `SYNC_COMPLETE` entries

---

## Test 3: New Task in Crew Sheet

**Purpose:** Verify new tasks created in a crew sheet sync to Master.

**Steps:**
1. Open **Ops Crew** spreadsheet
2. Add a new row at the top of the Tasks table (below the header)
3. Fill in: `Task = "Test Task from Ops"`, `Priority = "1. High"`, `Crews = "Ops"`
4. Wait 5-10 seconds

**Expected Result:**
- Task should get a **TaskID** assigned automatically
- Task should appear in **Master Tasks**
- `Crews` field should include "Ops"
- Check **Sync Logs** for `CREW_TO_MASTER` entry

---

## Test 4: New Task with Multiple Crews

**Purpose:** Verify new tasks with multiple crews propagate correctly.

**Steps:**
1. Open **Biz Dev Crew** spreadsheet
2. Add a new task: `Task = "Shared Test Task"`, `Crews = "Biz Dev, Ops"`
3. Wait 5-10 seconds

**Expected Result:**
- Task appears in **Master Tasks** with `Crews = "Biz Dev, Ops"`
- Task appears in **Ops Crew** sheet
- Task remains in **Biz Dev Crew** sheet

---

## Test 5: Add Crew to Existing Task

**Purpose:** Verify adding a crew to an existing task adds the task to that crew's sheet.

**Steps:**
1. Open **Master Tasks**
2. Find a task that has `Crews = "Ops"` only
3. Edit `Crews` to `"Ops, Biz Dev"`
4. Wait 5-10 seconds

**Expected Result:**
- Task should now appear in **Biz Dev Crew** sheet
- Task remains in **Ops Crew** sheet

---

## Test 6: Remove Crew from Task

**Purpose:** Verify removing a crew from a task removes it from that crew's sheet.

**Steps:**
1. Open **Master Tasks**
2. Find a task that has `Crews = "Biz Dev, Ops"`
3. Edit `Crews` to just `"Ops"` (remove Biz Dev)
4. Wait 5-10 seconds

**Expected Result:**
- Task should be **deleted** from **Biz Dev Crew** sheet
- Task remains in **Ops Crew** sheet
- Check **Sync Logs** for `PROPAGATE_DELETE` entry

---

## Test 7: Remove Task from Current Crew (in Crew Sheet)

**Purpose:** Verify a user can remove their own crew from a task in their sheet.

**Steps:**
1. Open **Biz Dev Crew** spreadsheet
2. Find a task with `Crews = "Biz Dev, Ops"`
3. Edit `Crews` to just `"Ops"` (remove Biz Dev)
4. Wait 5-10 seconds

**Expected Result:**
- Task should be **deleted** from **Biz Dev Crew** sheet
- Task remains in **Ops Crew** with `Crews = "Ops"`
- Master updated to `Crews = "Ops"`
- Check **Sync Logs** for `CREW_REMOVED` entry

---

## Test 8: Field-Level Sync (Concurrent Edits)

**Purpose:** Verify two users editing different fields of the same task don't overwrite each other.

**Steps:**
1. Find a task that exists in both **Biz Dev Crew** and **Ops Crew**
2. **Quickly** (within 5 seconds of each other):
   - In **Biz Dev**: Edit the **Notes** field to "Biz Dev edit"
   - In **Ops**: Edit the **Priority** field to "0. Top"
3. Wait 10-15 seconds for both syncs to complete

**Expected Result:**
- **Master Tasks** should have BOTH changes:
  - Notes = "Biz Dev edit"
  - Priority = "0. Top"
- Both crew sheets should have both changes
- Neither edit should be lost

---

## Test 9: Same Field Concurrent Edit (Last Write Wins)

**Purpose:** Verify that when two users edit the same field, the last one wins.

**Steps:**
1. Find a task that exists in both crew sheets
2. Note the current Notes value
3. **Quickly**:
   - In **Biz Dev**: Edit **Notes** to "Edit A"
   - In **Ops**: Edit **Notes** to "Edit B"
4. Wait 10-15 seconds

**Expected Result:**
- The edit with the later timestamp wins
- All sheets should have the same Notes value
- No data corruption or duplicates

---

## Test 10: Auto-Add Current Crew

**Purpose:** Verify that creating a task in a crew sheet automatically adds that crew.

**Steps:**
1. Open **Ops Crew** spreadsheet
2. Add a new task with `Crews` field **empty** or set to just `"Biz Dev"`
3. Wait 5-10 seconds

**Expected Result:**
- `Crews` field should automatically include "Ops" (the current sheet's crew)
- If you set `Crews = "Biz Dev"`, it should become `"Biz Dev, Ops"`
- Check **Sync Logs** for `CREW_ADDED` entry

---

## Test 11: Blank Row Handling

**Purpose:** Verify blank rows don't trigger sync or get IDs.

**Steps:**
1. Open any crew sheet
2. Add a completely blank row in the Tasks table
3. Wait 5 seconds

**Expected Result:**
- No sync should occur
- No TaskID should be assigned
- No entries in Sync Logs

---

## Test 12: Menu Functions

**Purpose:** Verify the Task Sync menu works correctly.

### 12a: Validate Setup
1. Click **Task Sync > Validate setup**
2. Should show any missing columns or configuration issues

### 12b: Reconcile
1. Click **Task Sync > Reconcile: push master to crews**
2. Should sync all tasks from Master to appropriate crew sheets
3. Useful for fixing any out-of-sync data

### 12c: Bootstrap
1. Click **Task Sync > Bootstrap: add IDs + copy to master**
2. Should assign TaskIDs to any tasks missing them
3. Should copy all crew tasks to Master

---

## Test 13: Lock Handling

**Purpose:** Verify the system handles concurrent operations gracefully.

**Steps:**
1. Make rapid edits (3-4 edits within 2 seconds) to different tasks
2. Check **Sync Logs**

**Expected Result:**
- Some edits may show `LOCK_FAILED` (this is OK - means another sync was running)
- No data corruption
- All edits should eventually sync (may need to re-edit if lock failed)

---

## Test 14: Duplicate Prevention

**Purpose:** Verify the system doesn't create duplicate rows.

**Steps:**
1. Add a new task in a crew sheet
2. Immediately edit another field in the same row
3. Check both Master and crew sheet

**Expected Result:**
- Only ONE row should exist for the task
- No duplicate TaskIDs
- Run `node verify-sync.js audit` to confirm no duplicates

---

## Verification Tools

### Check Sync Logs
Open the **Sync Logs** sheet in Master Tasks to see recent sync activity.

### Run Audit
```bash
cd google-apps-scripts
node verify-sync.js audit
```

### Check Specific Task
```bash
node verify-sync.js verify [TaskID]
```

### View Recent Logs
```bash
node verify-sync.js logs 20
```

### Full Reconciliation (if needed)
```bash
node reconcile-all.js
```

---

## Troubleshooting

### Sync Not Working
1. Check if the trigger is installed: **Extensions > Apps Script > Triggers**
2. Each spreadsheet should have an `onEditTrigger` pointing to `TaskSyncLib.handleEdit`
3. Check **Sync Logs** for errors

### Duplicates Created
1. Run `node verify-sync.js audit` to find them
2. Run `node cleanup-duplicates.js` to remove them
3. Or manually delete the duplicate rows

### Task Not Appearing in Crew Sheet
1. Check the `Crews` field in Master - does it include that crew?
2. Run **Task Sync > Reconcile** from the menu
3. Check **Sync Logs** for errors

### Wrong Data After Sync
1. Master is the source of truth
2. Run **Task Sync > Reconcile** to push Master data to all crews
3. Or run `node reconcile-all.js`

---

## Version History

- **v13**: Field-level sync (only sync edited columns)
- **v12**: Early timestamp stamping (protect pending edits)
- **v11**: Remove sorting, insert new rows at top
- **v10**: Propagation logging
- **v9**: Fix new task crew membership
- **v8-v7**: Logging and duplicate fixes
