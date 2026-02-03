/**
 * TELEGRAM INTEGRATION
 *
 * The onEditSendTelegram trigger has been replaced by the "Announce?" pattern.
 * Telegram messages are now sent via sendTelegramAnnouncement_() in X post.js
 * when the user types "Send" next to "Announce?" and enters the password.
 */

// ======================================================
// LOW-LEVEL TELEGRAM SENDER (used by sendAll in X post.js)
// ======================================================
function sendTelegramMessage(token, chatId, text) {
  const url = "https://api.telegram.org/bot" + token + "/sendMessage";

  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "Markdown"
  };

  const params = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, params);
  Logger.log(response.getContentText());
}

// ======================================================
// TEST FUNCTIONS
// ======================================================

//TOKEN TESTER
function testTelegramToken() {
  const token = '8456308928:AAGC6En5aDQO6Ghah9Rtq6nwPsH_2ZYa2Qc';
  const url = `https://api.telegram.org/bot${token}/getMe`;
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  Logger.log(res.getResponseCode());
  Logger.log(res.getContentText());
}

// SEND TEST
function testTelegramSend() {
  const token = '8456308928:AAGC6En5aDQO6Ghah9Rtq6nwPsH_2ZYa2Qc';
  const chatId = '-5011258237';
  const text = 'Test message ✅';

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text }),
    muteHttpExceptions: true
  });

  Logger.log(res.getResponseCode());
  Logger.log(res.getContentText());
}
