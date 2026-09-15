/**
 * catalog.js — the royal building catalogue (M6, design §5).
 *
 * Every work building places/upgrades through levels 1–5; each level raises
 * worker capacity and output. Costs are drawn from the Crown Warehouse
 * stockpile (virtual ledger first, physical chest when present) and labor is
 * measured in builder-days. Effects feed back into the living systems:
 * houses register beds, markets lift trade, schools bonus children, harbors
 * unlock ships, taverns lift mood, hospitals heal.
 */
export const BUILDINGS = {
  house: {
    name: "Cottage", icon: "🏠",
    desc: "A family dwelling. Registers beds in the housing roll.",
    levels: [
      { cost: { "minecraft:oak_log": 24, "minecraft:cobblestone": 16 }, labor: 2, beds: 2 },
      { cost: { "minecraft:oak_log": 32, "minecraft:cobblestone": 32 }, labor: 3, beds: 4 },
      { cost: { "minecraft:spruce_log": 48, "minecraft:stone": 48 }, labor: 4, beds: 6 },
    ],
  },
  warehouse: {
    name: "Warehouse", icon: "📦",
    desc: "Crown storage. +64 buyer quota headroom per level.",
    levels: [
      { cost: { "minecraft:oak_log": 40, "minecraft:cobblestone": 40 }, labor: 3 },
      { cost: { "minecraft:spruce_log": 64, "minecraft:stone": 64 }, labor: 5 },
    ],
  },
  market: {
    name: "Market Hall", icon: "⚖️",
    desc: "+10% market spending per level. The bazaar heart.",
    levels: [
      { cost: { "minecraft:oak_log": 48, "minecraft:cobblestone": 24 }, labor: 4 },
      { cost: { "minecraft:jungle_log": 64, "minecraft:stone": 64 }, labor: 6 },
    ],
  },
  farm: {
    name: "Farmstead", icon: "🌾",
    desc: "Barn + fields office. Farmers deliver +10% per level.",
    levels: [
      { cost: { "minecraft:oak_log": 32, "minecraft:wheat": 32 }, labor: 3 },
      { cost: { "minecraft:oak_log": 48, "minecraft:cobblestone": 48 }, labor: 5 },
    ],
  },
  lumberCamp: {
    name: "Lumber Camp", icon: "🪓",
    desc: "Sawbucks & forester lodge. Woodcutters +10% per level.",
    levels: [
      { cost: { "minecraft:oak_log": 32, "minecraft:cobblestone": 16 }, labor: 3 },
      { cost: { "minecraft:spruce_log": 64, "minecraft:iron_ingot": 8 }, labor: 5 },
    ],
  },
  school: {
    name: "Schoolhouse", icon: "🏫",
    desc: "Children come of age with +60xp and literacy.",
    levels: [
      { cost: { "minecraft:oak_log": 40, "minecraft:paper": 16 }, labor: 4 },
    ],
  },
  tavern: {
    name: "Tavern", icon: "🍻",
    desc: "+6 mood to every citizen, every dawn.",
    levels: [
      { cost: { "minecraft:oak_log": 48, "minecraft:cobblestone": 32 }, labor: 4 },
      { cost: { "minecraft:dark_oak_log": 64, "minecraft:glass": 16 }, labor: 5 },
    ],
  },
  hospital: {
    name: "Hospital", icon: "🏥",
    desc: "The sick recover; injuries fade. (+health daily)",
    levels: [
      { cost: { "minecraft:cobblestone": 64, "minecraft:oak_log": 32 }, labor: 5 },
    ],
  },
  bank: {
    name: "State Bank", icon: "🏦",
    desc: "Stone confidence: citizen loan rate −2 per level.",
    levels: [
      { cost: { "minecraft:stone": 96, "minecraft:oak_log": 32 }, labor: 6 },
    ],
  },
  mint: {
    name: "Royal Mint", icon: "🪙",
    desc: "Printing press hall. Plate wear −20% per level.",
    levels: [
      { cost: { "minecraft:stone": 64, "minecraft:iron_ingot": 16 }, labor: 6 },
    ],
  },
  harbor: {
    name: "Harbor", icon: "⚓",
    desc: "Docks & crane. Unlocks clipper trade (M8).",
    levels: [
      { cost: { "minecraft:oak_log": 64, "minecraft:cobblestone": 64 }, labor: 6 },
      { cost: { "minecraft:spruce_log": 96, "minecraft:iron_ingot": 24 }, labor: 8 },
      { cost: { "minecraft:dark_oak_log": 128, "minecraft:iron_ingot": 48 }, labor: 10 },
    ],
  },
  barracks: {
    name: "Barracks", icon: "🛡️",
    desc: "Redcoat drill & muster (garrison at M9).",
    levels: [
      { cost: { "minecraft:cobblestone": 64, "minecraft:oak_log": 48 }, labor: 5 },
    ],
  },
  monument: {
    name: "Monument", icon: "🗽",
    desc: "Wonder & prestige: +4 mood colony-wide per level.",
    levels: [
      { cost: { "minecraft:stone": 128, "minecraft:oak_log": 32 }, labor: 8 },
      { cost: { "minecraft:stone": 192, "minecraft:gold_ingot": 8 }, labor: 12 },
    ],
  },
};

export function buildingDef(id) {
  return BUILDINGS[id];
}

export function levelCost(buildingId, level) {
  const def = BUILDINGS[buildingId];
  if (!def) return null;
  return def.levels[Math.min(level, def.levels.length) - 1] ?? null;
}

/** Short "3 oak log, 5 cobble" cost text. */
export function costText(cost) {
  return Object.entries(cost ?? {})
    .map(([id, n]) => `${n} ${id.replace("minecraft:", "").replaceAll("_", " ")}`)
    .join(", ");
}
