/**
 * menu.js — Royal Scepter Kingdom Menu (touch-first forms).
 * M3: warehouse & licensed commodity buyers, floats/quotas/bands, the audit
 * ledger, plus crown-salary vs freelance piece-rate per citizen.
 * M4: Treasury & Taxes — presets, levers, GDP/net reports, economist nudges.
 * M5: Mint & Bank — paper/ink/plates, printing, loans, crown debt, rates.
 * M6: Decrees & Building — edicts with deadlines, crews, sites, catalogue.
 * M7: Families & Houses — requests inbox, matchmaker, housing registry.
 * M8: Harbor & Missions — exports, imports, refugees, recruiter missions.
 * M9: Court & Watch — docket, sentences, laws, guards, militia, bounties.
 * M10: Sky & Research — seasons, festivals, rationing, quarantine, tech.
 * M11: Officers & Orders — co-op writs, chat orders (!help).
 * M12: stings on verdicts, festivals, weddings; hiss-free gating.
 */
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { world } from "@minecraft/server";
import { getState, saveState } from "../core/state.js";
import { greetMinister } from "./founding.js";
import { formatClock, phaseFor } from "../core/clock.js";
import { suggestWage, livingWage } from "../core/economist.js";
import { setModeAll } from "./schedule.js";
import { resetRuntime } from "./jobs.js";
import { getEntity, refreshNameTag } from "./npcRegistry.js";
import { spawnBuyer } from "./citizens.js";
import { COMMODITIES, unitPrice, gradeForLevel } from "../economy/pricebook.js";
import { TAX_PRESETS, applyPreset, describeTax } from "../economy/tax.js";
import { treasuryReport } from "../economy/finance.js";
import { economistNudges } from "../economy/market.js";
import { makePaper, makeInk, craftPlate, printNotes, demonetize, mintDashboard } from "../economy/mint.js";
import { requestLoan, borrowCrown, repayCrown, bankDashboard } from "../economy/bank.js";
import { createDecree, cancelDecree, workloadAdvice, DECREE_KINDS } from "./decrees.js";
import { BUILDINGS, costText } from "../build/catalog.js";
import { assignCrew, releaseCrew, startSite } from "../build/construction.js";
import {
  requestMarriage, approveMarriage, denyMarriage, requestChild, approveChild,
  denyChild, suggestMatch, pendingRequests, childThresholds,
} from "../social/family.js";
import { registerHouse, demolishHouse, houseFor } from "../social/housing.js";
import { launchMission, missionCost, missionDays, pullFactor } from "../world/migration.js";
import { exportGoods, buyImport, decideRefugees, harborBoard, IMPORT_CATALOG } from "../world/harbor.js";
import { trialReady, sentence, adviseSentence } from "../security/courts.js";
import { postBounty, constablePower } from "../security/crime.js";
import { guardRoster, militiaCount, securityRating, postGuard, recallGuard, postInspector, conscript } from "../security/guards.js";
import { unrestLevel } from "../security/unrest.js";
import { seasonIcon, weatherIcon, proclaimFestival } from "../events/seasons.js";
import { doctorRoster } from "../events/health.js";
import { resolveDecision } from "../events/deck.js";
import { techList, startResearch, grantResearch, dailyRP } from "../tech/tree.js";
import { claimCrown, roleOf, require as need, grantOfficer, revokeOfficer, officerList, OFFICER_ROLES } from "../net/roles.js";
import { sting } from "../core/sounds.js";

/** Gated writs: returns true when the player may proceed. */
function writ(player, state, action) {
  const g = need(state, player.name, action);
  if (!g.ok) player.sendMessage(`§c${g.reason}`);
  return g.ok;
}

const PROFESSIONS = ["woodcutter", "farmer", "builder", "laborer", "doctor", "teacher"];
// (Guards & inspectors are posted at ⚖️ Royal Guard — the posting arms them.)
const DIM = () => world.getDimension("overworld");

export async function openMainMenu(player) {
  const state = getState();
  if (!state.founded) {
    player.sendMessage("§6[KINGDOM] §7No kingdom yet. Run §f/kingdom:start§7.");
    return;
  }
  const mood = avgMood(state);
  const net = state.finances?.lastNet ?? 0;
  const gdp = state.finances?.lastGDP ?? 0;
  const infl = state.inflation?.pct ?? 0;
  const kids = state.citizens.filter((c) => c.alive && c.ageStage !== "adult").length;
  const pending = pendingRequests(state).length + (state.harbor?.pendingDecision ? 1 : 0) + (state.pendingDecisions ?? []).length;
  // M11: the first hand to raise the Scepter claims the Crown.
  const claim = claimCrown(state, player.name);
  if (claim.claimed) {
    saveState();
    player.sendMessage(`§6👑 The Scepter accepts you — you are CROWNED ${player.name}. Commission officers at 🕯️ Officers & Orders.`);
  }
  const cl = state.climate ?? { season: "Spring", seasonDay: 1, year: 1, weather: "clear" };
  const docket = trialReady(state).length;
  const role = roleOf(state, player.name);
  const roleTag = role === "crown" ? "§6👑 Crown" : role ? `§b🕯️ ${OFFICER_ROLES[role].name}` : "§7visitor";
  const body =
    `§6§l${state.colony.name}§r   §7· §fDay ${state.day}\n` +
    `§7Banner §f${state.colony.bannerColor} §7| Difficulty §f${state.colony.difficulty}\n\n` +
    `§f👥 Citizens: §b${state.citizens.filter((c) => c.alive).length} ` +
    `§7(🛒 ${state.buyers.filter((b) => b.active).length} buyers · 🍼 ${kids} young)\n` +
    `§6💰 Treasury: §e₹${Math.round(state.treasury)} §7(rations ${state.foodStock})\n` +
    `§b🏭 GDP §f₹${gdp} §7· §a📈 net ${net >= 0 ? "§a" : "§c"}₹${net} §7· §9inflation §f${infl}%\n` +
    `§d😊 Happiness: §d${mood}%` +
    (pending > 0 ? ` §7· §e💌 ${pending} awaiting you` : "") + `\n` +
    `§7${seasonIcon(cl.season)} ${cl.season} ${cl.seasonDay}/10 · ${weatherIcon(cl.weather)} ${cl.weather} §7| 🛡️ §f${securityRating(state)} §7| ✊ §f${Math.round(state.security.unrest)} §7(${(unrestLevel(state.security.unrest))})` +
    (docket > 0 ? ` §7| §6⚖️ ${docket} to judge` : "") + `\n` +
    `§e⏰ ${formatClock(world.getTimeOfDay())} §7— ${phaseFor(world.getTimeOfDay())} §7| you rule as ${roleTag}`;

  const form = new ActionFormData()
    .title("👑 Kingdom Menu")
    .body(body)
    .button("🎩 Speak to the Minister")
    .button("📜 Orders")
    .button("👥 Population")
    .button("📦 Warehouse, Sites & Buyers")
    .button(`💌 Audiences & Requests${pending > 0 ? ` (${pending})` : ""}`)
    .button("💰 Treasury & Taxes")
    .button("🏦 Mint & Bank")
    .button("🏗 Decrees & Building")
    .button("🏠 Families & Houses")
    .button("⚓ Harbor & Missions")
    .button(`⚖️ Court & Watch${docket > 0 ? ` (${docket})` : ""}`)
    .button("🌦 Sky & Research")
    .button("🕯️ Officers & Orders")
    .button("📒 Audit Ledger")
    .button("📈 Growth Policy")
    .button("⏰ Clock & Day Settings");
  const res = await form.show(player);
  if (res.canceled) return;
  switch (res.selection) {
    case 0: return greetMinister(player);
    case 1: return openOrders(player);
    case 2: return openRoster(player);
    case 3: return openSites(player);
    case 4: return openAudiences(player);
    case 5: return openTreasury(player);
    case 6: return openMintBank(player);
    case 7: return openDecrees(player);
    case 8: return openFamily(player);
    case 9: return openHarbor(player);
    case 10: return openCourt(player);
    case 11: return openSky(player);
    case 12: return openOfficers(player);
    case 13: return openLedger(player);
    case 14: return openPopulationPolicy(player);
    case 15: return openClockSettings(player);
  }
}

/* ---------------- Orders ---------------- */

