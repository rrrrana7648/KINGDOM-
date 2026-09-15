/**
 * tools.js — tool tiers, requisitions & the smiths' queue (M13, §32).
 *
 * Every trade wants edges: wood < stone < iron < diamond. Crown policy
 * forges and issues tools free (materials from the warehouse, wear and
 * tear from the world); freelancers buy their own at the canteen. Better
 * tiers hasten hands — and wrong tiers draw polite requisitions.
 */
import { LEDGER_CAP } from "../core/state.js";

export const TIERS = ["none", "wood", "stone", "iron", "diamond"];
export const TIER_MULT = { none: 1.0, wood: 1.05, stone: 1.15, iron: 1.3, diamond: 1.5 };
export const TIER_COST = {
  wood: { "minecraft:oak_log": 2 },
  stone: { "minecraft:cobblestone": 3, "minecraft:oak_log": 1 },
  iron: { "minecraft:iron_ingot": 3, "minecraft:oak_log": 1 },
  diamond: { "minecraft:diamond": 3, "minecraft:oak_log": 1 },
};
export const TIER_PRICE = { wood: 4, stone: 10, iron: 25, diamond: 80 }; // canteen prices

const TRADE_TIER = {
  woodcutter: "stone", forester: "stone", farmer: "wood", picker: "wood",
  builder: "iron", laborer: "stone", hauler: "wood", guard: "iron", soldier: "iron",
};

/** Recommended tier for a trade. */
export function wantTier(profession) {
  return TRADE_TIER[profession] ?? "wood";
}

/** Speed multiplier of a citizen's issued tier (jobs.js reads this). */
export function toolMult(state, record) {
  return TIER_MULT[record.toolTier] ?? 1.0;
}

/** Best stocked tier at or below the want (issue order). */
function bestStock(state, want) {
  const wi = TIERS.indexOf(want);
  for (let i = wi; i >= 1; i--) {
    if ((state.tools.stock[TIERS[i]] ?? 0) > 0) return TIERS[i];
  }
  return null;
}

/** Queues a forge order if materials exist (abstract smiths, 1 day each). */
export function orderTools(state, tier, qty) {
  if (!TIER_COST[tier]) return { ok: false, reason: "No such tier." };
  qty = Math.max(1, Math.min(10, Math.round(qty)));
  state.tools.queue.push({ tier, qty, day: state.day });
  return { ok: true };
}

/**
 * Daily tick: forge the queue, issue tiers, wear and requisitions.
 * @returns {{lines:string[]}}
 */
export function tickTools(state) {
  const out = { lines: [] };
  // The smiths forge one order a dawn.
  const order = (state.tools.queue ?? [])[0];
  if (order) {
    const cost = TIER_COST[order.tier];
    const afford = Object.entries(cost).every(([item, n]) => (state.stockpile[item] ?? 0) >= n * order.qty);
    if (afford) {
      for (const [item, n] of Object.entries(cost)) state.stockpile[item] -= n * order.qty;
      state.tools.stock[order.tier] = (state.tools.stock[order.tier] ?? 0) + order.qty;
      out.lines.push(`§7⚒️ The smiths deliver ${order.qty}× ${order.tier} tools.`);
      state.tools.queue.shift();
    }
  }

  // Issue & wear.
  const policy = state.tools.policy ?? "crown";
  let requisitioned = 0;
  for (const c of state.citizens) {
    if (!c.alive || c.ageStage !== "adult" || c.mode !== "living") continue;
    if (!TRADE_TIER[c.profession]) continue;
    const want = wantTier(c.profession);
    const have = TIERS.indexOf(c.toolTier ?? "none");
    if (have >= TIERS.indexOf(want)) continue;
    if (policy === "crown" || c.wageMode === "crown") {
      const issue = bestStock(state, want);
      if (issue) {
        state.tools.stock[issue]--;
        if (c.toolTier && c.toolTier !== "none") {
          state.tools.stock[c.toolTier] = (state.tools.stock[c.toolTier] ?? 0) + 1; // old edge returns
        }
        c.toolTier = issue;
      } else if (requisitioned < 3) {
        requisitioned++;
      }
    } else {
      // Freelancers buy their own at the canteen.
      const price = TIER_PRICE[want];
      if ((state.tools.stock[want] ?? 0) > 0 && (c.savings ?? 0) >= price) {
        state.tools.stock[want]--;
        c.savings = Math.round((c.savings - price) * 100) / 100;
        state.treasury = Math.round((state.treasury + price) * 100) / 100;
        c.toolTier = want;
      }
    }
  }
  if (requisitioned > 0) {
    // The Minister auto-orders one shortfall tier (materials permitting).
    for (const c of state.citizens) {
      if (!c.alive || c.ageStage !== "adult") continue;
      const want = TRADE_TIER[c.profession];
      if (want && TIERS.indexOf(c.toolTier ?? "none") < TIERS.indexOf(want)) {
        const cost = TIER_COST[want];
        if (Object.entries(cost).every(([item, n]) => (state.stockpile[item] ?? 0) >= n)) {
          state.tools.queue.push({ tier: want, qty: 1, day: state.day });
          out.lines.push(`§7⚒️ Requisition: ${want} tools for the ${c.profession}s (short of edges).`);
          break;
        }
      }
    }
  }

  // Wear: the busiest edges chip (deterministic-ish: 1 per 12 workers).
  const crew = state.citizens.filter((c) => c.alive && c.ageStage === "adult" && c.mode === "living" && c.toolTier && c.toolTier !== "none");
  const chips = Math.floor(crew.length / 12);
  for (let i = 0; i < chips; i++) {
    const victim = crew[(state.day + i) % crew.length];
    state.tools.stock[victim.toolTier] = Math.max(0, (state.tools.stock[victim.toolTier] ?? 0) - 0); // the edge snaps, not returns
    victim.toolTier = "none";
  }
  if (chips > 0) out.lines.push(`§7⚒️ ${chips} worn tool${chips > 1 ? "s snap" : " snaps"} — the smiths note the gaps.`);
  state.ledger.push({ day: state.day, type: "tools", what: "tick", queue: (state.tools.queue ?? []).length });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
  return out;
}
