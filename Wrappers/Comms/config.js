/**
 * CONFIG MODULE
 *
 * Central configuration constants for the crew scripts.
 */

// Template spreadsheet for creating copies
const TEMPLATE_SPREADSHEET_ID = '1mzh9FXF4jiJOcL_45uxtLuohp5hIPbT006AAVZ_zT3U';

// Drive folder containing subfolders of GIFs (one per crew)
const DRIVE_GIF_FOLDER_ID = '1DgzVx8aL6PgPm0-Np9gQMPywUEBVBxuA';

// Spreadsheet used for Crew->Emoji lookup
const CREW_LOOKUP_SPREADSHEET_ID = '19itGq86BRQTVehKhtRFKwK8gZqjsUQ_bG5cuVmem9HU';
const CREW_LOOKUP_SHEET_INDEX = 2; // second sheet (1-based index)

// Hard cap for GIF file size (bytes) — 5MB
const MAX_GIF_BYTES = 5242880;

// How many different random picks to try before failing
const MAX_PICK_ATTEMPTS = 50;

// Discord bot base URL
const BOT_BASE_URL = "https://pizzadao-discord-bot-production.up.railway.app";

// Voice channel for attendance
const VOICE_CHANNEL_ID = "823956905739026442";

// Announce? trigger labels
const SEND_LABEL_TEXT = 'Announce?';
const SEND_VALUE = 'Send';
const SENT_VALUE = 'Sent';
const LAST_SENT_LABEL_TEXT = 'Last Sent:';

// Internal property keys
const BYPASS_PROP_KEY = 'BYPASS_NEXT_ONEDIT';
const LAST_X_URL_PROP_KEY = 'LAST_X_URL';

// Attendance burst config
const ATTENDANCE_BURST_RUNS = 6;        // additional runs after first
const ATTENDANCE_BURST_MINUTES = 10;    // interval between runs
const ATTENDANCE_BURST_COUNT_KEY_PREFIX = 'ATTENDANCE_BURST_COUNT__';
