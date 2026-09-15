/**
 * expeditions.js — ruins, seams, caves, trappers & the King's writ far
 * afield (M13, §22, §37.128–129, §37.137).
 *
 * A leader and a crew walk out with packs and pikes, and return days
 * later with relics for the museum, ore caches, furs — or bandages and
 * hard lessons. Scouts (fast legs, high level) tilt every hazard.
 */
import { LEDGER_CAP } from "../core/state.js";

export const EXPEDITIONS = {
  ruins: { name: "Ruin expedition", icon: "🏛️", days: 6, cost: 60, crew: 3, desc: "Ancient relics for the museum + tourist fame." },
  seam: { name: "Seam survey", icon: "⛏️", days: 4, cost: 40, crew: 2, desc: "New mine seams: an ore cache for the warehouse." },
  cave: { name: "Cave descent", icon: "🕳️", days: 5, cost: 50, crew: 3, desc: "Rich minerals — and things with teeth." },
  trappers: { name: "Fur trappers", icon: "🦊", days: 7, cost: 45, crew: 2, desc: "Frontier furs, steady and safe." },
  zoo: { name: "Beast capture", icon: "🐘", days: 6, cost: 70, crew: 4, desc: "An exotic beast for the royal menagerie (+prestige)." },
};

/** Dispatches an expedition (crew idles at home until return). */
export function launchExpedition(state, kind, leaderId, crewIds = []) {
  const def = EXPEDITIONS[kind];
  if (!def) return { ok: false, reason: "No such venture." };
  if (state.treasury < def.cost) return { ok: false, reason: `Outfitting costs ₹${def.cost}.` };
  const leader = state.citizens.find((c) => c.id === leaderId && c.alive && c.ageStage === "adult");
  if (!leader) return { ok: false, reason: "Name a living leader." };
  const crew = [leaderId, ...crewIds].slice(0, def.crew);
  if (crew.length < def.crew) return { ok: false, reason: `Needs ${def.crew} souls.` };
  for (const id of crew) {
    const c = state.citizens.find((x) => x.id === id && x.alive && x.ageStage === "adult");
    if (!c || c.role === "minister") return { ok: false, reason: "The party must be living adults." };
  }
  state.treasury = Math.round((state.treasury - def.cost) * 100) / 100;
  state.dailyStats.missions = Math.round(((state.dailyStats.missions ?? 0) + def.cost) * 100) / 100;
  for (const id of crew) {
    const c = state.citizens.find((x) => x.id === id);
    c.status = "away";
  }
  const expedition = {
    id: `e-${state.nextExpeditionId++}`,
    kind, leaderId, crew,
    departDay: state.day, returnDay: state.day + def.days,
    status: "out",
  };
  state.expeditions.push(expedition);
  ledgerExp(state, "launch", { id: expedition.id, kind });
  return { ok: true, expedition };
}

/**
 * Daily tick: homecomings, hazards, loot.
 * @returns {{lines:string[]}}
 */
export function tickExpeditions(state, rng = Math.random) {
  const out = { lines: [] };
  const kept = [];
  for (const e of state.expeditions ?? []) {
    if (e.status !== "out") continue;
    if (state.day < e.returnDay) {
      kept.push(e);
      continue;
    }
    e.status = "home";
    const party = e.crew.map((id) => state.citizens.find((c) => c.id === id)).filter((c) => c && c.alive);
    for (const c of party) {
      if (c.status === "away") c.status = "working";
      c.xp += 30;
    }
    // Hazard scales down with party level (scouts & veterans).
    const avgLevel = party.length ? party.reduce((s, c) => s + (c.level ?? 1), 0) / party.length : 1;
    const hazard = Math.max(0.1, 0.45 - avgLevel * 0.06);
    const marred = rng() < hazard && party.length > 0;
    if (marred) {
      const victim = party[Math.floor(rng() * party.length)];
      victim.health = Math.max(1, (victim.health ?? 20) - 8);
      victim.mood = Math.max(5, (victim.mood ?? 70) - 5);
      out.lines.push(`§6${EXPEDITIONS[e.kind].icon} ${EXPEDITIONS[e.kind].name} returns — ${victim.fullName.split(" ")[0]} bandaged (bandits on the trail).`);
    }
    const loot = LOOT[e.kind](state, party, rng);
    out.lines.push(loot);
    ledgerExp(state, "return", { id: e.id, kind: e.kind });
  }
  state.expeditions = [...kept, ...(state.expeditions ?? []).filter((e) => e.status !== "out")];
  if (state.expeditions.length > 10) {
    state.expeditions = state.expeditions.filter((e) => e.status === "out").concat(state.expeditions.filter((e) => e.status !== "out").slice(-6));
  }
  return out;
}

const LOOT = {
  ruins(s) {
    s.museum.relics++;
    for (const c of s.citizens) if (c.alive) c.mood = Math.min(100, (c.mood ?? 70) + 3);
    return `§b🏛️ Relics for the museum! Tourists will pay to gawk (${s.museum.relics} in the collection).`;
  },
  seam(s, party, rng) {
    const cache = 8 + Math.floor(rng() * 12);
    s.stockpile["minecraft:raw_iron"] = (s.stockpile["minecraft:raw_iron"] ?? 0) + cache;
    return `§a⛏️ A new seam! ${cache} raw iron cached to the warehouse.`;
  },
  cave(s, party, rng) {
    const gold = 2 + Math.floor(rng() * 4);
    const gems = rng() < 0.4 ? 1 : 0;
    s.stockpile["minecraft:raw_gold"] = (s.stockpile["minecraft:raw_gold"] ?? 0) + gold;
    if (gems) s.stockpile["minecraft:diamond"] = (s.stockpile["minecraft:diamond"] ?? 0) + 1;
    return `§6🕳️ The cave yields ${gold} raw gold${gems ? " and a diamond" : ""} — and nightmares, free.`;
  },
  trappers(s, party, rng) {
    const furs = 10 + Math.floor(rng() * 10);
    const proceeds = furs * 2;
    s.treasury = Math.round((s.treasury + proceeds) * 100) / 100;
    return `§a🦊 ${furs} prime furs sold downriver: ₹${proceeds}.`;
  },
  zoo(s) {
    s.prestige.score += 25;
    for (const c of s.citizens) if (c.alive) c.mood = Math.min(100, (c.mood ?? 70) + 4);
    return "§d🐘 A captured oliphant trumpets in the menagerie! The children riot with joy (+prestige).";
  },
};

function ledgerExp(state, what, detail) {
  state.ledger.push({ day: state.day, type: "expedition", what, ...detail });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
}
