/**
 * citizens.js — spawns named NPCs and keeps the citizen registry in state.
 * M1/M2 use vanilla villagers (minecraft:villager_v2) with name tags and a
 * persistent kingdom:cid_ tag; custom Victorian models arrive at M12.
 * M7 adds newborns (6-day aging to adulthood); M8 adds willing migrants.
 */
import { makeName, MINISTER_NAME, MALE_FIRST, FEMALE_FIRST, SURNAMES } from "../core/names.js";
import { suggestWage } from "../core/economist.js";
import { tagForRecord, refreshNameTag } from "./npcRegistry.js";
import { createBuyer } from "../economy/buyers.js";
import { COMMODITIES } from "../economy/pricebook.js";

export const NPC_TYPE = "minecraft:villager_v2";

/** The four founding settlers: exactly 2 men + 2 women (design §19). */
export const FOUNDING_SETTLERS = [
  { profession: "builder", sex: "m" },
  { profession: "woodcutter", sex: "m" },
  { profession: "farmer", sex: "f" },
  { profession: "laborer", sex: "f" },
];

/** Spawn position just in front of (or ringed around) the player. */
function spawnSpot(player, index = 0, total = 1, distance = 3) {
  const rot = player.getRotation?.() ?? { y: 0 };
  const yaw = ((rot.y ?? 0) * Math.PI) / 180;
  const angle = total > 1 ? (index / total) * Math.PI * 2 : yaw;
  const x = player.location.x + Math.round(-Math.sin(angle) * distance) + 0.5;
  const z = player.location.z + Math.round(Math.cos(angle) * distance) + 0.5;
  return { x, y: player.location.y + 1, z };
}

function freshRecord(state, entity, { name, sex, role, profession }) {
  const danger = profession === "miner" ? "cave" : "safe";
  const { wage } = suggestWage(profession, { level: 1, danger });
  const record = {
    id: `c-${state.nextCitizenId++}`,
    entityId: entity.id,
    fullName: name,
    sex,
    role, // 'minister' | 'settler'
    profession,
    ageStage: "adult", // baby | toddler | child | adult (6-day aging, M7)
    ageDays: 0,
    level: 1,
    xp: 0,
    wageMode: "crown", // crown | freelance
    wage,
    employer: "crown",
    mode: "following", // following | living
    armed: false,
    alive: true,
    savings: 0,
    home: null,
    spouse: null,
    partner: null, // betrothed during engagement (M7)
    affection: {}, // courtship meters by citizen id (M7)
    pregnancy: null, // {day,fatherId,motherId} (M7)
    motherId: null,
    fatherId: null,
    rentOwed: 0,
    assignedSite: null, // construction crew posting (M6)
    mood: role === "minister" ? 90 : 78,
    health: 20,
    status: "following",
    needs: { food: 100, rest: 100, leisure: 100, safety: 100 },
    day: {
      meals: 0, slept: false, workedTicks: 0, leisureTicks: 0,
      delivered: 0, scared: 0, breakfast: false, lunch: false, dinner: false,
      earned: 0,
    },
  };
  record.cidTag = tagForRecord(record);
  return record;
}

function outfit(entity, record) {
  entity.addTag("kingdom:npc");
  entity.addTag(record.cidTag);
  refreshNameTag(record, entity);
}

function uniqueName(state, sex) {
  const used = new Set(state.citizens.map((c) => c.fullName));
  let name = makeName(sex);
  let guard = 0;
  while (used.has(name) && guard++ < 30) name = makeName(sex);
  used.add(name);
  return name;
}

/** @returns {object} the Minister's citizen record */
export function spawnMinister(player, state) {
  const dim = player.dimension;
  const entity =
    safeSpawn(dim, spawnSpot(player, 0, 1, 3)) ??
    safeSpawn(dim, player.location);
  const record = freshRecord(state, entity, {
    name: MINISTER_NAME,
    sex: "m",
    role: "minister",
    profession: "minister",
  });
  outfit(entity, record);
  state.citizens.push(record);
  return record;
}

/** Spawns the 2 men + 2 women settlers around the player. @returns {object[]} */
export function spawnFoundingParty(player, state) {
  const records = [];
  const used = new Set(state.citizens.map((c) => c.fullName));
  FOUNDING_SETTLERS.forEach((spec, i) => {
    let name = makeName(spec.sex);
    let guard = 0;
    while (used.has(name) && guard++ < 20) name = makeName(spec.sex);
    used.add(name);

    const dim = player.dimension;
    const entity =
      safeSpawn(dim, spawnSpot(player, i, FOUNDING_SETTLERS.length, 3)) ??
      safeSpawn(dim, player.location);
    const record = freshRecord(state, entity, {
      name,
      sex: spec.sex,
      role: "settler",
      profession: spec.profession,
    });
    outfit(entity, record);
    state.citizens.push(record);
    records.push(record);
  });
  return records;
}

