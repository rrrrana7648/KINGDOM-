/**
 * migration.js — willing, paid migration (M8, design §3).
 *
 * Growth comes from RECRUITER MISSIONS (a mission costs travel + signing
 * bonuses and returns in a few days with willing settlers) and REFUGEE SHIPS
 * (harbor events the King may accept or turn away). No coercion anywhere:
 * arrivals are gated by fame-equivalents the colony earns — full granaries,
 * fair wages, free beds and high happiness. Population policy caps pause
 * arrivals (the queue resumes when room opens).
 */
import { LEDGER_CAP } from "../core/state.js";
import { spawnMigrant } from "../game/citizens.js";

export function nextMissionId(state) {
  return `m-${state.nextMissionId++}`;
}

/** True while the policy allows n more mouths. */
export function canGrow(state, n = 1) {
  if (state.populationPolicy.mode !== "fixed") return true;
  const alive = state.citizens.filter((c) => c.alive).length;
  return alive + n <= state.populationPolicy.cap;
}

/** Room left under a fixed cap (Infinity when unlimited/auto). */
export function roomLeft(state) {
  if (state.populationPolicy.mode !== "fixed") return Infinity;
  return Math.max(0, state.populationPolicy.cap - state.citizens.filter((c) => c.alive).length);
}

export function missionCost(count) {
  return 20 + 15 * Math.max(1, count);
}

export function missionDays(count) {
  return 2 + Math.ceil(Math.max(1, count) / 3);
}

/**
 * Dispatches a recruiter for `count` settlers.
 * @param {object} opts {decreeId?, free?} — decree-funded missions skip the fee
 * @returns {{ok:boolean,mission?:object,reason?:string}}
 */
export function launchMission(state, count, opts = {}) {
  count = Math.max(1, Math.min(20, Math.round(count)));
  const cost = opts.free ? 0 : missionCost(count);
  if (cost > state.treasury) {
    return { ok: false, reason: `A mission for ${count} costs ₹${cost}; the treasury holds ₹${Math.round(state.treasury)}.` };
  }
  state.treasury = Math.round((state.treasury - cost) * 100) / 100;
  state.dailyStats.missions = Math.round(((state.dailyStats.missions ?? 0) + cost) * 100) / 100;
  const mission = {
    id: nextMissionId(state),
    count,
    cost,
    daysLeft: missionDays(count),
    returnDay: state.day + missionDays(count),
    status: "away", // away | done
    decreeId: opts.decreeId ?? null,
    arrived: 0,
  };
  state.missions.push(mission);
  state.ledger.push({ day: state.day, type: "mission", what: "launched", count, cost });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
  return { ok: true, mission };
}

/** Pull factor 0..1: granaries, happiness, beds and fair wages draw crowds. */
export function pullFactor(state) {
  const alive = state.citizens.filter((c) => c.alive);
  const mood = alive.length
    ? alive.reduce((s, c) => s + (c.mood ?? 70), 0) / alive.length
    : 70;
  let pull = 0.55 + (mood - 55) / 200; // 55 mood → 0.55 baseline
  if (state.foodStock < alive.length * 3) pull -= 0.25; // hungry colonies repel
  const bedsFree = (state.houses ?? []).reduce(
    (s, h) => s + Math.max(0, h.beds - h.residents.length), 0
  );
  if ((state.houses ?? []).length > 0 && bedsFree <= 0) pull -= 0.15;
  return Math.max(0.15, Math.min(1, pull));
}

const MIGRANT_JOBS = ["laborer", "woodcutter", "farmer", "builder", "laborer", "farmer"];

/**
 * Auto-grow policy: every 10th dawn, steady newcomers drift in when the
 * colony can feed and cheer them (design §3).
 * @returns {{lines:string[],arrived:number}}
 */
export function tickAutogrow(state, dim) {
  const out = { lines: [], arrived: 0 };
  if (state.populationPolicy?.mode !== "autogrow") return out;
  if (state.day % 10 !== 0) return out;
  const alive = state.citizens.filter((c) => c.alive);
  const mood = alive.length
    ? alive.reduce((s, c) => s + (c.mood ?? 70), 0) / alive.length
    : 0;
  if (state.foodStock < alive.length * 3 || mood < 50) {
    out.lines.push("§7🌱 No newcomers this tithe-day — the colony must first feed and cheer itself.");
    return out;
  }
  const want = Math.max(1, state.populationPolicy.growPer10Days ?? 2);
  const names = [];
  for (let i = 0; i < want; i++) {
    const job = MIGRANT_JOBS[(state.nextCitizenId + i) % MIGRANT_JOBS.length];
    const c = spawnMigrant(state, dim, job);
    if (c) {
      names.push(c.fullName);
      out.arrived++;
    }
  }
  if (out.arrived > 0) {
    out.lines.push(`§a🌱 ${out.arrived} newcomer${out.arrived > 1 ? "s" : ""} drift in seeking work: ${names.slice(0, 4).join(", ")}${out.arrived > 4 ? "…" : ""}`);
  }
  return out;
}

/**
 * Daily mission tick: countdowns, homecomings, policy gating.
 * @returns {{lines:string[],arrived:number}}
 */
export function tickMissions(state, dim) {
  const out = { lines: [], arrived: 0 };
  for (const m of state.missions ?? []) {
    if (m.status !== "away") continue;
    m.daysLeft = Math.max(0, (m.returnDay ?? state.day) - state.day);
    if (m.daysLeft > 0) continue;

    const pull = pullFactor(state);
    let want = Math.max(1, Math.round(m.count * (0.6 + pull * 0.6)));
    const room = roomLeft(state);
    const turnedAway = Math.max(0, want - room);
    want = Math.min(want, room);

    const names = [];
    for (let i = 0; i < want; i++) {
      const job = MIGRANT_JOBS[(state.nextCitizenId + i) % MIGRANT_JOBS.length];
      const c = spawnMigrant(state, dim, job);
      if (c) {
        names.push(c.fullName);
        m.arrived++;
        out.arrived++;
      }
    }
    m.status = "done";
    state.ledger.push({ day: state.day, type: "mission", what: "returned", arrived: m.arrived, count: m.count });
    if (state.ledger.length > LEDGER_CAP) {
      state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
    }

    if (m.arrived > 0) {
      out.lines.push(`§a📯 The recruiter returns with ${m.arrived} willing settler${m.arrived > 1 ? "s" : ""}: ${names.slice(0, 4).join(", ")}${m.arrived > 4 ? "…" : ""}`);
    } else {
      out.lines.push(`§7📯 The recruiter returns empty-handed — the colony's pull is weak (food, beds, happiness).`);
    }
    if (turnedAway > 0) {
      out.lines.push(`§7🏠 ${turnedAway} willing migrant${turnedAway > 1 ? "s" : ""} wait on the population cap.`);
    }
  }
  return out;
}
