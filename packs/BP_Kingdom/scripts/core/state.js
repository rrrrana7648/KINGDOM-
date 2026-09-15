/**
 * state.js — single source of truth, persisted across SHARDED world dynamic
 * properties (each has a size cap, so large domains live in their own key):
 *   kingdom:base      — kingdom settings, zones, buyers, stockpile, stats,
 *                        taxes, mint, bank, decrees, buildings, houses, harbor
 *   kingdom:citizens  — the citizen registry
 *   kingdom:ledger    — the audit ledger (capped ring)
 * Legacy single-key saves (v1/v2) are auto-migrated, then split.
 *
 * Save versions: 3 = M3 warehouse · 4 = M4 market & taxes · 5 = M5 mint &
 * bank · 6 = M6 decrees & building · 7 = M7 family & housing · 8 = M8 harbor.
 */
import { world } from "@minecraft/server";

const LEGACY_KEY = "kingdom:save_v1";
const K_BASE = "kingdom:base";
const K_CITIZENS = "kingdom:citizens";
const K_LEDGER = "kingdom:ledger";
export const SAVE_VERSION = 8;
export const LEDGER_CAP = 150;

/** @returns {object} a fresh kingdom document */
export function defaultState() {
  return {
    version: SAVE_VERSION,
    founded: false,
    ministerGreeted: false,
    ministerStrikes: 0,
    autoApproveBudget: 50,
    kingName: "",
    day: 1,
    foundedWorldDay: 0,
    colony: { name: "", bannerColor: "Crimson", difficulty: "Standard" },
    treasury: 1000,
    moneySupply: 1000,
    foodStock: 200,
    populationPolicy: { mode: "unlimited", cap: 40, growPer10Days: 2 },
    timePresetMinutes: 20,
    citizens: [],
    decrees: [],
    nextCitizenId: 1,
    nextBuyerId: 1,
    nextDecreeId: 1,
    nextHouseId: 1,
    nextLoanId: 1,
    nextMissionId: 1,
    nextShipId: 1,
    nextSiteId: 1,
    nextRequestId: 1,
    zones: {
      town: null, forest: null, farm: null, quarry: null, home: null,
      stockpileChest: null,
    },
    stockpile: {},
    dayProduction: {},
    dailyStats: freshStats(),
    buyers: [], // licensed commodity buyer stalls (see economy/buyers.js)
    ledger: [],
    // M4 — market, taxes & the books
    tax: { preset: "normal", incomePct: 10, salesPct: 8, headTax: 1, landPct: 5, importPct: 10, exportPct: 5, war: 0, holidayDays: 0 },
    market: { priceIndex: 1.0, blackMarketRisk: "low", demandHeat: {} },
    finances: {
      lastGDP: 0, lastNet: 0, prevMoneySupply: 1000, prevGDP: 0,
      income: { taxes: 0, salesTax: 0, shops: 0, rents: 0, harbor: 0, fees: 0, total: 0 },
      expenses: { wages: 0, freelance: 0, construction: 0, missions: 0, interest: 0, welfare: 0, trade: 0, total: 0 },
      gdpHistory: [], netHistory: [],
    },
    // M5 — mint, inflation & bank
    mint: { paper: 0, ink: 0, plates: 1, plateWear: 0, batchesPrinted: 0, batchesToday: 0 },
    inflation: { pct: 0, priceIndex: 1.0, reserveCoverPct: 100, gdpGrowthPct: 0, moneyGrowthPct: 0 },
    bank: { crownDebt: 0, crownRate: 8, citizenRate: 12, loans: [] },
    // M6 — decrees, sites & raised buildings
    sites: [],
    buildings: [],
    // M7 — houses & the family inbox
    houses: [],
    familyRequests: [],
    // M8 — harbor & migration
    harbor: { level: 0, loc: null, ships: [], nextShipDay: 0, shipCounter: 0, pendingDecision: null, history: [] },
    missions: [],
  };
}

export function freshStats() {
  return {
    wagesPaid: 0, mealsEaten: 0, mealsMissed: 0,
    freelancePaid: 0, floatsFunded: 0,
    marketVolume: 0, salesTax: 0, taxesCollected: 0, rentsCollected: 0,
    mintPrinted: 0, harborNet: 0, construction: 0, missions: 0, welfare: 0,
  };
}

let cache = null;

