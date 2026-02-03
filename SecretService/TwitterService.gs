/**
 * TWITTER SERVICE
 *
 * Handles OAuth 1.0a signing, media upload, and tweet posting.
 */

/**
 * Posts a tweet with a random GIF from the crew's folder.
 * Returns the tweet URL.
 *
 * @param {Spreadsheet} spreadsheet - The crew spreadsheet
 * @returns {string} The tweet URL
 */
function sendCrewTweet_(spreadsheet) {
  const crew = getCrewLookupStringFromSpreadsheet_(spreadsheet);
  const emoji = lookupEmojiForCrew_(crew);

  const message =
    `${emoji}🏴‍☠️🤙\n` +
    `${crew} call starts now!\n` +
    `discord.pizzadao.xyz`;

  return sendTweetWithCrewGif_(crew, message);
}

/**
 * Posts a tweet with text and a random GIF from crew subfolder.
 * Returns the tweet URL.
 *
 * @param {string} crew - The crew name (used to find GIF folder)
 * @param {string} message - The tweet text
 * @returns {string} The tweet URL
 */
function sendTweetWithCrewGif_(crew, message) {
  const mediaId = uploadRandomGifFromCrewSubfolder_(DRIVE_GIF_FOLDER_ID, crew);

  const url = 'https://api.twitter.com/2/tweets';
  const method = 'POST';

  const payload = {
    text: String(message || ''),
    media: { media_ids: [mediaId] }
  };

  const authHeader = buildOAuth1Header_(method, url, {});

  const params = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: authHeader },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, params);
  const code = response.getResponseCode();
  const body = response.getContentText();

  Logger.log('Tweet status: ' + code);
  Logger.log('Tweet body: ' + body);

  if (code < 200 || code >= 300) {
    throw new Error('Tweet failed (' + code + '): ' + body);
  }

  const json = JSON.parse(body || '{}');
  const tweetId = json.data && json.data.id ? String(json.data.id) : '';
  if (!tweetId) {
    throw new Error('Tweet create response missing tweet id: ' + body);
  }

  return `https://x.com/i/web/status/${tweetId}`;
}

/**
 * Uploads media to Twitter using simple upload (<=5MB).
 * Returns media_id_string.
 *
 * @param {Blob} blob - The media blob to upload
 * @returns {string} The media ID string
 */
function twitterUploadMediaSimple_(blob) {
  const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';

  const sigParams = {};
  const authHeader = buildOAuth1Header_('POST', uploadUrl, sigParams);

  const resp = UrlFetchApp.fetch(uploadUrl, {
    method: 'post',
    headers: { Authorization: authHeader },
    payload: { media: blob },
    muteHttpExceptions: true
  });

  const code = resp.getResponseCode();
  const text = resp.getContentText();

  Logger.log('MEDIA upload status: ' + code);
  Logger.log('MEDIA upload body: ' + text);

  if (code < 200 || code >= 300) {
    throw new Error('Media upload failed (' + code + '): ' + text);
  }

  const json = JSON.parse(text || '{}');
  const mediaId = json.media_id_string || (json.media_id ? String(json.media_id) : null);
  if (!mediaId) {
    throw new Error('Media upload missing media_id: ' + text);
  }

  return mediaId;
}

// ============================================
// OAUTH 1.0a SIGNING
// ============================================

/**
 * Builds the OAuth 1.0a Authorization header.
 *
 * @param {string} method - HTTP method
 * @param {string} url - Request URL
 * @param {Object} requestParams - Additional request parameters
 * @returns {string} The Authorization header value
 */
function buildOAuth1Header_(method, url, requestParams) {
  const baseUrl = normalizeUrl_(url);
  const queryParams = parseQueryParams_(url);

  const oauthParams = {
    oauth_consumer_key: getTwConsumerKey_(),
    oauth_nonce: generateNonce_(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: getTwAccessToken_(),
    oauth_version: '1.0'
  };

  const sigParams = Object.assign({}, oauthParams, queryParams, requestParams || {});
  const baseString = buildSignatureBaseString_(method, baseUrl, sigParams);

  const signingKey =
    percentEncode_(getTwConsumerSecret_()) + '&' + percentEncode_(getTwAccessTokenSecret_());

  const rawSig = Utilities.computeHmacSignature(
    Utilities.MacAlgorithm.HMAC_SHA_1,
    baseString,
    signingKey
  );

  oauthParams.oauth_signature = Utilities.base64Encode(rawSig);
  return buildAuthHeaderString_(oauthParams);
}

/**
 * Builds the signature base string for OAuth signing.
 */
function buildSignatureBaseString_(method, url, params) {
  const paramString = Object.keys(params)
    .sort()
    .map(k => percentEncode_(k) + '=' + percentEncode_(params[k]))
    .join('&');

  return [
    method.toUpperCase(),
    percentEncode_(url),
    percentEncode_(paramString)
  ].join('&');
}

/**
 * Builds the Authorization header string from OAuth params.
 */
function buildAuthHeaderString_(oauthParams) {
  return 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map(k => percentEncode_(k) + '="' + percentEncode_(oauthParams[k]) + '"')
    .join(', ');
}

/**
 * Parses query parameters from a URL.
 */
function parseQueryParams_(url) {
  const out = {};
  const q = (url.split('?')[1] || '').trim();
  if (!q) return out;

  q.split('&').forEach(pair => {
    const [k, v] = pair.split('=');
    if (!k) return;
    out[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });

  return out;
}

/**
 * Normalizes a URL by removing query string.
 */
function normalizeUrl_(url) {
  return url.split('?')[0];
}

/**
 * Percent-encodes a string per OAuth spec.
 */
function percentEncode_(str) {
  return encodeURIComponent(String(str))
    .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/**
 * Generates a random nonce for OAuth.
 */
function generateNonce_() {
  return Utilities.getUuid().replace(/-/g, '');
}
