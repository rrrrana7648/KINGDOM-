/**
 * jobs.js — the first labor loops (design M2):
 *   woodcutter → fell logs near the forest site, replant saplings
 *   farmer     → harvest mature crops near the farm site, replant
 *   builder/laborer → quarry stone & ore near the quarry site (M6 does real builds)
 *
 * Workers collect into a per-trip carry, then deliver to a registered stockpile
 * chest (real items) or the town anchor (virtual stockpile ledger).
 */
import { BlockPermutation } from "@minecraft/server";
import { walkToward, distanceXZ } from "./movement.js";
import { getEntity, refreshNameTag } from "./npcRegistry.js";
import { SKILL_MULT } from "../core/economist.js";
import { sellLoad, buyerForCommodity } from "../economy/buyers.js";
import { categoryOf } from "../economy/pricebook.js";
import { techHaste } from "../tech/tree.js";
import { farmYield, stormBound } from "../events/seasons.js";

const ZONE_FOR_JOB = {
  woodcutter: "forest",
  forester: "forest",
  farmer: "farm",
  picker: "farm",
  builder: "quarry",
  laborer: "quarry",
  hauler: "quarry",
};

const LOGS = new Set([
  "minecraft:oak_log", "minecraft:birch_log", "minecraft:spruce_log",
  "minecraft:jungle_log", "minecraft:acacia_log", "minecraft:dark_oak_log",
  "minecraft:cherry_log", "minecraft:mangrove_log", "minecraft:mangrove_roots",
]);
const SAPLING_FOR = {
  "minecraft:oak_log": "minecraft:oak_sapling",
  "minecraft:birch_log": "minecraft:birch_sapling",
  "minecraft:spruce_log": "minecraft:spruce_sapling",
  "minecraft:jungle_log": "minecraft:jungle_sapling",
  "minecraft:acacia_log": "minecraft:acacia_sapling",
  "minecraft:dark_oak_log": "minecraft:dark_oak_sapling",
  "minecraft:cherry_log": "minecraft:cherry_sapling",
};
const CROPS = {
  "minecraft:wheat": { mature: 7, drops: [["minecraft:wheat", 1], ["minecraft:wheat_seeds", 1]], food: 1 },
  "minecraft:carrots": { mature: 7, drops: [["minecraft:carrot", 2]], food: 2 },
  "minecraft:potatoes": { mature: 7, drops: [["minecraft:potato", 2]], food: 2 },
  "minecraft:beetroots": { mature: 3, drops: [["minecraft:beetroot", 1], ["minecraft:beetroot_seeds", 1]], food: 1 },
};
const STONE = new Set([
  "minecraft:stone", "minecraft:cobblestone", "minecraft:granite",
  "minecraft:diorite", "minecraft:andesite", "minecraft:deepslate",
  "minecraft:cobbled_deepslate", "minecraft:tuff",
]);
const ORE_DROP = {
  "minecraft:coal_ore": ["minecraft:coal", 1],
  "minecraft:deepslate_coal_ore": ["minecraft:coal", 1],
  "minecraft:iron_ore": ["minecraft:raw_iron", 1],
  "minecraft:deepslate_iron_ore": ["minecraft:raw_iron", 1],
  "minecraft:copper_ore": ["minecraft:raw_copper", 2],
  "minecraft:deepslate_copper_ore": ["minecraft:raw_copper", 2],
  "minecraft:gold_ore": ["minecraft:raw_gold", 1],
  "minecraft:deepslate_gold_ore": ["minecraft:raw_gold", 1],
  "minecraft:redstone_ore": ["minecraft:redstone", 3],
  "minecraft:deepslate_redstone_ore": ["minecraft:redstone", 3],
  "minecraft:lapis_lazuli_ore": ["minecraft:lapis_lazuli", 4],
  "minecraft:deepslate_lapis_lazuli_ore": ["minecraft:lapis_lazuli", 4],
  "minecraft:emerald_ore": ["minecraft:emerald", 1],
  "minecraft:diamond_ore": ["minecraft:diamond", 1],
  "minecraft:deepslate_diamond_ore": ["minecraft:diamond", 1],
};
const XP_WEIGHT = {
  "minecraft:coal": 5, "minecraft:raw_iron": 8, "minecraft:raw_copper": 7,
  "minecraft:raw_gold": 20, "minecraft:redstone": 6, "minecraft:lapis_lazuli": 6,
  "minecraft:emerald": 40, "minecraft:diamond": 100,
};
const LEVEL_XP = [0, 100, 300, 700, 1500]; // cumulative to L2..L5

