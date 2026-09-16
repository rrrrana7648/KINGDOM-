#!/usr/bin/env node
/**
 * validate.mjs — pre-flight for the .mcaddon (zero dependencies).
 *
 *   node tools/validate.mjs
 *
 * Checks the things Minecraft only tells you about in the content log on a
 * phone: manifest shape/UUIDs/versions, BP↔RP dependency, module versions,
 * every script parses as an ES module, every relative import resolves to a
 * real export, item JSON ↔ texture atlas ↔ lang keys agree, PNGs are real
 * PNGs, and no 1.x server-ui positional-argument calls remain.
 * Exits non-zero on any failure.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BP = join(ROOT, "packs", "BP_Kingdom");
const RP = join(ROOT, "packs", "RP_Kingdom");
const SERVER_VERSION = "2.1.0";
const SERVER_UI_VERSION = "2.0.0";
const MIN_ENGINE = [1, 21, 100];

let failures = 0;
const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m) => { console.log(`  ❌ ${m}`); failures++; };
const check = (c, m) => (c ? ok(m) : bad(m));
const json = (p) => JSON.parse(readFileSync(p, "utf8"));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const walk = (d, out = []) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};

console.log("\n📦 Manifests");
const bp = json(join(BP, "manifest.json"));
const rp = json(join(RP, "manifest.json"));
for (const [name, m] of [["BP", bp], ["RP", rp]]) {
  check(m.format_version === 2, `${name}: format_version 2`);
  check(UUID.test(m.header.uuid), `${name}: header uuid is a v4 UUID`);
  check(m.modules.every((x) => UUID.test(x.uuid)), `${name}: module uuids are v4 UUIDs`);
  check(m.header.uuid !== m.modules[0].uuid, `${name}: header and module uuids differ`);
  check(JSON.stringify(m.header.min_engine_version) === JSON.stringify(MIN_ENGINE), `${name}: min_engine_version ${MIN_ENGINE.join(".")}`);
  check(m.modules.every((x) => JSON.stringify(x.version) === JSON.stringify(m.header.version)), `${name}: module versions match header ${m.header.version.join(".")}`);
  check(existsSync(join(name === "BP" ? BP : RP, "pack_icon.png")), `${name}: pack_icon.png present`);
}
check(bp.header.uuid !== rp.header.uuid, "BP and RP uuids differ");
check(JSON.stringify(bp.header.version) === JSON.stringify(rp.header.version), "BP and RP share a version");
const uuids = [bp.header.uuid, bp.modules[0].uuid, rp.header.uuid, rp.modules[0].uuid];
check(new Set(uuids).size === uuids.length, "all four uuids unique");
const deps = Object.fromEntries(bp.dependencies.filter((d) => d.module_name).map((d) => [d.module_name, d.version]));
check(deps["@minecraft/server"] === SERVER_VERSION, `BP depends on @minecraft/server ${SERVER_VERSION}`);
check(deps["@minecraft/server-ui"] === SERVER_UI_VERSION, `BP depends on @minecraft/server-ui ${SERVER_UI_VERSION}`);
const rpDep = bp.dependencies.find((d) => d.uuid);
check(rpDep?.uuid === rp.header.uuid && JSON.stringify(rpDep.version) === JSON.stringify(rp.header.version), "BP depends on this RP (uuid + version)");
const script = bp.modules.find((m) => m.type === "script");
check(script?.language === "javascript" && existsSync(join(BP, script.entry)), `script module entry exists (${script?.entry})`);

console.log("\n🈯 Texts");
for (const [name, dir] of [["BP", BP], ["RP", RP]]) {
  const langs = existsSync(join(dir, "texts", "languages.json")) ? json(join(dir, "texts", "languages.json")) : null;
  check(Array.isArray(langs) && langs.includes("en_US") && existsSync(join(dir, "texts", "en_US.lang")), `${name}: texts/languages.json lists en_US and en_US.lang exists`);
}
const lang = Object.fromEntries(
  readFileSync(join(RP, "texts", "en_US.lang"), "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#")).map((l) => l.split("=", 2))
);

console.log("\n🗡 Items ↔ textures ↔ names");
const atlas = json(join(RP, "textures", "item_texture.json"));
check(atlas.resource_pack_name && atlas.texture_name === "atlas.items", "item_texture.json targets atlas.items");
const itemFiles = walk(join(BP, "items")).filter((p) => p.endsWith(".json"));
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
for (const f of itemFiles) {
  const it = json(f)["minecraft:item"];
  const id = it?.description?.identifier;
  const fv = json(f).format_version;
  check(/^kingdom:[a-z_]+$/.test(id ?? ""), `${relative(ROOT, f)}: identifier ${id}`);
  check(typeof fv === "string" && cmpVer(fv, "1.21.60") >= 0, `${id}: format_version ${fv} ≥ 1.21.60`);
  const group = it.description?.menu_category?.group;
  check(!group || group.includes(":"), `${id}: menu_category.group is namespaced (${group})`);
  const icon = it.components?.["minecraft:icon"];
  const iconKey = typeof icon === "string" ? icon : icon?.textures?.default;
  const tex = atlas.texture_data?.[iconKey]?.textures;
  check(tex && existsSync(join(RP, `${tex}.png`)), `${id}: icon '${iconKey}' → ${tex}.png exists`);
  if (tex && existsSync(join(RP, `${tex}.png`))) {
    const head = readFileSync(join(RP, `${tex}.png`)).subarray(0, 8);
    check(head.equals(PNG), `${id}: texture is a real PNG`);
  }
  const nameKey = it.components?.["minecraft:display_name"]?.value;
  check(nameKey && lang[nameKey], `${id}: display name '${nameKey}' translated`);
}

console.log("\n📜 Scripts");
const scripts = walk(join(BP, "scripts")).filter((p) => p.endsWith(".js"));
const exportsOf = new Map();
for (const f of scripts) {
  const r = spawnSync(process.execPath, ["--input-type=module", "--check"], { input: readFileSync(f, "utf8"), encoding: "utf8" });
  if (r.status !== 0) bad(`${relative(ROOT, f)}: syntax — ${r.stderr.split("\n").slice(0, 3).join(" ")}`);
  const src = readFileSync(f, "utf8");
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) { const n = part.trim().split(/\s+as\s+/).pop(); if (n) names.add(n); }
  }
  exportsOf.set(normalize(f), names);
}
ok(`${scripts.length} scripts parse as ES modules`);
let importProblems = 0;
const engineImports = new Set();
for (const f of scripts) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/import\s*(?:\{([^}]*)\})?[^"']*from\s*["']([^"']+)["']/g)) {
    const spec = m[2];
    if (spec.startsWith("@minecraft/")) {
      if (spec !== "@minecraft/server" && spec !== "@minecraft/server-ui") { bad(`${relative(ROOT, f)}: undeclared engine module ${spec}`); importProblems++; }
      for (const n of (m[1] ?? "").split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) engineImports.add(`${spec}:${n}`);
      continue;
    }
    if (!spec.startsWith(".") || !spec.endsWith(".js")) { bad(`${relative(ROOT, f)}: import '${spec}' must be a relative path ending in .js (Bedrock has no resolver)`); importProblems++; continue; }
    const target = normalize(join(dirname(f), spec));
    if (!exportsOf.has(target)) { bad(`${relative(ROOT, f)}: import '${spec}' not found`); importProblems++; continue; }
    for (const n of (m[1] ?? "").split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
      if (!exportsOf.get(target).has(n)) { bad(`${relative(ROOT, f)}: '${n}' is not exported by ${spec}`); importProblems++; }
    }
  }
}
check(importProblems === 0, "every relative import resolves to a real export");

// Stable-surface allow-list (from the 2.1.0 / 2.0.0 typings).
const STABLE = new Set([
  "@minecraft/server:world", "@minecraft/server:system", "@minecraft/server:Player", "@minecraft/server:ItemStack",
  "@minecraft/server:BlockPermutation", "@minecraft/server:DisplaySlotId", "@minecraft/server:ObjectiveSortOrder",
  "@minecraft/server:CommandPermissionLevel", "@minecraft/server:CustomCommandStatus", "@minecraft/server:CustomCommandParamType",
  "@minecraft/server:CustomCommandSource", "@minecraft/server:EntityComponentTypes", "@minecraft/server:EquipmentSlot",
  "@minecraft/server:GameMode", "@minecraft/server:TicksPerDay", "@minecraft/server:Entity", "@minecraft/server:Dimension",
  "@minecraft/server-ui:ActionFormData", "@minecraft/server-ui:ModalFormData", "@minecraft/server-ui:MessageFormData",
  "@minecraft/server-ui:FormCancelationReason", "@minecraft/server-ui:uiManager",
]);
const unknown = [...engineImports].filter((k) => !STABLE.has(k));
check(unknown.length === 0, unknown.length ? `engine imports outside the stable allow-list: ${unknown.join(", ")}` : `engine imports are all stable 2.x symbols (${engineImports.size})`);

// 1.x server-ui positional calls would throw on 2.0.0 — reject them statically.
let legacyUi = 0;
for (const f of scripts) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/\.(slider|dropdown|textField|toggle)\(/g)) {
    const args = splitArgs(src, m.index + m[0].length);
    const keep = { slider: 3, dropdown: 2, textField: 2, toggle: 1 }[m[1]];
    const extra = args.slice(keep).map((a) => a.trim()).filter(Boolean);
    if (extra.length > 1 || (extra.length === 1 && !extra[0].startsWith("{"))) {
      bad(`${relative(ROOT, f)}: ${m[1]}(…) uses 1.x positional arguments`); legacyUi++;
    }
  }
  if (/beforeEvents\.chatSend\.subscribe/.test(src)) { bad(`${relative(ROOT, f)}: unguarded chatSend (beta-only) subscription`); legacyUi++; }
  if (/\.isValid\(\)/.test(src)) { bad(`${relative(ROOT, f)}: isValid() is a property in 2.x`); legacyUi++; }
  if (/runCommandAsync\(/.test(src)) { bad(`${relative(ROOT, f)}: runCommandAsync was removed in 2.0`); legacyUi++; }
}
check(legacyUi === 0, "no 1.x-only API shapes remain (server-ui options objects, isValid property, no chatSend/runCommandAsync)");

console.log("\n🧹 Hygiene");
const junk = walk(join(ROOT, "packs")).filter((p) => /(\.DS_Store|Thumbs\.db|\.log$|~$)/.test(p));
check(junk.length === 0, junk.length ? `junk files: ${junk.map((p) => relative(ROOT, p)).join(", ")}` : "no junk files in packs/");
const big = walk(join(ROOT, "packs")).filter((p) => statSync(p).size > 512 * 1024);
check(big.length === 0, big.length ? `oversized files: ${big.join(", ")}` : "no file over 512 KB (phone-friendly)");

console.log(failures ? `\n❌ ${failures} validation failure(s)` : "\n🎉 VALIDATION PASSED");
process.exit(failures ? 1 : 0);

function cmpVer(a, b) {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0); }
  return 0;
}
function splitArgs(src, start) {
  const args = []; let depth = 0, cur = start, quote = null;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (quote) { if (ch === "\\") { i++; continue; } if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) { if (depth === 0) { args.push(src.slice(cur, i)); return args; } depth--; }
    else if (ch === "," && depth === 0) { args.push(src.slice(cur, i)); cur = i + 1; }
  }
  return args;
}
