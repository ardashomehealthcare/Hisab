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
  Employees: ['id', 'name', 'phone', 'wageType', 'wageAmount', 'dutyHours', 'dutyTime', 'joinDate', 'clientDutyStartDate', 'client', 'clientPhone', 'clientDeal', 'savedAt', 'createdAt', 'updatedAt'],
  DutyLeave: ['id', 'empName', 'type', 'from', 'fromTime', 'to', 'toTime', 'days', 'client', 'savedAt', 'forEmp', 'wageType', 'wageAmount', 'reason', 'notes', 'employeeIds', 'createdAt', 'updatedAt'],
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
function rowToObj(tab, row, headers = HEADERS[tab]) {
  const o = {};
  headers.forEach((h, i) => { o[h] = row[i] === undefined ? '' : String(row[i]); });
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
    if (clear && method === 'POST') {                                                          // backup clears data rows, not headings
      const s = sheetOf(book, decodeURIComponent(clear[1]));
      if (s) s.grid = /!A2:/.test(u) ? s.grid.slice(0, 1) : [];
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
      if (k === 'insertAdjacentHTML') return (_where, html) => { t.innerHTML += String(html || ''); };
      if (k === Symbol.iterator) return [][Symbol.iterator].bind([]);
      if (typeof k === 'string' && /^on/.test(k)) return null;
      return (...a) => el();
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  const elements = new Map();
  const cached = key => { if (!elements.has(key)) elements.set(key, el()); return elements.get(key); };
  const store = {};
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => Object.keys(store.filter ? store : store)[i]
  };
  Object.defineProperty(localStorage, '_store', { value: store, enumerable: false });
  const document = {
    getElementById: id => cached('id:'+id),
    querySelector: selector => cached('selector:'+selector),
    querySelectorAll: () => [],
    createElement: () => el(),
    body: el(),
    addEventListener() { }
  };
  return { document, localStorage, store, el, elements };
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
    Blob: class { },
    FileReader: class {
      readAsText() {
        this.result = sandbox.__fileText || '';
        setTimeout(() => { if (this.onload) this.onload(); }, 0);
      }
    },
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
  return g.map(r => rowToObj(tab, r, sh.grid[0] || HEADERS[tab]));
};
const idsOf = (sh, tab) => dataRows(sh, tab).map(r => r.id);
const writes = (calls) => calls.filter(c => c.method !== 'GET');
const clears = (calls) => calls.filter(c => /:clear/.test(c.url));

/* ------------------------------------------------------------------ scenarios */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
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


console.log('\n13. Recovery: a JSON backup restored into a Sheet that still has some rows loses nothing');
{
  // what survived the wipe: two expense rows and one receipt
  const sheetSpec = {
    Expenses: [rowFor('Expenses', 'X9'), rowFor('Expenses', 'X10')],
    ClientReceipts: [rowFor('ClientReceipts', 'KEEP1')]
  };
  const t = boot({ sheetSpec });                       // the phone itself is empty after the wipe
  await new Promise(r => setTimeout(r, 30));

  // a backup taken on another device before the wipe
  const backup = {
    employees: [{ id: 'E1', name: 'Emp One', wageType: 'daily', wageAmount: '700' }],
    dutyLeave: [{ id: 'D1', empName: 'Emp One', type: 'duty', from: '2026-09-01', to: '2026-09-01', days: '1' }],
    payments: [{ id: 'P1', empName: 'Emp One', date: '2026-09-05', amount: '3500', mode: 'Cash' }],
    receipts: [{ id: 'R1', client: 'Client R', date: '2026-09-03', amount: '900' }, { id: 'KEEP1', client: 'Client KEEP1', date: '2026-09-01', amount: '1000' }],
    expenses: [{ id: 'X11', item: 'New expense', date: '2026-09-20', amount: '250' }]
  };
  t.ctx.__fileText = JSON.stringify(backup);
  await new Promise((resolve) => {
    vm.runInContext(`importBackup({files:[{name:'b.json'}],value:''})`, t.ctx);
    setTimeout(resolve, 30);
  });

  eq(t.$('DB.employees.length'), 1, 'the imported employee is on the device');
  eq(t.$('DB.receipts.length'), 2, 'both imported receipts are on the device');
  eq(t.$('unsentCount()'), 6, 'every imported row counts as "not sent yet"');

  await t.ctx.syncAll();
  const sh = t.sheet('ClientReceipts'), ex = t.sheet('Expenses');
  eq(idsOf(sh, 'ClientReceipts').sort().join(','), 'KEEP1,R1', 'the receipt that survived is still there once, and the restored one was added');
  eq(idsOf(ex, 'Expenses').sort().join(','), 'X10,X11,X9', 'the surviving expenses were kept and the restored one added');
  eq(idsOf(t.sheet('Employees'), 'Employees'), ['E1'], 'the restored employee reached the Sheet');
  eq(t.$('unsentCount()'), 0, 'and everything is marked as sent');
}

