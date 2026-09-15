/**
 * mint.js — the Royal Mint, money supply & inflation (M5, design §7).
 *
 * Start: ₹1,000 money supply. Printing more needs a PHYSICAL chain:
 *   Paper Mill:  3 sugarcane (or 2 bamboo) from the warehouse → 1 paper unit
 *   Ink Works:   1 ink sac → 10 ink units (1 unit prints many notes)
 *   Plate:       4 copper/iron ingots → 1 engraved plate (wears per batch)
 *   Press:       1 paper + 1 ink + plate → ₹100 batch → treasury ledger
 *
 * Per ₹100 batch: ₹2 labor + ₹1 plate wear from the treasury, +10 wear.
 * A plate shatters at 100 wear. Currency stays ledger-only (no dropped
 * entities) for mobile performance; the Mint building is its home.
 *
 * Inflation: printing faster than GDP growth debases the rupee — the price
 * index rises, market meals and wage demands follow, savings erode. Printing
 * too little slides toward deflation (stalls close, unemployment). The
 * demonetization edict resets the press at a steep happiness cost.
 */
import { LEDGER_CAP } from "../core/state.js";

export const BATCH_RUPEES = 100;
export const BATCH_LABOR = 2;
export const BATCH_WEAR_COST = 1;
export const BATCH_WEAR = 10;

export function defaultMint() {
  return { paper: 0, ink: 0, plates: 1, plateWear: 0, batchesPrinted: 0, batchesToday: 0 };
}

export function defaultInflation() {
  return { pct: 0, priceIndex: 1.0, reserveCoverPct: 100, gdpGrowthPct: 0, moneyGrowthPct: 0 };
}

function takeStock(state, item, qty) {
  const have = state.stockpile[item] ?? 0;
  if (have < qty) return false;
  state.stockpile[item] = have - qty;
  return true;
}

function ledgerMint(state, what, detail) {
  state.ledger.push({ day: state.day, type: "mint", what, ...detail });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
}

/** Mills paper from warehouse cane/bamboo. @returns {{made:number}} */
export function makePaper(state, units) {
  let made = 0;
  for (let i = 0; i < units; i++) {
    if (takeStock(state, "minecraft:sugar_cane", 3)) made++;
    else if (takeStock(state, "minecraft:bamboo", 2)) made++;
    else break;
  }
  state.mint.paper += made;
  if (made > 0) ledgerMint(state, "paper", { made, stock: state.mint.paper });
  return { made };
}

/** Grinds ink sacs into press ink. @returns {{made:number}} */
export function makeInk(state, sacs) {
  let made = 0;
  for (let i = 0; i < sacs; i++) {
    if (takeStock(state, "minecraft:ink_sac", 1)) made += 10;
    else break;
  }
  state.mint.ink += made;
  if (made > 0) ledgerMint(state, "ink", { made, stock: state.mint.ink });
  return { made };
}

/** Engraves a copper/iron plate. @returns {boolean} */
export function craftPlate(state) {
  const copper = state.stockpile["minecraft:copper_ingot"] ?? 0;
  const iron = state.stockpile["minecraft:iron_ingot"] ?? 0;
  if (copper >= 4) state.stockpile["minecraft:copper_ingot"] = copper - 4;
  else if (iron >= 4) state.stockpile["minecraft:iron_ingot"] = iron - 4;
  else return false;
  state.mint.plates++;
  ledgerMint(state, "plate", { stock: state.mint.plates });
  return true;
}

/**
 * Prints banknote batches into the treasury.
 * @param {number} batches how many ₹100 batches
 * @returns {{ok:boolean,printed?:number,reason?:string}}
 */
export function printNotes(state, batches) {
  const m = state.mint;
  if (batches < 1) return { ok: false, reason: "Print at least one batch." };
  if (m.plates < 1) return { ok: false, reason: "No engraved plate — craft one from copper/iron ingots." };
  if (m.paper < batches) return { ok: false, reason: `Needs ${batches} paper (have ${m.paper}). Mill sugarcane first.` };
  if (m.ink < batches) return { ok: false, reason: `Needs ${batches} ink (have ${m.ink}). Grind ink sacs first.` };
  const cost = batches * (BATCH_LABOR + BATCH_WEAR_COST);
  if (state.treasury < cost) return { ok: false, reason: `Press fees ₹${cost} exceed the treasury.` };

  m.paper -= batches;
  m.ink -= batches;
  state.treasury = Math.round((state.treasury - cost) * 100) / 100;
  const face = batches * BATCH_RUPEES;
  state.treasury = Math.round((state.treasury + face) * 100) / 100;
  state.moneySupply = Math.round((state.moneySupply + face) * 100) / 100;
  m.batchesPrinted += batches;
  m.batchesToday += batches;
  // A purpose-built Mint hall steadies the press: −20% wear per level.
  const mintHall = (state.buildings ?? []).find((b) => b.buildingId === "mint");
  const wearEach = BATCH_WEAR * Math.max(0.4, 1 - 0.2 * (mintHall?.level ?? 0));
  m.plateWear = Math.round((m.plateWear + batches * wearEach) * 10) / 10;
  let shattered = false;
  if (m.plateWear >= 100) {
    m.plates = Math.max(0, m.plates - 1);
    m.plateWear = 0;
    shattered = true;
  }
  state.dailyStats.mintPrinted = (state.dailyStats.mintPrinted ?? 0) + face;
  ledgerMint(state, "print", { batches, face, cost, shattered });
  return { ok: true, printed: face, shattered };
}

