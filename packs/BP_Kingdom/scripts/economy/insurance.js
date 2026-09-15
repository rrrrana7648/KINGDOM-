/**
 * insurance.js — fire & marine underwriting (M13, §36).
 *
 * The Insurance Office sells calm by the dawn: fire cover (₹3/day) pays
 * ₹150 when the tenements burn; marine cover (₹5/day, needs a harbor)
 * pays ₹120 when pirates or storms take the trade. Premiums lapse the
 * moment the office closes or the policies are dropped.
 */
import { LEDGER_CAP } from "../core/state.js";

export const FIRE_PREMIUM = 3;
export const FIRE_PAYOUT = 150;
export const MARINE_PREMIUM = 5;
export const MARINE_PAYOUT = 120;

export function hasOffice(state) {
  return (state.buildings ?? []).some((b) => b.buildingId === "insurance_office");
}

/** Buys or drops a policy. */
export function setPolicy(state, kind, on) {
  if (!hasOffice(state)) return { ok: false, reason: "Build an Insurance Office first." };
  if (kind === "marine" && (state.harbor?.level ?? 0) < 1) {
    return { ok: false, reason: "Marine cover needs a working harbor." };
  }
  if (!["fire", "marine"].includes(kind)) return { ok: false, reason: "No such policy." };
  state.insurance[kind] = !!on;
  return { ok: true };
}

/** Daily tick: premiums drip from the treasury. */
export function tickInsurance(state) {
  const out = { lines: [] };
  if (!hasOffice(state)) {
    state.insurance.fire = false;
    state.insurance.marine = false;
    return out;
  }
  let due = 0;
  const stationed = (state.buildings ?? []).some((b) => b.buildingId === "fire_station");
  if (state.insurance.fire) due += Math.max(1, FIRE_PREMIUM - (stationed ? 1 : 0));
  if (state.insurance.marine) due += MARINE_PREMIUM;
  if (due > 0 && state.insurance.paidDay !== state.day) {
    state.insurance.paidDay = state.day;
    state.treasury = Math.round((state.treasury - due) * 100) / 100;
    state.dailyStats.welfare = Math.round(((state.dailyStats.welfare ?? 0) + due) * 100) / 100;
  }
  return out;
}

/**
 * Files a claim after a disaster. Events call this; it pays if covered.
 * @returns {{paid:number}}
 */
export function claim(state, kind) {
  if (!state.insurance?.[kind]) return { paid: 0 };
  const paid = kind === "fire" ? FIRE_PAYOUT : MARINE_PAYOUT;
  state.treasury = Math.round((state.treasury + paid) * 100) / 100;
  state.ledger.push({ day: state.day, type: "insurance", what: `claim-${kind}`, paid });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
  return { paid };
}
