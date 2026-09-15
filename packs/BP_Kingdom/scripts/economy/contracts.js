/**
 * contracts.js — government supply contracts (M13, §37.34).
 *
 * "Supply 500 bricks to the Crown." Contractors — crown crews and hungry
 * freelancers alike — haul the goods; the warehouse releases them against
 * the contract, and the treasury pays on completion. Lapsed contracts
 * return to the board with a shrug.
 */
import { LEDGER_CAP } from "../core/state.js";

export const CONTRACT_OFFERS = [
  { item: "minecraft:cobblestone", qty: 64, payout: 40, days: 7 },
  { item: "minecraft:oak_log", qty: 64, payout: 48, days: 7 },
  { item: "minecraft:wheat", qty: 48, payout: 60, days: 5 },
  { item: "minecraft:iron_ingot", qty: 16, payout: 90, days: 10 },
  { item: "minecraft:coal", qty: 32, payout: 55, days: 7 },
];

/** Posts a supply contract on the board. */
export function postContract(state, offerIndex) {
  const offer = CONTRACT_OFFERS[offerIndex];
  if (!offer) return { ok: false, reason: "No such commission." };
  const open = (state.contracts ?? []).filter((c) => c.status === "open").length;
  if (open >= 3) return { ok: false, reason: "The board holds three already." };
  const contract = {
    id: `n-${state.nextContractId++}`,
    item: offer.item, qty: offer.qty, progress: 0,
    payout: offer.payout, day: state.day, expiryDay: state.day + offer.days,
    status: "open", by: null,
  };
  state.contracts.push(contract);
  return { ok: true, contract };
}

/** A citizen takes up a contract. */
export function takeContract(state, contractId, citizenId) {
  const c = (state.contracts ?? []).find((x) => x.id === contractId && x.status === "open");
  if (!c) return { ok: false, reason: "That commission is gone." };
  if (c.by) return { ok: false, reason: "Already taken." };
  const worker = state.citizens.find((x) => x.id === citizenId && x.alive && x.ageStage === "adult");
  if (!worker) return { ok: false, reason: "Only living adults contract." };
  c.by = citizenId;
  return { ok: true };
}

/**
 * Daily tick: contractors deliver from production; warehouse fills the rest.
 * Contractor pace scales with level; the Crown pays on completion.
 */
export function tickContracts(state) {
  const out = { lines: [] };
  for (const c of state.contracts ?? []) {
    if (c.status !== "open") continue;
    if (state.day > c.expiryDay) {
      c.status = "lapsed";
      out.lines.push(`§7📋 Contract ${c.id} (${short(c.item)} ×${c.qty}) lapsed unfilled.`);
      continue;
    }
    // Contractor's yesterday: pace from skill.
    if (c.by) {
      const worker = state.citizens.find((x) => x.id === c.by && x.alive);
      if (worker) {
        const pace = 2 + (worker.level ?? 1) * 2;
        c.progress += pace;
        worker.xp += pace;
      }
    }
    // The warehouse releases stock against the contract.
    const want = c.qty - c.progress;
    const have = Math.min(want, state.stockpile[c.item] ?? 0);
    if (have > 0) {
      state.stockpile[c.item] -= have;
      c.progress += have;
    }
    if (c.progress >= c.qty) {
      c.status = "done";
      state.treasury = Math.round((state.treasury - c.payout) * 100) / 100;
      state.dailyStats.construction = Math.round(((state.dailyStats.construction ?? 0) + c.payout) * 100) / 100;
      // The goods conceptually enter Crown works; the contractor earns pride + pay share.
      const worker = state.citizens.find((x) => x.id === c.by && x.alive);
      if (worker) {
        const share = Math.round(c.payout * 0.4 * 100) / 100;
        worker.savings = Math.round(((worker.savings ?? 0) + share) * 100) / 100;
        worker.mood = Math.min(100, (worker.mood ?? 70) + 5);
        worker.xp += 25;
      }
      out.lines.push(`§a📋 Contract ${c.id} fulfilled — ${short(c.item)} ×${c.qty} to the Crown works (₹${c.payout}).`);
      ledgerContract(state, "done", { id: c.id, payout: c.payout });
    }
  }
  return out;
}

function short(id) {
  return String(id).replace("minecraft:", "").replaceAll("_", " ");
}

function ledgerContract(state, what, detail) {
  state.ledger.push({ day: state.day, type: "contract", what, ...detail });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
}