console.log('\n14. Recovery: a phone that still holds the books puts them back into an emptied Sheet');
{
  const sheetSpec = { ClientReceipts: [] };                     // wiped from outside
  const device = {
    receipts: [                                                  // the phone still has its copy
      { id: 'S1', client: 'Client S1', date: '2026-09-01', amount: '1000', synced: true, updatedAt: '2026-09-01T04:30:00.000Z' },
      { id: 'S2', client: 'Client S2', date: '2026-09-02', amount: '1100', synced: true, updatedAt: '2026-09-02T04:30:00.000Z' }
    ]
  };
  const { ctx, sheet, $ } = boot({ sheetSpec, device });
  await new Promise(r => setTimeout(r, 60));
  eq($('DB.receipts.length'), 2, 'opening the app did NOT empty the phone (the old build would have)');
  eq($('unsentCount()'), 2, 'the rows are waiting to be sent');
  await ctx.syncAll();
  eq(idsOf(sheet('ClientReceipts'), 'ClientReceipts').sort().join(','), 'S1,S2', 'one push restored both rows into the Sheet');
}

console.log('\n15. A WIPED Sheet can no longer take the phone’s books with it (the reported incident)');
{
  // what the partner's phone (old build) left behind: one row it happened to hold
  const sheetSpec = { ClientReceipts: [rowFor('ClientReceipts', 'KEEP1')] };
  const device = {
    receipts: Array.from({ length: 25 }, (_, i) => ({
      id: 'W' + (i + 1), client: 'Client W' + (i + 1), date: '2026-09-15', amount: '900',
      synced: true, updatedAt: '2026-09-15T04:30:00.000Z'
    }))
  };
  const { ctx, $, sheet, calls } = boot({ sheetSpec, device });
  await sleep(90);

  eq($('DB.receipts.length'), 26, 'the pull kept all 25 rows of this phone (+ the one the Sheet still had)');
  ok(/LOST most/.test($('sheetSafetyWarning')), 'the app says the Sheet lost most of this tab — a wipe, not a deletion');
  eq($('unsentCount()'), 25, 'the rows are marked “not sent yet” so one push puts them back');
  eq($('sheetSafetyRepair'), true, 'and they are waiting for that push');

  await ctx.syncAll();
  const ids = idsOf(sheet('ClientReceipts'), 'ClientReceipts');
  eq(ids.length, 26, 'the Sheet holds all 26 rows again');
  ok(ids.includes('KEEP1'), 'the row that survived the wipe is still there');
  ok(ids.includes('W25'), 'the last of the restored rows reached the Sheet');
  eq($('unsentCount()'), 0, 'nothing is left waiting');
  eq($('sheetSafetyRepair'), false, 'and the warning is gone');
  eq(clears(calls).length, 0, 'no tab was ever cleared');
}

