/**
 * guards.js — the watch, the garrison & war (M9, design §24, §35).
 *
 * Redcoats and sepoys (profession `guard`) patrol the town anchor by day and
 * stand the night watch; the barracks hall widens the garrison. When bandit
 * kings smell rich undefended stores they raid: defense power (guards,
 * militia, barracks, armed citizenry) meets the raid's strength, and the
 * difference is paid in coin, stores and blood. Conscription drafts paid
 * militia in a hurry — volunteers grumble less than the pressed.
 *
 * The security rating (HUD) blends garrison strength, halls, militia,
 * recent raids and street unrest.
 */
import { LEDGER_CAP } from "../core/state.js";
import { handleInheritance } from "../social/housing.js";

/** Living, working guards (redcoats & sepoys alike). */
export function guardRoster(state) {
  return state.citizens.filter(
    (c) => c.alive && c.ageStage === "adult" && c.mode === "living" &&
      (c.profession === "guard" || c.profession === "soldier") && c.status !== "prisoner"
  );
}

/** Active militia count (0 when the muster has expired). */
export function militiaCount(state) {
  const m = state.security?.militia;
  if (!m || state.day > m.untilDay) return 0;
  return m.count;
}

/** 0–100 security rating for the HUD. */
export function securityRating(state) {
  const guards = guardRoster(state).length;
  const barracks = (state.buildings ?? []).find((b) => b.buildingId === "barracks");
  let score = 30 + guards * 12 + militiaCount(state) * 6 + (barracks ? 10 * (barracks.level ?? 1) : 0);
  const sinceRaid = state.day - (state.security?.lastRaidDay ?? -99);
  if (sinceRaid < 3) score -= (3 - sinceRaid) * 12;
  score -= (state.security?.unrest ?? 0) / 6;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Defense power thrown against a raid. */
export function defensePower(state) {
  // M13: only musket-issued guards count; fortresses & armories fortify;
  // a standing spy warning doubles the garrison's readiness (×1.5).
  const guards = Math.min(guardRoster(state).length, state.armory?.muskets ?? 0);
  const barracks = (state.buildings ?? []).find((b) => b.buildingId === "barracks");
  const fortress = (state.buildings ?? []).find((b) => b.buildingId === "fortress");
  const armoryHall = (state.buildings ?? []).some((b) => b.buildingId === "armory");
  const armed = state.citizens.filter((c) => c.alive && c.ageStage === "adult" && c.armed).length;
  let power = guards * 10 + militiaCount(state) * 6 +
    (barracks ? 15 * (barracks.level ?? 1) : 0) +
    (fortress ? 20 * (fortress.level ?? 1) : 0) +
    (armoryHall ? 5 : 0) + armed * 2;
  if (state.day <= (state.spies?.raidWarningDay ?? -99)) power = Math.round(power * 1.5);
  return power;
}

function ledgerWar(state, what, detail) {
  state.ledger.push({ day: state.day, type: "war", what, ...detail });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
}

/**
 * Posts a citizen as a guard (or recalls them to their old trade).
 * Remembers the old profession for recall.
 */
export function postGuard(state, citizenId) {
  const c = state.citizens.find((x) => x.id === citizenId && x.alive);
  if (!c || c.ageStage !== "adult") return { ok: false, reason: "Only living adults can stand watch." };
  if (c.role === "minister") return { ok: false, reason: "The Minister commands — he does not patrol." };
  if (c.profession === "guard" || c.profession === "soldier") return { ok: false, reason: "Already posted." };
  if (c.profession === "buyer") return { ok: false, reason: "Recall the clerk from their stall first." };
  c.prevProfession = c.profession;
  c.profession = "guard";
  c.wage = 12;
  c.mode = "living";
  c.armed = true;
  return { ok: true };
}

export function recallGuard(state, citizenId) {
  const c = state.citizens.find((x) => x.id === citizenId && x.alive);
  if (!c || (c.profession !== "guard" && c.profession !== "soldier")) {
    return { ok: false, reason: "Not a posted guard." };
  }
  c.profession = c.prevProfession ?? "laborer";
  c.prevProfession = undefined;
  c.wage = c.profession === "builder" ? 9 : c.profession === "woodcutter" || c.profession === "farmer" ? 6 : 5;
  return { ok: true };
}

/** Designates a living adult as an inspector (audits officials). */
export function postInspector(state, citizenId) {
  const c = state.citizens.find((x) => x.id === citizenId && x.alive);
  if (!c || c.ageStage !== "adult") return { ok: false, reason: "Only living adults." };
  if (c.role === "minister" || c.profession === "buyer") return { ok: false, reason: "They cannot leave their post." };
  c.prevProfession = c.profession;
  c.profession = "inspector";
  c.wage = 18;
  c.mode = "living";
  return { ok: true };
}

/**
 * Conscripts paid militia for a muster. Volunteers grumble less.
 * @returns {{ok,reason?}}
 */
export function conscript(state, count, days = 5) {
  count = Math.max(1, Math.min(12, Math.round(count)));
  const eligible = state.citizens.filter(
    (c) => c.alive && c.ageStage === "adult" && c.mode === "living" &&
      c.profession !== "guard" && c.profession !== "soldier" && c.role !== "minister" &&
      c.status !== "prisoner"
  );
  if (eligible.length < count) {
    return { ok: false, reason: `Only ${eligible.length} able adults to muster.` };
  }
  const bonus = 5 * count;
  if (bonus > state.treasury) return { ok: false, reason: `Muster bonuses ₹${bonus} exceed the treasury.` };
  state.treasury = Math.round((state.treasury - bonus) * 100) / 100;
  state.dailyStats.security = Math.round(((state.dailyStats.security ?? 0) + bonus) * 100) / 100;
  for (const c of eligible.slice(0, count)) {
    c.armed = true;
    c.mood = Math.max(5, (c.mood ?? 70) - 3); // paid volunteers grumble little
  }
  state.security.militia = { untilDay: state.day + Math.max(1, days), count, bonus };
  state.security.unrest = Math.min(100, (state.security.unrest ?? 0) + 3);
  ledgerWar(state, "muster", { count, days, bonus });
  return { ok: true };
}

/**
 * Daily raid roll + militia expiry. Wealth undefended invites bandit kings.
 * @returns {{lines:string[],raid:boolean}}
 */
export function tickDefense(state, rng = Math.random) {
  const out = { lines: [], raid: false };
  const militia = state.security.militia;
  if (militia && state.day > militia.untilDay) {
    state.security.militia = null;
    out.lines.push("§7🛡️ The militia muster stands down; pikes return to the armory.");
  }

  const sinceRaid = state.day - (state.security.lastRaidDay ?? -99);
  if (sinceRaid < (state.security.raidCooldown ?? 5)) return out;

  const stockValue = Object.values(state.stockpile ?? {}).reduce((a, b) => a + b, 0);
  const wealth = state.treasury + stockValue * 0.5;
  const security = securityRating(state);
  const chance = Math.max(0.02, Math.min(0.3, wealth / 40000 - security / 500));
  if (rng() >= chance) return out;
  return resolveRaid(state, rng);
}

/**
 * A bandit raid, resolved at once (design §35.1). Exported for tests/events.
 * @returns {{lines:string[],raid:boolean,won?:boolean}}
 */
export function resolveRaid(state, rng = Math.random) {
  const out = { lines: [], raid: true };
  state.security.lastRaidDay = state.day;
  const power = defensePower(state);
  const raidPower = Math.round(20 + rng() * 50 + state.day * 0.5);
  const guards = guardRoster(state);

  if (power >= raidPower) {
    const glory = Math.round((power - raidPower) / 2);
    for (const g of guards) {
      g.xp += 20;
      g.mood = Math.min(100, (g.mood ?? 70) + 4);
    }
    state.security.unrest = Math.max(0, (state.security.unrest ?? 0) - 3);
    out.won = true;
    out.lines.push(
      `§a🛡️ Bandits struck at dusk — the watch drove them off! (defense ${power} vs raid ${raidPower}) The town cheers; the guard drills with pride.`
    );
    if (glory > 20) {
      for (const c of state.citizens) {
        if (c.alive) c.mood = Math.min(100, (c.mood ?? 70) + 2);
      }
    }
    ledgerWar(state, "raid-won", { power, raidPower });
    return out;
  }

  // The town pays in coin, stores and blood.
  out.won = false;
  const loot = Math.min(Math.floor(state.treasury * 0.15), 60 + Math.floor(rng() * 120));
  state.treasury = Math.round((state.treasury - loot) * 100) / 100;
  const granary = Math.min(state.foodStock, 10 + Math.floor(rng() * 30));
  state.foodStock -= granary;
  const repairs = Math.min(40, 10 + Math.floor(rng() * 30));
  state.dailyStats.security = Math.round(((state.dailyStats.security ?? 0) + repairs) * 100) / 100;

  // Injuries fall on guards first, then bystanders.
  const casualties = [];
  const pool = [...guards, ...state.citizens.filter((c) => c.alive && c.ageStage === "adult" && c.role !== "minister")];
  const hurt = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < hurt && pool.length; i++) {
    const victim = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    victim.health = Math.max(0, (victim.health ?? 20) - (8 + Math.floor(rng() * 8)));
    victim.needs.safety = Math.max(0, (victim.needs?.safety ?? 70) - 25);
    casualties.push(victim);
    if (victim.health <= 0) {
      victim.alive = false;
      victim.status = "deceased";
      handleInheritance(state, victim);
      recordGrave(state, victim, "fell defending the town");
    }
  }
  state.security.unrest = Math.min(100, (state.security.unrest ?? 0) + 8);
  const dead = casualties.filter((c) => !c.alive);
  out.lines.push(
    `§c🛡️ RAID! Bandits overran the watch (defense ${power} vs raid ${raidPower}) — loot ₹${loot}, granary −${granary}, repairs ₹${repairs}.` +
    (casualties.length ? ` Wounded: ${casualties.map((c) => c.fullName).join(", ")}.` : "") +
    (dead.length ? ` §4Fallen: ${dead.map((c) => c.fullName).join(", ")}.` : "")
  );
  ledgerWar(state, "raid-lost", { loot, granary, repairs, dead: dead.length });
  return out;
}

function recordGrave(state, victim, epitaph) {
  state.graveyard.push(`${victim.fullName} — ${epitaph} (Day ${state.day})`);
  if (state.graveyard.length > 20) state.graveyard.shift();
}
