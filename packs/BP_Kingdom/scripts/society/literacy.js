/**
 * literacy.js — letters, libraries & the Royal Gazette (M13, §37.91–94).
 *
 * Schools, libraries and universities lift the literacy rate; the
 * lettered learn faster (XP bonus) and read every edict. Each sevenday
 * the Gazette press rolls: subscriptions pay coin and the informed are
 * content — unless the press is silenced.
 */
import { LEDGER_CAP } from "../core/state.js";

/** 0–95% lettered, from seats of learning. */
export function literacyRate(state) {
  let rate = 10;
  for (const b of state.buildings ?? []) {
    if (b.buildingId === "school") rate += 12 * (b.level ?? 1);
    else if (b.buildingId === "library") rate += 15 * (b.level ?? 1);
    else if (b.buildingId === "university") rate += 25;
  }
  const teachers = state.citizens.filter(
    (c) => c.alive && c.profession === "teacher" && c.mode === "living"
  ).length;
  rate += Math.min(15, teachers * 3);
  return Math.min(95, rate);
}

/** XP multiplier for the lettered colony (jobs.js reads this). */
export function literacyXpMult(state) {
  return Math.round((1 + literacyRate(state) / 200) * 1000) / 1000;
}

/**
 * Daily letters tick: Gazette sevenday edition.
 * @returns {{lines:string[]}}
 */
export function tickLiteracy(state) {
  const out = { lines: [] };
  const press = (state.buildings ?? []).some((b) => b.buildingId === "gazette");
  if (!press || !(state.literacy?.gazette ?? true)) return out;
  if (state.day % 7 !== 0) return out;
  const readers = state.citizens.filter((c) => c.alive).length;
  const income = Math.min(40, 5 + readers);
  state.treasury = Math.round((state.treasury + income) * 100) / 100;
  for (const c of state.citizens) {
    if (c.alive) c.mood = Math.min(100, (c.mood ?? 70) + 2);
  }
  out.lines.push(`§b📰 The Royal Gazette rolls off the press — ${readers} readers, ₹${income} in subscriptions, gossip for a week.`);
  state.ledger.push({ day: state.day, type: "gazette", what: "edition", income });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
  return out;
}
