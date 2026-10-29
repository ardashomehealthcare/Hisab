/* ============================================================================
   Hisab — client 24-hour billing tests (no Google account needed)

   Runs the real <script> out of index.html inside a Node VM and checks that a
   client on a 24-hour duty is billed by its HOURS, exactly like the employee
   salary (days = hours ÷ 24), and that the client invoice gets the same duty
   block the salary receipt has.

     node tools/client-billing.test.mjs
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

/* ------------------------------------------------------------------ DOM stub */
function makeDom() {
  const el = () => new Proxy({ value: '', checked: false, textContent: '', innerHTML: '', options: [], dataset: {}, style: {}, className: '', classList: { toggle() { }, add() { }, remove() { }, contains() { return false; } } }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'insertAdjacentHTML') return (_w, html) => { t.innerHTML += String(html || ''); };
      if (k === Symbol.iterator) return [][Symbol.iterator].bind([]);
      if (typeof k === 'string' && /^on/.test(k)) return null;
      return () => el();
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  const elements = new Map();
  const cached = key => { if (!elements.has(key)) elements.set(key, el()); return elements.get(key); };
  const store = {};
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  const document = {
    getElementById: id => cached('id:' + id),
    querySelector: sel => cached('sel:' + sel),
    querySelectorAll: () => [],
    createElement: () => el(),
    body: el(),
    addEventListener() { }
  };
  return { document, localStorage, store, elements };
}

/* ------------------------------------------------------------------ boot */
function boot(device) {
  const { document, localStorage, store } = makeDom();
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Promise, Map, Set, Number, String, Array, Object, RegExp, Error, isNaN, parseFloat, parseInt,
    document, localStorage, navigator: { userAgent: 'node-test' },
    location: { origin: 'https://example.test', pathname: '/index.html', href: 'https://example.test/index.html', search: '' },
    fetch: () => Promise.resolve({ ok: false, status: 404, json: async () => ({}) }),
    confirm: () => true, prompt: () => '', alert: () => { },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() { } },
    Blob: class { },
    FileReader: class { readAsText() { } },
    html2canvas: () => Promise.resolve({ toDataURL: () => '' }),
    addEventListener() { },
    google: undefined,
    HISAB_SPREADSHEET_ID: 'test-sheet',
    HISAB_GOOGLE_CLIENT_ID: 'test-client'
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  store['hisabData_v1'] = JSON.stringify({ employees: [], dutyLeave: [], payments: [], receipts: [], expenses: [], ...device });
  const ctx = vm.createContext(sandbox);
  vm.runInContext(CODE, ctx, { filename: 'index.html<script>' });
  return { $: expr => vm.runInContext(expr, ctx), document, store };
}

