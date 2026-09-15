/**
 * crime.js — the underworld, corruption & detection (M9, design §6.2, §10).
 *
 * Crime pressure rises with poverty, idleness, punishing taxes and gloom,
 * and falls with constables on patrol, fair wages and full bellies. Each
 * dawn the engine may fire incidents (theft, smuggling, bribery, assault);
 * licensed buyers and clerks face their own honesty checks (skimming and
 * short weights) which sharp-eyed inspectors audit. Cases gather evidence
 * until they are ready for the Magistrate's court (see courts.js).
 *
 * Pipeline: rumored → (evidence ≥ 60) trial → sentenced | acquitted.
 * Fled suspects become fugitives with bounties on their heads.
 */
import { LEDGER_CAP } from "../core/state.js";

export const CRIME_TYPES = {
  theft: { name: "Warehouse theft", icon: "🌑", severity: 1 },
  smuggling: { name: "Smuggling", icon: "🚬", severity: 2 },
  embezzle: { name: "Embezzlement", icon: "🪙", severity: 3 },
  counterfeit: { name: "Counterfeiting", icon: "💵", severity: 3 },
  bribery: { name: "Bribery", icon: "🤝", severity: 2 },
  assault: { name: "Assault", icon: "🥊", severity: 2 },
};

export function nextCaseId(state) {
  return `k-${state.nextCaseId++}`;
}

/** Constables on duty: living guards + active militia + half inspectors. */
export function constablePower(state) {
  let power = 0;
  for (const c of state.citizens) {
    if (!c.alive || c.ageStage !== "adult" || c.mode !== "living") continue;
    if (c.profession === "guard" || c.profession === "soldier") power += 1;
    else if (c.profession === "inspector") power += 0.5;
  }
  const militia = state.security?.militia;
  if (militia && state.day <= militia.untilDay) power += militia.count * 0.6;
  return power;
}

export function inspectorCount(state) {
  return state.citizens.filter(
    (c) => c.alive && c.ageStage === "adult" && c.mode === "living" && c.profession === "inspector"
  ).length;
}

/** 0..1 pressure: poverty, idleness, taxes, gloom minus policing. */
export function crimePressure(state) {
  const adults = state.citizens.filter((c) => c.alive && c.ageStage === "adult");
  if (!adults.length) return 0;
  const avgSavings = adults.reduce((s, c) => s + (c.savings ?? 0), 0) / adults.length;
  const mood = adults.reduce((s, c) => s + (c.mood ?? 70), 0) / adults.length;
  const idle = adults.filter((c) => c.mode !== "living" && c.role !== "minister").length / adults.length;
  const taxBite = ((state.tax?.incomePct ?? 10) + (state.tax?.salesPct ?? 8)) / 100;
  let p = 0.08;
  if (avgSavings < 5) p += 0.18;
  else if (avgSavings < 15) p += 0.08;
  if (mood < 40) p += 0.16;
  else if (mood < 55) p += 0.07;
  p += idle * 0.12;
  p += Math.max(0, taxBite - 0.18) * 0.9; // punishing taxes push trade underground
  if ((state.houses ?? []).length > 0) {
    const homeless = adults.filter((c) => !c.home).length / adults.length;
    p += homeless * 0.1;
  }
  p -= constablePower(state) * 0.03;
  return Math.max(0.01, Math.min(0.65, p));
}

