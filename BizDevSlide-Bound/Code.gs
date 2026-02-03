/**
 * PizzaDAO Biz Dev Training Slide Generator
 *
 * Uses dropdown in each row to trigger actions
 * Template: https://docs.google.com/presentation/d/10r1Whyjx0CPOKMl4C6aCwtQUaIICQ-jkezmJr2bnSjU/edit
 */

// Template presentation ID (blank square)
var TEMPLATE_ID = '10r1Whyjx0CPOKMl4C6aCwtQUaIICQ-jkezmJr2bnSjU';

// PizzaDAO logo (black) - Google Drive file ID
var LOGO_FILE_ID = '1QFjk1QSF4I-lce_VChAZcxbti6nVn7Ts';

// Colors
var YELLOW_BG = '#FFE700';
var CORAL_RED = '#EE3F3F';
var DARK_BLUE = '#4200FF';
var BLACK = '#000000';

// Spreadsheet column indices (1-based)
var COL = {
  ACTION: 1,
  STATUS: 2,
  SESSION_TITLE: 3,
  SPEAKER_NAME: 4,
  EVENT_DATE: 5,
  EVENT_TIME: 6,
  IMAGE_URL: 7,
  SLIDE_URL: 8,
  NOTES: 9
};

// Action dropdown options
var ACTIONS = {
  NONE: '',
  GENERATE: 'Generate Slide',
  ANNOUNCE: 'Announce',
  BOTH: 'Generate & Announce'
};

/**
 * Installable trigger handler for edit events
 * Must be installed via createEditTrigger() - simple onEdit won't have permissions
 */
function onEditInstallable(e) {
  var sheet = e.source.getActiveSheet();
  var range = e.range;
  var row = range.getRow();
  var col = range.getColumn();
  var value = e.value;

  // Ignore header row
  if (row <= 1) return;

  // Check if Action column was changed
  if (col === COL.ACTION && value) {
    // Clear the action immediately
    range.setValue('');

    // Run the selected action
    if (value === ACTIONS.GENERATE) {
      generateSlideForRow(sheet, row);
    } else if (value === ACTIONS.ANNOUNCE) {
      announceSessionForRow(sheet, row);
    } else if (value === ACTIONS.BOTH) {
      generateSlideForRow(sheet, row);
      // Small delay then announce
      SpreadsheetApp.flush();
      announceSessionForRow(sheet, row);
    }
  }
}

/**
 * Creates the installable edit trigger (run this once!)
 */
function createEditTrigger() {
  // Remove any existing triggers first
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onEditInstallable') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Create new installable trigger
  ScriptApp.newTrigger('onEditInstallable')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();

  Logger.log('Edit trigger created successfully!');
}

// Target spreadsheet ID (set this to use with a specific sheet)
var TARGET_SPREADSHEET_ID = '1RrbfPWH4KmzuaJI9K7eLt3O4ypk0v1AFNTONvrIIMsQ';

/**
 * Creates custom menu when spreadsheet opens
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🍕 PizzaDAO')
    .addItem('Setup Sheet (First Time)', 'setupSheet')
    .addSeparator()
    .addItem('Generate All Missing Slides', 'generateAllMissingSlides')
    .addItem('Announce All Unannounced', 'announceAllUnannounced')
    .addSeparator()
    .addItem('Add New Row', 'addEmptyRow')
    .addToUi();
}

/**
 * Sets up the target spreadsheet (run this from Apps Script editor)
 */
function setupTargetSheet() {
  var spreadsheet = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  var sheet = spreadsheet.getActiveSheet();

  setupSheetInternal(sheet);

  Logger.log('Sheet setup complete: ' + spreadsheet.getUrl());
}

/**
 * Sets up the current active spreadsheet (run this one!)
 */
function setupSheet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  setupSheetInternal(sheet);
  Logger.log('Sheet setup complete! Refresh the spreadsheet to see changes.');
}

/**
 * Internal function to set up any sheet
 */
