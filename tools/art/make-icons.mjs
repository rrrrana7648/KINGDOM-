#!/usr/bin/env node
/**
 * make-icons.mjs — paints each pack's pack_icon.png (128×128) with zero
 * dependencies: a crimson banner with a golden crown for the Behavior Pack
 * and a royal-blue banner with a golden seal for the Resource Pack.
 * Usage: node tools/art/make-icons.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SIZE = 128;

function crc32(buf) {
  let t = crc32.t;
  if (!t) {
    t = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(pixels) {
  const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
  let o = 0;
  for (let y = 0; y < SIZE; y++) {
    raw[o++] = 0;
    for (let x = 0; x < SIZE; x++) {
      const [r, g, b, a] = pixels(x, y);
      raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// 16×16 glyphs scaled ×6 and centred (pixel-art look at 128).
const CROWN = [
  "................",
  "................",
  "..K..........K..",
  ".KGK...KK...KGK.",
  ".KGK..KGGK..KGK.",
  ".KGGK.KGGK.KGGK.",
  ".KGGGKGGGGKGGGK.",
  ".KGGGGGGGGGGGGK.",
  ".KGGRGGGUGGGRGK.",
  ".KGGGGGGGGGGGGK.",
  ".KKKKKKKKKKKKKK.",
  ".KGGGGGGGGGGGGK.",
  ".KgGgGgGgGgGgGK.",
  ".KKKKKKKKKKKKKK.",
  "................",
  "................",
];
const SEAL = [
  "................",
  ".....KKKKKK.....",
  "...KKRRRRRRKK...",
  "..KRRRRRRRRRRK..",
  ".KRRRGGGGGGRRRK.",
  ".KRRGGWWGGGGRRK.",
  ".KRRGWGGGGGGRRK.",
  ".KRRGGGGKKGGRRK.",
  ".KRRGGGKKKKGRRK.",
  ".KRRGGGGKKGGRRK.",
  ".KRRGGGGGGGGRRK.",
  ".KRRRGGGGGGRRRK.",
  "..KRRRRRRRRRRK..",
  "...KKRRRRRRKK...",
  ".....KKKKKK.....",
  "................",
];
const PAL = {
  K: [20, 16, 12, 255], G: [246, 196, 69, 255], g: [184, 134, 32, 255],
  W: [255, 244, 214, 255], R: [200, 40, 48, 255], U: [62, 108, 196, 255],
};

function banner(base, dark, glyph) {
  return (x, y) => {
    // Border + vignette
    const edge = x < 4 || y < 4 || x >= SIZE - 4 || y >= SIZE - 4;
    if (edge) return PAL.K;
    const inner = x < 8 || y < 8 || x >= SIZE - 8 || y >= SIZE - 8;
    if (inner) return PAL.G;
    // Glyph (scaled 6×, centred 16px)
    const gx = Math.floor((x - 16) / 6), gy = Math.floor((y - 16) / 6);
    if (gx >= 0 && gx < 16 && gy >= 0 && gy < 16) {
      const ch = glyph[gy][gx];
      if (ch !== ".") return PAL[ch];
    }
    // Subtle diagonal weave
    return ((x + y) >> 3) & 1 ? base : dark;
  };
}

const bp = png(banner([160, 30, 40, 255], [140, 24, 32, 255], CROWN));
const rp = png(banner([50, 90, 170, 255], [40, 72, 140, 255], SEAL));
writeFileSync(join(ROOT, "packs", "BP_Kingdom", "pack_icon.png"), bp);
writeFileSync(join(ROOT, "packs", "RP_Kingdom", "pack_icon.png"), rp);
console.log(`painted BP pack_icon.png (${bp.length} B) and RP pack_icon.png (${rp.length} B)`);
