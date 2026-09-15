/**
 * menu.js — Royal Scepter Kingdom Menu (touch-first forms).
 * M3: warehouse & licensed commodity buyers, floats/quotas/bands, the audit
 * ledger, plus crown-salary vs freelance piece-rate per citizen.
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
import { spawnBuyer } from "./citizens.js";
import { COMMODITIES, unitPrice, gradeForLevel } from "../economy/pricebook.js";

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
    `§f👥 Citizens: §b${state.citizens.filter((c) => c.alive).length} ` +
    `§7(🛒 ${state.buyers.filter((b) => b.active).length} buyers)\n` +
    `§6💰 Treasury: §e₹${Math.round(state.treasury)} §7(rations ${state.foodStock})\n` +
    `§d😊 Happiness: §d${mood}%\n` +
    `§e⏰ ${formatClock(world.getTimeOfDay())} §7— ${phaseFor(world.getTimeOfDay())}`;

  const form = new ActionFormData()
    .title("👑 Kingdom Menu")
    .body(body)
    .button("🎩 Speak to the Minister")
    .button("📜 Orders")
    .button("👥 Population")
    .button("📦 Warehouse, Sites & Buyers")
    .button("📒 Audit Ledger")
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
    case 4: return openLedger(player);
    case 5: return openTreasury(player);
    case 6: return openPopulationPolicy(player);
    case 7: return openClockSettings(player);
  }
}

/* ---------------- Orders ---------------- */

async function openOrders(player) {
  const state = getState();
  const workers = state.citizens.filter((c) => c.alive && c.role !== "minister");
  const living = workers.filter((c) => c.mode === "living").length;
  const form = new ActionFormData()
    .title("📜 Orders")
    .body(
      `Citizens §bfollowing you: §f${workers.length - living} §7| §aliving & working: §f${living}\n\n` +
      `§7Released citizens follow the daily schedule and sell at buyer stalls.`
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
    const icon = c.role === "minister" ? "🎩" : c.profession === "buyer" ? "🛒" : c.sex === "m" ? "👨" : "👩";
    const mode = c.mode === "living" ? "works" : "follows";
    const pay = c.wageMode === "freelance" ? "piece-rate" : `₹${c.wage}/d`;
    form.button(`${icon} ${c.fullName}\n§7${c.profession} L${c.level} · ${pay} · ${mode}`);
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
  const blocks = (v) => "§a".repeat(Math.round(v / 20)) + "§8".repeat(5 - Math.round(v / 20));
  const body =
    `${c.role === "minister" ? "§6§l" : "§f"}${c.fullName}\n` +
    `§7Profession §f${c.profession} §7L${c.level} (${c.xp} xp)\n` +
    `§7Pay §f${c.wageMode === "freelance" ? "freelance piece-rate (paid at stalls)" : `₹${c.wage}/day crown salary`}\n` +
    `§7Savings §e₹${c.savings ?? 0} §7| mode §f${c.mode} ${c.armed ? "§7| armed at night" : ""}\n` +
    `§7Mood §d${c.mood}% §7· delivered today §f${c.day?.delivered ?? 0}\n` +
    `§7Food ${blocks(n.food)} §r§7Rest ${blocks(n.rest)}\n` +
    `§7Leisure ${blocks(n.leisure)} §r§7Safety ${blocks(n.safety)}`;
  const form = new ActionFormData().title(c.fullName.split(" ")[0]).body(body);
  if (c.role !== "minister" && c.profession !== "buyer") {
    form.button(c.mode === "living" ? "🟡 Call to follow me" : "🟢 Go work & live your life");
    form.button(c.armed ? "🔱 Stand down (no sword)" : "🗡️ Carry a sword at night");
    form.button("🔁 Change profession");
    form.button(c.wageMode === "freelance" ? "🟡 Put on crown salary" : "🟢 Release as freelance (piece-rate)");
  }
  form.button("§8← Back to roster");
  const res = await form.show(player);
  if (res.canceled) return;
  const backIndex = c.role !== "minister" && c.profession !== "buyer" ? 4 : 0;
  if (res.selection === backIndex) return openRoster(player);
  if (c.role !== "minister" && c.profession !== "buyer") {
    if (res.selection === 0) {
      c.mode = c.mode === "living" ? "following" : "living";
      c.status = c.mode === "living" ? "working" : "following";
      resetRuntime(c.id);
      player.sendMessage(`§7${c.fullName} now ${c.mode === "living" ? "lives and works." : "follows you."}`);
    } else if (res.selection === 1) {
      c.armed = !c.armed;
      player.sendMessage(`§7${c.fullName} ${c.armed ? "will carry a sword at night." : "stands down."}`);
    } else if (res.selection === 2) {
      return changeProfession(player, c);
    } else if (res.selection === 3) {
      c.wageMode = c.wageMode === "freelance" ? "crown" : "freelance";
      player.sendMessage(
        c.wageMode === "freelance"
          ? `§7${c.fullName} is now §afreelance§7 — paid per item at buyer stalls/warehouse.`
          : `§7${c.fullName} is back on §ecrown salary §7(₹${c.wage}/day).`
      );
    }
  }
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
  c.buyerCommodity = undefined;
  c.xp = Math.floor(c.xp * 0.6);
  c.wage = suggestWage(job, { level: c.level }).wage;
  resetRuntime(c.id);
  const e = getEntity(c, DIM());
  if (e) refreshNameTag(c, e);
  saveState();
  player.sendMessage(`§7${c.fullName} is now a §f${job} §7(₹${c.wage}/day).`);
  return openCitizen(player, c);
}

/* ---------------- Warehouse, sites, buyers ---------------- */

async function openSites(player) {
  const state = getState();
  const z = state.zones;
  const f = (p) => (p ? `§a${Math.round(p.x)}, ${Math.round(p.y)}, ${Math.round(p.z)}` : "§cnot set");
  const stalls = state.buyers.filter((b) => b.active).length;
  const body =
    `§lMark work sites by standing in them.§r\n\n` +
    `🏛 Town: ${f(z.town)}  🌳 Forest r${z.forest?.r ?? 10}: ${f(z.forest)}\n` +
    `🌾 Farm r${z.farm?.r ?? 6}: ${f(z.farm)}  🪨 Quarry r${z.quarry?.r ?? 6}: ${f(z.quarry)}\n` +
    `🛏 Home: ${f(z.home)}  📦 Warehouse chest: ${f(z.stockpileChest)}\n\n` +
    `§7Licensed buyer stalls staffed: §f${stalls}/${Object.keys(COMMODITIES).length}`;
  const form = new ActionFormData()
    .title("📦 Warehouse, Sites & Buyers")
    .body(body)
    .button("🏛 Set town square here")
    .button("🌳 Set forest site here")
    .button("🌾 Set farm site here")
    .button("🪨 Set quarry site here")
    .button("🛏 Set rest/home site here")
    .button("📦 Register warehouse chest (look at it)")
    .button("🛒 Hire / manage commodity buyers")
    .button("§c Unregister warehouse chest")
    .button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === 8) return res.selection === 8 ? openMainMenu(player) : undefined;
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
    case 6: return openBuyers(player);
    case 7: state.zones.stockpileChest = null; player.sendMessage("§7Warehouse chest unregistered."); break;
  }
  saveState();
  return openSites(player);
}