function setupSheetInternal(sheet) {
  // Set headers
  var headers = [
    '⚡ Action',
    'Status',
    'Session Title',
    'Speaker Name',
    'Event Date',
    'Event Time',
    'Image URL/Drive ID',
    'Slide URL',
    'Notes'
  ];

  // Clear existing content
  sheet.clear();

  // Set headers
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Format headers
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#FFE700');
  headerRange.setHorizontalAlignment('center');

  // Set column widths
  sheet.setColumnWidth(COL.ACTION, 140);
  sheet.setColumnWidth(COL.STATUS, 120);
  sheet.setColumnWidth(COL.SESSION_TITLE, 180);
  sheet.setColumnWidth(COL.SPEAKER_NAME, 150);
  sheet.setColumnWidth(COL.EVENT_DATE, 180);
  sheet.setColumnWidth(COL.EVENT_TIME, 120);
  sheet.setColumnWidth(COL.IMAGE_URL, 200);
  sheet.setColumnWidth(COL.SLIDE_URL, 280);
  sheet.setColumnWidth(COL.NOTES, 200);

  // Add example row
  addRowWithDropdown(sheet, 2, 'Biz Dev Training', 'Azeem', 'Wednesday, September 17', '11AM-12PM ET', '', 'Example session');

  // Freeze header row
  sheet.setFrozenRows(1);
}

/**
 * Adds a new row with action dropdown
 */
function addRowWithDropdown(sheet, row, sessionTitle, speakerName, eventDate, eventTime, imageUrl, notes) {
  // Create dropdown validation for Action column
  var actionRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([ACTIONS.GENERATE, ACTIONS.ANNOUNCE, ACTIONS.BOTH], true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(row, COL.ACTION).setDataValidation(actionRule);

  // Set data
  if (sessionTitle) sheet.getRange(row, COL.SESSION_TITLE).setValue(sessionTitle);
  if (speakerName) sheet.getRange(row, COL.SPEAKER_NAME).setValue(speakerName);
  if (eventDate) sheet.getRange(row, COL.EVENT_DATE).setValue(eventDate);
  if (eventTime) sheet.getRange(row, COL.EVENT_TIME).setValue(eventTime);
  if (imageUrl) sheet.getRange(row, COL.IMAGE_URL).setValue(imageUrl);
  if (notes) sheet.getRange(row, COL.NOTES).setValue(notes);

  // Set initial status
  sheet.getRange(row, COL.STATUS).setValue('Ready');
}

/**
 * Adds an empty row with the action dropdown
 */
function addEmptyRow() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = Math.max(sheet.getLastRow(), 1);
  addRowWithDropdown(sheet, lastRow + 1, '', '', '', '', '', '');
}

/**
 * Generates a slide for a specific row
 */
function generateSlideForRow(sheet, row) {
  var data = sheet.getRange(row, 1, 1, 9).getValues()[0];

  var sessionTitle = data[COL.SESSION_TITLE - 1];
  var speakerName = data[COL.SPEAKER_NAME - 1];
  var eventDate = data[COL.EVENT_DATE - 1];
  var eventTime = data[COL.EVENT_TIME - 1];
  var imageUrl = data[COL.IMAGE_URL - 1];

  if (!speakerName) {
    sheet.getRange(row, COL.STATUS).setValue('❌ Need name');
    sheet.getRange(row, COL.STATUS).setBackground('#FFB6C1');
    return false;
  }

  // Update status
  sheet.getRange(row, COL.STATUS).setValue('⏳ Generating...');
  sheet.getRange(row, COL.STATUS).setBackground('#FFFACD');
  SpreadsheetApp.flush();

  try {
    // Generate the slide
    var slideUrl = createBizDevSlide(sessionTitle, speakerName, eventDate, eventTime, imageUrl);

    // Update the spreadsheet with the slide URL
    sheet.getRange(row, COL.SLIDE_URL).setValue(slideUrl);
    sheet.getRange(row, COL.STATUS).setValue('✅ Slide ready');
    sheet.getRange(row, COL.STATUS).setBackground('#90EE90');
    return true;

  } catch (e) {
    sheet.getRange(row, COL.STATUS).setValue('❌ ' + e.message.substring(0, 20));
    sheet.getRange(row, COL.STATUS).setBackground('#FFB6C1');
    Logger.log('Error generating slide: ' + e.message);
    return false;
  }
}

/**
 * Announces a session for a specific row
 */
