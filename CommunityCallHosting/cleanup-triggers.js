/**
 * ONE-TIME: Remove old triggers that are no longer needed
 * Run this once, then delete this file
 */
function cleanupOldTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = [];

  triggers.forEach(function(trigger) {
    var funcName = trigger.getHandlerFunction();

    // Keep only sendAll and handleRecurringAttendance
    if (funcName !== 'sendAll' && funcName !== 'handleRecurringAttendance') {
      ScriptApp.deleteTrigger(trigger);
      removed.push(funcName);
    }
  });

  if (removed.length > 0) {
    console.log('Removed old triggers: ' + removed.join(', '));
  } else {
    console.log('No old triggers to remove');
  }

  // List remaining triggers
  var remaining = ScriptApp.getProjectTriggers().map(function(t) {
    return t.getHandlerFunction();
  });
  console.log('Remaining triggers: ' + (remaining.length > 0 ? remaining.join(', ') : 'none'));
}
