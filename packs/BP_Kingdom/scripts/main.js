/**
 * main.js — KINGDOM bootstrap.
 * Wires the /kingdom:start command, the Royal Scepter, the daily
 * Day Roll, the action-bar clock and the sidebar HUD.
 *
 * Milestone: M1 (founding party, clock/HUD, state persistence)
 */
import {
  world,
  system,
  Player,
  CommandPermissionLevel,
  CustomCommandStatus,
} from "@minecraft/server";
import { getState, saveState } from "./core/state.js";
import { startFounding, ensureScepter, SCEPTER_NAME } from "./game/founding.js";
import { openMainMenu } from "./game/menu.js";
import { renderHud, renderClock } from "./core/hud.js";

/* ------------------------------------------------------------------ */
/* /kingdom:start — native custom slash command (stable API, 2.1.0+)  */
/* ------------------------------------------------------------------ */
system.beforeEvents.startup.subscribe((event) => {
  const registry = event.customCommandRegistry;
  if (!registry) {
    console.warn("[KINGDOM] customCommandRegistry unavailable on this build");
    return;
  }
  registry.registerCommand(
    {
      name: "kingdom:start",
      description: "Found your KINGDOM colony",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const source = origin.initiator ?? origin.sourceEntity;
      // Commands may run in read-only early execution; defer world changes.
      system.run(() => {
        if (source instanceof Player) startFounding(source);
      });
      return { status: CustomCommandStatus.Success, message: "" };
    }
  );
});

/* ------------------------------------------------------------------ */
/* Royal Scepter → Kingdom Menu                                       */
/* ------------------------------------------------------------------ */
world.afterEvents.itemUse.subscribe((event) => {
  if (event.itemStack?.nameTag?.includes(SCEPTER_NAME)) {
    system.run(() => openMainMenu(event.source));
  }
});

/* Returning players always get a scepter back if one is missing. */
world.afterEvents.playerSpawn.subscribe((event) => {
  if (!event.initialSpawn) return;
  const state = getState();
  if (state.founded) system.run(() => ensureScepter(event.player));
});

/* ------------------------------------------------------------------ */
/* Per-second clock/HUD + the dawn Day Roll                            */
/* ------------------------------------------------------------------ */
system.runInterval(() => {
  const state = getState();
  if (!state.founded) return;

  const worldDay = world.getDay();
  const currentDay = Math.max(1, worldDay - (state.foundedWorldDay ?? worldDay) + 1);
  if (currentDay !== state.day) {
    state.day = currentDay;
    morningReport(state);
    saveState();
  }

  renderClock(state);
  renderHud(state);
}, 20); // 20 ticks = 1 real second

function morningReport(state) {
  const report =
    `§6☀️ §lDawn of Day ${state.day}§r — §7Morning report:\n` +
    `§7  Population §f${state.citizens.length} §7| Treasury §e₹${Math.round(
      state.treasury
    )}\n` +
    `§8  (Production, wages, taxes and trade begin in later milestones.)`;
  for (const player of world.getAllPlayers()) player.sendMessage(report);
}

console.log("[KINGDOM] M1 loaded — run /kingdom:start to found your colony.");
