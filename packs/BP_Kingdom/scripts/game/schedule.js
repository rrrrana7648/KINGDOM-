/**
 * schedule.js — the daily life state machine for citizens (design §30).
 *
 * 06:00 breakfast · 07:30 work 1 · 12:00 lunch · 13:00 work 2 ·
 * 17:30 deliveries · 18:00 family/leisure · 21:00 curfew/sleep.
 * Followers ("Stay with me") shadow the King; released citizens "live".
 * M6: builders posted to a site raise it instead of quarrying.
 * M7: babies stay home, toddlers follow mother, children school & play;
 *     adults court in the leisure hours.
 */
import { world } from "@minecraft/server";
import { colonyMinutes } from "../core/clock.js";
import { walkToward, distanceXZ } from "./movement.js";
import { getEntity, refreshNameTag } from "./npcRegistry.js";
import { performWork, deliver, resetRuntime } from "./jobs.js";
import { buyerForCitizen } from "../economy/buyers.js";
import { performBuild } from "../build/construction.js";
import { tickCourtship } from "../social/family.js";

const OVERWORLD = () => world.getDimension("overworld");
const leisureTargets = new Map();

const PHASE = {
  sleep: { icon: "§9💤" },
  breakfast: { icon: "§6🍞" },
  work: { icon: "§a⛏" },
  lunch: { icon: "§6🍞" },
  deliver: { icon: "§e📦" },
  leisure: { icon: "§d♪" },
  flee: { icon: "§c⚠" },
  follow: { icon: "§7👣" },
  build: { icon: "§e🏗" },
  school: { icon: "§b📚" },
};

export function hourNow() {
  return colonyMinutes(world.getTimeOfDay()) / 60;
}

/** Called every 5 ticks by main. */
export function tickCitizens(state, tick) {
  const dim = OVERWORLD();
  for (const record of state.citizens) {
    if (!record.alive) continue;
    const entity = getEntity(record, dim);
    if (!entity) continue;
    record._dim = dim;
    record._entity = entity;
    try {
      tickOne(record, entity, state, tick);
    } catch (err) {
      console.warn(`[KINGDOM] citizen ${record.id} tick skipped: ${err}`);
    }
  }
}

