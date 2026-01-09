/***********************************************************************
 * TaskSyncWrapper - Thin wrapper for each spreadsheet
 *
 * SETUP INSTRUCTIONS:
 *
 * 1. In the master spreadsheet AND each crew spreadsheet:
 *    a. Open Apps Script: Extensions → Apps Script
 *    b. Delete any existing task sync code
 *    c. Paste this wrapper code
 *
 * 2. Add the TaskSyncLib library:
 *    a. In Apps Script editor: Libraries (+ icon) → Add a library
 *    b. Paste the TaskSyncLib deployment ID: [YOUR_LIBRARY_ID_HERE]
 *    c. Select latest version
 *    d. Set identifier to: TaskSyncLib
 *
 * 3. Create an installable onEdit trigger:
 *    a. In Apps Script editor: Triggers (clock icon) → Add Trigger
 *    b. Choose function: onEditTrigger
 *    c. Event source: From spreadsheet
 *    d. Event type: On edit
 *    e. Save (authorize when prompted)
 *
 * 4. (Optional) Run setupTrigger() once to auto-create the trigger
 *
 * IMPORTANT: Do NOT use a simple onEdit(e) trigger - it won't have
 * permissions to access other spreadsheets. Must be installable.
 ***********************************************************************/

/**
 * Installable onEdit trigger - calls into the shared library.
 * This ensures all spreadsheets share the same lock and properties.
 */
function onEditTrigger(e) {
  TaskSyncLib.handleEdit(e);
}

/**
 * Adds the Task Sync menu when spreadsheet opens.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Task Sync')
    .addItem('Validate setup', 'runValidate')
    .addItem('Bootstrap: add IDs + copy to master', 'runBootstrap')
    .addSeparator()
    .addItem('Reconcile: push master to crews', 'runReconcile')
    .addToUi();
}

/**
 * Menu action: Validate all sheets have required headers.
 */
function runValidate() {
  const issues = TaskSyncLib.validate();
  const ui = SpreadsheetApp.getUi();

  if (!issues || issues.length === 0) {
    ui.alert('Setup looks good.');
  } else {
    ui.alert('Setup issues:\n\n' + issues.join('\n'));
  }
}

/**
 * Menu action: Bootstrap - add IDs to all tasks and copy to master.
 * Run this once when first setting up, or when adding a new crew sheet.
 */
function runBootstrap() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Bootstrap Tasks',
    'This will:\n' +
    '1. Add TaskIDs to all tasks in all crew sheets\n' +
    '2. Copy all tasks to the master sheet\n' +
    '3. Reconcile master back to all crews\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) return;

  try {
    TaskSyncLib.bootstrap();
    ui.alert('Bootstrap complete!');
  } catch (err) {
    ui.alert('Bootstrap failed: ' + err.message);
    console.error(err);
  }
}

/**
 * Menu action: Reconcile - push master to all crews.
 * Use this to force-sync master's state to all crew sheets.
 */
function runReconcile() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Reconcile Tasks',
    'This will push all tasks from master to crew sheets.\n' +
    'Crew sheets will be updated to match master.\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) return;

  try {
    TaskSyncLib.reconcile(false);
    ui.alert('Reconcile complete!');
  } catch (err) {
    ui.alert('Reconcile failed: ' + err.message);
    console.error(err);
  }
}

/***************
 * TRIGGER SETUP HELPERS
 ***************/

/**
 * Run once to create the installable onEdit trigger.
 * Removes any existing triggers for onEditTrigger first.
 */
function setupTrigger() {
  // Remove existing triggers for this function
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    if (t.getHandlerFunction() === 'onEditTrigger') {
      ScriptApp.deleteTrigger(t);
    }
  }

  // Create new installable trigger
  ScriptApp.newTrigger('onEditTrigger')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();

  SpreadsheetApp.getUi().alert(
    'Trigger created!\n\n' +
    'The onEditTrigger function will now run when you edit this spreadsheet.'
  );
}

/**
 * Run to remove the installable onEdit trigger.
 */
function removeTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;

  for (const t of triggers) {
    if (t.getHandlerFunction() === 'onEditTrigger') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  }

  SpreadsheetApp.getUi().alert(`Removed ${removed} trigger(s).`);
}

/**
 * Lists all triggers for debugging.
 */
function listTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  const lines = triggers.map(t =>
    `${t.getHandlerFunction()} - ${t.getEventType()} - ${t.getTriggerSource()}`
  );

  if (lines.length === 0) {
    SpreadsheetApp.getUi().alert('No triggers found.');
  } else {
    SpreadsheetApp.getUi().alert('Triggers:\n\n' + lines.join('\n'));
  }
}