function announceSessionForRow(sheet, row) {
  var data = sheet.getRange(row, 1, 1, 9).getValues()[0];

  var sessionTitle = data[COL.SESSION_TITLE - 1];
  var speakerName = data[COL.SPEAKER_NAME - 1];
  var eventDate = data[COL.EVENT_DATE - 1];
  var eventTime = data[COL.EVENT_TIME - 1];
  var slideUrl = data[COL.SLIDE_URL - 1];

  if (!slideUrl) {
    sheet.getRange(row, COL.STATUS).setValue('❌ No slide');
    sheet.getRange(row, COL.STATUS).setBackground('#FFB6C1');
    return false;
  }

  // Update status
  sheet.getRange(row, COL.STATUS).setValue('📢 Announcing...');
  sheet.getRange(row, COL.STATUS).setBackground('#FFFACD');
  SpreadsheetApp.flush();

  try {
    // TODO: Add your actual announcement logic here (Discord webhook, etc.)
    var announcementText = formatAnnouncementText(sessionTitle, speakerName, eventDate, eventTime, slideUrl);

    // For now, just log it
    Logger.log('Announcing: ' + announcementText);

    // Update status
    sheet.getRange(row, COL.STATUS).setValue('✅ Announced');
    sheet.getRange(row, COL.STATUS).setBackground('#90EE90');
    return true;

  } catch (e) {
    sheet.getRange(row, COL.STATUS).setValue('❌ Failed');
    sheet.getRange(row, COL.STATUS).setBackground('#FFB6C1');
    Logger.log('Error announcing: ' + e.message);
    return false;
  }
}

/**
 * Generates slides for all rows that don't have one yet
 */
function generateAllMissingSlides() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('No data rows found.');
    return;
  }

  var count = 0;
  for (var row = 2; row <= lastRow; row++) {
    var speakerName = sheet.getRange(row, COL.SPEAKER_NAME).getValue();
    var existingSlideUrl = sheet.getRange(row, COL.SLIDE_URL).getValue();

    if (speakerName && !existingSlideUrl) {
      if (generateSlideForRow(sheet, row)) {
        count++;
      }
    }
  }

  SpreadsheetApp.getUi().alert('Generated ' + count + ' new slide(s).');
}

/**
 * Announces all unannounced sessions that have slides
 */
function announceAllUnannounced() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('No data rows found.');
    return;
  }

  var count = 0;
  for (var row = 2; row <= lastRow; row++) {
    var slideUrl = sheet.getRange(row, COL.SLIDE_URL).getValue();
    var status = sheet.getRange(row, COL.STATUS).getValue();

    if (slideUrl && !status.includes('Announced')) {
      if (announceSessionForRow(sheet, row)) {
        count++;
      }
    }
  }

  SpreadsheetApp.getUi().alert('Announced ' + count + ' session(s).');
}

/**
 * Formats the announcement text
 */
function formatAnnouncementText(sessionTitle, speakerName, eventDate, eventTime, slideUrl) {
  var title = sessionTitle || 'Biz Dev Training';
  return '🍕 **PizzaDAO ' + title + '**\n\n' +
         '📚 **with ' + speakerName + '!**\n\n' +
         '📅 ' + eventDate + '\n' +
         '⏰ ' + eventTime + '\n\n' +
         '🔗 Join us at discord.pizzadao.xyz\n\n' +
         (slideUrl ? '📊 Slide: ' + slideUrl : '');
}

// ============================================================
// SLIDE GENERATION FUNCTIONS
// ============================================================

/**
 * Creates a Biz Dev Training slide with all content
 */
