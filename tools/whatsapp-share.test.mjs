/* ============================================================================
   Hisab — "📲 Send on WhatsApp" tests (no phone, no WhatsApp needed)

   Runs the REAL WhatsApp-share code out of index.html in a Node VM against a
   mock DOM / share sheet, so the two ways of sending an invoice / receipt can be
   checked without a device:

     • phone with file sharing (Android Chrome, iPhone Safari) → the native share
       sheet opens with the image ALREADY ATTACHED and the message as its caption
       (nothing is sent until you press Send), and a copy of the image is saved;
     • everywhere else (desktop, old browsers) → the old way: image saved, then
       WhatsApp opens on that person's chat with the message typed;
     • closing the share sheet sends nothing and opens nothing;
     • a phone without a saved number is still asked for one, and skipping it
       lands on the WhatsApp chooser with the "number not saved" note.

     node tools/whatsapp-share.test.mjs
   ========================================================================== */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* The real code, sliced out of index.html, so the tests break loudly if the
   markers ever disappear instead of silently testing nothing. */
function slice(startMarker, endMarker, what) {
  const a = HTML.indexOf(startMarker);
  const b = HTML.indexOf(endMarker, a);
  if (a < 0 || b < 0 || b <= a) throw new Error('index.html no longer contains ' + what);
  return HTML.slice(a, b);
}
const WA_CODE = slice('/* Clean a phone number for WhatsApp', '/* Remember the number typed', 'the wa.me helpers');
const SHARE_CODE = slice('/* Can this browser put a FILE', '/* Client invoice → WhatsApp image.', 'the share-sheet flow');