function registerChest(player) {
  const state = getState();
  const block = player.getBlockFromViewDirection?.({ maxDistance: 8 })?.block;
  if (!block || !block.typeId.includes("chest")) {
    player.sendMessage("§cLook at a chest within 8 blocks and try again.");
    return openSites(player);
  }
  state.zones.stockpileChest = { x: block.location.x, y: block.location.y, z: block.location.z };
  saveState();
  player.sendMessage("§aWarehouse chest registered.");
  return openSites(player);
}

async function openBuyers(player) {
  const state = getState();
  const form = new ActionFormData()
    .title("🛒 Commodity Buyers")
    .body(
      `§7Each stall is one clerk + one linked chest, with a daily coin float ` +
      `and a quota. Freelancers sell here; crown goods flow at dusk.\n` +
      `§7Floats are funded every dawn and unspent coins return to the treasury.`
    );
  for (const [key, def] of Object.entries(COMMODITIES)) {
    const b = state.buyers.find((x) => x.commodity === key && x.active);
    form.button(
      b
        ? `${def.icon} ${def.label} buyer\n§7float ₹${Math.round(b.float)}/${b.maxFloat} · quota ${b.soldUnits}/${b.quota} · ×${b.band}`
        : `${def.icon} Hire ${def.label.toLowerCase()} buyer\n§8₹12/day wage · float ₹${def.defaultFloat} · quota ${def.quota}`
    );
  }
  form.button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === Object.keys(COMMODITIES).length)
    return res.selection === Object.keys(COMMODITIES).length ? openSites(player) : undefined;
  const key = Object.keys(COMMODITIES)[res.selection];
  const existing = state.buyers.find((x) => x.commodity === key && x.active);
  return existing ? openBuyerDetail(player, existing) : hireBuyer(player, key);
}

