#!/usr/bin/env node
/**
 * Generates the PWA icons and the favicon.
 *
 * Writes real PNGs with nothing but Node's zlib - no image dependency for two
 * flat icons. The mark is a receipt on the brand blue: a white rounded panel
 * with three bars and a torn bottom edge.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = resolve(ROOT, 'apps/web/public');
const ICON_DIR = resolve(PUBLIC_DIR, 'icons');

const BRAND = [0x00, 0x6a, 0xff];
const WHITE = [0xff, 0xff, 0xff];

/* -------------------------------------------------------------------------- */
/* Minimal PNG encoder                                                         */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10..12 stay zero: deflate, adaptive filtering, no interlace.

  // Each scanline is prefixed with its filter type (0 = none).
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------------------------------------------------- */
/* The mark                                                                    */
/* -------------------------------------------------------------------------- */

function drawIcon(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const set = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = a;
  };

  // A maskable icon must survive being cropped to a circle, so the mark sits
  // inside the safe zone and the background bleeds to the edges.
  const radius = maskable ? 0 : size * 0.22;

  const insideRounded = (x, y, left, top, right, bottom, r) => {
    if (x < left || x > right || y < top || y > bottom) return false;
    const cx = x < left + r ? left + r : x > right - r ? right - r : x;
    const cy = y < top + r ? top + r : y > bottom - r ? bottom - r : y;
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r + r;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (radius === 0 || insideRounded(x, y, 0, 0, size - 1, size - 1, radius)) {
        set(x, y, BRAND);
      }
    }
  }

  // The receipt panel.
  const inset = maskable ? size * 0.3 : size * 0.24;
  const left = Math.round(inset);
  const right = Math.round(size - inset);
  const top = Math.round(inset * 0.92);
  const bottom = Math.round(size - inset * 0.92);
  const panelRadius = Math.max(2, (right - left) * 0.1);

  // A torn bottom edge: three triangular notches, like a till roll.
  const teeth = 4;
  const toothHeight = (bottom - top) * 0.1;
  const toothWidth = (right - left) / teeth;

  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (!insideRounded(x, y, left, top, right, bottom, panelRadius)) continue;

      if (y > bottom - toothHeight) {
        const local = (x - left) % toothWidth;
        const peak = Math.abs(local - toothWidth / 2) / (toothWidth / 2);
        if (y - (bottom - toothHeight) > peak * toothHeight) continue;
      }
      set(x, y, WHITE);
    }
  }

  // Three bars: two lines of text and a total.
  const barLeft = left + (right - left) * 0.16;
  const barHeight = Math.max(1, Math.round((bottom - top) * 0.07));
  const bars = [
    { y: top + (bottom - top) * 0.2, width: 0.68 },
    { y: top + (bottom - top) * 0.38, width: 0.68 },
    { y: top + (bottom - top) * 0.58, width: 0.42 },
  ];

  for (const bar of bars) {
    const barRight = barLeft + (right - left) * bar.width;
    for (let y = Math.round(bar.y); y < Math.round(bar.y) + barHeight; y++) {
      for (let x = Math.round(barLeft); x < Math.round(barRight); x++) set(x, y, BRAND);
    }
  }

  return encodePng(size, size, rgba);
}

/* -------------------------------------------------------------------------- */

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="POS">
  <rect width="64" height="64" rx="14" fill="#006AFF"/>
  <path d="M17 13h30v33l-5-4-5 4-5-4-5 4-5-4-5 4z" fill="#fff"/>
  <g fill="#006AFF">
    <rect x="23" y="21" width="18" height="3.4" rx="1.7"/>
    <rect x="23" y="28" width="18" height="3.4" rx="1.7"/>
    <rect x="23" y="35" width="11" height="3.4" rx="1.7"/>
  </g>
</svg>
`;

mkdirSync(ICON_DIR, { recursive: true });

writeFileSync(resolve(PUBLIC_DIR, 'favicon.svg'), FAVICON_SVG);
writeFileSync(resolve(ICON_DIR, 'icon-192.png'), drawIcon(192));
writeFileSync(resolve(ICON_DIR, 'icon-512.png'), drawIcon(512));
writeFileSync(resolve(ICON_DIR, 'icon-512-maskable.png'), drawIcon(512, { maskable: true }));
writeFileSync(resolve(ICON_DIR, 'apple-touch-icon.png'), drawIcon(180, { maskable: true }));

console.log('Icons written to apps/web/public/icons/ and favicon.svg');