export function getState() {
  if (cache) return cache;
  try {
    const baseRaw = world.getDynamicProperty(K_BASE);
    if (baseRaw) {
      const base = JSON.parse(baseRaw);
      base.citizens = JSON.parse(world.getDynamicProperty(K_CITIZENS) ?? "[]");
      base.ledger = JSON.parse(world.getDynamicProperty(K_LEDGER) ?? "[]");
      cache = migrate(base);
    } else {
      const legacy = world.getDynamicProperty(LEGACY_KEY);
      cache = legacy ? migrate(JSON.parse(legacy)) : defaultState();
    }
  } catch (err) {
    console.warn("[KINGDOM] save read failed, starting fresh: " + err);
    cache = defaultState();
  }
  return cache;
}

/** Persists the live state object across the sharded keys. */
export function saveState() {
  if (!cache) return;
  const clean = JSON.parse(
    JSON.stringify(cache, (key, value) =>
      key.startsWith("_") ? undefined : value
    )
  );
  const { citizens, ledger, ...base } = clean;
  try {
    world.setDynamicProperty(K_BASE, JSON.stringify(base));
    world.setDynamicProperty(K_CITIZENS, JSON.stringify(citizens ?? []));
    world.setDynamicProperty(
      K_LEDGER,
      JSON.stringify((ledger ?? []).slice(-LEDGER_CAP))
    );
    // Legacy single-key save is superseded once shards exist.
    if (world.getDynamicProperty(LEGACY_KEY) !== undefined) {
      world.setDynamicProperty(LEGACY_KEY, undefined);
    }
  } catch (err) {
    console.error("[KINGDOM] save write failed: " + err);
  }
}

function freshDay() {
  return {
    meals: 0, slept: false, workedTicks: 0, leisureTicks: 0,
    delivered: 0, scared: 0, breakfast: false, lunch: false, dinner: false,
    earned: 0,
  };
}

