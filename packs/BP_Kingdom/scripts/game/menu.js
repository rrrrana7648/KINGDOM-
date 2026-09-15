/**
 * menu.js — Royal Scepter Kingdom Menu (touch-first forms).
 * M2: status, Minister, broadcast & individual orders, population roster,
 * work sites + stockpile chest, wage previews, population policy, clock.
 */
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { world } from "@minecraft/server";
import { getState, saveState } from "../core/state.js";
import { greetMinister } from "./founding.js";
import { formatClock, phaseFor } from "../core/clock.js";
import { suggestWage } from "../core/economist.js";
import { setModeAll } from "./schedule.js";
import { resetRuntime } from "./jobs.js";
import { getEntity, refreshNameTag } from "./npcRegistry.js";

const PROFESSIONS = ["woodcutter", "farmer", "builder", "laborer"];
const DIM = () => world.getDimension("overworld");

export async function openMainMenu(player) {
  const state = getState();
  if (!state.founded) {
    player.sendMessage("§6[KINGDOM] §7No kingdom yet. Run §f/kingdom:start§7.");
    return;
  }
  const mood = avgMood(state);
  const body =
    `§6§l${state.colony.name}§r   §7· §fDay ${state.day}\n` +
    `§7Banner §f${state.colony.bannerColor} §7| Difficulty §f${state.colony.difficulty}\n\n` +
    `§f👥 Citizens: §b${state.citizens.filter((c) => c.alive).length}\n` +
    `§6💰 Treasury: §e₹${Math.round(state.treasury)} §7(rations ${state.foodStock})\n` +
    `§d😊 Happiness: §d${mood}%\n` +
    `§e⏰ ${formatClock(world.getTimeOfDay())} §7— ${phaseFor(world.getTimeOfDay())}`;

  const form = new ActionFormData()
    .title("👑 Kingdom Menu")
    .body(body)
    .button("🎩 Speak to the Minister")
    .button("📜 Orders")
    .button("👥 Population")
    .button("🏳️ Work Sites & Stockpile")
    .button("💰 Treasury & Suggested Wages")
    .button("🏠 Population Policy")
    .button("⏰ Clock & Day Settings");
  const res = await form.show(player);
  if (res.canceled) return;
  switch (res.selection) {
    case 0: return greetMinister(player);
    case 1: return openOrders(player);
    case 2: return openRoster(player);
    case 3: return openSites(player);
    case 4: return openTreasury(player);
    case 5: return openPopulationPolicy(player);
    case 6: return openClockSettings(player);
  }
}

/* ---------------- Orders ---------------- */

async function openOrders(player) {
  const state = getState();
  const workers = state.citizens.filter((c) => c.alive && c.role !== "minister");
  const living = workers.filter((c) => c.mode === "living").length;
  const following = workers.length - living;
  const form = new ActionFormData()
    .title("📜 Orders")
    .body(
      `Citizens §bfollowing you: §f${following} §7| §aliving & working: §f${living}\n\n` +
      `§7Released citizens follow the daily schedule: breakfast, two shifts, ` +
      `dinner, leisure, curfew at 21:00. They need marked work sites.`
    )
    .button("🟢 All — go work & live your life")
    .button("🟡 All — follow me")
    .button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === 2) return res.selection === 2 ? openMainMenu(player) : undefined;
  const mode = res.selection === 0 ? "living" : "following";
  const n = setModeAll(state, mode);
  for (const c of state.citizens) {
    const e = getEntity(c, DIM());
    if (e) refreshNameTag(c, e);
  }
  saveState();
  player.sendMessage(
    mode === "living"
      ? `§aOrders delivered — ${n} citizens now live and work their shifts.`
      : `§eOrders delivered — ${n} citizens fall in behind you.`
  );
}

/* ---------------- Population ---------------- */

async function openRoster(player) {
  const state = getState();
  const alive = state.citizens.filter((c) => c.alive);
  const form = new ActionFormData()
    .title("👥 Population")
    .body(`${alive.length} citizens. Tap a name for orders.`);
  for (const c of alive) {
    const icon = c.role === "minister" ? "🎩" : c.sex === "m" ? "👨" : "👩";
    const mode = c.mode === "living" ? "works" : "follows";
    form.button(`${icon} ${c.fullName}\n§7${c.profession} L${c.level} · ₹${c.wage}/d · ${mode}`);
  }
  form.button("§8← Back");
  const res = await form.show(player);
  if (res.canceled) return;
  if (res.selection === alive.length) return openMainMenu(player);
  return openCitizen(player, alive[res.selection]);
}