function tickOne(record, entity, state, tick) {
  const hour = hourNow();

  // The Minister lives quietly at the town anchor and sleeps at night.
  if (record.role === "minister") return ministerRoutine(record, entity, state, hour);

  // Followers stay with the King, but still eat scheduled meals.
  if (record.mode === "following") {
    const player = nearestPlayer(entity, 60);
    decayNeeds(record, 0.015);
    if (player) walkToward(entity, player.location, { arrive: 2.4, speed: 1.0 });
    maybeMeal(record, entity, state, hour);
    refreshNameTag(record, entity, PHASE.follow.icon);
    return;
  }

  // ----- Living mode -----
  const fleeTarget = monstersNear(record, entity, state, tick);
  if (fleeTarget) {
    walkToward(entity, anchor(state) ?? entity.location, { arrive: 2.2, speed: 1.25 });
    refreshNameTag(record, entity, PHASE.flee.icon);
    return;
  }

  // The chain gang & the fevered stay put: prisoners break stone in the
  // abstract (see tickPrison), the sick rest at home (see tickHealth).
  if (record.status === "prisoner") {
    decayNeeds(record, 0.02);
    const a = anchor(state);
    if (a) walkToward(entity, a, { arrive: 3.0, speed: 0.5 });
    refreshNameTag(record, entity, "§8⛓");
    return;
  }
  if ((record.sick ?? 0) > 0) {
    decayNeeds(record, 0.015);
    const home = homeAnchor(record, state);
    if (home && distanceXZ(entity.location, home) > 2.4) {
      walkToward(entity, home, { arrive: 2.0, speed: 0.6 });
    } else {
      record.needs.rest = Math.min(100, record.needs.rest + 0.3);
    }
    refreshNameTag(record, entity, "§e🤒");
    return;
  }

  // 🎪 Festival day: the whole town takes leisure — except the watch.
  if (state.festivalDay === state.day) {
    if (record.profession === "guard" || record.profession === "soldier") {
      phaseWork(record, entity, state, tick); // the watch never feasts
      return;
    }
    if (record.ageStage !== "adult") return tickChild(record, entity, state, hour, tick);
    return phaseLeisure(record, entity, state, tick);
  }

  // ✊ Strike days: the shifts stand idle — guards, clerks & doctors exempt.
  if ((state.strikeDays ?? 0) > 0 && record.ageStage === "adult" &&
      !["guard", "soldier", "buyer", "doctor"].includes(record.profession) &&
      hour >= 7.5 && hour < 17.5) {
    decayNeeds(record, 0.02);
    const a = anchor(state);
    if (a) walkToward(entity, a, { arrive: 3.5, speed: 0.5 });
    record.needs.leisure = Math.min(100, record.needs.leisure + 0.1);
    refreshNameTag(record, entity, "§6✊");
    return;
  }

  // Children live by the nursery clock, not the shift bell.
  if (record.ageStage !== "adult") return tickChild(record, entity, state, hour, tick);

  // Buyer clerks keep their stall counter rather than working sites.
  if (record.profession === "buyer") return tickClerk(record, entity, state, hour, tick);

  if (hour >= 6 && hour < 7.5) phaseMeal(record, entity, state, "breakfast", hour);
  else if (hour >= 7.5 && hour < 12) phaseWork(record, entity, state, tick);
  else if (hour >= 12 && hour < 13) phaseMeal(record, entity, state, "lunch", hour);
  else if (hour >= 13 && hour < 17.5) phaseWork(record, entity, state, tick);
  else if (hour >= 17.5 && hour < 18.5) phaseDeliver(record, entity, state);
  else if (hour >= 18.5 && hour < 21) phaseLeisure(record, entity, state, tick);
  else if (onNightWatch(record, state)) phaseWatch(record, entity, state, tick);
  else phaseSleep(record, entity, state);
}

/** Half the watch patrols each night, alternating by day. */
function onNightWatch(record, state) {
  if (record.profession !== "guard" && record.profession !== "soldier") return false;
  let hash = state.day;
  for (const ch of record.id) hash += ch.charCodeAt(0);
  return hash % 2 === 0;
}

/** 🌙 Night watch: patrol the anchor while the town sleeps. */
function phaseWatch(record, entity, state, tick) {
  decayNeeds(record, 0.02);
  performWork(record, state, tick); // patrolDuty under the hood
  record.needs.rest = Math.max(0, record.needs.rest - 0.05); // broken sleep
  refreshNameTag(record, entity, "§9🌙");
}

/* ---------------- childhood (M7) ---------------- */