// Per-session worker memory: not saved.
const runtime = new Map();
function rt(id) {
  if (!runtime.has(id)) {
    runtime.set(id, { scanAt: 0, target: null, workCalls: 0, carry: {}, scans: 0 });
  }
  return runtime.get(id);
}
export function resetRuntime(id) {
  runtime.delete(id);
}

export function loadForLevel(record) {
  return 12 + (record.level || 1) * 4; // L1 16 → L5 32 items per trip
}

/** One 5-tick work tick for a living, adult, non-minister citizen. */
export function performWork(record, state, tick) {
  const dim = record._dim;
  const entity = getEntity(record, dim);
  if (!entity) return { ok: false, reason: "unloaded" };
  record._entity = entity;

  // M9–M10 service professions keep no work site: guards patrol the town
  // anchor, doctors/teachers/inspectors serve indoors (abstract shifts).
  if (record.profession === "guard" || record.profession === "soldier") {
    return patrolDuty(record, state, tick, entity);
  }
  if (["doctor", "teacher", "inspector"].includes(record.profession)) {
    record.day.workedTicks += 5;
    return { ok: true, status: "on-duty" };
  }

  // ⛈️ Storms shelter every outdoor crew (the watch excepted, above).
  if (stormBound(state)) return { ok: true, status: "sheltered" };

  const zoneKey = ZONE_FOR_JOB[record.profession];
  const zone = zoneKey ? state.zones[zoneKey] : null;
  if (!zone) return { ok: false, reason: "nozone" };

  const mem = rt(record.id);
  const carryTotal = Object.values(mem.carry).reduce((a, b) => a + b, 0);
  if (carryTotal >= loadForLevel(record)) {
    return deliver(record, state, mem);
  }

  if (!mem.target) {
    if (tick < mem.scanAt) return { ok: false, reason: "thinking" };
    mem.scanAt = tick + 40; // rescan ~ every 10s
    mem.skipCols ??= new Set();
    mem.target = findTarget(record.profession, zone, dim, entity.location, mem.skipCols);
    if (!mem.target) return { ok: false, reason: "empty" };
    mem.workCalls = 0;
  }

  // Stand next to the target block.
  if (mem.day !== state.day) {
    mem.skipCols?.clear(); // unreachable columns get retried after the Day Roll
    mem.day = state.day;
  }
  const stand = standSpot(mem.target, dim, entity.location);
  if (!stand) {
    // Out of reach forever (e.g. a floating top log) — skip this column
    // today so the worker moves on to the other trees/blocks.
    mem.skipCols ??= new Set();
    mem.skipCols.add(`${mem.target.x},${mem.target.z}`);
    mem.target = null;
    mem.scanAt = tick + 40;
    return { ok: false, reason: "blocked" };
  }
  const walk = walkToward(entity, stand, { arrive: 1.4, speed: 0.85 });
  if (walk !== "arrived") return { ok: true, status: "walking" };

  // Face & work the block.
  const t = mem.target;
  const block = safeBlock(dim, t.x, t.y, t.z);
  if (!block || block.typeId !== t.type) {
    mem.target = null; // someone else took it
    return { ok: false, reason: "gone" };
  }
  face(entity, t);
  mem.workCalls++;
  const speed = (SKILL_MULT[record.level] ?? 1) * buildingHaste(record, state) * techHaste(state, record.profession);
  const requiredCalls = Math.max(1, Math.round((t.calls ?? 4) / speed));

  if (mem.workCalls % 2 === 0) {
    workEffects(dim, t, record.profession);
  }
  if (mem.workCalls < requiredCalls) return { ok: true, status: "working" };

  // Complete the job (fields answer the sky — see farmYield).
  const products = harvest(block, t, dim, state);
  for (const [item, qty] of products) {
    mem.carry[item] = (mem.carry[item] ?? 0) + qty;
  }
  record.day.workedTicks += requiredCalls * 5;
  mem.target = null;
  mem.workCalls = 0;

  const total = Object.values(mem.carry).reduce((a, b) => a + b, 0);
  if (total >= loadForLevel(record)) return deliver(record, state, mem);
  return { ok: true, status: "harvested" };
}

