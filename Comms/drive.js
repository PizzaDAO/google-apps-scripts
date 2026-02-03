/**
 * DRIVE MODULE
 *
 * Handles GIF selection from Drive folders.
 */

/**
 * Uploads a random GIF from a crew-named subfolder.
 * Returns media_id for Twitter.
 */
function uploadRandomGifFromCrewSubfolder_(parentFolderId, crewFolderName) {
  const crewFolder = findSubfolderByName_(parentFolderId, crewFolderName);
  const file = pickRandomGifFileUnderSize_(crewFolder.getId(), MAX_GIF_BYTES, MAX_PICK_ATTEMPTS);

  const size = file.getSize();
  Logger.log('Selected GIF: ' + file.getName() + ' (' + size + ' bytes) from folder "' + crewFolderName + '"');

  const blob = file.getBlob();
  try { blob.setContentType('image/gif'); } catch (err) { }

  return twitterUploadMediaSimple_(blob);
}

/**
 * Uploads a random GIF from the main folder (backward compat).
 */
function uploadRandomGifFromDriveFolder_(folderId) {
  const file = pickRandomGifFileUnderSize_(folderId, MAX_GIF_BYTES, MAX_PICK_ATTEMPTS);

  const size = file.getSize();
  Logger.log('Selected GIF: ' + file.getName() + ' (' + size + ' bytes)');

  const blob = file.getBlob();
  try { blob.setContentType('image/gif'); } catch (err) { }

  return twitterUploadMediaSimple_(blob);
}

/**
 * Finds a subfolder by name within a parent folder.
 */
function findSubfolderByName_(parentFolderId, folderName) {
  const parent = DriveApp.getFolderById(parentFolderId);
  const iter = parent.getFoldersByName(folderName);

  if (!iter.hasNext()) {
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
 */
function pickRandomGifFileUnderSize_(folderId, maxBytes, maxAttempts) {
  const folder = DriveApp.getFolderById(folderId);
  const iter = folder.getFilesByType(MimeType.GIF);

  const files = [];
  while (iter.hasNext()) files.push(iter.next());

  if (files.length === 0) throw new Error('No GIF files found in folder: ' + folderId);

  const eligible = files.filter(f => f.getSize() <= maxBytes);
  if (eligible.length > 0) {
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  const attempts = Math.min(maxAttempts, files.length * 3);
  for (let i = 0; i < attempts; i++) {
    const f = files[Math.floor(Math.random() * files.length)];
    if (f.getSize() <= maxBytes) return f;
  }

  const largestAllowedMb = (maxBytes / (1024 * 1024)).toFixed(2);
  throw new Error(
    'No GIFs <= ' + maxBytes + ' bytes (' + largestAllowedMb + 'MB) found in folder ' + folderId +
    '. Upload smaller GIFs or raise MAX_GIF_BYTES.'
  );
}
