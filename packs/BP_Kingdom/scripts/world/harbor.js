/**
 * harbor.js — clipper trade & world prices (M8, design §9).
 *
 * A built harbor (M6) puts the colony on the clipper routes: every few days a
 * ship drops anchor for 2 days with fluctuating world prices — export the
 * warehouse surplus at 1.5–3× Crown rates, import settlers, machinery and
 * luxuries. One commodity booms and one gluts each visit ("London tea boom!",
 * "cotton glut"). Import/export duties flow to the treasury per tax policy.
 *
 * Without a harbor, only a rare refugee ship may beach — accept the hungry
 * (future labor + fame) or turn them away (mood loss). Every ship is virtual
 * (no laggy entities); the docks themselves are the M6 building.
 */
import { LEDGER_CAP } from "../core/state.js";
import { baseRate, categoryOf } from "../economy/pricebook.js";
import { effectiveRates } from "../economy/tax.js";
import { spawnMigrant } from "../game/citizens.js";

export const SHIP_NAMES = [
  "Eastern Star", "HMS Prosperity", "Golden Hind II", "Monsoon Bride",
  "Crown Jewel", "Tea Clipper Swift", "Ivory Wind", "Royal Meridian",
];

export const COMMODITY_CATS = ["wood", "stone", "ore", "grain", "cashcrop", "fish", "livestock"];

export const IMPORT_CATALOG = {
  tools:   { name: "Sheffield tool crate", cost: 50, desc: "+25xp to every worker" },
  medicine:{ name: "Surgeon's medicine chest", cost: 20, desc: "Heals & restores the colony" },
  feast:   { name: "Spice & sugar feast", cost: 30, desc: "+8 mood, festival night" },
  iron:    { name: "16 iron ingots", cost: 0, desc: "Priced at world rates", item: "minecraft:iron_ingot", qty: 16 },
  copper:  { name: "24 copper ingots", cost: 0, desc: "Priced at world rates", item: "minecraft:copper_ingot", qty: 24 },
};

export function defaultHarbor() {
  return {
    level: 0,
    loc: null,
    ships: [], // visiting now (usually 0–1)
    nextShipDay: 0,
    shipCounter: 0,
    pendingDecision: null, // {kind:'refugees',count,expiryDay}
    history: [], // last visits, capped
  };
}

export function nextShipId(state) {
  return `sh-${state.nextShipId++}`;
}

function ledgerHarbor(state, what, detail) {
  state.ledger.push({ day: state.day, type: "harbor", what, ...detail });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
}

/** Rolls world-price multipliers: baseline drift + one boom + one glut. */
export function rollWorldPrices(rng = Math.random) {
  const mults = {};
  for (const cat of COMMODITY_CATS) {
    mults[cat] = Math.round((1.2 + rng() * 1.0) * 100) / 100; // 1.2–2.2
  }
  const boom = COMMODITY_CATS[Math.floor(rng() * COMMODITY_CATS.length)];
  let glut = COMMODITY_CATS[Math.floor(rng() * COMMODITY_CATS.length)];
  if (glut === boom) glut = COMMODITY_CATS[(COMMODITY_CATS.indexOf(boom) + 3) % COMMODITY_CATS.length];
  mults[boom] = Math.round((2.2 + rng() * 0.8) * 100) / 100; // 2.2–3.0
  mults[glut] = Math.round((0.4 + rng() * 0.3) * 100) / 100; // 0.4–0.7
  return { mults, boom, glut };
}

/** Effective export multiplier for a category aboard a ship. */
export function exportMult(state, ship, category) {
  const base = ship?.worldPrices?.[category] ?? 1.5;
  const harborBonus = 1 + 0.1 * (state.harbor?.level ?? 0);
  return Math.round(base * harborBonus * 100) / 100;
}

function spawnShip(state, rng = Math.random) {
  const { mults, boom, glut } = rollWorldPrices(rng);
  const ship = {
    id: nextShipId(state),
    name: SHIP_NAMES[(state.harbor.shipCounter++) % SHIP_NAMES.length],
    arrivalDay: state.day,
    departureDay: state.day + 2,
    worldPrices: mults,
    boom,
    glut,
  };
  state.harbor.ships.push(ship);
  return ship;
}

/**
 * Daily harbor tick: arrivals, departures, price events, refugee ships.
 * @returns {{lines:string[],revenue:number}}
 */
