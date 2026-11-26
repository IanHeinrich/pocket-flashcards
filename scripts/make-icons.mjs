import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const outDir = join(fileURLToPath(new URL('..', import.meta.url)), 'icons');

const INDIGO = [0x4f, 0x46, 0xe5];
const WHITE = [255, 255, 255];
const BACK_ALPHA = 0.55;
const SAMPLES = 4;

// Shapes in unit coordinates (0 to 1). Both cards sit inside the central 80%,
// so the maskable icon survives any launcher mask.
const BACKGROUND_RADIUS = 0.22;
const BACK_CARD = { x: 0.4, y: 0.2, w: 0.38, h: 0.48, r: 0.05 };
const FRONT_CARD = { x: 0.22, y: 0.32, w: 0.38, h: 0.48, r: 0.05 };

/**
 * @param {{ x: number, y: number, w: number, h: number, r: number }} rect
 * @param {number} px
 * @param {number} py
 */
function insideRoundedRect({ x, y, w, h, r }, px, py) {
  const dx = Math.max(x + r - px, 0, px - (x + w - r));
  const dy = Math.max(y + r - py, 0, py - (y + h - r));
  return dx * dx + dy * dy <= r * r && px >= x && px <= x + w && py >= y && py <= y + h;
}

/**
 * Draws the icon as RGBA pixels, antialiased by supersampling.
 * @param {number} size
 * @param {{ maskable: boolean }} options
 */
function render(size, { maskable }) {
  const rgba = Buffer.alloc(size * size * 4);
  const background = { x: 0, y: 0, w: 1, h: 1, r: BACKGROUND_RADIUS };
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const u = (px + (sx + 0.5) / SAMPLES) / size;
          const v = (py + (sy + 0.5) / SAMPLES) / size;
          if (!maskable && !insideRoundedRect(background, u, v)) continue;
          let color = INDIGO;
          if (insideRoundedRect(BACK_CARD, u, v)) {
            color = INDIGO.map((c, i) => c + (WHITE[i] - c) * BACK_ALPHA);
          }
          if (insideRoundedRect(FRONT_CARD, u, v)) color = WHITE;
          r += color[0];
          g += color[1];
          b += color[2];
          a += 1;
        }
      }
      const i = (py * size + px) * 4;
      if (a > 0) {
        rgba[i] = Math.round(r / a);
        rgba[i + 1] = Math.round(g / a);
        rgba[i + 2] = Math.round(b / a);
      }
      rgba[i + 3] = Math.round((a / (SAMPLES * SAMPLES)) * 255);
    }
  }
  return rgba;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** @param {Buffer} bytes */
function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * @param {string} type
 * @param {Buffer} data
 */
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * @param {number} size
 * @param {Buffer} rgba
 */
function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function svg() {
  const hex = (/** @type {number[]} */ c) =>
    `#${c.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  const rect = (/** @type {typeof BACK_CARD} */ s, /** @type {string} */ extra) =>
    `<rect x="${s.x * 100}" y="${s.y * 100}" width="${s.w * 100}" height="${s.h * 100}" rx="${s.r * 100}" ${extra}/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${BACKGROUND_RADIUS * 100}" fill="${hex(INDIGO)}"/>
  ${rect(BACK_CARD, `fill="#fff" fill-opacity="${BACK_ALPHA}"`)}
  ${rect(FRONT_CARD, 'fill="#fff"')}
</svg>
`;
}

await mkdir(outDir, { recursive: true });
const files = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
];
for (const [name, size, maskable] of files) {
  await writeFile(
    join(outDir, String(name)),
    encodePng(Number(size), render(Number(size), { maskable: Boolean(maskable) })),
  );
  console.log(`icons/${name}`);
}
await writeFile(join(outDir, 'favicon.svg'), svg());
console.log('icons/favicon.svg');
