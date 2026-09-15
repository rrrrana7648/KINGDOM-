/**
 * pawnshop.js — pawn microloans & the fence's shadow (M13, §37.36, §36).
 *
 * Policy "allow": broke citizens pawn tools for ₹8 and repay ₹10 within
 * 5 days (the shop needs its building). Policy "ban": no loans — but the
 * desperate still whisper to fences, and constables earn their keep.
 * Unlicensed fences may surface stolen goods at auction.
 */
import { LEDGER_CAP } from "../core/state.js";

export const PAWN_LOAN = 8;
export const PAWN_REPAY = 10;

export function hasShop(state) {
  return (state.buildings ?? []).some((b) => b.buildingId === "pawnshop");
}

/** Daily tick: new pawns, repayments, defaults, fences. */
export function tickPawn(state, rng = Math.random) {
  const out = { lines: [] };
  const shop = hasShop(state);
  const allowed = shop && (state.pawn?.policy ?? "allow") === "allow";

  // The broke pawn their tools.
  if (allowed) {
    const broke = state.citizens.filter((c) =>
      c.alive && c.ageStage === "adult" && (c.savings ?? 0) < 3 &&
      !(state.pawn.loans ?? []).some((l) => l.citizenId === c.id));
    for (const c of broke.slice(0, 2)) {
      if (state.treasury < PAWN_LOAN) break;
      state.treasury = Math.round((state.treasury - PAWN_LOAN) * 100) / 100;
      c.savings = Math.round(((c.savings ?? 0) + PAWN_LOAN) * 100) / 100;
      state.pawn.loans.push({ id: `p-${c.id}-${state.day}`, citizenId: c.id, principal: PAWN_LOAN, day: state.day, dueDay: state.day + 5 });
      out.lines.push(`§7🏷️ ${c.fullName.split(" ")[0]} pawns a tool for ₹${PAWN_LOAN} (₹${PAWN_REPAY} due in 5 days).`);
    }
  }

  // Repayments & defaults.
  const kept = [];
  for (const l of state.pawn?.loans ?? []) {
    const c = state.citizens.find((x) => x.id === l.citizenId && x.alive);
    if (!c) continue;
    if ((c.savings ?? 0) >= PAWN_REPAY) {
      c.savings = Math.round((c.savings - PAWN_REPAY) * 100) / 100;
      state.treasury = Math.round((state.treasury + PAWN_REPAY) * 100) / 100;
      ledgerPawn(state, "repay", { name: c.fullName });
    } else if (state.day > l.dueDay) {
      c.mood = Math.max(5, (c.mood ?? 70) - 5);
      c.toolTier = "none"; // the pledge is forfeit
      out.lines.push(`§7🏷️ ${c.fullName.split(" ")[0]} defaults — the pawned tool is forfeit.`);
      ledgerPawn(state, "default", { name: c.fullName });
    } else {
      kept.push(l);
    }
  }
  state.pawn.loans = kept;

  // Banned or shopless, fences still whisper (small chance, needs poverty).
  const poor = state.citizens.filter((c) => c.alive && c.ageStage === "adult" && (c.savings ?? 0) < 5).length;
  if (!allowed && poor >= 3 && rng() < 0.08) {
    state.auction.lots.push({ id: `a-${state.nextLotId++}`, desc: "fenced silver (no questions)", value: 25, day: state.day });
    out.lines.push("§8🏷️ A fence moves stolen silver toward the auction block… constables, note the faces.");
  }
  return out;
}

function ledgerPawn(state, what, detail) {
  state.ledger.push({ day: state.day, type: "pawn", what, ...detail });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
}