function createBizDevSlide(sessionTitle, speakerName, eventDate, eventTime, imageUrl) {
  sessionTitle = sessionTitle || 'Biz Dev Training';
  speakerName = speakerName || 'Speaker Name';
  eventDate = eventDate || 'Date TBD';
  eventTime = eventTime || 'Time TBD';

  // Copy the blank square template
  var templateFile = DriveApp.getFileById(TEMPLATE_ID);
  var newFile = templateFile.makeCopy('PizzaDAO ' + sessionTitle + ' - ' + speakerName);
  var presentation = SlidesApp.openById(newFile.getId());
  var slide = presentation.getSlides()[0];

  // Get slide dimensions
  var pageWidth = presentation.getPageWidth();
  var pageHeight = presentation.getPageHeight();

  // Set yellow background
  slide.getBackground().setSolidFill(YELLOW_BG);

  // === HEADER: PizzaDAO logo ===
  var logoFile = DriveApp.getFileById(LOGO_FILE_ID);
  var logoBlob = logoFile.getBlob();
  var logoImage = slide.insertImage(logoBlob);

  // Get natural dimensions and scale proportionally (15% smaller)
  var naturalWidth = logoImage.getWidth();
  var naturalHeight = logoImage.getHeight();
  var targetHeight = 37.90;
  var scaleFactor = targetHeight / naturalHeight;
  var targetWidth = naturalWidth * scaleFactor;

  logoImage.setWidth(targetWidth);
  logoImage.setHeight(targetHeight);
  logoImage.setLeft(pageWidth / 2 - targetWidth / 2);
  logoImage.setTop(30);

  // === Education Crew Presents (15% larger) ===
  var presentsText = slide.insertTextBox('Education Crew Presents:');
  presentsText.setLeft(195);
  presentsText.setTop(62);
  presentsText.setWidth(330);
  presentsText.setHeight(40);
  presentsText.getText().getTextStyle()
    .setFontSize(21)
    .setBold(true)
    .setForegroundColor(BLACK)
    .setFontFamily('Rubik');
  presentsText.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

  // Format the title text (uppercase, split into two lines if possible)
  var titleText = formatTitleForSlide(sessionTitle);

  // === MAIN TITLE: Blue shadow layer ===
  var titleShadow = slide.insertTextBox(titleText);
  titleShadow.setLeft(92);
  titleShadow.setTop(124.90);
  titleShadow.setWidth(550);
  titleShadow.setHeight(220);
  titleShadow.getText().getTextStyle()
    .setFontSize(90)
    .setForegroundColor(DARK_BLUE)
    .setFontFamily('Rubik');
  titleShadow.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
  var titleShadowId = titleShadow.getObjectId();

  // === MAIN TITLE: Coral red front layer ===
  var titleMain = slide.insertTextBox(titleText);
  titleMain.setLeft(85);
  titleMain.setTop(116.90);
  titleMain.setWidth(550);
  titleMain.setHeight(220);
  titleMain.getText().getTextStyle()
    .setFontSize(90)
    .setForegroundColor(CORAL_RED)
    .setFontFamily('Rubik');
  titleMain.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
  var titleMainId = titleMain.getObjectId();

  // Use Advanced Slides API to set font weight to 900 (Black)
  presentation.saveAndClose();
  setFontWeightBlack(newFile.getId(), [titleShadowId, titleMainId]);
  presentation = SlidesApp.openById(newFile.getId());
  slide = presentation.getSlides()[0];

  // === Speaker name ===
  var withText = slide.insertTextBox('with ' + speakerName + '!');
  withText.setLeft(135);
  withText.setTop(275.09);
  withText.setWidth(450);
  withText.setHeight(50);
  withText.getText().getTextStyle()
    .setFontSize(32)
    .setBold(true)
    .setItalic(true)
    .setForegroundColor(BLACK)
    .setFontFamily('Rubik');
  withText.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

  // === Photo or placeholder ===
  var photoLeft = 260;
  var photoTop = 351.38;
  var photoWidth = 200;
  var photoHeight = 200;

  if (imageUrl) {
    try {
      var image;
      // Check if it's a Google Drive file ID (no slashes or dots)
      if (imageUrl.toString().match(/^[a-zA-Z0-9_-]+$/) && imageUrl.length > 20) {
        var file = DriveApp.getFileById(imageUrl);
        image = slide.insertImage(file.getBlob());
      } else {
        image = slide.insertImage(imageUrl);
      }
      image.setLeft(photoLeft);
      image.setTop(photoTop);
      image.setWidth(photoWidth);
      image.setHeight(photoHeight);
    } catch (e) {
      Logger.log('Could not insert image: ' + e.message);
      insertPhotoPlaceholder(slide, photoLeft, photoTop, photoWidth, photoHeight);
    }
  } else {
    insertPhotoPlaceholder(slide, photoLeft, photoTop, photoWidth, photoHeight);
  }

  // === Event date ===
  var formattedDate = formatDateForSlide(eventDate);
  var dateText = slide.insertTextBox(formattedDate);
  dateText.setLeft(180);
  dateText.setTop(569.38);
  dateText.setWidth(360);
  dateText.setHeight(32);
  dateText.getText().getTextStyle()
    .setFontSize(20)
    .setBold(true)
    .setForegroundColor(BLACK)
    .setFontFamily('Rubik');
  dateText.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

  // === Event time ===
  var timeText = slide.insertTextBox(eventTime);
  timeText.setLeft(240);
  timeText.setTop(599.38);
  timeText.setWidth(240);
  timeText.setHeight(30);
  timeText.getText().getTextStyle()
    .setFontSize(18)
    .setBold(true)
    .setForegroundColor(BLACK)
    .setFontFamily('Rubik');
  timeText.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

  // === Discord link ===
  var discordText = slide.insertTextBox('discord.pizzadao.xyz');
  discordText.setLeft(220);
  discordText.setTop(629.38);
  discordText.setWidth(280);
  discordText.setHeight(30);
  discordText.getText().getTextStyle()
    .setFontSize(20)
    .setBold(true)
    .setForegroundColor(BLACK)
    .setFontFamily('Rubik');
  discordText.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

  Logger.log('Presentation created: ' + presentation.getUrl());
  return presentation.getUrl();
}

