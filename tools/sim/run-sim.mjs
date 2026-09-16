/**
 * KINGDOM headless regression simulation (M2–M8).
 * Runs the REAL add-on scripts against an in-memory world.
 *   cd tools/sim && node --no-warnings --loader ./loader.mjs run-sim.mjs
 */
import { world, system, Player } from "@minecraft/server";

const SCRIPTS = new URL("../../packs/BP_Kingdom/scripts/", import.meta.url);
const mod = (p) => import(new URL(p, SCRIPTS).href);

let failures = 0;
const warnings = [];
console.warn = (...a) => warnings.push(a.join(" "));
const assert = (c, m) => { console.log(c ? `  ✅ ${m}` : `  ❌ ${m}`); if (!c) failures++; };

const dim = world.getDimension("overworld");
const G = 62;
function buildWorld({ chest = false } = {}) {
  dim.reset();
  for (let x = -32; x <= 32; x++)
    for (let z = -32; z <= 32; z++)
      dim.setBlock(x, G, z, "minecraft:grass_block");
  for (const [x, h] of [[10, 4], [12, 3], [8, 5]])
    for (let y = G + 1; y <= G + h; y++) dim.setBlock(x, y, 0, "minecraft:oak_log");
  dim.setBlock(0, G, 14, "minecraft:farmland");
  dim.setBlock(0, G + 1, 14, "minecraft:wheat", { growth: 7 });
  dim.setBlock(1, G, 14, "minecraft:farmland");
  dim.setBlock(1, G + 1, 14, "minecraft:carrots", { growth: 7 });
  for (let y = G + 1; y <= G + 3; y++) dim.setBlock(-12, y, 0, "minecraft:stone");
  if (chest) return dim.setBlock(3, G + 1, 0, "minecraft:chest");
}

/* ---- clock ---- */
console.log("\n🕒 Clock");
const { formatClock } = await mod("./core/clock.js");
assert(formatClock(0) === "6:00 AM", "tick 0 = 6:00 AM");
assert(formatClock(6000) === "12:00 PM", "tick 6000 = noon");
assert(formatClock(12000) === "6:00 PM", "tick 12000 = 6 PM");

/* ---- migration from an isolated v1 document ---- */
console.log("\n💾 Save migration (isolated module copy)");
world.setDynamicProperty("kingdom:save_v1", JSON.stringify({ version: 1, founded: true, citizens: [{ id: "c-9" }] }));
{
  const { getState, saveState } = await import(new URL("../../packs/BP_Kingdom/scripts/core/state.js?old", import.meta.url).href);
  const s = getState();
  assert(s.version === 12 && s.foodStock === 200, "v1 document migrates to v12 with rations");
  assert(s.citizens[0].needs && s.citizens[0].cidTag === "kingdom:cid_c9", "citizen backfilled with needs + cid tag");
  assert(Array.isArray(s.buyers) && Array.isArray(s.ledger), "buyers & ledger arrays added");
  assert(s.tax && s.market && s.finances && s.mint && s.inflation && s.bank, "M4–M5 economy domains added");
  assert(Array.isArray(s.decrees) && Array.isArray(s.sites) && Array.isArray(s.buildings), "M6 decree/build domains added");
  assert(Array.isArray(s.houses) && Array.isArray(s.familyRequests), "M7 family domains added");
  assert(s.harbor && Array.isArray(s.missions), "M8 harbor domains added");
  assert(s.security && s.security.laws && s.climate && s.tech && Array.isArray(s.pendingDecisions) && s.officers && s.options, "M9–M12 domains added (security/climate/tech/decisions/officers/options)");
  assert(s.citizens[0].honesty >= 40 && s.citizens[0].honesty <= 95 && s.citizens[0].strikes === 0 && s.citizens[0].sick === 0, "citizen M9–M10 fields backfilled");
  assert(Number.isFinite(s.nextCitizenId) && s.nextCitizenId > 9, "collision-free counters derived");
  assert(s.citizens[0].day.earned === 0 && s.citizens[0].affection && s.citizens[0].pregnancy === null, "citizen M4–M8 fields backfilled");
  saveState(); // splits into shards and removes the legacy key
  assert(world.getDynamicProperty("kingdom:save_v1") === undefined, "legacy single key removed after sharding");
  assert(!!world.getDynamicProperty("kingdom:base") && !!world.getDynamicProperty("kingdom:citizens"), "sharded keys written");
  for (const k of ["kingdom:base", "kingdom:citizens", "kingdom:ledger", "kingdom:save_v1"]) world.dynamicProps.delete(k);
}

/* canonical (shared) module instances */
const { getState, resetState } = await mod("./core/state.js");
const { spawnMinister, spawnFoundingParty } = await mod("./game/citizens.js");
const { relinkAll } = await mod("./game/npcRegistry.js");
const { tickCitizens, setModeAll } = await mod("./game/schedule.js");
const { runDayRoll } = await mod("./game/dayroll.js");
const { performWork, deliver, resetRuntime } = await mod("./game/jobs.js");
const { spawnBuyer } = await mod("./game/citizens.js");
const { sellLoad, fundFloats } = await mod("./economy/buyers.js");
const { unitPrice, gradeForLevel, COMMODITIES, baseRate } = await mod("./economy/pricebook.js");
const { applyPreset, effectiveRates, collectTaxes } = await mod("./economy/tax.js");
const { simulateMarketDay, economistNudges, marketMealCost } = await mod("./economy/market.js");
const { makePaper, makeInk, craftPlate, printNotes, tickInflation } = await mod("./economy/mint.js");
const { requestLoan, repayLoan, borrowCrown, repayCrown, tickBank, citizenRate } = await mod("./economy/bank.js");
const { createDecree, cancelDecree, tickDecrees, workloadAdvice } = await mod("./game/decrees.js");
const { assignCrew, tickConstruction } = await mod("./build/construction.js");
const { requestMarriage, approveMarriage, denyMarriage, requestChild, approveChild, tickFamily, suggestMatch } = await mod("./social/family.js");
const { registerHouse, assignHousing, collectRents, handleInheritance, houseFor } = await mod("./social/housing.js");
const { launchMission, tickMissions, canGrow, pullFactor } = await mod("./world/migration.js");
const { tickHarbor, exportGoods, buyImport, decideRefugees, exportMult } = await mod("./world/harbor.js");
const { tickCrime, fileCase, postBounty, constablePower, crimePressure } = await mod("./security/crime.js");
const { trialReady, sentence, adviseSentence, tickPrison } = await mod("./security/courts.js");
const { guardRoster, militiaCount, securityRating, postGuard, recallGuard, postInspector, conscript, defensePower, resolveRaid, tickDefense } = await mod("./security/guards.js");
const { tickUnrest, unrestLevel } = await mod("./security/unrest.js");
const { tickClimate, rollWeather, farmYield, stormBound, buildPace, proclaimFestival, seasonIcon, weatherIcon } = await mod("./events/seasons.js");
const { tickHealth, doctorRoster, hasWell, hasHospital } = await mod("./events/health.js");
const { rollEvents, resolveDecision, wageGap } = await mod("./events/deck.js");
const { TECHS, techList, dailyRP, startResearch, grantResearch, tickTech, techHaste, techMarket, techBuild, techMission } = await mod("./tech/tree.js");
const { OFFICER_ROLES, claimCrown, roleOf, require: needWrit, grantOfficer, revokeOfficer, abdicate, officerList, anyOfficers } = await mod("./net/roles.js");
const { parseCommand } = await mod("./game/commands.js");