function tickChild(record, entity, state, hour, tick) {
  decayNeeds(record, 0.02);
  const home = homeAnchor(record, state);

  // Three nursery meals at home.
  let meal = null;
  if (hour >= 6 && hour < 7.5) meal = "breakfast";
  else if (hour >= 12 && hour < 13) meal = "lunch";
  else if (hour >= 18.5 && hour < 19.5) meal = "dinner";
  if (meal && home && distanceXZ(entity.location, home) < 6) childMeal(record, state, meal);

  if (hour >= 21 || hour < 6) {
    if (home) {
      if (distanceXZ(entity.location, home) > 2.4) {
        walkToward(entity, home, { arrive: 2.0, speed: 0.8 });
      } else {
        record.day.slept = true;
        record.needs.rest = Math.min(100, record.needs.rest + 0.8);
      }
    }
    refreshNameTag(record, entity, PHASE.sleep.icon);
    return;
  }

  if (record.ageStage === "baby") {
    // Crib days: rest at home.
    if (home && distanceXZ(entity.location, home) > 2.5) {
      walkToward(entity, home, { arrive: 2.0, speed: 0.6 });
    }
    record.needs.rest = Math.min(100, record.needs.rest + 0.2);
    refreshNameTag(record, entity, "§f🍼");
    return;
  }

  if (record.ageStage === "toddler") {
    // First steps: shadow mother when she is near, else stay home.
    const mother = state.citizens.find((c) => c.id === record.motherId && c.alive);
    const mEntity = mother?._entity;
    if (mEntity && distanceXZ(entity.location, mEntity.location) < 40) {
      walkToward(entity, mEntity.location, { arrive: 2.0, speed: 0.7 });
    } else if (home && distanceXZ(entity.location, home) > 3) {
      walkToward(entity, home, { arrive: 2.4, speed: 0.7 });
    }
    record.needs.leisure = Math.min(100, record.needs.leisure + 0.2);
    refreshNameTag(record, entity, "§f🧸");
    return;
  }

  // Child: school mornings (when a schoolhouse stands), play afternoons.
  const schooled = (state.buildings ?? []).some((b) => b.buildingId === "school");
  if (schooled && hour >= 7.5 && hour < 12) {
    const a = anchor(state);
    if (a) {
      if (distanceXZ(entity.location, a) > 3) {
        walkToward(entity, a, { arrive: 2.4, speed: 0.7 });
      } else if (tick % 40 === 0) {
        record.xp += 1; // literacy compounds into adulthood
      }
    }
    refreshNameTag(record, entity, PHASE.school.icon);
    return;
  }
  // Play: wander near home like leisure.
  phaseLeisure(record, entity, state, tick);
}

function homeAnchor(record, state) {
  const house = (state.houses ?? []).find((h) => h.id === record.home);
  if (house) return { x: house.loc.x + 0.5, y: house.loc.y, z: house.loc.z + 0.5 };
  return anchor(state);
}

function childMeal(record, state, mealKey) {
  if (record.day[mealKey]) return;
  record.day[mealKey] = true;
  // 🍞 Rationing: thin gruel alternates — no granary draw, half comfort.
  record.day.thin = !record.day.thin;
  if (state.rationing && record.day.thin) {
    record.day.meals++;
    state.dailyStats.mealsEaten++;
    record.needs.food = Math.min(100, record.needs.food + 17);
    return;
  }
  if (state.foodStock >= 1) {
    state.foodStock--;
    record.day.meals++;
    state.dailyStats.mealsEaten++;
    record.needs.food = Math.min(100, record.needs.food + 34);
  } else {
    state.dailyStats.mealsMissed++;
    record.needs.food = Math.max(0, record.needs.food - 10);
  }
}

/* ---------------- phases ---------------- */

function phaseWork(record, entity, state, tick) {
  decayNeeds(record, 0.03);
  record.needs.food -= 0.02;
  // M6: posted builders raise the scaffold instead of quarrying.
  if (record.assignedSite) {
    const res = performBuild(record, state, tick);
    refreshNameTag(record, entity, res.status === "building" ? PHASE.build.icon : PHASE.work.icon);
    return;
  }
  const res = performWork(record, state, tick);
  if (res.status === "delivering") refreshNameTag(record, entity, PHASE.deliver.icon);
  else if (res.reason === "nozone") {
    // Nothing assigned yet — wait at the town anchor.
    const a = anchor(state);
    if (a) walkToward(entity, a, { arrive: 3.5, speed: 0.5 });
    refreshNameTag(record, entity, "§7");
  } else if (res.reason === "empty") {
    const a = anchorForJob(record, state) ?? anchor(state);
    if (a) walkToward(entity, a, { arrive: 4, speed: 0.4 });
    refreshNameTag(record, entity, PHASE.work.icon);
  } else {
    refreshNameTag(record, entity, PHASE.work.icon);
  }
}

function phaseMeal(record, entity, state, mealKey) {
  decayNeeds(record, 0.02);
  maybeMeal(record, entity, state, hourNow(), mealKey);
  const a = anchor(state);
  if (a && distanceXZ(entity.location, a) > 3.5) {
    walkToward(entity, a, { arrive: 3.0, speed: 0.9 });
  }
  refreshNameTag(record, entity, PHASE[mealKey].icon);
}