async function openOrders(player) {
  const state = getState();
  const workers = state.citizens.filter((c) => c.alive && c.ageStage === "adult" && c.role !== "minister");
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
    const icon = c.role === "minister" ? "🎩"
      : c.ageStage === "baby" ? "🍼" : c.ageStage === "toddler" ? "🧸"
      : c.ageStage === "child" ? "🧒" : c.profession === "buyer" ? "🛒"
      : c.sex === "m" ? "👨" : "👩";
    const mode = c.mode === "living" ? "works" : "follows";
    const pay = c.ageStage !== "adult" ? "dependent" : c.wageMode === "freelance" ? "piece-rate" : `₹${c.wage}/d`;
    form.button(`${icon} ${c.fullName}\n§7${c.ageStage === "adult" ? `${c.profession} L${c.level}` : c.ageStage} · ${pay} · ${mode}`);
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
  const spouse = c.spouse ? state.citizens.find((x) => x.id === c.spouse)?.fullName ?? "?" : "—";
  const house = c.home ? state.houses.find((h) => h.id === c.home)?.name ?? "?" : "homeless";
  const kids = state.citizens.filter((x) => x.alive && (x.motherId === c.id || x.fatherId === c.id)).length;
  const loans = (state.bank?.loans ?? []).filter((l) => l.borrowerId === c.id && l.remaining > 0);
  const body =
    `${c.role === "minister" ? "§6§l" : "§f"}${c.fullName}\n` +
    (c.ageStage !== "adult"
      ? `§7${cap(c.ageStage)} Day ${c.ageDays}/6 §7· ${c.xp} xp §7· home §f${house}\n`
      : `§7Profession §f${c.profession} §7L${c.level} (${c.xp} xp)\n` +
        `§7Pay §f${c.wageMode === "freelance" ? "freelance piece-rate (paid at stalls)" : `₹${c.wage}/day crown salary`}\n`) +
    `§7Savings §e₹${c.savings ?? 0} §7| mode §f${c.mode} ${c.armed ? "§7| armed at night" : ""}\n` +
    `§7Spouse §f${spouse} §7· children §f${kids} §7· home §f${house}\n` +
    (loans.length ? `§7Owes the bank §c₹${Math.round(loans.reduce((s, l) => s + l.remaining, 0))}\n` : "") +
    (c.assignedSite ? `§7Posted to §econstruction site\n` : "") +
    `§7Mood §d${c.mood}% §7· delivered today §f${c.day?.delivered ?? 0}\n` +
    `§7Food ${blocks(n.food)} §r§7Rest ${blocks(n.rest)}\n` +
    `§7Leisure ${blocks(n.leisure)} §r§7Safety ${blocks(n.safety)}`;
  const form = new ActionFormData().title(c.fullName.split(" ")[0]).body(body);
  const canOrder = c.role !== "minister" && c.profession !== "buyer" && c.ageStage === "adult";
  if (canOrder) {
    form.button(c.mode === "living" ? "🟡 Call to follow me" : "🟢 Go work & live your life");
    form.button(c.armed ? "🔱 Stand down (no sword)" : "🗡️ Carry a sword at night");
    form.button("🔁 Change profession");
    form.button(c.wageMode === "freelance" ? "🟡 Put on crown salary" : "🟢 Release as freelance (piece-rate)");
    if (c.assignedSite) form.button("🏗 Release from construction");
  }
  form.button("§8← Back to roster");
  const res = await form.show(player);
  if (res.canceled) return;
  const count = canOrder ? (c.assignedSite ? 5 : 4) : 0;
  if (res.selection === count) return openRoster(player);
  if (canOrder) {
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
    } else if (res.selection === 4 && c.assignedSite) {
      const site = (state.sites ?? []).find((s) => s.id === c.assignedSite);
      if (site) site.crew = site.crew.filter((id) => id !== c.id);
      c.assignedSite = null;
      player.sendMessage(`§7${c.fullName} returns to their trade.`);
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
    state.treasury = Math.round((state.treasury + b.float) * 100) / 100;
    player.sendMessage(`§7${b.clerkName}'s stall is closed; unspent float ₹${Math.round(b.float)} returned.`);
    b.float = 0; // zeroed — the dawn cart-run must not refund it twice
    saveState();
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

/* ---------------- Audiences & Requests (M7/M8 inbox) ---------------- */

async function openAudiences(player) {
  const state = getState();
  const reqs = pendingRequests(state);
  const pd = state.harbor?.pendingDecision;
  const decisions = state.pendingDecisions ?? [];
  const lines = [];
  if (!reqs.length && !pd && !decisions.length) lines.push("§8No petitions await. The throne room is quiet.");
  for (const r of reqs) {
    lines.push(r.type === "marriage"
      ? `§d💒 ${r.aName} ♥ ${r.bName} §7— marriage (${r.compat}% match, day ${r.day})`
      : `§a👶 ${r.aName}${r.bName ? ` & ${r.bName}` : ""} §7— child request (day ${r.day})`);
  }
  if (pd) lines.push(`§e⛵ ${pd.count} refugees beg sanctuary (until day ${pd.expiryDay}).`);
  for (const d of decisions) {
    lines.push(`§6⌛ ${d.title} §7(expires day ${d.expiryDay})`);
  }
  const form = new ActionFormData().title("💌 Audiences & Requests").body(lines.join("\n"));
  for (const r of reqs) {
    form.button(r.type === "marriage" ? `💒 ${r.aName.split(" ")[0]} ♥ ${r.bName.split(" ")[0]}` : `👶 ${r.aName.split(" ")[0]}'s household`);
  }
  if (pd) form.button(`⛵ ${pd.count} refugees`);
  for (const d of decisions) form.button(`⌛ ${d.title}`);
  form.button("§8← Back");
  const res = await form.show(player);
  if (res.canceled) return;
  const nDecide = decisions.length;
  if (res.selection === reqs.length + (pd ? 1 : 0) + nDecide) return openMainMenu(player);
  if (pd && res.selection === reqs.length) return openRefugees(player);
  if (res.selection >= reqs.length + (pd ? 1 : 0)) {
    return openDecision(player, decisions[res.selection - reqs.length - (pd ? 1 : 0)]);
  }
  return openRequest(player, reqs[res.selection]);
}

/** M10: fate's pending decisions — two roads, the King's to choose. */
async function openDecision(player, d) {
  const state = getState();
  if (!d || !(state.pendingDecisions ?? []).some((x) => x.id === d.id)) {
    player.sendMessage("§7⌛ That moment has passed.");
    return openAudiences(player);
  }
  const form = new ActionFormData()
    .title("⌛ The King's Word")
    .body(`§6§l${d.title}§r\n§7${d.body}\n\n§8Undecided, the moment passes on day ${d.expiryDay}.`);
  for (const o of d.options) form.button(`${o.label}\n§7${o.desc}`);
  form.button("§8← Later");
  const res = await form.show(player);
  if (res.canceled || res.selection === d.options.length) return openAudiences(player);
  const out = resolveDecision(state, d.id, d.options[res.selection].id);
  saveState();
  player.sendMessage(out.ok ? out.line : `§c${out.reason}`);
  if (out.ok) sting("trumpet");
  return openAudiences(player);
}

async function openRequest(player, r) {
  const state = getState();
  const isMarriage = r.type === "marriage";
  const body = isMarriage
    ? `§d§l💒 Marriage request§r\n§f${r.aName} ♥ ${r.bName}\n§7Compatibility ${r.compat}% · filed day ${r.day}\n\n§7Approval begins a 2-day engagement, then a wedding festival. Refusal is kindly final.`
    : `§a§l👶 Child request§r\n§f${r.aName}${r.bName ? ` & ${r.bName}` : " (single adopter)"}\n§7Filed day ${r.day}. Thresholds: food, housing & happiness were met at filing.\n\n§7Approval begins a 3-day pregnancy, then 6 days of childhood.`;
  const form = new ActionFormData()
    .title(isMarriage ? "💒 Marriage" : "👶 Child")
    .body(body)
    .button("§a§lApprove")
    .button("§cDecline kindly")
    .button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === 2) return openAudiences(player);
  if (!writ(player, state, "decree")) return openAudiences(player);
  let out;
  if (isMarriage) out = res.selection === 0 ? approveMarriage(state, r.id) : denyMarriage(state, r.id);
  else out = res.selection === 0 ? approveChild(state, r.id) : denyChild(state, r.id);
  saveState();
  player.sendMessage(out.ok
    ? (res.selection === 0 ? "§a👑 The crown approves. Joy spreads through the colony." : "§7👑 Declined with kindness. Life goes on.")
    : `§c${out.reason}`);
  if (out.ok && res.selection === 0 && isMarriage) sting("wedding");
  return openAudiences(player);
}

async function openRefugees(player) {
  const state = getState();
  const pd = state.harbor?.pendingDecision;
  if (!pd) return openAudiences(player);
  const form = new ActionFormData()
    .title("⛵ Refugee ship")
    .body(`§e${pd.count} hungry souls beg sanctuary.§r\n\n§7Welcome them: they eat ${pd.count * 2} rations, then join as willing laborers (+mood).\n§7Turn them away: the colony grieves (−3 mood). Undecided ships sail on after day ${pd.expiryDay}.`)
    .button("§a§lWelcome them ashore")
    .button("§cTurn them away")
    .button("§8← Later");
  const res = await form.show(player);
  if (res.canceled || res.selection === 2) return openAudiences(player);
  const out = decideRefugees(state, DIM(), res.selection === 0);
  saveState();
  player.sendMessage(!out.ok ? `§c${out.reason}`
    : res.selection === 0 ? `§a⛵ ${out.names.length} refugees wade ashore: ${out.names.slice(0, 4).join(", ")}${out.names.length > 4 ? "…" : ""}`
    : "§7⛵ The ship sails on. Gulls cry over the empty beach.");
  return openAudiences(player);
}

/* ---------------- Treasury & Taxes (M4) ---------------- */

async function openTreasury(player) {
  const state = getState();
  const nudges = economistNudges(state);
  const form = new ActionFormData()
    .title("💰 Treasury & Taxes")
    .body(
      treasuryReport(state) + `\n\n` +
      `§6§lTaxes §r§7(${describeTax(state)})\n` +
      `§7Living wage ≈ §e₹${livingWage(state)}/day\n` +
      (nudges.length ? `\n${nudges.join("\n")}` : "")
    )
    .button("💰 Tax presets")
    .button("🎚 Tax levers (custom)")
    .button("🎉 Declare 3-day tax holiday")
    .button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === 3) return res.selection === 3 ? openMainMenu(player) : undefined;
  if (!writ(player, state, "rates")) return openTreasury(player);
  if (res.selection === 0) return openTaxPresets(player);
  if (res.selection === 1) return openTaxLevers(player);
  state.tax.holidayDays = 3;
  saveState();
  player.sendMessage("§6🎉 A 3-day tax holiday is proclaimed! Feasting in the streets.");
  return openTreasury(player);
}

