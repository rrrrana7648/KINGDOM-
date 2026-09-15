/**
 * pricebook.js — commodity categories, grade rules and Crown buy rates.
 * Prices reuse the Royal Economist tables; buyers apply a quality grade and
 * an adjustable price band (design §6.1, §6.2, §28–29).
 */
import { CROWN_BUY_PRICE } from "../core/economist.js";

export const COMMODITIES = {
  wood:     { label: "Wood",        icon: "🪵", defaultFloat: 60,  quota: 128 },
  stone:    { label: "Stone",       icon: "🪨", defaultFloat: 30,  quota: 256 },
  ore:      { label: "Ore & Gems",  icon: "⛏️", defaultFloat: 250, quota: 64 },
  grain:    { label: "Grain",       icon: "🌾", defaultFloat: 40,  quota: 128 },
  cashcrop: { label: "Tea/Cash Crop", icon: "☕", defaultFloat: 100, quota: 96 },
  fish:     { label: "Fish",        icon: "🐟", defaultFloat: 60,  quota: 64 },
  livestock:{ label: "Livestock",   icon: "🐑", defaultFloat: 70,  quota: 64 },
};

/** Item → commodity stall it is sold at. */
const CATEGORY = {};
const add = (cat, ids) => ids.forEach((id) => (CATEGORY[id] = cat));
add("wood", [
  "minecraft:oak_log", "minecraft:birch_log", "minecraft:spruce_log",
  "minecraft:jungle_log", "minecraft:acacia_log", "minecraft:dark_oak_log",
  "minecraft:cherry_log", "minecraft:mangrove_log", "minecraft:mangrove_roots",
  "minecraft:oak_planks", "minecraft:birch_planks", "minecraft:spruce_planks",
  "minecraft:jungle_planks", "minecraft:acacia_planks", "minecraft:dark_oak_planks",
  "minecraft:stick",
]);
add("stone", [
  "minecraft:cobblestone", "minecraft:stone", "minecraft:cobbled_deepslate",
  "minecraft:deepslate", "minecraft:granite", "minecraft:diorite", "minecraft:andesite",
  "minecraft:tuff", "minecraft:clay_ball", "minecraft:flint", "minecraft:obsidian",
  "minecraft:netherrack", "minecraft:blackstone", "minecraft:basalt",
  "minecraft:sand", "minecraft:gravel", "minecraft:dirt",
]);
add("ore", [
  "minecraft:coal", "minecraft:charcoal", "minecraft:raw_iron", "minecraft:iron_ingot",
  "minecraft:raw_copper", "minecraft:copper_ingot", "minecraft:raw_gold", "minecraft:gold_ingot",
  "minecraft:redstone", "minecraft:lapis_lazuli", "minecraft:quartz", "minecraft:amethyst_shard",
  "minecraft:emerald", "minecraft:diamond", "minecraft:netherite_scrap",
]);
add("grain", [
  "minecraft:wheat", "minecraft:bread", "minecraft:potato", "minecraft:carrot",
  "minecraft:beetroot", "minecraft:baked_potato",
]);
add("cashcrop", [
  "minecraft:sugar_cane", "minecraft:sugar", "minecraft:cocoa_beans",
  "minecraft:melon_slice", "minecraft:pumpkin", "minecraft:kelp",
]);
add("fish", [
  "minecraft:cod", "minecraft:salmon", "minecraft:tropical_fish", "minecraft:pufferfish",
  "minecraft:cooked_cod", "minecraft:cooked_salmon",
]);
add("livestock", [
  "minecraft:beef", "minecraft:cooked_beef", "minecraft:porkchop", "minecraft:cooked_porkchop",
  "minecraft:chicken", "minecraft:cooked_chicken", "minecraft:mutton", "minecraft:cooked_mutton",
  "minecraft:rabbit", "minecraft:egg", "minecraft:milk_bucket", "minecraft:wool",
  "minecraft:leather", "minecraft:feather", "minecraft:rabbit_hide", "minecraft:string",
]);

/** Food commodities refill the ration store at consolidation. */
const FOOD_CATEGORIES = new Set(["grain", "fish", "livestock"]);

/** Quality grade from worker level: masters produce Grade A (design §31). */
export function gradeForLevel(level) {
  if (level >= 4) return "A";
  if (level === 3) return "B";
  return "C";
}
const GRADE_MULT = { A: 1.25, B: 1.1, C: 1.0 };

export function categoryOf(itemId) {
  return CATEGORY[itemId];
}
export function isFoodCategory(cat) {
  return FOOD_CATEGORIES.has(cat);
}
/** Crown rate per single item in ₹. */
export function baseRate(itemId) {
  return CROWN_BUY_PRICE[itemId] ?? 0.05;
}
/**
 * Effective unit price in ₹ for a seller/grade/band.
 * @param band stall price band multiplier (0.9 cheap … 1.1 generous)
 */
export function unitPrice(itemId, grade, band = 1) {
  return Math.round(baseRate(itemId) * (GRADE_MULT[grade] ?? 1) * band * 1000) / 1000;
}
export const PAISA_PER_RUPEE = 100;
