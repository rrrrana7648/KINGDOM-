/**
 * auction.js — the royal auction house (M13, §37.29).
 *
 * Seized estates, smuggled contraband and fenced silver go under the
 * hammer: one lot a dawn, sold to the gentry for treasury coin. The
 * Auction House lifts every hammer price half again; without it, lots
 * move at country prices through a crier.
 */
import { LEDGER_CAP } from "../core/state.js";

export function hasHouse(state) {
  return (state.buildings ?? []).some((b) => b.buildingId === "auction_house");
}

/** Consigns a lot to the block. */
export function consign(state, desc, value) {
  value = Math.round(value * 100) / 100;
  if (!(value > 0)) return null;
  const lot = { id: `a-${state.nextLotId++}`, desc, value, day: state.day };
  state.auction.lots.push(lot);
  return lot;
}

/** Daily tick: the hammer falls on one lot. */
export function tickAuction(state, rng = Math.random) {
  const out = { lines: [] };
  const lot = (state.auction?.lots ?? [])[0];
  if (!lot) return out;
  state.auction.lots.shift();
  const mult = hasHouse(state) ? 1.5 : 1.0;
  const jitter = 0.9 + rng() * 0.3;
  const hammer = Math.max(1, Math.round(lot.value * mult * jitter * 100) / 100);
  state.treasury = Math.round((state.treasury + hammer) * 100) / 100;
  state.auction.history.push({ day: state.day, desc: lot.desc, hammer });
  if (state.auction.history.length > 10) state.auction.history.shift();
  out.lines.push(`§e🔨 SOLD! ${lot.desc} — ₹${hammer} to the ${hasHouse(state) ? "gentry" : "country crowd"}.`);
  state.ledger.push({ day: state.day, type: "auction", what: "sold", desc: lot.desc, hammer });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
  return out;
}
