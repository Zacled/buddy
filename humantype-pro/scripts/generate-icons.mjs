/**
 * HumanType Pro — icon generator.
 *
 * Produces the 16/48/128 px toolbar icons (a gold "H" on a dark rounded tile)
 * as real PNG files with zero third-party dependencies — it hand-writes the PNG
 * chunks and uses Node's built-in zlib for IDAT compression. Run with:
 *
 *   node scripts/generate-icons.mjs   (or: npm run icons)
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(here, '..', 'icons');

// ---- Palette --------------------------------------------------------------
const BG = [21, 23, 28, 255]; // #15171c
const GOLD = [212, 175, 55, 255]; // #d4af37
const GOLD_BRIGHT = [240, 199, 94, 255]; // #f0c75e
const TRANSPARENT = [0, 0, 0, 0];

// ---- CRC32 (for PNG chunks) ----------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** Encode an RGBA pixel buffer as a PNG Buffer. */
function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour + alpha
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Prefix every scanline with a 0 (no filter) byte.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- Drawing --------------------------------------------------------------
function lerp(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

/** Whether pixel center (cx,cy) lies inside a rounded square of side `size`. */
function insideRoundedSquare(cx, cy, size, r) {
  if (cx < r && cy < r) return (cx - r) ** 2 + (cy - r) ** 2 <= r * r;
  if (cx > size - r && cy < r) return (cx - (size - r)) ** 2 + (cy - r) ** 2 <= r * r;
  if (cx < r && cy > size - r) return (cx - r) ** 2 + (cy - (size - r)) ** 2 <= r * r;
  if (cx > size - r && cy > size - r)
    return (cx - (size - r)) ** 2 + (cy - (size - r)) ** 2 <= r * r;
  return true;
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;

  const set = (x, y, [r, g, b, a]) => {
    const i = (y * size + x) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = a;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;

      if (!insideRoundedSquare(cx, cy, size, radius)) {
        set(x, y, TRANSPARENT);
        continue;
      }

      const fx = cx / size;
      const fy = cy / size;

      // "H" geometry expressed as fractions of the tile.
      const inLeftBar = fx >= 0.3 && fx <= 0.42 && fy >= 0.28 && fy <= 0.72;
      const inRightBar = fx >= 0.58 && fx <= 0.7 && fy >= 0.28 && fy <= 0.72;
      const inCrossbar = fx >= 0.3 && fx <= 0.7 && fy >= 0.46 && fy <= 0.54;

      if (inLeftBar || inRightBar || inCrossbar) {
        const t = Math.min(1, Math.max(0, (fy - 0.28) / 0.44));
        set(x, y, [...lerp(GOLD_BRIGHT, GOLD, t).slice(0, 3), 255]);
      } else {
        set(x, y, BG);
      }
    }
  }

  return encodePng(size, size, rgba);
}

// ---- Emit -----------------------------------------------------------------
mkdirSync(iconsDir, { recursive: true });
for (const size of [16, 48, 128]) {
  const png = drawIcon(size);
  const file = resolve(iconsDir, `icon${size}.png`);
  writeFileSync(file, png);
  console.log(`icon${size}.png  (${png.length} bytes)`);
}
console.log('✅ Icons written to ./icons');
