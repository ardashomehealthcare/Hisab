/* ============================================================================
   Hisab — Money-Entry receipt tests (no Google account needed)

   Runs the real <script> out of index.html inside a Node VM and pins down one
   rule: a receipt generated from the **Money Entry** employee payment form is a
   plain payment receipt — it carries ONLY the amount paid. No salary line, no
   duty/leave working, no balance. The Salary Calculator receipt keeps its full
   salary working (salary, amount paid, balance).

     node tools/money-receipt.test.mjs
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
  return { document, localStorage, store };
}

/* ------------------------------------------------------------------ boot */
function boot(device = {}) {
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
  store['hisabData_v1'] = JSON.stringify({
    employees: [], dutyLeave: [], payments: [], receipts: [], expenses: [], ...device
  });
  const ctx = vm.createContext(sandbox);
  vm.runInContext(CODE, ctx, { filename: 'index.html<script>' });
  return { $: expr => vm.runInContext(expr, ctx), document, store, ctx };
}

/* ------------------------------------------------------------------ assertions */
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b),
  msg + (JSON.stringify(a) === JSON.stringify(b) ? '' : ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`));

/* Raj — ₹1,000 a day. On duty the whole of October 2026. */
const RAJ = { id: 'e1', name: 'Raj', client: 'Sharma', clientDutyStartDate: '2026-10-01', dutyHours: '12', dutyTime: 'day', wageType: 'daily', wageAmount: '1000', joinDate: '2026-10-01' };

/* Fill the Money-Entry employee payment form */
function fillMoneyForm(document, vals) {
  Object.entries(vals).forEach(([id, v]) => { document.getElementById(id).value = v; });
}

console.log('\n1. A Money-Entry receipt carries only the amount paid');
{
  const { $, document } = boot({ employees: [RAJ] });
  fillMoneyForm(document, {
    pEmpSel: 'Raj', pFrom: '2026-10-01', pTo: '2026-10-31',
    pAmt: '12000', pType: 'Salary', pMode: 'Cash'
  });
  $('openPayInvoiceFromMoneyEntry()');

  eq($('payInvData.simple'), true, 'the receipt is flagged as a paid-only receipt');
  eq(document.getElementById('piSalaryRow').style.display, 'none', 'the salary line is hidden');
  eq(document.getElementById('piBalRow').style.display, 'none', 'the balance line is hidden');
  eq(document.getElementById('piPaid').textContent, '₹12,000', 'the amount paid is on the receipt');
  eq(document.getElementById('piDescPaid').textContent, 'Amount paid (' + $('todayStr()') + ')', 'the paid line names the payment date');
  eq($('payInvData.salary'), null, 'no salary figure is passed to the receipt');
  eq($('payInvData.bal'), null, 'no balance is passed to the receipt');
  ok(!/Duty|Leave/.test($('payInvData.detailsHtml')) && !/Salary ₹/.test($('payInvData.detailsHtml')),
    'the details block has no duty / leave / salary working');
  ok(/Payment type:<\/b> Salary/.test($('payInvData.detailsHtml')), 'it keeps the payment type');
  eq(document.getElementById('piPeriod').textContent, '2026-10-01 → 2026-10-31', 'the period sits in the receipt header');
  eq(document.getElementById('piWords').textContent, $('amountInWords(12000)'), 'the words are the words of the paid amount');
}

console.log('\n2. Editing the Money-Entry form keeps the receipt paid-only');
{
  const { $, document } = boot({ employees: [RAJ] });
  fillMoneyForm(document, { pEmpSel: 'Raj', pFrom: '2026-10-01', pTo: '2026-10-31', pAmt: '12000', pType: 'Advance', pMode: 'UPI' });
  $('openPayInvoiceFromMoneyEntry()');
  document.getElementById('pAmt').value = '9000';
  $("refreshMoneyReceiptIfOpen('amt')");
  eq(document.getElementById('piSalaryRow').style.display, 'none', 'the salary line stays hidden after editing');
  eq(document.getElementById('piBalRow').style.display, 'none', 'the balance line stays hidden after editing');
  eq(document.getElementById('piPaid').textContent, '₹9,000', 'the receipt follows the edited amount');
  eq(document.getElementById('piDescPaid').textContent, 'Advance paid (' + $('todayStr()') + ')', 'a non-salary payment is labelled Advance paid');
}

console.log('\n3. The Salary Calculator receipt still shows the whole working');
{
  const { $, document } = boot({ employees: [RAJ] });
  $("lastSalary={name:'Raj',from:'2026-10-01',to:'2026-10-31',salary:15000,fullSalary:20000,bal:5000,rangeLabel:'2026-10-01 → 2026-10-31',copyText:'Salary details',dutyRecs:[],leaveRecs:[],dutyDays:31,leaveDays:0,assumed:true};openPayInvoice();");
  eq($('payInvData.simple'), undefined, 'the salary receipt is not a paid-only receipt');
  eq(document.getElementById('piSalaryRow').style.display, '', 'the salary line is shown');
  eq(document.getElementById('piBalRow').style.display, '', 'the balance line is shown');
  eq(document.getElementById('piSalary').textContent, '₹20,000', 'salary is on the receipt');
  eq(document.getElementById('piPaid').textContent, '₹5,000', 'the payable balance is the amount paid');
  eq(document.getElementById('piBalLbl').textContent, 'Balance to pay', 'and its balance is spelled out');
  ok(/Total duty days/.test($('payInvData.detailsHtml')), 'the duty & leave working is still on the salary receipt');
}

console.log('\n4. Re-printing from All Records keeps each receipt as it was made');
{
    /* a Money-Entry payment (pay type with no “ - <range>” suffix) */
  const money = { id: 'm1', empName: 'Raj', date: '2026-10-31', amount: 12000, payType: 'Salary', mode: 'Cash', periodFrom: '2026-10-01', periodTo: '2026-10-31', invoiceNo: 'PAY-0001', summary: 'Duty 31 days • Leave 0 days\nSalary ₹31,000 (₹1,000 × 31)\nPaid ₹12,000 • Balance ₹19,000', balance: 19000 };
  let { $, document } = boot({ employees: [RAJ], payments: [money] });
  $("openPayInvoiceFromRecord('m1')");
  eq($('payInvData.simple'), true, 'a Money-Entry payment re-prints paid-only');
  eq(document.getElementById('piSalaryRow').style.display, 'none', 'its salary line is hidden');
  eq(document.getElementById('piBalRow').style.display, 'none', 'its balance line is hidden');
  eq(document.getElementById('piPaid').textContent, '₹12,000', 'only the amount paid is shown');
  ok(!/Salary ₹/.test($('payInvData.detailsHtml')), 'the stored salary working is kept off the receipt');

  /* a Salary-Calculator payment (pay type = “Salary - <range>”) */
  const calc = { id: 'c1', empName: 'Raj', date: '2026-10-31', amount: 15000, payType: 'Salary - 2026-10-01 → 2026-10-31', mode: 'Cash', periodFrom: '2026-10-01', periodTo: '2026-10-31', invoiceNo: 'PAY-0002', summary: 'Salary details', balance: 5000 };
  ({ $, document } = boot({ employees: [RAJ], payments: [calc] }));
  $("openPayInvoiceFromRecord('c1')");
  eq($('payInvData.simple'), false, 'a Salary-Calculator payment keeps its full receipt');
  eq(document.getElementById('piSalaryRow').style.display, '', 'its salary line is shown');
  eq(document.getElementById('piBalRow').style.display, '', 'its balance line is shown');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
