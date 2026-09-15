/**
 * deck.js — the wheel of fortune: 16 living-world events (M10, §35–§36).
 *
 * Each dawn (35%) fate draws one card whose conditions hold: mine collapses,
 * tenement fires, strikes, pirates, dignitaries, diamond strikes, bank runs,
 * omens, nomads, treasure maps and more. Most resolve at once with treasury,
 * mood and ledger effects; the weighty ones open a PENDING DECISION in
 * Audiences — two roads, the King's to choose, expiring in 2 days.
 */
import { LEDGER_CAP } from "../core/state.js";
import { handleInheritance } from "../social/housing.js";

export function nextDecisionId(state) {
  return `x-${state.nextDecisionId++}`;
}

function ledgerEvent(state, what, detail) {
  state.ledger.push({ day: state.day, type: "event", what, ...detail });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
}

function decide(state, eventId, title, body, options, data = {}) {
  const decision = {
    id: nextDecisionId(state),
    eventId,
    title,
    body,
    options, // [{id,label,desc}]
    data,
    day: state.day,
    expiryDay: state.day + 2,
  };
  state.pendingDecisions.push(decision);
  return decision;
}

function aliveAdults(state) {
  return state.citizens.filter((c) => c.alive && c.ageStage === "adult");
}

/* ---------------- the cards ---------------- */

