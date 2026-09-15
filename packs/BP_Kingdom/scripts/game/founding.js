/**
 * founding.js — the /kingdom:start experience:
 * setup form → Minister arrives → gather 2M/2W settlers → Royal Scepter.
 */
import { world, ItemStack } from "@minecraft/server";
import { ModalFormData, ActionFormData } from "@minecraft/server-ui";
import { getState, saveState } from "../core/state.js";
import { spawnMinister, spawnFoundingParty } from "./citizens.js";

export const SCEPTER_NAME = "Royal Scepter";
const COLORS = ["Crimson", "Royal Blue", "Emerald", "Royal Purple", "Gold"];
const DIFFICULTIES = ["Peaceful", "Standard", "Harsh"];

/** Entry point for /kingdom:start. */
export async function startFounding(player) {
  const state = getState();
  if (state.founded) {
    player.sendMessage(
      `§6[KINGDOM] §7You already rule §f${state.colony.name}§7. Use the §6Royal Scepter §7to open the Kingdom Menu.`
    );
    return;
  }

  const form = new ModalFormData()
    .title("🏰 Found Your Kingdom")
    .textField("Colony name", "e.g. New Victoria", "New Victoria")
    .dropdown("Banner colour", COLORS, 1)
    .dropdown("Difficulty", DIFFICULTIES, 1);

  let res;
  try {
    res = await form.show(player);
  } catch {
    return;
  }
  if (res.canceled) {
    player.sendMessage(
      "§6[KINGDOM] §7Founding cancelled. Run §f/kingdom:start §7again when you are ready, Your Majesty."
    );
    return;
  }

  const name = String(res.formValues[0] ?? "").trim() || "New Victoria";
  state.kingName = player.name;
  state.colony = {
    name,
    bannerColor: COLORS[Number(res.formValues[1]) ?? 1],
    difficulty: DIFFICULTIES[Number(res.formValues[2]) ?? 1],
  };
  state.founded = true;
  state.ministerGreeted = false;
  state.foundedWorldDay = world.getDay();
  state.day = 1;
  state.zones.town = {
    x: Math.floor(player.location.x) + 0.5,
    y: Math.floor(player.location.y),
    z: Math.floor(player.location.z) + 0.5,
  };

  const minister = spawnMinister(player, state);
  saveState();

  player.onScreenDisplay.setTitle("§6§l🏰 KINGDOM", {
    subtitle: `§f${name} §7is founded`,
    stayDuration: 60,
    fadeInDuration: 10,
    fadeOutDuration: 20,
  });
  player.sendMessage(
    `§6[KINGDOM] §e${minister.fullName} §7arrives and bows. §o"Your Majesty… I shall be your Minister. Shall I gather the first settlers?"`
  );

  greetMinister(player);
}

/** Minister greeting; used after founding and later from the scepter menu. */
export async function greetMinister(player) {
  const state = getState();
  if (!state.founded) return;

  if (state.ministerGreeted) {
    player.sendMessage(
      `§6[KINGDOM] §eThe founding party is assembled, Your Majesty. Open the §6Royal Scepter §7menu to begin ruling.`
    );
    return;
  }

  const form = new ActionFormData()
    .title("🎩 Sir Edmund Hale — Minister")
    .body(
      `§o"Your Majesty, I have recruited four willing settlers — two men and two women — who await your word. They will §nfollow you§r§o until you tell them to go work and live their lives.\n\n` +
        `The Crown treasury holds §e₹${state.treasury}§r§o. With your leave I will have them step forward now."`
    )
    .button("§a§lGather my four settlers");

  const res = await form.show(player);
  if (res.canceled || res.selection !== 0) {
    player.sendMessage(
      `§6[KINGDOM] §7Speak to §fSir Edmund §7again via the Royal Scepter when you are ready.`
    );
    return;
  }

  const settlers = spawnFoundingParty(player, state);
  ensureScepter(player);
  state.ministerGreeted = true;
  saveState();

  player.onScreenDisplay.setTitle("§6§lThe Founding Party", {
    subtitle: "§72 men · 2 women · 1 Minister",
    stayDuration: 60,
  });
  for (const c of settlers) {
    player.sendMessage(
      `§6[KINGDOM] §7• §f${c.fullName} §7— ${c.profession} — wage suggested ₹${c.wage}/day (following you)`
    );
  }
  player.sendMessage(
    `§6[KINGDOM] §aYou received the §6Royal Scepter§a. Long-press/use it to open the Kingdom Menu.\n` +
      `§7① §fOrders §7→ release everyone to §olive & work§r §7(or keep them following you)\n` +
      `§7② §fSites & Stockpile §7→ stand in a grove/farm/quarry and mark each work site\n` +
      `§7③ A stockpile §fchest §7you look at can be registered as the delivery point.`
  );
}

/** Gives the Royal Scepter if the player does not already carry one. */
export function ensureScepter(player) {
  const container = player.getComponent("inventory")?.container;
  if (!container) return;
  for (let i = 0; i < container.size; i++) {
    const item = container.getItem(i);
    if (item?.nameTag?.includes(SCEPTER_NAME)) return;
  }
  const scepter = new ItemStack("minecraft:stick", 1);
  scepter.nameTag = "§6§lRoyal Scepter";
  scepter.setLore([
    "§7Use (long-press) to open the",
    "§7Kingdom Menu.",
    "",
    "§e👑 KINGDOM",
  ]);
  container.addItem(scepter);
}
