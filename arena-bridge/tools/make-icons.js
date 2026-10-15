'use strict';

/**
 * Генератор иконок расширения (PNG) — без внешних зависимостей.
 *
 *   node tools/make-icons.js
 *
 * Рисует скруглённый квадрат с символом «>_» (терминал) и сохраняет
 * icon16/32/48/128.png в extension/icons/.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZES = [16, 32, 48, 128];
const OUT_DIR = path.join(__dirname, '..', 'extension', 'icons');
const SUPERSAMPLE = 4;

const BG = [9, 105, 218, 255]; // #0969da
const FG = [255, 255, 255, 255];

// ---------------------------------------------------------------- PNG

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------- рисование

/** Расстояние от точки до отрезка. */
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Значение внутри скруглённого квадрата (0..1 снаружи). */
function insideRoundedRect(x, y, radius) {
  const cx = Math.min(Math.max(x, radius), 1 - radius);
  const cy = Math.min(Math.max(y, radius), 1 - radius);
  return Math.hypot(x - cx, y - cy) <= radius;
}

/** Цвет пикселя в нормализованных координатах. */
function sample(x, y) {
  if (!insideRoundedRect(x, y, 0.22)) return [0, 0, 0, 0];

  const thickness = 0.085;
  const chevron = Math.min(
    distToSegment(x, y, 0.30, 0.30, 0.48, 0.50),
    distToSegment(x, y, 0.48, 0.50, 0.30, 0.70),
  );
  const underline = distToSegment(x, y, 0.55, 0.70, 0.73, 0.70);

  if (chevron <= thickness / 2 || underline <= thickness / 2) return FG;
  return BG;
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const step = 1 / (size * SUPERSAMPLE);

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const x = (px * SUPERSAMPLE + sx + 0.5) * step;
          const y = (py * SUPERSAMPLE + sy + 0.5) * step;
          const [cr, cg, cb, ca] = sample(x, y);
          r += cr * ca;
          g += cg * ca;
          b += cb * ca;
          a += ca;
        }
      }
      const total = SUPERSAMPLE * SUPERSAMPLE;
      const offset = (py * size + px) * 4;
      if (a > 0) {
        rgba[offset] = Math.round(r / a);
        rgba[offset + 1] = Math.round(g / a);
        rgba[offset + 2] = Math.round(b / a);
      }
      rgba[offset + 3] = Math.round(a / total);
    }
  }
  return encodePng(size, size, rgba);
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const size of SIZES) {
    const file = path.join(OUT_DIR, `icon${size}.png`);
    fs.writeFileSync(file, renderIcon(size));
    console.log(`[icons] ${path.relative(process.cwd(), file)}`);
  }
}

if (require.main === module) main();

module.exports = { renderIcon, encodePng };