/** End-of-shift / forced delivery (sells at the matching licensed buyer). */
export function deliver(record, state, memArg) {
  const dim = record._dim;
  const entity = record._entity ?? getEntity(record, dim);
  if (!entity) return { ok: false, reason: "unloaded" };
  const mem = memArg ?? rt(record.id);
  if (Object.keys(mem.carry).length === 0) return { ok: true, status: "delivered" };

  // Route: the licensed stall for this commodity, else the Crown warehouse,
  // else the town anchor for virtual delivery.
  const firstItem = Object.keys(mem.carry)[0];
  const cat = categoryOf(firstItem);
  const stall = cat ? buyerForCommodity(state, cat) : undefined;
  const dest = stall?.chest ?? state.zones.stockpileChest ?? state.zones.home ?? state.zones.town;
  if (!dest) return { ok: false, reason: "noanchor" };

  if (distanceXZ(entity.location, dest) > 2.2) {
    walkToward(entity, dest, { arrive: 2.0, speed: 0.9 });
    return { ok: true, status: "delivering" };
  }

  const result = sellLoad(record, state, dim, mem.carry);
  let xp = 0;
  for (const [item, qty] of Object.entries(result.accepted)) {
    state.dayProduction[item] = (state.dayProduction[item] ?? 0) + qty;
    record.day.delivered += qty;
    xp += (XP_WEIGHT[item] ?? (item.includes("log") ? 3 : 2)) * qty;
  }
  // Rejected goods (quota/float full) stay in the carry for tomorrow's trip.
  mem.carry = { ...result.rejected };
  grantXp(record, entity, xp);
  return { ok: true, status: "delivered", result };
}

/* -------------------------------------------------------------- */

/**
 * M9 patrol duty: guards walk a lantern circuit of the town anchor by day
 * and stand the night watch after curfew; the honest rhythm of boots keeps
 * constable power real. Slow drill XP accrues on the rounds.
 */
function patrolDuty(record, state, tick, entity) {
  const a = state.zones.home ?? state.zones.town;
  if (!a) return { ok: false, reason: "nozone" };
  const mem = rt(record.id);
  const lanterns = [
    { x: a.x + 6, y: a.y, z: a.z },
    { x: a.x, y: a.y, z: a.z + 6 },
    { x: a.x - 6, y: a.y, z: a.z },
    { x: a.x, y: a.y, z: a.z - 6 },
  ];
  mem.lantern = mem.lantern ?? 0;
  const post = lanterns[mem.lantern % lanterns.length];
  const walk = walkToward(entity, post, { arrive: 1.6, speed: 0.7 });
  if (walk === "arrived") mem.lantern++;
  record.day.workedTicks += 5;
  mem.workCalls = (mem.workCalls ?? 0) + 1;
  if (mem.workCalls % 40 === 0) grantXp(record, entity, 4); // drill compounds
  return { ok: true, status: "patrolling" };
}

function grantXp(record, entity, amount) {
  if (amount <= 0) return;
  record.xp += amount;
  let level = 1;
  for (let i = 0; i < LEVEL_XP.length; i++) if (record.xp >= LEVEL_XP[i]) level = i + 1;
  if (level > record.level) {
    record.level = level;
    // Wage rises with skill automatically.
    record.wage = suggestedFor(record);
    refreshNameTag(record, entity);
    try {
      entity.dimension.spawnParticle("minecraft:villager_happy", entity.location);
    } catch { /* particle id safe-guarded */ }
    for (const p of entity.dimension.getPlayers({ location: entity.location, maxDistance: 40 })) {
      p.onScreenDisplay.setActionBar(`§a⭐ ${record.fullName} reached level ${level}!`);
      p.playSound("random.levelup", { location: entity.location });
    }
  }
}

/** M6 halls of industry: farmsteads & lumber camps speed crews +10%/level. */
function buildingHaste(record, state) {
  const hall = record.profession === "farmer" || record.profession === "picker" ? "farm"
    : record.profession === "woodcutter" || record.profession === "forester" ? "lumberCamp"
    : null;
  if (!hall) return 1;
  const raised = (state.buildings ?? []).find((b) => b.buildingId === hall);
  return 1 + 0.1 * (raised?.level ?? 0);
}

