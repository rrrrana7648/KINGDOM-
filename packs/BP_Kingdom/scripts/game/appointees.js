/**
 * appointees.js — appointed NPC officers (M13, design §4).
 *
 * Below the Minister, seven desks run the colony: Foreman (scaffolds),
 * Mine Overseer (stone), Farm Master (bread), Chief Buyer (stall floats),
 * Warehouse Keeper (shrinkage), Guard Captain (+constable), Banker
 * (interest rebate). Appoint living adults; their desks pay every dawn.
 * (These are NPC postings — co-op player writs live in net/roles.js.)
 */
import { LEDGER_CAP } from "../core/state.js";

export const DESKS = {
  foreman: { name: "Foreman", icon: "🏗️", writ: "+1 labor on every active site" },
  overseer: { name: "Mine Overseer", icon: "⛏️", writ: "+3 stone to the warehouse" },
  farmMaster: { name: "Farm Master", icon: "🌾", writ: "+6 rations (needs a farm zone)" },
  chiefBuyer: { name: "Chief Buyer", icon: "🛒", writ: "+₹5 float to every open stall" },
  warehouseKeeper: { name: "Warehouse Keeper", icon: "📦", writ: "+₹2 recovered per open stall" },
  guardCaptain: { name: "Guard Captain", icon: "⚔️", writ: "+1 constable power" },
  banker: { name: "Banker", icon: "🏦", writ: "20% rebate on Crown interest" },
};

/** Appoints (or recalls with null) a desk holder. */
export function appoint(state, desk, citizenId) {
  if (!DESKS[desk]) return { ok: false, reason: "No such desk." };
  if (citizenId === null) {
    state.appointees[desk] = null;
    return { ok: true, recalled: true };
  }
  const c = state.citizens.find((x) => x.id === citizenId && x.alive && x.ageStage === "adult");
  if (!c) return { ok: false, reason: "Only living adults hold desks." };
  if (c.role === "minister") return { ok: false, reason: "The Minister holds every desk already." };
  if (c.status === "prisoner" || c.fugitive) return { ok: false, reason: "The Crown appoints no felons." };
  state.appointees[desk] = citizenId;
  return { ok: true };
}

export function holder(state, desk) {
  const id = state.appointees?.[desk];
  if (!id) return null;
  const c = state.citizens.find((x) => x.id === id && x.alive);
  if (!c) {
    state.appointees[desk] = null; // the desk mourns and empties
    return null;
  }
  return c;
}

/**
 * Daily tick: every held desk pays its writ.
 * @param {{crownInterest?:number}} bank yesterday's bank tick (for rebates)
 * @returns {{lines:string[]}}
 */
export function tickAppointees(state, bank = {}) {
  const out = { lines: [] };
  const A = state.appointees ?? {};

  if (A.foreman && holder(state, "foreman")) {
    let pushed = 0;
    for (const s of state.sites ?? []) {
      if (s.status === "active") {
        s.laborDone = (s.laborDone ?? 0) + 1;
        pushed++;
      }
    }
    if (pushed > 0) out.lines.push(`§7🏗️ The Foreman drives ${pushed} site${pushed > 1 ? "s" : ""} (+1 labor each).`);
  }
  if (A.overseer && holder(state, "overseer")) {
    state.stockpile["minecraft:cobblestone"] = (state.stockpile["minecraft:cobblestone"] ?? 0) + 3;
    state.dayProduction["minecraft:cobblestone"] = (state.dayProduction["minecraft:cobblestone"] ?? 0) + 3;
    out.lines.push("§7⛏️ The Overseer's tally: +3 stone to the warehouse.");
  }
  if (A.farmMaster && holder(state, "farmMaster") && state.zones?.farm) {
    state.foodStock += 6;
    out.lines.push("§7🌾 The Farm Master reports full bins: +6 rations.");
  }
  if (A.chiefBuyer && holder(state, "chiefBuyer")) {
    let topped = 0;
    for (const b of state.buyers ?? []) {
      if (!b.active) continue;
      b.float = Math.min(b.maxFloat ?? 60, Math.round(((b.float ?? 0) + 5) * 100) / 100);
      topped++;
    }
    if (topped > 0) out.lines.push(`§7🛒 The Chief Buyer tops ${topped} stall float${topped > 1 ? "s" : ""} (+₹5 each).`);
  }
  if (A.warehouseKeeper && holder(state, "warehouseKeeper")) {
    const stalls = (state.buyers ?? []).filter((b) => b.active).length;
    const found = stalls * 2;
    if (found > 0) {
      state.treasury = Math.round((state.treasury + found) * 100) / 100;
      out.lines.push(`§7📦 The Keeper finds ₹${found} in shrinkage savings.`);
    }
  }
  if (A.guardCaptain && holder(state, "guardCaptain")) {
    out.lines.push("§7⚔️ The Guard Captain walks the rounds — the watch stands taller (+1 constable).");
  }
  if (A.banker && holder(state, "banker") && (bank.crownInterest ?? 0) > 0) {
    const rebate = Math.round(bank.crownInterest * 0.2 * 100) / 100;
    state.treasury = Math.round((state.treasury + rebate) * 100) / 100;
    out.lines.push(`§7🏦 The Banker haggles the foreign lenders: ₹${rebate} interest rebated.`);
  }
  const held = Object.keys(DESKS).filter((d) => holder(state, d)).length;
  if (held > 0) {
    state.ledger.push({ day: state.day, type: "desks", what: "tick", held });
    if (state.ledger.length > LEDGER_CAP) {
      state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
    }
  }
  return out;
}
