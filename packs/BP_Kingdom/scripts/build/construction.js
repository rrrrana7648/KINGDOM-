/**
 * construction.js — blueprint building & the Royal Scepter zone (M6, §5).
 *
 * The King issues a BUILD decree (or orders direct construction): the Foreman
 * marks a site, materials flow from the Crown Warehouse, and assigned
 * builders raise the structure day by day. Completion places a real,
 * air-only footprint in the world (platform, corner posts, brazier) and
 * registers the building's level effects.
 *
 * Modes:
 *   📐 Blueprint — catalogue buildings with fixed costs & effects.
 *   ✏️  Scepter zone — the King marks any plot; the crew clears & levels it
 *       into a decorated town square / custom site (flavor + mood).
 *   🏚️  Citizen self-build arrives with plot deeds (later milestone).
 */
import { LEDGER_CAP } from "../core/state.js";
import { buildingDef, levelCost } from "./catalog.js";
import { registerHouse } from "../social/housing.js";
import { walkToward, distanceXZ } from "../game/movement.js";
import { getEntity } from "../game/npcRegistry.js";

export function nextSiteId(state) {
  return `s-${state.nextSiteId++}`;
}

/**
 * Stakes a construction site for a catalogue building (or "plaza" custom).
 * @returns {{ok:boolean,site?:object,reason?:string}}
 */
export function startSite(state, buildingId, loc, opts = {}) {
  const level = opts.level ?? 1;
  const cost = buildingId === "plaza"
    ? { "minecraft:cobblestone": 32 }
    : levelCost(buildingId, level)?.cost;
  if (!cost) return { ok: false, reason: "Unknown building." };
  const def = buildingDef(buildingId);
  const labor = buildingId === "plaza" ? 2 : levelCost(buildingId, level).labor;
  const site = {
    id: nextSiteId(state),
    buildingId,
    name: opts.name ?? (def ? `${def.name} L${level}` : "Town Plaza"),
    level,
    loc: { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) },
    size: opts.size ?? 5,
    required: { ...cost },
    delivered: {},
    laborNeeded: labor,
    laborDone: 0,
    crew: [],
    status: "active", // active | paused | done
    decreeId: opts.decreeId ?? null,
    startedDay: state.day,
  };
  state.sites.push(site);
  return { ok: true, site };
}

/** Assigns builders/laborers to a site (max 6). @returns {string[]} names */
export function assignCrew(state, siteId, count = 2) {
  const site = (state.sites ?? []).find((s) => s.id === siteId && s.status === "active");
  if (!site) return [];
  const free = state.citizens.filter(
    (c) =>
      c.alive && c.ageStage === "adult" && c.mode === "living" &&
      (c.profession === "builder" || c.profession === "laborer") &&
      !c.assignedSite && c.role !== "minister"
  );
  const names = [];
  for (const c of free.slice(0, Math.max(0, Math.min(count, 6 - site.crew.length)))) {
    c.assignedSite = site.id;
    site.crew.push(c.id);
    names.push(c.fullName);
  }
  return names;
}

/** Releases a citizen (or whole crew) from site duty. */
export function releaseCrew(state, siteId = null) {
  for (const c of state.citizens) {
    if (siteId && c.assignedSite !== siteId) continue;
    c.assignedSite = null;
  }
  if (siteId) {
    const site = (state.sites ?? []).find((s) => s.id === siteId);
    if (site) site.crew = [];
  } else {
    for (const s of state.sites ?? []) s.crew = [];
  }
}

/**
 * Daily progress: draws materials from the warehouse ledger and applies one
 * builder-day per crew member present. Runs in the Day Roll.
 * @returns {{lines:string[],spent:number,completed:object[]}}
 */
