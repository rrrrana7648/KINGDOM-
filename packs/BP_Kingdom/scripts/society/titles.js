/**
 * titles.js — knighthoods, medals & coats of arms (M13, §37.18, §36).
 *
 * From Town tier upward the Crown may dub knights ("Sir Ravi"): the whole
 * colony stands taller. Guards blooded in raids earn medals at ceremony;
 * decorated houses bear painted crests on their plaques.
 */
import { LEDGER_CAP } from "../core/state.js";

function ledgerHonor(state, what, detail) {
  state.ledger.push({ day: state.day, type: "honor", what, ...detail });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
}

/** Dubs a citizen knight (₹100, Town+). @returns {{ok,reason?}} */
export function knightCitizen(state, citizenId) {
  const c = state.citizens.find((x) => x.id === citizenId && x.alive);
  if (!c || c.ageStage !== "adult") return { ok: false, reason: "Only living adults may kneel for the sword." };
  if (c.title) return { ok: false, reason: "Already titled." };
  const tier = state.prestige?.tier ?? "Camp";
  if (!["Town", "City", "Dominion"].includes(tier)) {
    return { ok: false, reason: `Knighthoods need a Town's dignity (now: ${tier}).` };
  }
  if (state.treasury < 100) return { ok: false, reason: "The ceremony costs ₹100." };
  state.treasury = Math.round((state.treasury - 100) * 100) / 100;
  state.dailyStats.welfare = Math.round(((state.dailyStats.welfare ?? 0) + 100) * 100) / 100;
  const prefix = c.sex === "f" ? "Dame" : "Sir";
  const bare = c.fullName.replace(/^(Sir|Dame) /, "");
  c.fullName = `${prefix} ${bare}`;
  c.title = prefix;
  for (const o of state.citizens) {
    if (o.alive) o.mood = Math.min(100, (o.mood ?? 70) + 3);
  }
  ledgerHonor(state, "knight", { name: c.fullName });
  return { ok: true, name: c.fullName };
}

/** Awards a medal to a guard veteran (₹25, needs 60+ xp). */
export function awardMedal(state, citizenId) {
  const c = state.citizens.find((x) => x.id === citizenId && x.alive);
  if (!c || (c.profession !== "guard" && c.profession !== "soldier")) {
    return { ok: false, reason: "Medals are for the watch and soldiery." };
  }
  if ((c.xp ?? 0) < 60) return { ok: false, reason: "They must first be blooded (60+ xp)." };
  if (state.treasury < 25) return { ok: false, reason: "The ceremony costs ₹25." };
  state.treasury = Math.round((state.treasury - 25) * 100) / 100;
  state.dailyStats.welfare = Math.round(((state.dailyStats.welfare ?? 0) + 25) * 100) / 100;
  c.medals = (c.medals ?? 0) + 1;
  c.mood = Math.min(100, (c.mood ?? 70) + 8);
  for (const o of state.citizens) {
    if (o.alive && o.id !== c.id) o.mood = Math.min(100, (o.mood ?? 70) + 2);
  }
  ledgerHonor(state, "medal", { name: c.fullName, medals: c.medals });
  return { ok: true };
}

/** Paints a house crest (₹15, flavor + pride). */
export function paintCrest(state, houseId, crest) {
  const h = (state.houses ?? []).find((x) => x.id === houseId);
  if (!h) return { ok: false, reason: "No such house." };
  if (state.treasury < 15) return { ok: false, reason: "Painters charge ₹15." };
  state.treasury = Math.round((state.treasury - 15) * 100) / 100;
  h.crest = String(crest ?? "🦁").slice(0, 4);
  for (const id of h.residents ?? []) {
    const c = state.citizens.find((x) => x.id === id && x.alive);
    if (c) c.mood = Math.min(100, (c.mood ?? 70) + 2);
  }
  return { ok: true };
}
