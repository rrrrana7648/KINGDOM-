/**
 * seasons.js — the turning year, weather & feasts (M10, design §10, §26).
 *
 * The colony year runs 40 days: Spring → Summer (monsoon) → Autumn → Winter.
 * Each dawn rolls weather weighted by season — clear, rain, storm, heatwave,
 * frost — and the sky rules the fields: monsoon rain swells harvests,
 * droughts and frosts starve them (irrigation halves the pain), storms idle
 * all outdoor crews and slow the scaffold. The King may proclaim festivals
 * (mandatory rest, great joy) and rationing (half bread, twice the days).
 */
import { LEDGER_CAP } from "../core/state.js";

export const SEASONS = ["Spring", "Summer", "Autumn", "Winter"];
export const SEASON_DAYS = 10;
export const WEATHERS = ["clear", "rain", "storm", "heatwave", "frost"];

const SEASON_ICON = { Spring: "🌸", Summer: "☀️", Autumn: "🍂", Winter: "❄️" };
const WEATHER_ICON = { clear: "🌤️", rain: "🌧️", storm: "⛈️", heatwave: "🔥", frost: "🧊" };

export function seasonIcon(season) {
  return SEASON_ICON[season] ?? "🌸";
}
export function weatherIcon(weather) {
  return WEATHER_ICON[weather] ?? "🌤️";
}

/**
 * Rolls the day's sky. Summer brings monsoon rain, winter frost.
 * @returns {string} weather
 */
export function rollWeather(state, rng = Math.random) {
  const season = state.climate.season;
  const r = rng();
  if (season === "Summer") {
    if (r < 0.45) return "rain";
    if (r < 0.6) return "storm";
    if (r < 0.72) return "heatwave";
    return "clear";
  }
  if (season === "Winter") {
    if (r < 0.35) return "frost";
    if (r < 0.5) return "rain";
    return "clear";
  }
  if (season === "Spring") {
    if (r < 0.3) return "rain";
    if (r < 0.36) return "storm";
    return "clear";
  }
  // Autumn
  if (r < 0.25) return "rain";
  if (r < 0.32) return "storm";
  if (r < 0.4) return "heatwave";
  return "clear";
}

/**
 * Daily climate tick: season advance, drought/flood tracking, sky effects.
 * @returns {{lines:string[]}}
 */
export function tickClimate(state, rng = Math.random) {
  const out = { lines: [] };
  const cl = state.climate;

  cl.seasonDay++;
  if (cl.seasonDay > SEASON_DAYS) {
    cl.seasonDay = 1;
    const i = SEASONS.indexOf(cl.season);
    cl.season = SEASONS[(i + 1) % SEASONS.length];
    if (cl.season === "Spring") cl.year++;
    cl.droughtDays = 0;
    cl.flood = 0;
    out.lines.push(`§e${seasonIcon(cl.season)} ${cl.season} of Year ${cl.year} arrives.`);
  }

  cl.weather = rollWeather(state, rng);
  if (cl.weather === "heatwave") {
    cl.droughtDays++;
    out.lines.push("§6🔥 Heatwave — the fields bake; fires catch easily.");
  } else if (cl.weather === "rain") {
    cl.droughtDays = 0;
    if (cl.season === "Summer") {
      cl.flood++;
      if (cl.flood >= 3) out.lines.push("§9🌊 Monsoon floods! Low farms drown; drainage and granaries will tell.");
    }
  } else if (cl.weather === "storm") {
    cl.droughtDays = 0;
    out.lines.push("§8⛈️ Storm — outdoor crews shelter; the scaffold sways.");
  } else {
    if (cl.weather === "clear") cl.droughtDays += cl.season === "Summer" ? 1 : 0;
  }
  return out;
}

/**
 * Farm yield multiplier for the working day (jobs.js reads this).
 * Irrigation tech halves drought pain; monsoon floods drown fields.
 */
export function farmYield(state) {
  const cl = state.climate;
  const irrigated = (state.tech?.unlocked ?? []).includes("irrigation");
  let mult = 1;
  const almanac = (state.buildings ?? []).some((b) => b.buildingId === "observatory");
  if (cl.weather === "rain") mult += cl.season === "Summer" && cl.flood >= 3 ? (almanac ? -0.25 : -0.5) : 0.2;
  if (cl.weather === "heatwave") mult -= irrigated ? 0.2 : 0.4;
  if (cl.droughtDays >= 4) mult -= irrigated ? 0.15 : 0.35;
  if (cl.weather === "frost") mult -= 0.25;
  if (cl.weather === "storm") mult -= 0.15;
  if (irrigated) mult += 0.25;
  return Math.max(0, Math.round(mult * 100) / 100);
}

/** True while outdoor crews must shelter (schedule + jobs read this). */
export function stormBound(state) {
  return state.climate?.weather === "storm";
}

/** Construction pace in foul weather (1 = fair skies). */
export function buildPace(state) {
  if (stormBound(state)) return 0.5;
  if (state.climate?.weather === "frost") return 0.75;
  return 1;
}

/**
 * Proclaims a festival for TODAY: mandatory rest, feasting, great joy.
 * Costs 2 rations per citizen + ₹10 from the treasury.
 */
export function proclaimFestival(state) {
  const alive = state.citizens.filter((c) => c.alive);
  const food = alive.length * 2;
  if (state.foodStock < food) {
    return { ok: false, reason: `The feast needs ${food} rations; the granary holds ${state.foodStock}.` };
  }
  if (state.treasury < 10) return { ok: false, reason: "Lanterns and drums cost ₹10." };
  state.foodStock -= food;
  state.treasury = Math.round((state.treasury - 10) * 100) / 100;
  state.dailyStats.welfare = Math.round(((state.dailyStats.welfare ?? 0) + 10) * 100) / 100;
  state.festivalDay = state.day;
  for (const c of alive) c.mood = Math.min(100, (c.mood ?? 70) + 10);
  state.security.unrest = Math.max(0, (state.security.unrest ?? 0) - 8);
  state.ledger.push({ day: state.day, type: "festival", cost: 10, food });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
  return { ok: true, food };
}
