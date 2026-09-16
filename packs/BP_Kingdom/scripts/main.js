/**
 * main.js — KINGDOM bootstrap.
 * M2: citizen schedule ticks, daily Day Roll (wages/mood/production),
 * NPC death handling and entity relink after relogs.
 * M4–M8: the Day Roll settles the full economy (market, taxes, GDP, mint,
 * bank, decrees, construction, family, missions, harbor); deaths settle
 * wills & inheritance (M7).
 * M12.1: stable-API hardening — every engine surface used here exists in
 * @minecraft/server 2.1.0 / @minecraft/server-ui 2.0.0 (Bedrock 1.21.100+).
 * Chat orders ride `/kingdom:order …` (stable custom command) and, where a
 * build also exposes the beta `chatSend` event, plain `!orders` in chat.
 */
import {
  world,
  system,
  Player,
  CommandPermissionLevel,
  CustomCommandParamType,
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
import { parseCommand } from "./game/commands.js";
import { sting } from "./core/sounds.js";

const TAG = "§6[KINGDOM] §7";

/** Runs a chat order for a player and prints the reply. */
function runOrder(player, text) {
  const state = getState();
  if (!state.founded) {
    player.sendMessage(`${TAG}No kingdom yet. Run §f/kingdom:start§7.`);
    return;
  }
  try {
    const out = parseCommand(state, player.name, text);
    if (!out) {
      player.sendMessage(`${TAG}Say an order, e.g. §f/kingdom:order status§7 or §f/kingdom:order help§7.`);
      return;
    }
    for (const line of out.lines) player.sendMessage(line);
    if (out.mutated) saveState();
  } catch (err) {
    console.warn(`[KINGDOM] order failed: ${err}`);
    try { player.sendMessage("§cThe clerks misheard that order."); } catch { /* */ }
  }
}

/** The player behind a custom command, if any. */
function commandPlayer(origin) {
  const source = origin?.initiator ?? origin?.sourceEntity;
  return source instanceof Player ? source : undefined;
}

/* ---------------- Custom commands (stable since 2.1.0) ---------------- */
system.beforeEvents.startup.subscribe((event) => {
  const registry = event.customCommandRegistry;
  if (!registry) {
    console.warn("[KINGDOM] customCommandRegistry unavailable on this build");
    return;
  }

  // /kingdom:start — found the colony.
  registry.registerCommand(
    {
      name: "kingdom:start",
      description: "Found your KINGDOM colony",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = commandPlayer(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Only a player may found a kingdom." };
      system.run(() => startFounding(player));
      return { status: CustomCommandStatus.Success };
    }
  );

  // /kingdom:menu — open the Kingdom Menu without the Scepter (and re-issue it).
  registry.registerCommand(
    {
      name: "kingdom:menu",
      description: "Open the Kingdom Menu (and restore a lost Royal Scepter)",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = commandPlayer(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Only a player may hold court." };
      system.run(() => {
        if (getState().founded) ensureScepter(player);
        openMainMenu(player);
      });
      return { status: CustomCommandStatus.Success };
    }
  );

  // /kingdom:order <order> [a] [b] [c] [d] — chat orders on the stable API.
  // Words are separate optional parameters so players need no quotes:
  //   /kingdom:order judge k-3 fine
  registry.registerCommand(
    {
      name: "kingdom:order",
      description: "Rule from the keyboard: /kingdom:order help",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "order", type: CustomCommandParamType.String }],
      optionalParameters: [
        { name: "a", type: CustomCommandParamType.String },
        { name: "b", type: CustomCommandParamType.String },
        { name: "c", type: CustomCommandParamType.String },
        { name: "d", type: CustomCommandParamType.String },
      ],
    },
    (origin, ...args) => {
      const player = commandPlayer(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Only a player may give orders." };
      const words = args.filter((w) => typeof w === "string" && w.length > 0);
      const text = "!" + words.join(" ").replace(/^!+/, "");
      system.run(() => runOrder(player, text));
      return { status: CustomCommandStatus.Success };
    }
  );
});

/* ---------------- Royal Scepter ---------------- */
world.afterEvents.itemUse.subscribe((event) => {
  const stack = event.itemStack;
  if (stack?.typeId === "kingdom:scepter" || stack?.nameTag?.includes(SCEPTER_NAME)) {
    system.run(() => openMainMenu(event.source));
  }
});

/* ---------------- Chat orders (!help) — beta builds only ---------------- */
// `chatSend` is not part of the stable module; when a build exposes it we
// intercept `!orders` in chat too. Otherwise /kingdom:order carries them.
const chatSend = world.beforeEvents.chatSend;
if (chatSend && typeof chatSend.subscribe === "function") {
  chatSend.subscribe((event) => {
    const text = event.message ?? "";
    if (!text.startsWith("!")) return;
    const state = getState();
    if (state.options?.chatOrders === false) return; // throne ignores !orders
    event.cancel = true;
    const sender = event.sender;
    system.run(() => runOrder(sender, text));
  });
}

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
  let record;
  try {
    record = recordForEntity(state, event.deadEntity);
  } catch {
    return; // the entity was already gone
  }
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
    sting("dawnBell"); // M12: the dawn bell over the morning report
    if (report.defense?.raid) sting(report.defense.won ? "trumpet" : "alarm");
    if (state.festivalDay === state.day) sting("festival");
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

console.log("[KINGDOM] M12.1 loaded — /kingdom:start · /kingdom:menu · /kingdom:order help");
