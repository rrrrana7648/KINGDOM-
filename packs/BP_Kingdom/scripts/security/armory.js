/**
 * armory.js — muskets, drills & victory parades (M13, §37.106–107, §37.120).
 *
 * Guards fight with issued muskets: forge them (2 iron + 1 wood) or buy
 * them (₹15). Short muskets mean warnings, not patrols. Drill yards grind
 * recruits into veterans (+6 xp/dawn); won raids end in victory parades,
 * and the fallen get war memorials in the stones.
 */
import { LEDGER_CAP } from "../core/state.js";

export const MUSKET_COST = 15;

/** Guards who can actually draw a musket. */
export function effectiveGuards(state) {
  let guards = 0;
  for (const c of state.citizens) {
    if (c.alive && c.ageStage === "adult" && c.mode === "living" &&
        (c.profession === "guard" || c.profession === "soldier") && c.status !== "prisoner") guards++;
  }
  return Math.min(guards, state.armory?.muskets ?? 0);
}

export function hasDrillYard(state) {
  return (state.buildings ?? []).some((b) => b.buildingId === "drill_yard");
}

export function hasArmoryHall(state) {
  return (state.buildings ?? []).some((b) => b.buildingId === "armory");
}

/** Forges a musket from warehouse stock (free but hungry). */
export function forgeMusket(state) {
  const iron = state.stockpile["minecraft:iron_ingot"] ?? 0;
  const wood = (state.stockpile["minecraft:oak_log"] ?? 0) + (state.stockpile["minecraft:spruce_log"] ?? 0);
  if (iron < 2 || wood < 1) return { ok: false, reason: "Needs 2 iron ingots + 1 log." };
  state.stockpile["minecraft:iron_ingot"] -= 2;
  if ((state.stockpile["minecraft:oak_log"] ?? 0) >= 1) state.stockpile["minecraft:oak_log"]--;
  else state.stockpile["minecraft:spruce_log"]--;
  state.armory.muskets++;
  return { ok: true };
}

/** Buys muskets outright. */
export function buyMuskets(state, n) {
  n = Math.max(1, Math.min(20, Math.round(n)));
  const cost = n * MUSKET_COST;
  if (cost > state.treasury) return { ok: false, reason: `₹${cost} for ${n} — too dear today.` };
  if (!hasArmoryHall(state) && (state.armory.muskets ?? 0) + n > 10) {
    return { ok: false, reason: "Without an armory hall, 10 muskets crowd the racks." };
  }
  state.treasury = Math.round((state.treasury - cost) * 100) / 100;
  state.dailyStats.security = Math.round(((state.dailyStats.security ?? 0) + cost) * 100) / 100;
  state.armory.muskets += n;
  return { ok: true, cost };
}

/**
 * Daily tick: drills, musket warnings.
 * @returns {{lines:string[]}}
 */
export function tickArmory(state) {
  const out = { lines: [] };
  if (hasDrillYard(state)) {
    let drilled = 0;
    for (const c of state.citizens) {
      if (c.alive && (c.profession === "guard" || c.profession === "soldier")) {
        c.xp += 6;
        drilled++;
      }
    }
    if (drilled > 0) out.lines.push(`§7🥁 The drill yard marches ${drilled} guard${drilled > 1 ? "s" : ""} (+6 xp each).`);
  }
  // Count raw guards vs muskets for the warning cry.
  let guards = 0;
  for (const c of state.citizens) {
    if (c.alive && c.ageStage === "adult" && c.mode === "living" &&
        (c.profession === "guard" || c.profession === "soldier") && c.status !== "prisoner") guards++;
  }
  const short = guards - (state.armory?.muskets ?? 0);
  if (short > 0) {
    out.lines.push(`§6⚠️ ${short} guard${short > 1 ? "s stand" : " stands"} musket-less — forge or buy muskets, or warnings replace patrols.`);
  }
  return out;
}

/** Victory parade after a won raid (called by dayroll). */
export function victoryParade(state) {
  for (const c of state.citizens) {
    if (c.alive) c.mood = Math.min(100, (c.mood ?? 70) + 4);
  }
  state.ledger.push({ day: state.day, type: "war", what: "parade" });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
  return "§a🎖️ VICTORY PARADE! Bands, medals, and flowers under the guard's boots (+mood).";
}
