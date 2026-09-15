/**
 * courts.js — the Magistrate's court, sentences & the prison gang (M9, §10).
 *
 * Trial-ready cases are judged by the King (or the Magistrate-officer in
 * co-op): fine, prison with hard labor, banishment, or acquittal. The laws
 * editor sets the tariff per crime; repeat convicts (strikes ≥ banishAfter)
 * draw banishment advice. Prisoners break cobble on the road gang (abstract
 * yield), eat Crown bread and count the dawns; the banished forfeit their
 * estate to the Crown and walk beyond the border stones.
 */
import { LEDGER_CAP } from "../core/state.js";
import { handleInheritance } from "../social/housing.js";

export { trialReady } from "./crime.js";

function ledgerCourt(state, what, detail) {
  state.ledger.push({ day: state.day, type: "court", what, ...detail });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
}

/** Suggested sentence from the laws tariff. */
export function adviseSentence(state, kase) {
  const laws = state.security.laws;
  const tariff = laws[kase.type] ?? laws.theft;
  const suspect = state.citizens.find((c) => c.id === kase.suspectId);
  const strikes = suspect?.strikes ?? 0;
  return {
    fine: tariff.fine,
    prison: tariff.prison,
    banish: strikes >= (laws.banishAfter ?? 3),
    strikes,
  };
}

/**
 * Passes sentence. Verdicts: fine | prison | banish | acquit.
 * @returns {{ok:boolean,line?:string,reason?:string}}
 */
export function sentence(state, caseId, verdict, opts = {}) {
  const kase = (state.security.cases ?? []).find((k) => k.id === caseId && k.status === "trial");
  if (!kase) return { ok: false, reason: "Case not found on the docket." };
  const suspect = state.citizens.find((c) => c.id === kase.suspectId && c.alive);
  const advice = adviseSentence(state, kase);
  kase.status = "closed";
  kase.verdict = verdict;

  if (verdict === "acquit" || !suspect) {
    if (suspect) {
      suspect.mood = Math.min(100, (suspect.mood ?? 70) + 6);
      if (kase.evidence >= 85) {
        // A blatant acquittal stinks of favor — the streets notice.
        state.security.unrest = Math.min(100, (state.security.unrest ?? 0) + 4);
      }
    }
    ledgerCourt(state, "acquit", { suspect: kase.suspect });
    return { ok: true, line: `§7⚖️ ${kase.suspect} is acquitted of ${kase.name}.` };
  }

  suspect.strikes = (suspect.strikes ?? 0) + 1;

  if (verdict === "fine") {
    const amount = Math.round((opts.amount ?? advice.fine) * 100) / 100;
    const paid = Math.min(amount, Math.max(0, suspect.savings ?? 0));
    suspect.savings = Math.round(((suspect.savings ?? 0) - paid) * 100) / 100;
    state.treasury = Math.round((state.treasury + paid) * 100) / 100;
    state.dailyStats.fines = Math.round(((state.dailyStats.fines ?? 0) + paid) * 100) / 100;
    suspect.mood = Math.max(5, (suspect.mood ?? 70) - 6);
    colonyJustice(state, 1);
    ledgerCourt(state, "fine", { suspect: suspect.fullName, paid, crime: kase.name });
    return { ok: true, line: `§6⚖️ ${suspect.fullName} is fined ₹${paid} for ${kase.name}.` };
  }

  if (verdict === "prison") {
    const days = Math.max(1, Math.round(opts.days ?? advice.prison));
    suspect.status = "prisoner";
    suspect.mode = "living";
    suspect.assignedSite = null;
    state.security.prisoners.push({ citizenId: suspect.id, daysLeft: days, crime: kase.name });
    suspect.mood = Math.max(5, (suspect.mood ?? 70) - 12);
    colonyJustice(state, 1);
    ledgerCourt(state, "prison", { suspect: suspect.fullName, days, crime: kase.name });
    return { ok: true, line: `§6⚖️ ${suspect.fullName} is sentenced to ${days} days' hard labor for ${kase.name}.` };
  }

  if (verdict === "banish") {
    // The estate forfeits to the Crown (no heir — lawful seizure, logged).
    const savings = Math.round((suspect.savings ?? 0) * 100) / 100;
    if (savings > 0) state.treasury = Math.round((state.treasury + savings) * 100) / 100;
    suspect.savings = 0;
    for (const h of state.houses ?? []) {
      h.residents = h.residents.filter((id) => id !== suspect.id);
      if (h.ownerId === suspect.id) h.ownerId = null;
    }
    if (suspect.spouse) {
      const widow = state.citizens.find((c) => c.id === suspect.spouse && c.alive);
      if (widow) {
        widow.spouse = null;
        widow.mood = Math.max(5, (widow.mood ?? 70) - 10);
      }
    }
    suspect.alive = false;
    suspect.status = "banished";
    suspect.fugitive = false;
    state.security.fugitives = (state.security.fugitives ?? []).filter((id) => id !== suspect.id);
    state.security.bounties = (state.security.bounties ?? []).filter((b) => b.citizenId !== suspect.id);
    colonyJustice(state, 2);
    ledgerCourt(state, "banish", { suspect: suspect.fullName, seized: savings, crime: kase.name });
    return { ok: true, line: `§c⚖️ ${suspect.fullName} is banished beyond the border stones for ${kase.name} (₹${savings} seized).` };
  }

  return { ok: false, reason: "Unknown verdict." };
}

/** Swift fair justice steadies the streets a touch. */
function colonyJustice(state, points) {
  state.security.unrest = Math.max(0, (state.security.unrest ?? 0) - points);
}

/**
 * Daily prison tick: road-gang yield, upkeep, releases.
 * @returns {{lines:string[],released:string[]}}
 */
export function tickPrison(state) {
  const out = { lines: [], released: [] };
  const kept = [];
  for (const p of state.security.prisoners ?? []) {
    const inmate = state.citizens.find((c) => c.id === p.citizenId && c.alive);
    if (!inmate) continue;
    // The road gang breaks stone; the Crown feeds the gang.
    state.stockpile["minecraft:cobblestone"] = (state.stockpile["minecraft:cobblestone"] ?? 0) + 2;
    state.dayProduction["minecraft:cobblestone"] = (state.dayProduction["minecraft:cobblestone"] ?? 0) + 2;
    const upkeep = 1;
    if (state.treasury >= upkeep) {
      state.treasury = Math.round((state.treasury - upkeep) * 100) / 100;
      state.dailyStats.security = Math.round(((state.dailyStats.security ?? 0) + upkeep) * 100) / 100;
    }
    p.daysLeft--;
    if (p.daysLeft <= 0) {
      inmate.status = "working";
      inmate.mood = Math.min(100, (inmate.mood ?? 70) + 8);
      out.released.push(inmate.fullName);
      ledgerCourt(state, "release", { suspect: inmate.fullName });
    } else {
      kept.push(p);
    }
  }
  state.security.prisoners = kept;
  if (out.released.length) {
    out.lines.push(`§a⛓ ${out.released.join(", ")} ${out.released.length > 1 ? "have" : "has"} served their time and walk free.`);
  }
  return out;
}

export { handleInheritance };
