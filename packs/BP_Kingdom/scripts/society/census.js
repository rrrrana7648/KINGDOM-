/**
 * census.js — the ten-day census, birthdays & pensions (M13, §36).
 *
 * Every tenth dawn the clerks count heads by trade and roof, lay birthday
 * feasts for those the lots favor, and pay the pensions of the retired —
 * masters who hung up their tools at 2000 xp and draw ₹3 a day to doze
 * in the sun they earned.
 */
import { LEDGER_CAP } from "../core/state.js";

const PENSION = 3;

/**
 * Daily census tick (the count itself fires every 10 days).
 * @returns {{lines:string[],census:boolean}}
 */
export function tickCensus(state) {
  const out = { lines: [], census: false };
  // Pensions pay every dawn.
  const pensioners = state.citizens.filter((c) => c.alive && c.retired);
  for (const p of pensioners) {
    if (state.treasury >= PENSION) {
      state.treasury = Math.round((state.treasury - PENSION) * 100) / 100;
      p.savings = Math.round(((p.savings ?? 0) + PENSION) * 100) / 100;
      state.dailyStats.welfare = Math.round(((state.dailyStats.welfare ?? 0) + PENSION) * 100) / 100;
    }
  }
  // Masters retire to the sun at 2000 xp.
  for (const c of state.citizens) {
    if (c.alive && c.ageStage === "adult" && !c.retired && (c.xp ?? 0) >= 2000 &&
        c.role !== "minister" && c.profession !== "buyer") {
      c.retired = true;
      c.mode = "living";
      out.lines.push(`§7👴 ${c.fullName} retires a master of the ${c.profession}s — pension ₹${PENSION}/day, first bench in the sun.`);
    }
  }
  if (state.day % 10 !== 0 || state.day === state.census.lastDay) return out;
  out.census = true;
  state.census.lastDay = state.day;
  const alive = state.citizens.filter((c) => c.alive);
  const trades = {};
  for (const c of alive) {
    if (c.ageStage !== "adult") continue;
    trades[c.profession] = (trades[c.profession] ?? 0) + 1;
  }
  const housed = alive.filter((c) => c.home).length;
  const top = Object.entries(trades).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([t, n]) => `${n} ${t}s`).join(", ");
  out.lines.push(`§7📋 CENSUS, day ${state.day}: ${alive.length} souls (${housed} housed) — ${top || "no trades yet"}.`);
  state.census.history.push({ day: state.day, souls: alive.length, housed });
  if (state.census.history.length > 12) state.census.history.shift();

  // Birthday lots: ~1 in 40 souls feasts.
  for (const c of alive) {
    const lot = (state.day * 7 + numericId(c.id)) % 40;
    if (lot !== 0) continue;
    if ((c.savings ?? 0) >= 5) {
      c.savings = Math.round((c.savings - 5) * 100) / 100;
      c.mood = Math.min(100, (c.mood ?? 70) + 8);
      out.lines.push(`§d🎂 Birthday feast for ${c.fullName}! Cake, cousins, and a year well begun.`);
      ledgerCensus(state, "birthday", { name: c.fullName });
    }
  }
  return out;
}

function numericId(id) {
  const n = parseInt(String(id ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function ledgerCensus(state, what, detail) {
  state.ledger.push({ day: state.day, type: "census", what, ...detail });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
}
