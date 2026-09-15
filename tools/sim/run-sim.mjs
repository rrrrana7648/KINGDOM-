/**
 * KINGDOM headless regression simulation (M2).
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
  const { getState } = await import(new URL("../../packs/BP_Kingdom/scripts/core/state.js?old", import.meta.url).href);
  const s = getState();
  assert(s.version === 2 && s.foodStock === 200, "v1 document migrates to v2 with rations");
  assert(s.citizens[0].needs && s.citizens[0].cidTag === "kingdom:cid_c9", "citizen backfilled with needs + cid tag");
  world.dynamicProps.delete("kingdom:save_v1");
}

/* canonical (shared) module instances */
const { getState, resetState } = await mod("./core/state.js");
const { spawnMinister, spawnFoundingParty } = await mod("./game/citizens.js");
const { relinkAll } = await mod("./game/npcRegistry.js");
const { tickCitizens, setModeAll } = await mod("./game/schedule.js");
const { runDayRoll } = await mod("./game/dayroll.js");
const { performWork, deliver, resetRuntime } = await mod("./game/jobs.js");

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

  const before = state.treasury;
  const report = runDayRoll(state);
  assert(Math.round((before - state.treasury) * 100) / 100 === 86, "day roll pays ₹86 wages (60+9+6+6+5)");
  assert(state.citizens.every((c) => c.mood >= 5 && c.mood <= 100), "moods stay in 5–100");
  assert(report.lines.some((l) => l.includes("Produced")), "morning report lists production");
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

console.log("\n🚦 Warnings");
assert(warnings.length === 0, warnings.length ? "no warnings:\n   " + warnings.join("\n   ") : "no runtime warnings");
console.log(`\n${failures === 0 ? "🎉 ALL SIM TESTS PASSED" : `❌ ${failures} FAILURES`}`);
process.exit(failures ? 1 : 0);