function phaseDeliver(record, entity, state) {
  const res = deliver(record, state);
  refreshNameTag(record, entity, res.status === "delivered" ? PHASE.deliver.icon : PHASE.deliver.icon);
  // Once back, walk home/town for dinner.
  if (res.status === "delivered") {
    const a = anchor(state);
    if (a && distanceXZ(entity.location, a) > 3) walkToward(entity, a, { arrive: 2.5, speed: 0.8 });
  }
}

function phaseLeisure(record, entity, state, tick) {
  decayNeeds(record, 0.02);
  // Family dinner at the anchor once workers get home (until 20:00).
  if (hourNow() < 20) maybeMeal(record, entity, state, hourNow(), "dinner");
  record.needs.leisure = Math.min(100, record.needs.leisure + 0.35);
  const a = anchor(state);
  if (!a) return;
  let dest = leisureTargets.get(record.id);
  if (!dest || distanceXZ(entity.location, dest) < 1.2 || tick % 240 === 0) {
    const ang = Math.random() * Math.PI * 2;
    const r = 2 + Math.random() * 5;
    dest = { x: a.x + Math.cos(ang) * r, y: a.y, z: a.z + Math.sin(ang) * r };
    leisureTargets.set(record.id, dest);
  }
  walkToward(entity, dest, { arrive: 1.0, speed: 0.5 });
  record.day.leisureTicks++;
  // M7: unpartnered adults court in the evening hours.
  if (record.ageStage === "adult") {
    try {
      tickCourtship(record, entity, state);
    } catch { /* romance never breaks the sim */ }
  }
  refreshNameTag(record, entity, PHASE.leisure.icon);
}

function phaseSleep(record, entity, state) {
  const home = state.zones.home ?? state.zones.town;
  if (home) {
    if (distanceXZ(entity.location, home) > 2.4) {
      walkToward(entity, home, { arrive: 2.0, speed: 0.9 });
    } else {
      record.day.slept = true;
      record.needs.rest = Math.min(100, record.needs.rest + 0.6);
    }
  }
  record.needs.food -= 0.005;
  refreshNameTag(record, entity, PHASE.sleep.icon);
}

function ministerRoutine(record, entity, state, hour) {
  const a = anchor(state) ?? entity.location;
  if (hour >= 21 || hour < 6) {
    const home = state.zones.home ?? a;
    walkToward(entity, home, { arrive: 2.4, speed: 0.7 });
    refreshNameTag(record, entity, PHASE.sleep.icon);
  } else {
    let dest = leisureTargets.get(record.id);
    if (!dest || distanceXZ(entity.location, dest) < 1.5) {
      const ang = Math.random() * Math.PI * 2;
      dest = { x: a.x + Math.cos(ang) * 3, y: a.y, z: a.z + Math.sin(ang) * 3 };
      leisureTargets.set(record.id, dest);
    }
    walkToward(entity, dest, { arrive: 1, speed: 0.4 });
    refreshNameTag(record, entity, "§6");
  }
}

/** Licensed buyer clerk: staff the stall counter, meals at town, sleep at home. */
function tickClerk(record, entity, state, hour, tick) {
  const buyer = buyerForCitizen(state, record.id);
  decayNeeds(record, 0.02);
  if (hour >= 6 && hour < 7.5) return phaseMeal(record, entity, state, "breakfast", hour);
  if (hour >= 12 && hour < 13) return phaseMeal(record, entity, state, "lunch", hour);
  if ((hour >= 7.5 && hour < 12) || (hour >= 13 && hour < 18)) {
    if (buyer) {
      const c = buyer.chest;
      // Alternate between two spots beside the stall chest.
      const east = tick % 240 < 120;
      const spot = east
        ? { x: c.x + 1.5, y: c.y, z: c.z + 0.5 }
        : { x: c.x - 0.5, y: c.y, z: c.z + 0.5 };
      walkToward(entity, spot, { arrive: 1.0, speed: 0.5 });
    }
    refreshNameTag(record, entity, "§b🛒");
    return;
  }
  if (hour >= 18 && hour < 21) return phaseLeisure(record, entity, state, tick);
  return phaseSleep(record, entity, state);
}