/**
 * Helper function to insert a photo placeholder
 */
function insertPhotoPlaceholder(slide, left, top, width, height) {
  var placeholder = slide.insertShape(SlidesApp.ShapeType.RECTANGLE);
  placeholder.setLeft(left);
  placeholder.setTop(top);
  placeholder.setWidth(width);
  placeholder.setHeight(height);
  placeholder.getFill().setSolidFill(CORAL_RED);
  placeholder.getBorder().setTransparent();
  placeholder.getText().setText('INSERT\nPHOTO\nHERE');
  placeholder.getText().getTextStyle()
    .setFontSize(16)
    .setBold(true)
    .setForegroundColor('#FFFFFF')
    .setFontFamily('Rubik');
  placeholder.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
  return placeholder;
}

/**
 * Helper function to format session title for slide display
 * Converts to uppercase and splits into two lines if possible
 */
function formatTitleForSlide(sessionTitle) {
  if (!sessionTitle) {
    return 'BIZ DEV\nTRAINING';
  }

  var upper = sessionTitle.toUpperCase();
  var words = upper.split(' ');

  // If 2 or more words, split roughly in half
  if (words.length >= 2) {
    var midpoint = Math.ceil(words.length / 2);
    var line1 = words.slice(0, midpoint).join(' ');
    var line2 = words.slice(midpoint).join(' ');
    return line1 + '\n' + line2;
  }

  return upper;
}

/**
 * Helper function to format date for slide display
 * Handles Date objects and strings
 */
function formatDateForSlide(dateValue) {
  if (!dateValue) {
    return 'Date TBD';
  }

  // If it's a Date object, format it nicely
  if (dateValue instanceof Date) {
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];

    var dayName = days[dateValue.getDay()];
    var monthName = months[dateValue.getMonth()];
    var dayNum = dateValue.getDate();

    return dayName + ', ' + monthName + ' ' + dayNum;
  }

  // If it's already a string, return as-is
  return dateValue.toString();
}

/**
 * Helper function to read element positions from a reference slide
 * Run this to get the positions from your manually adjusted slide
 */
function readSlidePositions() {
  var presentationId = '1_dR0Vgvta5uyjgewRnzcBaShhjdacnZwYGzUnNYiItY';
  var presentation = SlidesApp.openById(presentationId);
  var slide = presentation.getSlides()[0];
  var elements = slide.getPageElements();

  Logger.log('=== SLIDE ELEMENT POSITIONS ===');
  Logger.log('Page width: ' + presentation.getPageWidth());
  Logger.log('Page height: ' + presentation.getPageHeight());
  Logger.log('');

  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    var type = el.getPageElementType();
    var left = el.getLeft();
    var top = el.getTop();
    var width = el.getWidth();
    var height = el.getHeight();

    var text = '';
    if (type == SlidesApp.PageElementType.SHAPE) {
      try {
        text = el.asShape().getText().asString().substring(0, 30);
      } catch(e) {}
    } else if (type == SlidesApp.PageElementType.IMAGE) {
      text = '[IMAGE]';
    }

    Logger.log('Element ' + i + ': ' + type);
    Logger.log('  Text: ' + text);
    Logger.log('  Left: ' + left + ', Top: ' + top);
    Logger.log('  Width: ' + width + ', Height: ' + height);
    Logger.log('');
  }
}

/**
 * Helper function to set font weight to 900 (Black) and line spacing using Advanced Slides API
 */
function setFontWeightBlack(presentationId, objectIds) {
  var requests = [];

  for (var i = 0; i < objectIds.length; i++) {
    // Set font weight to 900 (Black)
    requests.push({
      updateTextStyle: {
        objectId: objectIds[i],
        style: {
          weightedFontFamily: {
            fontFamily: 'Rubik',
            weight: 900
          }
        },
        textRange: {
          type: 'ALL'
        },
        fields: 'weightedFontFamily'
      }
    });

    // Set line spacing to 75%
    requests.push({
      updateParagraphStyle: {
        objectId: objectIds[i],
        style: {
          lineSpacing: 75
        },
        textRange: {
          type: 'ALL'
        },
        fields: 'lineSpacing'
      }
    });
  }

  Slides.Presentations.batchUpdate({requests: requests}, presentationId);
}