async function openTaxPresets(player) {
  const state = getState();
  const form = new ActionFormData()
    .title("💰 Tax presets")
    .body(`§7Current: §f${describeTax(state)}`);
  const names = Object.keys(TAX_PRESETS);
  for (const name of names) {
    const p = TAX_PRESETS[name];
    form.button(`${name === state.tax.preset ? "§a● " : ""}${cap(name)}\n§7income ${p.incomePct + p.war}% · sales ${p.salesPct}% · head ₹${p.headTax}`);
  }
  form.button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === names.length) return openTreasury(player);
  applyPreset(state, names[res.selection]);
  saveState();
  player.sendMessage(`§6[KINGDOM] §7Tax preset: §f${names[res.selection]} §7— ${describeTax(state)}`);
  return openTreasury(player);
}

async function openTaxLevers(player) {
  const state = getState();
  const t = state.tax;
  const form = new ModalFormData()
    .title("🎚 Tax levers")
    .slider("Income tax %", 0, 40, 1, t.incomePct)
    .slider("Sales tax %", 0, 30, 1, t.salesPct)
    .slider("Head tax ₹/adult/day", 0, 5, 1, t.headTax)
    .slider("Land tax %", 0, 20, 1, t.landPct)
    .slider("Import duty %", 0, 30, 1, t.importPct)
    .slider("Export duty %", 0, 20, 1, t.exportPct)
    .slider("⚔ War surcharge %", 0, 20, 1, t.war);
  const res = await form.show(player);
  if (res.canceled) return openTreasury(player);
  const v = res.formValues.map(Number);
  state.tax = {
    preset: "custom", incomePct: v[0], salesPct: v[1], headTax: v[2],
    landPct: v[3], importPct: v[4], exportPct: v[5], war: v[6],
    holidayDays: 0,
  };
  saveState();
  player.sendMessage(`§6[KINGDOM] §7Custom taxes: §f${describeTax(state)}`);
  return openTreasury(player);
}

/* ---------------- Mint & Bank (M5) ---------------- */

async function openMintBank(player) {
  const state = getState();
  const form = new ActionFormData()
    .title("🏦 Mint & Bank")
    .body(mintDashboard(state) + "\n\n" + bankDashboard(state))
    .button("📄 Mill paper (3 cane → 1)")
    .button("🖤 Grind ink (1 sac → 10)")
    .button("🟧 Engrave plate (4 ingots)")
    .button("🖨 Print banknotes")
    .button("🤝 Issue citizen loan")
    .button("💳 Crown borrow / repay")
    .button("📊 Set interest rates")
    .button("🔥 Demonetization edict")
    .button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === 8) return res.selection === 8 ? openMainMenu(player) : undefined;
  if (res.selection >= 3 && res.selection <= 7 && !writ(player, state, "spend")) return openMintBank(player);
  switch (res.selection) {
    case 0: {
      const m = new ModalFormData().title("📄 Mill paper").slider("Paper units", 1, 20, 1, 5);
      const r = await m.show(player);
      if (!r.canceled) {
        const out = makePaper(state, Number(r.formValues[0]));
        saveState();
        player.sendMessage(out.made > 0 ? `§a📄 Milled ${out.made} paper.` : "§cNot enough sugarcane/bamboo in the warehouse.");
      }
      return openMintBank(player);
    }
    case 1: {
      const m = new ModalFormData().title("🖤 Grind ink").slider("Ink sacs", 1, 10, 1, 2);
      const r = await m.show(player);
      if (!r.canceled) {
        const out = makeInk(state, Number(r.formValues[0]));
        saveState();
        player.sendMessage(out.made > 0 ? `§a🖤 Ground ${out.made} ink.` : "§cNo ink sacs in the warehouse.");
      }
      return openMintBank(player);
    }
    case 2: {
      const ok = craftPlate(state);
      saveState();
      player.sendMessage(ok ? "§a🟧 A new plate is engraved." : "§cNeeds 4 copper or iron ingots in the warehouse.");
      return openMintBank(player);
    }
    case 3: {
      const m = new ModalFormData().title("🖨 Print banknotes").slider("₹100 batches", 1, 10, 1, 1);
      const r = await m.show(player);
      if (!r.canceled) {
        const out = printNotes(state, Number(r.formValues[0]));
        saveState();
        player.sendMessage(out.ok
          ? `§a🖨 Printed ₹${out.printed} into the treasury.${out.shattered ? " §cA plate shattered!" : ""}`
          : `§c${out.reason}`);
      }
      return openMintBank(player);
    }
    case 4: return openLoan(player);
    case 5: return openCrownDebt(player);
    case 6: {
      const m = new ModalFormData().title("📊 Interest rates")
        .slider("Citizen loans %/10d", 0, 30, 1, state.bank.citizenRate)
        .slider("Crown debt %/30d", 0, 20, 1, state.bank.crownRate);
      const r = await m.show(player);
      if (!r.canceled) {
        state.bank.citizenRate = Number(r.formValues[0]);
        state.bank.crownRate = Number(r.formValues[1]);
        saveState();
        player.sendMessage("§7📊 Rates set.");
      }
      return openMintBank(player);
    }
    case 7: {
      const m = new ActionFormData()
        .title("🔥 Demonetization")
        .body("§7Void all old notes? Inflation is crushed and prices fall — but the bazaar grumbles (−12 mood colony-wide).")
        .button("§c§lVoid the old notes")
        .button("§8← Back");
      const r = await m.show(player);
      if (!r.canceled && r.selection === 0) {
        player.sendMessage(demonetize(state));
        saveState();
      }
      return openMintBank(player);
    }
  }
}

async function openLoan(player) {
  const state = getState();
  const adults = state.citizens.filter((c) => c.alive && c.ageStage === "adult");
  if (!adults.length) {
    player.sendMessage("§cNo adult borrowers.");
    return openMintBank(player);
  }
  const open = (state.bank.loans ?? []).filter((l) => l.remaining > 0);
  const form = new ActionFormData()
    .title("🤝 Citizen loans")
    .body(open.length
      ? open.slice(0, 6).map((l) => `§8• ${l.borrower.split(" ")[0]} owes ₹${Math.round(l.remaining)} (${l.purpose}, due D${l.dueDay})`).join("\n")
      : "§8No open loans.");
  form.button("§a§l+ New loan").button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === 1) return openMintBank(player);
  const loanMax = Math.max(10, Math.min(500, Math.floor(state.treasury)));
  const m = new ModalFormData()
    .title("🤝 New loan")
    .dropdown("Borrower", adults.map((c) => c.fullName), 0)
    .slider("Amount ₹", 10, loanMax, 10, Math.min(10, loanMax))
    .dropdown("Purpose", ["personal", "house mortgage", "farm", "shop", "tools"], 0)
    .slider("Term (days)", 2, 30, 1, 10);
  const r = await m.show(player);
  if (r.canceled) return openLoan(player);
  const out = requestLoan(state, adults[Number(r.formValues[0])].id, Number(r.formValues[1]),
    ["personal", "mortgage", "farm", "shop", "tools"][Number(r.formValues[2])], Number(r.formValues[3]));
  saveState();
  player.sendMessage(out.ok ? `§a🤝 Lent ₹${out.loan.principal} to ${out.loan.borrower}.` : `§c${out.reason}`);
  return openLoan(player);
}

async function openCrownDebt(player) {
  const state = getState();
  const form = new ActionFormData()
    .title("💳 National debt")
    .body(`§7Owed abroad: §c₹${Math.round(state.bank.crownDebt)} §7at ${state.bank.crownRate}%/30d.\n§7Treasury: §e₹${Math.round(state.treasury)}`)
    .button("📥 Borrow abroad")
    .button("📤 Repay debt")
    .button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === 2) return openMintBank(player);
  if (res.selection === 0) {
    const m = new ModalFormData().title("📥 Borrow").slider("Amount ₹", 50, 2000, 50, 200);
    const r = await m.show(player);
    if (!r.canceled) {
      const out = borrowCrown(state, Number(r.formValues[0]));
      saveState();
      player.sendMessage(out.ok ? `§a📥 Borrowed ₹${Number(r.formValues[0])}. Debt ₹${Math.round(out.debt)}.` : `§c${out.reason}`);
    }
  } else {
    const m = new ModalFormData().title("📤 Repay").slider("Amount ₹", 10, Math.max(10, Math.floor(Math.min(state.treasury, state.bank.crownDebt))), 10, 10);
    const r = await m.show(player);
    if (!r.canceled) {
      const out = repayCrown(state, Number(r.formValues[0]));
      saveState();
      player.sendMessage(out.ok ? `§a📤 Repaid. Debt ₹${Math.round(out.debt)}.` : `§c${out.reason}`);
    }
  }
  return openCrownDebt(player);
}

/* ---------------- Decrees & Building (M6) ---------------- */

