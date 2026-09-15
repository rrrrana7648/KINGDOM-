/**
 * economist.js — the "Royal Economist": every suggested wage & price lives
 * here so players never balance the economy by hand (design §28/§29).
 * Values in rupees at Level 1 / safe work; ledgers will store paise (₹1=100).
 */

export const SKILL_MULT = { 1: 1.0, 2: 1.1, 3: 1.25, 4: 1.4, 5: 1.6 };

export const DANGER_MULT = {
  safe: 1.0, // farms, shops, kitchens
  hazardous: 1.2, // night, water, heights
  cave: 1.5, // monster-risk caves
  lava: 2.0, // deepslate, gold, lava levels
  deepDark: 3.0, // Ancient City / Warden risk
  war: 2.5, // active combat deployment
};

/** Profession base daily wage (₹, L1) — design §29. */
export const BASE_WAGE = {
  apprentice: 2,
  laborer: 5,
  hauler: 5,
  woodcutter: 6,
  forester: 6,
  farmer: 6,
  picker: 6,
  herder: 6,
  fisher: 7,
  courier: 7,
  quarry: 8,
  builder: 9,
  cook: 9,
  baker: 9,
  miner: 10, // shallow: coal/iron/copper
  sepoy: 10,
  clerk: 10,
  teacher: 10,
  tailor: 10,
  buyer: 12,
  soldier: 14,
  blacksmith: 15,
  deepMiner: 18, // deepslate gold/redstone/lapis
  inspector: 18,
  masterBuilder: 20,
  sergeant: 22,
  foreman: 25,
  treasurer: 35,
  magistrate: 35,
  officer: 35,
  deepDarkMiner: 35,
  banker: 35,
  doctor: 40,
  minister: 60,
};

/** Crown commodity buy prices in ₹ per item (design §29). */
export const CROWN_BUY_PRICE = {
  // materials
  "minecraft:dirt": 0.02, "minecraft:sand": 0.02, "minecraft:gravel": 0.02,
  "minecraft:cobblestone": 0.05, "minecraft:stone": 0.1,
  "minecraft:deepslate_cobbled": 0.12, "minecraft:clay_ball": 0.3,
  "minecraft:flint": 0.4, "minecraft:obsidian": 5,
  // wood
  "minecraft:oak_log": 0.5, "minecraft:birch_log": 0.5, "minecraft:spruce_log": 0.55,
  "minecraft:jungle_log": 0.7, "minecraft:dark_oak_log": 0.7,
  "minecraft:oak_planks": 0.3, "minecraft:stick": 0.03,
  // ores
  "minecraft:coal": 1, "minecraft:charcoal": 0.7,
  "minecraft:raw_iron": 1.5, "minecraft:iron_ingot": 4,
  "minecraft:raw_copper": 0.8, "minecraft:copper_ingot": 2,
  "minecraft:raw_gold": 5, "minecraft:gold_ingot": 12,
  "minecraft:redstone": 0.5, "minecraft:lapis_lazuli": 0.3,
  "minecraft:quartz": 1, "minecraft:amethyst_shard": 8,
  "minecraft:emerald": 25, "minecraft:diamond": 60,
  "minecraft:netherite_scrap": 250,
  // food & cash crops
  "minecraft:wheat": 0.2, "minecraft:bread": 0.8,
  "minecraft:potato": 0.15, "minecraft:carrot": 0.15, "minecraft:beetroot": 0.15,
  "minecraft:sugar_cane": 0.25, "minecraft:sugar": 0.4,
  "minecraft:cod": 1, "minecraft:salmon": 1, "minecraft:tropical_fish": 3,
  "minecraft:pufferfish": 2, "minecraft:cooked_cod": 1.5,
  "minecraft:beef": 1.2, "minecraft:porkchop": 1, "minecraft:chicken": 0.8,
  "minecraft:cooked_beef": 2, "minecraft:egg": 0.2, "minecraft:milk_bucket": 1.5,
  // textiles
  "minecraft:wool": 2, "minecraft:leather": 1.5, "minecraft:feather": 0.3,
  "minecraft:rabbit_hide": 0.4, "minecraft:string": 0.5,
  // trade goods
  "minecraft:paper": 0.6, "minecraft:brick": 0.4, "minecraft:glass": 1,
  "minecraft:torch": 0.2, "minecraft:arrow": 0.5, "minecraft:gunpowder": 6,
};

/**
 * Suggested daily crown wage with reasoning (design §28 formula).
 * @param {string} profession key of BASE_WAGE
 * @param {object} opts { level?:1..5, danger?:keyof DANGER_MULT, night?, camp?, overtime? }
 * @returns {{ wage:number, low:number, high:number, reason:string }}
 */
export function suggestWage(profession, opts = {}) {
  const {
    level = 1,
    danger = "safe",
    night = false,
    camp = false,
    overtime = false,
  } = opts;
  const base = BASE_WAGE[profession] ?? BASE_WAGE.laborer;
  let wage = base * (SKILL_MULT[level] ?? 1) * (DANGER_MULT[danger] ?? 1);
  if (night) wage *= 1.2;
  if (camp) wage *= 1.3;
  if (overtime) wage *= 1.5;
  wage = Math.round(wage * 100) / 100;
  return {
    wage,
    low: Math.round(wage * 0.9 * 100) / 100,
    high: Math.round(wage * 1.15 * 100) / 100,
    reason: `₹${base} base × L${level} skill × ${DANGER_MULT[danger]} danger` +
      `${night ? " ×1.2 night" : ""}${camp ? " ×1.3 camp" : ""}` +
      `${overtime ? " ×1.5 overtime" : ""}`,
  };
}

/** Piece-rate suggestion for freelancers: item price × quality grade. */
export function suggestPieceRate(itemTypeId, grade = "C", quantity = 1) {
  const base = CROWN_BUY_PRICE[itemTypeId] ?? 0.1;
  const gradeMult = grade === "A" ? 1.25 : grade === "B" ? 1.1 : 1.0;
  return Math.round(base * gradeMult * quantity * 100) / 100;
}

/** Citizen retail ≈ 2× Crown buy; harbor export ≈ 1.5–3× (design §29). */
export const RETAIL_MULT = 2;
export const EXPORT_RANGE = [1.5, 3.0];

/**
 * Living wage: 3 market meals + a tenement bed + sundries, at the ruling
 * price index. Shown beside the minimum-wage edict (design §37.26).
 */
export function livingWage(state) {
  const idx = state.market?.priceIndex ?? state.inflation?.priceIndex ?? 1;
  return Math.round((3 * 2 * idx + 1 + 1) * 100) / 100;
}

/** Wage demand drifts with inflation: every +10% prices ≈ +8% demands. */
export function inflationWageFactor(state) {
  const idx = state.inflation?.priceIndex ?? 1;
  return Math.round((1 + (idx - 1) * 0.8) * 1000) / 1000;
}
