/**
 * menu.js — Royal Scepter Kingdom Menu (touch-first forms).
 * M1 surfaces: status, Minister dialogue, population roster,
 * Royal Economist wage preview, population policy, clock settings.
 */
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { world } from "@minecraft/server";
import { getState, saveState } from "../core/state.js";
import { greetMinister } from "./founding.js";
import { formatClock, phaseFor } from "../core/clock.js";
import { suggestWage } from "../core/economist.js";

export async function openMainMenu(player) {
  const state = getState();
  if (!state.founded) {
    player.sendMessage(
      "§6[KINGDOM] §7No kingdom yet. Run §f/kingdom:start §7to found your colony."
    );
    return;
  }

  const mood = state.citizens.length
    ? Math.round(
        state.citizens.reduce((s, c) => s + c.mood, 0) / state.citizens.length
      )
    : 0;

  const body =
    `§6§l${state.colony.name}§r   §7· §fDay ${state.day}\n` +
    `§7Banner: §f${state.colony.bannerColor} §7| Difficulty: §f${state.colony.difficulty}\n` +
    `§7King: §f${state.kingName}\n\n` +
    `§f👥 Citizens: §b${state.citizens.length}\n` +
    `§6💰 Treasury: §e₹${Math.round(state.treasury)} §7(money supply ₹${state.moneySupply})\n` +
    `§d😊 Happiness: §d${mood}%\n` +
    `§e⏰ ${formatClock(world.getTimeOfDay())} §7— ${phaseFor(world.getTimeOfDay())}`;

  const form = new ActionFormData()
    .title("👑 Kingdom Menu")
    .body(body)
    .button("🎩 Speak to the Minister")
    .button("👥 Population")
    .button("💰 Treasury & Suggested Wages")
    .button("🏠 Population Policy")
    .button("⏰ Clock & Day Settings");

  const res = await form.show(player);
  if (res.canceled) return;
  switch (res.selection) {
    case 0:
      await greetMinister(player);
      break;
    case 1:
      await openRoster(player);
      break;
    case 2:
      await openTreasury(player);
      break;
    case 3:
      await openPopulationPolicy(player);
      break;
    case 4:
      await openClockSettings(player);
      break;
  }
}

async function openRoster(player) {
  const state = getState();
  const form = new ActionFormData().title("👥 Population").body(
    `${state.citizens.length} citizens. Tap a name for details.`
  );
  for (const c of state.citizens) {
    const icon = c.role === "minister" ? "🎩" : c.sex === "m" ? "👨" : "👩";
    form.button(`${icon} ${c.fullName}\n§7${c.profession} · L${c.level} · ₹${c.wage}/day`);
  }
  form.button("§8← Back");

  const res = await form.show(player);
  if (res.canceled) return;
  if (res.selection === state.citizens.length) return openMainMenu(player);
  const c = state.citizens[res.selection];
  if (!c) return;

  const detail = new ActionFormData()
    .title(c.fullName)
    .body(
      `§7Role: §f${c.role}\n` +
        `§7Profession: §f${c.profession} §7(level ${c.level}, ${c.xp} xp)\n` +
        `§7Pay: §e₹${c.wage}/day §7(${c.wageMode})\n` +
        `§7Status: §f${c.status}\n` +
        `§7Mood: §d${c.mood}% §7| Health: §f${c.health}\n` +
        `§7Home: §f${c.home ?? "none yet"}\n` +
        `§7Spouse: §f${c.spouse ?? "unmarried"}\n\n` +
        `§8Schedules, needs, families and custom professions arrive in M2/M7.`
    )
    .button("§8← Back to roster");
  const d = await detail.show(player);
  if (!d.canceled) return openRoster(player);
}

async function openTreasury(player) {
  const state = getState();
  const samples = [
    ["farmer", {}],
    ["miner", { danger: "cave" }],
    ["deepMiner", { danger: "lava" }],
    ["deepDarkMiner", { danger: "deepDark", level: 2 }],
    ["soldier", {}],
    ["doctor", { level: 3 }],
  ]
    .map(([job, opts]) => {
      const s = suggestWage(job, opts);
      return `§7• ${job}: §e₹${s.wage}/day §8(${s.reason})`;
    })
    .join("\n");

  const form = new ActionFormData()
    .title("💰 Treasury & Royal Economist")
    .body(
      `§6Treasury: §e₹${Math.round(state.treasury)}   §7Money supply ₹${state.moneySupply}\n` +
        `§7Net profit and GDP start ticking once markets open (M3–M4).\n\n` +
        `§l§6Suggested wages (auto-balanced):\n${samples}\n\n` +
        `§8Danger pay scales up automatically — Deep Dark work earns up to ×3.`
    )
    .button("§8← Back");
  const res = await form.show(player);
  if (!res.canceled) return openMainMenu(player);
}

async function openPopulationPolicy(player) {
  const state = getState();
  const modeIndex =
    state.populationPolicy.mode === "fixed"
      ? 1
      : state.populationPolicy.mode === "autogrow"
      ? 2
      : 0;

  const form = new ModalFormData()
    .title("🏠 Population Policy")
    .dropdown(
      "Growth mode",
      ["Unlimited — grow as conditions allow", "Fixed cap — stop at the cap", "Auto-grow — steady rate over time"],
      modeIndex
    )
    .slider("Fixed cap (if chosen)", 5, 200, 1, state.populationPolicy.cap)
    .slider("Auto-grow: adults per 10 days", 1, 10, 1, state.populationPolicy.growPer10Days);

  const res = await form.show(player);
  if (res.canceled) return;
  state.populationPolicy = {
    mode: ["unlimited", "fixed", "autogrow"][Number(res.formValues[0])],
    cap: Number(res.formValues[1]),
    growPer10Days: Number(res.formValues[2]),
  };
  saveState();
  player.sendMessage(
    `§6[KINGDOM] §7Population policy saved: §f${describePolicy(state.populationPolicy)}`
  );
}

async function openClockSettings(player) {
  const state = getState();
  const form = new ActionFormData()
    .title("⏰ Clock & Day Settings")
    .body(
      `§lCurrent rules\n` +
        `§7• Day length: §f${state.timePresetMinutes} real minutes §7(vanilla default)\n` +
        `§7• Time now: §f${formatClock(world.getTimeOfDay())} — ${phaseFor(world.getTimeOfDay())}\n\n` +
        `§7The colony keeps the standard Minecraft 20-minute day-night cycle. ` +
        `1 real minute = 1.2 colony hours; tick 0 = 06:00 breakfast bell.\n\n` +
        `§8Longer day presets (40/60/90 minutes) arrive with the time-decree system (M6).`
    )
    .button("§8← Back");
  const res = await form.show(player);
  if (!res.canceled) return openMainMenu(player);
}

function describePolicy(p) {
  if (p.mode === "fixed") return `hard cap of ${p.cap} citizens`;
  if (p.mode === "autogrow") return `+${p.growPer10Days} adults every 10 days`;
  return "unlimited growth";
}
