/**
 * state.js — single source of truth, persisted across SHARDED world dynamic
 * properties (each has a size cap, so large domains live in their own key):
 *   kingdom:base      — kingdom settings, zones, buyers, stockpile, stats
 *   kingdom:citizens  — the citizen registry
 *   kingdom:ledger    — the audit ledger (capped ring)
 * Legacy single-key saves (v1/v2) are auto-migrated, then split.
 */
import { world } from "@minecraft/server";

const LEGACY_KEY = "kingdom:save_v1";
const K_BASE = "kingdom:base";
const K_CITIZENS = "kingdom:citizens";
const K_LEDGER = "kingdom:ledger";
export const SAVE_VERSION = 3;
export const LEDGER_CAP = 150;

/** @returns {object} a fresh kingdom document */
export function defaultState() {
  return {
    version: SAVE_VERSION,
    founded: false,
    ministerGreeted: false,
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
    zones: {
      town: null, forest: null, farm: null, quarry: null, home: null,
      stockpileChest: null,
    },
    stockpile: {},
    dayProduction: {},
    dailyStats: freshStats(),
    buyers: [], // licensed commodity buyer stalls (see economy/buyers.js)
    ledger: [],
  };
}

export function freshStats() {
  return {
    wagesPaid: 0, mealsEaten: 0, mealsMissed: 0,
    freelancePaid: 0, floatsFunded: 0,
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
      c.alive = c.alive ?? true;
      c.mode = c.mode ?? "following";
      c.armed = c.armed ?? false;
      c.savings = c.savings ?? 0;
      c.wageMode = c.wageMode ?? "crown";
      c.needs = c.needs ?? { food: 100, rest: 100, leisure: 100, safety: 100 };
      c.day = c.day ?? {
        meals: 0, slept: false, workedTicks: 0, leisureTicks: 0,
        delivered: 0, scared: 0, breakfast: false, lunch: false, dinner: false,
      };
      c.cidTag = c.cidTag ?? `kingdom:cid_c${String(c.id).replace(/\D/g, "")}`;
    }
    data.version = 2;
  }
  if (data.version < 3) {
    data.buyers = data.buyers ?? [];
    data.ledger = data.ledger ?? [];
    data.nextBuyerId = data.nextBuyerId ?? 1;
    const s = data.dailyStats ?? {};
    data.dailyStats = {
      wagesPaid: s.wagesPaid ?? 0,
      mealsEaten: s.mealsEaten ?? 0,
      mealsMissed: s.mealsMissed ?? 0,
      freelancePaid: 0,
      floatsFunded: 0,
    };
    for (const c of data.citizens ?? []) c.wageMode = c.wageMode ?? "crown";
    data.version = 3;
  }
  return data;
}

export function resetState() {
  cache = defaultState();
  saveState();
  return cache;
}