export function tickHarbor(state, rng = Math.random) {
  const out = { lines: [], revenue: 0 };
  const harbor = state.harbor;
  if (!harbor) return out;

  // Sailings depart.
  const staying = [];
  for (const s of harbor.ships) {
    if (state.day >= s.departureDay) {
      harbor.history.push({ name: s.name, day: s.arrivalDay, boom: s.boom });
      if (harbor.history.length > 6) harbor.history.shift();
      out.lines.push(`§7⚓ ${s.name} weighs anchor and stands out to sea.`);
    } else {
      staying.push(s);
    }
  }
  harbor.ships = staying;

  // Scheduled clipper (harbor required).
  if ((harbor.level ?? 0) >= 1 && state.day >= (harbor.nextShipDay || 0)) {
    const ship = spawnShip(state, rng);
    harbor.nextShipDay = state.day + 3 + Math.floor(rng() * 3); // every 3–5 days
    out.lines.push(
      `§b⚓ ${ship.name} drops anchor! "${boomFlavor(ship.boom)}" ${ship.boom} ×${ship.worldPrices[ship.boom]} · ` +
      `${ship.glut} glut ×${ship.worldPrices[ship.glut]}. She sails on day ${ship.departureDay}.`
    );
  }

  // Rare refugee ship even without docks (~12% of dawns, never stacked).
  if (!harbor.pendingDecision && rng() < 0.12) {
    const count = 2 + Math.floor(rng() * 4);
    harbor.pendingDecision = { kind: "refugees", count, expiryDay: state.day + 2 };
    out.lines.push(
      `§e⛵ A leaking refugee ship beaches — ${count} hungry souls beg sanctuary. Decide at ⚓ Harbor (2 days).`
    );
  }

  // Expired decisions auto-resolve as turned away (fame/happiness loss).
  const pd = harbor.pendingDecision;
  if (pd && state.day > pd.expiryDay) {
    harbor.pendingDecision = null;
    for (const c of state.citizens) {
      if (c.alive) c.mood = Math.max(5, (c.mood ?? 70) - 3);
    }
    out.lines.push(`§7⛵ The refugee ship sailed on, unaided. The colony mourns (−3 mood).`);
  }
  return out;
}

function boomFlavor(cat) {
  const map = {
    wood: "London timber boom!", cashcrop: "London tea boom!", ore: "Birmingham hungry for ore!",
    grain: "Bread panic on the Thames!", fish: "Billingsgate pays double!",
    stone: "Paving boom in Manchester!", livestock: "Wool prices soar!",
  };
  return map[cat] ?? "Buyers crowd the quay!";
}

/**
 * Exports warehouse goods aboard the visiting ship.
 * @returns {{ok:boolean,paid?:number,duty?:number,reason?:string}}
 */
export function exportGoods(state, item, qty) {
  const ship = state.harbor?.ships?.[0];
  if (!ship) return { ok: false, reason: "No ship in harbor — exports sail with the clippers." };
  qty = Math.floor(qty);
  if (!(qty > 0)) return { ok: false, reason: "Name a positive quantity." };
  const have = state.stockpile[item] ?? 0;
  if (have < qty) return { ok: false, reason: `Warehouse holds only ${have}.` };

  const cat = categoryOf(item) ?? "wood";
  const mult = exportMult(state, ship, cat);
  const gross = Math.round(baseRate(item) * mult * qty * 100) / 100;
  const rates = effectiveRates(state);
  const duty = Math.round(gross * (rates.exportDuty / 100) * 100) / 100;
  const paid = Math.round((gross - duty) * 100) / 100;

  state.stockpile[item] = have - qty;
  state.treasury = Math.round((state.treasury + gross) * 100) / 100;
  state.dailyStats.harborNet = Math.round(((state.dailyStats.harborNet ?? 0) + gross) * 100) / 100;
  ledgerHarbor(state, "export", { ship: ship.name, item, qty, mult, gross, duty });
  return { ok: true, paid: gross, duty, mult };
}

/**
 * Buys from the import catalog while a ship is anchored.
 * @returns {{ok:boolean,reason?:string,paid?:number}}
 */
