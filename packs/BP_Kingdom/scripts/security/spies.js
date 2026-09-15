/**
 * spies.js — the whisper network (M13, §37.13, §37.118, §35.21).
 *
 * Plant agents in rival courts (₹60 each): coded dispatches drift home —
 * raid warnings 1–2 days ahead (the garrison doubles), market whispers,
 * garrison gossip. Counter-spies (₹30) smoke out enemy agents before
 * they copy the price book.
 */
import { LEDGER_CAP } from "../core/state.js";

export const AGENT_COST = 60;
export const COUNTER_COST = 30;

const RIVAL_NAMES = ["Factor Vane", "the Widow Lark", "Clerk Pim", "Captain Sable", "Sister Moth", "Old Hob"];

/** Plants an agent abroad. */
export function plantAgent(state) {
  if ((state.spies?.agents ?? []).length >= 4) return { ok: false, reason: "Four masks abroad are plenty." };
  if (state.treasury < AGENT_COST) return { ok: false, reason: `A legend costs ₹${AGENT_COST} to build.` };
  state.treasury = Math.round((state.treasury - AGENT_COST) * 100) / 100;
  state.dailyStats.security = Math.round(((state.dailyStats.security ?? 0) + AGENT_COST) * 100) / 100;
  const agent = { id: `y-${state.nextSpyId++}`, name: RIVAL_NAMES[(state.nextSpyId - 1) % RIVAL_NAMES.length], day: state.day };
  state.spies.agents.push(agent);
  return { ok: true, agent };
}

/** Hires a counter-spy at home. */
export function hireCounterSpy(state) {
  if (state.treasury < COUNTER_COST) return { ok: false, reason: `Vigilance costs ₹${COUNTER_COST}.` };
  state.treasury = Math.round((state.treasury - COUNTER_COST) * 100) / 100;
  state.dailyStats.security = Math.round(((state.dailyStats.security ?? 0) + COUNTER_COST) * 100) / 100;
  state.spies.counterSpies++;
  return { ok: true };
}

/**
 * Daily tick: dispatches, warnings, enemy agents.
 * @returns {{lines:string[]}}
 */
export function tickSpies(state, rng = Math.random) {
  const out = { lines: [] };
  const agents = state.spies?.agents ?? [];

  for (const a of agents) {
    const roll = rng();
    if (roll < 0.22) {
      // Raid intelligence: 1–2 days' warning.
      const ahead = 1 + Math.floor(rng() * 2);
      state.spies.raidWarningDay = state.day + ahead;
      out.lines.push(`§9🕵️ Coded dispatch from ${a.name}: bandits massing — raid likely within ${ahead} day${ahead > 1 ? "s" : ""}! The garrison doubles.`);
      ledgerSpy(state, "warning", { agent: a.name, ahead });
    } else if (roll < 0.4) {
      const tips = [
        "Rival granaries bulge; grain prices will sag.",
        "A rival pay chest travels light-guarded Thursday.",
        "Their harbor master drinks; their schedules leak.",
        "Mercenaries gather at the border stones — prices for iron rise.",
      ];
      const text = tips[Math.floor(rng() * tips.length)];
      state.spies.intel.push({ day: state.day, text });
      if (state.spies.intel.length > 8) state.spies.intel.shift();
      out.lines.push(`§9🕵️ ${a.name} reports: ${text}`);
    }
  }

  // Enemy agents probe; counter-spies smoke them out.
  if (agents.length > 0 && rng() < 0.12) {
    if ((state.spies.counterSpies ?? 0) > 0 && rng() < 0.7) {
      out.lines.push("§a🕵️ A rival's agent is caught copying the price book — the counter-spies feed them false figures and let them run.");
      ledgerSpy(state, "caught", {});
    } else {
      const leak = 10 + Math.floor(rng() * 20);
      state.treasury = Math.max(0, Math.round((state.treasury - leak) * 100) / 100);
      out.lines.push(`§8🕵️ A rival's spy copies the price book (₹${leak} in traced bribes). Counter-spies would end this.`);
      ledgerSpy(state, "leak", { leak });
    }
  }
  return out;
}

/** True while a raid warning stands (defense reads this). */
export function warningActive(state) {
  return state.day <= (state.spies?.raidWarningDay ?? -99);
}

function ledgerSpy(state, what, detail) {
  state.ledger.push({ day: state.day, type: "spy", what, ...detail });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
}