const EVENTS = [
  {
    id: "mine_collapse", weight: 3,
    canFire: (s) => aliveAdults(s).some((c) => c.profession === "builder" || c.profession === "laborer"),
    fire(s, rng, out) {
      const crew = aliveAdults(s).filter((c) => c.profession === "builder" || c.profession === "laborer");
      const victim = crew[Math.floor(rng() * crew.length)];
      victim.health = Math.max(1, (victim.health ?? 20) - 10);
      victim.sick = Math.max(victim.sick ?? 0, 2);
      const timber = Math.min(20, Math.floor(state_rescue(s)));
      out.lines.push(`§c⛏️ MINE COLLAPSE! ${victim.fullName} was dug out bloodied (₹${timber} in timber and brandy for the rescue).`);
      ledgerEvent(s, "mine_collapse", { victim: victim.fullName });
      function state_rescue(st) {
        const cost = Math.min(20, Math.max(0, st.treasury));
        st.treasury = Math.round((st.treasury - cost) * 100) / 100;
        st.dailyStats.welfare = Math.round(((st.dailyStats.welfare ?? 0) + cost) * 100) / 100;
        return cost;
      }
    },
  },
  {
    id: "tenement_fire", weight: 2,
    canFire: (s) => (s.houses ?? []).length >= 2 && (s.climate?.weather === "heatwave" || (s.climate?.droughtDays ?? 0) >= 3),
    fire(s, rng, out) {
      const house = (s.houses ?? [])[Math.floor(rng() * s.houses.length)];
      const homeless = [...house.residents];
      for (const id of homeless) {
        const c = s.citizens.find((x) => x.id === id);
        if (c) c.home = null;
      }
      s.houses = s.houses.filter((h) => h.id !== house.id);
      const damage = 25 + Math.floor(rng() * 30);
      s.treasury = Math.max(0, Math.round((s.treasury - damage) * 100) / 100);
      out.lines.push(`§c🔥 TENEMENT FIRE! ${house.name} burned to the bricks — ${homeless.length} homeless, ₹${damage} lost. Brick rebuilds advised.`);
      ledgerEvent(s, "fire", { house: house.name, damage });
    },
  },
  {
    id: "strike", weight: 3,
    canFire: (s, helpers) => helpers.wageGap(s) > 0,
    fire(s, rng, out) {
      s.strikeDays = Math.max(s.strikeDays ?? 0, 2);
      out.lines.push("§6✊ STRIKE! Wages lag the living wage — the shifts stand idle for 2 days. Raise pay or feast them back.");
      ledgerEvent(s, "strike", {});
    },
  },
  {
    id: "pirates", weight: 2,
    canFire: (s) => (s.harbor?.level ?? 0) >= 1 && (s.harbor?.ships?.length ?? 0) > 0,
    fire(s, rng, out) {
      decide(s, "pirates", "🏴‍☠️ Pirate blockade",
        "Black sails off the point! The clipper cowers at anchor. Pay the toll, drive them off with the garrison, or wait them out (exports rot 2 days).",
        [
          { id: "toll", label: "Pay ₹80 toll", desc: "Safe passage, lighter purse" },
          { id: "fight", label: "Drive them off", desc: "Needs 3+ guards; glory or wounds" },
          { id: "wait", label: "Wait them out", desc: "Ships sail; trade stalls" },
        ]);
      out.lines.push("§c🏴‍☠️ PIRATES blockade the harbor! The King's word is needed (Audiences).");
    },
  },
  {
    id: "dignitary", weight: 2,
    canFire: (s) => aliveAdults(s).length >= 8,
    fire(s, rng, out) {
      decide(s, "dignitary", "🎩 Dignitary's visit",
        "A governor's barge rounds the point — inspection and gifts expected. Splendor rewards fame and coin; shabbiness embarrasses.",
        [
          { id: "grand", label: "Grand reception (₹60)", desc: "+mood, +reward if splendid" },
          { id: "modest", label: "Modest welcome", desc: "No cost, no favor" },
        ]);
      out.lines.push("§e🎩 A DIGNITARY lands for inspection! Decide the reception (Audiences).");
    },
  },
  {
    id: "diamond_strike", weight: 1,
    canFire: (s) => aliveAdults(s).some((c) => c.profession === "builder" || c.profession === "laborer"),
    fire(s, rng, out) {
      const gems = 1 + Math.floor(rng() * 3);
      s.stockpile["minecraft:diamond"] = (s.stockpile["minecraft:diamond"] ?? 0) + gems;
      for (const c of aliveAdults(s)) c.mood = Math.min(100, (c.mood ?? 70) + 6);
      out.lines.push(`§b💎 DIAMOND STRIKE! ${gems} stones to the Crown assay — a freelance rush, boomtown joy, empty tool racks.`);
      ledgerEvent(s, "diamond_strike", { gems });
    },
  },
  {
    id: "bank_run", weight: 2,
    canFire: (s) => (s.bank?.crownDebt ?? 0) > 200 || (s.inflation?.pct ?? 0) > 8,
    fire(s, rng, out) {
      const panic = Math.min(Math.floor(s.treasury * 0.2), 100 + Math.floor(rng() * 150));
      decide(s, "bank_run", "🏦 Bank run",
        `Fearful queues ring the bank — ₹${panic} in withdrawals loom. Calm them with coin and confidence, or let the panic burn?`,
        [
          { id: "calm", label: `Inject ₹${Math.min(panic, 150)} confidence`, desc: "Halts the run, costs coin" },
          { id: "burn", label: "Let it burn", desc: "Full withdrawals, −mood" },
        ],
        { panic });
      out.lines.push("§c🏦 BANK RUN! Queues ring the doors — the King's nerve is needed (Audiences).");
    },
  },
  {
    id: "counterfeit_ring", weight: 2,
    canFire: (s) => (s.mint?.batchesPrinted ?? 0) >= 3,
    fire(s, rng, out) {
      decide(s, "counterfeit_ring", "💵 Counterfeit ring",
        "False notes flood the bazaar — trust in the rupee wobbles. Void the old notes at once, or hunt the press quietly?",
        [
          { id: "void", label: "Demonetize now", desc: "Trust restored, −8 mood" },
          { id: "hunt", label: "Hunt the press (₹30)", desc: "Constables strike; may fail" },
        ]);
      out.lines.push("§c💵 A COUNTERFEIT RING runs false notes! Decide the response (Audiences).");
    },
  },
  {
    id: "comet", weight: 2,
    canFire: () => true,
    fire(s, rng, out) {
      if (rng() < 0.5) {
        for (const c of s.citizens) if (c.alive) c.mood = Math.min(100, (c.mood ?? 70) + 3);
        out.lines.push("§d☄️ A bright COMET! The priest declares favor — the town gazes up, hopeful.");
      } else {
        for (const c of s.citizens) if (c.alive) c.mood = Math.max(5, (c.mood ?? 70) - 4);
        out.lines.push("§8☄️ A brooding comet — ill omen, mutters the bazaar. A festival would settle nerves.");
      }
      ledgerEvent(s, "comet", {});
    },
  },
  {
    id: "nomads", weight: 3,
    canFire: (s) => s.treasury >= 40,
    fire(s, rng, out) {
      const goods = ["saffron & silk", "Kashmiri shawls", "fine horses", "ivory combs"][Math.floor(rng() * 4)];
      const price = 30 + Math.floor(rng() * 40);
      decide(s, "nomads", "🐪 Nomad caravan",
        `A nomad caravan camps by the walls with ${goods} (₹${price}) — and rumors from beyond the hills.`,
        [
          { id: "buy", label: `Buy the goods (₹${price})`, desc: "+mood, +treasury gifts later" },
          { id: "decline", label: "Wave them on", desc: "Nothing ventured" },
        ],
        { goods, price });
      out.lines.push(`§e🐪 A NOMAD CARAVAN offers ${goods} (₹${price}). Decide (Audiences).`);
    },
  },
  {
    id: "treasure_map", weight: 1,
    canFire: (s) => s.treasury >= 60,
    fire(s, rng, out) {
      decide(s, "treasure_map", "🗺️ Fisherman's map",
        "A grinning fisherman sells a salt-stained map to a wreck — ₹50 to fit a salvage yawl. Wrecks or tall tales?",
        [
          { id: "fund", label: "Fit the yawl (₹50)", desc: "Fortune favors the crowned" },
          { id: "decline", label: "Tall tales", desc: "Keep the coin" },
        ]);
      out.lines.push("§e🗺️ A TREASURE MAP is offered! Fit a salvage yawl? (Audiences)");
    },
  },
  {
    id: "elephant", weight: 1,
    canFire: () => true,
    fire(s, rng, out) {
      if (rng() < 0.5) {
        s.stockpile["minecraft:oak_log"] = (s.stockpile["minecraft:oak_log"] ?? 0) + 32;
        for (const c of s.citizens) if (c.alive) c.mood = Math.min(100, (c.mood ?? 70) + 4);
        out.lines.push("§a🐘 The circus elephant was caught and set to the timber — +32 logs and a week of jokes!");
      } else {
        out.lines.push("§7🐘 The circus elephant thundered through the grove and vanished. Droppings everywhere. No harm done.");
      }
      ledgerEvent(s, "elephant", {});
    },
  },
  {
    id: "twins", weight: 1,
    canFire: (s) => s.citizens.some((c) => c.alive && c.ageStage !== "adult"),
    fire(s, rng, out) {
      for (const c of s.citizens) if (c.alive) c.mood = Math.min(100, (c.mood ?? 70) + 5);
      out.lines.push("§d👶 TWINS in the nursery quarter! Bells, sweetmeats, and a rare happiness for the whole town.");
      ledgerEvent(s, "twins", {});
    },
  },
  {
    id: "spy", weight: 1,
    canFire: (s) => aliveAdults(s).length >= 10,
    fire(s, rng, out) {
      const gossip = 10 + Math.floor(rng() * 20);
      s.treasury = Math.max(0, Math.round((s.treasury - gossip) * 100) / 100);
      out.lines.push(`§8🕵️ A rival's SPY was caught copying the price book (₹${gossip} in bribes traced). Coffee-house tongues wag.`);
      ledgerEvent(s, "spy", { cost: gossip });
    },
  },
  {
    id: "locusts", weight: 2,
    canFire: (s) => s.climate?.season === "Summer" || s.climate?.season === "Autumn",
    fire(s, rng, out) {
      const eaten = Math.min(s.foodStock, 20 + Math.floor(rng() * 40));
      s.foodStock -= eaten;
      out.lines.push(`§6🦗 LOCUSTS strip the fields — ${eaten} rations gone. Granaries and imports must bridge the gap.`);
      ledgerEvent(s, "locusts", { eaten });
    },
  },
  {
    id: "gold_rush", weight: 1,
    canFire: (s) => (s.harbor?.level ?? 0) >= 1,
    fire(s, rng, out) {
      const royalty = 40 + Math.floor(rng() * 60);
      s.treasury = Math.round((s.treasury + royalty) * 100) / 100;
      out.lines.push(`§6⛏️ GOLD RUSH upriver! The Crown claims its royalty (₹${royalty}) and licenses the claims.`);
      ledgerEvent(s, "gold_rush", { royalty });
    },
  },
];

