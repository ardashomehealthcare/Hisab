// HISAB — Google Sheets backend
//
// SETUP (one time):
// 1. Open your Google Sheet (sheets.google.com -> new blank sheet, name it "Hisab").
// 2. Menu: Extensions -> Apps Script. Select ALL existing code, delete it,
//    then paste THIS whole file. Do not leave any leftover text.
// 3. Click the save icon.
// 4. Deploy -> New deployment -> gear -> Web app.
//      Execute as: Me
//      Who has access: Anyone
// 5. Deploy -> Authorize (Advanced -> Go to project -> Allow).
// 6. Copy the Web app URL (ends with /exec) and paste it in the Hisab app
//    -> "Google Sheet" tab -> Save & test connection.
//
// Tabs created automatically:
// Employees, DutyLeave, EmployeePayments, ClientReceipts, Expenses

var SPREADSHEET_ID = '1VV5TZyNEpBHS6gnaBU7XujuBdtzBEQwqofMmHzmKFAY';

var SHEETS = ['Employees', 'DutyLeave', 'EmployeePayments', 'ClientReceipts', 'Expenses'];

function getSpreadsheet() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('Cannot open spreadsheet. Set SPREADSHEET_ID.');
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name, headers) {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (headers && headers.length && sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#dce6f7');
    sh.setFrozenRows(1);
  }
  return sh;
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'ping';
  if (action === 'ping') {
    try {
      return json({ ok: true, msg: 'Connected to sheet: ' + getSpreadsheet().getName() });
    } catch (err) {
      return json({
        ok: false,
        error: 'Cannot open spreadsheet. Check SPREADSHEET_ID and that this Google account owns/edits it. ' + String(err)
      });
    }
  }
  if (action === 'getAll') {
    var out = {};
    SHEETS.forEach(function (name) {
      var ss = getSpreadsheet();
      var sh = ss.getSheetByName(name);
      if (!sh || sh.getLastRow() < 2) {
        out[name] = [];
        return;
      }
      var vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
      out[name] = vals.map(function (row) {
        return row.map(function (c) {
          if (c instanceof Date) {
            return Utilities.formatDate(c, Session.getScriptTimeZone(), 'yyyy-MM-dd');
          }
          return String(c);
        });
      });
    });
    return json({ ok: true, data: out });
  }
  return json({ ok: false, error: 'unknown action' });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (body.action === 'append') {
      var sh = getSheet(body.sheet, body.headers);
      sh.appendRow(body.row);
      return json({ ok: true });
    }

    if (body.action === 'replaceAll') {
      Object.keys(body.data).forEach(function (name) {
        var block = body.data[name];
        var sh = getSheet(name, block.headers);
        // rewrite header row too (in case columns changed in a new app version)
        sh.getRange(1, 1, 1, block.headers.length).setValues([block.headers])
          .setFontWeight('bold').setBackground('#dce6f7');
        var last = sh.getLastRow();
        if (last > 1) sh.getRange(2, 1, last - 1, sh.getMaxColumns()).clearContent();
        if (block.rows && block.rows.length) {
          sh.getRange(2, 1, block.rows.length, block.headers.length).setValues(block.rows);
        }
      });
      return json({ ok: true });
    }

    return json({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}
