/**
 * Brand guards for the shipped extension (brand presence audit 2026-09-28).
 * The website doxa.app is the design canon: the toolbar/store icon is the
 * Doxa app icon (white mountains mark on sacred flame #FF4500), the master
 * line is "Know the God who speaks.", and amber is reserved for
 * "Record a prophecy" in the app, so extension accents are brand blue.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root));

// Minimal PNG decoder: 8-bit RGB/RGBA, non-interlaced (what the icon build writes).
function decodePng(buf) {
  let pos = 8;
  let width, height, colorType;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, 'bit depth 8');
      colorType = data[9];
      assert.equal(data[12], 0, 'non-interlaced');
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : assert.fail(`colour type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const cur = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      const p = a + b - c;
      const pr = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      out[y * stride + x] = (cur + [0, a, b, (a + b) >> 1, pr][f]) & 0xff;
    }
  }
  return { width, height, px: (x, y) => [...out.subarray(y * stride + x * bpp, y * stride + x * bpp + bpp)] };
}

test('toolbar and store icons are the Doxa app icon (white mark on #FF4500)', () => {
  for (const size of [16, 32, 48, 128]) {
    const img = decodePng(read(`src/icons/icon-${size}.png`));
    assert.equal(img.width, size);
    assert.equal(img.height, size);
    const bg = img.px(Math.round(size * 0.3), Math.round(size * 0.12));
    assert.ok(bg[0] > 240 && bg[1] > 55 && bg[1] < 85 && bg[2] < 20, `icon-${size} tile is #FF4500, got ${bg}`);
  }
  // The mark itself is white: the 128 icon holds near-white pixels.
  const big = decodePng(read('src/icons/icon-128.png'));
  let white = 0;
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const [r, g, b] = big.px(x, y);
    if (r > 245 && g > 245 && b > 245) white++;
  }
  assert.ok(white > 400, `white mountains mark present (${white} px)`);
});

test('manifest summary leads with the master line and fits the store limit', () => {
  const manifest = JSON.parse(read('static/manifest.json'));
  assert.ok(manifest.description.startsWith('Know the God who speaks.'));
  assert.ok(manifest.description.length <= 132, `${manifest.description.length} chars`);
});

test('shipped UI uses no amber accent (reserved for "Record a prophecy")', () => {
  const files = [
    ...readdirSync(new URL('src/', root), { recursive: true }).filter((f) => f.endsWith('.ts')).map((f) => `src/${f}`),
    ...readdirSync(new URL('static/', root)).map((f) => `static/${f}`),
  ];
  assert.ok(files.length > 10, `scanned ${files.length} files`);
  for (const file of files) {
    const src = read(file).toString();
    assert.doesNotMatch(src, /#FF9500\b|rgba?\(\s*255\s*,\s*149\s*,\s*0/i, `${file} carries an amber accent`);
  }
});

test('shipped UI carries the brand night surfaces, never the old charcoal greys (Garth 2026-09-28)', () => {
  const files = [
    ...readdirSync(new URL('src/', root), { recursive: true }).filter((f) => f.endsWith('.ts')).map((f) => `src/${f}`),
    ...readdirSync(new URL('static/', root)).map((f) => `static/${f}`),
  ];
  assert.ok(files.length > 10, `scanned ${files.length} files`);
  // Old neutral-charcoal surfaces (pre brand-night-tokens): plain charcoal
  // #1A1A1A, near-black #121212/#2A2A2A, and the old smoke/ash/ember greys
  // #242424/#2C2C2C/#3C3C3C. The muted foreground grey #707070 is unrestricted.
  const oldCharcoal = /#(1A1A1A|121212|2A2A2A|242424|2C2C2C|3C3C3C)\b/i;
  for (const file of files) {
    const src = read(file).toString();
    assert.doesNotMatch(src, oldCharcoal, `${file} still carries an old charcoal surface hex`);
  }
  // The brand night hex must appear as an actual declaration (a CSS custom
  // property or a background/border value) in each surface that owns one,
  // not merely somewhere in a comment — a doc-only mention must not let a
  // regressed surface (e.g. a deleted :root block) pass this guard.
  const nightDeclaration = /(?:--doxa-night|background)\s*:\s*#0F1B20\b/i;
  for (const file of ['static/popup.css', 'static/sidepanel.css', 'src/background.ts', 'src/content/selection-bubble.ts']) {
    assert.match(read(file).toString(), nightDeclaration, `${file} is missing a brand-night (#0F1B20) declaration`);
  }
});
