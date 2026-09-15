/**
 * main.js — KINGDOM bootstrap.
 * M2: citizen schedule ticks, daily Day Roll (wages/mood/production),
 * NPC death handling and entity relink after relogs.
 * M4–M8: the Day Roll settles the full economy (market, taxes, GDP, mint,
 * bank, decrees, construction, family, missions, harbor); deaths settle
 * wills & inheritance (M7).
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
import { tickCitizens } from "./game/schedule.js";
import { runDayRoll } from "./game/dayroll.js";
import { relinkAll, recordForEntity } from "./game/npcRegistry.js";
import { handleInheritance } from "./social/housing.js";
import { buyerForCitizen } from "./economy/buyers.js";

/* ---------------- /kingdom:start ---------------- */
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
      system.run(() => {
        if (source instanceof Player) startFounding(source);
      });
      return { status: CustomCommandStatus.Success, message: "" };
    }
  );
});

/* ---------------- Royal Scepter ---------------- */
world.afterEvents.itemUse.subscribe((event) => {
  if (event.itemStack?.nameTag?.includes(SCEPTER_NAME)) {
    system.run(() => openMainMenu(event.source));
  }
});

/* ---------------- (Re)load housekeeping ---------------- */
world.afterEvents.playerSpawn.subscribe((event) => {
  if (!event.initialSpawn) return;
  const state = getState();
  if (state.founded) {
    system.run(() => {
      ensureScepter(event.player);
      relinkAll(state, world.getDimension("overworld"));
    });
  }
});

/* ---------------- NPC deaths ---------------- */
world.afterEvents.entityDie.subscribe((event) => {
  const state = getState();
  if (!state.founded) return;
  const record = recordForEntity(state, event.deadEntity);
  if (!record) return;
  record.alive = false;
  record.status = "deceased";
  const heir = handleInheritance(state, record);
  // A fallen clerk's stall closes; its float returns to the treasury and its
  // stock consolidates at the next dawn cart-run.
  const stall = buyerForCitizen(state, record.id);
  if (stall) {
    stall.active = false;
    state.treasury = Math.round((state.treasury + (stall.float ?? 0)) * 100) / 100;
    stall.float = 0;
  }
  saveState();
  for (const p of world.getAllPlayers()) {
    p.sendMessage(`§c⚰ ${record.fullName} (${record.profession}) has died. The colony mourns; an inquest is recorded.`);
    if (stall) {
      p.sendMessage(`§7🛒 The ${stall.commodity} stall stands shuttered; hire a new clerk to reopen it.`);
    }
    if (heir) {
      p.sendMessage(`§7📜 The will is read: ${heir.fullName} inherits the estate.`);
    }
  }
});

/* ---------------- Simulation loops ---------------- */
// Citizen brains: every 5 ticks (4 times per second).
system.runInterval(() => {
  const state = getState();
  if (!state.founded) return;
  tickCitizens(state, system.currentTick);
}, 5);

// Clock + HUD: every 20 ticks (once per second).
system.runInterval(() => {
  const state = getState();
  if (!state.founded) return;

  const worldDay = world.getDay();
  const currentDay = Math.max(1, worldDay - (state.foundedWorldDay ?? worldDay) + 1);
  if (currentDay !== state.day) {
    state.day = currentDay;
    const report = runDayRoll(state, world.getDimension("overworld"));
    for (const line of report.lines)
      for (const player of world.getAllPlayers()) player.sendMessage(line);
    saveState();
  }

  renderClock(state);
  renderHud(state);
}, 20);

// Safety save every 5 seconds (production/deliveries).
system.runInterval(() => {
  const state = getState();
  if (state.founded) saveState();
}, 100);

console.log("[KINGDOM] M8 loaded — /kingdom:start, then rule: taxes, mint, decrees, families, harbor.");