/**
 * Daily inflation tick. Compares money-supply growth to GDP growth:
 * printing beyond real growth debases the rupee; restraint lets prices cool.
 * @returns {{inflation:number,priceIndex:number,line:string}}
 */
export function tickInflation(state) {
  const f = state.finances;
  const inf = state.inflation;
  const prevMoney = f?.prevMoneySupply ?? state.moneySupply;
  const moneyGrowth = prevMoney > 0 ? (state.moneySupply - prevMoney) / prevMoney : 0;
  const prevGDP = f?.prevGDP ?? 0;
  const lastGDP = f?.lastGDP ?? 0;
  const gdpGrowth = prevGDP > 0 ? (lastGDP - prevGDP) / prevGDP : lastGDP > 0 ? 0.02 : 0;

  // New inflation leans on the gap; old inflation decays by half each day.
  const gap = (moneyGrowth - gdpGrowth) * 100;
  let pct = (inf?.pct ?? 0) * 0.5 + gap * 0.5;
  pct = Math.max(-5, Math.min(50, Math.round(pct * 10) / 10));

  let priceIndex = (inf?.priceIndex ?? 1) * (1 + pct / 100);
  priceIndex = Math.max(0.5, Math.min(5, Math.round(priceIndex * 1000) / 1000));

  const metalValue =
    (state.stockpile["minecraft:gold_ingot"] ?? 0) * 12 +
    (state.stockpile["minecraft:iron_ingot"] ?? 0) * 4 +
    (state.stockpile["minecraft:raw_gold"] ?? 0) * 5;
  const reserveCover = Math.round(
    (metalValue / Math.max(1, state.moneySupply)) * 100 * 10
  ) / 10;

  state.inflation = {
    pct, priceIndex,
    reserveCoverPct: Math.min(999, reserveCover),
    gdpGrowthPct: Math.round(gdpGrowth * 1000) / 10,
    moneyGrowthPct: Math.round(moneyGrowth * 1000) / 10,
  };
  if (state.market) state.market.priceIndex = priceIndex;
  if (f) f.prevMoneySupply = state.moneySupply;
  state.mint.batchesToday = 0;

  let line;
  if (pct >= 10) line = `§c📉 Inflation ${pct}% — the press is debasing the rupee! Prices ×${priceIndex}.`;
  else if (pct >= 3) line = `§6📉 Prices rise ${pct}% (index ×${priceIndex}).`;
  else if (pct <= -2) line = `§b📈 Deflation ${pct}% — coin is scarce; stalls may close.`;
  else line = `§7📊 Prices steady (${pct >= 0 ? "+" : ""}${pct}%, index ×${priceIndex}).`;
  return { inflation: pct, priceIndex, line };
}

/**
 * Demonetization edict: old notes invalid, press credibility restored.
 * Crushes inflation but shocks happiness and trade for a day.
 */
export function demonetize(state) {
  state.inflation.pct = 0;
  state.inflation.priceIndex = Math.max(1, Math.round(state.inflation.priceIndex * 0.8 * 1000) / 1000);
  state.market.priceIndex = state.inflation.priceIndex;
  for (const c of state.citizens) {
    if (c.alive) c.mood = Math.max(5, (c.mood ?? 70) - 12);
  }
  ledgerMint(state, "demonetize", { index: state.inflation.priceIndex });
  return `§6🏦 Demonetization decreed — old notes void in 7 days. Inflation crushed; the bazaar grumbles (−12 mood).`;
}

/** Mint dashboard for the Kingdom Menu. */
export function mintDashboard(state) {
  const m = state.mint ?? defaultMint();
  const inf = state.inflation ?? defaultInflation();
  return (
    `§6§l🏦 Royal Mint §r§7· money supply §f₹${Math.round(state.moneySupply)}\n` +
    `§7Paper §f${m.paper} §7· ink §f${m.ink} §7· plates §f${m.plates} §7(wear ${m.plateWear}%)\n` +
    `§7Batches printed §f${m.batchesPrinted} §7(₹${m.batchesPrinted * BATCH_RUPEES} face)\n` +
    `§7Inflation §f${inf.pct}% §7· price index §f×${inf.priceIndex} §7· reserve cover §f${inf.reserveCoverPct}%\n` +
    `§8Per ₹100 batch: 1 paper (3 cane) + 1 ink + plate · fees ₹${BATCH_LABOR + BATCH_WEAR_COST}`
  );
}