function pickSuspect(state, rng) {
  const pool = state.citizens.filter(
    (c) => c.alive && c.ageStage === "adult" && c.role !== "minister" && !c.fugitive && c.status !== "prisoner"
  );
  if (!pool.length) return null;
  // The dishonest drift toward trouble (weighted draw).
  const weights = pool.map((c) => 1 + Math.max(0, 70 - (c.honesty ?? 60)) / 12);
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function ledgerCrime(state, what, detail) {
  state.ledger.push({ day: state.day, type: "crime", what, ...detail });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
}

/**
 * Files a case (incident). Applies the immediate damage, schedules the
 * investigation. Exported so raids, audits and events can charge citizens.
 */
export function fileCase(state, type, suspect, opts = {}) {
  const def = CRIME_TYPES[type] ?? CRIME_TYPES.theft;
  const kase = {
    id: nextCaseId(state),
    type,
    name: def.name,
    suspectId: suspect?.id ?? null,
    suspect: suspect?.fullName ?? " persons unknown",
    evidence: Math.round((opts.evidence ?? 25) * 10) / 10,
    day: state.day,
    status: "rumored", // rumored | trial | closed
    detail: opts.detail ?? "",
    amount: opts.amount ?? 0,
  };
  if (kase.evidence >= 60) kase.status = "trial";
  state.security.cases.push(kase);
  return kase;
}

/**
 * Daily underworld tick: new incidents, corruption audits, investigations.
 * @returns {{lines:string[],cases:number}}
 */
export function tickCrime(state, rng = Math.random) {
  const out = { lines: [], cases: 0 };
  const pressure = crimePressure(state);

  // Fresh street crime (up to 2 scenes a dawn).
  const scenes = rng() < pressure ? (rng() < pressure / 2 ? 2 : 1) : 0;
  for (let i = 0; i < scenes; i++) {
    const suspect = pickSuspect(state, rng);
    if (!suspect) break;
    const roll = rng();
    const type = roll < 0.4 ? "theft" : roll < 0.6 ? "smuggling" : roll < 0.75 ? "assault" : "bribery";
    const kase = fileCase(state, type, suspect, {
      evidence: 20 + rng() * 30,
      detail: "",
      amount: 0,
    });
    out.cases++;
    if (type === "theft") {
      const loot = Math.min(30 + Math.floor(rng() * 40), Math.max(0, Math.floor(state.treasury * 0.05)));
      kase.amount = loot;
      kase.detail = `₹${loot} in stores vanished`;
      state.treasury = Math.round((state.treasury - loot) * 100) / 100;
      out.lines.push(`§8🌑 Warehouse theft! ₹${loot} in stores vanished — ${suspect.fullName} is whispered of.`);
    } else if (type === "smuggling") {
      const duty = Math.round((5 + rng() * 15) * 100) / 100;
      kase.amount = duty;
      kase.detail = `duties evaded ≈ ₹${duty}`;
      out.lines.push(`§8🚬 Night boats at the creek — smuggling (duties evaded ≈ ₹${duty}). ${suspect.fullName} was seen.`);
    } else if (type === "assault") {
      suspect.mood = Math.max(5, (suspect.mood ?? 70) - 4);
      kase.detail = "a tavern brawl turned bloody";
      out.lines.push(`§8🥊 A tavern brawl turned bloody — ${suspect.fullName} threw the first stool.`);
    } else {
      kase.detail = "a clerk was offered coin to look away";
      kase.evidence = Math.min(95, kase.evidence + 10);
      out.lines.push(`§8🤝 A clerk was offered coin to look away — ${suspect.fullName} is named.`);
    }
    ledgerCrime(state, "filed", { crime: kase.name, suspect: suspect.fullName });
  }

  // Licensed-buyer honesty: skimming & short weights vs the inspectors.
  const audit = inspectorCount(state) * 0.15 + constablePower(state) * 0.02;
  for (const b of state.buyers ?? []) {
    if (!b.active) continue;
    const clerk = state.citizens.find((c) => c.id === b.citizenId && c.alive);
    if (!clerk) continue;
    const fairness = (clerk.savings ?? 0) >= clerk.wage * 2 ? 0 : 0.12; // hungry clerks stray
    const temptation = Math.max(0, 0.22 - (clerk.honesty ?? 60) / 400 - audit + fairness);
    if (rng() < temptation && b.float > 5) {
      const skim = Math.round(Math.min(b.float * 0.12, 8 + rng() * 10) * 100) / 100;
      b.float = Math.round((b.float - skim) * 100) / 100;
      clerk.savings = Math.round(((clerk.savings ?? 0) + skim) * 100) / 100;
      const kase = fileCase(state, "embezzle", clerk, {
        evidence: 25 + audit * 120 + rng() * 15,
        detail: `skimmed ₹${skim} from the ${b.commodity} float`,
        amount: skim,
      });
      out.cases++;
      out.lines.push(
        kase.status === "trial"
          ? `§8🪙 The auditors catch ${clerk.fullName} red-handed — ₹${skim} skimmed from the ${b.commodity} float. Trial ready.`
          : `§8🪙 The ${b.commodity} float is light by ₹${skim}… ${clerk.fullName} sweats.`
      );
      ledgerCrime(state, "embezzle", { clerk: clerk.fullName, skim });
    }
  }

  // Counterfeiting rings love a busy press.
  const printed = state.mint?.batchesPrinted ?? 0;
  if (printed >= 4 && rng() < 0.1 + printed * 0.01) {
    const suspect = pickSuspect(state, rng);
    if (suspect) {
      const kase = fileCase(state, "counterfeit", suspect, {
        evidence: 30 + rng() * 25,
        detail: "forged notes in the bazaar",
      });
      out.cases++;
      out.lines.push(`§8💵 Forged notes in the bazaar! ${suspect.fullName} is suspected of counterfeiting.`);
      ledgerCrime(state, "filed", { crime: "Counterfeiting", suspect: suspect.fullName });
    }
  }

  // Investigations grind forward under guard & inspector work.
  const sleuths = constablePower(state);
  for (const kase of state.security.cases) {
    if (kase.status !== "rumored") continue;
    const gain = sleuths * (2 + rng() * 4) + (inspectorCount(state) > 0 ? 6 : 0);
    kase.evidence = Math.min(100, Math.round((kase.evidence + gain) * 10) / 10);
    if (kase.evidence >= 60) {
      kase.status = "trial";
      out.lines.push(`§6⚖️ ${kase.name} against ${kase.suspect} is ready for trial (evidence ${Math.round(kase.evidence)}%).`);
    }
  }

  // Untreated trial-ready cases rot: suspects flee after 3 dawns.
  for (const kase of state.security.cases) {
    if (kase.status !== "trial") continue;
    if (state.day - kase.day < 4) continue;
    const suspect = state.citizens.find((c) => c.id === kase.suspectId && c.alive);
    if (suspect && !suspect.fugitive) {
      suspect.fugitive = true;
      state.security.fugitives.push(suspect.id);
      kase.status = "closed";
      kase.verdict = "fled";
      out.lines.push(`§c🥷 ${suspect.fullName} fled justice! Post a bounty to see them taken.`);
      ledgerCrime(state, "fled", { suspect: suspect.fullName });
    } else {
      kase.status = "closed";
      kase.verdict = "cold";
    }
  }

  // Bounty hunters drag fugitives back (better odds with constables).
  const hunters = [...(state.security.bounties ?? [])];
  for (const bounty of hunters) {
    const fugitive = state.citizens.find((c) => c.id === bounty.citizenId && c.alive);
    if (!fugitive) {
      dropBounty(state, bounty.citizenId);
      continue;
    }
    const odds = 0.25 + sleuths * 0.08 + Math.min(0.3, bounty.amount / 300);
    if (rng() < odds) {
      fugitive.fugitive = false;
      state.security.fugitives = state.security.fugitives.filter((id) => id !== fugitive.id);
      dropBounty(state, bounty.citizenId);
      const paid = Math.min(bounty.amount, Math.max(0, state.treasury));
      state.treasury = Math.round((state.treasury - paid) * 100) / 100;
      state.dailyStats.security = Math.round(((state.dailyStats.security ?? 0) + paid) * 100) / 100;
      const kase = fileCase(state, "theft", fugitive, {
        evidence: 85,
        detail: `recaptured under bounty (₹${paid} paid)`,
      });
      kase.type = "assault"; // resisting capture counts as assault on the watch
      kase.name = CRIME_TYPES.assault.name;
      out.lines.push(`§a⚖️ Bounty hunters drag ${fugitive.fullName} back in chains (₹${paid}). Trial ready.`);
      ledgerCrime(state, "recaptured", { suspect: fugitive.fullName, paid });
    }
  }
  return out;
}

function dropBounty(state, citizenId) {
  state.security.bounties = (state.security.bounties ?? []).filter((b) => b.citizenId !== citizenId);
}

/** Posts a bounty on a fugitive. @returns {{ok,reason?}} */
export function postBounty(state, citizenId, amount) {
  const fugitive = state.citizens.find((c) => c.id === citizenId && c.alive);
  if (!fugitive || !fugitive.fugitive) return { ok: false, reason: "They are not a fugitive." };
  amount = Math.round(amount * 100) / 100;
  if (!(amount > 0)) return { ok: false, reason: "Name a positive bounty." };
  const existing = (state.security.bounties ?? []).find((b) => b.citizenId === citizenId);
  if (existing) existing.amount = Math.round((existing.amount + amount) * 100) / 100;
  else state.security.bounties.push({ citizenId, amount, day: state.day });
  ledgerCrime(state, "bounty", { suspect: fugitive.fullName, amount });
  return { ok: true };
}

/** Open trial-ready cases for the Magistrate's docket. */
export function trialReady(state) {
  return (state.security?.cases ?? []).filter((k) => k.status === "trial");
}