async function openDecrees(player) {
  const state = getState();
  const active = (state.decrees ?? []).filter((d) => d.status === "active");
  const sites = (state.sites ?? []).filter((s) => s.status === "active");
  const raised = (state.buildings ?? []).map((b) => `${b.name} L${b.level}`).join(", ") || "§8none yet";
  const lines = [
    `§7Active decrees §f${active.length} §7· building sites §f${sites.length}`,
    `§7Raised: §f${raised}`,
    `§7Minister strikes: §f${state.ministerStrikes ?? 0} §7· auto-approve §f₹${state.autoApproveBudget ?? 50}`,
  ];
  for (const d of active.slice(0, 5)) {
    lines.push(`${DECREE_KINDS[d.kind]?.icon ?? "📜"} ${d.title} §7— ${d.progress}% · ${d.daysLeft}d left`);
  }
  const form = new ActionFormData().title("🏗 Decrees & Building").body(lines.join("\n"));
  for (const d of active) form.button(`${DECREE_KINDS[d.kind]?.icon ?? "📜"} ${d.title}\n§7${d.progress}% · ${d.daysLeft}d left · escrow ₹${Math.round(d.escrow)}`);
  form.button("§a§l+ Build decree").button("§a§l+ Recruit decree").button("§a§l+ Stockpile decree")
    .button("§a§l+ Tax edict").button("§a§l+ Custom decree")
    .button("🏗 Manage sites & crews").button("✏️ Stake town plaza here")
    .button(`⚙ Hands-off budget (₹${state.autoApproveBudget ?? 50}/day)`).button("§8← Back");
  const res = await form.show(player);
  if (res.canceled) return;
  const n = active.length;
  if (res.selection < n) return openDecreeDetail(player, active[res.selection]);
  const pick = res.selection - n;
  if (pick === 8) return openMainMenu(player);
  if (pick === 5) return openSites2(player);
  if (pick === 7) {
    const m = new ModalFormData().title("⚙ Hands-off budget")
      .slider("Auto-approve new wages up to ₹/day", 0, 500, 10, state.autoApproveBudget ?? 50);
    const r = await m.show(player);
    if (!r.canceled) {
      state.autoApproveBudget = Number(r.formValues[0]);
      saveState();
      player.sendMessage(`§7⚙ The Minister may spend ₹${state.autoApproveBudget}/day without an audience.`);
    }
    return openDecrees(player);
  }
  if (pick === 6) {
    const out = startSite(state, "plaza", player.location, { name: "Town Plaza" });
    if (out.ok) {
      const crew = assignCrew(state, out.site.id, 2);
      saveState();
      player.sendMessage(`§a✏️ Plaza staked where you stand. Crew: ${crew.join(", ") || "none free — assign builders"}.`);
    } else player.sendMessage(`§c${out.reason}`);
    return openDecrees(player);
  }
  return openNewDecree(player, ["build", "recruit", "produce", "tax", "custom"][pick]);
}

async function openDecreeDetail(player, d) {
  const state = getState();
  const bar = "§a".repeat(Math.round(d.progress / 10)) + "§8".repeat(10 - Math.round(d.progress / 10));
  const form = new ActionFormData()
    .title(d.title.slice(0, 24))
    .body(
      `${DECREE_KINDS[d.kind]?.icon ?? "📜"} §l${d.title}§r\n` +
      `§7${bar} §f${d.progress}% §7· ${d.daysLeft} days left · escrow §e₹${Math.round(d.escrow)}\n` +
      `§7Manager: §f${d.manager}\n\n` +
      (d.reports.slice(-4).join("\n") || "§8No reports yet.")
    )
    .button(d.kind === "custom" ? "📊 Set progress" : "§8📊 Auto-tracked")
    .button("§c Cancel decree (refund)")
    .button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === 2) return openDecrees(player);
  if (res.selection === 0 && d.kind === "custom") {
    const m = new ModalFormData().title("Progress").slider("Progress %", 0, 100, 5, d.progress);
    const r = await m.show(player);
    if (!r.canceled) {
      d.progress = Number(r.formValues[0]);
      d.reports.push(`Day ${state.day}: the King marks ${d.progress}%.`);
      saveState();
    }
    return openDecreeDetail(player, d);
  }
  if (res.selection === 1) {
    cancelDecree(state, d.id);
    saveState();
    player.sendMessage("§7📜 Decree cancelled; escrow refunded.");
    return openDecrees(player);
  }
  return openDecreeDetail(player, d);
}

async function openNewDecree(player, kind) {
  const state = getState();
  const builders = state.citizens.filter((c) => c.alive && c.ageStage === "adult" && (c.profession === "builder" || c.profession === "laborer")).length;
  if (kind === "build") {
    const ids = Object.keys(BUILDINGS);
    const m = new ModalFormData()
      .title("🏗 Build decree")
      .dropdown("Building", ids.map((id) => `${BUILDINGS[id].icon} ${BUILDINGS[id].name} — ${BUILDINGS[id].desc}`), 0)
      .slider("Level", 1, 3, 1, 1)
      .slider("Deadline (days)", 2, 30, 1, 7)
      .slider("Budget ₹", 0, 500, 10, 50);
    const r = await m.show(player);
    if (r.canceled) return openDecrees(player);
    const id = ids[Number(r.formValues[0])];
    const level = Math.min(Number(r.formValues[1]), BUILDINGS[id].levels.length);
    const cost = BUILDINGS[id].levels[level - 1];
    const out = createDecree(state, {
      kind: "build", title: `${BUILDINGS[id].name} L${level}`,
      budget: Number(r.formValues[3]), deadlineDays: Number(r.formValues[2]),
      payload: { buildingId: id, level, loc: { x: player.location.x, y: player.location.y, z: player.location.z } },
      manager: "foreman",
    });
    saveState();
    if (out.ok && out.decree.payload.siteId) {
      const crew = assignCrew(state, out.decree.payload.siteId, 3);
      saveState();
      player.sendMessage(`§a🏗 "${out.decree.title}" decreed — site staked where you stand.\n§7Needs: ${costText(cost.cost)} + ${cost.labor} builder-days.\n§7${workloadAdvice(state, cost.labor, Number(r.formValues[2]), Math.max(1, builders))}\n§7Crew: ${crew.join(", ") || "none free"}.`);
    } else player.sendMessage(`§c${out.reason ?? "Decree failed."}`);
    return openDecrees(player);
  }
  if (kind === "recruit") {
    const m = new ModalFormData().title("📯 Recruit decree")
      .slider("Settlers wanted", 1, 20, 1, 4)
      .slider("Deadline (days)", 3, 30, 1, 8)
      .slider("Budget ₹", 0, 500, 10, 100);
    const r = await m.show(player);
    if (r.canceled) return openDecrees(player);
    const out = createDecree(state, {
      kind: "recruit", title: `Recruit ${Number(r.formValues[0])} settlers`,
      budget: Number(r.formValues[2]), deadlineDays: Number(r.formValues[1]),
      payload: { count: Number(r.formValues[0]) },
    });
    saveState();
    player.sendMessage(out.ok ? `§a📯 Recruiter dispatched.` : `§c${out.reason}`);
    return openDecrees(player);
  }
  if (kind === "produce") {
    const items = ["minecraft:oak_log", "minecraft:cobblestone", "minecraft:wheat", "minecraft:coal", "minecraft:raw_iron", "minecraft:sugar_cane"];
    const m = new ModalFormData().title("📦 Stockpile decree")
      .dropdown("Commodity", items.map(short), 0)
      .slider("Target quantity", 16, 1024, 16, 128)
      .slider("Deadline (days)", 2, 30, 1, 7)
      .slider("Budget ₹", 0, 500, 10, 30);
    const r = await m.show(player);
    if (r.canceled) return openDecrees(player);
    const item = items[Number(r.formValues[0])];
    const out = createDecree(state, {
      kind: "produce", title: `Stockpile ${Number(r.formValues[1])} ${short(item)}`,
      budget: Number(r.formValues[3]), deadlineDays: Number(r.formValues[2]),
      payload: { item, qty: Number(r.formValues[1]) },
    });
    saveState();
    player.sendMessage(out.ok ? `§a📦 The Minister pledges full warehouse bins.` : `§c${out.reason}`);
    return openDecrees(player);
  }
  if (kind === "tax") {
    const names = Object.keys(TAX_PRESETS);
    const m = new ModalFormData().title("💰 Tax edict")
      .dropdown("Preset", names.map(cap), 3)
      .slider("Duration (days)", 1, 30, 1, 14);
    const r = await m.show(player);
    if (r.canceled) return openDecrees(player);
    const out = createDecree(state, {
      kind: "tax", title: `${cap(names[Number(r.formValues[0])])} taxes for ${Number(r.formValues[1])} days`,
      budget: 0, deadlineDays: Number(r.formValues[1]),
      payload: { preset: names[Number(r.formValues[0])] }, manager: "treasurer",
    });
    saveState();
    player.sendMessage(out.ok ? `§a💰 The edict is cried through the streets.` : `§c${out.reason}`);
    return openDecrees(player);
  }
  const m = new ModalFormData().title("📜 Custom decree")
    .textField("Title", "e.g. Prepare defenses", "Prepare defenses")
    .slider("Deadline (days)", 1, 30, 1, 7)
    .slider("Budget ₹", 0, 500, 10, 50);
  const r = await m.show(player);
  if (r.canceled) return openDecrees(player);
  const out = createDecree(state, {
    kind: "custom", title: String(r.formValues[0]).slice(0, 40) || "Royal decree",
    budget: Number(r.formValues[2]), deadlineDays: Number(r.formValues[1]), payload: {},
  });
  saveState();
  player.sendMessage(out.ok ? `§a📜 Decreed. Mark progress as the realm obeys.` : `§c${out.reason}`);
  return openDecrees(player);
}

