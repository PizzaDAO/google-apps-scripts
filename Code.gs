/**
 * Creates a PizzaDAO Biz Dev Training promotional slide
 *
 * To use:
 * 1. Open Google Apps Script (script.google.com)
 * 2. Paste this code
 * 3. Run createBizDevTrainingSlide()
 * 4. Authorize when prompted
 * 5. Check your Google Drive for the new presentation
 */

function createBizDevTrainingSlide() {
  // Colors extracted from original image
  var yellowBg = '#FFCC00';      // Golden yellow background
  var coralRed = '#E54D4D';      // Coral red for main title
  var darkBlue = '#3949AB';      // Blue for 3D shadow
  var black = '#000000';

  // Create a new presentation with square dimensions
  // Google Slides uses points: 720 points = 10 inches
  var presentation = SlidesApp.create('PizzaDAO Biz Dev Training - Azeem');

  // Set page size to square (10 inches x 10 inches = 720pt x 720pt)
  var pageWidth = 720;
  var pageHeight = 720;
  presentation.getPageWidth(); // Need to use the Slides API for custom size

  // Unfortunately, SlidesApp doesn't support custom page sizes directly
  // We need to use the Advanced Slides API
  // For now, we'll work with standard size and note this limitation
  // OR use the Slides API service

  var slide = presentation.getSlides()[0];

  // Remove all default placeholder elements
  var pageElements = slide.getPageElements();
  for (var i = pageElements.length - 1; i >= 0; i--) {
    pageElements[i].remove();
  }

  // Get actual page dimensions
  pageWidth = presentation.getPageWidth();
  pageHeight = presentation.getPageHeight();

  // Set yellow background
  slide.getBackground().setSolidFill(yellowBg);

  // === HEADER SECTION ===

  // PizzaDAO logo placeholder
  var logoText = slide.insertTextBox('🍕 PizzaDAO');
  logoText.setLeft(pageWidth / 2 - 100);
  logoText.setTop(30);
  logoText.setWidth(200);
  logoText.setHeight(50);
  var logoTextRange = logoText.getText();
  logoTextRange.getTextStyle()
    .setFontSize(24)
    .setBold(true)
    .setForegroundColor(black)
    .setFontFamily('Rubik');
  logoTextRange.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

  // "Education Crew Presents:" text
  var presentsText = slide.insertTextBox('Education Crew Presents:');
  presentsText.setLeft(pageWidth / 2 - 150);
  presentsText.setTop(75);
  presentsText.setWidth(300);
  presentsText.setHeight(35);
  var presentsTextRange = presentsText.getText();
  presentsTextRange.getTextStyle()
    .setFontSize(18)
    .setBold(true)
    .setForegroundColor(black)
    .setFontFamily('Rubik');
  presentsTextRange.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

  // === MAIN TITLE - "BIZ DEV TRAINING" ===
  // Blue shadow/background text (offset slightly down and right)
  var titleShadow = slide.insertTextBox('BIZ DEV\nTRAINING');
  titleShadow.setLeft(pageWidth / 2 - 193);
  titleShadow.setTop(118);
  titleShadow.setWidth(400);
  titleShadow.setHeight(180);
  var titleShadowRange = titleShadow.getText();
  titleShadowRange.getTextStyle()
    .setFontSize(60)
    .setBold(true)
    .setForegroundColor(darkBlue)
    .setFontFamily('Rubik');
  titleShadowRange.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

  // Main coral/red title text
  var titleMain = slide.insertTextBox('BIZ DEV\nTRAINING');
  titleMain.setLeft(pageWidth / 2 - 200);
  titleMain.setTop(110);
  titleMain.setWidth(400);
  titleMain.setHeight(180);
  var titleMainRange = titleMain.getText();
  titleMainRange.getTextStyle()
    .setFontSize(60)
    .setBold(true)
    .setForegroundColor(coralRed)
    .setFontFamily('Rubik');
  titleMainRange.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

  // === "with Azeem!" text ===
  var withText = slide.insertTextBox('with Azeem!');
  withText.setLeft(pageWidth / 2 - 120);
  withText.setTop(290);
  withText.setWidth(240);
  withText.setHeight(45);
  var withTextRange = withText.getText();
  withTextRange.getTextStyle()
    .setFontSize(28)
    .setBold(true)
    .setItalic(true)
    .setForegroundColor(black)
    .setFontFamily('Rubik');
  withTextRange.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

  // === PHOTO PLACEHOLDER ===
  var photoPlaceholder = slide.insertShape(SlidesApp.ShapeType.RECTANGLE);
  photoPlaceholder.setLeft(pageWidth / 2 - 100);
  photoPlaceholder.setTop(340);
  photoPlaceholder.setWidth(200);
  photoPlaceholder.setHeight(200);
  photoPlaceholder.getFill().setSolidFill(coralRed);
  photoPlaceholder.getBorder().setTransparent();

  // Add text inside placeholder
  var photoText = photoPlaceholder.getText();
  photoText.setText('INSERT\nAZEEM\nPHOTO\nHERE');
  photoText.getTextStyle()
    .setFontSize(14)
    .setBold(true)
    .setForegroundColor('#FFFFFF')
    .setFontFamily('Rubik');
  photoText.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

  // === EVENT DETAILS ===
  var dateText = slide.insertTextBox('Wednesday, September 17');
  dateText.setLeft(pageWidth / 2 - 180);
  dateText.setTop(555);
  dateText.setWidth(360);
  dateText.setHeight(35);
  var dateTextRange = dateText.getText();
  dateTextRange.getTextStyle()
    .setFontSize(20)
    .setBold(true)
    .setForegroundColor(black)
    .setFontFamily('Rubik');
  dateTextRange.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

  var timeText = slide.insertTextBox('11AM-12PM ET');
  timeText.setLeft(pageWidth / 2 - 120);
  timeText.setTop(585);
  timeText.setWidth(240);
  timeText.setHeight(30);
  var timeTextRange = timeText.getText();
  timeTextRange.getTextStyle()
    .setFontSize(18)
    .setBold(true)
    .setForegroundColor(black)
    .setFontFamily('Rubik');
  timeTextRange.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

  var discordText = slide.insertTextBox('discord.pizzadao.xyz');
  discordText.setLeft(pageWidth / 2 - 140);
  discordText.setTop(612);
  discordText.setWidth(280);
  discordText.setHeight(30);
  var discordTextRange = discordText.getText();
  discordTextRange.getTextStyle()
    .setFontSize(18)
    .setBold(true)
    .setForegroundColor(black)
    .setFontFamily('Rubik');
  discordTextRange.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

  // Log the presentation URL
  Logger.log('Presentation created: ' + presentation.getUrl());
  Logger.log('NOTE: To make the slide square, go to File > Page setup > Custom and set to 10 x 10 inches');

  return presentation.getUrl();
}