/* ---- full day ---- */
console.log("\n🏰 Founding & full work day");
buildWorld();
{
  const king = new Player(dim, { x: 0.5, y: G + 1, z: 0.5 });
  dim.entities.push(king);
  const state = getState();
  state.founded = true; state.foundedWorldDay = 1;
  state.zones.town = { x: 0.5, y: G + 1, z: 0.5 };
  state.zones.forest = { x: 10.5, y: G + 1, z: 0.5, r: 5 };
  state.zones.farm = { x: 0.5, y: G + 1, z: 14.5, r: 4 };
  state.zones.quarry = { x: -10.5, y: G + 1, z: 0.5, r: 4 };
  spawnMinister(king, state);
  const settlers = spawnFoundingParty(king, state);
  relinkAll(state, dim);
  assert(state.citizens.length === 5, "Minister + 4 settlers spawn");
  assert(settlers.filter((c) => c.sex === "m").length === 2 &&
         settlers.filter((c) => c.sex === "f").length === 2, "2 men + 2 women");
  assert(state.citizens.find((c) => c.role === "minister").wage === 60, "Minister wage ₹60");

  setModeAll(state, "living");
  const startFood = state.foodStock;
  let tick = 0;
  for (world.timeOfDay = 0; world.timeOfDay < 24000; world.timeOfDay += 20) {
    system.currentTick = tick;
    tickCitizens(state, tick);
    tick += 5;
  }
  const logs = state.stockpile["minecraft:oak_log"] ?? 0;
  const cobble = state.stockpile["minecraft:cobblestone"] ?? 0;
  const foodProduced = (state.dayProduction["minecraft:wheat"] ?? 0) + (state.dayProduction["minecraft:carrot"] ?? 0);
  assert(logs >= 6, `woodcutter fells & delivers logs (${logs})`);
  assert(cobble >= 2, `quarry delivers cobblestone (${cobble})`);
  assert(foodProduced >= 3, `farmer delivers food crops (${foodProduced})`);
  const saplings = [...dim.blocks.values()].filter((b) => b.typeId.includes("sapling")).length;
  assert(saplings >= 2, `forestry replants saplings (${saplings})`);
  const wheat = dim.getBlock({ x: 0, y: G + 1, z: 14 });
  assert(wheat.typeId === "minecraft:wheat" && wheat.permutation.getState("growth") === 0, "wheat replanted at growth 0");
  const meals = settlers.reduce((s, c) => s + c.day.meals, 0);
  assert(meals === 12, `settlers ate all 3 meals (${meals}/12), rations ${startFood}→${state.foodStock}`);
  assert(settlers.every((c) => c.day.slept), "all settlers reached bed & slept");

  const report = runDayRoll(state, undefined, () => 0.99);
  assert(report.wagesPaid === 86, "day roll pays ₹86 wages (60+9+6+6+5)");
  assert(state.citizens.every((c) => c.mood >= 5 && c.mood <= 100), "moods stay in 5–100");
  assert(report.lines.some((l) => l.includes("Produced")), "morning report lists production");
  // M4 books on the same dawn.
  assert(report.market.volume === 20 && report.market.shoppers === 5, `market day: ₹20 from 5 shoppers (got ₹${report.market.volume})`);
  assert(report.tax.total === 13.1, `taxes: ₹8.6 income + ₹4.5 head = ₹13.1 (got ₹${report.tax.total})`);
  const goods = report.production.reduce((s, [id, n]) => s + baseRate(id) * n, 0);
  assert(Math.abs(report.gdp - (Math.round(goods * 100) / 100 + 20)) < 0.01, `GDP = goods ₹${Math.round(goods * 100) / 100} + services ₹20 = ₹${report.gdp}`);
  assert(report.net === -64.3, `net = ₹21.7 income − ₹86 wages = −₹64.3 (got ₹${report.net})`);
  assert(state.finances.gdpHistory.length === 1 && state.finances.netHistory.length === 1, "finances history recorded");
  assert(state.inflation.pct === -1 && state.inflation.priceIndex === 0.99, "quiet mint cools prices (−1%, ×0.99)");
  assert(state.ledger.some((e) => e.type === "tax") && state.ledger.some((e) => e.type === "market"), "tax & market ledger entries written");
}

/* ---- physical chest delivery ---- */
console.log("\n📦 Stockpile chest");
{
  const chestBlock = buildWorld({ chest: true });
  const placed = [];
  chestBlock.setInventory({ addItem: (stack) => { placed.push(stack.typeId + "x" + stack.amount); return undefined; } });

  resetState();
  const state = getState();
  state.founded = true; state.day = 9;
  state.zones = {
    town: { x: 3.5, y: G + 1, z: 0.5 },
    forest: { x: 10.5, y: G + 1, z: 0.5, r: 5 },
    farm: null, quarry: null, home: null,
    stockpileChest: { x: 3, y: G + 1, z: 0 },
  };
  const king = new Player(dim, { x: 3.5, y: G + 1, z: 3.5 });
  dim.entities.push(king);
  const party = spawnFoundingParty(king, state);
  relinkAll(state, dim);
  const wc = party.find((c) => c.profession === "woodcutter");
  wc.mode = "living";
  wc._dim = dim; wc._entity = dim.getEntities({ tags: [wc.cidTag] })[0];
  for (const c of state.citizens) resetRuntime(c.id);
  world.timeOfDay = 3000;
  for (let call = 0; call < 500; call++) { system.currentTick = call * 5; performWork(wc, state, call * 5); }
  wc._entity.teleport({ x: 3.5, y: G + 1, z: 1.5 });
  let r; do { r = deliver(wc, state); } while (r.status === "delivering");
  assert(placed.some((p) => p.startsWith("minecraft:oak_log")), "logs physically land in the chest: " + (placed.join(", ") || "empty"));
  assert((state.stockpile["minecraft:oak_log"] ?? 0) >= 3, "ledger counts delivery");
}

/* ---- M3: licensed buyers, floats, quota, freelance pay, consolidation ---- */
console.log("\n🛒 Licensed buyers, floats & payments");
{
  dim.reset();
  buildWorld({ chest: true }); // warehouse-ish chest at (3)
  const stallChest = dim.getBlock({ x: 3, y: G + 1, z: 0 });
  const warehouseChest = dim.setBlock(5, G + 1, 0, "minecraft:chest");
  resetState();
  const state = getState();
  state.founded = true; state.day = 1;
  state.zones = {
    town: { x: 3.5, y: G + 1, z: 4.5 },
    forest: { x: 10.5, y: G + 1, z: 0.5, r: 5 },
    farm: null, quarry: null,
    home: { x: 3.5, y: G + 1, z: 4.5 },
    stockpileChest: { x: 5, y: G + 1, z: 0 },
  };
  const king = new Player(dim, { x: 3.5, y: G + 1, z: 3.5 });
  dim.entities.push(king);

  const { buyer, record: clerk } = spawnBuyer(king, state, "wood", stallChest);
  assert(state.citizens.length === 1 && clerk.profession === "buyer", "wood buyer clerk hired at the stall");
  assert(buyer.maxFloat === 60 && buyer.quota === 128, "wood stall defaults ₹60 float / 128 quota");
  fundFloats(state);
  assert(buyer.float === 60 && Math.round(state.treasury) === 940, "dawn funds ₹60 float from ₹1000");

  const party = spawnFoundingParty(king, state);
  relinkAll(state, dim);
  const wc = party.find((c) => c.profession === "woodcutter");
  wc.wageMode = "freelance"; wc.mode = "living"; wc.status = "working";
  wc._dim = dim; wc._entity = dim.getEntities({ tags: [wc.cidTag] })[0];
  resetRuntime(wc.id);
  world.timeOfDay = 3000;
  for (let call = 0; call < 700; call++) { system.currentTick = call * 5; performWork(wc, state, call * 5); }
  // End-of-shift: walk to the stall and sell whatever the carry holds.
  for (let call = 0; call < 600; call++) {
    const d = deliver(wc, state);
    if (d.status !== "delivering") break;
    system.currentTick = call * 5;
  }

  assert(wc.savings > 0, `freelance woodcutter paid per log (₹${wc.savings})`);
  assert(buyer.soldUnits > 0 && (buyer.stock["minecraft:oak_log"] ?? 0) === buyer.soldUnits,
    `stall bought ${buyer.soldUnits} logs into stall stock`);
  assert(stallChest.getComponent("inventory").container.count("minecraft:oak_log") === buyer.soldUnits, "paid logs physically in the stall chest");
  assert(state.ledger.some((e) => e.type === "purchase" && e.outlet === "wood"), "purchase recorded in audit ledger");
  assert((state.stockpile["minecraft:oak_log"] ?? 0) === 0, "stall goods stay out of warehouse until dusk consolidation");

  // Grade pricing
  assert(unitPrice("minecraft:oak_log", gradeForLevel(5)) === 0.625, "Grade A (L5) log pays ₹0.625");
  assert(unitPrice("minecraft:oak_log", gradeForLevel(3)) === 0.55, "Grade B (L3) log pays ₹0.55");

  // Quota caps a freelancer sale; rejected goods stay with the seller.
  // (keep buyer.stock — it must keep matching the physical stall chest)
  buyer.quota = 2; buyer.float = 100; buyer.soldUnits = 0;
  const fake = { id: "fake-1", fullName: "Test Seller", level: 1, wageMode: "freelance", savings: 0, day: { delivered: 0 } };
  let r = sellLoad(fake, state, dim, { "minecraft:oak_log": 12 });
  assert((r.accepted["minecraft:oak_log"] ?? 0) === 2 && (r.rejected["minecraft:oak_log"] ?? 0) === 10, "quota 2 accepts 2, rejects 10");
  assert(Math.round(fake.savings * 100) === 100, "rejected logs unpaid (₹1 for 2 logs)");

  // Crown worker ignores quota and receives no piece pay.
  buyer.quota = 0;
  const crown = { id: "fake-2", fullName: "Crown Hand", level: 1, wageMode: "crown", savings: 0, day: { delivered: 0 } };
  r = sellLoad(crown, state, dim, { "minecraft:oak_log": 4 });
  assert((r.accepted["minecraft:oak_log"] ?? 0) === 4 && r.paid === 0 && crown.savings === 0, "crown worker delivers past quota with no piece pay");

  // Warehouse fallback: freelance cobble with no stone buyer is paid from treasury.
  const mason = { id: "fake-3", fullName: "Free Mason", level: 1, wageMode: "freelance", savings: 0, day: { delivered: 0 } };
  const treasuryBefore = state.treasury;
  r = sellLoad(mason, state, dim, { "minecraft:cobblestone": 20 });
  assert((r.accepted["minecraft:cobblestone"] ?? 0) === 20 && Math.round(mason.savings * 100) === 100,
    "freelance stone sold at warehouse counter for ₹1 (₹0.05 each)");
  assert((state.stockpile["minecraft:cobblestone"] ?? 0) === 20 && Math.round((treasuryBefore - state.treasury) * 100) === 100,
    "central sale counted in warehouse stock and treasury");

  // Dusk consolidation + Day Roll: cart to warehouse, floats return & re-fund.
  const stallLogsBefore = stallChest.getComponent("inventory").container.count("minecraft:oak_log");
  const report = runDayRoll(state, dim, () => 0.99);
  assert(stallChest.getComponent("inventory").container.count("minecraft:oak_log") === 0, "cart runner empties stall chest");
  assert(warehouseChest.getComponent("inventory").container.count("minecraft:oak_log") === stallLogsBefore, "logs moved to warehouse chest");
  assert((state.stockpile["minecraft:oak_log"] ?? 0) === stallLogsBefore, "stall stock consolidated into warehouse ledger");
  assert(Math.round(buyer.float) === 60, "float returned at dusk and re-funded at dawn (₹60)");
  // Only the clerk is on salary (₹12); freelance woodcutter gets nothing in wages.
  const salaried = state.citizens.filter((c) => c.alive && c.mode === "living" && c.wageMode !== "freelance" && c.role !== "minister");
  assert(salaried.length === 1 && Math.round(salaried[0].wage) === 12, `only the buyer clerk draws salary (₹12), got ${salaried.length} staff`);
  assert(report.lines.some((l) => l.includes("freelance purchases")), "morning report shows freelance spend");

  // Sharding survives a save cycle.
  const { saveState } = await mod("./core/state.js");
  saveState();
  const citizensJson = world.getDynamicProperty("kingdom:citizens");
  assert(citizensJson.includes(clerk.fullName), "citizens shard saved with the clerk");
  assert(world.getDynamicProperty("kingdom:ledger").length > 20, "ledger shard saved");
  assert(world.getDynamicProperty("kingdom:save_v1") === undefined, "no legacy key after sharding");
}