/** Average gap between living wage and actual crown pay (₹/day, >0 = underpaid). */
export function wageGap(state) {
  const idx = state.market?.priceIndex ?? 1;
  const living = 3 * 2 * idx + 2;
  const earners = state.citizens.filter((c) => c.alive && c.ageStage === "adult" && c.wageMode !== "freelance" && c.role !== "minister");
  if (!earners.length) return 0;
  const avg = earners.reduce((s, c) => s + (c.wage ?? 0), 0) / earners.length;
  return Math.round((living - avg) * 100) / 100;
}

const HELPERS = { wageGap };

/**
 * Rolls one fate card (~35% of dawns). Decisions queue in Audiences.
 * @returns {{lines:string[],fired:string|null}}
 */
export function rollEvents(state, rng = Math.random) {
  const out = { lines: [], fired: null };
  // Expire stale decisions first (the moment passes with a shrug).
  const kept = [];
  for (const d of state.pendingDecisions ?? []) {
    if (state.day > d.expiryDay) {
      out.lines.push(`§7⌛ ${d.title} — the moment passed undecided.`);
    } else {
      kept.push(d);
    }
  }
  state.pendingDecisions = kept;

  if ((state.pendingDecisions ?? []).length >= 3) return out; // the King is busy enough
  if (rng() > 0.35) return out;
  const ready = EVENTS.filter((e) => {
    try {
      return e.canFire(state, HELPERS);
    } catch {
      return false;
    }
  });
  if (!ready.length) return out;
  const total = ready.reduce((s, e) => s + e.weight, 0);
  let roll = rng() * total;
  let card = ready[ready.length - 1];
  for (const e of ready) {
    roll -= e.weight;
    if (roll <= 0) {
      card = e;
      break;
    }
  }
  try {
    card.fire(state, rng, out);
    out.fired = card.id;
  } catch (err) {
    console.warn(`[KINGDOM] event ${card.id} skipped: ${err}`);
  }
  return out;
}

