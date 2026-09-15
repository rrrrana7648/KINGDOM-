/**
 * state.js — single source of truth, persisted in a world dynamic property.
 * Save v2 (M2): work-site zones, stockpile, food, needs, citizen mode/orders.
 */
import { world } from "@minecraft/server";

const SAVE_KEY = "kingdom:save_v1";
export const SAVE_VERSION = 2;

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
    foodStock: 200, // rations consumed at meals; farmer deliveries refill this
    populationPolicy: { mode: "unlimited", cap: 40, growPer10Days: 2 },
    timePresetMinutes: 20,
    citizens: [],
    decrees: [],
    nextCitizenId: 1,
    zones: {
      // {x,y,z} anchors; work sites add radius r
      town: null,
      forest: null,
      farm: null,
      quarry: null,
      home: null,
      stockpileChest: null, // {x,y,z} looked-at chest
    },
    stockpile: {}, // material itemId -> virtual count (also physically in chest)
    dayProduction: {}, // itemId -> amount produced since last Day Roll
    dailyStats: { wagesPaid: 0, mealsEaten: 0, mealsMissed: 0 },
  };
}

let cache = null;

export function getState() {
  if (cache) return cache;
  try {
    const raw = world.getDynamicProperty(SAVE_KEY);
    cache = raw ? migrate(JSON.parse(raw)) : defaultState();
  } catch (err) {
    console.warn("[KINGDOM] save read failed, starting fresh: " + err);
    cache = defaultState();
  }
  return cache;
}

export function saveState() {
  if (!cache) return;
  try {
    // Strip transient runtime references (underscore-prefixed, e.g. _entity).
    const json = JSON.stringify(cache, (key, value) =>
      key.startsWith("_") ? undefined : value
    );
    world.setDynamicProperty(SAVE_KEY, json);
  } catch (err) {
    console.error("[KINGDOM] save write failed (too large?): " + err);
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
    data.dailyStats = data.dailyStats ?? { wagesPaid: 0, mealsEaten: 0, mealsMissed: 0 };
    for (const c of data.citizens ?? []) {
      c.alive = c.alive ?? true;
      c.mode = c.mode ?? "following"; // following | living
      c.armed = c.armed ?? false;
      c.savings = c.savings ?? 0;
      c.needs = c.needs ?? { food: 100, rest: 100, leisure: 100, safety: 100 };
      c.day = c.day ?? { meals: 0, slept: false, workedTicks: 0, leisureTicks: 0, delivered: 0, scared: 0, breakfast: false, lunch: false, dinner: false };
      c.cidTag = c.cidTag ?? `kingdom:cid_c${String(c.id).replace(/\D/g, "")}`;
    }
    data.version = 2;
  }
  return data;
}

export function resetState() {
  cache = defaultState();
  saveState();
  return cache;
}