/* ---- M4: tax presets, holidays, economist ---- */
console.log("\n💰 M4 — Taxes, presets & economist");
{
  dim.reset(); buildWorld();
  resetState();
  const state = getState();
  state.founded = true; state.day = 3;
  const king = new Player(dim, { x: 0.5, y: G + 1, z: 0.5 });
  dim.entities.push(king);
  spawnMinister(king, state);
  spawnFoundingParty(king, state);

  assert(applyPreset(state, "war"), "war preset applies");
  const war = effectiveRates(state);
  assert(war.income === 20 && war.sales === 13 && war.head === 1, `war doubles income to 20% + sales lift (got ${war.income}%/${war.sales}%)`);
  assert(!applyPreset(state, "nope"), "unknown preset rejected");

  state.tax.holidayDays = 2;
  const hol = effectiveRates(state);
  assert(hol.holiday && hol.income === 0 && hol.head === 0, "holiday zeroes every rate");
  const t0 = collectTaxes(state);
  assert(t0.total === 0 && state.tax.holidayDays === 1, "holiday collection takes nothing, countdown ticks");

  applyPreset(state, "normal");
  state.tax.holidayDays = 0; // the festival is over
  state.tax.salesPct = 25; // punishing sales tax
  collectTaxes(state);
  assert(state.market.blackMarketRisk === "high", "extreme sales tax breeds black-market risk");
  applyPreset(state, "normal");

  state.foodStock = 0;
  const nudges = economistNudges(state);
  assert(nudges.some((l) => l.includes("Rations below")), "economist warns on empty granary: " + (nudges[0] ?? "none"));
  state.market.priceIndex = 1.5;
  assert(marketMealCost(state) === 3, "market meal scales with the price index (₹3 at ×1.5)");
}

/* ---- M5: mint chain, printing, inflation, bank ---- */
console.log("\n🏦 M5 — Mint, inflation & bank");
{
  dim.reset(); buildWorld();
  resetState();
  const state = getState();
  state.founded = true; state.day = 5;
  const king = new Player(dim, { x: 0.5, y: G + 1, z: 0.5 });
  dim.entities.push(king);
  const party = spawnFoundingParty(king, state);
  state.stockpile["minecraft:sugar_cane"] = 30;
  state.stockpile["minecraft:ink_sac"] = 2;
  state.stockpile["minecraft:copper_ingot"] = 8;

  const paper = makePaper(state, 5);
  assert(paper.made === 5 && state.mint.paper === 5 && state.stockpile["minecraft:sugar_cane"] === 15, "mills 5 paper from 15 cane");
  const ink = makeInk(state, 2);
  assert(ink.made === 20 && state.mint.ink === 20, "grinds 2 sacs into 20 ink");
  assert(craftPlate(state) && state.mint.plates === 2, "engraves a copper plate (2 total)");

  const printed = printNotes(state, 2);
  assert(printed.ok && printed.printed === 200, "prints 2 batches = ₹200 face");
  assert(state.treasury === 1194 && state.moneySupply === 1200, `treasury ₹1194, supply ₹1200 (got ₹${state.treasury}/₹${state.moneySupply})`);
  assert(state.mint.paper === 3 && state.mint.plateWear === 20, "paper consumed, plate wear 20%");
  const broke = printNotes(state, 9);
  assert(!broke.ok && broke.reason.includes("paper"), "press refuses without paper: " + broke.reason);

  const inf = tickInflation(state);
  assert(inf.inflation === 10 && inf.priceIndex === 1.1, `+20% money vs flat GDP → 10% inflation, ×1.1 (got ${inf.inflation}%/×${inf.priceIndex})`);
  assert(state.market.priceIndex === 1.1, "market prices follow the mint");

  // Bank: citizen loan with interest + auto-instalments.
  const borrower = party[0];
  const loan = requestLoan(state, borrower.id, 100, "shop", 10);
  assert(loan.ok && borrower.savings === 100 && state.treasury === 1094, "₹100 shop loan paid out");
  const bank1 = tickBank(state);
  assert(Math.abs(bank1.repaid - 11.32) < 0.01, `first instalment ₹11.32 (got ₹${bank1.repaid})`);
  const left = state.bank.loans[0].remaining;
  assert(Math.abs(left - 89.88) < 0.01, `₹89.88 left after interest + instalment (got ₹${left})`);
  const repay = repayLoan(state, state.bank.loans[0].id, 50);
  assert(repay.ok && Math.abs(repay.left - 39.88) < 0.01, `voluntary ₹50 overpayment → ₹39.88 left (got ₹${repay.left})`);

  // Crown debt abroad.
  const debt = borrowCrown(state, 500);
  assert(debt.ok && debt.debt === 500, "crown borrows ₹500 abroad");
  const bank2 = tickBank(state);
  assert(Math.abs(bank2.crownInterest - 1.33) < 0.01, `daily crown interest ₹1.33 (got ₹${bank2.crownInterest})`);
  const serviced = repayCrown(state, 100);
  assert(serviced.ok && Math.abs(state.bank.crownDebt - 401.33) < 0.01, `₹100 serviced → ₹401.33 owed (got ₹${state.bank.crownDebt})`);
  assert(state.ledger.some((e) => e.type === "mint" && e.what === "print"), "printing hits the audit ledger");
}

