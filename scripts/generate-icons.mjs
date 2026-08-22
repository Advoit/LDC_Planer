import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT_DIR = 'public/icons';
mkdirSync(OUT_DIR, { recursive: true });

/* ───── CRC-32 ───── */
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgbaBuf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter none
    rgbaBuf.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ───── Simple SDF shapes ───── */
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function sdRoundedRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const l2 = abx * abx + aby * aby;
  if (l2 < 1e-12) return Math.hypot(apx, apy);
  const t = clamp((apx * abx + apy * aby) / l2, 0, 1);
  return Math.hypot(apx - abx * t, apy - aby * t);
}

/* ───── Draw icon to RGBA ───── */
const BG_BLUE  = [0, 122, 255];
const WHITE    = [255, 255, 255];
const LINE_CLR = [199, 199, 204];
const CHECK_CLR= [0, 122, 255];

function sampleColor(px, py, S, masked) {
  /* Shapes: all coordinates normalised 0…S. */
  /* Maskable: full-bleed bg; otherwise rounded bg */
  let d;

  /* Background */
  if (masked) {
    d = -1; // full square, signal inside
  } else {
    const bgR = 0.22 * S;
    d = sdRoundedRect(px, py, S * 0.5, S * 0.5, S * 0.48, S * 0.48, bgR);
  }

  if (masked ? true : d < 0) {
    /* Inside bg → blue */
    /* White card */
    const cardHW = 0.28 * S, cardHH = 0.31 * S, cardR = 0.09 * S;
    const dc = sdRoundedRect(px, py, S * 0.5, S * 0.5, cardHW, cardHH, cardR);
    if (dc < 0) {
      /* Checkmarks & lines */
      const rows = [0.26 * S, 0.5 * S, 0.74 * S];
      for (const ry of rows) {
        /* Line */
        const dl = sdSegment(px, py, 0.42 * S, ry, 0.66 * S, ry) - 0.025 * S;
        if (dl < 0) return LINE_CLR;
        /* Check circle */
        const dcc = Math.hypot(px - 0.33 * S, py - ry) - 0.04 * S;
        if (dcc < 0) return CHECK_CLR;
        /* Checkmark tick */
        const mx = 0.33 * S, my = ry;
        const d1 = sdSegment(px, py, mx - 0.04 * S, my + 0.005 * S, mx - 0.01 * S, my + 0.03 * S) - 0.012 * S;
        const d2 = sdSegment(px, py, mx - 0.01 * S, my + 0.03 * S, mx + 0.038 * S, my - 0.025 * S) - 0.012 * S;
        if (d1 < 0 || d2 < 0) return WHITE;
      }
      return WHITE;
    }
    return BG_BLUE;
  }
  return null; // transparent
}

function render(S, masked) {
  const SS = 4; // supersampling
  const rgba = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          const clr = sampleColor(px, py, S, masked);
          if (clr) { r += clr[0]; g += clr[1]; b += clr[2]; a += 1; }
        }
      }
      const n = SS * SS;
      const off = (y * S + x) * 4;
      if (a > 0) {
        rgba[off]     = Math.round(r / a);
        rgba[off + 1] = Math.round(g / a);
        rgba[off + 2] = Math.round(b / a);
        rgba[off + 3] = 255;
      }
    }
  }
  return rgba;
}

/* ───── Write icons ───── */
const specs = [
  { name: 'icon-192.png', size: 192, masked: false },
  { name: 'icon-512.png', size: 512, masked: false },
  { name: 'icon-maskable-512.png', size: 512, masked: true },
  { name: 'apple-touch-icon.png', size: 180, masked: false },
];

for (const { name, size, masked } of specs) {
  const rgba = render(size, masked);
  writeFileSync(`${OUT_DIR}/${name}`, encodePng(size, size, rgba));
  console.log(`✓ ${OUT_DIR}/${name}`);
}