/**
 * Resolves a pending decision option.
 * @returns {{ok:boolean,line?:string,reason?:string}}
 */
export function resolveDecision(state, decisionId, optionId, rng = Math.random) {
  const i = (state.pendingDecisions ?? []).findIndex((d) => d.id === decisionId);
  if (i < 0) return { ok: false, reason: "That moment has passed." };
  const [d] = state.pendingDecisions.splice(i, 1);
  const opt = d.options.find((o) => o.id === optionId);
  if (!opt) return { ok: false, reason: "Unknown road." };
  const line = DECISIONS[d.eventId]?.(state, opt.id, d.data, rng) ?? "It is done.";
  ledgerEvent(state, "decision", { what: d.title, chose: opt.label });
  return { ok: true, line };
}

const DECISIONS = {
  pirates(s, opt) {
    if (opt === "toll") {
      const toll = Math.min(80, Math.max(0, s.treasury));
      s.treasury = Math.round((s.treasury - toll) * 100) / 100;
      s.dailyStats.security = Math.round(((s.dailyStats.security ?? 0) + toll) * 100) / 100;
      return `§7🏴‍☠️ The toll is paid (₹${toll}). The black sails dip — mockingly — and slide away.`;
    }
    if (opt === "fight") {
      const guards = s.citizens.filter((c) => c.alive && c.ageStage === "adult" && (c.profession === "guard" || c.profession === "soldier")).length;
      if (guards >= 3) {
        for (const c of s.citizens) if (c.alive) c.mood = Math.min(100, (c.mood ?? 70) + 4);
        return "§a🏴‍☠️ The garrison mans the battery and the pirates sheer off! Bunting and ballads.";
      }
      const loot = Math.min(60, Math.max(0, Math.floor(s.treasury * 0.1)));
      s.treasury = Math.round((s.treasury - loot) * 100) / 100;
      return `§c🏴‍☠️ Too few muskets! The pirates loot the quay (₹${loot}) before the wind takes them.`;
    }
    for (const ship of s.harbor?.ships ?? []) ship.departureDay = s.day; // she sails unladen
    return "§7🏴‍☠️ The town waits behind shutters. The clipper slips away unladen; trade stalls.";
  },
  dignitary(s, opt) {
    if (opt === "grand") {
      if (s.treasury < 60) return "§cThe treasury cannot stage grandeur — the barge sails on, unimpressed.";
      s.treasury = Math.round((s.treasury - 60) * 100) / 100;
      s.dailyStats.welfare = Math.round(((s.dailyStats.welfare ?? 0) + 60) * 100) / 100;
      const mood = avgMood(s);
      for (const c of s.citizens) if (c.alive) c.mood = Math.min(100, (c.mood ?? 70) + 5);
      if (mood >= 60) {
        s.treasury = Math.round((s.treasury + 100) * 100) / 100;
        return "§a🎩 Splendor! The dignitary scribbles praise and a ₹100 gift of patronage. The town glows.";
      }
      return "§7🎩 Grandeur on a gloomy town — polite applause, no patronage. Happiness first, pageantry second.";
    }
    return "§7🎩 A modest bow and plain bread. The dignitary notes everything and promises nothing.";
  },
  bank_run(s, opt, data) {
    const panic = data?.panic ?? 100;
    if (opt === "calm") {
      const injection = Math.min(panic, 150, Math.max(0, s.treasury));
      s.treasury = Math.round((s.treasury - injection) * 100) / 100;
      s.bank.crownRate = Math.max(0, s.bank.crownRate - 1);
      return `§a🏦 Coin on the counter, steady voice at the door (₹${injection}) — the queue melts. Rates ease a point.`;
    }
    s.treasury = Math.max(0, Math.round((s.treasury - panic) * 100) / 100);
    for (const c of s.citizens) if (c.alive) c.mood = Math.max(5, (c.mood ?? 70) - 8);
    return `§c🏦 The run burns through ₹${panic}. The bank survives, thinner and wiser; the town, poorer and grimmer.`;
  },
  counterfeit_ring(s, opt) {
    if (opt === "void") {
      s.inflation.pct = 0;
      s.inflation.priceIndex = Math.max(1, Math.round(s.inflation.priceIndex * 0.85 * 1000) / 1000);
      s.market.priceIndex = s.inflation.priceIndex;
      for (const c of s.citizens) if (c.alive) c.mood = Math.max(5, (c.mood ?? 70) - 8);
      return "§6💵 Old notes void! The false press starves; the bazaar grumbles (−8) and trusts again.";
    }
    if (s.treasury < 30) return "§cNo coin for the hunt — the false press runs on.";
    s.treasury = Math.round((s.treasury - 30) * 100) / 100;
    s.dailyStats.security = Math.round(((s.dailyStats.security ?? 0) + 30) * 100) / 100;
    const power = s.citizens.filter((c) => c.alive && (c.profession === "guard" || c.profession === "inspector")).length;
    if (power >= 2) {
      s.inflation.pct = Math.max(0, s.inflation.pct - 2);
      return "§a💵 Constables smash the false press in a cellar raid! Genuine coin breathes again.";
    }
    return "§7💵 The raid finds cold ashes and warm beds — the press moved on. More constables needed.";
  },
  nomads(s, opt, data) {
    if (opt === "buy") {
      const price = data?.price ?? 40;
      if (s.treasury < price) return "§cThe caravan shrugs and strikes camp — coin talks.";
      s.treasury = Math.round((s.treasury - price) * 100) / 100;
      for (const c of s.citizens) if (c.alive) c.mood = Math.min(100, (c.mood ?? 70) + 6);
      s.treasury = Math.round((s.treasury + Math.floor(price / 2)) * 100) / 100;
      return `§a🐪 ${data.goods} delights the town (+mood); resale and rumor-nets return ₹${Math.floor(price / 2)}.`;
    }
    return "§7🐪 The camels' bells fade down the road. Nothing ventured, nothing gained.";
  },
  treasure_map(s, opt) {
    if (opt === "fund") {
      if (s.treasury < 50) return "§cNo yawl, no wreck.";
      s.treasury = Math.round((s.treasury - 50) * 100) / 100;
      // Fortune favors the bold 60/40.
      if (Math.random() < 0.6) {
        const haul = 120 + Math.floor(Math.random() * 120);
        s.treasury = Math.round((s.treasury + haul) * 100) / 100;
        return `§a🗺️ The yawl returns low in the water — Spanish silver! ₹${haul} to the Crown.`;
      }
      return "§7🗺️ Sand, crabs, and a waterlogged boot. The fisherman has left town.";
    }
    return "§7🗺️ Tall tales, wisely declined.";
  },
};

function avgMood(state) {
  const a = state.citizens.filter((c) => c.alive);
  if (!a.length) return 0;
  return a.reduce((s, c) => s + (c.mood ?? 70), 0) / a.length;
}

export { handleInheritance };