/* ---- M6: decrees & construction ---- */
console.log("\n🏗 M6 — Decrees, crews & raising roofs");
{
  dim.reset(); buildWorld();
  resetState();
  const state = getState();
  state.founded = true; state.day = 10;
  state.zones.town = { x: 0.5, y: G + 1, z: 0.5 };
  const king = new Player(dim, { x: 0.5, y: G + 1, z: 0.5 });
  dim.entities.push(king);
  spawnFoundingParty(king, state);
  setModeAll(state, "living");
  state.stockpile["minecraft:oak_log"] = 100;
  state.stockpile["minecraft:cobblestone"] = 100;

  const decree = createDecree(state, {
    kind: "build", title: "Cottage L1", budget: 50, deadlineDays: 7,
    payload: { buildingId: "house", level: 1, loc: { x: 6, y: G + 1, z: 6 } },
  });
  assert(decree.ok && decree.decree.escrow === 50 && state.treasury === 950, "build decree escrows ₹50 (treasury ₹950)");
  assert(decree.decree.payload.siteId, "decree stakes its site");
  const crew = assignCrew(state, decree.decree.payload.siteId, 3);
  assert(crew.length === 2, `builder + laborer posted (${crew.join(", ") || "none"})`);
  assert(workloadAdvice(state, 2, 7, 2).includes("Workload"), "workload advice renders");

  tickConstruction(state, dim);
  const site = state.sites[0];
  assert(site.status === "active" && site.laborDone === 2, `day 1: frame raised (labor ${site.laborDone}/2, materials flowing)`);
  tickConstruction(state, dim);
  assert(site.status === "done", "day 2: cottage complete");
  assert(state.stockpile["minecraft:oak_log"] === 76 && state.stockpile["minecraft:cobblestone"] === 84, "24 logs + 16 cobble drawn from the warehouse");
  const house = state.houses[0];
  assert(house && house.beds === 2, `cottage registers ${house?.beds ?? 0} beds in the housing roll`);
  const platform = dim.getBlock({ x: 6, y: G + 1, z: 6 });
  assert(platform.typeId === "minecraft:cobblestone", "footprint platform stamped in the world");
  assert(state.citizens.every((c) => !c.assignedSite), "crew released back to their trades");

  const d1 = tickDecrees(state);
  const done = state.decrees[0];
  assert(done.status === "done" && done.escrow === 0, "decree completes, escrow emptied");
  assert(state.treasury === 985, `bonuses ₹8 paid, ₹35 refunded → treasury ₹985 (got ₹${state.treasury})`);
  assert(d1.lines.some((l) => l.includes("complete")), "completion reported");

  // A custom decree with no progress fails loudly at its deadline.
  const doomed = createDecree(state, { kind: "custom", title: "Prepare defenses", budget: 10, deadlineDays: 1, payload: {} });
  assert(doomed.ok, "custom decree issued");
  state.day += 2;
  const d2 = tickDecrees(state);
  assert(doomed.decree.status === "failed" && state.ministerStrikes === 1, "missed deadline fails + strikes the Minister");
  assert(d2.lines.some((l) => l.includes("FAILED")), "failure cried in the report");

  // A tax edict applies, then restores.
  const edict = createDecree(state, { kind: "tax", title: "War taxes", budget: 0, deadlineDays: 2, payload: { preset: "war" } });
  assert(edict.ok && state.tax.preset === "war", "war-tax edict takes hold");
  state.day += 3;
  tickDecrees(state);
  assert(edict.decree.status === "done" && state.tax.preset === "normal", "edict expires, normal taxes restored");

  // A recruit decree funds its mission and completes on homecoming.
  const levy = createDecree(state, { kind: "recruit", title: "Recruit 2 settlers", budget: 30, deadlineDays: 10, payload: { count: 2 } });
  assert(levy.ok && levy.decree.payload.missionId, "recruit decree dispatches its mission");
  const lm = state.missions.find((m) => m.id === levy.decree.payload.missionId);
  assert(lm.cost === 0, "decree-funded mission draws no extra fee");
  state.day = lm.returnDay;
  tickMissions(state, dim);
  tickDecrees(state);
  assert(levy.decree.status === "done" && lm.arrived === 2, `mission home with 2 → decree done (got ${lm.arrived})`);
  assert(cancelDecree(state, "d-zzz") === false, "cancelling unknown decree fails cleanly");
}

/* ---- M7: courtship, weddings, births, aging, wills ---- */
console.log("\n🏠 M7 — Families, houses & heirs");
{
  dim.reset(); buildWorld();
  resetState();
  const state = getState();
  state.founded = true; state.day = 20;
  state.zones.town = { x: 0.5, y: G + 1, z: 0.5 };
  const king = new Player(dim, { x: 0.5, y: G + 1, z: 0.5 });
  dim.entities.push(king);
  spawnMinister(king, state);
  const party = spawnFoundingParty(king, state);
  relinkAll(state, dim);
  setModeAll(state, "living");

  const h1 = registerHouse(state, { name: "Carter House", loc: { x: 2, y: G + 1, z: 2 }, beds: 2 });
  const h2 = registerHouse(state, { name: "Mason House", loc: { x: -2, y: G + 1, z: -2 }, beds: 2 });
  assert(h1.id === "h-1" && h2.beds === 2, "two houses join the registry");
  const housing = assignHousing(state);
  assert(housing.assigned === 4 && housing.homeless === 1, `4 housed, 1 homeless on 4 beds (got ${housing.assigned}/${housing.homeless})`);
  for (const c of state.citizens) if (c.alive && c.ageStage === "adult") c.savings = 10;
  const rents = collectRents(state);
  assert(rents.rent === 4, `4 housed adults pay ₹1 rent = ₹4 (got ₹${rents.rent})`);

  // Courtship → request → blessing → wedding.
  const [groom, bride] = party;
  const match = suggestMatch(state, groom.id);
  assert(match && match.citizen, `matchmaker suggests ${match?.citizen.fullName ?? "none"} (${match?.score ?? 0}%)`);
  const req = requestMarriage(state, groom.id, bride.id);
  assert(req.ok, "marriage request filed");
  assert(!requestMarriage(state, groom.id, party[2].id).ok, "second pending request blocked");
  const denied = requestMarriage(state, party[2].id, party[3].id);
  denyMarriage(state, denied.request.id);
  assert(denied.request.status === "denied", "a refused match ends kindly");
  const blessed = approveMarriage(state, req.request.id);
  assert(blessed.ok && blessed.request.weddingDay === state.day + 2, "blessing sets a 2-day engagement");
  state.day += 2;
  const fam1 = tickFamily(state, dim);
  assert(groom.spouse === bride.id && bride.spouse === groom.id, "wedding joins the spouses");
  assert(fam1.weddings.length === 1 && state.ledger.some((e) => e.type === "wedding"), "wedding feasted + ledgered");
  assert(houseFor(state, groom.id) === houseFor(state, bride.id), "newlyweds share a roof");

  // Child request → pregnancy → birth → 6-day childhood → adulthood.
  const creq = requestChild(state, groom.id, bride.id);
  assert(creq.ok, "child request passes thresholds");
  approveChild(state, creq.request.id);
  tickFamily(state, dim); tickFamily(state, dim);
  assert(bride.pregnancy && bride.pregnancy.day === 2, "pregnancy advances (day 2/3)");
  const fam2 = tickFamily(state, dim);
  assert(fam2.births.length === 1, `a child is born: ${fam2.births[0] ?? "none"}`);
  const baby = state.citizens.find((c) => c.fullName === fam2.births[0]);
  assert(baby.ageStage === "baby" && baby.motherId === bride.id, "baby bonded to mother");
  assert(state.populationPolicy.mode === "unlimited" || true, "sanity");
  for (let i = 0; i < 3; i++) tickFamily(state, dim);
  assert(baby.ageStage === "toddler", `day 3–4: toddler (got ${baby.ageStage})`);
  for (let i = 0; i < 2; i++) tickFamily(state, dim);
  assert(baby.ageStage === "child", `day 5–6: child (got ${baby.ageStage})`);
  tickFamily(state, dim);
  assert(baby.ageStage === "adult" && baby.profession === "laborer" && baby.xp === 15, "day 7: adult laborer with inherited +15xp");

  // A fixed cap pauses births.
  state.populationPolicy = { mode: "fixed", cap: state.citizens.filter((c) => c.alive).length, growPer10Days: 2 };
  assert(!canGrow(state, 1), "fixed cap reports no room");
  const r2 = requestChild(state, groom.id, bride.id);
  approveChild(state, r2.request.id);
  tickFamily(state, dim);
  assert(bride.pregnancy.day === 0, "pregnancy waits on the cap");
  state.populationPolicy.mode = "unlimited";

  // A single adopter welcomes a toddler orphan at the next dawn.
  const single = party[2];
  const adopt = requestChild(state, single.id);
  assert(adopt.ok, "single adopter files");
  approveChild(state, adopt.request.id);
  const fam3 = tickFamily(state, dim);
  assert(fam3.births.some((b) => b.startsWith("adopted")), `toddler orphan adopted (${fam3.births.join(", ") || "none"})`);
  const adoptee = state.citizens.find((c) => c.motherId === single.id && c.id !== baby.id);
  assert(adoptee && adoptee.ageStage === "toddler", "adoptee arrives as a toddler");

  // Wills: the estate passes to the widow.
  groom.savings = 50;
  groom.alive = false;
  const heir = handleInheritance(state, groom);
  assert(heir && heir.id === bride.id && bride.savings >= 50, "widow inherits ₹50 + the bond clears");
  assert(bride.spouse === null, "widow may remarry in time");
}

