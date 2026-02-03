/**
 * TELEGRAM INTEGRATION
 *
 * Telegram messages are sent via sendTelegramAnnouncement_() in X post.js
 * when the user types "Send" next to "Announce?" and enters the password.
 */

// ======================================================
// LOW-LEVEL TELEGRAM SENDER (used by sendAll in X post.js)
// ======================================================
function sendTelegramMessage(token, chatId, text) {
  var url = "https://api.telegram.org/bot" + token + "/sendMessage";

  var payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "Markdown"
  };

  var params = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, params);
  Logger.log(response.getContentText());
}

// ======================================================
// TEST FUNCTIONS
// ======================================================

/**
 * Test Telegram token validity
 */
function testTelegramToken() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_BOT_TOKEN');

  if (!token) {
    Logger.log('ERROR: TELEGRAM_BOT_TOKEN not set in Script Properties');
    return;
  }

  var url = 'https://api.telegram.org/bot' + token + '/getMe';
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  Logger.log('Response code: ' + res.getResponseCode());
  Logger.log('Response: ' + res.getContentText());
}

/**
 * Test sending a message
 */
function testTelegramSend() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_BOT_TOKEN');
  var chatId = props.getProperty('TELEGRAM_CHAT_ID');

  if (!token || !chatId) {
    Logger.log('ERROR: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set in Script Properties');
    return;
  }

  var text = 'Test message from Community Call script';

  var url = 'https://api.telegram.org/bot' + token + '/sendMessage';
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: text }),
    muteHttpExceptions: true
  });

  Logger.log('Response code: ' + res.getResponseCode());
  Logger.log('Response: ' + res.getContentText());
}