async function hireBuyer(player, commodity) {
  const state = getState();
  const def = COMMODITIES[commodity];
  const atCap =
    state.populationPolicy.mode === "fixed" &&
    state.citizens.filter((c) => c.alive).length >= state.populationPolicy.cap;
  const form = new ActionFormData()
    .title(`${def.icon} Hire ${def.label} buyer`)
    .body(
      `§7Place a §fchest §7that will be this stall's counter, then §flook at it§7.\n` +
      `§7The clerk (₹12/day crown wage) spawns beside it and pays freelancers ` +
      `from a daily float of §e₹${def.defaultFloat}§7, buying up to §f${def.quota} §7units/day.\n\n` +
      (atCap ? "§c⚠ Your fixed population cap is reached — raise it first." : "")
    )
    .button(atCap ? "§8Population cap reached" : `§a§lHire — use the chest I'm looking at`)
    .button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection !== 0 || atCap) return openBuyers(player);
  const block = player.getBlockFromViewDirection?.({ maxDistance: 8 })?.block;
  if (!block || !block.typeId.includes("chest")) {
    player.sendMessage("§cLook at the stall chest (within 8 blocks) and try again.");
    return openBuyers(player);
  }
  const { record, buyer } = spawnBuyer(player, state, commodity, block);
  // Fund the float today.
  const amount = Math.min(buyer.maxFloat, Math.max(0, state.treasury));
  buyer.float = amount;
  state.treasury -= amount;
  state.dailyStats.floatsFunded = (state.dailyStats.floatsFunded ?? 0) + amount;
  saveState();
  player.onScreenDisplay.setTitle(`§b🛒 ${def.label} stall opened`, { stayDuration: 40, fadeInDuration: 5, fadeOutDuration: 10 });
  player.sendMessage(
    `§a${record.fullName} now staffs the ${def.label.toLowerCase()} counter (float ₹${Math.round(
      amount
    )}). Freelancers will be paid there per item.`
  );
  return openBuyerDetail(player, buyer);
}

async function openBuyerDetail(player, b) {
  const state = getState();
  const def = COMMODITIES[b.commodity];
  const sampleRate = (item) =>
    `${item.replace("minecraft:", "").replaceAll("_", " ")} ₹${unitPrice(item, gradeForLevel(1), b.band)}`;
  const sample = sampleItems(b.commodity).slice(0, 3).map(sampleRate).join("§7, ");
  const stock = Object.entries(b.stock).map(([i, n]) => `${i.replace("minecraft:", "").replaceAll("_", " ")} ${n}`).join(", ") || "§8empty";
  const form = new ActionFormData()
    .title(`${def.icon} ${def.label} buyer`)
    .body(
      `§7Clerk §f${b.clerkName}\n` +
      `§7Float §e₹${Math.round(b.float)} §7/ max §e₹${b.maxFloat}\n` +
      `§7Quota §f${b.soldUnits}/${b.quota} §7units today §7· price band §f×${b.band}\n` +
      `§7Lifetime paid §e₹${Math.round(b.totalPaid)}\n` +
      `§7In stall: §f${stock}\n\n` +
      `§8Example C-grade rates now: ${sample}`
    )
    .button("💵 Set daily float")
    .button("📦 Set daily quota")
    .button(`📈 Price band: ×${b.band} (tap to cycle 0.9/1.0/1.1)`)
    .button("§c Dismiss buyer")
    .button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === 4) return openBuyers(player);
  if (res.selection === 0) {
    const m = new ModalFormData().title("Daily float").slider("Float in ₹ (funded each dawn)", 0, 500, 5, b.maxFloat);
    const r = await m.show(player);
    if (!r.canceled) { b.maxFloat = Number(r.formValues[0]); saveState(); }
    return openBuyerDetail(player, b);
  }
  if (res.selection === 1) {
    const m = new ModalFormData().title("Daily quota").slider("Max units bought per day", 8, 512, 8, b.quota);
    const r = await m.show(player);
    if (!r.canceled) { b.quota = Number(r.formValues[0]); saveState(); }
    return openBuyerDetail(player, b);
  }
  if (res.selection === 2) {
    b.band = b.band <= 0.91 ? 1.0 : b.band >= 1.09 ? 0.9 : 1.1;
    saveState();
    player.sendMessage(`§7${def.label} price band set to ×${b.band}.`);
    return openBuyerDetail(player, b);
  }
  if (res.selection === 3) {
    b.active = false;
    const clerk = state.citizens.find((c) => c.id === b.citizenId);
    if (clerk) {
      clerk.profession = "laborer";
      clerk.buyerCommodity = undefined;
      clerk.mode = "following";
      clerk.wage = suggestWage("laborer", { level: clerk.level }).wage;
      const e = getEntity(clerk, DIM());
      if (e) refreshNameTag(clerk, e);
    }
    state.treasury += b.float;
    saveState();
    player.sendMessage(`§7${b.clerkName}'s stall is closed; unspent float ₹${Math.round(b.float)} returned.`);
    return openBuyers(player);
  }
}

