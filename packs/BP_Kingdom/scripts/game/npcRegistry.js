/**
 * npcRegistry.js — links saved citizen records to live entities.
 * Entity runtime ids are not guaranteed stable across relogs, so every NPC
 * carries a persistent tag "kingdom:cid_c<id>" and we re-map on load.
 */
import { world } from "@minecraft/server";
import { COMMODITIES } from "../economy/pricebook.js";

const cache = new Map(); // citizen record id -> Entity

export function cidTagFor(citizenId) {
  return `kingdom:cid_c${String(citizenId).replace(/\D/g, "")}`;
}

export function tagForRecord(record) {
  record.cidTag = cidTagFor(record.id);
  return record.cidTag;
}

/** Re-scans loaded entities once per session (cheap: tag query only). */
export function relinkAll(state, dimension) {
  cache.clear();
  let npcs = [];
  try {
    npcs = dimension.getEntities({ tags: ["kingdom:npc"] });
  } catch {
    return;
  }
  const byTag = new Map();
  for (const e of npcs) {
    for (const t of e.getTags()) {
      if (t.startsWith("kingdom:cid_")) byTag.set(t, e);
    }
  }
  for (const record of state.citizens) {
    const tag = record.cidTag ?? tagForRecord(record);
    const e = byTag.get(tag);
    if (e) cache.set(record.id, e);
  }
}

/** @returns {Entity|undefined} */
export function getEntity(record, dimension) {
  let e = cache.get(record.id);
  if (e && e.isValid) return e;
  cache.delete(record.id);
  const tag = record.cidTag ?? tagForRecord(record);
  try {
    const found = dimension.getEntities({ tags: [tag] })[0];
    if (found && found.isValid) {
      cache.set(record.id, found);
      return found;
    }
  } catch {
    /* unloaded chunk */
  }
  return undefined;
}

/** Finds the citizen record whose tag matches an entity. */
export function recordForEntity(state, entity) {
  for (const t of entity.getTags()) {
    if (!t.startsWith("kingdom:cid_")) continue;
    const num = t.replace("kingdom:cid_c", "");
    return state.citizens.find((c) => String(c.id).replace(/\D/g, "") === num);
  }
  return undefined;
}

const STAGE_ICON = { baby: "🍼", toddler: "🧸", child: "🧒" };

/** Rebuilds the overhead name with level, profession and any phase icon. */
export function refreshNameTag(record, entity, phaseIcon = "") {
  if (!entity) return;
  let pretty = record.profession
    ? record.profession[0].toUpperCase() + record.profession.slice(1)
    : "Settler";
  if (record.profession === "buyer" && record.buyerCommodity) {
    pretty = `${COMMODITIES[record.buyerCommodity].label} Buyer`;
  }
  if (record.ageStage && record.ageStage !== "adult") {
    const stage = record.ageStage[0].toUpperCase() + record.ageStage.slice(1);
    pretty = `${STAGE_ICON[record.ageStage] ?? ""} ${stage}`.trim();
  }
  const role = record.role === "minister" ? "§eMinister" : `§7${pretty} L${record.level}`;
  const prefix = phaseIcon ? `${phaseIcon} ` : "";
  const color = record.role === "minister" ? "§6§l" : "§f";
  entity.nameTag = `${prefix}${color}${record.fullName}§r   §7· ${role}`;
}