/** Brings older save documents up to the current schema. */
function migrate(data) {
  if (!data.version || data.version < 2) {
    data.foodStock = data.foodStock ?? 200;
    data.zones = data.zones ?? {
      town: null, forest: null, farm: null, quarry: null,
      home: null, stockpileChest: null,
    };
    data.stockpile = data.stockpile ?? {};
    data.dayProduction = data.dayProduction ?? {};
    data.dailyStats = freshStats();
    for (const c of data.citizens ?? []) {
      backfillCitizen(c);
    }
    data.version = 2;
  }
  if (data.version < 3) {
    data.buyers = data.buyers ?? [];
    data.ledger = data.ledger ?? [];
    data.nextBuyerId = data.nextBuyerId ?? 1;
    const s = data.dailyStats ?? {};
    data.dailyStats = { ...freshStats(), ...s };
    for (const c of data.citizens ?? []) c.wageMode = c.wageMode ?? "crown";
    data.version = 3;
  }
  if (data.version < 4) {
    // M4: market, taxes & the books.
    data.tax = data.tax ?? {
      preset: "normal", incomePct: 10, salesPct: 8, headTax: 1,
      landPct: 5, importPct: 10, exportPct: 5, war: 0, holidayDays: 0,
    };
    data.market = data.market ?? { priceIndex: 1.0, blackMarketRisk: "low", demandHeat: {} };
    data.finances = data.finances ?? {
      lastGDP: 0, lastNet: 0, prevMoneySupply: data.moneySupply ?? 1000, prevGDP: 0,
      income: { taxes: 0, salesTax: 0, shops: 0, rents: 0, harbor: 0, fees: 0, total: 0 },
      expenses: { wages: 0, freelance: 0, construction: 0, missions: 0, interest: 0, welfare: 0, trade: 0, total: 0 },
      gdpHistory: [], netHistory: [],
    };
    data.dailyStats = { ...freshStats(), ...(data.dailyStats ?? {}) };
    for (const c of data.citizens ?? []) {
      c.day = c.day ?? freshDay();
      c.day.earned = c.day.earned ?? 0;
    }
    data.version = 4;
  }
  if (data.version < 5) {
    // M5: mint, inflation & bank.
    data.mint = data.mint ?? { paper: 0, ink: 0, plates: 1, plateWear: 0, batchesPrinted: 0, batchesToday: 0 };
    data.inflation = data.inflation ?? { pct: 0, priceIndex: 1.0, reserveCoverPct: 100, gdpGrowthPct: 0, moneyGrowthPct: 0 };
    data.bank = data.bank ?? { crownDebt: 0, crownRate: 8, citizenRate: 12, loans: [] };
    data.nextLoanId = data.nextLoanId ?? 1;
    data.version = 5;
  }
  if (data.version < 6) {
    // M6: decrees, sites & buildings.
    data.decrees = data.decrees ?? [];
    data.sites = data.sites ?? [];
    data.buildings = data.buildings ?? [];
    data.nextDecreeId = data.nextDecreeId ?? 1;
    data.nextSiteId = data.nextSiteId ?? 1;
    data.ministerStrikes = data.ministerStrikes ?? 0;
    data.autoApproveBudget = data.autoApproveBudget ?? 50;
    for (const c of data.citizens ?? []) c.assignedSite = c.assignedSite ?? null;
    data.version = 6;
  }
  if (data.version < 7) {
    // M7: houses & family.
    data.houses = data.houses ?? [];
    data.familyRequests = data.familyRequests ?? [];
    data.nextHouseId = data.nextHouseId ?? 1;
    data.nextRequestId = data.nextRequestId ?? 1;
    for (const c of data.citizens ?? []) {
      c.affection = c.affection ?? {};
      c.partner = c.partner ?? null;
      c.pregnancy = c.pregnancy ?? null;
      c.motherId = c.motherId ?? null;
      c.fatherId = c.fatherId ?? null;
      c.ageDays = c.ageDays ?? 0;
      c.ageStage = c.ageStage ?? "adult";
      c.rentOwed = c.rentOwed ?? 0;
    }
    data.version = 7;
  }
  if (data.version < 8) {
    // M8: harbor & migration.
    data.harbor = data.harbor ?? {
      level: 0, loc: null, ships: [], nextShipDay: 0,
      shipCounter: 0, pendingDecision: null, history: [],
    };
    data.missions = data.missions ?? [];
    data.nextMissionId = data.nextMissionId ?? 1;
    data.nextShipId = data.nextShipId ?? 1;
    data.version = 8;
  }
  // Belt & braces: legacy docs sometimes lack counters — derive collision-free
  // values from the live collections so `next*++` never yields NaN.
  data.nextCitizenId = data.nextCitizenId ?? (1 + maxSuffix(data.citizens, "id", "c-"));
  data.nextBuyerId = data.nextBuyerId ?? (1 + maxSuffix(data.buyers, "id", "b-"));
  data.nextDecreeId = data.nextDecreeId ?? (1 + maxSuffix(data.decrees, "id", "d-"));
  data.nextHouseId = data.nextHouseId ?? (1 + maxSuffix(data.houses, "id", "h-"));
  data.nextLoanId = data.nextLoanId ?? (1 + maxSuffix(data.bank?.loans, "id", "l-"));
  data.nextMissionId = data.nextMissionId ?? (1 + maxSuffix(data.missions, "id", "m-"));
  data.nextShipId = data.nextShipId ?? 1;
  data.nextSiteId = data.nextSiteId ?? (1 + maxSuffix(data.sites, "id", "s-"));
  data.nextRequestId = data.nextRequestId ?? (1 + maxSuffix(data.familyRequests, "id", "r-"));
  return data;
}

function maxSuffix(rows, key, prefix) {
  let max = 0;
  for (const row of rows ?? []) {
    const n = parseInt(String(row?.[key] ?? "").replace(prefix, ""), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

function backfillCitizen(c) {
  c.alive = c.alive ?? true;
  c.mode = c.mode ?? "following";
  c.armed = c.armed ?? false;
  c.savings = c.savings ?? 0;
  c.wageMode = c.wageMode ?? "crown";
  c.affection = c.affection ?? {};
  c.partner = c.partner ?? null;
  c.pregnancy = c.pregnancy ?? null;
  c.motherId = c.motherId ?? null;
  c.fatherId = c.fatherId ?? null;
  c.ageDays = c.ageDays ?? 0;
  c.ageStage = c.ageStage ?? "adult";
  c.rentOwed = c.rentOwed ?? 0;
  c.assignedSite = c.assignedSite ?? null;
  c.needs = c.needs ?? { food: 100, rest: 100, leisure: 100, safety: 100 };
  c.day = c.day ?? freshDay();
  c.day.earned = c.day.earned ?? 0;
  c.cidTag = c.cidTag ?? `kingdom:cid_c${String(c.id).replace(/\D/g, "")}`;
}

export function resetState() {
  cache = defaultState();
  saveState();
  return cache;
}