/**
 * Creates a square presentation using Advanced Slides API
 * Requires enabling "Google Slides API" in Services
 */
function createSquareBizDevSlide() {
  // Colors extracted from original image
  var yellowBg = '#FFCC00';      // Golden yellow background
  var coralRed = '#E54D4D';      // Coral red for main title
  var darkBlue = '#3949AB';      // Blue for 3D shadow
  var black = '#000000';

  // Create presentation with Slides API
  var presentation = Slides.Presentations.create({
    title: 'PizzaDAO Biz Dev Training - Azeem'
  });

  var presentationId = presentation.presentationId;
  var slideId = presentation.slides[0].objectId;

  // Square dimensions in points (10 inches = 720 points)
  var pageWidth = 720;
  var pageHeight = 720;

  // Build batch update requests
  var requests = [];

  // Set page size to square FIRST
  requests.push({
    updatePresentationProperties: {
      presentationProperties: {
        pageSize: {
          width: { magnitude: pageWidth, unit: 'PT' },
          height: { magnitude: pageHeight, unit: 'PT' }
        }
      },
      fields: 'pageSize'
    }
  });

  // Delete default placeholder elements
  presentation.slides[0].pageElements.forEach(function(element) {
    requests.push({
      deleteObject: {
        objectId: element.objectId
      }
    });
  });

  // Set yellow background
  requests.push({
    updatePageProperties: {
      objectId: slideId,
      pageProperties: {
        pageBackgroundFill: {
          solidFill: {
            color: {
              rgbColor: hexToRgb(yellowBg)
            }
          }
        }
      },
      fields: 'pageBackgroundFill'
    }
  });

  // Helper function to create text box request
  function createTextBox(id, text, left, top, width, height, fontSize, fontFamily, bold, italic, color) {
    requests.push({
      createShape: {
        objectId: id,
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: slideId,
          size: {
            width: { magnitude: width, unit: 'PT' },
            height: { magnitude: height, unit: 'PT' }
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: left,
            translateY: top,
            unit: 'PT'
          }
        }
      }
    });
    requests.push({
      insertText: {
        objectId: id,
        text: text
      }
    });
    requests.push({
      updateTextStyle: {
        objectId: id,
        style: {
          fontFamily: fontFamily,
          fontSize: { magnitude: fontSize, unit: 'PT' },
          bold: bold,
          italic: italic || false,
          foregroundColor: {
            opaqueColor: {
              rgbColor: hexToRgb(color)
            }
          }
        },
        fields: 'fontFamily,fontSize,bold,italic,foregroundColor'
      }
    });
    requests.push({
      updateParagraphStyle: {
        objectId: id,
        style: {
          alignment: 'CENTER'
        },
        fields: 'alignment'
      }
    });
  }

  // PizzaDAO header
  createTextBox('logo_text', '🍕 PizzaDAO', pageWidth/2 - 100, 30, 200, 50, 24, 'Rubik', true, false, black);

  // Education Crew Presents
  createTextBox('presents_text', 'Education Crew Presents:', pageWidth/2 - 150, 80, 300, 35, 18, 'Rubik', true, false, black);

  // Title shadow (blue)
  createTextBox('title_shadow', 'BIZ DEV\nTRAINING', pageWidth/2 - 193, 128, 400, 180, 60, 'Rubik', true, false, darkBlue);

  // Title main (coral)
  createTextBox('title_main', 'BIZ DEV\nTRAINING', pageWidth/2 - 200, 120, 400, 180, 60, 'Rubik', true, false, coralRed);

  // With Azeem
  createTextBox('with_text', 'with Azeem!', pageWidth/2 - 120, 300, 240, 45, 28, 'Rubik', true, true, black);

  // Photo placeholder rectangle
  requests.push({
    createShape: {
      objectId: 'photo_placeholder',
      shapeType: 'RECTANGLE',
      elementProperties: {
        pageObjectId: slideId,
        size: {
          width: { magnitude: 200, unit: 'PT' },
          height: { magnitude: 200, unit: 'PT' }
        },
        transform: {
          scaleX: 1,
          scaleY: 1,
          translateX: pageWidth/2 - 100,
          translateY: 350,
          unit: 'PT'
        }
      }
    }
  });
  requests.push({
    updateShapeProperties: {
      objectId: 'photo_placeholder',
      shapeProperties: {
        shapeBackgroundFill: {
          solidFill: {
            color: {
              rgbColor: hexToRgb(coralRed)
            }
          }
        },
        outline: {
          propertyState: 'NOT_RENDERED'
        }
      },
      fields: 'shapeBackgroundFill,outline'
    }
  });
  requests.push({
    insertText: {
      objectId: 'photo_placeholder',
      text: 'INSERT\nAZEEM\nPHOTO\nHERE'
    }
  });
  requests.push({
    updateTextStyle: {
      objectId: 'photo_placeholder',
      style: {
        fontFamily: 'Rubik',
        fontSize: { magnitude: 14, unit: 'PT' },
        bold: true,
        foregroundColor: {
          opaqueColor: {
            rgbColor: { red: 1, green: 1, blue: 1 }
          }
        }
      },
      fields: 'fontFamily,fontSize,bold,foregroundColor'
    }
  });
  requests.push({
    updateParagraphStyle: {
      objectId: 'photo_placeholder',
      style: {
        alignment: 'CENTER'
      },
      fields: 'alignment'
    }
  });

  // Event details
  createTextBox('date_text', 'Wednesday, September 17', pageWidth/2 - 180, 565, 360, 35, 20, 'Rubik', true, false, black);
  createTextBox('time_text', '11AM-12PM ET', pageWidth/2 - 120, 598, 240, 30, 18, 'Rubik', true, false, black);
  createTextBox('discord_text', 'discord.pizzadao.xyz', pageWidth/2 - 140, 628, 280, 30, 18, 'Rubik', true, false, black);

  // Execute batch update
  Slides.Presentations.batchUpdate({ requests: requests }, presentationId);

  var url = 'https://docs.google.com/presentation/d/' + presentationId;
  Logger.log('Square presentation created: ' + url);
  return url;
}

/**
 * Convert hex color to RGB object for Slides API
 */
function hexToRgb(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    red: parseInt(result[1], 16) / 255,
    green: parseInt(result[2], 16) / 255,
    blue: parseInt(result[3], 16) / 255
  } : null;
}