async function openSites2(player) {
  const state = getState();
  const sites = state.sites ?? [];
  const form = new ActionFormData()
    .title("🏗 Sites & crews")
    .body(sites.length ? "§7Tap a site to manage its crew." : "§8No sites. Issue a build decree first.");
  for (const s of sites) {
    form.button(`${s.status === "active" ? "🏗" : "✅"} ${s.name}\n§7labor ${s.laborDone}/${s.laborNeeded} · crew ${s.crew.length}`);
  }
  form.button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === sites.length) return openDecrees(player);
  const site = sites[res.selection];
  if (site.status !== "active") {
    player.sendMessage("§7That site is complete.");
    return openSites2(player);
  }
  const crewNames = site.crew.map((id) => state.citizens.find((c) => c.id === id)?.fullName ?? "?").join(", ") || "none";
  const detail = new ActionFormData()
    .title(site.name.slice(0, 24))
    .body(`§7Labor ${site.laborDone}/${site.laborNeeded} builder-days\n§7Crew: §f${crewNames}\n§7Still needs: ${costText(Object.fromEntries(Object.entries(site.required).map(([k, v]) => [k, Math.max(0, v - (site.delivered[k] ?? 0))]))) || "nothing"}`)
    .button("👷 Post 2 more builders")
    .button("🕊 Release crew")
    .button("§8← Back");
  const r2 = await detail.show(player);
  if (r2.canceled || r2.selection === 2) return openSites2(player);
  if (r2.selection === 0) {
    const names = assignCrew(state, site.id, 2);
    saveState();
    player.sendMessage(names.length ? `§a👷 Posted: ${names.join(", ")}` : "§cNo free builders (release some to live first).");
  } else {
    releaseCrew(state, site.id);
    saveState();
    player.sendMessage("§7🕊 Crew released.");
  }
  return openSites2(player);
}

/* ---------------- Families & Houses (M7) ---------------- */

async function openFamily(player) {
  const state = getState();
  const reqs = pendingRequests(state);
  const houses = state.houses ?? [];
  const beds = houses.reduce((s, h) => s + h.beds, 0);
  const filled = houses.reduce((s, h) => s + h.residents.length, 0);
  const kids = state.citizens.filter((c) => c.alive && c.ageStage !== "adult");
  const preg = state.citizens.filter((c) => c.alive && c.pregnancy).length;
  const t = childThresholds(state);
  const form = new ActionFormData()
    .title("🏠 Families & Houses")
    .body(
      `§7Requests pending §f${reqs.length} §7· houses §f${houses.length} §7(beds ${filled}/${beds}) · young §f${kids.length} §7· expecting §f${preg}\n` +
      `§7Nursery thresholds: food ${t.foodOk ? "§a✓" : "§c✗"} · beds ${t.bedsFree} · mood ${t.mood}% ${t.moodOk ? "§a✓" : "§c✗"}`
    )
    .button(`💌 Requests inbox (${reqs.length})`)
    .button("💒 Matchmaker — suggest a match")
    .button("👶 File a child request")
    .button(`🏠 Houses (${houses.length})`)
    .button("🏠 Register house where I stand")
    .button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === 5) return res.selection === 5 ? openMainMenu(player) : undefined;
  if (res.selection === 0) return openAudiences(player);
  if (res.selection === 1) return openMatchmaker(player);
  if (res.selection === 2) return openChildRequest(player);
  if (res.selection === 3) return openHouses(player);
  const m = new ModalFormData().title("🏠 Register house")
    .textField("House name", "e.g. Carter House", "")
    .slider("Beds", 1, 12, 1, 2)
    .slider("Rent ₹/bed/night (Crown)", 0, 5, 1, 1);
  const r = await m.show(player);
  if (r.canceled) return openFamily(player);
  const house = registerHouse(state, {
    name: String(r.formValues[0]) || undefined,
    loc: player.location, beds: Number(r.formValues[1]), rentPerBed: Number(r.formValues[2]),
  });
  saveState();
  player.sendMessage(`§a🏠 ${house.name} registered with ${house.beds} beds. The homeless will move in at dawn.`);
  return openFamily(player);
}

async function openMatchmaker(player, preselect = 0) {
  const state = getState();
  const singles = state.citizens.filter((c) => c.alive && c.ageStage === "adult" && !c.spouse && !c.partner && c.role !== "minister");
  if (singles.length < 2) {
    player.sendMessage("§cThe matchmaker needs at least two unpartnered adults.");
    return openFamily(player);
  }
  const m = new ModalFormData().title("💒 Matchmaker (₹9 fee)")
    .dropdown("First heart", singles.map((c) => c.fullName), Math.min(preselect, singles.length - 1));
  const r = await m.show(player);
  if (r.canceled) return openFamily(player);
  const me = singles[Number(r.formValues[0])];
  const match = suggestMatch(state, me.id);
  if (!match) {
    player.sendMessage("§cNo suitable match found.");
    return openFamily(player);
  }
  if (state.treasury < 9) {
    player.sendMessage("§cThe matchmaker's ₹9 fee exceeds the treasury.");
    return openFamily(player);
  }
  const confirm = new ActionFormData()
    .title("💒 A match!")
    .body(`§f${me.fullName} ♥ ${match.citizen.fullName}\n§7Compatibility §f${match.score}%§7.\n\n§7File a marriage request for the throne (₹9 fee)? Both must still consent at the altar of your approval.`)
    .button("§a§lFile the request (₹9)")
    .button("§8← Back");
  const r2 = await confirm.show(player);
  if (r2.canceled || r2.selection !== 0) return openFamily(player);
  state.treasury = Math.round((state.treasury - 9) * 100) / 100;
  const out = requestMarriage(state, me.id, match.citizen.id);
  saveState();
  player.sendMessage(out.ok ? "§a💒 Filed! Rule on it in Audiences & Requests." : `§c${out.reason}`);
  return openFamily(player);
}

async function openChildRequest(player) {
  const state = getState();
  const adults = state.citizens.filter((c) => c.alive && c.ageStage === "adult" && c.role !== "minister");
  if (!adults.length) {
    player.sendMessage("§cNo adults yet.");
    return openFamily(player);
  }
  const m = new ModalFormData().title("👶 Child request")
    .dropdown("Requester", adults.map((c) => `${c.fullName}${c.spouse ? " (wed)" : ""}`), 0);
  const r = await m.show(player);
  if (r.canceled) return openFamily(player);
  const a = adults[Number(r.formValues[0])];
  const out = a.spouse ? requestChild(state, a.id, a.spouse) : requestChild(state, a.id);
  saveState();
  if (!out.ok) {
    player.sendMessage(`§c${out.reason}`);
    return openFamily(player);
  }
  player.sendMessage("§a👶 Filed! Rule on it in Audiences & Requests.");
  return openFamily(player);
}

async function openHouses(player) {
  const state = getState();
  const houses = state.houses ?? [];
  const form = new ActionFormData()
    .title("🏠 Houses")
    .body(houses.length ? "§7Tap a plaque to inspect." : "§8No houses registered. Stand in a dwelling and register it.");
  for (const h of houses) {
    form.button(`🏠 ${h.name}\n§7${h.residents.length}/${h.beds} beds · ${h.ownerId ? "private" : `Crown ₹${h.rentPerBed}/bed`}`);
  }
  form.button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === houses.length) return openFamily(player);
  const h = houses[res.selection];
  const residents = h.residents.map((id) => state.citizens.find((c) => c.id === id)?.fullName ?? "?").join(", ") || "empty";
  const owner = h.ownerId ? state.citizens.find((c) => c.id === h.ownerId)?.fullName ?? "?" : "the Crown";
  const detail = new ActionFormData()
    .title(h.name.slice(0, 24))
    .body(`§7${h.beds} beds · owner §f${owner}\n§7Residents: §f${residents}\n${h.overcrowdedDays > 0 ? `§c⚠ Overcrowded ${h.overcrowdedDays} day(s)!` : ""}`)
    .button(h.ownerId ? "🏛 Reclaim for the Crown" : "🤝 Sell to eldest resident")
    .button("§c Demolish")
    .button("§8← Back");
  const r2 = await detail.show(player);
  if (r2.canceled || r2.selection === 2) return openHouses(player);
  if (r2.selection === 0) {
    if (h.ownerId) {
      h.ownerId = null;
      player.sendMessage("§7🏛 Reclaimed as a Crown tenement.");
    } else {
      const eldest = h.residents
        .map((id) => state.citizens.find((c) => c.id === id))
        .filter((c) => c && c.alive && c.ageStage === "adult")[0];
      if (!eldest) player.sendMessage("§cNo adult resident to sell to.");
      else {
        h.ownerId = eldest.id;
        player.sendMessage(`§a🤝 Sold to ${eldest.fullName} — land tax now applies.`);
      }
    }
    saveState();
    return openHouses(player);
  }
  demolishHouse(state, h.id);
  saveState();
  player.sendMessage("§7🏠 Demolished. Residents are homeless until housed.");
  return openHouses(player);
}

/* ---------------- Harbor & Missions (M8) ---------------- */

