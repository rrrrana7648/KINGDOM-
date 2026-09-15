/**
 * buyers.js — licensed commodity buyers (one stall per commodity), their
 * coin floats, daily quotas, the receiving/payment routine, the audit
 * ledger, and the dusk cart-runner consolidation into the Crown Warehouse
 * (design §6.1, §6.2).
 */
import { ItemStack } from "@minecraft/server";
import { COMMODITIES, categoryOf, gradeForLevel, isFoodCategory, unitPrice } from "./pricebook.js";
import { LEDGER_CAP } from "../core/state.js";

/** Creates the buyer stall record for a freshly hired clerk citizen. */
export function createBuyer(state, citizenId, clerkName, commodity, chest) {
  const def = COMMODITIES[commodity];
  const buyer = {
    id: `b-${state.nextBuyerId++}`,
    citizenId,
    commodity,
    clerkName,
    chest: { x: chest.x, y: chest.y, z: chest.z },
    band: 1.0, // 0.9 / 1.0 / 1.1 price band
    maxFloat: def.defaultFloat,
    quota: def.quota,
    active: true,
    float: 0,
    soldUnits: 0,
    stock: {},
    totalPaid: 0,
  };
  state.buyers.push(buyer);
  return buyer;
}

export function buyerForCommodity(state, commodity) {
  return state.buyers.find((b) => b.active && b.commodity === commodity);
}
export function buyerForCitizen(state, citizenId) {
  return state.buyers.find((b) => b.citizenId === citizenId && b.active);
}

function appendLedger(state, entry) {
  state.ledger.push({ day: state.day, ...entry });
  if (state.ledger.length > LEDGER_CAP) state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
}

function addStock(state, item, qty, cat) {
  if (qty <= 0) return;
  if (isFoodCategory(cat)) state.foodStock += qty;
  else state.stockpile[item] = (state.stockpile[item] ?? 0) + qty;
}

function containerAt(dim, loc) {
  if (!loc) return undefined;
  try {
    const block = dim.getBlock({ x: loc.x, y: loc.y, z: loc.z });
    return block?.getComponent("inventory")?.container;
  } catch {
    return undefined;
  }
}

/** Places items in a container; returns the quantity that actually fit. */
function physicallyPlace(container, item, qty) {
  if (!container) return qty; // no physical chest → all counted virtually
  let remaining = qty;
  while (remaining > 0) {
    const n = Math.min(64, remaining);
    const leftover = container.addItem(new ItemStack(item, n));
    if (!leftover) {
      remaining = 0;
    } else {
      remaining = leftover.amount;
      break; // full
    }
  }
  return qty - remaining;
}

/**
 * Sells one worker's carried goods.
 * @returns {{accepted:Object, rejected:Object, paid:number, xp:number}}
 *   rejected items stay in the worker's carry for the next trip.
 */