console.log('\n16. One row deleted on the other phone is still removed here (no regression)');
{
  const rows = Array.from({ length: 20 }, (_, i) => rowFor('ClientReceipts', 'R' + (i + 1)));
  const sheetSpec = { ClientReceipts: rows.filter(r => r[0] !== 'R7') };      // deleted on the other phone
  const device = { receipts: rows.map(r => ({ id: r[0], client: r[1], date: r[3], amount: r[4], synced: true, updatedAt: '2026-09-01T04:30:00.000Z' })) };
  const { $ } = boot({ sheetSpec, device });
  await sleep(90);

  eq($('DB.receipts.length'), 19, 'that one row was removed here too');
  ok(!$('DB.receipts.some(r=>r.id==="R7")'), 'exactly that row is gone');
  ok(!/LOST most|EMPTY/.test($('sheetSafetyWarning')), 'and one row is not called a wipe');
}

console.log('\n17. The screens build without errors, and every button and file picker calls a function that exists');
{
  const sheetSpec = { ClientReceipts: [rowFor('ClientReceipts', 'A1')] };
  const t = boot({ sheetSpec });
  await sleep(60);
  let threw = '';
  try {
    vm.runInContext('openClearDialog()', t.ctx);
    vm.runInContext(`sheetSafetyWarning='⚠ test';renderSafetyNotice()`, t.ctx);
  } catch (e) { threw = String((e && e.message) || e); }
  eq(threw, '', 'the clear dialog and the Sheet notice build from the data they have');
  // onclick="name(…)" / onchange="name(…)" anywhere in the page or the script → that function has to exist
  const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'return', 'typeof', 'void', 'new']);   // onclick="if(…)…"
  const called = [...new Set([...HTML.matchAll(/on(?:click|change)=\\?["']([A-Za-z_$][\w$]*)\(/g)].map(m => m[1]))]
    .filter(fn => !KEYWORDS.has(fn));
  ok(called.length > 20, 'the buttons of the page were found (' + called.length + ' functions)');
  const missing = called.filter(fn => t.$(`typeof ${fn}`) !== 'function');
  eq(missing.join(', '), '', 'no button or file picker points at a function that is not there');
  ok(called.includes('addRecordsFromFile') && called.includes('loadIncludedData'), '📥 and its file picker are wired up');
}

console.log('\n18. 📥 Add missing records from a file: the Sheet is read first — only what it lacks is added, nothing doubled, no later change undone');
{
  // the Sheet today: part of the old entries — one of them changed later, one typed in again under a new id
  const sheetSpec = {
    Employees: [rowFor('Employees', 'E1', { name: 'Emp One', wageAmount: '800', updatedAt: '2026-09-22T06:00:00.000Z' })],  // wage raised after the file was made
    ClientReceipts: [
      rowFor('ClientReceipts', 'R1', { client: 'Client A', date: '2026-09-03', amount: '900' }),     // the same id as in the file
      rowFor('ClientReceipts', 'RT2', { client: 'Client B', date: '2026-09-04', amount: '1200' })    // typed in again, new id
    ],
    Expenses: [rowFor('Expenses', 'X1', { item: 'Fuel', date: '2026-09-05', amount: '300' })]
  };
  const t = boot({ sheetSpec });
  await sleep(60);                                                    // the phone opened and pulled the Sheet
  // afterwards the other phone types one more old receipt in again — this phone has not seen it yet
  t.sheet('ClientReceipts').grid.push(rowFor('ClientReceipts', 'LATE', { client: 'Client C', date: '2026-09-06', amount: '450' }));
  // and on this phone the fuel expense is deleted (the delete has not reached the Sheet yet)
  t.$(`removeRecords('expenses','X1')`);

  // an old records file, made before all of that
  const file = {
    employees: [
      { id: 'E1', name: 'Emp One', wageType: 'daily', wageAmount: '700' },
      { id: 'E2', name: 'Emp Two', wageType: 'monthly', wageAmount: '15000' }
    ],
    dutyLeave: [{ id: 'D1', empName: 'Emp Two', type: 'leave', from: '2026-08-26', to: '2026-08-29', days: '4' }],
    payments: [{ id: 'P1', empName: 'Emp Two', date: '2026-09-10', amount: '5000', mode: 'Cash' }],
    receipts: [
      { id: 'R1', client: 'Client A', date: '2026-09-03', amount: '900' },
      { id: 'R2', client: 'Client B', date: '2026-09-04', amount: '1200' },
      { id: 'R3', client: 'Client C', date: '2026-09-06', amount: '450' },
      { id: 'R4', client: 'Client D', date: '2026-09-07', amount: '650' }
    ],
    expenses: [
      { id: 'X1', item: 'Fuel', date: '2026-09-05', amount: '300' },
      { id: 'X2', item: 'Gloves', date: '2026-09-08', amount: '120' }
    ]
  };
  eq(t.$('shippedHasRecords'), false, 'the app’s own records file is empty, so 📥 asks for a file on this device');
  t.ctx.__fileText = JSON.stringify(file);
  eq(await t.$(`addRecordsFromFile({files:[{name:'hisab-data.json'}],value:''})`), true, 'the file was read and the add finished');
  eq(t.$('DB.receipts.map(r=>r.id).sort().join()'), 'LATE,R1,R4,RT2', 'the Sheet was read first: the receipt typed in meanwhile on the other phone is recognised — only R4 is added');
  eq(t.$('unsentCount()'), 5, 'only the 5 missing records were added (E2, D1, P1, R4, X2)');
  eq(t.$('DB.employees.find(e=>e.id==="E1").wageAmount'), '800', 'the wage raised after the file was made is kept');
  ok(!t.$('DB.expenses.some(r=>r.id==="X1")'), 'the expense deleted on this phone did not come back');

  await t.ctx.syncAll();
  eq(idsOf(t.sheet('Employees'), 'Employees').sort().join(), 'E1,E2', 'the missing employee reached the Sheet');
  eq(dataRows(t.sheet('Employees'), 'Employees').find(r => r.id === 'E1').wageAmount, '800', 'the Sheet still has the raised wage — the old copy was never sent over it');
  eq(idsOf(t.sheet('ClientReceipts'), 'ClientReceipts').sort().join(), 'LATE,R1,R4,RT2', 'receipts: nothing doubled, the missing one added');
  eq(idsOf(t.sheet('Expenses'), 'Expenses').join(), 'X2', 'expenses: the missing one added, the deleted one removed');
  eq(idsOf(t.sheet('DutyLeave'), 'DutyLeave').join() + ' / ' + idsOf(t.sheet('EmployeePayments'), 'EmployeePayments').join(), 'D1 / P1', 'the missing leave and payment reached the Sheet');
  eq(t.$('unsentCount()'), 0, 'nothing is left waiting');
}

console.log('\n19. 📥 twice adds nothing twice; a Sheet that cannot be read, or a wrong file, adds nothing at all');
{
  const receipts = [{ id: 'R1', client: 'Client A', date: '2026-09-03', amount: '900' }, { id: 'R9', client: 'Client Z', date: '2026-09-09', amount: '100' }];
  const sheetSpec = { ClientReceipts: [rowFor('ClientReceipts', 'R1', { client: 'Client A', date: '2026-09-03', amount: '900' })] };
  const t = boot({ sheetSpec });
  await sleep(40);
  t.ctx.__fileText = JSON.stringify({ employees: [], receipts });
  await t.$(`addRecordsFromFile({files:[{name:'old.json'}],value:''})`);
  await t.ctx.syncAll();
  t.ctx.__fileText = JSON.stringify({ employees: [], receipts });
  eq(await t.$(`addRecordsFromFile({files:[{name:'old.json'}],value:''})`), true, 'the same file chosen a second time is read again');
  eq(t.$('unsentCount()'), 0, 'and adds nothing the second time');
  eq(idsOf(t.sheet('ClientReceipts'), 'ClientReceipts').sort().join(), 'R1,R9', 'the Sheet holds each receipt once');

  const t2 = boot({ sheetSpec, token: false });                       // not signed in: the Sheet cannot be read
  await sleep(40);
  t2.ctx.__fileText = JSON.stringify({ employees: [], receipts });
  eq(await t2.$(`addRecordsFromFile({files:[{name:'old.json'}],value:''})`), false, 'with the Sheet unreadable the add is refused');
  eq(t2.$('DB.receipts.length') + t2.$('unsentCount()'), 0, 'nothing was added — so no old copy can be sent over the Sheet later');

  t2.ctx.__fileText = 'this is not a Hisab file';
  eq(await t2.$(`addRecordsFromFile({files:[{name:'photo.jpg'}],value:''})`), false, 'a file that is not a Hisab file is refused');
}

console.log('\n20. An optional second Sheet receives a complete backup snapshot without changing the primary sync state');
{
  const t = boot({
    sheetSpec: { ClientReceipts: [rowFor('ClientReceipts', 'OLD', { client: 'Old client', amount: '50' })] },
    device: { receipts: [{ id: 'NEW', client: 'New client', date: '2026-09-20', amount: '700', synced: false }] }
  });
  await sleep(40);
  // The mock uses one book for both URLs, but the backup endpoint still exercises
  // the real second-Sheet code path, including tabs, headers, append and update.
  t.$(`setBackupSheetId('22222222222222222222222222222222222222222222')`);
  await t.$(`backupToSheet({interactive:false})`);
  ok(idsOf(t.sheet('ClientReceipts'), 'ClientReceipts').includes('NEW'), 'the backup snapshot writes a local row to the second Sheet');
  ok(t.$('DB.receipts.some(r=>r.id==="NEW" && r.synced===false)'), 'making a backup does not mark a primary row as synced');
}

console.log('\n21. Adding the same employee name on the same or another client creates separate rows; pencil edits only its chosen ID');
{
  const oldEmp = { id: 'OLD-RAVI', name: 'Ravi Kumar', client: 'Client A', savedAt: '2025-01-01, 9:00:00 am', synced: true };
  const oldEnd = { id: 'OLD-END', empName: 'Ravi Kumar', client: 'Client A', type: 'endEmployeeDuty', to: '2025-02-01', createdAt: '2025-02-01T09:00:00.000Z', savedAt: '2025-02-01, 9:00:00 am', synced: true };
  const t = boot({ token: false, device: { employees: [oldEmp], dutyLeave: [oldEnd] } });
  await sleep(30);
  const setForm = ({ name, client }) => {
    const d = t.ctx.document;
    d.getElementById('eName').value = name;
    d.getElementById('ePhone').value = '9876543210';
    d.getElementById('eWageType').value = 'daily';
    d.getElementById('eWage').value = '700';
    d.getElementById('eDuty').value = '';
    d.getElementById('eTime').value = '';
    d.getElementById('eJoin').value = '2026-10-12';
    d.getElementById('eClient').value = client;
    d.getElementById('eClientStart').value = '';
    d.getElementById('eClientPhone').value = '';
    d.getElementById('eClientDeal').value = '';
    t.$('saveEmployee()');
  };
  setForm({ name: 'Ravi Kumar', client: 'Client A' });
  setForm({ name: 'Ravi Kumar', client: 'Client A' });
  setForm({ name: 'Ravi Kumar', client: 'Client B' });
  const added = t.$('DB.employees.filter(e=>e.id!=="OLD-RAVI")');
  eq(t.$('DB.employees.length'), 4, 'three submits made three new records despite repeated name/client');
  eq(new Set(added.map(e => e.id)).size, 3, 'each repeated-name employee record has a different ID');
  eq(added.map(e => e.client).join('|'), 'Client A|Client A|Client B', 'the new rows retain same-client and other-client assignments');
  eq(t.$('findEmpByName("Ravi Kumar").client'), 'Client B', 'name-based screens use the newest active assignment');
  eq(t.$('DB.employees.filter(e=>!isEmployeeEnded(e)).length'), 3, 'the earlier ended employee does not hide the new assignments');
  const tbody = t.ctx.document.querySelector('#empTable tbody').innerHTML;
  eq((tbody.match(/<tr/g) || []).length, 3, 'all three new records render in Employees while the old ended record stays hidden');

  const chosen = added[1];
  t.$(`editEmployee('${chosen.id}')`);
  t.ctx.document.getElementById('eName').value = 'Ravi Kumar Updated';
  t.ctx.document.getElementById('eClient').value = 'Client C';
  t.$('saveEmployee()');
  eq(t.$('DB.employees.length'), 4, 'editing by pencil does not create a fifth row');
  eq(t.$(`DB.employees.find(e=>e.id==="${chosen.id}").name`), 'Ravi Kumar Updated', 'the pencil updates the selected record even if its name changes');
  eq(t.$(`DB.employees.find(e=>e.id==="${chosen.id}").client`), 'Client C', 'the pencil edits the chosen record’s client');
  eq(t.$('isEmployeeEnded(DB.employees.find(e=>e.id==="OLD-RAVI"))'), true, 'editing another row does not reactivate the old ended record');
}

console.log('\n22. End duty and reactivation apply to one employee row; later same-client postings remain active');
{
  const employees = [
    { id: 'DUP-A1', name: 'Same Name', client: 'Client A', wageType: 'monthly', wageAmount: '18000', createdAt: '2025-01-01T00:00:00.000Z', synced: true },
    { id: 'DUP-A2', name: 'Same Name', client: 'Client A', wageType: 'daily', wageAmount: '700', createdAt: '2025-02-01T00:00:00.000Z', synced: true },
    { id: 'DUP-B1', name: 'Same Name', client: 'Client B', wageType: 'daily', wageAmount: '650', createdAt: '2025-03-01T00:00:00.000Z', synced: true }
  ];
  const t = boot({ token: false, device: { employees } });
  await sleep(25);
  t.ctx.document.getElementById('cbEmpSel').value = 'DUP-A1';
  t.$('endEmployeeDuty()');
  eq(t.$('DB.dutyLeave.find(r=>r.type==="endEmployeeDuty").employeeIds.join()'), 'DUP-A1', 'an end-duty row records the selected employee ID');
  eq(t.$('isEmployeeEnded(DB.employees.find(e=>e.id==="DUP-A1"))'), true, 'the selected employee is ended');
  eq(t.$('isEmployeeEnded(DB.employees.find(e=>e.id==="DUP-A2"))'), false, 'a duplicate name on the same client is not ended');
  eq(t.$('isEmployeeEnded(DB.employees.find(e=>e.id==="DUP-B1"))'), false, 'the same name on another client is not ended');

  t.$(`reactivateEmployee('DUP-A1')`);
  eq(t.$('isEmployeeEnded(DB.employees.find(e=>e.id==="DUP-A1"))'), false, 'reactivating the selected row makes it active again');

  t.ctx.document.getElementById('cbClient').value = 'Client A';
  t.$('endClientDuty()');
  eq(t.$('isEmployeeEnded(DB.employees.find(e=>e.id==="DUP-A1"))'), true, 'ending the client marks its current assignments ended');
  eq(t.$('isEmployeeEnded(DB.employees.find(e=>e.id==="DUP-A2"))'), true, 'all existing entries at that client are in the client-end snapshot');
  eq(t.$('isEmployeeEnded(DB.employees.find(e=>e.id==="DUP-B1"))'), false, 'client end does not affect another client');
  t.$(`reactivateEmployee('DUP-A1')`);
  eq(t.$('isEmployeeEnded(DB.employees.find(e=>e.id==="DUP-A1"))'), false, 'reactivating a row removes only its ID from the client-end snapshot');
  eq(t.$('isEmployeeEnded(DB.employees.find(e=>e.id==="DUP-A2"))'), true, 'the other employee entry at the client remains ended');
  eq(t.$('isClientEnded("Client A")'), false, 'reactivating an employee makes their client available again');

  const d = t.ctx.document;
  d.getElementById('eName').value = 'Same Name';
  d.getElementById('ePhone').value = '';
  d.getElementById('eWageType').value = 'daily';
  d.getElementById('eWage').value = '700';
  d.getElementById('eDuty').value = '';
  d.getElementById('eTime').value = '';
  d.getElementById('eJoin').value = '2026-10-12';
  d.getElementById('eClient').value = 'Client A';
  d.getElementById('eClientStart').value = '';
  d.getElementById('eClientPhone').value = '';
  d.getElementById('eClientDeal').value = '';
  t.$('saveEmployee()');
  const newest = t.$('DB.employees[DB.employees.length-1]');
  eq(t.$('isEmployeeEnded(DB.employees.find(e=>e.id==="'+newest.id+'"))'), false, 'a new same-client assignment added after the end event is active');
  eq(t.$('DB.employees.length'), 4, 'the new same-client posting is stored as a distinct employee row');
}

console.log('\n23. Backup merge uses employee IDs so repeated names in a file are kept as separate records');
{
  const t = boot({ token: false, device: { employees: [{ id: 'FILE-E1', name: 'Ravi Kumar', client: 'Client A' }] } });
  t.$(`mergeIncludedData({employees:[{id:'FILE-E2',name:'Ravi Kumar',client:'Client A'},{id:'FILE-E3',name:'Ravi Kumar',client:'Client B'}]})`);
  eq(t.$('DB.employees.length'), 3, 'two distinct backup IDs with the same name are both added');
  eq(t.$('DB.employees.map(e=>e.client).join("|")'), 'Client A|Client A|Client B', 'same-client and other-client employee rows remain distinct');
  t.$(`mergeIncludedData({employees:[{name:'Ravi Kumar',client:'Client Z'}]})`);
  eq(t.$('DB.employees.length'), 3, 'an older ID-less import still deduplicates by name against current rows');
}

console.log('\n24. Older Google Sheets get the assignment identity columns appended without reordering existing columns');
{
  const employeeHeaders = HEADERS.Employees.filter(h => h !== 'createdAt');
  const dutyHeaders = HEADERS.DutyLeave.filter(h => h !== 'employeeIds' && h !== 'createdAt');
  const t = boot({
    token: true,
    headers: { Employees: employeeHeaders, DutyLeave: dutyHeaders },
    device: {
      employees: [{ id: 'MIG-E1', name: 'Same Name', client: 'Client A', createdAt: '2026-10-12T08:00:00.000Z', updatedAt: '2026-10-12T08:00:00.000Z', synced: false }],
      dutyLeave: [{ id: 'MIG-D1', empName: 'Same Name', type: 'endEmployeeDuty', employeeIds: ['MIG-E1'], createdAt: '2026-10-12T09:00:00.000Z', updatedAt: '2026-10-12T09:00:00.000Z', synced: false }]
    }
  });
  await sleep(30);
  await t.ctx.syncAll();
  const empHeads = t.sheet('Employees').grid[0];
  const dutyHeads = t.sheet('DutyLeave').grid[0];
  eq(empHeads.slice(0, employeeHeaders.length).join('|'), employeeHeaders.join('|'), 'existing Employees columns stay in their original order');
  ok(empHeads.includes('createdAt'), 'createdAt is added to the Employees tab');
  eq(dutyHeads.slice(0, dutyHeaders.length).join('|'), dutyHeaders.join('|'), 'existing DutyLeave columns stay in their original order');
  ok(dutyHeads.includes('employeeIds') && dutyHeads.includes('createdAt'), 'employeeIds and createdAt are added to DutyLeave');
  eq(dataRows(t.sheet('Employees'), 'Employees').find(r => r.id === 'MIG-E1').createdAt, '2026-10-12T08:00:00.000Z', 'employee assignment creation time reaches the Sheet');
  eq(JSON.parse(dataRows(t.sheet('DutyLeave'), 'DutyLeave').find(r => r.id === 'MIG-D1').employeeIds).join(), 'MIG-E1', 'the end-duty row keeps its employee ID snapshot');
}

console.log('\n25. A legacy client-end row can be reactivated for one employee without restoring every posting');
{
  const t = boot({ token: false, device: {
    employees: [
      { id: 'LEG-E1', name: 'Legacy Name', client: 'Legacy Client', savedAt: '2024-01-01T09:00:00.000Z', synced: true },
      { id: 'LEG-E2', name: 'Legacy Name', client: 'Legacy Client', savedAt: '2024-03-01T09:00:00.000Z', synced: true }
    ],
    dutyLeave: [{ id: 'LEG-C1', type: 'endClientDuty', client: 'Legacy Client', to: '2024-04-01', savedAt: '2024-04-01T10:00:00.000Z', synced: true }]
  } });
  eq(t.$('isEmployeeEnded(DB.employees.find(e=>e.id==="LEG-E1"))'), true, 'the old client-end row marks its prior assignments ended');
  eq(t.$('isEmployeeEnded(DB.employees.find(e=>e.id==="LEG-E2"))'), true, 'all legacy postings at that client start as ended');
  t.$(`reactivateEmployee('LEG-E1')`);
  eq(t.$('isEmployeeEnded(DB.employees.find(e=>e.id==="LEG-E1"))'), false, 'reactivation converts the old client-end row to an ID snapshot and restores the chosen record');
  eq(t.$('isEmployeeEnded(DB.employees.find(e=>e.id==="LEG-E2"))'), true, 'the other legacy posting remains ended');
  eq(t.$('isClientEnded("Legacy Client")'), false, 'the client is available because one employee was reactivated');
}

console.log('\n26. Repeated-name employee rows sync separately, and editing one rewrites only its own Sheet row');
{
  const t = boot({ token: true });
  await sleep(50);
  const add = client => {
    const d = t.ctx.document;
    d.getElementById('eName').value = 'Cloud Duplicate';
    d.getElementById('ePhone').value = '';
    d.getElementById('eWageType').value = 'daily';
    d.getElementById('eWage').value = '700';
    d.getElementById('eDuty').value = '';
    d.getElementById('eTime').value = '';
    d.getElementById('eJoin').value = '2026-10-12';
    d.getElementById('eClient').value = client;
    d.getElementById('eClientStart').value = '';
    d.getElementById('eClientPhone').value = '';
    d.getElementById('eClientDeal').value = '';
    t.$('saveEmployee()');
  };
  add('Client A'); await sleep(30);
  add('Client A'); await sleep(30);
  let rows = dataRows(t.sheet('Employees'), 'Employees').filter(r => r.name === 'Cloud Duplicate');
  eq(rows.length, 2, 'both same-name submissions are appended to the Sheet');
  eq(new Set(rows.map(r => r.id)).size, 2, 'the Sheet rows have distinct IDs');
  const chosen = t.$('DB.employees[0].id');
  t.$(`editEmployee('${chosen}')`);
  t.ctx.document.getElementById('eWage').value = '900';
  t.$('saveEmployee()');
  const push = t.$('pushPromise');
  if (push) await push;
  rows = dataRows(t.sheet('Employees'), 'Employees').filter(r => r.name === 'Cloud Duplicate');
  eq(rows.length, 2, 'editing does not append a third Sheet row');
  eq(rows.find(r => r.id === chosen).wageAmount, '900', 'the selected row is updated in place');
  eq(rows.find(r => r.id !== chosen).wageAmount, '700', 'the other same-name row is unchanged');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
