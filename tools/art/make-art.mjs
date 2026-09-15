#!/usr/bin/env node
/**
 * make-art.mjs — the royal pixel-forge (M12).
 *
 * Paints the pack's item sprites as 16×16 PNGs with zero dependencies
 * (node:zlib + hand-rolled PNG chunks). Each sprite is a string map over a
 * shared palette; run `node tools/art/make-art.mjs` to repaint every seal.
 *
 * Usage: node tools/art/make-art.mjs [--check]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "packs", "RP_Kingdom", "textures", "items");

// Palette: . = transparent
const PAL = {
  K: [20, 16, 12, 255],      // outline near-black
  G: [246, 196, 69, 255],    // gold
  g: [184, 134, 32, 255],    // gold shade
  W: [255, 244, 214, 255],   // gold glint
  R: [200, 40, 48, 255],     // ruby red
  r: [140, 24, 32, 255],     // red shade
  B: [122, 74, 38, 255],     // wood brown
  b: [84, 50, 24, 255],      // wood shade
  P: [232, 216, 178, 255],   // parchment
  p: [188, 168, 128, 255],   // parchment shade
  U: [62, 108, 196, 255],    // royal blue
  u: [40, 72, 140, 255],     // blue shade
  S: [200, 206, 216, 255],   // silver
  s: [140, 148, 162, 255],   // silver shade
};

const SPRITES = {
  // TheRoyal Scepter: diagonal haft, golden crown-head, ruby heart.
  kingdom_scepter: [
    "................",
    ".....KKK........",
    "....KWWK....K...",
    "....KWGK...KB...",
    ".....KGK..KB....",
    "......GK.KB.....",
    ".....RGKKB......",
    "....KRGKBB......",
    "....KRGGBB......",
    "...KRGGBBb......",
    "..KRGGBBbb......",
    "..KGGBBbb.......",
    ".KGBBBbb........",
    ".KBbbb..........",
    "..K............",
    "................",
  ],
  // The gavel: oak head, brass bands, haft.
  kingdom_gavel: [
    "................",
    "..KKKKKK........",
    ".KBBBBBBK.......",
    ".KBggggBK.......",
    "KBBggggBBK......",
    "KBBWWWWBBK......",
    ".KBggggBK.BB....",
    ".KBBBBBBK.BbB...",
    "..KKKKKK...BbB..",
    "..........BbB..",
    "...........BbB.",
    "............BbB",
    ".............bb",
    "..............K",
    "................",
    "................",
  ],
  // Guard badge: gold shield, ruby boss, silver wings.
  kingdom_guard_badge: [
    "................",
    "...KKKKKKK......",
    "..KGGGGGGGK.....",
    ".KGGWWWGGGGK....",
    ".KGWRRRWGGK..S..",
    ".KGWRRRWGK..SS..",
    ".KGGRRRGGK..SS..",
    ".KGGRRRGGK..SS..",
    "..KGGGGGKK..SS..",
    "..KGGGGGK...SS..",
    "...KGGGKK...S...",
    "....KGGK........",
    ".....GK.........",
    ".....KK.........",
    "................",
    "................",
  ],
  // Royal seal: wax disc, gold ring, crown sigil.
  kingdom_royal_seal: [
    "................",
    ".....KKKK.......",
    "...KKRRRRKK.....",
    "..KRRRRRRRRK....",
    "..KRRGGGGRRK....",
    ".KR RGKGGKRK....".replace(" ", ""),
    ".KRRGGGGGRRK....",
    ".KRRGKGGKRRK....",
    ".KRRGGGGGRRK....",
    "..KRRGGG RRK....".replace(" ", ""),
    "..KRRRRRRRRK....",
    "...KKRRRRKK.....",
    ".....KKKK.......",
    "................",
    "................",
    "................",
  ],
  // Research scroll: parchment roll, blue ribbon, silver nib.
  kingdom_research_scroll: [
    "................",
    "...KKKKKKK......",
    "..KPPPPPPPK.....",
    "..KPppppppK..S..",
    "..KPpUUppPK..SS.",
    "..KPpUUppPK..sS.",
    "..KPpUUppPK...sS",
    "..KPpUUppPK...sS",
    "..KPpUUppPK....s",
    "..KPppppppK....s",
    "..KPPPPPPPK.....",
    "...KKKKKKK......",
    "................",
    "................",
    "................",
    "................",
  ],
};

function crc32(buf) {
  let table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function paintSprite(name, rows) {
  // Forgiving forge: strip stray spaces, pad/truncate every row to 16.
  rows = rows.map((r) => r.replace(/ /g, "").padEnd(16, ".").slice(0, 16));
  if (rows.length !== 16) {
    throw new Error(`${name}: sprites must be 16 rows tall (got ${rows.length})`);
  }
  const raw = Buffer.alloc(16 * (1 + 16 * 4));
  let o = 0;
  for (const row of rows) {
    raw[o++] = 0; // filter: none
    for (const ch of row) {
      const px = ch === "." ? [0, 0, 0, 0] : PAL[ch];
      if (!px) throw new Error(`${name}: unknown palette key '${ch}'`);
      raw[o++] = px[0]; raw[o++] = px[1]; raw[o++] = px[2]; raw[o++] = px[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(16, 0); ihdr.writeUInt32BE(16, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}

mkdirSync(OUT, { recursive: true });
for (const [name, rows] of Object.entries(SPRITES)) {
  const png = paintSprite(name, rows);
  writeFileSync(join(OUT, `${name}.png`), png);
  console.log(`painted ${name}.png (${png.length} bytes)`);
}
console.log("done — 5 royal sprites sealed.");