export function buyImport(state, importId) {
  const ship = state.harbor?.ships?.[0];
  if (!ship) return { ok: false, reason: "No ship in harbor." };
  const entry = IMPORT_CATALOG[importId];
  if (!entry) return { ok: false, reason: "Unknown goods." };

  let price = entry.cost;
  if (entry.item) {
    const cat = categoryOf(entry.item) ?? "ore";
    price = Math.round(baseRate(entry.item) * exportMult(state, ship, cat) * entry.qty * 100) / 100;
  }
  const rates = effectiveRates(state);
  const duty = Math.round(price * (rates.importDuty / 100) * 100) / 100;
  const total = Math.round((price + duty) * 100) / 100;
  if (total > state.treasury) {
    return { ok: false, reason: `Costs ₹${total} with duty; treasury holds ₹${Math.round(state.treasury)}.` };
  }
  state.treasury = Math.round((state.treasury - total) * 100) / 100;
  state.dailyStats.harborNet = Math.round(((state.dailyStats.harborNet ?? 0) - total) * 100) / 100;

  if (importId === "tools") {
    for (const c of state.citizens) {
      if (c.alive && c.ageStage === "adult") c.xp += 25;
    }
  } else if (importId === "medicine") {
    for (const c of state.citizens) {
      if (c.alive) {
        c.health = 20;
        c.mood = Math.min(100, (c.mood ?? 70) + 2);
      }
    }
  } else if (importId === "feast") {
    for (const c of state.citizens) {
      if (c.alive) c.mood = Math.min(100, (c.mood ?? 70) + 8);
    }
  } else if (entry.item) {
    state.stockpile[entry.item] = (state.stockpile[entry.item] ?? 0) + entry.qty;
  }
  ledgerHarbor(state, "import", { ship: ship.name, what: entry.name, paid: total, duty });
  return { ok: true, paid: total };
}

/**
 * Resolves the beached refugee ship: sanctuary or farewell.
 * @returns {{ok:boolean,names?:string[],reason?:string}}
 */
export function decideRefugees(state, dim, accept) {
  const pd = state.harbor?.pendingDecision;
  if (!pd || pd.kind !== "refugees") return { ok: false, reason: "No ship awaits a decision." };
  state.harbor.pendingDecision = null;

  // A fixed population cap holds the queue: only roomful may land.
  let room = Infinity;
  if (state.populationPolicy?.mode === "fixed") {
    room = Math.max(0, state.populationPolicy.cap - state.citizens.filter((c) => c.alive).length);
  }
  const landing = Math.min(pd.count, room);

  if (!accept) {
    for (const c of state.citizens) {
      if (c.alive) c.mood = Math.max(5, (c.mood ?? 70) - 3);
    }
    ledgerHarbor(state, "refugees", { decision: "turned-away", count: pd.count });
    return { ok: true, names: [] };
  }
  const names = [];
  for (let i = 0; i < landing; i++) {
    const c = spawnMigrant(state, dim, "laborer");
    if (c) {
      names.push(c.fullName);
      c.mood = Math.min(100, (c.mood ?? 70) + 10); // gratitude
    }
  }
  state.foodStock = Math.max(0, state.foodStock - pd.count * 2); // feeding the hungry
  for (const c of state.citizens) {
    if (c.alive) c.mood = Math.min(100, (c.mood ?? 70) + 2);
  }
  const turnedAway = pd.count - names.length;
  ledgerHarbor(state, "refugees", { decision: "welcomed", count: names.length, turnedAway });
  return { ok: true, names, turnedAway };
}

/** Harbor board for the Kingdom Menu. */
export function harborBoard(state) {
  const h = state.harbor ?? defaultHarbor();
  const lines = [`§b§l⚓ Harbor §r§7· level §f${h.level ?? 0}${(h.level ?? 0) === 0 ? " (build docks to summon clippers)" : ""}`];
  const ship = h.ships?.[0];
  if (ship) {
    lines.push(`§f${ship.name} §7in port until day ${ship.departureDay}`);
    lines.push(`§a📈 ${ship.boom} ×${ship.worldPrices[ship.boom]} §7· §c📉 ${ship.glut} ×${ship.worldPrices[ship.glut]}`);
  } else if ((h.level ?? 0) >= 1) {
    lines.push(`§7Next clipper expected around day ${h.nextShipDay}.`);
  }
  if (h.pendingDecision) {
    lines.push(`§e⛵ ${h.pendingDecision.count} refugees await your word (until day ${h.pendingDecision.expiryDay}).`);
  }
  return lines.join("\n");
}