export function sellLoad(record, state, dim, load) {
  const accepted = {};
  const rejected = {};
  let paid = 0;
  let xpUnits = 0;
  const grade = gradeForLevel(record.level);
  const warehouseChest = state.zones.stockpileChest;
  const isFreelance = record.wageMode === "freelance";

  for (const [item, qty0] of Object.entries(load)) {
    let qty = qty0;
    const cat = categoryOf(item);
    const stall = cat ? buyerForCommodity(state, cat) : undefined;
    const crownWorker = record.wageMode === "crown";

    let take = qty;
    let price = 0;
    let destination = "warehouse";

    if (stall) {
      destination = "stall";
      const rate = unitPrice(item, grade, stall.band);
      if (isFreelance) {
        const quotaRoom = Math.max(0, stall.quota - stall.soldUnits);
        const floatRoom = rate > 0 ? Math.floor((stall.float + 1e-9) / rate) : 0;
        take = Math.max(0, Math.min(qty, quotaRoom, floatRoom));
        price = Math.round(take * rate * 100) / 100;
      }
    } else if (isFreelance) {
      // Central receiving counter pays straight from the treasury, no quota.
      const rate = unitPrice(item, grade, 1);
      const room = rate > 0 ? Math.floor((state.treasury + 1e-9) / rate) : qty;
      take = Math.max(0, Math.min(qty, room));
      price = Math.round(take * rate * 100) / 100;
    }

    if (take <= 0 && !crownWorker) {
      rejected[item] = qty;
      continue;
    }

    const chestLoc = stall ? stall.chest : warehouseChest;
    const container = containerAt(dim, chestLoc);
    let placed = physicallyPlace(container, item, take);

    // Salaried staff goods that don't fit a stall still count to the ledger.
    if (crownWorker && placed < take) {
      if (destination === "warehouse") placed = take;
      else {
        // stall chest full: divert the overflow to the warehouse virtually
        addStock(state, item, take - placed, cat);
      }
    }
    // Freelancers are only paid for what actually landed in a chest.
    if (isFreelance && placed < take) {
      price = Math.round(price * (placed / take) * 100) / 100;
      take = placed;
    }
    if (take <= 0) {
      rejected[item] = qty;
      continue;
    }

    accepted[item] = take;
    xpUnits += take;
    if (take < qty) rejected[item] = qty - take;

    if (stall) {
      stall.stock[item] = (stall.stock[item] ?? 0) + take;
      stall.soldUnits += take;
      if (price > 0) {
        stall.float = Math.round((stall.float - price) * 100) / 100;
        stall.totalPaid = Math.round((stall.totalPaid + price) * 100) / 100;
      }
    } else {
      addStock(state, item, take, cat);
    }

    if (price > 0) {
      record.savings = Math.round(((record.savings ?? 0) + price) * 100) / 100;
      if (!stall) state.treasury = Math.round((state.treasury - price) * 100) / 100;
      state.dailyStats.freelancePaid =
        Math.round(((state.dailyStats.freelancePaid ?? 0) + price) * 100) / 100;
      appendLedger(state, {
        type: "purchase", seller: record.fullName, sellerId: record.id,
        outlet: stall ? stall.commodity : "warehouse", item, qty: take,
        grade, rate: Math.round((price / take) * 1000) / 1000, pay: price,
      });
    }
    paid = Math.round((paid + price) * 100) / 100;
  }

  return { accepted, rejected, paid, xpUnits };
}

/** Moves a stall chest's physical contents into the warehouse chest. */
function transferChestContents(dim, fromLoc, toLoc) {
  const from = containerAt(dim, fromLoc);
  const to = containerAt(dim, toLoc);
  if (!from || !to) return;
  for (let slot = 0; slot < from.size; slot++) {
    const stack = from.getItem(slot);
    if (!stack) continue;
    const leftover = to.addItem(stack);
    if (!leftover) from.clearItem(slot);
    else from.setItem(slot, leftover); // warehouse full: remainder stays
  }
}

/**
 * Dusk cart-run: consolidate stall stock into the warehouse and return
 * unspent floats to the treasury. Called by the Day Roll BEFORE float funding.
 */
export function consolidateStalls(state, dim) {
  for (const b of state.buyers) {
    transferChestContents(dim, b.chest, state.zones.stockpileChest);
    for (const [item, qty] of Object.entries(b.stock)) {
      addStock(state, item, qty, categoryOf(item));
    }
    b.stock = {};
    if (b.float > 0) {
      state.treasury = Math.round((state.treasury + b.float) * 100) / 100;
      b.float = 0;
    }
  }
}

/** Morning float allocation after wages. Returns total funded. */
export function fundFloats(state) {
  let funded = 0;
  for (const b of state.buyers) {
    if (!b.active) continue;
    const amount = Math.min(b.maxFloat, Math.max(0, state.treasury));
    b.float = Math.round(amount * 100) / 100;
    b.soldUnits = 0;
    state.treasury = Math.round((state.treasury - amount) * 100) / 100;
    funded += amount;
  }
  state.dailyStats.floatsFunded = Math.round(funded * 100) / 100;
  return funded;
}