/**
 * Hires a licensed commodity buyer: spawns a clerk beside the stall chest
 * and links both the citizen record and the stall record.
 * @returns {{record:object,buyer:object}}
 */
export function spawnBuyer(player, state, commodity, chestBlock) {
  const dim = player.dimension;
  const { x, y, z } = chestBlock.location;
  let entity = safeSpawn(dim, { x: x + 1.5, y, z: z + 0.5 });
  if (!entity) entity = safeSpawn(dim, spawnSpot(player, 0, 1, 2));

  const used = new Set(state.citizens.map((c) => c.fullName));
  const sex = Math.random() < 0.5 ? "m" : "f";
  const pool = sex === "m" ? MALE_FIRST : FEMALE_FIRST;
  let name = `${pool[Math.floor(Math.random() * pool.length)]} ${
    SURNAMES[Math.floor(Math.random() * SURNAMES.length)]
  }`;
  let guard = 0;
  while (used.has(name) && guard++ < 30) {
    name = `${pool[Math.floor(Math.random() * pool.length)]} ${
      SURNAMES[Math.floor(Math.random() * SURNAMES.length)]
    }`;
  }

  const record = freshRecord(state, entity, {
    name, sex, role: "settler", profession: "buyer",
  });
  record.buyerCommodity = commodity;
  record.wageMode = "crown";
  record.mode = "living";
  record.status = "working";
  record.wage = suggestWage("buyer", { level: 1 }).wage;
  outfit(entity, record);
  state.citizens.push(record);

  const buyer = createBuyer(state, record.id, name, commodity, chestBlock.location);
  return { record, buyer, entity };
}

/**
 * A newborn arrives (M7): spawns beside the mother, inherits the family
 * surname, and begins the 6-day dependency (baby→toddler→child→adult).
 * Adoptees arrive as toddlers via opts {stage, ageDays}.
 * @returns {object|null} the baby record
 */
export function spawnChild(state, dim, mother, father = null, opts = {}) {
  const anchor = state.zones.home ?? state.zones.town ?? { x: 0.5, y: 64, z: 0.5 };
  const loc = mother._entity?.location ?? anchor;
  const entity = safeSpawn(dim, { x: loc.x + 1, y: loc.y, z: loc.z });
  if (!entity) return null;

  const sex = Math.random() < 0.5 ? "m" : "f";
  const pool = sex === "m" ? MALE_FIRST : FEMALE_FIRST;
  const surname = (mother.fullName.split(" ")[1] ?? father?.fullName.split(" ")[1] ?? SURNAMES[0]);
  const used = new Set(state.citizens.map((c) => c.fullName));
  let name = `${pool[Math.floor(Math.random() * pool.length)]} ${surname}`;
  let guard = 0;
  while (used.has(name) && guard++ < 30) {
    name = `${pool[Math.floor(Math.random() * pool.length)]} ${surname}`;
  }

  const record = freshRecord(state, entity, {
    name, sex, role: "settler", profession: "child",
  });
  record.ageStage = opts.stage ?? "baby";
  record.ageDays = opts.ageDays ?? 0;
  record.motherId = mother.id;
  record.fatherId = father?.id ?? mother.spouse ?? null;
  record.mode = "living";
  record.status = "home";
  record.wage = 0;
  record.mood = 85;
  if (mother.home) record.home = mother.home;
  outfit(entity, record);
  state.citizens.push(record);
  return record;
}

/**
 * A willing migrant answers the recruiter's call or leaves the refugee ship
 * (M8): spawns at the town anchor, gathers with the King's retinue until
 * released to live and work.
 * @returns {object|null} the migrant record
 */
export function spawnMigrant(state, dim, profession = "laborer") {
  const anchor = state.zones.town ?? { x: 0.5, y: 64, z: 0.5 };
  const scatter = () => (Math.random() - 0.5) * 4;
  const entity = safeSpawn(dim, {
    x: anchor.x + scatter(),
    y: anchor.y,
    z: anchor.z + scatter(),
  });
  if (!entity) return null;

  const sex = Math.random() < 0.5 ? "m" : "f";
  const record = freshRecord(state, entity, {
    name: uniqueName(state, sex),
    sex,
    role: "settler",
    profession,
  });
  record.mode = "following"; // musters with the retinue; the King releases them
  record.status = "following";
  outfit(entity, record);
  state.citizens.push(record);
  return record;
}

function safeSpawn(dimension, location) {
  try {
    return dimension.spawnEntity(NPC_TYPE, location);
  } catch {
    return undefined;
  }
}
