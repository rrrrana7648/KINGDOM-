/**
 * bonds.js — treasury bonds & coupons (M13, §37.24).
 *
 * The Crown borrows from its own people: wealthy citizens buy ₹50 bonds,
 * and every tenth dawn the treasury pays 5% coupons. Patriotic coin —
 * default is unthinkable (and unthinkingly punished by unrest).
 */
import { LEDGER_CAP } from "../core/state.js";

export const BOND_FACE = 50;
export const BOND_RATE = 0.05;

/** The Crown offers bonds; the wealthy subscribe. */
export function issueBonds(state, count) {
  count = Math.max(1, Math.min(10, Math.round(count)));
  const buyers = state.citizens.filter((c) => c.alive && c.ageStage === "adult" && (c.savings ?? 0) >= BOND_FACE);
  if (!buyers.length) return { ok: false, reason: "No citizen holds ₹50 to lend the Crown." };
  let sold = 0;
  for (const b of buyers.slice(0, count)) {
    b.savings = Math.round((b.savings - BOND_FACE) * 100) / 100;
    state.treasury = Math.round((state.treasury + BOND_FACE) * 100) / 100;
    state.bonds.push({ id: `o-${state.nextBondId++}`, holderId: b.id, holder: b.fullName, principal: BOND_FACE, day: state.day, couponDay: state.day + 10, rate: BOND_RATE });
    sold++;
  }
  ledgerBond(state, "issue", { sold, raised: sold * BOND_FACE });
  return { ok: true, sold, raised: sold * BOND_FACE };
}

/** Daily tick: coupon day every 10 days per bond. */
export function tickBonds(state) {
  const out = { lines: [] };
  let paid = 0;
  for (const b of state.bonds ?? []) {
    if (state.day < b.couponDay) continue;
    const coupon = Math.round(b.principal * b.rate * 100) / 100;
    const holder = state.citizens.find((c) => c.id === b.holderId && c.alive);
    if (state.treasury >= coupon) {
      state.treasury = Math.round((state.treasury - coupon) * 100) / 100;
      if (holder) {
        holder.savings = Math.round(((holder.savings ?? 0) + coupon) * 100) / 100;
        holder.mood = Math.min(100, (holder.mood ?? 70) + 2);
      }
      paid += coupon;
    } else if (holder) {
      holder.mood = Math.max(5, (holder.mood ?? 70) - 8);
      state.security.unrest = Math.min(100, (state.security.unrest ?? 0) + 2);
      out.lines.push(`§c📜 The Crown MISSES ${holder.fullName}'s coupon! Trust curdles.`);
      ledgerBond(state, "miss", { holder: holder.fullName });
    }
    b.couponDay += 10;
  }
  if (paid > 0) {
    state.dailyStats.interest = Math.round(((state.dailyStats.interest ?? 0) + paid) * 100) / 100;
    out.lines.push(`§7📜 Coupon day: ₹${paid} to the kingdom's creditors.`);
  }
  return out;
}

/** A holder redeems at face (early, no final coupon). */
export function redeemBond(state, bondId) {
  const i = (state.bonds ?? []).findIndex((b) => b.id === bondId);
  if (i < 0) return { ok: false, reason: "No such bond." };
  const [b] = state.bonds.splice(i, 1);
  if (state.treasury < b.principal) {
    state.bonds.splice(i, 0, b);
    return { ok: false, reason: "The treasury cannot redeem today." };
  }
  state.treasury = Math.round((state.treasury - b.principal) * 100) / 100;
  const holder = state.citizens.find((c) => c.id === b.holderId && c.alive);
  if (holder) holder.savings = Math.round(((holder.savings ?? 0) + b.principal) * 100) / 100;
  return { ok: true };
}

function ledgerBond(state, what, detail) {
  state.ledger.push({ day: state.day, type: "bond", what, ...detail });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
}