export function tickConstruction(state, dim) {
  const out = { lines: [], spent: 0, completed: [] };
  for (const site of state.sites ?? []) {
    if (site.status !== "active") continue;
    const crew = site.crew
      .map((id) => state.citizens.find((c) => c.id === id && c.alive))
      .filter(Boolean);
    if (!crew.length) {
      out.lines.push(`§7🏗 ${site.name}: idle — no crew assigned.`);
      continue;
    }
    // Materials: pull the day's share from the Crown stockpile.
    let blocked = null;
    for (const [item, need] of Object.entries(site.required)) {
      const have = (site.delivered[item] ?? 0);
      const want = Math.max(0, need - have);
      if (want <= 0) continue;
      const share = Math.min(want, Math.ceil(need / site.laborNeeded));
      const stock = state.stockpile[item] ?? 0;
      const take = Math.min(share, stock);
      if (take > 0) {
        state.stockpile[item] = stock - take;
        site.delivered[item] = have + take;
      } else {
        blocked = item;
        break;
      }
    }
    if (blocked) {
      out.lines.push(
        `§7🏗 ${site.name}: waiting on ${short(blocked)} (${site.delivered[blocked] ?? 0}/${site.required[blocked]}).`
      );
      continue;
    }
    // Labor: each crew member contributes a builder-day (masters more).
    let days = 0;
    for (const c of crew) days += 1 + (c.level >= 4 ? 0.5 : 0);
    site.laborDone = Math.round((site.laborDone + days) * 10) / 10;

    // Crew wages for the shift come from the decree escrow, else treasury.
    const shiftCost = Math.round(crew.reduce((s, c) => s + c.wage * 0.25, 0) * 100) / 100;
    out.spent = Math.round((out.spent + shiftCost) * 100) / 100;
    spendShift(state, site, shiftCost);

    const materialsDone = Object.entries(site.required).every(
      ([item, need]) => (site.delivered[item] ?? 0) >= need
    );
    if (materialsDone && site.laborDone >= site.laborNeeded) {
      completeSite(state, dim, site);
      out.completed.push(site);
      out.lines.push(`§a🏗 ${site.name} complete! The crew celebrates.`);
    } else {
      const pct = Math.min(99, Math.round(
        ((site.laborDone / site.laborNeeded) * 0.5 +
          materialRatio(site) * 0.5) * 100
      ));
      out.lines.push(`§7🏗 ${site.name}: ${pct}% (day ${state.day - site.startedDay + 1}).`);
    }
  }
  state.dailyStats.construction = Math.round(((state.dailyStats.construction ?? 0) + out.spent) * 100) / 100;
  return out;
}

function materialRatio(site) {
  const entries = Object.entries(site.required);
  if (!entries.length) return 1;
  let r = 0;
  for (const [item, need] of entries) r += Math.min(1, (site.delivered[item] ?? 0) / need);
  return r / entries.length;
}

function spendShift(state, site, cost) {
  if (site.decreeId) {
    const d = (state.decrees ?? []).find((x) => x.id === site.decreeId);
    if (d && d.escrow >= cost) {
      d.escrow = Math.round((d.escrow - cost) * 100) / 100;
      return;
    }
  }
  state.treasury = Math.round((state.treasury - cost) * 100) / 100;
}

/**
 * Finishes a site: stamps the footprint, registers effects, frees the crew.
 * Exported so decrees/tests can fast-forward completion.
 */