async function openHarbor(player) {
  const state = getState();
  const away = (state.missions ?? []).filter((m) => m.status === "away");
  const form = new ActionFormData()
    .title("⚓ Harbor & Missions")
    .body(
      harborBoard(state) + `\n\n` +
      `§7Recruiters away: §f${away.length} §7· colony pull §f${Math.round(pullFactor(state) * 100)}%`
    )
    .button("📤 Export aboard the clipper")
    .button("📥 Buy imports")
    .button("📯 Launch recruiter mission")
    .button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === 3) return res.selection === 3 ? openMainMenu(player) : undefined;
  if (res.selection === 0) return openExport(player);
  if (res.selection === 1) return openImports(player);
  const m = new ModalFormData().title("📯 Recruiter mission")
    .slider("Settlers wanted", 1, 20, 1, 4);
  const r = await m.show(player);
  if (r.canceled) return openHarbor(player);
  const count = Number(r.formValues[0]);
  const confirm = new ActionFormData()
    .title("📯 Confirm mission")
    .body(`§7Send a recruiter for §f${count} §7settlers?\n§7Cost §e₹${missionCost(count)} §7· returns in §f${missionDays(count)} §7days.\n§7Colony pull: §f${Math.round(pullFactor(state) * 100)}% §7(food, beds, happiness).`)
    .button("§a§lDispatch")
    .button("§8← Back");
  const r2 = await confirm.show(player);
  if (r2.canceled || r2.selection !== 0) return openHarbor(player);
  const out = launchMission(state, count);
  saveState();
  player.sendMessage(out.ok ? `§a📯 The recruiter rides out.` : `§c${out.reason}`);
  return openHarbor(player);
}

async function openExport(player) {
  const state = getState();
  const ship = state.harbor?.ships?.[0];
  if (!ship) {
    player.sendMessage("§cNo ship in harbor — exports sail with the clippers.");
    return openHarbor(player);
  }
  const stocked = Object.entries(state.stockpile).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 20);
  if (!stocked.length) {
    player.sendMessage("§cThe warehouse is empty.");
    return openHarbor(player);
  }
  const m = new ModalFormData().title(`📤 Export — ${ship.name}`)
    .dropdown("Goods", stocked.map(([id, n]) => `${short(id)} ×${n}`), 0)
    .slider("Quantity", 1, 256, 1, 16);
  const r = await m.show(player);
  if (r.canceled) return openHarbor(player);
  const [item] = stocked[Number(r.formValues[0])];
  const out = exportGoods(state, item, Number(r.formValues[1]));
  saveState();
  player.sendMessage(out.ok
    ? `§a📤 Sold ${Number(r.formValues[1])} ${short(item)} at ×${out.mult} — §e₹${out.paid} §7(duty ₹${out.duty}).`
    : `§c${out.reason}`);
  return openHarbor(player);
}

async function openImports(player) {
  const state = getState();
  const ship = state.harbor?.ships?.[0];
  if (!ship) {
    player.sendMessage("§cNo ship in harbor.");
    return openHarbor(player);
  }
  const ids = Object.keys(IMPORT_CATALOG);
  const form = new ActionFormData()
    .title(`📥 Imports — ${ship.name}`)
    .body(`§7Treasury §e₹${Math.round(state.treasury)} §7(+${state.tax?.importPct ?? 10}% duty)`);
  for (const id of ids) {
    const e = IMPORT_CATALOG[id];
    form.button(`📦 ${e.name}\n§7${e.desc}${e.cost ? ` · ₹${e.cost}` : ""}`);
  }
  form.button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === ids.length) return openHarbor(player);
  const out = buyImport(state, ids[res.selection]);
  saveState();
  player.sendMessage(out.ok ? `§a📥 ${IMPORT_CATALOG[ids[res.selection]].name} — ₹${out.paid} with duty.` : `§c${out.reason}`);
  return openImports(player);
}

/* ---------------- Ledger ---------------- */

async function openLedger(player, page = 0) {
  const state = getState();
  const perPage = 14;
  const entries = state.ledger.slice(-perPage * (page + 1)).slice(-perPage).reverse();
  const body = entries.length
    ? entries.map(ledgerLine).join("\n")
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

function ledgerLine(e) {
  switch (e.type) {
    case "purchase":
      return `§7D${e.day} ${gradeColor(e.grade)}${e.grade} §f${e.qty}× ${short(e.item)} §7→ ${
        e.outlet === "warehouse" ? "warehouse" : COMMODITIES[e.outlet]?.label ?? e.outlet
      } §7pay §e₹${e.pay} §8(${String(e.seller).split(" ")[0]})`;
    case "tax":
      return `§7D${e.day} §6💰 tax §7income ₹${e.income} · head ₹${e.head} · land ₹${e.land} = §e₹${e.total}`;
    case "market":
      return `§7D${e.day} §b⚖️ market §f₹${e.volume} §7(§f${e.shoppers} §7shoppers) tax ₹${e.salesTax} shops ₹${e.shopProfit}`;
    case "rent":
      return `§7D${e.day} §e🏠 rents §e₹${e.rent} §7(unpaid ₹${e.unpaid})`;
    case "mint":
      if (e.what === "print") return `§7D${e.day} §6🖨 printed §e₹${e.face} §7(${e.batches} batches, fees ₹${e.cost})${e.shattered ? " §cplate shattered" : ""}`;
      return `§7D${e.day} §6🖨 mint ${e.what} §7+${e.made} (stock ${e.stock})`;
    case "bank":
      if (e.what === "loan") return `§7D${e.day} §9🏦 loan §e₹${e.amount} §7→ ${e.to} (${e.purpose})`;
      if (e.what === "repay") return `§7D${e.day} §9🏦 repaid §e₹${e.amount} §7by ${String(e.by).split(" ")[0]} (left ₹${e.left})`;
      if (e.what === "crown-borrow") return `§7D${e.day} §9🏦 crown borrowed §c₹${e.amount} §7(debt ₹${e.debt})`;
      if (e.what === "crown-repay") return `§7D${e.day} §9🏦 crown repaid §a₹${e.amount} §7(debt ₹${e.debt})`;
      return `§7D${e.day} §9🏦 ${e.what}`;
    case "decree":
      return `§7D${e.day} §e📜 decree ${e.what}: §f${e.title}${e.budget ? ` §7(₹${e.budget})` : ""}`;
    case "build":
      return `§7D${e.day} §a🏗 raised §f${e.what}`;
    case "mission":
      return e.what === "launched"
        ? `§7D${e.day} §e📯 mission out for ${e.count} §7(₹${e.cost})`
        : `§7D${e.day} §a📯 mission home: ${e.arrived}/${e.count} arrived`;
    case "harbor":
      if (e.what === "export") return `§7D${e.day} §b📤 ${e.qty}× ${short(e.item)} ×${e.mult} → §e₹${e.gross} §8(${e.ship})`;
      if (e.what === "import") return `§7D${e.day} §b📥 ${e.what} §7₹${e.paid} §8(${e.ship})`;
      if (e.what === "refugees") return `§7D${e.day} §e⛵ refugees ${e.decision} (${e.count})`;
      return `§7D${e.day} §b⚓ ${e.what}`;
    case "wedding":
      return `§7D${e.day} §d💒 ${e.a} ♥ ${e.b} §7(feast ₹${e.feast})`;
    case "birth":
      return `§7D${e.day} §a🍼 ${e.name} §7born to ${String(e.mother).split(" ")[0]}`;
    case "inherit":
      return `§7D${e.day} §8📜 ${e.from} → ${String(e.to).split(" ")[0]} §7₹${e.amount}`;
    default:
      return `§7${JSON.stringify(e)}`;
  }
}

/* ---------------- policy / clock ---------------- */

async function openPopulationPolicy(player) {
  const state = getState();
  const modeIndex = state.populationPolicy.mode === "fixed" ? 1 : state.populationPolicy.mode === "autogrow" ? 2 : 0;
  const form = new ModalFormData()
    .title("📈 Growth Policy")
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
  const stings = state.options?.stings !== false;
  const chat = state.options?.chatOrders !== false;
  const form = new ActionFormData()
    .title("⏰ Clock & Day Settings")
    .body(
      `§7• Day length: §f${state.timePresetMinutes} real minutes §7(standard Minecraft)\n` +
      `§7• Now: §f${formatClock(world.getTimeOfDay())} — ${phaseFor(world.getTimeOfDay())}\n` +
      `§7• Sound stings: ${stings ? "§aON" : "§8muted"} §7• Chat orders: ${chat ? "§aON" : "§8off"}\n\n` +
      `§720 real minutes = one colony day; tick 0 = 06:00 breakfast bell.`
    )
    .button(`🔔 Sound stings: ${stings ? "ON" : "OFF"}`)
    .button(`💬 Chat orders: ${chat ? "ON" : "OFF"}`)
    .button("§8← Back");
  const res = await form.show(player);
  if (res.canceled) return;
  if (res.selection === 0) {
    state.options.stings = !stings;
    saveState();
    if (state.options.stings) sting("coin");
    return openClockSettings(player);
  }
  if (res.selection === 1) {
    state.options.chatOrders = !chat;
    saveState();
    player.sendMessage(chat ? "§7💬 Chat orders OFF — the throne ignores !orders." : "§7💬 Chat orders ON — say !help.");
    return openClockSettings(player);
  }
  return openMainMenu(player);
}

/* ---------------- Court & Watch (M9) ---------------- */

async function openCourt(player) {
  const state = getState();
  const docket = trialReady(state);
  const open = (state.security.cases ?? []).filter((k) => k.status === "rumored").length;
  const gang = (state.security.prisoners ?? []).length;
  const fugitives = state.citizens.filter((c) => c.alive && c.fugitive);
  const lines =
    `§7Security §f${securityRating(state)}/100 §7· constables §f${Math.round(constablePower(state) * 10) / 10} §7· unrest §f${Math.round(state.security.unrest)} §7(${(unrestLevel(state.security.unrest))})\n` +
    `§7Docket §f${docket.length} §7ready · §f${open} §7under investigation · ⛓ §f${gang} §7on the chain gang · 🥷 §f${fugitives.length} §7fugitive${fugitives.length === 1 ? "" : "s"}`;
  const form = new ActionFormData()
    .title("⚖️ Court & Watch")
    .body(lines)
    .button(`⚖️ The docket (${docket.length})`)
    .button(`🌑 Investigations (${open})`)
    .button(`🥷 Fugitives & bounties (${fugitives.length})`)
    .button("📜 Laws of the realm")
    .button("🛡️ Royal Guard & militia")
    .button("§8← Back");
  const res = await form.show(player);
  if (res.canceled) return;
  switch (res.selection) {
    case 0: return openDocket(player);
    case 1: return openInvestigations(player);
    case 2: return openFugitives(player);
    case 3: return openLaws(player);
    case 4: return openWatch(player);
    default: return openMainMenu(player);
  }
}

async function openDocket(player) {
  const state = getState();
  const docket = trialReady(state);
  if (!docket.length) {
    player.sendMessage("§7⚖️ The docket is empty — the peace holds.");
    return openCourt(player);
  }
  const form = new ActionFormData()
    .title("⚖️ The docket")
    .body("§7Evidence ≥ 60% is trial-ready. Unjudged cases rot — suspects flee after 3 dawns.");
  for (const k of docket.slice(0, 10)) {
    const ad = adviseSentence(state, k);
    form.button(`${k.name} — ${k.suspect}\n§7ev ${Math.round(k.evidence)}% · ₹${ad.fine}/${ad.prison}d${ad.banish ? " · BANISH" : ""}`);
  }
  form.button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === Math.min(docket.length, 10)) return openCourt(player);
  return openCase(player, docket[res.selection]);
}

