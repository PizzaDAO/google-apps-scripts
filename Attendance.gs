const BOT_BASE_URL = "https://pizzadao-discord-bot-production.up.railway.app";
const VOICE_CHANNEL_ID = "823956905739026442";

function takeAttendanceTodayMerge() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('BOT_API_KEY');
  const payload = fetchVoiceAttendance_(apiKey);
  // ... rest of merge logic ...
}

function fetchVoiceAttendance_(key) {
  const url = `${BOT_BASE_URL}/voice-attendance?channelId=${VOICE_CHANNEL_ID}`;
  const res = UrlFetchApp.fetch(url, {
    headers: { Authorization: "Bearer " + key },
    muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText());
}