/* ------------------------------------------------------------------ assertions */
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b),
  msg + (JSON.stringify(a) === JSON.stringify(b) ? '' : ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`));

/* ------------------------------------------------------------------ the client
   Sharma ji — ₹31,000 a month (₹1,000 a day in a 31-day month).
   Raj is posted there on a 24-hour duty from 8 AM on 1 Aug 2026.
   The deal is a round number on purpose, so every hour has a rupee value. */
const RAJ = { id: 'e1', name: 'Raj', client: 'Sharma', clientDutyStartDate: '2026-08-01', dutyHours: '24', dutyTime: '08:00', wageType: 'monthly', wageAmount: '20000', savedAt: '2026-08-01, 08:00:00 am' };
const END = { id: 'x1', empName: 'Raj', type: 'endClientDuty', client: 'Sharma', to: '2026-08-15', toTime: '14:00', employeeIds: ['e1'], createdAt: '2026-08-15T08:30:00.000Z', savedAt: '2026-08-15, 02:00:00 pm' };

console.log('\n1. A 24-hour client duty is counted in hours (8 AM → 2 PM = 0.25 day)');
{
  const { $ } = boot({ employees: [RAJ], dutyLeave: [END] });
  const h = $(`client24For('Sharma','2026-08-01','2026-08-31')`);
  eq(h.days, 14.25, 'the service is 14.25 days');
  eq(h.hours, 342, '14.25 days = 342 hours');
  eq(h.startDate + ' ' + h.startTime, '2026-08-01 08:00', 'duty starts at the time saved on the Employees row');
  eq(h.endDate + ' ' + h.endTime, '2026-08-15 14:00', 'duty ends at the time recorded on the end-duty row');

  const b = $(`clientBillFor('Sharma',31000,'2026-08-01','2026-08-31')`);
  eq(b.total, 14250, 'bill = ₹31,000 ÷ 31 × 14.25 = ₹14,250 (calendar days would have said ₹15,000)');
  eq($(`proRateDeal(31000,'2026-08-01','2026-08-15').total`), 15000, 'the old calendar rule bills 15 whole days (₹15,000) where only 14.25 were served');
}

console.log('\n2. A duty that runs on without an end row bills whole shifts');
{
  const { $ } = boot({ employees: [RAJ], dutyLeave: [] });
  const h = $(`client24For('Sharma','2026-08-01','2026-08-31')`);
  eq(h.hours, 720, '1 Aug 08:00 → 31 Aug 08:00 = 720 hours');
  eq(h.days, 30, '720 ÷ 24 = 30 days');
  eq($(`clientBillFor('Sharma',31000,'2026-08-01','2026-08-31').total`), 30000, '₹31,000 ÷ 31 × 30 = ₹30,000');
}

console.log('\n3. A period that crosses a month is split by its hours');
{
  const d = { id: 'e2', name: 'Raj', client: 'Sharma', clientDutyStartDate: '2026-07-28', dutyHours: '24', dutyTime: '08:00', wageType: 'monthly', wageAmount: '20000' };
  const end = { id: 'x2', type: 'endClientDuty', client: 'Sharma', to: '2026-08-03', toTime: '14:00', employeeIds: ['e2'] };
  const { $ } = boot({ employees: [d], dutyLeave: [end] });
  const b = $(`clientBillFor('Sharma',31000,'2026-07-28','2026-08-31')`);
  eq(b.h24.perMonthDays, { '2026-07': 4, '2026-08': 2.25 }, 'shifts starting 28–31 July = 4 days, 1 Aug → 3 Aug 2 PM = 2.25 days');
  eq([b.amountPerMonth['2026-07'], b.amountPerMonth['2026-08']], [4000, 2250], 'July ₹4,000 + August ₹2,250');
  eq(b.total, 6250, 'total ₹6,250 for the 150-hour (6.25 day) service');
  eq(b.h24.hours, 150, 'the service really is 150 hours');
}

console.log('\n4. Leave comes out of the bill, a substitute puts it back');
{
  const leave = { id: 'l1', type: 'leave', empName: 'Raj', client: 'Sharma', from: '2026-08-10', fromTime: '08:00', to: '2026-08-10', toTime: '14:00' };
  let { $ } = boot({ employees: [RAJ], dutyLeave: [END, leave] });
  let h = $(`client24For('Sharma','2026-08-01','2026-08-31')`);
  eq(h.leaveHours, 6, 'the 6-hour leave is taken out');
  eq(h.hours, 336, '342 − 6 = 336 hours');
  eq(h.days, 14, '336 ÷ 24 = 14 days');
  eq($(`clientBillFor('Sharma',31000,'2026-08-01','2026-08-31').total`), 14000, 'bill drops to ₹14,000');

  const sub = { id: 's1', type: 'substitute', empName: 'Sita', forEmp: 'Raj', client: 'Sharma', from: '2026-08-10', fromTime: '08:00', to: '2026-08-10', toTime: '14:00', wageType: 'daily', wageAmount: '800' };
  ({ $ } = boot({ employees: [RAJ], dutyLeave: [END, leave, sub] }));
  h = $(`client24For('Sharma','2026-08-01','2026-08-31')`);
  eq(h.subHours, 6, 'the substitute covered the same 6 hours');
  eq(h.days, 14.25, 'the client is billed for the full 14.25 days of service again');
  eq($(`clientBillFor('Sharma',31000,'2026-08-01','2026-08-31').total`), 14250, 'bill back to ₹14,250');
}

console.log('\n5. No 24-hour duty time → the old calendar rule is untouched');
{
  const d = { id: 'e3', name: 'Raj', client: 'Sharma', clientDutyStartDate: '2026-08-01', dutyHours: '12', dutyTime: 'day', wageType: 'monthly', wageAmount: '20000' };
  const { $ } = boot({ employees: [d], dutyLeave: [END] });
  eq($(`client24For('Sharma','2026-08-01','2026-08-31')`), null, 'no hours engine for a 12-hour duty');
  eq($(`clientBillFor('Sharma',31000,'2026-08-01','2026-08-31').total`), 31000, 'the full month bills the full deal, as before');
}

console.log('\n6. The client invoice carries the same duty block as the salary receipt');
{
  const { $, document } = boot({ employees: [RAJ], dutyLeave: [END] });
  const s = $(`clientBillSummary('Sharma','2026-08-01','2026-08-15',31000)`);
  eq(s.bill, 14250, 'the invoice bill is the pro-rata amount');
  eq(s.svcTxt, '14.25 of 31 days (342 hrs)', 'the description states the days and the hours');
  ok(/Total duty days: <b>14\.25 days \(342 hrs\)<\/b>/.test(s.html), 'the duty block prints "Total duty days: 14.25 days (342 hrs)"');
  ok(/2026-08-01 08:00 → 2026-08-15 14:00/.test(s.html), 'the duty block prints the from/to times');

  document.getElementById('rClient').value = 'Sharma';
  document.getElementById('rDeal').value = '31000';
  document.getElementById('rAmt').value = '14250';
  document.getElementById('rFrom').value = '2026-08-01';
  document.getElementById('rTo').value = '2026-08-15';
  $(`updateInvoicePreview(true)`);
  eq(document.getElementById('invPeriod').textContent, '2026-08-01 → 2026-08-15', 'the invoice shows the service period');
  eq(document.getElementById('invBillAmt').textContent, '₹14,250', 'the invoice states the pro-rata bill');
  eq(document.getElementById('invAmt').textContent, '₹14,250', 'and the amount received');
  eq(document.getElementById('invDetails').style.display, '', 'the duty block is visible');
  ok(/Total duty days/.test(document.getElementById('invDetails').innerHTML), 'the duty block is filled');
  eq(document.getElementById('invBalRow').style.display, 'none', 'nothing is left due when the bill and the receipt match');
}

console.log('\n7. Receipts keep the period and the hours in the Sheet columns');
{
  const { $ } = boot({ employees: [RAJ], dutyLeave: [END] });
  eq($(`SHEET_COLS.ClientReceipts.slice(-7)`),
    ['periodFrom', 'periodTo', 'serviceDays', 'serviceHours', 'billAmount', 'balance', 'summary'],
    'the seven new ClientReceipts columns');
  eq($(`[...OPTIONAL_SYNC_COLS].includes('periodFrom')`), true, 'an older Sheet gets them added on the next write');
  eq($(`DATE_COLS.ClientReceipts`), ['date', 'periodFrom', 'periodTo'], 'period columns are read back as dates');
}

console.log('\n8. The calculator goes through the hours rule end to end');
{
  const { $, document } = boot({ employees: [RAJ], dutyLeave: [END] });
  document.getElementById('cbClient').value = 'Sharma';
  document.getElementById('cbDeal').value = '31000';
  document.getElementById('cbFrom').value = '2026-08-01';
  document.getElementById('cbTo').value = '2026-08-31';
  document.getElementById('cbFromT').value = '08:00';
  document.getElementById('cbToT').value = '14:00';
  $(`calcClientBill()`);
  const html = document.getElementById('cbResult').innerHTML;
  eq($(`lastClientBill.total`), 14250, 'the calculated bill is ₹14,250');
  eq($(`lastClientBill.basis`), 'hours', 'the bill says it was counted in hours');
  ok(/14\.25/.test(html) && /342 hrs/.test(html), 'the month row shows 14.25 days (342 hrs)');
  ok(/31,000 ÷ 31 × 14\.25/.test(html), 'the arithmetic line shows deal ÷ days × 14.25');
}

console.log('\n9. Saving the client payment keeps the period, the hours and the bill');
{
  const { $, document } = boot({ employees: [RAJ], dutyLeave: [END] });
  document.getElementById('rClient').value = 'Sharma';
  document.getElementById('rDeal').value = '31000';
  document.getElementById('rAmt').value = '14250';
  document.getElementById('rFrom').value = '2026-08-01';
  document.getElementById('rTo').value = '2026-08-15';
  document.getElementById('rDate').value = '2026-08-15';
  document.getElementById('rMode').value = 'Cash';
  $(`saveReceipt()`);
  const rec = $(`DB.receipts[0]`);
  eq([rec.periodFrom, rec.periodTo], ['2026-08-01', '2026-08-15'], 'the service period is saved on the receipt');
  eq([Number(rec.serviceDays), Number(rec.serviceHours)], [14.25, 342], '14.25 days / 342 hrs are saved');
  eq(Number(rec.billAmount), 14250, 'the pro-rata bill is saved');
  eq(Number(rec.balance), 0, 'nothing is left due');
  ok(/Total duty days: 14\.25 days \(342 hrs\)/.test(String(rec.summary)), 'the Sheet row carries the duty summary');
}

console.log('\n10. The invoice continues from the last receipt, not from the first duty day');
{
  const first = { id: 'r1', client: 'Sharma', date: '2026-08-05', amount: '14250', periodFrom: '2026-08-01', periodTo: '2026-08-15', dealAmount: '31000' };
  const { $, document } = boot({ employees: [RAJ], dutyLeave: [END], receipts: [first] });
  eq($(`clientServiceResume('Sharma')`), '2026-08-16', 'the next invoice starts the day after the last period ended');
  document.getElementById('rClient').value = 'Sharma';
  $(`onClientNameChange()`);
  eq(document.getElementById('rFrom').value, '2026-08-16', 'typing the client fills that start date');
  eq(document.getElementById('rTo').value, $(`todayStr()`), 'and ends it today');
  eq($(`clientServiceResume('Nobody')`), '', 'a client who never paid has nothing to resume');
}

console.log('\n11. Re-printing a saved receipt shows the numbers it was saved with');
{
  const saved = { id: 'r9', client: 'Sharma', date: '2026-08-20', amount: '10000', dealAmount: '31000',
    periodFrom: '2026-08-16', periodTo: '2026-08-31', billAmount: '14000', balance: '4000', invoiceNo: 'INV-0009', mode: 'Cash' };
  const { $, document } = boot({ employees: [RAJ], dutyLeave: [END], receipts: [saved] });
  $(`openInvoiceFromRecord('r9')`);
  eq(document.getElementById('invBillAmt').textContent, '₹14,000', 'the saved bill is shown, not a re-computed one');
  eq(document.getElementById('invBal').textContent, '₹4,000', 'the saved balance is shown');
  eq(document.getElementById('invBalLabel').textContent, 'Balance due', 'and it reads as money to collect');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