async function openCase(player, k) {
  const state = getState();
  const kase = (state.security.cases ?? []).find((x) => x.id === k.id && x.status === "trial");
  if (!kase) {
    player.sendMessage("§7⚖️ That case has left the docket.");
    return openDocket(player);
  }
  const ad = adviseSentence(state, kase);
  const form = new ActionFormData()
    .title("⚖️ Sentence")
    .body(
      `§f§l${kase.name}§r §7(${kase.id})\n§f${kase.suspect} §7— evidence §f${Math.round(kase.evidence)}%§7, filed day ${kase.day}\n` +
      (kase.detail ? `§8${kase.detail}\n` : "") +
      `§7Prior strikes: §f${ad.strikes} §7· tariff: fine §f₹${ad.fine}§7, prison §f${ad.prison}d` +
      (ad.banish ? " §c· BANISHMENT advised (habitual)" : "")
    )
    .button(`🪙 Fine ₹${ad.fine}`)
    .button(`⛓ Prison ${ad.prison} days`)
    .button("§c🚫 Banish")
    .button("§a⚖ Acquit")
    .button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === 4) return openDocket(player);
  if (!writ(player, state, "judge")) return openCase(player, kase);
  const verdict = ["fine", "prison", "banish", "acquit"][res.selection];
  const out = sentence(state, kase.id, verdict);
  saveState();
  player.sendMessage(out.ok ? out.line : `§c${out.reason}`);
  if (out.ok) sting("gavel");
  return openDocket(player);
}

async function openInvestigations(player) {
  const state = getState();
  const open = (state.security.cases ?? []).filter((k) => k.status === "rumored");
  const lines = open.length
    ? open.slice(0, 12).map((k) => `§8🌑 ${k.name} — ${k.suspect} §7(ev ${Math.round(k.evidence)}%, day ${k.day})`).join("\n")
    : "§8No whispers. Either the town is honest or the constables are blind.";
  const form = new ActionFormData()
    .title("🌑 Investigations")
    .body(`${lines}\n\n§7Guards, soldiers & inspectors grind evidence toward the 60% trial line. Post them at 🛡️ Royal Guard.`)
    .button("§8← Back");
  const res = await form.show(player);
  if (!res.canceled) return openCourt(player);
}

async function openFugitives(player) {
  const state = getState();
  const fugitives = state.citizens.filter((c) => c.alive && c.fugitive);
  const lines = fugitives.length
    ? fugitives.map((c) => {
        const b = (state.security.bounties ?? []).find((x) => x.citizenId === c.id);
        return `§c🥷 ${c.fullName} §7${b ? `(bounty ₹${b.amount})` : "(no bounty)"}`;
      }).join("\n")
    : "§8No fugitives at large. The roads are safe for honest boots.";
  const form = new ActionFormData().title("🥷 Fugitives & bounties").body(`${lines}\n\n§7Bounty hunters drag the named back in chains; constables sharpen their odds.`);
  for (const c of fugitives.slice(0, 10)) form.button(`🥷 ${c.fullName}`);
  form.button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === Math.min(fugitives.length, 10)) return openCourt(player);
  return openBounty(player, fugitives[res.selection]);
}

async function openBounty(player, c) {
  const state = getState();
  const form = new ModalFormData()
    .title(`🥷 ${c.fullName}`)
    .slider("Bounty in rupees (adds to any standing bounty)", 10, 300, 10, 50);
  const res = await form.show(player);
  if (res.canceled) return openFugitives(player);
  if (!writ(player, state, "bounty")) return openFugitives(player);
  const out = postBounty(state, c.id, Number(res.formValues[0]));
  saveState();
  player.sendMessage(out.ok ? `§6🥷 Bounty posted on ${c.fullName} (₹${Number(res.formValues[0])}).` : `§c${out.reason}`);
  return openFugitives(player);
}

async function openLaws(player) {
  const state = getState();
  const laws = state.security.laws;
  const rows = Object.entries(laws)
    .filter(([k]) => k !== "banishAfter")
    .map(([k, t]) => `§7${cap(k)}: §ffine ₹${t.fine} §7/ ⛓ ${t.prison}d`).join("\n");
  const form = new ActionFormData()
    .title("📜 Laws of the realm")
    .body(`${rows}\n§7Banishment advised after §f${laws.banishAfter} §7strikes.\n\n§7The tariff guides every sentence — harsh laws deter, harsh courts embitter.`)
    .button("✒️ Amend the tariff")
    .button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === 1) return openCourt(player);
  if (!writ(player, state, "laws")) return openCourt(player);
  const crimes = Object.keys(laws).filter((k) => k !== "banishAfter");
  const edit = new ModalFormData().title("✒️ Amend the tariff").dropdown("Crime", crimes.map(cap), 0);
  edit.slider("Fine (₹)", 0, 200, 5, 20);
  edit.slider("Prison (days)", 0, 10, 1, 2);
  const r2 = await edit.show(player);
  if (r2.canceled) return openLaws(player);
  const key = crimes[Number(r2.formValues[0])];
  laws[key] = { fine: Number(r2.formValues[1]), prison: Number(r2.formValues[2]) };
  saveState();
  player.sendMessage(`§7📜 ${cap(key)}: fine ₹${laws[key].fine}, prison ${laws[key].prison}d. So it is written.`);
  return openLaws(player);
}

async function openWatch(player) {
  const state = getState();
  const guards = guardRoster(state);
  const militia = militiaCount(state);
  const doctors = doctorRoster(state);
  const lines =
    `§7Rating §f${securityRating(state)}/100 §7· guards §f${guards.length} §7· militia §f${militia} §7· doctors §f${doctors.length}\n` +
    (guards.length ? guards.slice(0, 8).map((g) => `§8🛡️ ${g.fullName} §7(L${g.level})`).join("\n") : "§8No guards posted. The night belongs to whoever wants it.");
  const form = new ActionFormData()
    .title("🛡️ Royal Guard")
    .body(`${lines}\n\n§7Guards patrol by day, stand alternating night watches, solve cases and turn raids. Militia musters in a hurry (₹5 bonus each).`)
    .button("➕ Post a guard (₹12/day)")
    .button("➖ Recall a guard")
    .button("🔍 Post an inspector (₹18/day)")
    .button("⚔️ Conscript militia")
    .button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === 4) return openCourt(player);
  if (!writ(player, state, res.selection === 3 ? "muster" : "military")) return openWatch(player);
  if (res.selection === 0) return pickCitizen(player, "Post guard", "Choose a living adult for the watch:", (s, id) => postGuard(s, id), openWatch);
  if (res.selection === 1) {
    const names = guards.map((g) => g.fullName);
    if (!names.length) {
      player.sendMessage("§7No guards to recall.");
      return openWatch(player);
    }
    const f = new ModalFormData().title("Recall guard").dropdown("Guard", names, 0);
    const r = await f.show(player);
    if (r.canceled) return openWatch(player);
    recallGuard(state, guards[Number(r.formValues[0])].id);
    saveState();
    player.sendMessage("§7🛡️ They hang up the musket and take up their old trade.");
    return openWatch(player);
  }
  if (res.selection === 2) return pickCitizen(player, "Post inspector", "Choose a sharp-eyed auditor of officials:", (s, id) => postInspector(s, id), openWatch);
  const f = new ModalFormData().title("⚔️ Conscript militia").slider("Muster (₹5 bonus each, 5 days)", 1, 12, 1, 4);
  const r = await f.show(player);
  if (r.canceled) return openWatch(player);
  const out = conscript(state, Number(r.formValues[0]));
  saveState();
  player.sendMessage(out.ok ? `§6🛡️ ${Number(r.formValues[0])} militia mustered for 5 days.` : `§c${out.reason}`);
  if (out.ok) sting("trumpet");
  return openWatch(player);
}

