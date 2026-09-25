/* ============================================================================
   Hisab — sync-engine tests (no Google account needed)

   Runs the real <script> out of index.html inside a Node VM against a mock
   Google Sheets API, so the behaviour of a push / delete / sign-in pull can be
   checked without touching the real Sheet.

     node tools/sync-engine.test.mjs

   The tests that matter most are the ones about the reported bug: a push from a
   device that holds FEWER rows than the Sheet must not delete anything, and a
   Sheet that comes back empty must never empty the device.
   ========================================================================== */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CODE = (HTML.match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g) || [])
  .map(t => t.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''))
  .pop();

const TABS = ['Employees', 'DutyLeave', 'EmployeePayments', 'ClientReceipts', 'Expenses'];
const HEADERS = {
  Employees: ['id', 'name', 'phone', 'wageType', 'wageAmount', 'dutyHours', 'dutyTime', 'joinDate', 'clientDutyStartDate', 'client', 'clientPhone', 'clientDeal', 'savedAt', 'updatedAt'],
  DutyLeave: ['id', 'empName', 'type', 'from', 'fromTime', 'to', 'toTime', 'days', 'client', 'savedAt', 'forEmp', 'wageType', 'wageAmount', 'reason', 'notes', 'updatedAt'],
  EmployeePayments: ['id', 'empName', 'date', 'amount', 'payType', 'mode', 'savedAt', 'periodFrom', 'periodTo', 'invoiceNo', 'summary', 'balance', 'updatedAt'],
  ClientReceipts: ['id', 'client', 'clientPhone', 'date', 'amount', 'empName', 'mode', 'savedAt', 'clientAddress', 'invoiceNo', 'dealAmount', 'updatedAt'],
  Expenses: ['id', 'item', 'date', 'amount', 'savedAt', 'updatedAt']
};

/* ------------------------------------------------------------------ mock Sheet */
function rowFor(tab, id, extra = {}) {
  const r = { id };
  if (tab === 'ClientReceipts') Object.assign(r, { client: 'Client ' + id, date: '2026-09-01', amount: '1000', savedAt: '2026-09-01, 10:00:00 am', updatedAt: '2026-09-01T04:30:00.000Z' }, extra);
  if (tab === 'EmployeePayments') Object.assign(r, { empName: 'Emp ' + id, date: '2026-09-02', amount: '500', mode: 'Cash', savedAt: '2026-09-02, 10:00:00 am', updatedAt: '2026-09-02T04:30:00.000Z' }, extra);
  if (tab === 'Expenses') Object.assign(r, { item: 'Item ' + id, date: '2026-09-03', amount: '200', savedAt: '2026-09-03, 10:00:00 am', updatedAt: '2026-09-03T04:30:00.000Z' }, extra);
  if (tab === 'Employees') Object.assign(r, { name: 'Emp ' + id, wageType: 'daily', wageAmount: '700', savedAt: '2026-09-01, 10:00:00 am', updatedAt: '2026-09-01T04:30:00.000Z' }, extra);
  if (tab === 'DutyLeave') Object.assign(r, { empName: 'Emp ' + id, type: 'duty', from: '2026-09-01', to: '2026-09-01', days: '1', savedAt: '2026-09-01, 10:00:00 am', updatedAt: '2026-09-01T04:30:00.000Z' }, extra);
  return HEADERS[tab].map(h => r[h] ?? '');
}
function colsToRow(tab, values) {           // values: {id, amount…} → a full row in header order
  return HEADERS[tab].map(h => (values[h] === undefined || values[h] === null) ? '' : String(values[h]));
}
function rowToObj(tab, row) {
  const o = {};
  HEADERS[tab].forEach((h, i) => { o[h] = row[i] === undefined ? '' : String(row[i]); });
  return o;
}

function makeBook(spec = {}, headerOverride = {}) {
  const book = { sheets: [] };
  TABS.forEach((title, i) => {
    const heads = headerOverride[title] ? headerOverride[title].slice() : HEADERS[title].slice();
    const grid = [heads];
    (spec[title] || []).forEach(row => grid.push(row.slice(0, heads.length)));
    book.sheets.push({ properties: { title, sheetId: 1000 + i }, grid });
  });
  return book;
}
const sheetOf = (book, title) => book.sheets.find(s => s.properties.title === title);