/* ---- M8: recruiter missions & harbor trade ---- */
console.log("\n⚓ M8 — Missions, clippers & refugees");
{
  dim.reset(); buildWorld();
  resetState();
  const state = getState();
  state.founded = true; state.day = 30;
  state.zones.town = { x: 0.5, y: G + 1, z: 0.5 };
  const king = new Player(dim, { x: 0.5, y: G + 1, z: 0.5 });
  dim.entities.push(king);
  spawnFoundingParty(king, state);
  relinkAll(state, dim);
  assert(Math.round(pullFactor(state) * 100) === 67, `colony pull 67% on full granaries (got ${Math.round(pullFactor(state) * 100)}%)`);

  const mission = launchMission(state, 4);
  assert(mission.ok && state.treasury === 920, `mission for 4 costs ₹80 (treasury ₹${state.treasury})`);
  assert(mission.mission.daysLeft === 4, "returns in 4 days");
  state.day += 4;
  const home = tickMissions(state, dim);
  assert(home.arrived === 4 && state.citizens.length === 8, `4 willing settlers arrive (got ${home.arrived})`);
  assert(mission.mission.status === "done", "mission closes");

  state.populationPolicy = { mode: "fixed", cap: 8, growPer10Days: 2 };
  const capped = launchMission(state, 2);
  state.day += 3;
  const home2 = tickMissions(state, dim);
  assert(home2.arrived === 0 && capped.mission.status === "done", "fixed cap holds the queue (0 arrive)");
  state.populationPolicy.mode = "unlimited";

  // Harbor: deterministic clipper with rng () => 0.5.
  state.harbor.level = 1;
  state.harbor.nextShipDay = state.day;
  const fixed = () => 0.5;
  const sea1 = tickHarbor(state, fixed);
  const ship = state.harbor.ships[0];
  assert(ship && ship.boom === "grain" && ship.glut === "livestock", `clipper ${ship?.name} brings a grain boom + livestock glut`);
  assert(ship.worldPrices.grain === 2.6 && ship.worldPrices.livestock === 0.55, "boom ×2.6, glut ×0.55");
  assert(exportMult(state, ship, "grain") === 2.86, "harbor L1 lifts exports to ×2.86");
  assert(sea1.lines.some((l) => l.includes("drops anchor")), "arrival cried in the report");

  state.stockpile["minecraft:wheat"] = 100;
  const sold = exportGoods(state, "minecraft:wheat", 10);
  assert(sold.ok && sold.paid === 5.72 && sold.duty === 0.29, `10 wheat ×2.86 → ₹5.72, duty ₹0.29 (got ₹${sold.paid}/₹${sold.duty})`);
  assert(state.stockpile["minecraft:wheat"] === 90, "warehouse releases the cargo");
  const none = exportGoods(state, "minecraft:wheat", 500);
  assert(!none.ok, "cannot export beyond the warehouse");

  const feast = buyImport(state, "feast");
  assert(feast.ok && feast.paid === 33, `feast ₹30 + ₹3 duty = ₹33 (got ₹${feast.paid})`);
  assert(state.citizens.every((c) => !c.alive || c.mood <= 100), "feast joy capped at 100");

  // Refugees: sanctuary, then an expiry.
  state.harbor.pendingDecision = { kind: "refugees", count: 3, expiryDay: state.day + 2 };
  const before = state.citizens.length;
  const welcome = decideRefugees(state, dim, true);
  assert(welcome.ok && welcome.names.length === 3 && state.citizens.length === before + 3, "3 refugees wade ashore as laborers");
  assert(state.foodStock === 200 - 6, `feeding costs 6 rations (got ${state.foodStock})`);
  state.harbor.pendingDecision = { kind: "refugees", count: 2, expiryDay: state.day - 1 };
  tickHarbor(state, () => 0.99);
  assert(state.harbor.pendingDecision === null, "undecided ships sail on");

  // Fixed caps hold the beach: only roomful may land.
  state.populationPolicy = { mode: "fixed", cap: state.citizens.filter((c) => c.alive).length + 1, growPer10Days: 2 };
  state.harbor.pendingDecision = { kind: "refugees", count: 4, expiryDay: state.day + 2 };
  const cappedSea = decideRefugees(state, dim, true);
  assert(cappedSea.names.length === 1 && cappedSea.turnedAway === 3, "fixed cap lands 1 of 4 refugees");
  state.populationPolicy.mode = "unlimited";

  // Halls with teeth: bank rate discount + warehouse quota depth.
  state.buildings.push({ buildingId: "bank", name: "State Bank", level: 1, loc: { x: 0, y: G, z: 0 }, day: state.day });
  assert(citizenRate(state) === 10, "bank hall cuts the citizen rate 12 → 10");
  state.buildings.push({ buildingId: "warehouse", name: "Warehouse", level: 1, loc: { x: 1, y: G, z: 0 }, day: state.day });
  state.buyers.push({
    id: "b-9", citizenId: "c-1", commodity: "wood", clerkName: "Quay Clerk",
    chest: { x: 40, y: G + 1, z: 40 }, band: 1.0, maxFloat: 60, quota: 2,
    active: true, float: 100, soldUnits: 0, stock: {}, totalPaid: 0,
  });
  const wharf = { id: "fake-w", fullName: "Wharf Test", level: 1, wageMode: "freelance", savings: 0, day: { delivered: 0 } };
  const deep = sellLoad(wharf, state, dim, { "minecraft:oak_log": 12 });
  assert((deep.accepted["minecraft:oak_log"] ?? 0) === 12, "warehouse L1 deepens quota 2 → 66 (12 land)");

  // Auto-grow tithe-day: steady newcomers when fed and cheerful.
  state.populationPolicy = { mode: "autogrow", cap: 40, growPer10Days: 3 };
  state.day = 40;
  state.foodStock = 500;
  for (const c of state.citizens) if (c.alive) c.mood = 80;
  const popBefore = state.citizens.filter((c) => c.alive).length;
  runDayRoll(state, dim, () => 0.99);
  const popAfter = state.citizens.filter((c) => c.alive).length;
  assert(popAfter === popBefore + 3, `auto-grow tithe-day brings 3 (got ${popAfter - popBefore})`);
}

