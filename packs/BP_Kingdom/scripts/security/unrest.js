/**
 * unrest.js — petitions, protests, riots & rebellion (M9, design §35.14).
 *
 * The unrest meter (0–100) breathes with the colony's grievances: crushing
 * taxes, empty bellies, homelessness, musters and failed justice push it up;
 * festivals, feasts, fair trials and full employment bleed it off. Crossing
 * thresholds fires the chain — petitions first (a warning the wise heed),
 * then strikes, riots and, at the brink, open rebellion that only the
 * garrison can put down.
 */
import { LEDGER_CAP } from "../core/state.js";

export function unrestLevel(unrest) {
  if (unrest >= 95) return "rebellion";
  if (unrest >= 80) return "riot";
  if (unrest >= 60) return "protest";
  if (unrest >= 40) return "petition";
  return "calm";
}

/**
 * Daily unrest drift + threshold events.
 * @returns {{lines:string[]}}
 */
export function tickUnrest(state, rng = Math.random) {
  const out = { lines: [] };
  const sec = state.security;
  const adults = state.citizens.filter((c) => c.alive && c.ageStage === "adult");
  if (!adults.length) {
    sec.unrest = 0;
    return out;
  }

  let delta = 0;
  const taxBite = ((state.tax?.incomePct ?? 10) + (state.tax?.salesPct ?? 8)) / 100;
  if (taxBite > 0.3) delta += 4;
  else if (taxBite > 0.2) delta += 2;
  else if (taxBite < 0.1) delta -= 2;
  if (state.foodStock < adults.length * 2) delta += 5;
  else if (state.foodStock > adults.length * 8) delta -= 1;
  if ((state.houses ?? []).length > 0) {
    const homeless = adults.filter((c) => !c.home).length / adults.length;
    delta += homeless * 6;
  }
  const mood = adults.reduce((s, c) => s + (c.mood ?? 70), 0) / adults.length;
  if (mood < 40) delta += 3;
  else if (mood > 75) delta -= 2;
  if (state.festivalDay === state.day) delta -= 6;
  const militia = sec.militia && state.day <= sec.militia.untilDay;
  if (militia) delta += 1;
  if ((state.security.cases ?? []).filter((k) => k.status === "trial").length >= 3) delta += 1; // clogged courts

  sec.unrest = Math.max(0, Math.min(100, Math.round(((sec.unrest ?? 0) + delta) * 10) / 10));
  const level = unrestLevel(sec.unrest);

  if (level === "petition" && rng() < 0.5) {
    out.lines.push("§e📢 A petition circulates the market — lower taxes, fuller bins. The wise heed paper before torches.");
  } else if (level === "protest") {
    state.strikeDays = Math.max(state.strikeDays ?? 0, 1);
    out.lines.push("§6✊ PROTEST! Laborers down tools for the day — the market falls silent. Meet their grievances.");
    ledgerUnrest(state, "protest", { unrest: sec.unrest });
  } else if (level === "riot") {
    const damage = 20 + Math.floor(rng() * 40);
    state.treasury = Math.max(0, Math.round((state.treasury - damage) * 100) / 100);
    for (const c of adults) {
      if (rng() < 0.3) {
        c.health = Math.max(1, (c.health ?? 20) - 5);
        c.mood = Math.max(5, (c.mood ?? 70) - 6);
      }
    }
    sec.unrest = Math.max(60, sec.unrest - 15); // the riot vents the pressure
    out.lines.push(`§c🔥 RIOT! Windows shatter and stalls burn — ₹${damage} in damage, bruises everywhere. The Guard restores a sullen order.`);
    ledgerUnrest(state, "riot", { damage });
  } else if (level === "rebellion") {
    // Open rebellion: the garrison decides the dawn.
    const guards = state.citizens.filter(
      (c) => c.alive && c.ageStage === "adult" && (c.profession === "guard" || c.profession === "soldier")
    ).length;
    const rebels = Math.max(2, Math.floor(adults.length / 3));
    if (guards * 2 >= rebels) {
      sec.unrest = 60;
      const cost = 30 + rebels * 5;
      state.treasury = Math.max(0, Math.round((state.treasury - cost) * 100) / 100);
      out.lines.push(`§c⚔️ REBELLION crushed — the garrison holds the square (₹${cost} in damages and pardons). Rule gently, or it will rise again.`);
      ledgerUnrest(state, "rebellion-crushed", { cost });
    } else {
      sec.unrest = 70;
      const loot = Math.floor(state.treasury * 0.25);
      state.treasury = Math.round((state.treasury - loot) * 100) / 100;
      state.ministerStrikes = (state.ministerStrikes ?? 0) + 1;
      out.lines.push(`§4⚔️ REBELLION unbound! The mob sacks the treasury (₹${loot}) and the Minister's head is demanded. Buy peace: festivals, feasts, reform.`);
      ledgerUnrest(state, "rebellion-loot", { loot });
    }
  }
  return out;
}

function ledgerUnrest(state, what, detail) {
  state.ledger.push({ day: state.day, type: "unrest", what, ...detail });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
}
