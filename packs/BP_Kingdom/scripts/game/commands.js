/**
 * commands.js — chat orders: rule from the keyboard (M11/M12, §38).
 *
 * Any `!order` in chat is intercepted (see main.js) and answered — the
 * King may check the treasury, muster militia, pass sentence, proclaim
 * festivals and commission officers without touching the Scepter. Gated
 * writs honor the officers table (net/roles.js). Pure logic: main.js owns
 * the chat subscription and the save.
 *
 * parseCommand(state, senderName, text, helpers) → {lines, mutated}
 */
import { require as need, OFFICER_ROLES, grantOfficer, revokeOfficer, officerList } from "../net/roles.js";
import { trialReady, sentence, adviseSentence } from "../security/courts.js";
import { postBounty } from "../security/crime.js";
import { conscript, securityRating, guardRoster } from "../security/guards.js";
import { proclaimFestival } from "../events/seasons.js";
import { resolveDecision } from "../events/deck.js";
import { knightCitizen, awardMedal } from "../society/titles.js";
import { literacyRate } from "../society/literacy.js";
import { sendCaravan } from "../economy/caravans.js";
import { issueBonds } from "../economy/bonds.js";
import { postContract, takeContract } from "../economy/contracts.js";
import { charterVillage } from "../world/satellites.js";
import { launchExpedition, EXPEDITIONS } from "../world/expeditions.js";
import { plantAgent } from "../security/spies.js";
import { buyMuskets } from "../security/armory.js";

const R = (n) => Math.round(n * 100) / 100;

function help() {
  return [
    "§6!orders — §7treasury · status · mood · docket · cases · decide · judge · bounty · muster · festival · ration · tech · officers · grant · advance",
    "§6!orders² — §7knight · medal · literacy · caravan · bonds · contract · village · voyage · agent · musket",
    "§7e.g. !judge k-3 fine · !bounty \"Rana Thief\" 50 · !muster 4 · !decide x-1 grand",
  ];
}

function byName(state, text) {
  const q = (text ?? "").trim().toLowerCase();
  if (!q) return null;
  return state.citizens.find((c) => c.alive && (c.id === q || (c.fullName ?? "").toLowerCase() === q || (c.fullName ?? "").toLowerCase().includes(q))) ?? null;
}

function statusLines(state) {
  const alive = state.citizens.filter((c) => c.alive);
  const mood = alive.length ? Math.round(alive.reduce((s, c) => s + (c.mood ?? 70), 0) / alive.length) : 0;
  return [
    `§6👑 Day ${state.day} · ${state.climate.season} ${state.climate.seasonDay}/10 · ${state.climate.weather} §7| pop ${alive.length} · mood ${mood} · security ${securityRating(state)}`,
    `§7treasury ₹${R(state.treasury)} · food ${state.foodStock} · unrest ${Math.round(state.security.unrest)} · cases ${(state.security.cases ?? []).filter((k) => k.status !== "closed").length} open · decisions ${(state.pendingDecisions ?? []).length}`,
  ];
}