function a1(range) {                        // "Employees!A1" / "Employees!D1"
  const m = String(range).match(/^([^!]+)!([A-Z]+)(\d+)/);
  if (!m) return null;
  let col = 0;
  for (const ch of m[2]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { tab: m[1], col: col - 1, row: Number(m[3]) };
}

function makeApi(book, log, failOnce) {
  const calls = [];
  let toFail = failOnce || null;
  const api = async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    const u = String(url);
    const short = u.replace(/^https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets\/[^/?]+/, '');
    calls.push({ method, url: short, body });
    log && log.push({ method, url: short, body });

    const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o });
    if (toFail && toFail.test(short) && method !== 'GET') {
      toFail = null;                                        // only the first time
      return json({ error: { message: 'Simulated Google failure', status: 'INTERNAL' } }, 500);
    }

    if (u.includes('/values:batchGet')) {
      const ranges = [...u.matchAll(/ranges=([^&]+)/g)].map(m => decodeURIComponent(m[1]));
      return json({
        valueRanges: ranges.map(t => {
          const s = sheetOf(book, t);
          if (!s) return {};
          const grid = s.grid.slice();
          while (grid.length > 1 && grid[grid.length - 1].every(v => String(v ?? '').trim() === '')) grid.pop();
          return { values: grid };
        })
      });
    }
    if (u.endsWith(':batchUpdate') && !u.includes('/values')) {           // spreadsheet-level
      for (const req of (body.requests || [])) {
        if (req.addSheet) sheetOf(book, req.addSheet.properties.title) || book.sheets.push({ properties: { title: req.addSheet.properties.title, sheetId: 2000 + book.sheets.length }, grid: [] });
        if (req.deleteDimension) {
          const s = book.sheets.find(x => x.properties.sheetId === req.deleteDimension.range.sheetId);
          s.grid.splice(req.deleteDimension.range.startIndex, req.deleteDimension.range.endIndex - req.deleteDimension.range.startIndex);
        }
      }
      return json({});
    }
    if (u.includes('/values:batchUpdate')) {                              // write cells
      for (const d of (body.data || [])) {
        const a = a1(d.range);
        const s = sheetOf(book, a.tab);
        d.values.forEach((row, ri) => {
          const target = a.row - 1 + ri;
          while (s.grid.length <= target) s.grid.push([]);
          row.forEach((v, ci) => { s.grid[target][a.col + ci] = v; });
        });
      }
      return json({});
    }
    const clear = u.match(/\/values\/([^!?]+)(?:![^?]*)?:clear/);
    if (clear && method === 'POST') {                                                          // ← the destructive call
      const s = sheetOf(book, decodeURIComponent(clear[1]));
      if (s) s.grid = [];
      return json({});
    }
    const append = u.match(/\/values\/([^!?]+)![^?]*:append/);
    if (append && method === 'POST') {
      const s = sheetOf(book, decodeURIComponent(append[1]));
      const blank = s.grid.findIndex((r, i) => i > 0 && r.every(v => String(v ?? '').trim() === ''));
      const at = blank === -1 ? s.grid.length : blank;
      (body.values || []).forEach((row, ri) => {
        while (s.grid.length <= at + ri) s.grid.push([]);
        s.grid[at + ri] = row.slice();
      });
      return json({ updates: { updatedRows: (body.values || []).length } });
    }
    const put = u.match(/\/values\/([^!]+)!([A-Z]+\d+)/);
    if (put && method === 'PUT') {
      const a = a1(`${decodeURIComponent(put[1])}!${put[2]}`);
      const s = sheetOf(book, a.tab);
      while (s.grid.length <= a.row - 1) s.grid.push([]);
      body.values.forEach((row, ri) => row.forEach((v, ci) => { s.grid[a.row - 1 + ri][a.col + ci] = v; }));
      return json({});
    }
    const r1 = u.match(/\/values\/([^!?]+)!([^?]+)\?/);
    if (r1) {                                                             // read a range (headers, an id column…)
      const s = sheetOf(book, decodeURIComponent(r1[1]));
      if (!s) return json({ error: { message: 'Unable to parse range', status: 'INVALID_ARGUMENT' } }, 400);
      const ref = r1[2].split(':');
      const colOf = (txt) => { let c = 0; for (const ch of String(txt).replace(/[^A-Z]/g, '')) c = c * 26 + (ch.charCodeAt(0) - 64); return c - 1; };
      const col = ref.length === 1 && !/[A-Z]/.test(ref[0]) ? null : (colOf(ref[0]) >= 0 ? colOf(ref[0]) : null);
      const rowFrom = Number((String(ref[0]).match(/\d+/) || [1])[0]) - 1;
      const rowTo = ref[1] ? Number((String(ref[1]).match(/\d+/) || [s.grid.length])[0]) : s.grid.length;
      let out = s.grid.slice(rowFrom, rowTo);
      if (col !== null) out = out.map(r => [r[col] === undefined ? '' : r[col]]);
      return json({ values: out });
    }
    if (u.match(/\?fields=sheets\.properties/)) {
      return json({ sheets: book.sheets.map(s => ({ properties: { title: s.properties.title, sheetId: s.properties.sheetId } })) });
    }
    return json({ error: { message: 'HTTP 404 not mocked: ' + short, status: 'NOT_FOUND' } }, 404);
  };
  api.calls = calls;
  return api;
}