async function openCitizen(player, c) {
  const state = getState();
  const n = c.needs ?? { food: 100, rest: 100, leisure: 100, safety: 100 };
  const bar = (v) => "§a".repeat(Math.round(v / 20)) + "§8".repeat(5 - Math.round(v / 20));
  const body =
    `${c.role === "minister" ? "§6§l" : "§f"}${c.fullName}\n` +
    `§7Profession §f${c.profession} §7L${c.level} (${c.xp} xp)\n` +
    `§7Pay §e₹${c.wage}/day §7(${c.wageMode}) §7| savings ₹${c.savings ?? 0}\n` +
    `§7Mode §f${c.mode} ${c.armed ? "§7| §farmed for night" : ""}\n` +
    `§7Mood §d${c.mood}% §7· delivered today §f${c.day?.delivered ?? 0}\n` +
    `§7Food ${bar(n.food)} §r§7Rest ${bar(n.rest)}\n` +
    `§7Leisure ${bar(n.leisure)} §r§7Safety ${bar(n.safety)}`;
  const form = new ActionFormData()
    .title(c.fullName.split(" ")[0])
    .body(body);
  if (c.role !== "minister") {
    form.button(c.mode === "living" ? "🟡 Call to follow me" : "🟢 Go work & live your life");
    form.button(c.armed ? "🔱 Stand down (no sword)" : "🗡️ Carry a sword at night");
    form.button("🔁 Change profession");
  }
  form.button("§8← Back to roster");
  const res = await form.show(player);
  if (res.canceled) return;
  let idx = 0;
  if (c.role !== "minister") {
    if (res.selection === 0) {
      c.mode = c.mode === "living" ? "following" : "living";
      c.status = c.mode === "living" ? "working" : "following";
      resetRuntime(c.id);
      player.sendMessage(`§7${c.fullName} now ${c.mode === "living" ? "lives and works." : "follows you."}`);
    } else if (res.selection === 1) {
      c.armed = !c.armed;
      player.sendMessage(
        c.armed
          ? `§7${c.fullName} will carry a sword and keep nerve at night.`
          : `§7${c.fullName} stands down; will flee from danger.`
      );
    } else if (res.selection === 2) {
      return changeProfession(player, c);
    }
    idx = 3;
  } else {
    idx = 0;
  }
  if (res.selection === idx) return openRoster(player);
  const e = getEntity(c, DIM());
  if (e) refreshNameTag(c, e);
  saveState();
  return openCitizen(player, c);
}

async function changeProfession(player, c) {
  const current = Math.max(0, PROFESSIONS.indexOf(c.profession));
  const form = new ModalFormData()
    .title(`🔁 ${c.fullName}`)
    .dropdown("New profession", PROFESSIONS.map(cap), current);
  const res = await form.show(player);
  if (res.canceled) return openCitizen(player, c);
  const job = PROFESSIONS[Number(res.formValues[0])];
  c.profession = job;
  c.xp = Math.floor(c.xp * 0.6); // related skills partly transfer
  c.wage = suggestWage(job, { level: c.level }).wage;
  resetRuntime(c.id);
  const e = getEntity(c, DIM());
  if (e) refreshNameTag(c, e);
  saveState();
  player.sendMessage(`§7${c.fullName} is now a §f${job} §7(suggested wage ₹${c.wage}/day).`);
  return openCitizen(player, c);
}

/* ---------------- Work sites & stockpile ---------------- */

async function openSites(player) {
  const state = getState();
  const z = state.zones;
  const f = (p) => (p ? `§a${Math.round(p.x)}, ${Math.round(p.y)}, ${Math.round(p.z)}` : "§cnot set");
  const body =
    `§lMark sites by standing in them, then choose below.§r\n\n` +
    `🏛 Town square: ${f(z.town)}\n` +
    `🌳 Forest (woodcutter): ${f(z.forest)} §7r${z.forest?.r ?? 10}\n` +
    `🌾 Farm (farmer): ${f(z.farm)} §7r${z.farm?.r ?? 6}\n` +
    `🪨 Quarry (builder/laborer): ${f(z.quarry)} §7r${z.quarry?.r ?? 6}\n` +
    `🛏 Rest/home site: ${f(z.home)}\n` +
    `📦 Stockpile chest: ${f(z.stockpileChest)}`;
  const form = new ActionFormData()
    .title("🏳️ Work Sites & Stockpile")
    .body(body)
    .button("🏛 Set town square here")
    .button("🌳 Set forest site here")
    .button("🌾 Set farm site here")
    .button("🪨 Set quarry site here")
    .button("🛏 Set rest/home site here")
    .button("📦 Register chest I'm looking at")
    .button("§cUnregister stockpile chest")
    .button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === 7) return res.selection === 7 ? openMainMenu(player) : undefined;
  const here = () => ({
    x: Math.floor(player.location.x) + 0.5,
    y: Math.floor(player.location.y),
    z: Math.floor(player.location.z) + 0.5,
  });
  switch (res.selection) {
    case 0: state.zones.town = here(); break;
    case 1: state.zones.forest = { ...here(), r: 10 }; break;
    case 2: state.zones.farm = { ...here(), r: 6 }; break;
    case 3: state.zones.quarry = { ...here(), r: 6 }; break;
    case 4: state.zones.home = here(); break;
    case 5: return registerChest(player);
    case 6: state.zones.stockpileChest = null; player.sendMessage("§7Stockpile chest unregistered."); break;
  }
  saveState();
  return openSites(player);
}