/** Generic living-adult picker running an action, then returning to `back`. */
async function pickCitizen(player, title, label, action, back) {
  const state = getState();
  const pool = state.citizens.filter((c) => c.alive && c.ageStage === "adult" && c.role !== "minister" && c.status !== "prisoner");
  if (!pool.length) {
    player.sendMessage("§7No eligible citizens.");
    return back(player);
  }
  const f = new ModalFormData().title(title).dropdown(label, pool.map((c) => `${c.fullName} (${c.profession})`), 0);
  const r = await f.show(player);
  if (r.canceled) return back(player);
  const out = action(state, pool[Number(r.formValues[0])].id);
  saveState();
  player.sendMessage(out.ok ? `§a${pool[Number(r.formValues[0])].fullName} takes up the post.` : `§c${out.reason}`);
  return back(player);
}

/* ---------------- Sky & Research (M10) ---------------- */

async function openSky(player) {
  const state = getState();
  const cl = state.climate;
  const sick = state.citizens.filter((c) => c.alive && (c.sick ?? 0) > 0).length;
  const cur = state.tech.current;
  const lines =
    `§7${seasonIcon(cl.season)} ${cl.season} ${cl.seasonDay}/10, Year ${cl.year} · ${weatherIcon(cl.weather)} ${cl.weather}\n` +
    `§7🤒 sick §f${sick} §7· 🩺 doctors §f${doctorRoster(state).length} §7· 🍞 granary §f${state.foodStock}` +
    (state.hungerDays > 0 ? ` §c(famine day ${state.hungerDays})` : "") + `\n` +
    `§7🔬 RP banked §f${Math.floor(state.tech.rp ?? 0)} §7(+${dailyRP(state)}/day)` +
    (cur ? ` · inquiry §f${cur.id} ${Math.floor(cur.progress)}/${cur.needed}` : " · §8no inquiry") + `\n` +
    `§7🎪 festival ${state.festivalDay === state.day ? "§aTODAY" : "§8—"} §7· 🍞 rationing ${state.rationing ? "§6ON" : "§8off"} §7· 🤒 quarantine ${state.quarantine ? "§6ON" : "§8off"}`;
  const form = new ActionFormData()
    .title("🌦 Sky & Research")
    .body(lines)
    .button("🔬 Research tree")
    .button("🎪 Proclaim festival")
    .button(`${state.rationing ? "🍞 End rationing" : "🍞 Begin rationing"}`)
    .button(`${state.quarantine ? "🤒 Lift quarantine" : "🤒 Declare quarantine"}`)
    .button("⚰ Graveyard")
    .button("§8← Back");
  const res = await form.show(player);
  if (res.canceled) return;
  switch (res.selection) {
    case 0: return openResearch(player);
    case 1: {
      if (!writ(player, state, "decree")) return openSky(player);
      const out = proclaimFestival(state);
      saveState();
      player.sendMessage(out.ok ? `§a🎪 FESTIVAL! Bells, feasts (${out.food} rations), no shifts — the town rejoices.` : `§c${out.reason}`);
      if (out.ok) sting("festival");
      return openSky(player);
    }
    case 2:
      if (!writ(player, state, "rates")) return openSky(player);
      state.rationing = !state.rationing;
      saveState();
      player.sendMessage(state.rationing ? "§6🍞 Rationing ON — half bread, twice the days." : "§a🍞 Rationing OFF — full plates.");
      return openSky(player);
    case 3:
      if (!writ(player, state, "rates")) return openSky(player);
      state.quarantine = !state.quarantine;
      saveState();
      player.sendMessage(state.quarantine ? "§6🤒 Quarantine ON — sickness spreads half as fast." : "§a🤒 Quarantine lifted.");
      return openSky(player);
    case 4: return openGraveyard(player);
    default: return openMainMenu(player);
  }
}

async function openResearch(player) {
  const state = getState();
  const list = techList(state);
  const lines = list.map((t) =>
    `${t.unlocked ? "§a✅" : t.locked ? "§8🔒" : t.current ? "§b🔬" : "§7○"} ${t.icon} ${t.name} §7(${t.cost} RP${t.requires ? `, needs ${t.requires}` : ""})`
  ).join("\n");
  const form = new ActionFormData()
    .title("🔬 Research")
    .body(`${lines}\n\n§7RP banked §f${Math.floor(state.tech.rp ?? 0)} §7· +${dailyRP(state)}/day from schools & teachers · grants ₹10 → 1 RP.`)
    .button("▶️ Choose inquiry")
    .button("💰 Endow a grant")
    .button("§8← Back");
  const res = await form.show(player);
  if (res.canceled || res.selection === 2) return openSky(player);
  if (res.selection === 0) {
    const avail = list.filter((t) => !t.unlocked && !t.locked);
    if (!avail.length) {
      player.sendMessage("§7🔬 Nothing left to inquire — the age of wonders is complete.");
      return openResearch(player);
    }
    const f = new ModalFormData().title("Choose inquiry").dropdown("Inquiry", avail.map((t) => `${t.icon} ${t.name} — ${t.desc}`), 0);
    const r = await f.show(player);
    if (r.canceled) return openResearch(player);
    const out = startResearch(state, avail[Number(r.formValues[0])].id);
    saveState();
    player.sendMessage(out.ok ? `§b🔬 Inquiry begun: ${avail[Number(r.formValues[0])].name}.` : `§c${out.reason}`);
    return openResearch(player);
  }
  const g = new ModalFormData().title("Endow research").slider("Grant (₹10 → 1 RP)", 10, 500, 10, 50);
  const r = await g.show(player);
  if (r.canceled) return openResearch(player);
  const out = grantResearch(state, Number(r.formValues[0]));
  saveState();
  player.sendMessage(out.ok ? `§b🔬 Endowed ₹${Number(r.formValues[0])} (+${out.rp} RP).` : `§c${out.reason}`);
  return openResearch(player);
}

async function openGraveyard(player) {
  const state = getState();
  const stones = state.graveyard ?? [];
  const form = new ActionFormData()
    .title("⚰ Graveyard")
    .body(stones.length ? stones.slice(-12).map((s) => `§8🪦 ${s}`).join("\n") : "§8Green grass, no stones. Long may it wave.")
    .button("§8← Back");
  const res = await form.show(player);
  if (!res.canceled) return openSky(player);
}

/* ---------------- Officers & Orders (M11) ---------------- */

async function openOfficers(player) {
  const state = getState();
  const o = officerList(state);
  const rows = Object.entries(OFFICER_ROLES)
    .map(([r, def]) => `${def.icon} ${def.name}: §f${o.officers[r] ?? "— vacant —"}\n§8  ${def.writ}`).join("\n");
  const form = new ActionFormData()
    .title("🕯️ Officers & Orders")
    .body(`§6👑 Crown: §f${o.crown ?? "unclaimed"}\n${rows}\n\n§7The Crown commissions & dismisses; officers execute their writ even when the Crown is away. With no officers, all hands may act.`)
    .button("📜 Commission an officer")
    .button("🗑 Dismiss an officer")
    .button("❓ Chat orders (!help)")
    .button("§8← Back");
  const res = await form.show(player);
  if (res.canceled) return;
  switch (res.selection) {
    case 0: {
      if (!writ(player, state, "officers")) return openOfficers(player);
      const roles = Object.keys(OFFICER_ROLES);
      const f = new ModalFormData().title("Commission").dropdown("Office", roles.map((r) => `${OFFICER_ROLES[r].icon} ${OFFICER_ROLES[r].name}`), 0);
      f.textField("Gamertag", "Steve");
      const r = await f.show(player);
      if (r.canceled) return openOfficers(player);
      const out = grantOfficer(state, player.name, roles[Number(r.formValues[0])], String(r.formValues[1] ?? "").trim());
      saveState();
      player.sendMessage(out.ok ? `§a🕯️ Commissioned ${OFFICER_ROLES[roles[Number(r.formValues[0])]].name}.` : `§c${out.reason}`);
      if (out.ok) sting("trumpet");
      return openOfficers(player);
    }
    case 1: {
      if (!writ(player, state, "officers")) return openOfficers(player);
      const roles = Object.keys(OFFICER_ROLES);
      const f = new ModalFormData().title("Dismiss").dropdown("Office", roles.map((r) => `${OFFICER_ROLES[r].icon} ${OFFICER_ROLES[r].name} — ${o.officers[r] ?? "vacant"}`), 0);
      const r = await f.show(player);
      if (r.canceled) return openOfficers(player);
      revokeOfficer(state, player.name, roles[Number(r.formValues[0])]);
      saveState();
      player.sendMessage("§7🕯️ The seal is reclaimed.");
      return openOfficers(player);
    }
    case 2: {
      const lines = [
        "§6!orders from chat §7— rule without the Scepter:",
        "§f!status §7realm at a glance · §f!treasury §7coin & food",
        "§f!docket §7cases ready · §f!judge k-3 fine §7sentence",
        "§f!cases §7investigations · §f!bounty \"Name\" 50",
        "§f!decide §7list, §f!decide x-1 grand §7rule",
        "§f!muster 4 §7militia · §f!guards §7the watch",
        "§f!festival §7/ §f!ration §7/ §f!quarantine",
        "§f!tech §7research · §f!officers §7the court",
        "§f!grant marshal Steve §7(Crown) · §f!revoke marshal",
      ];
      for (const l of lines) player.sendMessage(l);
      return openOfficers(player);
    }
    default: return openMainMenu(player);
  }
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