/* ------------------------------------------------------------------ DOM stub */
function makeDom() {
  const el = () => new Proxy({ _t: 0, value: '', checked: false, textContent: '', innerHTML: '', options: [], dataset: {}, style: {}, classList: { toggle() { }, add() { }, remove() { } } }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === Symbol.iterator) return [][Symbol.iterator].bind([]);
      if (typeof k === 'string' && /^on/.test(k)) return null;
      return (...a) => el();
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  const store = {};
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => Object.keys(store.filter ? store : store)[i]
  };
  Object.defineProperty(localStorage, '_store', { value: store, enumerable: false });
  const document = {
    getElementById: () => el(),
    querySelector: () => el(),
    querySelectorAll: () => [],
    createElement: () => el(),
    body: el(),
    addEventListener() { }
  };
  return { document, localStorage, store, el };
}

/* ------------------------------------------------------------------ boot the app */
function boot({ sheetSpec = {}, headers = {}, device = {}, cleared = false, token = true, failWriteOnce = null } = {}) {
  const book = makeBook(sheetSpec, headers);
  const logs = [];
  const api = makeApi(book, logs, failWriteOnce);
  const { document, localStorage, store } = makeDom();

  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Promise, Map, Set, Number, String, Array, Object, RegExp, Error, isNaN, parseFloat, parseInt,
    document, localStorage, navigator: { userAgent: 'node-test', share: undefined },
    location: { origin: 'https://example.test', pathname: '/index.html', href: 'https://example.test/index.html', search: '' },
    fetch: (url, opts) => String(url).includes('sheets.googleapis.com') ? api(url, opts)
      : Promise.resolve({ ok: false, status: 404, json: async () => ({}) }),
    confirm: () => true,
    prompt: () => '',
    alert: () => { },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() { } },
    Blob: class { }, FileReader: class { readAsText() { } },
    html2canvas: () => Promise.resolve({ toDataURL: () => '' }),
    addEventListener() { },
    google: undefined,
    HISAB_SPREADSHEET_ID: '1VV5TZyNEpBHS6gnaBU7XujuBdtzBEQwqofMmHzmKFAY',
    HISAB_GOOGLE_CLIENT_ID: '663319983266-4i2dv5t5m2jli2h2lrklch4ji0319il3.apps.googleusercontent.com'
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  store['hisabData_v1'] = JSON.stringify({ employees: [], dutyLeave: [], payments: [], receipts: [], expenses: [], ...device });
  store['hisabSyncedSheetId'] = '1VV5TZyNEpBHS6gnaBU7XujuBdtzBEQwqofMmHzmKFAY';
  if (token) store['hisabGoogleAuth_v1'] = JSON.stringify({ token: 'ya29.test', expiresAt: Date.now() + 3600e3 });
  if (cleared) store['hisabDeviceCleared'] = new Date().toISOString();

  const ctx = vm.createContext(sandbox);
  vm.runInContext(CODE, ctx, { filename: 'index.html<script>' });
  const $ = (expr) => vm.runInContext(expr, ctx);
  return { ctx, $, book, logs, api, calls: api.calls, sheet: t => sheetOf(book, t), store };
}

