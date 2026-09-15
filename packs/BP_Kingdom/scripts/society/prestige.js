/**
 * prestige.js — kingdom prestige tiers (M13, design §37.6).
 *
 * Camp → Hamlet → Town → City → Dominion. Score compounds from souls,
 * coin, roofs, philosophy, relics, honors and charters. Each dawn the
 * heralds re-tally; a tier-up is celebrated with bells, joy and a
 * permanent pull on every recruiter's road (see migration.js).
 */
import { LEDGER_CAP } from "../core/state.js";

export const TIERS = ["Camp", "Hamlet", "Town", "City", "Dominion"];
const THRESHOLDS = { Camp: 0, Hamlet: 100, Town: 250, City: 500, Dominion: 1000 };
const ICONS = { Camp: "⛺", Hamlet: "🏡", Town: "🏘️", City: "🏙️", Dominion: "🌆" };

export function tierIcon(tier) {
  return ICONS[tier] ?? "⛺";
}

/** Tallies the realm's glory from live domains. */
export function prestigeScore(state) {
  const alive = state.citizens.filter((c) => c.alive).length;
  const buildings = (state.buildings ?? []).length;
  const wonders = (state.buildings ?? []).filter((b) =>
    ["monument", "fortress", "museum", "lighthouse"].includes(b.buildingId)).length;
  const techs = (state.tech?.unlocked ?? []).length;
  const titles = state.citizens.filter((c) => c.alive && c.title).length;
  const medals = state.citizens.filter((c) => c.alive).reduce((s, c) => s + (c.medals ?? 0), 0);
  const score =
    alive * 2 +
    Math.floor((state.treasury ?? 0) / 50) +
    buildings * 10 +
    wonders * 50 +
    techs * 15 +
    titles * 5 +
    medals * 3 +
    (state.satellites ?? []).length * 20 +
    (state.museum?.relics ?? 0) * 10;
  return score;
}

export function tierFor(score) {
  let tier = "Camp";
  for (const t of TIERS) {
    if (score >= THRESHOLDS[t]) tier = t;
  }
  return tier;
}

/**
 * Daily herald: re-tally, celebrate promotions.
 * @returns {{lines:string[],promoted:string|null}}
 */
export function tickPrestige(state) {
  const out = { lines: [], promoted: null };
  const score = prestigeScore(state);
  const tier = tierFor(score);
  const prev = state.prestige?.tier ?? "Camp";
  state.prestige = { score, tier };
  if (TIERS.indexOf(tier) > TIERS.indexOf(prev)) {
    out.promoted = tier;
    for (const c of state.citizens) {
      if (c.alive) c.mood = Math.min(100, (c.mood ?? 70) + 5);
    }
    out.lines.push(`§6${tierIcon(tier)} PROMOTION! The ${prev} is proclaimed a ${tier} — bells, bunting, and five days of swagger.`);
    state.ledger.push({ day: state.day, type: "prestige", what: "promote", tier, score });
    if (state.ledger.length > LEDGER_CAP) {
      state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
    }
  }
  return out;
}

/**
 * Daily halls tick: lighthouse fees, post, tourists, timetables, bees,
 * fountains & nannies. Quiet when the roofs don't stand.
 * @returns {{lines:string[],earned:number}}
 */
export function tickHalls(state) {
  const out = { lines: [], earned: 0 };
  const has = (id) => (state.buildings ?? []).some((b) => b.buildingId === id);
  const pay = (n) => {
    state.treasury = Math.round((state.treasury + n) * 100) / 100;
    out.earned = Math.round((out.earned + n) * 100) / 100;
  };
  if (has("lighthouse") && (state.harbor?.level ?? 0) >= 1) {
    pay(8);
    out.lines.push("§7🗼 Anchorage fees: +₹8.");
  }
  if (has("post_office")) {
    pay(3);
    if ((state.spies?.agents?.length ?? 0) > 0 && state.day % 3 === 0) {
      state.spies.intel.push({ day: state.day, text: "Steamed envelopes: a rival's hand orders double shot and powder." });
      out.lines.push("§9📮 The postmaster steams something interesting for the spies.");
    }
  }
  if (has("museum") && (state.museum?.relics ?? 0) > 0) {
    const gate = state.museum.relics * 6;
    pay(gate);
    out.lines.push(`§7🏛️ ${state.museum.relics} relics draw gawkers: +₹${gate}.`);
  }
  if (has("station")) {
    const railway = (state.tech?.unlocked ?? []).includes("railway");
    pay(railway ? 12 : 6);
    out.lines.push(`§7🚉 Timetables & freight: +₹${railway ? 12 : 6}.`);
  }
  if (has("apiary")) {
    state.foodStock += 4;
    out.lines.push("§7🐝 The hives hum: +4 rations of honey.");
  }
  if (has("park")) {
    for (const c of state.citizens) {
      if (c.alive) c.mood = Math.min(100, (c.mood ?? 70) + 3);
    }
    out.lines.push("§7⛲ Promenades & bandstand air: the town breathes easier (+mood).");
  }
  if (has("creche")) {
    let comforted = 0;
    for (const c of state.citizens) {
      if (!c.alive || c.ageStage !== "adult") continue;
      const toddler = state.citizens.some((k) => k.alive && k.ageStage === "toddler" && k.motherId === c.id);
      if (toddler) {
        c.mood = Math.min(100, (c.mood ?? 70) + 3);
        comforted++;
      }
    }
    if (comforted > 0) out.lines.push(`§7🧸 Nannies mind ${comforted} working mother${comforted > 1 ? "s" : ""} (+mood).`);
  }
  return out;
}
