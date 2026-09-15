/**
 * hearth.js — friendships, pets, dowries, mourning & nannies (M13, §37.96–105).
 *
 * Beneath the ledgers, the town lives: friendships ripen and feuds flare,
 * households adopt camp dogs, weddings cost both families sweet coin, the
 * widowed mourn two days at home, and creches free working mothers.
 */
import { LEDGER_CAP } from "../core/state.js";

const PETS = ["camp dog 🐕", "mouser cat 🐈", "messenger falcon 🦅", "parrot 🦜", "goat 🐐"];

function bond(a, id) {
  a.friends = a.friends ?? {};
  return a.friends[id] ?? 0;
}
function nudge(a, id, d) {
  a.friends = a.friends ?? {};
  a.friends[id] = Math.max(-100, Math.min(100, (a.friends[id] ?? 0) + d));
}

/**
 * Daily hearth tick: one vignette at most, plus quiet bookkeeping.
 * @returns {{lines:string[]}}
 */
export function tickHearth(state, rng = Math.random) {
  const out = { lines: [] };
  const alive = state.citizens.filter((c) => c.alive && c.ageStage === "adult");

  // Mourning counts down (schedule keeps mourners home).
  for (const c of state.citizens) {
    if (c.alive && (c.mourning ?? 0) > 0) c.mourning--;
  }

  // Widowhood begins mourning + funeral rites (unburied horror if broke).
  for (const c of alive) {
    if (c._mourned) continue;
    if (c.spouse === null && c._wasWed) {
      c._mourned = true;
      c.mourning = 2;
      if (state.treasury >= 5) {
        state.treasury = Math.round((state.treasury - 5) * 100) / 100;
        state.dailyStats.welfare = Math.round(((state.dailyStats.welfare ?? 0) + 5) * 100) / 100;
        out.lines.push(`§8⚱️ Funeral rites for ${c.fullName}'s beloved (₹5). Two days of mourning leave.`);
      } else {
        c.mood = Math.max(5, (c.mood ?? 70) - 10);
        out.lines.push(`§8⚱️ ${c.fullName} buries their beloved in a pauper's shroud — the town shudders.`);
      }
      ledgerHearth(state, "funeral", { name: c.fullName });
    }
    if (c.spouse) c._wasWed = true;
  }

  if (alive.length < 2 || rng() > 0.4) return out;
  const a = alive[Math.floor(rng() * alive.length)];
  let b = alive[Math.floor(rng() * alive.length)];
  if (b.id === a.id) b = alive[(alive.indexOf(a) + 1) % alive.length];
  const roll = rng();
  const warmth = bond(a, b.id);

  if (roll < 0.4) {
    // Friendship ripens.
    nudge(a, b.id, 10);
    nudge(b, a.id, 10);
    a.mood = Math.min(100, (a.mood ?? 70) + 3);
    b.mood = Math.min(100, (b.mood ?? 70) + 3);
    a.needs.leisure = Math.min(100, (a.needs?.leisure ?? 70) + 10);
    if (warmth >= 40) {
      out.lines.push(`§d🤝 ${a.fullName.split(" ")[0]} & ${b.fullName.split(" ")[0]} are sworn friends now — the tavern toasts them.`);
    } else {
      out.lines.push(`§d🤝 ${a.fullName.split(" ")[0]} & ${b.fullName.split(" ")[0]} share a laugh at the fountain.`);
    }
  } else if (roll < 0.6) {
    // A quarrel flares.
    nudge(a, b.id, -25);
    nudge(b, a.id, -25);
    a.mood = Math.max(5, (a.mood ?? 70) - 4);
    b.mood = Math.max(5, (b.mood ?? 70) - 4);
    out.lines.push(`§6😾 ${a.fullName.split(" ")[0]} & ${b.fullName.split(" ")[0]} quarrel over a borrowed kettle — doors slam.`);
  } else if (roll < 0.7 && warmth < 0) {
    // Old enemies patch it.
    nudge(a, b.id, 40);
    nudge(b, a.id, 40);
    a.mood = Math.min(100, (a.mood ?? 70) + 4);
    b.mood = Math.min(100, (b.mood ?? 70) + 4);
    out.lines.push(`§a🕊️ ${a.fullName.split(" ")[0]} & ${b.fullName.split(" ")[0]} patch their quarrel over sweet tea.`);
  } else if (roll < 0.85) {
    // A pet joins a household.
    const petless = alive.filter((c) => !c.pet);
    if (petless.length) {
      const owner = petless[Math.floor(rng() * petless.length)];
      owner.pet = PETS[Math.floor(rng() * PETS.length)];
      owner.mood = Math.min(100, (owner.mood ?? 70) + 4);
      out.lines.push(`§a🐾 ${owner.fullName.split(" ")[0]} adopts a ${owner.pet}! The house is happier.`);
    }
  } else {
    // Pet sadness (rare, only if pets exist).
    const petted = alive.filter((c) => c.pet);
    if (petted.length && rng() < 0.25) {
      const owner = petted[Math.floor(rng() * petted.length)];
      out.lines.push(`§7🌈 ${owner.fullName.split(" ")[0]}'s ${owner.pet} passed quietly. The house grieves a day.`);
      owner.pet = null;
      owner.mood = Math.max(5, (owner.mood ?? 70) - 6);
    }
  }
  return out;
}

/**
 * Wedding-gift custom: both families contribute (called by dayroll with the
 * family tick's weddings). Poor families feel the strain.
 */
export function weddingGifts(state, weddings) {
  const lines = [];
  for (const name of weddings ?? []) {
    const c = state.citizens.find((x) => x.alive && x.fullName === name);
    if (!c || !c.spouse) continue;
    const partner = state.citizens.find((x) => x.id === c.spouse);
    for (const giver of [c, partner]) {
      if (!giver) continue;
      if ((giver.savings ?? 0) >= 10) {
        giver.savings = Math.round((giver.savings - 10) * 100) / 100;
      } else {
        giver.mood = Math.max(5, (giver.mood ?? 70) - 4);
        lines.push(`§7💝 ${giver.fullName.split(" ")[0]} frets — the wedding gifts strain an empty purse.`);
      }
    }
  }
  return lines;
}

/** Creche comfort for working mothers (dayroll mood stage reads this). */
export function crecheComfort(state) {
  return (state.buildings ?? []).some((b) => b.buildingId === "creche") ? 3 : 0;
}

function ledgerHearth(state, what, detail) {
  state.ledger.push({ day: state.day, type: "hearth", what, ...detail });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
}
