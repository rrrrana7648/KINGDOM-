/**
 * hud.js — the always-visible kingdom sidebar plus the action-bar clock.
 *
 * Sidebar = a scoreboard objective. Bedrock always shows the numeric score at
 * the right of each line, so M1 embeds the full reading in each label and uses
 * sequential scores purely for ordering (a tidy numbered list). A richer
 * canvas/glyph HUD can replace this at the M12 art pass.
 */
import { world, DisplaySlotId, ObjectiveSortOrder } from "@minecraft/server";
import { formatClock, phaseFor } from "./clock.js";

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

function avgMood(state) {
  if (!state.citizens.length) return 0;
  return Math.round(
    state.citizens.reduce((sum, c) => sum + (c.mood ?? 0), 0) /
      state.citizens.length
  );
}

/** Rebuilds the sidebar (~ once per second). */
export function renderHud(state) {
  if (!state.founded) return;
  const obj = objective();

  // Clear previous label keys, then repaint in order.
  for (const p of obj.getParticipants()) obj.removeParticipant(p);

  const adults = state.citizens.filter((c) => c.ageStage === "adult").length;
  const lines = [
    `§7${state.colony.name} §7· Day ${state.day}`,
    `§f👥 Population: §b${state.citizens.length} §7(adults ${adults})`,
    `§6💰 Treasury: §e₹${Math.round(state.treasury)}`,
    `§a📈 Net/day: §7— M4`,
    `§b🏭 GDP/day: §7— M4`,
    `§d😊 Happiness: §d${avgMood(state)}%`,
    `§2🍞 Food stock: §7— M3`,
    `§8🛡️ Security: §7— M9`,
    `§9🏦 Inflation: §7— M5`,
    policyLabel(state),
  ];
  lines.forEach((label, i) => obj.setScore(label, i + 1));
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
