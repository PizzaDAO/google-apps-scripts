const props = PropertiesService.getScriptProperties();
const TEMPLATE_SPREADSHEET_ID = '1mzh9FXF4jiJOcL_45uxtLuohp5hIPbT006AAVZ_zT3U';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Custom Tools')
    .addItem('Create shared copy & link cell', 'createSharedCopyForSelectedCell')
    .addToUi();
}

function createSharedCopyForSelectedCell() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getActiveSheet();
  const cell = sheet.getActiveCell();

  if (!cell) {
    ui.alert('Please select a cell before running this function.');
    return;
  }

  let displayText = cell.getDisplayValue().trim();
  if (!displayText) {
    const response = ui.prompt('Sheet Name Required', 'Enter name:', ui.ButtonSet.OK_CANCEL);
    if (response.getSelectedButton() !== ui.Button.OK) return;
    displayText = response.getResponseText().trim();
    cell.setValue(displayText);
  }

  const templateFile = DriveApp.getFileById(TEMPLATE_SPREADSHEET_ID);
  const parentFolder = templateFile.getParents().hasNext() ? templateFile.getParents().next() : DriveApp.getRootFolder();
  const copyFile = templateFile.makeCopy(displayText, parentFolder);
  
  copyFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);

  const richText = SpreadsheetApp.newRichTextValue()
    .setText(displayText)
    .setLinkUrl(copyFile.getUrl())
    .build();

  cell.setRichTextValue(richText);
}