/* ------------------------------------------------------------------ assertions */
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg + (JSON.stringify(a) === JSON.stringify(b) ? '' : ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`));
const objFromHeads = (heads, row) => { const o = {}; heads.forEach((h, i) => { o[h] = String(row[i] ?? ''); }); return o; };
const dataRows = (sh, tab) => {
  const g = sh.grid.slice(1).filter(r => r.some(v => String(v ?? '').trim() !== ''));
  return g.map(r => rowToObj(tab, r));
};
const idsOf = (sh, tab) => dataRows(sh, tab).map(r => r.id);
const writes = (calls) => calls.filter(c => c.method !== 'GET');
const clears = (calls) => calls.filter(c => /:clear/.test(c.url));

/* ------------------------------------------------------------------ scenarios */
console.log('\n1. A push from a device that holds FEWER rows must not delete anything');
{
  const sheetSpec = { ClientReceipts: Array.from({ length: 50 }, (_, i) => rowFor('ClientReceipts', 'S' + (i + 1))) };
  const device = {
    receipts: [
      { id: 'S1', client: 'Client S1', date: '2026-09-01', amount: '1000', synced: true, updatedAt: '2026-09-01T04:30:00.000Z' },
      { id: 'S2', client: 'Client S2', date: '2026-09-01', amount: '1000', synced: true, updatedAt: '2026-09-01T04:30:00.000Z' },
      { id: 'LOCAL1', client: 'New client', date: '2026-09-20', amount: '700', synced: false }
    ]
  };
  const { $, sheet, calls } = boot({ sheetSpec, device });
  await Promise.resolve(); await new Promise(r => setTimeout(r, 20));      // let the start-up pull finish

  // the partner's phone adds 10 rows while this device is open
  for (let i = 51; i <= 60; i++) sheet('ClientReceipts').grid.push(rowFor('ClientReceipts', 'S' + i));

  await $(`syncAll()`);

  ok(sheet('ClientReceipts').grid.length - 1 === 61, 'Sheet now holds 61 rows (50 + 10 from the partner + 1 new)');
  ok(idsOf(sheet('ClientReceipts'), 'ClientReceipts').includes('S60'), 'the rows the partner added are still there');
  ok(idsOf(sheet('ClientReceipts'), 'ClientReceipts').includes('LOCAL1'), 'the row added on this device reached the Sheet');
  eq(clears(calls).length, 0, 'no tab was ever cleared (:clear)');
  eq($(`unsentCount()`), 0, 'nothing is left marked "not sent yet"');
}

console.log('\n2. Deleting one entry removes exactly one Sheet row');
{
  const rows = Array.from({ length: 20 }, (_, i) => rowFor('ClientReceipts', 'R' + (i + 1)));
  const sheetSpec = { ClientReceipts: rows };
  const device = { receipts: rows.map(r => ({ id: r[0], client: r[1], date: r[3], amount: r[4], synced: true, updatedAt: '2026-09-01T04:30:00.000Z' })) };
  const { $, sheet, calls } = boot({ sheetSpec, device });
  await new Promise(r => setTimeout(r, 20));

  $(`delRec('receipts','R7')`);
  await $(`syncAll()`);
  await new Promise(r => setTimeout(r, 40));        // delRec's own (joined) push settles too

  const left = idsOf(sheet('ClientReceipts'), 'ClientReceipts');
  ok(left.length === 19, 'Sheet holds 19 rows (was 20)');
  ok(!left.includes('R7'), 'the deleted row is gone from the Sheet');
  ok(left.join(',') === rows.map(r => r[0]).filter(id => id !== 'R7').join(','), 'every other row kept its place');
  eq(clears(calls).length, 0, 'no tab was cleared');
  eq($(`pendingDeleteCount()`), 0, 'the deletion is finished and forgotten');
}

console.log('\n3. A device whose data was cleared cannot push at all');
{
  const sheetSpec = { ClientReceipts: Array.from({ length: 20 }, (_, i) => rowFor('ClientReceipts', 'K' + (i + 1))) };
  const { $, sheet, calls } = boot({ sheetSpec, device: {}, cleared: true });
  await new Promise(r => setTimeout(r, 20));

  const res = await $(`syncAll()`);
  eq(res, false, 'the push is refused');
  eq(sheet('ClientReceipts').grid.length - 1, 20, 'the Sheet still holds all 20 rows');
  eq(writes(calls).length, 0, 'nothing was written at all');
}

console.log('\n4. A Sheet that comes back EMPTY never empties the device (the reported bug)');
{
  const sheetSpec = { ClientReceipts: [] };                     // emptied from outside
  const device = {
    receipts: Array.from({ length: 20 }, (_, i) => ({ id: 'L' + (i + 1), client: 'Client L' + (i + 1), date: '2026-09-10', amount: '900', synced: true, updatedAt: '2026-09-10T04:30:00.000Z' }))
  };
  const { $, sheet, calls } = boot({ sheetSpec, device });
  await new Promise(r => setTimeout(r, 100));

  eq($(`DB.receipts.length`), 20, 'the device kept all 20 rows');
  ok(/EMPTY/.test($(`sheetSafetyWarning`)), 'the app warns that the Sheet came back empty');
  eq($(`unsentCount()`), 20, 'the rows are marked "not sent yet" so the next push restores them');

  await $(`syncAll()`);
  eq(sheet('ClientReceipts').grid.length - 1, 20, 'the push put the 20 rows back into the Sheet');
  ok($(`unsentCount()`) === 0, 'and they are marked as sent again');
}

console.log('\n5. Saving one entry writes exactly one row, and adds the updatedAt column');
{
  const oldHeaders = { ClientReceipts: HEADERS.ClientReceipts.slice(0, -1) };   // a Sheet from before this change
  const { ctx, $, sheet, calls } = boot({ sheetSpec: {}, headers: oldHeaders });
  await new Promise(r => setTimeout(r, 20));
  const before = ctx.sheetColsForWrite ? null : null;

  const rec = { id: 'NEW1', client: 'Test client', clientPhone: '', date: '2026-09-25', amount: '500', empName: '', mode: 'Cash', savedAt: '2026-09-25, 10:00:00 am' };
  await ctx.sendRecord('ClientReceipts', rec);

  const header = sheet('ClientReceipts').grid[0];
  ok(header.includes('updatedAt'), 'the updatedAt heading was added to the tab');
  const row = dataRows(sheet('ClientReceipts'), 'ClientReceipts').find(r => r.id === 'NEW1');
  ok(!!row, 'the entry is in the Sheet');
  ok(!!row && /^\d{4}-\d{2}-\d{2}T/.test(row.updatedAt), 'the row carries an ISO updatedAt stamp');
  eq(idsOf(sheet('EmployeePayments'), 'EmployeePayments'), [], 'other tabs were not touched');
  eq(clears(calls).length, 0, 'no tab was cleared');
}

console.log('\n6. Two phones, the same row — the newer copy wins');
{
  const older = '2026-09-01T04:30:00.000Z', newer = '2026-09-20T04:30:00.000Z';
  const sheetSpec = { ClientReceipts: [rowFor('ClientReceipts', 'D1', { amount: '1000', updatedAt: older })] };
  const device = { receipts: [{ id: 'D1', client: 'Client D1', date: '2026-09-01', amount: '2500', synced: false, updatedAt: newer }] };
  const { $, sheet } = boot({ sheetSpec, device });
  await new Promise(r => setTimeout(r, 20));
  await $(`syncAll()`);
  eq(dataRows(sheet('ClientReceipts'), 'ClientReceipts')[0].amount, '2500', 'the device\'s newer edit reached the Sheet');

  // the other way round: the Sheet is newer than the local edit → local copy is refreshed
  const sheetSpec2 = { ClientReceipts: [rowFor('ClientReceipts', 'D1', { amount: '9999', updatedAt: newer })] };
  const device2 = { receipts: [{ id: 'D1', client: 'Client D1', date: '2026-09-01', amount: '2500', synced: false, updatedAt: older }] };
  const t2 = boot({ sheetSpec: sheetSpec2, device: device2 });
  await new Promise(r => setTimeout(r, 20));
  await t2.$(`syncAll()`);
  eq(dataRows(t2.sheet('ClientReceipts'), 'ClientReceipts')[0].amount, '9999', 'the Sheet\'s newer value was not overwritten');
  eq(t2.$(`DB.receipts[0].amount`), '9999', 'and this device now shows the Sheet\'s value');
}

console.log('\n7. Two phones, different entries — nothing is lost either way');
{
  const sheetSpec = { EmployeePayments: [rowFor('EmployeePayments', 'P1')] };
  const device = { payments: [{ id: 'P2', empName: 'Emp P2', date: '2026-09-05', amount: '800', mode: 'UPI', savedAt: '2026-09-05, 10:00:00 am' }] };
  const { $, sheet } = boot({ sheetSpec, device });
  await new Promise(r => setTimeout(r, 20));
  await $(`syncAll()`);
  const ids = idsOf(sheet('EmployeePayments'), 'EmployeePayments').sort();
  eq(ids, ['P1', 'P2'], 'both phones\' rows are in the Sheet, each exactly once');
}


console.log('\n8. A Sheet in the OLDER column arrangement is updated in place, never re-ordered');
{
  const legacy = ['id', 'client', 'date', 'amount', 'empName', 'mode', 'savedAt', 'clientAddress', 'invoiceNo', 'dealAmount', 'clientPhone'];
  const rows = [
    ['OLD1', 'Client A', '2026-09-01', '1000', '', 'Cash', '2026-09-01, 10:00:00 am', '', 'INV-1', '5000', '9876500001'],
    ['OLD2', 'Client B', '2026-09-02', '1200', '', 'UPI', '2026-09-02, 10:00:00 am', '', 'INV-2', '6000', '9876500002']
  ];
  const { ctx, $, sheet, calls } = boot({ sheetSpec: { ClientReceipts: rows }, headers: { ClientReceipts: legacy } });
  await new Promise(r => setTimeout(r, 40));
  // this device edits one row
  vm.runInContext(`DB.receipts.find(r=>r.id==='OLD1').amount='2500';touchRec(DB.receipts.find(r=>r.id==='OLD1'));persist()`, ctx);
  await ctx.syncAll();

  const grid = sheet('ClientReceipts').grid;
  const heads = grid[0];
  ok(heads.slice(0, legacy.length).join(',') === legacy.join(','), 'the Sheet\'s own column order was not changed');
  const row1 = objFromHeads(heads, grid[1]);                       // read with the SHEET'S OWN headings
  const row2 = objFromHeads(heads, grid[2]);
  eq(row1.amount, '2500', 'the edited value is under the "amount" heading, where it belongs');
  eq(row1.id, 'OLD1', 'and it is still the same row');
  eq(row2.amount, '1200', 'the other row was not touched');
  eq(row2.clientPhone, '9876500002', 'and its legacy columns kept their values');
  eq(clears(calls).length, 0, 'no tab was cleared');
  eq(dataRows(sheet('ClientReceipts'), 'ClientReceipts').length, 2, 'still exactly 2 rows — nothing duplicated');
}

console.log('\n9. Phone A writes, phone B signs in and sees the same books (nothing duplicated, nothing written)');
{
  const sheetSpec = { ClientReceipts: [rowFor('ClientReceipts', 'A1'), rowFor('ClientReceipts', 'A2')] };
  const deviceA = { receipts: [{ id: 'A3', client: 'New', date: '2026-09-25', amount: '300', savedAt: '2026-09-25, 10:00:00 am' }] };
  const a = boot({ sheetSpec, device: deviceA });
  await new Promise(r => setTimeout(r, 30));
  await a.ctx.syncAll();
  const after = a.sheet('ClientReceipts').grid.slice(1).filter(r => String(r[0] ?? '').trim());
  eq(after.length, 3, 'phone A\'s entry reached the Sheet');

  // phone B: never seen this data before, signs in on the same Sheet
  const b = boot({ sheetSpec: { ClientReceipts: after } });
  await new Promise(r => setTimeout(r, 60));
  eq(b.$('DB.receipts.length'), 3, 'phone B pulled all three rows on sign-in');
  await b.ctx.syncAll();
  const writes = b.calls.filter(c => c.method !== 'GET');
  eq(writes.length, 0, 'phone B had nothing to write — its books already matched the Sheet');
  eq(idsOf(b.sheet('ClientReceipts'), 'ClientReceipts').sort().join(','), 'A1,A2,A3', 'the Sheet is unchanged, no duplicates');
}


console.log('\n10. Rows written in the old order (money under "Date") are put right by the next push');
{
  // headings are today's order, but the ROWS were written in the older one
  const legacyOrder = ['id', 'client', 'date', 'amount', 'empName', 'mode', 'savedAt', 'clientAddress', 'invoiceNo', 'dealAmount', 'clientPhone'];
  const rec = { id: 'SH1', client: 'Client S', date: '2026-09-01', amount: '1500', empName: '', mode: 'Cash', savedAt: '2026-09-01, 10:00:00 am', clientAddress: '', invoiceNo: 'INV-9', dealAmount: '4000', clientPhone: '9876500009' };
  const legacyRow = legacyOrder.map(h => rec[h]);
  const { ctx, $, sheet, calls } = boot({ sheetSpec: { ClientReceipts: [legacyRow] } });   // current headings
  await new Promise(r => setTimeout(r, 40));
  ok(/older column order/.test($('sheetLayoutWarning')), 'the app recognised the older row order');

  await ctx.syncAll();
  const grid = sheet('ClientReceipts').grid;
  const fixed = objFromHeads(grid[0], grid[1]);
  eq(fixed.amount, '1500', 'the money is back under "amount"');
  eq(fixed.mode, 'Cash', 'the payment mode is back under "mode"');
  eq(fixed.savedAt, '2026-09-01, 10:00:00 am', 'the saved-at stamp is back under "savedAt"');
  eq(fixed.clientPhone, '9876500009', 'the client phone is where the current layout keeps it');
  eq(dataRows(sheet('ClientReceipts'), 'ClientReceipts').length, 1, 'no row was added or lost while repairing');
  eq(clears(calls).length, 0, 'and nothing was cleared');
}


console.log('\n11. An entry saved while a push is running is written exactly once');
{
  const sheetSpec = { ClientReceipts: [rowFor('ClientReceipts', 'B1')] };
  const { ctx, $, sheet } = boot({ sheetSpec });
  await new Promise(r => setTimeout(r, 30));
  const rec = { id: 'RACE1', client: 'Race client', date: '2026-09-25', amount: '450', savedAt: '2026-09-25, 11:00:00 am' };
  vm.runInContext(`DB.receipts.push(${JSON.stringify(rec)});persist();`, ctx);

  const push = ctx.syncAll();                                    // a push starts…
  const submit = vm.runInContext(`sendRecord('ClientReceipts', DB.receipts.find(r=>r.id==='RACE1'))`, ctx);   // …and the entry is saved in the same moment
  await Promise.all([push, submit]);

  const rows = dataRows(sheet('ClientReceipts'), 'ClientReceipts').filter(r => r.id === 'RACE1');
  eq(rows.length, 1, 'the entry exists in the Sheet exactly once');
  eq($('unsentCount()'), 0, 'and it is marked as sent');
}

console.log('\n12. A push that fails half-way does not duplicate rows when it is retried');
{
  const sheetSpec = { ClientReceipts: [rowFor('ClientReceipts', 'F1', { amount: '100', updatedAt: '2026-09-01T04:30:00.000Z' })] };
  const device = {
    receipts: [
      { id: 'F1', client: 'Client F1', date: '2026-09-01', amount: '175', synced: false, updatedAt: '2026-09-21T04:30:00.000Z' },
      { id: 'F2', client: 'Client F2', date: '2026-09-22', amount: '300', savedAt: '2026-09-22, 10:00:00 am' }
    ]
  };
  const { ctx, $, sheet, calls } = boot({ sheetSpec, device, failWriteOnce: /values:batchUpdate/ });
  await new Promise(r => setTimeout(r, 30));

  await ctx.syncAll();                                          // the update fails once…
  await ctx.syncAll();                                          // …the next push finishes the job

  const rows = dataRows(sheet('ClientReceipts'), 'ClientReceipts');
  eq(rows.length, 2, 'the Sheet holds exactly 2 rows — the failed push left no duplicates');
  eq(rows.filter(r => r.id === 'F2').length, 1, 'the new row is there once');
  eq(rows.find(r => r.id === 'F1').amount, '175', 'the failed update was completed by the retry');
  eq($('unsentCount()'), 0, 'nothing is left waiting');
  eq(clears(calls).length, 0, 'no tab was cleared');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
