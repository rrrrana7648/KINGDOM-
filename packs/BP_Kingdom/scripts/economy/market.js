/**
 * market.js — citizen spending & the internal market (M4, design §6.3).
 *
 * Every dawn the adults spend part of their savings on market meals, leisure
 * and sundries. Spending counts as SERVICES in GDP, yields sales tax for the
 * Crown (leaking to the black market when rates are punishing) and a shop
 * profit for the Crown's own stalls. Prices scale with the M5 price index so
 * inflation is felt at the dinner table.
 *
 * Also tracks per-commodity demand heat (empty stockpile = hot demand) which
 * the Royal Economist uses for price nudges.
 */
import { LEDGER_CAP } from "../core/state.js";
import { effectiveRates } from "./tax.js";

export function defaultMarket() {
  return { priceIndex: 1.0, blackMarketRisk: "low", demandHeat: {} };
}

/** A market dinner in ₹ — the cost-of-living anchor. */
export function marketMealCost(state) {
  const idx = state.market?.priceIndex ?? 1;
  return Math.round(2 * idx * 100) / 100;
}

/**
 * Simulates one day of citizen spending. Runs after wages, before taxes.
 * @returns {{volume:number,shopProfit:number,salesTax:number,shoppers:number}}
 */
export function simulateMarketDay(state) {
  const rates = effectiveRates(state);
  const idx = state.market?.priceIndex ?? 1;
  const out = { volume: 0, shopProfit: 0, salesTax: 0, shoppers: 0 };

  const marketBonus = marketBuff(state); // +10% per market hall level
  for (const c of state.citizens) {
    if (!c.alive || c.ageStage !== "adult") continue;
    const leisure = (c.mood ?? 70) > 60 ? 2 : 1;
    const want = Math.round((2 + leisure) * idx * (1 + marketBonus) * 100) / 100;
    const spend = Math.min(Math.max(0, c.savings ?? 0), want);
    if (spend <= 0) continue;
    c.savings = Math.round((c.savings - spend) * 100) / 100;
    out.volume = Math.round((out.volume + spend) * 100) / 100;
    out.shoppers++;
  }

  // Black-market leakage: extreme sales tax drives trade underground.
  let efficiency = 1;
  if (rates.sales > 20) efficiency = 0.55;
  else if (rates.sales > 14) efficiency = 0.85;

  out.salesTax = Math.round(out.volume * (rates.sales / 100) * efficiency * 100) / 100;
  out.shopProfit = Math.round(out.volume * 0.35 * 100) / 100;
  state.treasury = Math.round((state.treasury + out.salesTax + out.shopProfit) * 100) / 100;
  state.dailyStats.marketVolume = out.volume;
  state.dailyStats.salesTax = out.salesTax;

  if (out.volume > 0) {
    state.ledger.push({
      day: state.day, type: "market", volume: out.volume,
      salesTax: out.salesTax, shopProfit: out.shopProfit, shoppers: out.shoppers,
    });
    if (state.ledger.length > LEDGER_CAP) {
      state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
    }
  }

  updateDemandHeat(state);
  return out;
}

/** Crown market halls boost foot traffic (M6 buildings feed back here). */
function marketBuff(state) {
  let buff = 0;
  for (const b of state.buildings ?? []) {
    if (b.buildingId === "market") buff += 0.1 * (b.level ?? 1);
  }
  return buff;
}

/**
 * Demand heat per commodity 0 (glutted) … 2 (starved), from stockpile depth
 * vs buyer quotas. The economist surfaces the hottest stalls as nudges.
 */
export function updateDemandHeat(state) {
  const heat = {};
  const stockOf = (cat) => {
    let n = 0;
    for (const [item, qty] of Object.entries(state.stockpile ?? {})) {
      if (categoryOfCached(item) === cat) n += qty;
    }
    return n;
  };
  for (const b of state.buyers ?? []) {
    if (!b.active) continue;
    const depth = stockOf(b.commodity);
    const target = Math.max(1, b.quota * 2);
    heat[b.commodity] = depth >= target ? 0 : depth >= target / 2 ? 1 : 2;
  }
  state.market.demandHeat = heat;
  return heat;
}

// Local category cache so market.js never imports pricebook's mutable map.
let catCache = null;
function categoryOfCached(item) {
  if (!catCache) {
    catCache = {};
    const groups = {
      wood: ["oak_log", "birch_log", "spruce_log", "jungle_log", "acacia_log", "dark_oak_log", "cherry_log", "mangrove_log", "planks", "stick"],
      stone: ["cobblestone", "stone", "cobbled_deepslate", "deepslate", "granite", "diorite", "andesite", "tuff", "clay_ball", "flint", "obsidian", "netherrack", "blackstone", "basalt", "sand", "gravel", "dirt"],
      ore: ["coal", "charcoal", "raw_iron", "iron_ingot", "raw_copper", "copper_ingot", "raw_gold", "gold_ingot", "redstone", "lapis_lazuli", "quartz", "amethyst_shard", "emerald", "diamond", "netherite_scrap"],
      grain: ["wheat", "bread", "potato", "carrot", "beetroot", "baked_potato"],
      cashcrop: ["sugar_cane", "sugar", "cocoa_beans", "melon_slice", "pumpkin", "kelp"],
      fish: ["cod", "salmon", "tropical_fish", "pufferfish", "cooked_cod", "cooked_salmon"],
      livestock: ["beef", "cooked_beef", "porkchop", "cooked_porkchop", "chicken", "cooked_chicken", "mutton", "cooked_mutton", "rabbit", "egg", "milk_bucket", "wool", "leather", "feather", "rabbit_hide", "string"],
    };
    for (const [cat, parts] of Object.entries(groups)) {
      for (const p of parts) catCache[`minecraft:${p}`] = cat;
    }
  }
  return catCache[item];
}

/** Economist nudge lines for hot stalls + freelance pay gaps. */
export function economistNudges(state) {
  const nudges = [];
  const heat = state.market?.demandHeat ?? {};
  for (const [cat, h] of Object.entries(heat)) {
    if (h === 2) {
      const b = (state.buyers ?? []).find((x) => x.commodity === cat && x.active);
      nudges.push(
        `§6💡 ${cap(cat)} stocks are starved — raise the band above ×${b?.band ?? 1} or lose freelancers.`
      );
    }
  }
  if (state.market?.blackMarketRisk === "high") {
    nudges.push("§c💡 Taxes are punishing — trade is fleeing to the black market. Cut sales tax.");
  }
  if (state.foodStock < state.citizens.filter((c) => c.alive).length * 3) {
    nudges.push("§c💡 Rations below 3 days — raise grain rates or import food at the harbor.");
  }
  return nudges.slice(0, 3);
}

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}
