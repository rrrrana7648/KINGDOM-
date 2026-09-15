/**
 * satellites.js — satellite villages by royal charter (M13, §37.7).
 *
 * From City… no — from Town upward, the Crown may charter a daughter
 * village: 5 souls and a named governor walk out with seed and tools.
 * Loyal villages tithe coin and grain every fifth dawn; neglected ones
 * (low colony mood, no telegraph) drift toward sullen silence.
 */
import { LEDGER_CAP } from "../core/state.js";

export const CHARTER_COST = 200;
export const CHARTER_SOULS = 5;

/** Grants a charter; settlers depart at once. */
export function charterVillage(state, name, governorId) {
  const tier = state.prestige?.tier ?? "Camp";
  if (!["Town", "City", "Dominion"].includes(tier)) {
    return { ok: false, reason: `Charters need a Town's weight (now: ${tier}).` };
  }
  if ((state.satellites ?? []).length >= 3) return { ok: false, reason: "Three daughters are enough to govern." };
  if (state.treasury < CHARTER_COST) return { ok: false, reason: `A charter costs ₹${CHARTER_COST}.` };
  const governor = state.citizens.find((c) => c.id === governorId && c.alive && c.ageStage === "adult");
  if (!governor || governor.role === "minister") return { ok: false, reason: "Name a living governor." };
  const souls = state.citizens.filter((c) => c.alive && c.ageStage === "adult" && c.role !== "minister" && c.id !== governorId &&
    c.profession !== "guard" && c.profession !== "buyer");
  if (souls.length < CHARTER_SOULS - 1) {
    return { ok: false, reason: `Need ${CHARTER_SOULS} willing souls; only ${souls.length + 1} to spare.` };
  }
  state.treasury = Math.round((state.treasury - CHARTER_COST) * 100) / 100;
  state.dailyStats.missions = Math.round(((state.dailyStats.missions ?? 0) + CHARTER_COST) * 100) / 100;
  const party = [governor, ...souls.slice(0, CHARTER_SOULS - 1)];
  for (const c of party) {
    c.alive = false;
    c.status = "emigrated";
    c.mode = "living";
  }
  const village = {
    id: `g-${state.nextSatelliteId++}`,
    name: String(name ?? "Newfield").slice(0, 24) || "Newfield",
    governor: governor.fullName,
    pop: CHARTER_SOULS,
    loyalty: 70,
    day: state.day,
  };
  state.satellites.push(village);
  ledgerSat(state, "charter", { name: village.name });
  return { ok: true, village };
}

/**
 * Daily tick: loyalty drifts, tithes flow every 5th dawn.
 * @returns {{lines:string[]}}
 */
export function tickSatellites(state) {
  const out = { lines: [] };
  const alive = state.citizens.filter((c) => c.alive);
  const mood = alive.length ? alive.reduce((s, c) => s + (c.mood ?? 70), 0) / alive.length : 70;
  const wired = (state.tech?.unlocked ?? []).includes("telegraph");
  for (const v of state.satellites ?? []) {
    // Loyalty follows the capital's mood (+ wire).
    v.loyalty = Math.max(0, Math.min(100, Math.round(v.loyalty + (mood - 60) / 20 + (wired ? 0.5 : 0))));
    v.pop += v.loyalty >= 60 && state.day % 10 === 0 ? 1 : 0;
    if ((state.day - v.day) % 5 === 0 && state.day !== v.day) {
      if (v.loyalty >= 40) {
        const tithe = 10 + v.pop * 2;
        const grain = 5 + v.pop;
        state.treasury = Math.round((state.treasury + tithe) * 100) / 100;
        state.foodStock += grain;
        out.lines.push(`§a🏘️ Tithe from ${v.name}: ₹${tithe} + ${grain} grain (loyalty ${Math.round(v.loyalty)}).`);
        ledgerSat(state, "tithe", { name: v.name, tithe, grain });
      } else {
        out.lines.push(`§6🏘️ ${v.name} sends excuses, not tithes (loyalty ${Math.round(v.loyalty)}). Raise the capital's mood — or the garrison's profile.`);
      }
    }
  }
  return out;
}

function ledgerSat(state, what, detail) {
  state.ledger.push({ day: state.day, type: "satellite", what, ...detail });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
}
