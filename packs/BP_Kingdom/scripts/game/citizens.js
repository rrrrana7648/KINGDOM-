/**
 * citizens.js — spawns named NPCs and keeps the citizen registry in state.
 * M1 uses vanilla villagers (minecraft:villager_v2) with name tags; the M12
 * art pass replaces them with custom Victorian models.
 */
import { makeName, MINISTER_NAME } from "../core/names.js";
import { suggestWage } from "../core/economist.js";

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
  const { wage } = suggestWage(profession, { level: 1 });
  return {
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
    home: null,
    spouse: null,
    mood: role === "minister" ? 90 : 78,
    health: 20,
    status: "following", // following | working | resting | expedition
  };
}

/** @returns {object} the Minister's citizen record */
export function spawnMinister(player, state) {
  const dim = player.dimension;
  const entity =
    safeSpawn(dim, spawnSpot(player, 0, 1, 3)) ??
    safeSpawn(dim, player.location);
  entity.nameTag = `§6§l${MINISTER_NAME}§r   §7· §eMinister`;
  entity.addTag("kingdom:npc");
  entity.addTag("kingdom:minister");

  const record = freshRecord(state, entity, {
    name: MINISTER_NAME,
    sex: "m",
    role: "minister",
    profession: "minister",
  });
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
    const pretty = spec.profession[0].toUpperCase() + spec.profession.slice(1);
    entity.nameTag = `§f${name}§r   §7· ${pretty}`;
    entity.addTag("kingdom:npc");
    entity.addTag("kingdom:settler");

    const record = freshRecord(state, entity, {
      name,
      sex: spec.sex,
      role: "settler",
      profession: spec.profession,
    });
    state.citizens.push(record);
    records.push(record);
  });
  return records;
}

function safeSpawn(dimension, location) {
  try {
    return dimension.spawnEntity(NPC_TYPE, location);
  } catch {
    return undefined;
  }
}