/* ---------------- meals & needs ---------------- */

function maybeMeal(record, entity, state, hour, explicitMeal) {
  let mealKey = explicitMeal;
  if (!mealKey) {
    if (hour >= 6 && hour < 7.5) mealKey = "breakfast";
    else if (hour >= 12 && hour < 13) mealKey = "lunch";
    else if (hour >= 18.5 && hour < 19.5) mealKey = "dinner";
  }
  if (!mealKey || record.day[mealKey]) return;
  // Followers eat rations wherever they are; living citizens eat at the anchor.
  if (record.mode === "living") {
    const a = anchor(state);
    if (a && distanceXZ(entity.location, a) > 4) return; // not at table yet
  }
  consumeMeal(record, state);
}

function consumeMeal(record, state) {
  const hour = hourNow();
  const mealKey =
    hour >= 6 && hour < 7.5 ? "breakfast" : hour >= 12 && hour < 13 ? "lunch" : "dinner";
  if (record.day[mealKey]) return;
  record.day[mealKey] = true;
  // 🍞 Rationing: thin gruel alternates — no granary draw, half comfort.
  record.day.thin = !record.day.thin;
  if (state.rationing && record.day.thin) {
    record.day.meals++;
    state.dailyStats.mealsEaten++;
    record.needs.food = Math.min(100, record.needs.food + 17);
    return;
  }
  if (state.foodStock >= 1) {
    state.foodStock--;
    record.day.meals++;
    state.dailyStats.mealsEaten++;
    record.needs.food = Math.min(100, record.needs.food + 34);
  } else {
    state.dailyStats.mealsMissed++;
    record.needs.food = Math.max(0, record.needs.food - 10);
  }
}

function decayNeeds(record, rate) {
  record.needs.rest = Math.max(0, record.needs.rest - rate);
  record.needs.leisure = Math.max(0, record.needs.leisure - rate * 0.7);
  record.needs.safety = Math.min(100, record.needs.safety + 0.02); // recovers over time
}

/* ---------------- danger ---------------- */

function monstersNear(record, entity, state, tick) {
  const mem = scareMemory(record.id);
  if (tick < mem.until) return true;
  if (tick % 90 !== 0) return false; // cheap check ~ every 7.5s
  let monsters = [];
  try {
    monsters = entity.dimension.getEntities({
      location: entity.location,
      maxDistance: 9,
      families: ["monster"],
    });
  } catch {
    return false;
  }
  if (monsters.length > 0) {
    mem.until = tick + 30;
    record.day.scared++;
    if (!record.armed) record.needs.safety = Math.max(0, record.needs.safety - 12);
    return true;
  }
  return false;
}
const scare = new Map();
function scareMemory(id) {
  if (!scare.has(id)) scare.set(id, { until: 0 });
  return scare.get(id);
}

/* ---------------- helpers ---------------- */

function anchor(state) {
  return state.zones.home ?? state.zones.town;
}
function anchorForJob(record, state) {
  const map = { woodcutter: "forest", forester: "forest", farmer: "farm", picker: "farm", builder: "quarry", laborer: "quarry", hauler: "quarry" };
  return state.zones[map[record.profession]] ?? null;
}
function nearestPlayer(entity, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const p of entity.dimension.getPlayers()) {
    const d = distanceXZ(entity.location, p.location);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

/** Broadcast orders (Kingdom Menu → Orders). Adults only; children stay home. */
export function setModeAll(state, mode, filter) {
  let n = 0;
  for (const c of state.citizens) {
    if (!c.alive || c.role === "minister" || c.ageStage !== "adult") continue;
    if (filter && !filter(c)) continue;
    c.mode = mode;
    c.status = mode === "living" ? "working" : "following";
    resetRuntime(c.id);
    n++;
  }
  return n;
}