let pass = 0, fail = 0;
const ok = (cond, label) => { cond ? (pass++, console.log('  ✅ ' + label)) : (fail++, console.log('  ❌ ' + label)); };
const eq = (got, want, label) => ok(got === want, label + (got === want ? '' : '  (got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want) + ')'));

/* --------------------------------------------------------------- mock device */
function boot({ canShareFiles = true, shareResult = 'ok', phone = '' } = {}) {
  const calls = { downloads: [], chats: [], shares: [], toasts: [], asked: [] };
  const sandbox = {
    console, setTimeout, clearTimeout, Promise, Error, String, Object, JSON,
    navigator: {
      canShare: canShareFiles ? (data => !!(data && data.files && data.files.length)) : undefined,
      share: data => {
        calls.shares.push(data);
        if (shareResult === 'ok') return Promise.resolve();
        if (shareResult === 'cancel') return Promise.reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
        if (shareResult === 'throw') throw new Error('share refused');
        return Promise.reject(Object.assign(new Error('not allowed'), { name: 'NotAllowedError' }));
      }
    },
    File: class File {
      constructor(parts, name, opts) { this.parts = parts; this.name = name; this.type = (opts || {}).type; }
    },
    /* stubs for everything sendNodeOnWhatsApp() reaches out to */
    renderNodeToBlob: async () => ({ size: 1234, type: 'image/png' }),
    downloadBlob: (blob, filename) => calls.downloads.push(filename),
    toast: t => calls.toasts.push(t),
    askWhatsAppNumber: (name, cb) => calls.asked.push({ name, cb }),
    window: null
  };
  sandbox.window = sandbox;
  sandbox.window.open = url => calls.chats.push(url);

  const ctx = vm.createContext(sandbox);
  vm.runInContext(WA_CODE, ctx, { filename: 'index.html<wa-helpers>' });
  vm.runInContext(SHARE_CODE, ctx, { filename: 'index.html<share-flow>' });
  sandbox.__phone = phone;
  return { calls, ctx, $: expr => vm.runInContext(expr, ctx) };
}

const INV_TEXT = '🧾 Invoice INV-0007 — Ardas Caretaker Manager\nClient: Sharma ji\nAmount received: ₹25,000';

/* ------------------------------------------------------ 1. phone, share sheet */
console.log('\n1. A phone that can share files → image attached with the message as caption');
{
  const t = boot({ canShareFiles: true, shareResult: 'ok' });
  await t.$(`sendNodeOnWhatsApp('invoicePrintArea',${JSON.stringify(INV_TEXT)},'9876543210','Invoice-INV-0007.png','Sharma ji (client)')`);
  eq(t.calls.shares.length, 1, 'the share sheet is opened once');
  const d = t.calls.shares[0];
  eq(d.files.length, 1, 'the invoice image is attached to the share');
  eq(d.files[0].name, 'Invoice-INV-0007.png', 'the attached file is the invoice PNG');
  eq(d.text, INV_TEXT, 'the message travels as the caption under the image');
  eq(t.calls.downloads.length, 1, 'a copy of the image is still saved to the device');
  eq(t.calls.chats.length, 0, 'no WhatsApp chat link is opened as well');
  ok(/press Send/.test(t.calls.toasts.slice(-1)[0] || ''), 'the toast tells the user to press Send');
  ok(/Sharma ji/.test(t.calls.toasts.slice(-1)[0] || ''), 'the toast names the person to pick');
}

/* ------------------------------------------------- 2. closing the share sheet */
console.log('\n2. Closing the share sheet → nothing sent, no stray chat window');
{
  const t = boot({ canShareFiles: true, shareResult: 'cancel' });
  await t.$(`sendNodeOnWhatsApp('invoicePrintArea',${JSON.stringify(INV_TEXT)},'9876543210','Invoice-INV-0007.png','Sharma ji (client)')`);
  eq(t.calls.shares.length, 1, 'the share sheet was opened');
  eq(t.calls.chats.length, 0, 'no WhatsApp chat is opened after cancelling');
  eq(t.calls.downloads.length, 1, 'the image copy was already saved before the sheet opened');
  ok(!/press Send/.test(t.calls.toasts.slice(-1)[0] || ''), 'no “sent” toast after cancelling');
}

/* ---------------------------- 3. share refused → fall back to the chat link */
console.log('\n3. Share refused (no activation / not allowed) → the chat link is used instead');
{
  const t = boot({ canShareFiles: true, shareResult: 'denied' });
  await t.$(`sendNodeOnWhatsApp('invoicePrintArea',${JSON.stringify(INV_TEXT)},'9876543210','Invoice-INV-0007.png','Sharma ji (client)')`);
  eq(t.calls.chats.length, 1, 'WhatsApp opens on the chat link');
  ok(t.calls.chats[0].startsWith('https://wa.me/919876543210?text='), 'the chat opens on the full international number');
  ok(decodeURIComponent(t.calls.chats[0]).includes('Invoice INV-0007'), 'the message is carried in the link');
  eq(t.calls.downloads.length, 1, 'the image is saved exactly once (no double download)');
}

console.log('\n4. Desktop / no file sharing → the old way is unchanged');
{
  const t = boot({ canShareFiles: false });
  await t.$(`sendNodeOnWhatsApp('invoicePrintArea',${JSON.stringify(INV_TEXT)},'9876543210','Invoice-INV-0007.png','Sharma ji (client)')`);
  eq(t.calls.shares.length, 0, 'the share sheet is never used');
  eq(t.calls.downloads.length, 1, 'the image is saved, ready to attach');
  eq(t.calls.chats.length, 1, 'the chat link is opened');
  ok(t.calls.chats[0].startsWith('https://wa.me/919876543210?text='), 'straight on that person’s chat');
  ok(/attach it in the chat/.test(t.calls.toasts.slice(-1)[0] || ''), 'the toast asks for the manual attach');
}

console.log('\n5. No number saved → the app still asks, and a skipped number lands on the chooser');
{
  const t = boot({ canShareFiles: false, phone: '' });
  await t.$(`sendNodeOnWhatsApp('invoicePrintArea',${JSON.stringify(INV_TEXT)},'','Invoice-INV-0007.png','Sharma ji (client)')`);
  eq(t.calls.asked.length, 1, 'the person is asked for a WhatsApp number');
  eq(t.calls.asked[0].name, 'Sharma ji (client)', 'the dialog is titled with that person');
  eq(t.calls.chats.length, 0, 'no chat opens before the number is answered');

  t.calls.asked[0].cb('');                                   // “No number — choose a chat”
  const url = decodeURIComponent(t.calls.chats[0] || '');
  ok(url.startsWith('https://api.whatsapp.com/send?text='), 'the WhatsApp chooser opens');
  ok(url.includes('Number not saved — you can type it next'), 'the “number not saved” note is only added here');
  eq(t.calls.downloads.length, 1, 'the image is saved once, not twice');

  const t2 = boot({ canShareFiles: false });
  await t2.$(`sendNodeOnWhatsApp('invoicePrintArea',${JSON.stringify(INV_TEXT)},'','Invoice-INV-0007.png','Sharma ji (client)')`);
  t2.calls.asked[0].cb('98765 43210');                       // a number typed on the spot
  ok(t2.calls.chats[0].startsWith('https://wa.me/919876543210?text='), 'a typed number still opens that person’s chat');
  ok(!decodeURIComponent(t2.calls.chats[0]).includes('Number not saved'), 'and then there is no note in the message');
}

console.log('\n6. The caption never carries the “number not saved” note on the share sheet');
{
  const t = boot({ canShareFiles: true, shareResult: 'ok' });
  await t.$(`sendNodeOnWhatsApp('payInvoicePrintArea','🧾 Salary receipt PAY-0003 — Ardas Caretaker Manager','','Salary-receipt-PAY-0003.png','Ramesh')`);
  eq(t.calls.shares.length, 1, 'the salary receipt goes through the share sheet too');
  ok(!t.calls.shares[0].text.includes('Number not saved'), 'the client never reads an internal note');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