function registerChest(player) {
  const state = getState();
  const hit = player.getBlockFromViewDirection?.({ maxDistance: 8 });
  const block = hit?.block;
  if (!block || !block.typeId.includes("chest")) {
    player.sendMessage("§cLook at a chest (within 8 blocks) and try again.");
    return openSites(player);
  }
  state.zones.stockpileChest = { x: block.location.x, y: block.location.y, z: block.location.z };
  saveState();
  player.sendMessage("§aStockpile chest registered — deliveries fill this chest.");
  return openSites(player);
}

/* ---------------- Treasury / policy / clock ---------------- */

async function openTreasury(player) {
  const state = getState();
  const samples = [
    ["farmer", {}], ["woodcutter", {}], ["builder", {}],
    ["miner", { danger: "cave" }], ["deepMiner", { danger: "lava" }],
    ["deepDarkMiner", { danger: "deepDark", level: 2 }],
    ["soldier", {}], ["doctor", { level: 3 }],
  ].map(([job, opts]) => {
    const s = suggestWage(job, opts);
    return `§7• ${job}: §e₹${s.wage}/day §8(${s.reason})`;
  }).join("\n");
  const stock = Object.entries(state.stockpile)
    .filter(([, n]) => n)
    .map(([id, n]) => `${id.replace("minecraft:", "").replaceAll("_", " ")} ${n}`)
    .join("§7, ") || "§8nothing yet";
  const form = new ActionFormData()
    .title("💰 Treasury & Royal Economist")
    .body(
      `§6Treasury §e₹${Math.round(state.treasury)} §7| supply ₹${state.moneySupply} §7| rations ${state.foodStock}\n` +
      `§7Warehouse stock: ${stock}\n\n§l§6Suggested wages:\n${samples}`
    )
    .button("§8← Back");
  const res = await form.show(player);
  if (!res.canceled) return openMainMenu(player);
}

async function openPopulationPolicy(player) {
  const state = getState();
  const modeIndex = state.populationPolicy.mode === "fixed" ? 1 : state.populationPolicy.mode === "autogrow" ? 2 : 0;
  const form = new ModalFormData()
    .title("🏠 Population Policy")
    .dropdown("Growth mode",
      ["Unlimited — grow as conditions allow", "Fixed cap — stop at the cap", "Auto-grow — steady rate over time"], modeIndex)
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
  player.sendMessage(`§6[KINGDOM] §7Population policy saved: §f${describePolicy(state.populationPolicy)}`);
}

async function openClockSettings(player) {
  const state = getState();
  const form = new ActionFormData()
    .title("⏰ Clock & Day Settings")
    .body(
      `§7• Day length: §f${state.timePresetMinutes} real minutes §7(standard Minecraft)\n` +
      `§7• Now: §f${formatClock(world.getTimeOfDay())} — ${phaseFor(world.getTimeOfDay())}\n\n` +
      `§720 real minutes = one colony day; tick 0 = 06:00 breakfast bell. ` +
      `Longer day presets (40/60/90) arrive with the time-decree system (M6).`
    )
    .button("§8← Back");
  const res = await form.show(player);
  if (!res.canceled) return openMainMenu(player);
}

function avgMood(state) {
  const a = state.citizens.filter((c) => c.alive);
  if (!a.length) return 0;
  return Math.round(a.reduce((s, c) => s + c.mood, 0) / a.length);
}
function cap(s) { return s[0].toUpperCase() + s.slice(1); }
function describePolicy(p) {
  if (p.mode === "fixed") return `hard cap of ${p.cap} citizens`;
  if (p.mode === "autogrow") return `+${p.growPer10Days} adults every 10 days`;
  return "unlimited growth";
}