function suggestedFor(record) {
  // Lazy import avoided; mirror the simple formula for M2 jobs.
  const base = { woodcutter: 6, forester: 6, farmer: 6, picker: 6, builder: 9, laborer: 5, hauler: 5, guard: 12, soldier: 12, inspector: 18, doctor: 10, teacher: 7 }[record.profession] ?? 6;
  return Math.round(base * (SKILL_MULT[record.level] ?? 1) * 100) / 100;
}

function findTarget(profession, zone, dim, from, skipCols) {
  if (profession === "woodcutter" || profession === "forester") return findLog(zone, dim, from, skipCols);
  if (profession === "farmer" || profession === "picker") return findCrop(zone, dim, from, skipCols);
  return findStone(zone, dim, from, skipCols);
}

function findLog(zone, dim, _from, skipCols) {
  const r = zone.r ?? 10;
  const cx = Math.round(zone.x); // anchors store block-centred .5 coords
  const cz = Math.round(zone.z);
  const baseY = Math.floor(zone.y);
  let best = null;
  let bestD = Infinity;
  for (let ox = -r; ox <= r; ox++) {
    for (let oz = -r; oz <= r; oz++) {
      const x = cx + ox;
      const z = cz + oz;
      if (skipCols?.has(`${x},${z}`)) continue;
      for (let oy = 0; oy <= 9; oy++) {
        const y = baseY + oy;
        const b = safeBlock(dim, x, y, z);
        if (b && LOGS.has(b.typeId)) {
          // Walk to the LOWEST log in this trunk so the worker fells the base
          // (which is reachable from the ground and lets us replant).
          let baseY = y;
          while (true) {
            const below = safeBlock(dim, x, baseY - 1, z);
            if (below && LOGS.has(below.typeId)) baseY--;
            else break;
          }
          const base = safeBlock(dim, x, baseY, z);
          const d = ox * ox + oz * oz + (baseY - zone.y);
          if (d < bestD && base) {
            bestD = d;
            best = { x, y: baseY, z, type: base.typeId, calls: 4 };
          }
          break; // column handled; move to next column
        }
      }
    }
  }
  return best;
}

function findCrop(zone, dim, _from, skipCols) {
  const r = zone.r ?? 6;
  for (let oy = -2; oy <= 2; oy++) {
    for (let ox = -r; ox <= r; ox++) {
      for (let oz = -r; oz <= r; oz++) {
        if (skipCols?.has(`${Math.floor(zone.x + ox)},${Math.floor(zone.z + oz)}`)) continue;
        const b = safeBlock(dim, zone.x + ox, zone.y + oy, zone.z + oz);
        if (b && CROPS[b.typeId] && Number(b.permutation.getState("growth")) === CROPS[b.typeId].mature) {
          return { x: b.location.x, y: b.location.y, z: b.location.z, type: b.typeId, calls: 2 };
        }
      }
    }
  }
  return null;
}

function findStone(zone, dim, _from, skipCols) {
  const r = zone.r ?? 6;
  for (let oy = -5; oy <= 2; oy++) {
    for (let ox = -r; ox <= r; ox++) {
      for (let oz = -r; oz <= r; oz++) {
        const bx = Math.floor(zone.x + ox), bz = Math.floor(zone.z + oz);
        if (skipCols?.has(`${bx},${bz}`)) continue;
        const b = safeBlock(dim, bx, zone.y + oy, bz);
        if (b && (STONE.has(b.typeId) || ORE_DROP[b.typeId]) && isExposed(dim, b.location)) {
          return { x: b.location.x, y: b.location.y, z: b.location.z, type: b.typeId, calls: 5 };
        }
      }
    }
  }
  return null;
}

/** A quarry block must touch air so a villager can actually stand beside it. */
function isExposed(dim, p) {
  const neighbors = [
    { x: p.x + 1, y: p.y, z: p.z }, { x: p.x - 1, y: p.y, z: p.z },
    { x: p.x, y: p.y, z: p.z + 1 }, { x: p.x, y: p.y, z: p.z - 1 },
    { x: p.x, y: p.y + 1, z: p.z },
  ];
  for (const n of neighbors) {
    const b = safeBlock(dim, n.x, n.y, n.z);
    if (b && b.isAir) return true;
  }
  return false;
}