export function parseCommand(state, senderName, raw, helpers = {}) {
  const rng = helpers.rng ?? Math.random;
  const text = String(raw ?? "").trim();
  if (!text.startsWith("!")) return null;
  const parts = text.slice(1).split(/\s+/).filter(Boolean);
  const cmd = (parts.shift() ?? "").toLowerCase();
  const rest = parts.join(" ");
  const out = { lines: [], mutated: false };

  const gate = (action) => {
    const g = need(state, senderName, action);
    if (!g.ok) out.lines.push(`§c${g.reason}`);
    return g.ok;
  };

  switch (cmd) {
    case "help":
    case "orders":
      out.lines.push(...help());
      break;

    case "status":
      out.lines.push(...statusLines(state));
      break;

    case "treasury":
      out.lines.push(`§6💰 Treasury ₹${R(state.treasury)} §7· bank debt ₹${R(state.bank.crownDebt)} · food ${state.foodStock} · inflation ${R(state.inflation.pct)}%`);
      break;

    case "mood": {
      const alive = state.citizens.filter((c) => c.alive);
      const mood = alive.length ? Math.round(alive.reduce((s, c) => s + (c.mood ?? 70), 0) / alive.length) : 0;
      out.lines.push(`§d😊 Mood ${mood}/100 across ${alive.length} souls · unrest ${Math.round(state.security.unrest)}/100`);
      break;
    }

    case "docket": {
      const ready = trialReady(state);
      if (!ready.length) out.lines.push("§7⚖️ The docket is empty — the peace holds.");
      else {
        out.lines.push("§6⚖️ Docket:");
        for (const k of ready.slice(0, 8)) {
          const ad = adviseSentence(state, k);
          out.lines.push(`§7${k.id} ${k.name} — ${k.suspect} (ev ${Math.round(k.evidence)}%) · tariff ₹${ad.fine}/${ad.prison}d${ad.banish ? " · BANISH advised" : ""}`);
        }
      }
      break;
    }

    case "judge": {
      if (!gate("judge")) break;
      const [id, verdict] = parts;
      const r = sentence(state, id, (verdict ?? "").toLowerCase());
      out.lines.push(r.ok ? r.line : `§c${r.reason} §7(!judge <case> fine|prison|banish|acquit)`);
      if (r.ok) out.mutated = true;
      break;
    }

    case "bounty": {
      if (!gate("bounty")) break;
      const m = rest.match(/^(?:"([^"]+)"|(\S+))\s+(\d+(?:\.\d+)?)$/);
      if (!m) {
        const f = state.citizens.filter((c) => c.alive && c.fugitive);
        out.lines.push(f.length
          ? `§7🥷 Fugitives: ${f.map((c) => c.fullName).join(", ")} §7(!bounty "Name" 50)`
          : "§7🥷 No fugitives at large.");
        break;
      }
      const name = (m[1] ?? m[2]).toLowerCase();
      const fugitive = state.citizens.find((c) => c.alive && c.fugitive && c.fullName.toLowerCase().includes(name));
      if (!fugitive) {
        out.lines.push("§cNo fugitive by that name.");
        break;
      }
      const r = postBounty(state, fugitive.id, Number(m[3]));
      out.lines.push(r.ok ? `§6🥷 Bounty posted on ${fugitive.fullName} (₹${m[3]}).` : `§c${r.reason}`);
      if (r.ok) out.mutated = true;
      break;
    }

    case "muster": {
      if (!gate("muster")) break;
      const n = Math.max(1, Math.min(12, Math.round(Number(parts[0]) || 4)));
      const r = conscript(state, n);
      out.lines.push(r.ok ? `§6🛡️ ${n} militia mustered for 5 days.` : `§c${r.reason}`);
      if (r.ok) out.mutated = true;
      break;
    }

    case "guards": {
      const g = guardRoster(state);
      out.lines.push(`§7🛡️ Guards posted: ${g.length ? g.map((x) => x.fullName).join(", ") : "none"} · rating ${securityRating(state)}`);
      break;
    }

    case "cases": {
      const open = (state.security.cases ?? []).filter((k) => k.status !== "closed");
      if (!open.length) out.lines.push("§7🌑 No open cases.");
      else {
        out.lines.push("§7🌑 Open cases:");
        for (const k of open.slice(0, 8)) out.lines.push(`§7${k.id} ${k.name} — ${k.suspect} [${k.status}, ev ${Math.round(k.evidence)}%]`);
      }
      break;
    }

    case "decide": {
      const [id, option] = parts;
      if (!id) {
        const ds = state.pendingDecisions ?? [];
        if (!ds.length) out.lines.push("§7⌛ No moments await the King's word.");
        else {
          out.lines.push("§6⌛ Awaiting decision:");
          for (const d of ds) out.lines.push(`§7${d.id} ${d.title} — ${d.options.map((o) => o.id).join("/")} (expires day ${d.expiryDay})`);
        }
        break;
      }
      const r = resolveDecision(state, id, (option ?? "").toLowerCase(), rng);
      out.lines.push(r.ok ? r.line : `§c${r.reason}`);
      if (r.ok) out.mutated = true;
      break;
    }

    case "festival":
      if (!gate("decree")) break;
      if (parts[0] === "off" || parts[0] === "cancel") {
        if (state.festivalDay === state.day) {
          state.festivalDay = -1;
          out.lines.push("§7🎪 The festival is called off — back to work.");
          out.mutated = true;
        } else out.lines.push("§7🎪 No festival proclaimed today.");
      } else {
        const r = proclaimFestival(state);
        out.lines.push(r.ok ? `§a🎪 FESTIVAL! Bells, feasts (${r.food} rations), no shifts — the town rejoices.` : `§c${r.reason}`);
        if (r.ok) out.mutated = true;
      }
      break;

    case "ration":
      if (!gate("rates")) break;
      state.rationing = !state.rationing;
      out.lines.push(state.rationing ? "§6🍞 Rationing ON — half bread, twice the days. Bellies will grumble." : "§a🍞 Rationing OFF — full plates.");
      out.mutated = true;
      break;

    case "quarantine":
      if (!gate("rates")) break;
      state.quarantine = !state.quarantine;
      out.lines.push(state.quarantine ? "§6🤒 Quarantine ON — sickness spreads half as fast; trade sags." : "§a🤒 Quarantine lifted.");
      out.mutated = true;
      break;

    case "tech": {
      const t = state.tech;
      const cur = t.current ? ` · inquiry: ${t.current.id} ${Math.floor(t.current.progress)}/${t.current.needed}` : "";
      out.lines.push(`§b🔬 RP banked ${Math.floor(t.rp ?? 0)}${cur} §7· mastered: ${(t.unlocked ?? []).join(", ") || "none"}`);
      break;
    }

    case "officers": {
      const o = officerList(state);
      const names = Object.entries(o.officers).map(([r, h]) => `${OFFICER_ROLES[r].icon} ${OFFICER_ROLES[r].name}: ${h ?? "—"}`).join(" · ");
      out.lines.push(`§6👑 Crown: ${o.crown ?? "unclaimed"} §7· ${names}`);
      break;
    }

    case "grant": {
      if (!gate("officers")) break;
      const [role, ...who] = parts;
      const r = grantOfficer(state, senderName, (role ?? "").toLowerCase(), who.join(" "));
      out.lines.push(r.ok ? `§a🕯️ ${who.join(" ")} is commissioned ${OFFICER_ROLES[role.toLowerCase()].name}.` : `§c${r.reason} §7(!grant <chamberlain|treasurer|magistrate|marshal> <name>)`);
      if (r.ok) out.mutated = true;
      break;
    }

    case "revoke": {
      if (!gate("officers")) break;
      const r = revokeOfficer(state, senderName, (parts[0] ?? "").toLowerCase());
      out.lines.push(r.ok ? `§7🕯️ The ${parts[0]}'s seal is reclaimed.` : `§c${r.reason}`);
      if (r.ok) out.mutated = true;
      break;
    }

    case "advance":
      if (!gate("officers")) break;
      out.lines.push(`§7🌅 Days turn with the sun — dawn of Day ${state.day + 1} comes on its own arc. Patience, Majesty.`);
      break;

    // ---- M13 writs ----
    case "knight": {
      if (!gate("decree")) break;
      const c = byName(state, parts.join(" "));
      if (!c) { out.lines.push("§cWho kneels? §7(!knight <name>)"); break; }
      const r = knightCitizen(state, c.id);
      out.lines.push(r.ok ? `§a⚔️ Arise, ${r.name}!` : `§c${r.reason}`);
      if (r.ok) out.mutated = true;
      break;
    }
    case "medal": {
      if (!gate("decree")) break;
      const c = byName(state, parts.join(" "));
      if (!c) { out.lines.push("§cWhose breast? §7(!medal <name>)"); break; }
      const r = awardMedal(state, c.id);
      out.lines.push(r.ok ? `§a🎖️ ${c.fullName} is decorated!` : `§c${r.reason}`);
      if (r.ok) out.mutated = true;
      break;
    }
    case "literacy": {
      const lr = literacyRate(state);
      const teachers = state.citizens.filter((c) => c.alive && c.profession === "teacher").length;
      const press = (state.buildings ?? []).some((b) => b.buildingId === "gazette");
      out.lines.push(`§7📚 Literacy §f${lr}% §7· teachers §f${teachers} §7· press ${press ? "§arolling" : "§8none"} §7· gazette ${state.literacy?.gazette ?? true ? "§aloud" : "§8silent"}`);
      break;
    }
    case "caravan": {
      if (!gate("spend")) break;
      const loads = { timber: { "minecraft:oak_log": 32 }, stone: { "minecraft:cobblestone": 48 }, grain: { "minecraft:wheat": 32 } };
      const load = loads[(parts[0] ?? "").toLowerCase()];
      if (!load) { out.lines.push("§cWhich train? §7(!caravan timber|stone|grain)"); break; }
      const r = sendCaravan(state, load);
      out.lines.push(r.ok ? `§a🐪 Caravan ${r.caravan.id} lumbers out (home day ${r.caravan.returnDay}).` : `§c${r.reason}`);
      if (r.ok) out.mutated = true;
      break;
    }
    case "bonds": {
      if (!gate("spend")) break;
      const n = Math.max(1, Math.min(10, Number(parts[0] ?? 3) || 3));
      const r = issueBonds(state, n);
      out.lines.push(r.ok ? `§a📜 Sold ${r.sold} bonds (+₹${r.raised}).` : `§c${r.reason}`);
      if (r.ok) out.mutated = true;
      break;
    }
    case "contract": {
      if (!gate("spend")) break;
      const i = Number(parts[0] ?? 0);
      const r = postContract(state, i);
      out.lines.push(r.ok ? `§a📋 Commission ${r.contract.id} posted (${r.contract.qty} ${r.contract.item.replace("minecraft:", "")}, ₹${r.contract.payout}).` : `§c${r.reason} §7(!contract 0..3)`);
      if (r.ok) out.mutated = true;
      break;
    }
    case "village": {
      if (!gate("spend")) break;
      const m = rest.match(/^(?:"([^"]+)"|(\S+))\s+(.+)$/);
      if (!m) { out.lines.push("§cName it and name its governor. §7(!village <name> <governor>)"); break; }
      const g = byName(state, m[3]);
      if (!g) { out.lines.push(`§cNo governor found for "${m[3]}".`); break; }
      const r = charterVillage(state, m[1] ?? m[2], g.id);
      out.lines.push(r.ok ? `§a🏘️ The charter is sealed — ${r.village.name} rises!` : `§c${r.reason}`);
      if (r.ok) out.mutated = true;
      break;
    }
    case "voyage": {
      if (!gate("spend")) break;
      const kinds = Object.keys(EXPEDITIONS);
      const kind = kinds.includes((parts[0] ?? "").toLowerCase()) ? parts[0].toLowerCase() : null;
      const leader = kind ? byName(state, parts.slice(1).join(" ")) : null;
      if (!kind || !leader) { out.lines.push(`§cWho sails where? §7(!voyage ${kinds.join("|")} <leader>)`); break; }
      const pool = state.citizens.filter((c) => c.alive && c.ageStage === "adult" && c.id !== leader.id && c.role !== "minister" && c.status !== "prisoner" && !c.fugitive && c.status !== "away");
      const r = launchExpedition(state, kind, leader.id, pool.slice(0, EXPEDITIONS[kind].crew - 1).map((c) => c.id));
      out.lines.push(r.ok ? `§a🧭 The ${EXPEDITIONS[kind].name} departs under ${leader.fullName}!` : `§c${r.reason}`);
      if (r.ok) out.mutated = true;
      break;
    }
    case "agent": {
      if (!gate("military")) break;
      const r = plantAgent(state);
      out.lines.push(r.ok ? `§a🕵️ ${r.agent.name} vanishes abroad with a new face.` : `§c${r.reason}`);
      if (r.ok) out.mutated = true;
      break;
    }
    case "musket": {
      if (!gate("military")) break;
      const n = Math.max(1, Math.min(20, Number(parts[0] ?? 4) || 4));
      const r = buyMuskets(state, n);
      out.lines.push(r.ok ? `§a🔫 ${n} muskets racked (₹${r.cost}).` : `§c${r.reason}`);
      if (r.ok) out.mutated = true;
      break;
    }

    default:
      out.lines.push(`§cUnknown order "!${cmd}". §7Say !help.`);
  }
  return out;
}
