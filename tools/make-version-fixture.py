#!/usr/bin/env python3
"""Builds tools/fixtures/sheet-version.xlsx — a small stand-in for the file Google
hands out for one PAST VERSION of a Sheet (File → Download → Microsoft Excel, or
.../export?id=<Sheet>&revision=<n>&exportFormat=xlsx).

It is the same shape as Google's export on purpose:
  * a zip with xl/workbook.xml, xl/_rels/workbook.xml.rels, xl/sharedStrings.xml
    and one xl/worksheets/sheetN.xml per tab;
  * cells as <c r="A1" t="s"><v>3</v></c> (shared strings) and plain numbers;
  * dates as real dates — i.e. serial numbers (Google stores them that way when
    they were typed into the Sheet by hand) so the app's own converter is tested.

The names and amounts are made up: no real person or client is in this file.
Run it from the repository root:  python3 tools/make-version-fixture.py
"""

import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'fixtures', 'sheet-version.xlsx')

EPOCH = (1899, 12, 30)          # Google Sheets serial 0


def serial(y, m, d):
    import datetime
    return (datetime.date(y, m, d) - datetime.date(*EPOCH)).days


def col(i):
    s = ''
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


SHEETS = []


def sheet(name, rows):
    SHEETS.append((name, rows))


sheet('Employees', [
    ['id', 'name', 'phone', 'wageType', 'wageAmount', 'dutyHours', 'dutyTime',
     'joinDate', 'clientDutyStartDate', 'client', 'clientPhone', 'clientDeal', 'savedAt', 'updatedAt'],
    ['FIX-E1', 'Test Person One', '9876500001', 'monthly', 11000, '24', '08:00',
     serial(2026, 8, 1), serial(2026, 8, 1), 'Test Client A', '9876500009', 13000,
     '2026-08-01, 09:00:00 am', '2026-08-01T03:30:00.000Z'],
    ['FIX-E2', 'Test Person Two', '', 'daily', 700, '', '', '', '', '', '', '',
     '2026-08-02, 09:00:00 am', '2026-08-02T03:30:00.000Z'],
])
sheet('DutyLeave', [
    ['id', 'empName', 'type', 'from', 'fromTime', 'to', 'toTime', 'days', 'client', 'savedAt',
     'forEmp', 'wageType', 'wageAmount', 'reason', 'notes', 'updatedAt'],
    ['FIX-D1', 'Test Person One', 'leave', serial(2026, 9, 20), '08:00', serial(2026, 9, 22), '08:00',
     '2', '', '2026-09-20, 10:00:00 am', '', '', '', '', '', '2026-09-20T04:30:00.000Z'],
])
sheet('EmployeePayments', [
    ['id', 'empName', 'date', 'amount', 'payType', 'mode', 'savedAt', 'periodFrom', 'periodTo',
     'invoiceNo', 'summary', 'balance', 'updatedAt'],
    ['FIX-P1', 'Test Person One', serial(2026, 9, 5), 3500, 'Salary', 'Cash',
     '2026-09-05, 06:00:00 pm', serial(2026, 9, 1), serial(2026, 9, 5), 'PAY-0007', '', '', '2026-09-05T12:30:00.000Z'],
])
sheet('ClientReceipts', [
    ['id', 'client', 'clientPhone', 'date', 'amount', 'empName', 'mode', 'savedAt',
     'clientAddress', 'invoiceNo', 'dealAmount', 'updatedAt'],
    ['FIX-R1', 'Test Client A', '9876500009', serial(2026, 9, 3), 13000, 'Test Person One', 'UPI',
     '2026-09-03, 11:00:00 am', 'Test address', 'INV-0011', 13000, '2026-09-03T05:30:00.000Z'],
    ['FIX-R2', 'Test Client B', '', serial(2026, 9, 8), 900, '', 'Cash',
     '2026-09-08, 11:00:00 am', '', 'INV-0012', 1000, '2026-09-08T05:30:00.000Z'],
])
sheet('Expenses', [
    ['id', 'item', 'date', 'amount', 'savedAt', 'updatedAt'],
    ['FIX-X1', 'Test expense', serial(2026, 9, 12), 250, '2026-09-12, 05:00:00 pm', '2026-09-12T11:30:00.000Z'],
    ['', '', '', '', '', ''],                               # a blank row left behind in the tab
    ['FIX-X2', 'Diesel', serial(2026, 9, 13), 400, '2026-09-13, 05:00:00 pm', '2026-09-13T11:30:00.000Z'],
])


def esc(v):
    return (str(v).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def build():
    shared, at = [], {}
    for _, rows in SHEETS:
        for row in rows:
            for v in row:
                if isinstance(v, str) and v not in at:
                    at[v] = len(shared)
                    shared.append(v)

    def cell(ci, ri, v):
        ref = '%s%d' % (col(ci), ri)
        if v == '':
            return '<c r="%s"/>' % ref                      # an empty cell, written out (Excel does this)
        if isinstance(v, (int, float)):
            return '<c r="%s"><v>%s</v></c>' % (ref, v)
        return '<c r="%s" t="s"><v>%d</v></c>' % (ref, at[v])

    parts = []
    for n, (name, rows) in enumerate(SHEETS, start=1):
        xml = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
               '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>']
        for ri, row in enumerate(rows, start=1):
            if not any(v != '' for v in row):
                xml.append('<row r="%d"/>' % ri)            # a blank row in the middle of a tab
                continue
            xml.append('<row r="%d">' % ri)
            xml += [cell(ci, ri, v) for ci, v in enumerate(row)]
            xml.append('</row>')
        xml.append('</sheetData></worksheet>')
        parts.append(('xl/worksheets/sheet%d.xml' % n, ''.join(xml)))

    workbook = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
                + ''.join('<sheet name="%s" sheetId="%d" r:id="rId%d"/>' % (esc(n), i, i)
                          for i, (n, _) in enumerate(SHEETS, start=1))
                + '</sheets></workbook>')
    rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + ''.join('<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet%d.xml"/>' % (i, i)
                      for i in range(1, len(SHEETS) + 1))
            + '</Relationships>')
    sst = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
           '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="%d" uniqueCount="%d">'
           % (len(shared), len(shared))
           + ''.join('<si><t>%s</t></si>' % esc(s) for s in shared) + '</sst>')

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('xl/workbook.xml', workbook)
        z.writestr('xl/_rels/workbook.xml.rels', rels)
        z.writestr('xl/sharedStrings.xml', sst)
        for name, xml in parts:
            z.writestr(name, xml)
        # one entry stored without compression, the way a plain zip may hold small parts
        z.writestr('docProps/core.xml', '<?xml version="1.0" encoding="UTF-8"?><core/>', zipfile.ZIP_STORED)
    print('wrote', OUT, os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    build()