function sampleItems(commodity) {
  const map = {
    wood: ["minecraft:oak_log", "minecraft:spruce_log", "minecraft:stick"],
    stone: ["minecraft:cobblestone", "minecraft:cobbled_deepslate", "minecraft:obsidian"],
    ore: ["minecraft:coal", "minecraft:raw_iron", "minecraft:diamond"],
    grain: ["minecraft:wheat", "minecraft:bread", "minecraft:carrot"],
    cashcrop: ["minecraft:sugar_cane", "minecraft:sugar", "minecraft:cocoa_beans"],
    fish: ["minecraft:cod", "minecraft:salmon", "minecraft:tropical_fish"],
    livestock: ["minecraft:beef", "minecraft:wool", "minecraft:leather"],
  };
  return map[commodity] ?? [];
}

/* ---------------- Ledger ---------------- */

async function openLedger(player, page = 0) {
  const state = getState();
  const perPage = 14;
  const entries = state.ledger.slice(-perPage * (page + 1)).slice(-perPage).reverse();
  const body = entries.length
    ? entries
        .map((e) => {
          if (e.type === "purchase")
            return `§7D${e.day} ${gradeColor(e.grade)}${e.grade} §f${e.qty}× ${short(e.item)} §7→ ${
              e.outlet === "warehouse" ? "warehouse" : COMMODITIES[e.outlet]?.label ?? e.outlet
            } §7pay §e₹${e.pay} §8(${e.seller.split(" ")[0]})`;
          return `§7${JSON.stringify(e)}`;
        })
        .join("\n")
    : "§8No transactions yet. Freelancers selling at staffed buyer stalls will appear here.";
  const olderExists = state.ledger.length > perPage * (page + 1);
  const form = new ActionFormData()
    .title("📒 Audit Ledger")
    .body(`§7Most recent ${entries.length} entries (newest first):\n\n${body}`)
    .button(olderExists ? "◀ Older" : "§8◀ Older");
  if (page > 0) form.button("▶ Newer");
  form.button("§8← Back");
  const res = await form.show(player);
  if (res.canceled) return;
  if (res.selection === 0 && olderExists) return openLedger(player, page + 1);
  if (page > 0 && res.selection === 1) return openLedger(player, page - 1);
  return openMainMenu(player);
}

/* ---------------- Treasury / policy / clock ---------------- */

async function openTreasury(player) {
  const state = getState();
  const samples = [
    ["farmer", {}], ["woodcutter", {}], ["builder", {}],
    ["miner", { danger: "cave" }], ["deepMiner", { danger: "lava" }],
    ["deepDarkMiner", { danger: "deepDark", level: 2 }],
    ["buyer", {}], ["doctor", { level: 3 }],
  ].map(([job, opts]) => {
    const s = suggestWage(job, opts);
    return `§7• ${job}: §e₹${s.wage}/day §8(${s.reason})`;
  }).join("\n");
  const stock = Object.entries(state.stockpile)
    .filter(([, n]) => n)
    .map(([id, n]) => `${short(id)} ${n}`)
    .join("§7, ") || "§8nothing yet";
  const floats = state.buyers.filter((b) => b.active).reduce((s, b) => s + b.float, 0);
  const form = new ActionFormData()
    .title("💰 Treasury & Royal Economist")
    .body(
      `§6Treasury §e₹${Math.round(state.treasury)} §7| out on floats §e₹${Math.round(floats)} §7| rations ${state.foodStock}\n` +
      `§7Freelance purchases today §e₹${state.dailyStats.freelancePaid ?? 0}\n` +
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
  player.sendMessage(`§6[KINGDOM] §7Population policy: §f${describePolicy(state.populationPolicy)}`);
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

/* ---------------- helpers ---------------- */

function avgMood(state) {
  const a = state.citizens.filter((c) => c.alive);
  if (!a.length) return 0;
  return Math.round(a.reduce((s, c) => s + c.mood, 0) / a.length);
}
function cap(s) { return s[0].toUpperCase() + s.slice(1); }
function short(id) { return id.replace("minecraft:", "").replaceAll("_", " "); }
function gradeColor(g) { return g === "A" ? "§6" : g === "B" ? "§b" : "§7"; }
function describePolicy(p) {
  if (p.mode === "fixed") return `hard cap of ${p.cap} citizens`;
  if (p.mode === "autogrow") return `+${p.growPer10Days} adults every 10 days`;
  return "unlimited growth";
}