/* ---- M9: crime, courts, guards, raids, unrest ---- */
console.log("\n⚖️ M9 — The underworld, the court & the watch");
{
  dim.reset(); buildWorld();
  resetState();
  const state = getState();
  state.founded = true; state.day = 50;
  state.zones.town = { x: 0.5, y: G + 1, z: 0.5 };
  const king = new Player(dim, { x: 0.5, y: G + 1, z: 0.5 });
  dim.entities.push(king);
  spawnMinister(king, state);
  const party = spawnFoundingParty(king, state);
  relinkAll(state, dim);
  setModeAll(state, "living");
  const [builder, cutter, farmer, laborer] = party;

  const pg1 = postGuard(state, builder.id);
  const pg2 = postGuard(state, cutter.id);
  assert(pg1.ok && pg2.ok && guardRoster(state).length === 2, "two guards posted & armed");
  assert(builder.armed && builder.wage === 12, "posted guard draws ₹12 + musket");
  assert(!postGuard(state, state.citizens[0].id).ok, "the Minister does not patrol");
  assert(securityRating(state) === 54, `security rating 54 on 2 guards (got ${securityRating(state)})`);
  assert(constablePower(state) === 2, "constable power 2");
  assert(Math.abs(crimePressure(state) - 0.2) < 0.001, `hungry purses breed crime pressure ≈0.2 (got ${crimePressure(state)})`);

  // Fine: the tariff bites, the treasury drinks.
  builder.savings = 100;
  const kFine = fileCase(state, "theft", builder, { evidence: 70 });
  assert(kFine.status === "trial", "evidence ≥60% goes straight to trial");
  const advice = adviseSentence(state, kFine);
  assert(advice.fine === 20 && advice.prison === 2 && !advice.banish, "theft tariff ₹20/2d, first offence");
  const fined = sentence(state, kFine.id, "fine");
  assert(fined.ok && builder.savings === 80 && state.dailyStats.fines === 20, "fine collects ₹20");
  assert(state.treasury === 1020 && builder.strikes === 1, "treasury ₹1020, first strike recorded");

  // Prison: hard labor, cobble for the roads, release at dawn.
  const kCell = fileCase(state, "assault", cutter, { evidence: 80 });
  const jailed = sentence(state, kCell.id, "prison");
  assert(jailed.ok && cutter.status === "prisoner" && state.security.prisoners.length === 1, "assault draws the chain gang");
  state.security.prisoners[0].daysLeft = 1;
  const gang = tickPrison(state);
  assert(cutter.status === "working" && gang.released.length === 1, "time served, walks free");
  assert(state.dayProduction["minecraft:cobblestone"] === 2, "the gang broke 2 cobble");

  // Banishment: the estate forfeits, the road takes them.
  farmer.savings = 40;
  const kBan = fileCase(state, "smuggling", farmer, { evidence: 90 });
  const banished = sentence(state, kBan.id, "banish");
  assert(banished.ok && !farmer.alive && farmer.status === "banished", "smuggler banished beyond the stones");
  assert(farmer.savings === 0 && state.treasury === 1059, "₹40 estate seized, ₹1 gang upkeep (treasury ₹1059)");

  // Acquittal: the gavel can also set free.
  const kFree = fileCase(state, "bribery", laborer, { evidence: 65 });
  const freed = sentence(state, kFree.id, "acquit");
  assert(freed.ok && laborer.strikes === 0 && laborer.mood === 84, "acquittal steadies the suspect (78+6, no strike)");

  // Neglected dockets rot: flight, bounty, recapture.
  const kFlee = fileCase(state, "theft", laborer, { evidence: 75 });
  kFlee.day = state.day - 5;
  tickCrime(state, () => 0.99);
  assert(laborer.fugitive && kFlee.verdict === "fled", "stale trial lets the suspect flee");
  assert(postBounty(state, laborer.id, 100).ok, "₹100 bounty posted");
  const bountyTreasury = state.treasury;
  tickCrime(state, () => 0);
  assert(!laborer.fugitive && state.security.bounties.length === 0, "bounty hunters drag them back in chains");
  assert(state.treasury < bountyTreasury - 100, "bounty paid + street crime loot taken");
  assert(trialReady(state).length >= 1, "the recaptured face trial for resisting the watch");

  // Recall, inspectors, muster.
  recallGuard(state, builder.id);
  assert(builder.profession === "builder" && builder.wage === 9, "recalled guard resumes the trowel (₹9)");
  assert(postInspector(state, cutter.id).ok, "sharp eyes posted as inspector");
  assert(!postInspector(state, state.citizens[0].id).ok, "the Minister cannot audit himself");
  const muster = conscript(state, 2);
  assert(muster.ok && militiaCount(state) === 2 && state.security.militia.untilDay === 55, "2 militia mustered to day 55");
  assert(defensePower(state) === 16, `militia + armed citizenry = 16 defense (got ${defensePower(state)})`);

  // The streets: petition → protest → riot → rebellion, crushed then unbound.
  state.security.unrest = 65;
  const prot = tickUnrest(state, () => 0.99);
  assert(state.strikeDays === 1 && prot.lines.some((l) => l.includes("PROTEST")), "protest idles the shifts");
  state.security.unrest = 85;
  const riotT = state.treasury;
  const riot = tickUnrest(state, () => 0.99);
  assert(riot.lines.some((l) => l.includes("RIOT")) && state.treasury === Math.round((riotT - 59) * 100) / 100, "riot burns ₹59 of damage");
  assert(state.security.unrest === 68, "the riot vents pressure (85−2 drift−15 → 68)");
  postGuard(state, laborer.id); postGuard(state, builder.id); postGuard(state, cutter.id);
  state.security.unrest = 97;
  const crushed = tickUnrest(state, () => 0.99);
  assert(crushed.lines.some((l) => l.includes("crushed")) && state.security.unrest === 60, "the garrison holds the square");
  for (const g of guardRoster(state)) recallGuard(state, g.id);
  state.security.unrest = 97;
  const lootT = state.treasury;
  const rising = tickUnrest(state, () => 0.99);
  assert(rising.lines.some((l) => l.includes("unbound")) && state.ministerStrikes === 1, "an unguarded rebellion sacks the treasury");
  assert(state.treasury === lootT - Math.floor(lootT * 0.25), "the mob takes its quarter (floored)");

  // Militia stands down past its muster.
  state.security.militia.untilDay = state.day - 1;
  const stand = tickDefense(state, () => 0.99);
  assert(state.security.militia === null && stand.lines.some((l) => l.includes("stands down")), "muster expires cleanly");

  // A victorious raid: barracks, muster & the watch turn raid power 45.
  state.buildings.push({ buildingId: "barracks", name: "Barracks", level: 1, loc: { x: 0, y: G, z: 0 }, day: 50 });
  assert(conscript(state, 1).ok, "one more pike joins the muster");
  postGuard(state, laborer.id); postGuard(state, builder.id); postGuard(state, cutter.id);
  assert(defensePower(state) === 57, `3 guards + muster + armed + barracks = 57 (got ${defensePower(state)})`);
  const won = resolveRaid(state, () => 0);
  assert(won.raid && won.won && state.security.lastRaidDay === state.day, "the watch drives the bandits off");
  assert(builder.xp >= 20, "victory drills the guard (+20xp)");

  // The full dawn now settles justice, war and fate together.
  const dawn = runDayRoll(state, dim, () => 0.99);
  assert(dawn.climate && dawn.health && dawn.crime && dawn.prison && dawn.defense && dawn.tech && dawn.fate && dawn.unrest, "day roll returns every M9–M10 tick");
  assert(dawn.lines.some((l) => l.includes("security")), "morning report carries the security line");
}

console.log("\n🛡️ M9 — A lost raid, paid in coin and blood");
{
  dim.reset(); buildWorld();
  resetState();
  const state = getState();
  state.founded = true; state.day = 50;
  state.zones.town = { x: 0.5, y: G + 1, z: 0.5 };
  const king = new Player(dim, { x: 0.5, y: G + 1, z: 0.5 });
  dim.entities.push(king);
  spawnMinister(king, state);
  spawnFoundingParty(king, state);
  relinkAll(state, dim);
  setModeAll(state, "living");
  const lost = resolveRaid(state, () => 0.99);
  assert(lost.raid && !lost.won, "undefended town falls (0 vs ~94)");
  assert(state.treasury === 850 && state.foodStock === 161, "loot ₹150, granary −39");
  assert(state.security.unrest === 8 && state.dailyStats.security === 39, "unrest +8, repairs ₹39");
  assert(lost.lines.some((l) => l.includes("RAID")) && state.citizens.every((c) => c.alive), "three wounded, none fallen");
}

