const DRIVE_GIF_FOLDER_ID = '1DgzVx8aL6PgPm0-Np9gQMPywUEBVBxuA';
const CREW_LOOKUP_ID = '19itGq86BRQTVehKhtRFKwK8gZqjsUQ_bG5cuVmem9HU';

function sendCrewTweet() {
  const crew = getCrewLookupStringFromActiveSpreadsheet_();
  const emoji = lookupEmojiForCrew_(crew);
  const message = `${emoji}🏴‍☠️🤙\n${crew} call starts now!\ndiscord.pizzadao.xyz`;
  
  const mediaId = uploadRandomGifFromCrewSubfolder_(DRIVE_GIF_FOLDER_ID, crew);
  const url = 'https://api.twitter.com/2/tweets';
  
  const payload = JSON.stringify({ text: message, media: { media_ids: [mediaId] } });
  const authHeader = buildOAuth1Header_('POST', url, {});

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: authHeader },
    payload: payload,
    muteHttpExceptions: true
  });
  
  const json = JSON.parse(res.getContentText());
  return `https://x.com/i/web/status/${json.data.id}`;
}

function startDiscordEvent() {
  const url = 'https://pizzadao-discord-bot-production.up.railway.app/start-event-by-id';
  const apiKey = PropertiesService.getScriptProperties().getProperty('BOT_API_KEY');
  // ... rest of event lookup logic ...
}