/** Nearest clear standing position adjacent to (or at the base of) a block. */
function standSpot(target, dim, from) {
  const candidates = [
    { x: target.x + 1, y: target.y, z: target.z },
    { x: target.x - 1, y: target.y, z: target.z },
    { x: target.x, y: target.y, z: target.z + 1 },
    { x: target.x, y: target.y, z: target.z - 1 },
  ];
  let best = null;
  let bestD = Infinity;
  for (const c of candidates) {
    // Try ground level first, then up to 2 blocks lower (block reach), then 1 up.
    for (const dy of [0, -1, -2, 1]) {
      const p = { x: c.x, y: c.y + dy, z: c.z };
      if (Math.abs(target.y - p.y) > 2) continue; // out of arm's reach
      const feet = safeBlock(dim, p.x, p.y, p.z);
      const head = safeBlock(dim, p.x, p.y + 1, p.z);
      const below = safeBlock(dim, p.x, p.y - 1, p.z);
      if (feet && head && below && feet.isAir && head.isAir && !below.isAir && !below.isLiquid) {
        const d = (p.x - from.x) ** 2 + (p.z - from.z) ** 2 + dy * dy * 2;
        if (d < bestD) { bestD = d; best = p; }
      }
    }
  }
  return best;
}

function harvest(block, target, dim, state) {
  const type = block.typeId;
  const products = [];
  const field = CROPS[type] ? farmYield(state) : 1; // monsoon, drought, frost, canals

  if (LOGS.has(type)) {
    products.push([type, 1]);
    try { block.setType("minecraft:air"); } catch { return []; }
    // Replant saplings only at the trunk base (on soil).
    const sapling = SAPLING_FOR[type];
    if (sapling) {
      const below = safeBlock(dim, target.x, target.y - 1, target.z);
      if (below && /grass_block|dirt|podzol|coarse_dirt|farmland|mud/.test(below.typeId)) {
        const spot = safeBlock(dim, target.x, target.y, target.z);
        if (spot && spot.isAir) {
          try { spot.setType(sapling); } catch { /* unsuitable soil */ }
        }
      }
    }
  } else if (CROPS[type]) {
    for (const [item, qty] of CROPS[type].drops) {
      const scaled = Math.max(0, Math.round(qty * field));
      if (scaled > 0) products.push([item, scaled]);
    }
    try {
      block.setPermutation(BlockPermutation.resolve(type, { growth: 0 }));
    } catch {
      try { block.setType("minecraft:air"); } catch { /* */ }
    }
  } else if (ORE_DROP[type]) {
    products.push(ORE_DROP[type]);
    products.push(["minecraft:cobblestone", 1]);
    try { block.setType("minecraft:air"); } catch { return []; }
  } else if (STONE.has(type)) {
    const drop = type.includes("deepslate") || type === "minecraft:tuff"
      ? "minecraft:cobbled_deepslate"
      : "minecraft:cobblestone";
    products.push([drop, 1]);
    try { block.setType("minecraft:air"); } catch { return []; }
  }
  return products;
}

function workEffects(dim, target, profession) {
  try {
    const loc = { x: target.x + 0.5, y: target.y + 0.5, z: target.z + 0.5 };
    dim.spawnParticle("minecraft:basic_smoke_particle", loc);
    const sound = profession === "farmer" || profession === "picker"
      ? "dig.grass"
      : (ZONE_FOR_JOB[profession] === "forest" ? "hit.wood" : "hit.stone");
    dim.playSound(sound, loc, { pitch: 0.9 + Math.random() * 0.2, volume: 0.6 });
  } catch { /* effects never break work */ }
}

function face(entity, target) {
  const dx = target.x + 0.5 - entity.location.x;
  const dz = target.z + 0.5 - entity.location.z;
  const yaw = (-Math.atan2(dx, dz) * 180) / Math.PI;
  try { entity.teleport(entity.location, { dimension: entity.dimension, rotation: { x: 0, y: yaw }, keepVelocity: false }); } catch { /* */ }
}

function safeBlock(dim, x, y, z) {
  try {
    return dim.getBlock({ x, y, z });
  } catch {
    return undefined;
  }
}