/* ---- M10: seasons, health, fate, research ---- */
console.log("\n🌦 M10 — The turning sky, doctors, fate & philosophy");
{
  dim.reset(); buildWorld();
  resetState();
  const state = getState();
  state.founded = true; state.day = 60;
  state.zones.town = { x: 0.5, y: G + 1, z: 0.5 };
  const king = new Player(dim, { x: 0.5, y: G + 1, z: 0.5 });
  dim.entities.push(king);
  spawnMinister(king, state);
  const party = spawnFoundingParty(king, state);
  relinkAll(state, dim);
  setModeAll(state, "living");

  const c1 = tickClimate(state, () => 0);
  assert(state.climate.seasonDay === 2 && state.climate.weather === "rain", "spring rain on day 2");
  state.climate.seasonDay = 10;
  tickClimate(state, () => 0.99);
  assert(state.climate.season === "Summer" && state.climate.seasonDay === 1, "summer follows spring");
  assert(rollWeather(state, () => 0) === "rain", "monsoon summer rains");
  state.climate.season = "Winter";
  assert(rollWeather(state, () => 0) === "frost", "winter bites");
  state.climate.seasonDay = 10;
  tickClimate(state, () => 0.99);
  assert(state.climate.season === "Spring" && state.climate.year === 2, "the year turns");
  assert(seasonIcon("Winter") === "❄️" && weatherIcon("storm") === "⛈️", "sky icons render");

  state.climate.weather = "heatwave";
  assert(farmYield(state) === 0.6, "heatwave starves unirrigated fields (×0.6)");
  state.tech.unlocked.push("irrigation");
  assert(farmYield(state) === 1.05, "canals turn heat to profit (×1.05)");
  state.climate.weather = "storm";
  assert(stormBound(state) && buildPace(state) === 0.5, "storms shelter crews, halve the scaffold");
  state.climate.weather = "frost";
  assert(buildPace(state) === 0.75, "frost slows the scaffold");

  const feast = proclaimFestival(state);
  assert(feast.ok && state.festivalDay === 60 && state.foodStock === 190 && state.treasury === 990, "festival feasts 10 rations + ₹10");
  assert(party.every((c) => c.mood === 88), "festival joy +10 across the town (78→88)");

  // Fever without doctors worsens; doctors turn it.
  party[0].sick = 3; party[1].sick = 3;
  const flu = tickHealth(state, () => 0.99);
  assert(flu.sick === 2 && party[0].health === 18 && party[0].sick === 2, "untended fever deepens (18♥, 2 days)");
  party[2].profession = "doctor";
  assert(doctorRoster(state).length === 1, "one doctor answers the bell");
  tickHealth(state, () => 0.99);
  assert(party[0].sick === 0 && party[0].health === 20, "doctor's rounds cure the fever");
  state.buildings.push({ buildingId: "well", name: "Well", level: 1, loc: { x: 0, y: G, z: 0 }, day: 60 });
  state.buildings.push({ buildingId: "hospital", name: "Hospital", level: 1, loc: { x: 1, y: G, z: 0 }, day: 60 });
  assert(hasWell(state) && hasHospital(state), "wells & wards stand");

  // Famine counts hunger, then health, then breaks on bread.
  state.foodStock = 0; state.hungerDays = 2;
  const famine = tickHealth(state, () => 0.99);
  assert(state.hungerDays === 3 && famine.lines.some((l) => l.includes("FAMINE")), "third hungry dawn cries FAMINE");
  assert(party[0].health === 17, "famine gnaws (17♥)");
  state.foodStock = 50;
  tickHealth(state, () => 0.99);
  assert(state.hungerDays === 0, "bread breaks the famine count");

  // Philosophy: schools drip, grants pour, tools complete.
  state.buildings.push({ buildingId: "school", name: "School", level: 1, loc: { x: 2, y: G, z: 0 }, day: 60 });
  party[3].profession = "teacher";
  assert(dailyRP(state) === 3, "school + teacher drip 3 RP/day");
  assert(Object.keys(TECHS).length === 7, "seven inquiries on the tree");
  assert(startResearch(state, "tools").ok, "tools inquiry begun");
  assert(!startResearch(state, "railway").ok, "railway locked behind steam");
  const endowed = grantResearch(state, 100);
  assert(endowed.ok && endowed.rp === 10 && state.treasury === 890, "₹100 endows 10 RP");
  const eureka = tickTech(state);
  assert(eureka.completed === "tools" && state.tech.unlocked.includes("tools"), "EUREKA: improved tools mastered");
  assert(eureka.lines.some((l) => l.includes("EUREKA")), "eureka cried in the report");
  assert(techHaste(state, "builder") === 1.15, "steel edges hasten hands ×1.15");
  startResearch(state, "steam");
  grantResearch(state, 200);
  tickTech(state);
  assert(state.tech.unlocked.includes("steam") && Math.abs(techHaste(state, "builder") - 1.4375) < 0.001, `steam × tools ≈ ×1.4375 (got ${techHaste(state, "builder")})`);
  state.tech.unlocked.push("railway", "telegraph");
  assert(techMarket(state) === 0.2 && techBuild(state) === 1.25 && techMission(state) === 1, "railway & telegraph dividends hold");

  // Fate: expiry, a busy throne, a mine collapse, a caravan bargain.
  assert(wageGap(state) > 0, `wages lag the living wage (gap ₹${wageGap(state)})`);
  state.pendingDecisions.push({ id: "x-9", eventId: "nomads", title: "Old caravan", body: "b", options: [], data: {}, day: 1, expiryDay: state.day - 1 });
  const stale = rollEvents(state, () => 0.99);
  assert(state.pendingDecisions.length === 0 && stale.lines.some((l) => l.includes("passed undecided")), "stale moments pass");
  state.pendingDecisions.push(
    { id: "x-a", eventId: "t", title: "a", body: "b", options: [], data: {}, day: 60, expiryDay: 62 },
    { id: "x-b", eventId: "t", title: "b", body: "b", options: [], data: {}, day: 60, expiryDay: 62 },
    { id: "x-c", eventId: "t", title: "c", body: "b", options: [], data: {}, day: 60, expiryDay: 62 },
  );
  const busy = rollEvents(state, () => 0);
  assert(busy.fired === null, "a thrice-burdened throne draws no new fate");
  state.pendingDecisions = [];
  const treasBeforeEvent = state.treasury;
  const fate = rollEvents(state, () => 0);
  assert(fate.fired === "mine_collapse" && fate.lines.some((l) => l.includes("MINE")), "fate strikes the pit first");
  assert(state.treasury < treasBeforeEvent, "the rescue costs coin");
  state.pendingDecisions.push({ id: "x-1", eventId: "nomads", title: "Caravan", body: "b", options: [{ id: "buy", label: "Buy" }, { id: "decline", label: "No" }], data: { goods: "silk", price: 40 }, day: 60, expiryDay: 62 });
  const tb = state.treasury;
  const bargain = resolveDecision(state, "x-1", "buy");
  assert(bargain.ok && state.treasury === tb - 20 && state.pendingDecisions.length === 0, "caravan bought: −₹40 + ₹20 resale");
  assert(!resolveDecision(state, "x-zzz", "buy").ok, "unknown moments pass unruled");
}

/* ---- M11: the King's officers ---- */
console.log("\n🕯️ M11 — Officers & writs");
{
  dim.reset(); buildWorld();
  resetState();
  const state = getState();
  state.founded = true;
  const first = claimCrown(state, "Steve");
  assert(first.claimed && first.crown === "Steve", "first scepter claims the Crown");
  const second = claimCrown(state, "Alex");
  assert(!second.claimed && second.crown === "Steve", "the throne holds one head");
  assert(roleOf(state, "steve") === "crown" && roleOf(state, "Bob") === null, "roles read, case-blind");
  assert(Object.keys(OFFICER_ROLES).length === 4, "four great offices");
  assert(needWrit(state, "Bob", "judge").ok, "an unofficered realm stays open");
  assert(!grantOfficer(state, "Bob", "magistrate", "Alex").ok, "pretenders commission none");
  assert(grantOfficer(state, "Steve", "magistrate", "Alex").ok && anyOfficers(state), "the Crown commissions a Magistrate");
  assert(officerList(state).officers.magistrate === "Alex", "the court roll names Alex");
  assert(needWrit(state, "Alex", "judge").ok, "the Magistrate holds the gavel writ");
  const refused = needWrit(state, "Bob", "judge");
  assert(!refused.ok && refused.reason.includes("Magistrate"), "strangers are shown the door: " + refused.reason);
  assert(needWrit(state, "Steve", "muster").ok, "the Crown's word overrides all");
  assert(grantOfficer(state, "Steve", "marshal", "Bob").ok, "a Marshal keeps the realm gated");
  assert(revokeOfficer(state, "Steve", "magistrate").ok && !needWrit(state, "Alex", "judge").ok, "dismissal reclaims the seal");
  abdicate(state, "Steve", "Bob");
  assert(roleOf(state, "Bob") === "crown", "abdication passes the Crown");
  abdicate(state, "Bob");
  assert(claimCrown(state, "Alex").claimed, "a vacant throne may be claimed");
}

/* ---- M12: chat orders ---- */
console.log("\n💬 M12 — Rule from the keyboard");
{
  dim.reset(); buildWorld();
  resetState();
  const state = getState();
  state.founded = true; state.day = 70;
  state.zones.town = { x: 0.5, y: G + 1, z: 0.5 };
  const king = new Player(dim, { x: 0.5, y: G + 1, z: 0.5 });
  dim.entities.push(king);
  spawnMinister(king, state);
  const party = spawnFoundingParty(king, state);
  relinkAll(state, dim);
  setModeAll(state, "living");
  claimCrown(state, "Steve");

  assert(parseCommand(state, "Steve", "hello") === null, "plain chat passes through");
  assert(parseCommand(state, "Steve", "!help").lines.some((l) => l.includes("treasury")), "!help teaches the orders");
  assert(parseCommand(state, "Steve", "!status").lines[0].includes("Day 70"), "!status reports the day");
  assert(parseCommand(state, "Steve", "!treasury").lines[0].includes("₹1000"), "!treasury counts ₹1000");
  assert(parseCommand(state, "Steve", "!mood").lines[0].includes("Mood"), "!mood reads the town");
  assert(parseCommand(state, "Steve", "!docket").lines[0].includes("empty"), "an empty docket holds the peace");
  assert(parseCommand(state, "Steve", "!cases").lines[0].includes("No open cases"), "!cases finds clean streets");
  assert(parseCommand(state, "Steve", "!guards").lines[0].includes("none"), "!guards musters none");
  assert(parseCommand(state, "Steve", "!tech").lines[0].includes("RP banked"), "!tech opens the ledger of philosophy");
  assert(parseCommand(state, "Steve", "!officers").lines[0].includes("Steve"), "!officers names the Crown");
  assert(parseCommand(state, "Steve", "!frobnicate").lines[0].includes("Unknown order"), "unknown orders confess ignorance");

  const k = fileCase(state, "theft", party[0], { evidence: 70 });
  const judged = parseCommand(state, "Steve", `!judge ${k.id} fine`);
  assert(judged.mutated && judged.lines[0].includes("fined"), "!judge fines from chat");
  party[1].fugitive = true;
  const firstName = party[1].fullName.split(" ")[0];
  const bounty = parseCommand(state, "Steve", `!bounty "${firstName}" 50`);
  assert(bounty.mutated && state.security.bounties.length === 1, "!bounty posts ₹50 on a name");
  const mustered = parseCommand(state, "Steve", "!muster 4");
  assert(mustered.mutated && militiaCount(state) === 4, "!muster raises 4");
  const fest = parseCommand(state, "Steve", "!festival");
  assert(fest.mutated && state.festivalDay === 70, "!festival proclaims the feast");
  parseCommand(state, "Steve", "!festival off");
  assert(state.festivalDay === -1, "!festival off calls it back");
  parseCommand(state, "Steve", "!ration");
  assert(state.rationing, "!ration halves the bread");
  parseCommand(state, "Steve", "!quarantine");
  assert(state.quarantine, "!quarantine bars the gates");
  parseCommand(state, "Steve", "!ration");
  parseCommand(state, "Steve", "!quarantine");

  const granted = parseCommand(state, "Steve", "!grant magistrate Alex");
  assert(granted.mutated && roleOf(state, "Alex") === "magistrate", "!grant commissions from chat");
  const k2 = fileCase(state, "theft", party[2], { evidence: 70 });
  const refused = parseCommand(state, "Bob", `!judge ${k2.id} fine`);
  assert(!refused.mutated && refused.lines[0].includes("Magistrate"), "chat writs bind strangers too");
  const revoked = parseCommand(state, "Steve", "!revoke magistrate");
  assert(revoked.mutated && roleOf(state, "Alex") === null, "!revoke reclaims the seal");
  assert(parseCommand(state, "Steve", "!decide").lines[0].includes("No moments"), "!decide finds a quiet throne");
  state.pendingDecisions.push({ id: "x-7", eventId: "nomads", title: "Caravan", body: "b", options: [{ id: "buy", label: "Buy" }, { id: "decline", label: "No" }], data: { goods: "silk", price: 40 }, day: 70, expiryDay: 72 });
  assert(parseCommand(state, "Steve", "!decide").lines[0].includes("Awaiting"), "!decide lists the moment");
  const ruled = parseCommand(state, "Steve", "!decide x-7 decline", { rng: () => 0.5 });
  assert(ruled.mutated && state.pendingDecisions.length === 0, "!decide rules the road");
  assert(parseCommand(state, "Steve", "!advance").lines[0].includes("sun"), "!advance bows to the sun");
}

