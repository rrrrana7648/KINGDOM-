/**
 * hud.js — the always-visible kingdom sidebar plus the action-bar clock.
 *
 * Sidebar = a scoreboard objective. Bedrock always shows the numeric score at
 * the right of each line, so M1 embeds the full reading in each label and uses
 * sequential scores purely for ordering (a tidy numbered list). A richer
 * canvas/glyph HUD can replace this at the M12 art pass.
 *
 * M4 lights up Net/day + GDP/day; M5 lights up inflation; M6–M8 feed the
 * population, treasury and happiness lines they already own.
 */
import { world, DisplaySlotId, ObjectiveSortOrder } from "@minecraft/server";
import { formatClock, phaseFor } from "./clock.js";
import { securityRating } from "../security/guards.js";
import { seasonIcon, weatherIcon } from "../events/seasons.js";

const OBJ_ID = "kingdom_hud";
const OBJ_TITLE = "§6§l👑 KINGDOM";

/** @returns {import("@minecraft/server").ScoreboardObjective} */
function objective() {
  let obj = world.scoreboard.getObjective(OBJ_ID);
  if (!obj) {
    obj = world.scoreboard.addObjective(OBJ_ID, OBJ_TITLE);
    world.scoreboard.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, {
      objective: obj,
      sortOrder: ObjectiveSortOrder.Ascending,
    });
  }
  return obj;
}

function aliveCitizens(state) {
  return state.citizens.filter((c) => c.alive !== false);
}

function avgMood(state) {
  const citizens = aliveCitizens(state);
  if (!citizens.length) return 0;
  return Math.round(
    citizens.reduce((sum, c) => sum + (c.mood ?? 0), 0) / citizens.length
  );
}

/** Rebuilds the sidebar (~ once per second). */
export function renderHud(state) {
  if (!state.founded) return;
  const obj = objective();

  // Clear previous label keys, then repaint in order.
  for (const p of obj.getParticipants()) obj.removeParticipant(p);

  const citizens = aliveCitizens(state);
  const living = citizens.filter((c) => c.mode === "living").length;
  const kids = citizens.filter((c) => c.ageStage !== "adult").length;
  const net = state.finances?.lastNet ?? 0;
  const gdp = state.finances?.lastGDP ?? 0;
  const infl = state.inflation?.pct ?? 0;
  const netColor = net >= 0 ? "§a" : "§c";
  const netArrow = net >= 0 ? "▲" : "▼";
  const popLine = kids > 0
    ? `§f👥 Pop: §b${citizens.length} §7· ${living} at work · 🍼${kids}`
    : `§f👥 Pop: §b${citizens.length} §7· ${living} at work`;
  const lines = [
    `§7${state.colony.name} §7· Day ${state.day}`,
    popLine,
    `§6💰 Treasury: §e₹${Math.round(state.treasury)}`,
    `§a📈 Net/day: ${netColor}₹${Math.round(net * 100) / 100} ${netArrow}`,
    `§b🏭 GDP/day: §f₹${Math.round(gdp * 100) / 100}`,
    `§d😊 Happiness: §d${avgMood(state)}%`,
    `§2🍞 Rations: §f${Math.round(state.foodStock)}`,
    secLine(state),
    skyLine(state),
    `§9🏦 Inflation: §f${infl}%`,
    policyLabel(state),
  ];
  lines.forEach((label, i) => obj.setScore(label, i + 1));
}

/** M9–M10: live security rating + unrest; M10: the turning sky. */
function secLine(state) {
  const rating = securityRating(state);
  const color = rating >= 70 ? "§a" : rating >= 40 ? "§e" : "§c";
  const unrest = Math.round(state.security?.unrest ?? 0);
  return `§8🛡️ Security: ${color}${rating} §7· ✊ ${unrest}`;
}

function skyLine(state) {
  const cl = state.climate ?? { season: "Spring", seasonDay: 1, weather: "clear" };
  return `§7${seasonIcon(cl.season)} ${cl.season} ${cl.seasonDay}/10 §7${weatherIcon(cl.weather)} ${cl.weather}`;
}

function policyLabel(state) {
  const p = state.populationPolicy;
  if (p.mode === "fixed") return `§7🏠 Pop. cap: §f${p.cap}`;
  if (p.mode === "autogrow") return `§7🏠 Auto-grow: §f+${p.growPer10Days}/10d`;
  return `§7🏠 Population: §funlimited`;
}

/** Per-player action bar: live brass clock + phase + day. */
export function renderClock(state) {
  if (!state.founded) return;
  const t = world.getTimeOfDay();
  const text = `§e⏰ ${formatClock(t)}   ${phaseFor(t)}   §7· Day ${state.day} ·`;
  for (const player of world.getAllPlayers()) {
    player.onScreenDisplay.setActionBar(text);
  }
}
