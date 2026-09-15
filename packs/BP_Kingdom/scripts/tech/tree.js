/**
 * tree.js — the research tree (M10, design §14).
 *
 * Schoolhouses drip research points (RP) every dawn; the King may also vote
 * grants of coin. Pick one inquiry at a time — irrigation, tools, steam,
 * railway, telegraph, medicine, platecraft — and each completion rewires
 * the colony: fatter harvests, faster hands, cheaper credit of trust,
 * swifter decrees and steadier coin.
 */
import { LEDGER_CAP } from "../core/state.js";

export const TECHS = {
  irrigation: {
    name: "Irrigation", icon: "💧", cost: 12,
    desc: "Canals & wind pumps: farms +25%, drought pain halved.",
  },
  tools: {
    name: "Improved Tools", icon: "⚒️", cost: 10,
    desc: "Steel edges: all craft & harvest 15% faster.",
  },
  steam: {
    name: "Steam Pump", icon: "🚂", cost: 20, requires: "tools",
    desc: "Pit pumps & sawmill steam: quarry & timber +25%.",
  },
  railway: {
    name: "Railway", icon: "🛤️", cost: 30, requires: "steam",
    desc: "Timetables & freight: market +20%, building +25% pace.",
  },
  telegraph: {
    name: "Telegraph", icon: "📡", cost: 24, requires: "tools",
    desc: "Instant orders: missions return 1 day sooner, decrees +1 report flavor.",
  },
  medicine: {
    name: "Modern Medicine", icon: "💉", cost: 22,
    desc: "Carbolic & quinine: sickness 1 day shorter, cholera blunted.",
  },
  platecraft: {
    name: "Platecraft II", icon: "🪙", cost: 16,
    desc: "Hardened dies: mint plate wear halved again.",
  },
};

export function techList(state) {
  return Object.entries(TECHS).map(([id, t]) => ({
    id,
    ...t,
    unlocked: (state.tech?.unlocked ?? []).includes(id),
    locked: t.requires && !(state.tech?.unlocked ?? []).includes(t.requires),
    current: state.tech?.current?.id === id,
  }));
}

/** Daily RP from seats of learning. */
export function dailyRP(state) {
  let rp = 0;
  for (const b of state.buildings ?? []) {
    if (b.buildingId === "school") rp += 2 * (b.level ?? 1);
    else if (b.buildingId === "library") rp += 1 * (b.level ?? 1); // M13
    else if (b.buildingId === "university") rp += 3; // M13
  }
  const teachers = state.citizens.filter(
    (c) => c.alive && c.profession === "teacher" && c.mode === "living"
  ).length;
  rp += teachers;
  return rp;
}

/** Begins (or switches) inquiry. @returns {{ok,reason?}} */
export function startResearch(state, techId) {
  const t = TECHS[techId];
  if (!t) return { ok: false, reason: "Unknown inquiry." };
  if ((state.tech.unlocked ?? []).includes(techId)) return { ok: false, reason: "Already mastered." };
  if (t.requires && !(state.tech.unlocked ?? []).includes(t.requires)) {
    return { ok: false, reason: `Requires ${TECHS[t.requires].name} first.` };
  }
  state.tech.current = { id: techId, progress: state.tech.current?.id === techId ? state.tech.current.progress : 0, needed: t.cost };
  return { ok: true };
}

/** Votes coin to the inquiry (₹10 → 1 RP). */
export function grantResearch(state, rupees) {
  rupees = Math.floor(rupees);
  if (!(rupees > 0)) return { ok: false, reason: "Name a positive grant." };
  if (rupees > state.treasury) return { ok: false, reason: "The treasury cannot endow that." };
  state.treasury = Math.round((state.treasury - rupees) * 100) / 100;
  const rp = Math.floor(rupees / 10);
  state.tech.rp = (state.tech.rp ?? 0) + rp;
  state.dailyStats.welfare = Math.round(((state.dailyStats.welfare ?? 0) + rupees) * 100) / 100;
  ledgerTech(state, "grant", { rupees, rp });
  return { ok: true, rp };
}

/**
 * Daily research tick: drip RP into the current inquiry, complete it.
 * @returns {{lines:string[],completed:string|null}}
 */
export function tickTech(state) {
  const out = { lines: [], completed: null };
  const drip = dailyRP(state);
  if (drip > 0) state.tech.rp = (state.tech.rp ?? 0) + drip;
  const cur = state.tech.current;
  if (!cur) {
    if (drip > 0 && !state._techNudged) {
      state._techNudged = true; // runtime-only (underscore keys never save)
      out.lines.push("§7🔬 Scholars idle — choose an inquiry in 🔬 Research.");
    }
    return out;
  }
  const avail = state.tech.rp ?? 0;
  if (avail <= 0) return out;
  cur.progress += avail;
  state.tech.rp = 0;
  if (cur.progress >= cur.needed) {
    state.tech.unlocked.push(cur.id);
    out.completed = cur.id;
    state.tech.current = null;
    out.lines.push(`§b🔬 EUREKA! ${TECHS[cur.id].icon} ${TECHS[cur.id].name} mastered — ${TECHS[cur.id].desc}`);
    ledgerTech(state, "complete", { tech: TECHS[cur.id].name });
    // Eureka joy.
    for (const c of state.citizens) {
      if (c.alive) c.mood = Math.min(100, (c.mood ?? 70) + 2);
    }
  }
  return out;
}

/** Global work-haste multiplier from tools/steam/railway for a profession. */
export function techHaste(state, profession) {
  const u = state.tech?.unlocked ?? [];
  let haste = 1;
  if (u.includes("tools")) haste *= 1.15;
  if (u.includes("steam") && ["builder", "laborer", "woodcutter", "forester", "hauler"].includes(profession)) haste *= 1.25;
  return Math.round(haste * 1000) / 1000;
}

/** Market lift from the railway. */
export function techMarket(state) {
  return (state.tech?.unlocked ?? []).includes("railway") ? 0.2 : 0;
}

/** Building pace lift from the railway. */
export function techBuild(state) {
  return (state.tech?.unlocked ?? []).includes("railway") ? 1.25 : 1;
}

/** Mission days saved by the telegraph. */
export function techMission(state) {
  return (state.tech?.unlocked ?? []).includes("telegraph") ? 1 : 0;
}

function ledgerTech(state, what, detail) {
  state.ledger.push({ day: state.day, type: "tech", what, ...detail });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
}