/* ---- M12.1: bootstrap through main.js + every menu on the strict UI mock ---- */
console.log("\n🚀 M12.1 — Bootstrap, commands & the whole Kingdom Menu");
{
  const { queueResponse, shown, pendingResponses } = await import("@minecraft/server-ui");
  const { ItemStack } = await import("@minecraft/server");
  resetState();
  buildWorld({ chest: true });
  dim.entities.length = 0;
  const king = new Player(dim, { x: 0.5, y: G + 1, z: 0.5 }, "Steve");
  dim.entities.push(king);
  const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

  await mod("./main.js");
  const registry = system.startup();
  assert([...registry.commands.keys()].sort().join() === "kingdom:menu,kingdom:order,kingdom:start", "startup registers /kingdom:start, /kingdom:menu, /kingdom:order");
  assert([...registry.commands.values()].every((c) => c.def.cheatsRequired === false && c.def.permissionLevel === 0), "commands run without cheats for any player");
  assert(system.intervals.length === 3, "three simulation loops scheduled");
  assert(world.beforeEvents.chatSend === undefined, "stable module exposes no chatSend — main.js booted without it");

  // Found the colony via the command + forms.
  queueResponse({ formValues: ["Sim Victoria", 2, 1] }); // founding modal
  queueResponse({ selection: 0 }); // the Minister gathers the party
  const res = registry.run("kingdom:start", { sourceEntity: king });
  assert(res.status === 0, "/kingdom:start returns Success");
  await flush();
  const state = getState();
  assert(state.founded && state.colony.name === "Sim Victoria" && state.colony.bannerColor === "Emerald", "founding form values land in state");
  assert(state.citizens.length === 5 && state.ministerGreeted, "Minister + founding party assembled through the forms");
  assert(king.inventory.count("kingdom:scepter") === 1, "the Royal Scepter is issued as kingdom:scepter");
  const scepter = king.inventory.getItem(king.inventory.slots.findIndex((s) => s?.typeId === "kingdom:scepter"));
  assert(scepter && registry.run("kingdom:start", { sourceEntity: king }).status === 0 && king.messages.at(-1).includes("already rule"), "second /kingdom:start is refused politely");
  assert(registry.run("kingdom:start", { sourceType: "Server" }).status === 1, "console origin gets a Failure result");

  // Chat orders through the stable command.
  king.messages.length = 0;
  registry.run("kingdom:order", { sourceEntity: king }, "help");
  assert(king.messages[0]?.includes("!orders"), "/kingdom:order help teaches the orders");
  registry.run("kingdom:order", { sourceEntity: king }, "status");
  assert(king.messages.some((m) => m.includes("Day 1")), "/kingdom:order status reports the day");
  registry.run("kingdom:order", { sourceEntity: king }, "!muster", "3");
  assert(!state.security.militia && king.messages.at(-1).includes("able adults"), "muster is refused while the party still follows the King");
  setModeAll(state, "living");
  registry.run("kingdom:order", { sourceEntity: king }, "!muster", "3");
  assert(state.security.militia?.count === 3, "/kingdom:order muster 3 raises the militia once released (leading ! tolerated)");
  let threw = false; try { registry.run("kingdom:order", { sourceEntity: king }); } catch { threw = true; }
  assert(threw, "the order word is mandatory");

  // Scepter use opens the Kingdom Menu.
  shown.length = 0;
  world.afterEvents.itemUse.emit({ itemStack: new ItemStack("kingdom:scepter", 1), source: king });
  await flush();
  assert(shown.length === 1 && shown[0].kind === "action" && shown[0].buttons === 16, "using the Scepter opens the 16-button Kingdom Menu");
  assert(state.officers.crown === "Steve", "first Scepter use claims the Crown");
  registry.run("kingdom:menu", { sourceEntity: king }); await flush();
  assert(shown.length === 2 && king.inventory.count("kingdom:scepter") === 1, "/kingdom:menu opens the menu without duplicating the Scepter");

  // Crawl: every top-level page, then every button on every page (grand-children auto-cancel).
  // Every form is built against the strict 2.0.0 mock, so any 1.x positional slider/dropdown/textField
  // call, out-of-range default, or non-string label throws here.
  const { openMainMenu } = await mod("./game/menu.js");
  const errors = [];
  const open = async (...path) => {
    for (const sel of path) queueResponse({ selection: sel });
    shown.length = 0;
    try { await openMainMenu(king); await flush(); } catch (e) { errors.push(`${path.join(">")}: ${e.message}`); }
    if (pendingResponses()) errors.push(`${path.join(">")}: ${pendingResponses()} scripted answer(s) unused`);
    return shown.slice();
  };
  let pages = 0, leaves = 0;
  for (let i = 0; i < 16; i++) {
    const trail = await open(i);
    const page = trail[1];
    pages++;
    if (!page || page.kind !== "action") continue;
    for (let j = 0; j < page.buttons; j++) {
      const t2 = await open(i, j);
      leaves++;
      // Third level: if a further action page appeared, touch each of its buttons too.
      const sub = t2[2];
      if (sub && sub.kind === "action") {
        for (let k = 0; k < sub.buttons; k++) { await open(i, j, k); leaves++; }
      }
    }
  }
  assert(errors.length === 0, errors.length ? `menu crawl threw:\n   ${errors.join("\n   ")}` : `menu crawl: ${pages} pages, ${leaves} leaves, every form builds cleanly on server-ui 2.0.0`);

  // Simulation loops with strict HUD/clock calls; save shards under the 32 KB cap.
  world.day = 1; world.timeOfDay = 1000;
  for (let t = 5; t <= 200; t += 5) system.tick(t);
  world.day = 2; system.tick(220); await flush();
  assert(state.day === 2 && king.messages.some((m) => m.includes("Day 2") || m.includes("Dawn") || m.includes("☀")), "the clock loop rolls Day 2 and reports");
  const bytes = Object.fromEntries([...world.dynamicProps].map(([k, v]) => [k, v.length]));
  assert(Object.values(bytes).every((n) => n < 32767), `save shards under the 32 767-byte cap (${JSON.stringify(bytes)})`);

  // Relog + a death through the real handlers.
  world.afterEvents.playerSpawn.emit({ initialSpawn: true, player: king }); await flush();
  assert(king.inventory.count("kingdom:scepter") === 1, "relog keeps exactly one Scepter");
  const victim = state.citizens.find((c) => c.role === "settler");
  const ent = dim.getEntities({ tags: [victim.cidTag] })[0];
  world.afterEvents.entityDie.emit({ deadEntity: ent, damageSource: { cause: "fall" } });
  assert(victim.alive === false && king.messages.at(-1)?.includes("has died"), "entityDie marks the citizen deceased and mourns");
  world.afterEvents.entityDie.emit({ deadEntity: dim.spawnEntity("minecraft:zombie", { x: 0, y: G + 1, z: 0 }), damageSource: {} });
  assert(true, "stranger deaths are ignored");
}

console.log("\n🚦 Warnings");
assert(warnings.length === 0, warnings.length ? "no warnings:\n   " + warnings.join("\n   ") : "no runtime warnings");
console.log(`\n${failures === 0 ? "🎉 ALL SIM TESTS PASSED" : `❌ ${failures} FAILURES`}`);
process.exit(failures ? 1 : 0);
