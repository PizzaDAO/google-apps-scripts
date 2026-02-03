/**
 * DRIVE SERVICE
 *
 * Handles GIF selection from Drive folders for Twitter posts.
 */

/**
 * Uploads a random GIF from a crew-named subfolder.
 * Returns media_id for Twitter.
 *
 * @param {string} parentFolderId - The parent folder containing crew subfolders
 * @param {string} crewFolderName - The crew name (subfolder name)
 * @returns {string} The Twitter media ID
 */
function uploadRandomGifFromCrewSubfolder_(parentFolderId, crewFolderName) {
  const crewFolder = findSubfolderByName_(parentFolderId, crewFolderName);
  const file = pickRandomGifFileUnderSize_(crewFolder.getId(), MAX_GIF_BYTES, MAX_PICK_ATTEMPTS);

  const size = file.getSize();
  Logger.log('Selected GIF: ' + file.getName() + ' (' + size + ' bytes) from folder "' + crewFolderName + '"');

  const blob = file.getBlob();
  try {
    blob.setContentType('image/gif');
  } catch (err) {
    // Ignore content type errors
  }

  return twitterUploadMediaSimple_(blob);
}

/**
 * Uploads a random GIF from the main folder (backward compat).
 *
 * @param {string} folderId - The folder ID to select from
 * @returns {string} The Twitter media ID
 */
function uploadRandomGifFromDriveFolder_(folderId) {
  const file = pickRandomGifFileUnderSize_(folderId, MAX_GIF_BYTES, MAX_PICK_ATTEMPTS);

  const size = file.getSize();
  Logger.log('Selected GIF: ' + file.getName() + ' (' + size + ' bytes)');

  const blob = file.getBlob();
  try {
    blob.setContentType('image/gif');
  } catch (err) {
    // Ignore content type errors
  }

  return twitterUploadMediaSimple_(blob);
}

/**
 * Finds a subfolder by name within a parent folder.
 *
 * @param {string} parentFolderId - The parent folder ID
 * @param {string} folderName - The subfolder name to find
 * @returns {Folder} The found folder
 * @throws {Error} If no matching folder is found
 */
function findSubfolderByName_(parentFolderId, folderName) {
  const parent = DriveApp.getFolderById(parentFolderId);
  const iter = parent.getFoldersByName(folderName);

  if (!iter.hasNext()) {
    // Helpful debugging: list a few folder names
    const all = parent.getFolders();
    const names = [];
    let count = 0;
    while (all.hasNext() && count < 30) {
      names.push(all.next().getName());
      count++;
    }
    throw new Error(
      'No subfolder named "' + folderName + '" found under ' + parentFolderId +
      '. First few subfolders seen: ' + JSON.stringify(names)
    );
  }

  return iter.next();
}

/**
 * Picks a random GIF file from a folder that is <= maxBytes.
 *
 * @param {string} folderId - The folder ID to search
 * @param {number} maxBytes - Maximum file size in bytes
 * @param {number} maxAttempts - Maximum random picks to try
 * @returns {File} The selected GIF file
 * @throws {Error} If no suitable GIF is found
 */
function pickRandomGifFileUnderSize_(folderId, maxBytes, maxAttempts) {
  const folder = DriveApp.getFolderById(folderId);
  const iter = folder.getFilesByType(MimeType.GIF);

  const files = [];
  while (iter.hasNext()) {
    files.push(iter.next());
  }

  if (files.length === 0) {
    throw new Error('No GIF files found in folder: ' + folderId);
  }

  // First try to find eligible files
  const eligible = files.filter(f => f.getSize() <= maxBytes);
  if (eligible.length > 0) {
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  // Fallback: random sampling
  const attempts = Math.min(maxAttempts, files.length * 3);
  for (let i = 0; i < attempts; i++) {
    const f = files[Math.floor(Math.random() * files.length)];
    if (f.getSize() <= maxBytes) {
      return f;
    }
  }

  const largestAllowedMb = (maxBytes / (1024 * 1024)).toFixed(2);
  throw new Error(
    'No GIFs <= ' + maxBytes + ' bytes (' + largestAllowedMb + 'MB) found in folder ' + folderId +
    '. Upload smaller GIFs or raise MAX_GIF_BYTES.'
  );
}

/**
 * Lists all GIF files in a folder with their sizes.
 * Useful for debugging.
 *
 * @param {string} folderId - The folder ID to list
 */
function listGifsInFolder(folderId) {
  const folder = DriveApp.getFolderById(folderId);
  const iter = folder.getFilesByType(MimeType.GIF);

  Logger.log('GIFs in folder ' + folder.getName() + ':');

  let count = 0;
  let totalSize = 0;
  let oversized = 0;

  while (iter.hasNext()) {
    const file = iter.next();
    const size = file.getSize();
    totalSize += size;
    count++;

    const sizeMb = (size / (1024 * 1024)).toFixed(2);
    const status = size > MAX_GIF_BYTES ? ' [TOO LARGE]' : '';

    if (size > MAX_GIF_BYTES) oversized++;

    Logger.log('  ' + file.getName() + ': ' + sizeMb + 'MB' + status);
  }

  Logger.log('---');
  Logger.log('Total: ' + count + ' GIFs, ' + (totalSize / (1024 * 1024)).toFixed(2) + 'MB');
  Logger.log('Eligible (<=5MB): ' + (count - oversized));
  Logger.log('Oversized (>5MB): ' + oversized);
}

/**
 * Lists all crew subfolders.
 * Useful for debugging.
 */
function listCrewFolders() {
  const parent = DriveApp.getFolderById(DRIVE_GIF_FOLDER_ID);
  const iter = parent.getFolders();

  Logger.log('Crew GIF folders:');

  while (iter.hasNext()) {
    const folder = iter.next();
    const gifIter = folder.getFilesByType(MimeType.GIF);

    let count = 0;
    while (gifIter.hasNext()) {
      gifIter.next();
      count++;
    }

    Logger.log('  ' + folder.getName() + ': ' + count + ' GIFs');
  }
}
