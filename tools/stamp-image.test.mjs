/* ============================================================================
   Hisab — stamp-in-the-image tests (no browser needed)

   The RECEIVED / PAID stamp is an inline <svg>. html2canvas has no SVG painter:
   it serializes the svg to a data:image/svg+xml copy and draws that — and with the
   page's layout CSS (position:absolute / right / bottom / transform) copied onto
   it, the browser paints NOTHING. That is how the stamp disappeared from every
   saved / WhatsApp image while the print / PDF copy still showed it.

   These tests run the real render code out of index.html against a stub DOM and
   pin the fix down: the stamp is painted by hand onto the finished canvas, at the
   screen position, angle and opacity — and the serialized copy carries no layout
   properties, only resolved paint values.

     node tools/stamp-image.test.mjs
   ========================================================================== */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function slice(startMarker, endMarker, what) {
  const a = HTML.indexOf(startMarker);
  const b = HTML.indexOf(endMarker, a);
  if (a < 0 || b < 0 || b <= a) throw new Error('index.html no longer contains ' + what);
  return HTML.slice(a, b);
}
const RENDER_CODE = slice('/* ============== RENDER INVOICE / RECEIPT TO AN IMAGE', '/* Download a blob as a file', 'the render + stamp-painting code');

let pass = 0, fail = 0;
const ok = (cond, label) => { cond ? (pass++, console.log('  ✅ ' + label)) : (fail++, console.log('  ❌ ' + label)); };
const eq = (got, want, label) => ok(got === want, label + (got === want ? '' : '  (got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want) + ')'));

/* ------------------------------------------------------------- stub DOM bits */
const el = (tag, attrs = {}, children = []) => ({ tag, attrs: { ...attrs }, children, classes: [] });
const SVG = el('svg', { class: 'stamp', viewBox: '0 0 200 200' }, [
  el('circle', { cx: '100', cy: '100', r: '97', stroke: 'currentColor' }),
  el('text', { class: 'stampPaid' }, [el('tspan', {}, [])])
]);
SVG.viewBox = { baseVal: { width: 200, height: 200 } };   // like the real DOM property

function domClone(src) {
  const c = { tag: src.tag, attrs: { ...src.attrs }, children: src.children.map(domClone), classes: src.classes.slice() };
  if (src.viewBox) c.viewBox = src.viewBox;
  return c;
}
function withDomMethods(node) {
  node.cloneNode = () => {
    const c = domClone(node);
    const walk = n => { bind(n); n.children.forEach(walk); };
    const bind = n => {
      n.querySelectorAll = sel => {
        const out = [];
        const visit = x => x.children.forEach(k => { if (sel === '*' || k.tag === sel.replace('*', '')) out.push(k); visit(k); });
        visit(n);
        return out;
      };
      n.setAttribute = (k, v) => { n.attrs[k] = String(v); };
      n.getAttribute = k => (k in n.attrs ? n.attrs[k] : null);
      n.removeAttribute = k => { delete n.attrs[k]; };
    };
    walk(c);
    return c;
  };
  bind(node);
  return node;
  function bind(n) {
    n.querySelectorAll = sel => {
      const out = [];
      const visit = x => x.children.forEach(k => { if (sel === '*' || k.tag === sel.replace('*', '')) out.push(k); visit(k); });
      visit(n);
      return out;
    };
    n.setAttribute = (k, v) => { n.attrs[k] = String(v); };
    n.getAttribute = k => (k in n.attrs ? n.attrs[k] : null);
    n.removeAttribute = k => { delete n.attrs[k]; };
  }
}

/* A real browser offers a CSSStyleDeclaration both ways: el.width and
   el.getPropertyValue('width'). This stub does the same. */
const computedFor = n => {
  let props;
  if (n.tag === 'svg') props = { color: 'rgb(197, 48, 48)', width: '122px', height: '122px', opacity: '0.92', transform: 'matrix(0.978148, -0.207912, 0.207912, 0.978148, 0, 0)' };
  else if (n.tag === 'text' || n.tag === 'tspan') props = { fill: 'rgb(197, 48, 48)', 'font-size': '36px', 'font-weight': '900' };
  else props = { fill: 'none', stroke: 'rgb(197, 48, 48)', 'stroke-width': '4' };
  return {
    ...props,
    getPropertyValue: p => (props[p] === undefined ? '' : props[p])
  };
};

function serialize(node) {
  const attrs = Object.entries(node.attrs).map(([k, v]) => k + '="' + v + '"').join(' ');
  const kids = node.children.map(serialize).join('');
  return '<' + node.tag + (attrs ? ' ' + attrs : '') + '>' + kids + '</' + node.tag + '>';
}

/* --------------------------------------------------------------- stub render */
function boot({ stampPresent = true, imageLoads = true } = {}) {
  const calls = { drawImage: [], translate: [], rotate: [], setTransform: [], alpha: [], saved: [] };
  const ctx = {
    save: () => calls.saved.push('save'),
    restore: () => calls.saved.push('restore'),
    setTransform: (...a) => calls.setTransform.push(a),
    translate: (...a) => calls.translate.push(a),
    rotate: (...a) => calls.rotate.push(a),
    drawImage: (...a) => calls.drawImage.push(a),
    set globalAlpha(v) { calls.alpha.push(v); },
    get globalAlpha() { return 1; }
  };
  const canvas = { width: 1520, height: 746, getContext: () => ctx, toBlob: cb => cb({ size: 10 }) };

  const stamp = stampPresent ? withDomMethods(SVG) : null;
  const node = {
    id: 'invoicePrintArea',
    getBoundingClientRect: () => ({ left: 40, top: 500, width: 760, height: 373 }),
    querySelectorAll: sel => (sel === 'svg.stamp' && stamp ? [Object.assign(stamp, { getBoundingClientRect: () => ({ left: 609, top: 682, width: 144.69934, height: 144.69934 }) })] : [])
  };

  const images = [];
  class Image {
    constructor() { images.push(this); this.naturalWidth = 122; this.naturalHeight = 122; }
    set src(v) {
      this._src = v;
      setTimeout(() => { imageLoads ? this.onload && this.onload() : this.onerror && this.onerror(); }, 0);
    }
    get src() { return this._src; }
  }

  const sandbox = {
    console, setTimeout, clearTimeout, Promise, Error, String, Object, JSON, Math, Number, Array, parseFloat, isNaN,
    document: { getElementById: id => (id === node.id ? node : null) },
    window: { html2canvas: async () => canvas },
    getComputedStyle: n => computedFor(n),
    XMLSerializer: class { serializeToString(n) { return serialize(n); } },
    Image
  };
  sandbox.window.window = sandbox.window;
  const ctxObj = vm.createContext(sandbox);
  vm.runInContext(RENDER_CODE, ctxObj, { filename: 'index.html<render>' });
  return { calls, images, canvas, node, $: e => vm.runInContext(e, ctxObj) };
}

/* ------------------------------------------------- 1. the stamp is painted in */
console.log('\n1. The stamp is painted onto the finished canvas');
{
  const t = boot();
  const blob = await t.$(`renderNodeToBlob('invoicePrintArea')`);
  ok(!!blob, 'the render returns an image blob');
  eq(t.calls.drawImage.length, 1, 'the stamp is drawn exactly once');
  const [img, dx, dy, dw, dh] = t.calls.drawImage[0];
  eq(dw, 244, 'drawn at the stamp’s size × 2 (122 × 2)');
  eq(dh, 244, 'height matches too');
  eq(dx, -122, 'centred on the rotation point');
  eq(dy, -122, 'centred vertically as well');
  eq(t.calls.translate.length, 1, 'the canvas is moved to the stamp’s centre');
  // independent maths: centre of the stamp on screen, relative to the card, × scale 2
  eq(Math.round(t.calls.translate[0][0]), Math.round((609 + 144.69934 / 2 - 40) * 2), 'the x position is the stamp’s own on-screen spot');
  eq(Math.round(t.calls.translate[0][1]), Math.round((682 + 144.69934 / 2 - 500) * 2), 'and the y position too');
  eq(Math.round(t.calls.rotate[0][0] * 180 / Math.PI), -12, 'the −12° rotation from the stylesheet is applied');
  eq(t.calls.alpha[0], 0.92, 'the stamp keeps its 0.92 opacity');
  ok(String(img.src).startsWith('data:image/svg+xml'), 'the drawn image is an SVG data URI');
}

/* --------------------------- 2. html2canvas’s leftover transform is undone */
console.log('\n2. The canvas transform html2canvas leaves behind is reset first');
{
  const t = boot();
  await t.$(`renderNodeToBlob('invoicePrintArea')`);
  eq(t.calls.setTransform.length, 1, 'the context transform is reset before drawing');
  eq(JSON.stringify(t.calls.setTransform[0]), JSON.stringify([1, 0, 0, 1, 0, 0]), 'reset to the identity matrix');
  // without it, a context left on matrix(2,0,0,2,-82,-1041) double-scales and the stamp lands off-canvas
  ok(t.calls.saved[0] === 'save' && t.calls.saved[t.calls.saved.length - 1] === 'restore', 'the drawing is wrapped in save/restore');
}

/* ------------------- 3. the serialized copy carries paint values, no layout */
console.log('\n3. The serialized stamp has resolved colours and no layout properties');
{
  const t = boot();
  await t.$(`renderNodeToBlob('invoicePrintArea')`);
  const svg = decodeURIComponent(String(t.images[0].src).split(',').slice(1).join(','));
  ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'), 'the copy declares the SVG namespace');
  ok(/width="122"/.test(svg), 'the copy has an explicit width');
  ok(/height="122"/.test(svg), 'the copy has an explicit height');
  ok(svg.includes('color:rgb(197, 48, 48)'), 'the computed colour is inlined (no currentColor needed)');
  ok(svg.includes('stroke:rgb(197, 48, 48)'), 'the circle’s stroke is resolved to a real colour');
  ok(svg.includes('fill:rgb(197, 48, 48)'), 'text fill resolved as well');
  ok(!/class=/.test(svg), 'no class attributes are left for page CSS to act on');
  ['position:', 'right:', 'bottom:', 'left:', 'top:', 'transform:', 'visibility:', 'z-index:'].forEach(p =>
    ok(!svg.includes(p), 'no layout property “' + p + '” in the copy'));
  // the presentation attributes still say currentColor, but every element carries a
  // resolved inline value too — the inline style wins, so nothing depends on the page
  ok(/stroke:rgb\(197, 48, 48\)/.test(svg), 'the currentColor stroke is overridden by a resolved colour');
}

/* ---------------------------------- 4. a card without a stamp still renders */
console.log('\n4. A card with no stamp renders unchanged');
{
  const t = boot({ stampPresent: false });
  const blob = await t.$(`renderNodeToBlob('invoicePrintArea')`);
  ok(!!blob, 'the image is still produced');
  eq(t.calls.drawImage.length, 0, 'nothing extra is drawn');
  eq(await t.$(`paintStamps(document.getElementById('invoicePrintArea'),{getContext:()=>null,width:1,height:1})`), 0, 'paintStamps reports 0 stamps');
}

/* ---------------------- 5. a stamp that will not load never breaks the image */
console.log('\n5. If the stamp image cannot be loaded, the invoice still saves');
{
  const t = boot({ imageLoads: false });
  const blob = await t.$(`renderNodeToBlob('invoicePrintArea')`);
  ok(!!blob, 'the render still resolves');
  eq(t.calls.drawImage.length, 0, 'the unloadable stamp is skipped, not awaited forever');
}

/* ---------------------------- 6. the app’s own buttons go through this path */
console.log('\n6. Every image the app produces goes through the stamp-painting render');
{
  ['saveNodeImage', 'sendNodeOnWhatsApp'].forEach(() => { });
  ok(/async function renderNodeToBlob[\s\S]*?await window\.html2canvas[\s\S]*?paintStamps\(/.test(HTML),
    'renderNodeToBlob paints the stamps before the PNG is taken');
  const callers = ['saveNodeImage', 'sendNodeOnWhatsApp'];
  callers.forEach(fn => ok(new RegExp(fn + '[\\s\\S]{0,1200}renderNodeToBlob').test(HTML), fn + '() renders through renderNodeToBlob'));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
