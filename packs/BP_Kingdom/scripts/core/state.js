/**
 * state.js — single source of truth, persisted in a world dynamic property.
 * M1 keeps one JSON document. Later milestones shard large domains
 * (citizens / ledger / decrees) across multiple properties.
 */
import { world } from "@minecraft/server";

const SAVE_KEY = "kingdom:save_v1";
export const SAVE_VERSION = 1;

/** @returns {object} a fresh kingdom document */
export function defaultState() {
  return {
    version: SAVE_VERSION,
    founded: false,
    ministerGreeted: false,
    kingName: "",
    day: 1,
    colony: {
      name: "",
      bannerColor: "Crimson",
      difficulty: "Standard",
    },
    treasury: 1000, // ₹ (M3+ ledgers keep paise internally)
    moneySupply: 1000,
    populationPolicy: {
      mode: "unlimited", // 'unlimited' | 'fixed' | 'autogrow'
      cap: 40,
      growPer10Days: 2,
    },
    timePresetMinutes: 20, // vanilla cycle; longer presets are script-driven later
    citizens: [], // see TECHNICAL_PLAN.md §3 for the record shape
    decrees: [],
    nextCitizenId: 1,
  };
}

let cache = null;

/** Loads (once) and returns the live state object. */
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

/** Persists the live state object. */
export function saveState() {
  if (!cache) return;
  try {
    world.setDynamicProperty(SAVE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.error("[KINGDOM] save write failed: " + err);
  }
}

/** Versioned migration hook — bump SAVE_VERSION when the schema changes. */
function migrate(data) {
  // No older versions yet. Example for later:
  // if (data.version < 2) { data.someNewField = 0; data.version = 2; }
  return data;
}

/** Test/debug helper (also wired to a future admin command). */
export function resetState() {
  cache = defaultState();
  saveState();
  return cache;
}