export function completeSite(state, dim, site) {
  site.status = "done";
  try {
    if (dim) stampFootprint(dim, site);
  } catch (err) {
    console.warn(`[KINGDOM] footprint skipped: ${err}`);
  }
  if (site.buildingId === "plaza") {
    for (const c of state.citizens) {
      if (c.alive) c.mood = Math.min(100, (c.mood ?? 70) + 2);
    }
  } else if (site.buildingId === "house") {
    const def = levelCost("house", site.level);
    const house = registerHouse(state, {
      name: `${site.name}`,
      loc: { x: site.loc.x + 2, y: site.loc.y + 1, z: site.loc.z + 2 },
      beds: def?.beds ?? 2,
      level: site.level,
    });
    site.houseId = house.id;
  } else {
    const def = buildingDef(site.buildingId);
    const existing = (state.buildings ?? []).find((b) => b.buildingId === site.buildingId);
    if (existing) {
      existing.level = Math.max(existing.level, site.level);
      existing.loc = { ...site.loc };
    } else {
      state.buildings.push({
        buildingId: site.buildingId,
        name: def?.name ?? site.buildingId,
        level: site.level,
        loc: { ...site.loc },
        day: state.day,
      });
    }
    if (site.buildingId === "harbor" && state.harbor) {
      state.harbor.level = Math.max(state.harbor.level ?? 0, site.level);
      state.harbor.loc = { ...site.loc };
    }
    applyCompletionBoon(state, site.buildingId);
  }
  for (const id of site.crew) {
    const c = state.citizens.find((x) => x.id === id);
    if (c) {
      c.assignedSite = null;
      c.xp += 25; // builders learn by raising roofs
      c.mood = Math.min(100, (c.mood ?? 70) + 4);
    }
  }
  site.crew = [];
  state.ledger.push({ day: state.day, type: "build", what: site.name, level: site.level });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
}

function applyCompletionBoon(state, buildingId) {
  if (buildingId === "tavern" || buildingId === "monument") {
    const bump = buildingId === "tavern" ? 6 : 4;
    for (const c of state.citizens) {
      if (c.alive) c.mood = Math.min(100, (c.mood ?? 70) + bump);
    }
  }
  if (buildingId === "hospital") {
    for (const c of state.citizens) {
      if (c.alive) c.health = 20;
    }
  }
}

/**
 * Stamps a modest, air-only footprint: cobble platform, log corner posts,
 * a brazier glow. Never replaces solid blocks (no terrain grief).
 */
export function stampFootprint(dim, site) {
  const { x, y, z } = site.loc;
  const r = Math.floor(site.size / 2);
  const put = (bx, by, bz, type) => {
    try {
      const b = dim.getBlock({ x: bx, y: by, z: bz });
      if (b && b.isAir) b.setType(type);
    } catch { /* unloaded — skip */ }
  };
  for (let ox = -r; ox <= r; ox++) {
    for (let oz = -r; oz <= r; oz++) {
      put(x + ox, y, z + oz, "minecraft:cobblestone");
    }
  }
  const corners = [[-r, -r], [r, -r], [-r, r], [r, r]];
  for (const [ox, oz] of corners) {
    for (let h = 1; h <= 3; h++) put(x + ox, y + h, z + oz, "minecraft:oak_log");
  }
  put(x, y + 1, z, "minecraft:torch");
}

/**
 * Per-tick builder presence at the site during work hours: the crew walks to
 * the scaffold, faces the work and raises dust. Daily progress itself is
 * applied by tickConstruction (deterministic, once per dawn).
 */
export function performBuild(record, state, tick) {
  const dim = record._dim;
  const entity = record._entity ?? getEntity(record, dim);
  if (!entity || !dim) return { ok: false, reason: "unloaded" };
  const site = (state.sites ?? []).find((s) => s.id === record.assignedSite && s.status === "active");
  if (!site) {
    record.assignedSite = null;
    return { ok: false, reason: "nosite" };
  }
  const dest = { x: site.loc.x + 0.5, y: site.loc.y + 1, z: site.loc.z + 0.5 };
  if (distanceXZ(entity.location, dest) > 3) {
    walkToward(entity, dest, { arrive: 2.5, speed: 0.85 });
    return { ok: true, status: "walking" };
  }
  record.day.workedTicks += 5;
  if (tick % 20 === 0) {
    try {
      dim.spawnParticle("minecraft:basic_smoke_particle", entity.location);
      dim.playSound("hit.wood", entity.location, { pitch: 0.9, volume: 0.4 });
    } catch { /* effects never break work */ }
  }
  return { ok: true, status: "building" };
}

function short(id) {
  return id.replace("minecraft:", "").replaceAll("_", " ");
}
