/**
 * caravans.js — overland trade caravans (M13, §37.21, §35.12).
 *
 * Where no harbor reaches, camels and oxen do: load warehouse goods onto
 * a caravan and it plods over the hills for 4 days, selling high and
 * returning with coin, rumors and the occasional tall tale. Bandits love
 * a fat, unguarded train — security prices the risk.
 */
import { LEDGER_CAP } from "../core/state.js";
import { baseRate } from "./pricebook.js";

export function nextCaravanId(state) {
  return `v-${state.nextCaravanId++}`;
}

/**
 * Dispatches a caravan loaded from the warehouse.
 * @param {Record<string,number>} goods item id → qty
 */
export function sendCaravan(state, goods) {
  const entries = Object.entries(goods ?? {}).filter(([, n]) => n > 0);
  if (!entries.length) return { ok: false, reason: "Load something first." };
  for (const [item, n] of entries) {
    if ((state.stockpile[item] ?? 0) < n) {
      return { ok: false, reason: `Warehouse lacks ${n}× ${short(item)}.` };
    }
  }
  let value = 0;
  for (const [item, n] of entries) {
    state.stockpile[item] -= n;
    value += baseRate(item) * n;
  }
  value = Math.round(value * 100) / 100;
  const cost = Math.max(10, Math.round(value * 0.1 * 100) / 100);
  if (cost > state.treasury) {
    // Roll the load back — the camels wait.
    for (const [item, n] of entries) state.stockpile[item] += n;
    return { ok: false, reason: `Drovers demand ₹${cost} upfront.` };
  }
  state.treasury = Math.round((state.treasury - cost) * 100) / 100;
  state.dailyStats.trade = Math.round(((state.dailyStats.trade ?? 0) + cost) * 100) / 100;
  const caravan = {
    id: nextCaravanId(state),
    goods: Object.fromEntries(entries),
    value,
    cost,
    departDay: state.day,
    returnDay: state.day + 4,
  };
  state.caravans.push(caravan);
  ledgerTrade(state, "caravan-out", { id: caravan.id, value });
  return { ok: true, caravan };
}

/**
 * Daily caravan tick: homecomings with profit or banditry.
 * Margin 30–70%; insecure roads risk the whole train.
 */
export function tickCaravans(state, rng = Math.random) {
  const out = { lines: [] };
  const kept = [];
  for (const v of state.caravans ?? []) {
    if (state.day < v.returnDay) {
      kept.push(v);
      continue;
    }
    // Bandit risk falls with every constable on the roads.
    let guards = 0;
    for (const c of state.citizens) {
      if (c.alive && (c.profession === "guard" || c.profession === "soldier")) guards++;
    }
    const risk = Math.max(0.05, 0.35 - guards * 0.05 - (state.security?.unrest ?? 0) / 500);
    if (rng() < risk) {
      const lost = Math.round(v.value * 0.5 * 100) / 100;
      const salvaged = Math.round((v.value - lost) * 100) / 100;
      state.treasury = Math.round((state.treasury + salvaged) * 100) / 100;
      out.lines.push(`§c🐪 Caravan ${v.id} limps home — bandits took half (₹${lost})! Guards fatten the odds.`);
      ledgerTrade(state, "caravan-robbed", { id: v.id, lost });
    } else {
      const margin = 0.3 + rng() * 0.4;
      const proceeds = Math.round(v.value * (1 + margin) * 100) / 100;
      state.treasury = Math.round((state.treasury + proceeds) * 100) / 100;
      out.lines.push(`§a🐪 Caravan ${v.id} returns from over the hills: ₹${proceeds} (margin ${Math.round(margin * 100)}%) — and rumors for the coffee houses.`);
      ledgerTrade(state, "caravan-home", { id: v.id, proceeds });
      // Rumors sometimes harden into intelligence.
      if (rng() < 0.3 && (state.spies?.agents?.length ?? 0) > 0) {
        state.spies.intel.push({ day: state.day, text: "Caravan gossip: rival granaries bulge; their harvest must have been kind." });
      }
    }
  }
  state.caravans = kept;
  return out;
}

function short(id) {
  return String(id).replace("minecraft:", "").replaceAll("_", " ");
}

function ledgerTrade(state, what, detail) {
  state.ledger.push({ day: state.day, type: "caravan", what, ...detail });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
}
