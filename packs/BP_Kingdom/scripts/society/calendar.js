/**
 * calendar.js — festival calendar, sabbaths & high days (M13, §37.95, §36).
 *
 * The Crown edits the rhythm of the year: weekly sabbath rest, a monthly
 * feast day, Empire Day parades (Spring 1), harvest-home (Autumn 1) and
 * winter fireworks (Winter 1). Rest days idle the shifts like festivals
 * (without the feast bill); high days pay in mood, prestige and bread.
 */
import { LEDGER_CAP } from "../core/state.js";

/** True when today is a sabbath rest day (schedule reads this). */
export function isRestDay(state) {
  const cal = state.calendar ?? {};
  return !!(cal.sabbathOn && state.day % Math.max(1, cal.sabbathEvery ?? 7) === 0);
}

/**
 * Daily calendar tick: feasts, sabbaths, high days.
 * @returns {{lines:string[],rest:boolean}}
 */
export function tickCalendar(state) {
  const out = { lines: [], rest: false };
  const cal = state.calendar ?? {};
  const cl = state.climate ?? {};
  const alive = state.citizens.filter((c) => c.alive);

  if (isRestDay(state)) {
    out.rest = true;
    for (const c of alive) c.mood = Math.min(100, (c.mood ?? 70) + 2);
    out.lines.push("§d🕯️ Sabbath rest — the shifts lie idle, the chapel bell counts the hours.");
  }

  // Monthly feast: bread willing, joy certain.
  if ((cl.seasonDay ?? 0) === (cal.feastDay ?? 5)) {
    const cost = alive.length;
    if (state.foodStock >= cost) {
      state.foodStock -= cost;
      for (const c of alive) c.mood = Math.min(100, (c.mood ?? 70) + 4);
      out.lines.push(`§d🍰 Feast day! Sweetmeats all round (${cost} rations).`);
    } else {
      out.lines.push("§7🍰 Feast day — but the granary is bare; the cooks weep into empty pots.");
    }
  }

  // High days of the turning year.
  if (cal.empireDay && cl.season === "Spring" && cl.seasonDay === 1) {
    for (const c of alive) c.mood = Math.min(100, (c.mood ?? 70) + 6);
    state.security.unrest = Math.max(0, (state.security.unrest ?? 0) - 5);
    out.lines.push("§6🎖️ EMPIRE DAY! Parade, medals, bunting — the realm remembers why it kneels.");
    ledgerCal(state, "empire-day", {});
  }
  if (cal.harvestHome && cl.season === "Autumn" && cl.seasonDay === 1) {
    const bonus = (state.zones?.farm ? 15 : 5);
    state.foodStock += bonus;
    for (const c of alive) c.mood = Math.min(100, (c.mood ?? 70) + 4);
    out.lines.push(`§e🌾 Harvest-home! Sheaves blessed, +${bonus} rations to the granary.`);
    ledgerCal(state, "harvest-home", { bonus });
  }
  if (cal.fireworks && cl.season === "Winter" && cl.seasonDay === 1) {
    for (const c of alive) c.mood = Math.min(100, (c.mood ?? 70) + 5);
    out.lines.push("§b🎆 Winter fireworks crack the frost — the town gasps as one.");
    ledgerCal(state, "fireworks", {});
  }
  return out;
}

function ledgerCal(state, what, detail) {
  state.ledger.push({ day: state.day, type: "calendar", what, ...detail });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
}
