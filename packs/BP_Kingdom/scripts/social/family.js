/**
 * family.js — courtship, marriage & children (M7, design §3, §25, §34).
 *
 * A chaste, consent-gated Sims-style system:
 *   crushes → courtship (affection meter in leisure hours) → MARRIAGE REQUEST
 *   → the King approves/denies → 2-day engagement → wedding festival →
 *   household (needs a house with 2 free beds) → CHILD REQUEST (food, housing
 *   & happiness thresholds) → King approves → 3-day pregnancy → birth →
 *   6-day dependency: Baby (1–2) → Toddler (3–4) → Child (5–6) → adult day 7
 *   with inherited skill bonuses (bigger with a schoolhouse).
 *
 * Singles may adopt orphans the same way. Refusals are final: punishing a
 * refusal is blocked and would crash loyalty. Population policy caps pause
 * births (requests wait in the inbox).
 */
import { LEDGER_CAP } from "../core/state.js";
import { houseFor, freeBeds } from "./housing.js";
import { spawnChild } from "../game/citizens.js";

export const ENGAGEMENT_DAYS = 2;
export const PREGNANCY_DAYS = 3;
export const ADULT_AGE_DAYS = 7;

export function nextRequestId(state) {
  return `r-${state.nextRequestId++}`;
}

/* ---------------- matchmaking ---------------- */

/** Compatibility 0–100: shared profession bonus + deterministic pairing hash. */
export function compatibility(a, b) {
  let score = 45;
  if (a.profession === b.profession) score += 15;
  const hash = (a.id + "|" + b.id).split("").reduce((s, ch) => s + ch.charCodeAt(0), 0);
  score += hash % 30;
  return Math.min(100, score);
}

/** Finds the best unpartnered adult match for a citizen (matchmaker logic). */
export function suggestMatch(state, citizenId) {
  const me = state.citizens.find((c) => c.id === citizenId && c.alive);
  if (!me || me.ageStage !== "adult" || me.spouse || me.partner) return null;
  let best = null;
  let bestScore = 0;
  for (const c of state.citizens) {
    if (!c.alive || c.ageStage !== "adult" || c.id === citizenId) continue;
    if (c.spouse || c.partner || c.role === "minister") continue;
    const score = compatibility(me, c) + ((me.affection?.[c.id] ?? 0) / 4);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best ? { citizen: best, score: Math.round(bestScore) } : null;
}

/**
 * Leisure-hours courtship: affection grows when two compatible adults spend
 * the evening near each other. At 75+ a marriage request is filed.
 */
export function tickCourtship(record, entity, state) {
  if (!record.alive || record.ageStage !== "adult") return;
  if (record.spouse || record.role === "minister") return;
  record.affection ??= {};

  // Find the nearest eligible adult within courting distance.
  let nearest = null;
  let nearestD = 7;
  for (const other of state.citizens) {
    if (!other.alive || other.ageStage !== "adult" || other.id === record.id) continue;
    if (other.spouse || other.role === "minister") continue;
    const e2 = other._entity;
    if (!e2) continue;
    const d = Math.hypot(e2.location.x - entity.location.x, e2.location.z - entity.location.z);
    if (d < nearestD) {
      nearestD = d;
      nearest = other;
    }
  }
  if (!nearest) return;
  nearest.affection ??= {};

  const gain = (compatibility(record, nearest) / 100) * 0.9 + 0.15;
  record.affection[nearest.id] = Math.min(100, (record.affection[nearest.id] ?? 0) + gain);
  nearest.affection[record.id] = Math.min(100, (nearest.affection[record.id] ?? 0) + gain);

  // Mutual devotion files a request (once).
  if (record.affection[nearest.id] >= 75 && nearest.affection[record.id] >= 75) {
    const exists = (state.familyRequests ?? []).some(
      (r) => r.type === "marriage" && r.status === "pending" &&
        ((r.a === record.id && r.b === nearest.id) || (r.a === nearest.id && r.b === record.id))
    );
    if (!exists) requestMarriage(state, record.id, nearest.id);
  }
}

/* ---------------- marriage ---------------- */

/**
 * Files a marriage request (from courtship, the matchmaker, or the King).
 * @returns {{ok:boolean,request?:object,reason?:string}}
 */
export function requestMarriage(state, aId, bId) {
  const a = state.citizens.find((c) => c.id === aId && c.alive);
  const b = state.citizens.find((c) => c.id === bId && c.alive);
  if (!a || !b) return { ok: false, reason: "Both betrothed must be living citizens." };
  if (aId === bId) return { ok: false, reason: "A citizen cannot marry themselves." };
  if (a.ageStage !== "adult" || b.ageStage !== "adult") {
    return { ok: false, reason: "Only adults may marry." };
  }
  if (a.spouse || b.spouse) return { ok: false, reason: "One of them is already married." };
  const pending = (state.familyRequests ?? []).some(
    (r) => r.type === "marriage" && r.status === "pending" &&
      (r.a === aId || r.b === aId || r.a === bId || r.b === bId)
  );
  if (pending) return { ok: false, reason: "A request for one of them is already pending." };

  const request = {
    id: nextRequestId(state),
    type: "marriage",
    a: aId, b: bId,
    aName: a.fullName, bName: b.fullName,
    compat: compatibility(a, b),
    day: state.day,
    status: "pending",
  };
  state.familyRequests.push(request);
  return { ok: true, request };
}

/** The King blesses the union → 2-day engagement (banns & feast prep). */
export function approveMarriage(state, requestId) {
  const r = (state.familyRequests ?? []).find((x) => x.id === requestId && x.status === "pending");
  if (!r || r.type !== "marriage") return { ok: false, reason: "Request not found." };
  const a = state.citizens.find((c) => c.id === r.a);
  const b = state.citizens.find((c) => c.id === r.b);
  if (!a?.alive || !b?.alive) {
    r.status = "void";
    return { ok: false, reason: "The betrothed are no longer both living." };
  }
  r.status = "engaged";
  r.weddingDay = state.day + ENGAGEMENT_DAYS;
  a.partner = b.id;
  b.partner = a.id;
  return { ok: true, request: r };
}

/** The King declines — kindly. No punishment, minor disappointment. */
export function denyMarriage(state, requestId) {
  const r = (state.familyRequests ?? []).find((x) => x.id === requestId && x.status === "pending");
  if (!r || r.type !== "marriage") return { ok: false, reason: "Request not found." };
  r.status = "denied";
  for (const id of [r.a, r.b]) {
    const c = state.citizens.find((x) => x.id === id);
    if (c) c.mood = Math.max(5, (c.mood ?? 70) - 4);
  }
  return { ok: true };
}

/* ---------------- children ---------------- */

/** Thresholds for a couple/single to request a child (design §3). */
export function childThresholds(state) {
  const alive = state.citizens.filter((c) => c.alive);
  const mood = alive.length
    ? alive.reduce((s, c) => s + (c.mood ?? 70), 0) / alive.length
    : 0;
  const bedsFree = (state.houses ?? []).reduce((s, h) => s + freeBeds(h), 0);
  return {
    foodOk: state.foodStock >= alive.length * 4,
    bedsFree,
    housingOk: bedsFree >= 1 || (state.houses ?? []).length === 0,
    moodOk: mood >= 55,
    mood: Math.round(mood),
  };
}

/**
 * Files a child/adoption request. Couple (spouses) or a single adopter.
 * @returns {{ok:boolean,request?:object,reason?:string}}
 */
export function requestChild(state, aId, bId = null) {
  const a = state.citizens.find((c) => c.id === aId && c.alive);
  const b = bId ? state.citizens.find((c) => c.id === bId && c.alive) : null;
  if (!a || a.ageStage !== "adult") return { ok: false, reason: "Requester must be a living adult." };
  if (bId && (!b || b.ageStage !== "adult")) return { ok: false, reason: "Partner must be a living adult." };
  if (b && a.spouse !== b.id) return { ok: false, reason: "Couples must be married first." };
  if (a.pregnancy || b?.pregnancy) return { ok: false, reason: "A pregnancy is already underway." };

  const t = childThresholds(state);
  if (!t.foodOk) return { ok: false, reason: "Too little food stored (need 4 rations per citizen)." };
  if (!t.moodOk) return { ok: false, reason: `The colony is too unhappy (${t.mood}% < 55%).` };

  const request = {
    id: nextRequestId(state),
    type: "child",
    a: aId, b: bId,
    aName: a.fullName, bName: b?.fullName ?? null,
    day: state.day,
    status: "pending",
  };
  state.familyRequests.push(request);
  return { ok: true, request };
}

export function approveChild(state, requestId) {
  const r = (state.familyRequests ?? []).find((x) => x.id === requestId && x.status === "pending");
  if (!r || r.type !== "child") return { ok: false, reason: "Request not found." };
  const a = state.citizens.find((c) => c.id === r.a);
  const b = r.b ? state.citizens.find((c) => c.id === r.b) : null;
  if (!a?.alive || (r.b && !b?.alive)) {
    r.status = "void";
    return { ok: false, reason: "The household is gone." };
  }
  if (!b) {
    // Single adopter: a toddler orphan joins the household at the next dawn.
    r.status = "approved-adopt";
    return { ok: true, request: r };
  }
  // Couples: the mother carries (the female partner when there is one).
  const mother = [a, b].find((c) => c.sex === "f") ?? b;
  const father = mother === a ? b : a;
  r.status = "approved";
  mother.pregnancy = { day: 0, fatherId: father.id, motherId: mother.id };
  return { ok: true, request: r };
}

export function denyChild(state, requestId) {
  const r = (state.familyRequests ?? []).find((x) => x.id === requestId && x.status === "pending");
  if (!r || r.type !== "child") return { ok: false, reason: "Request not found." };
  r.status = "denied";
  const c = state.citizens.find((x) => x.id === r.a);
  if (c) c.mood = Math.max(5, (c.mood ?? 70) - 3);
  return { ok: true };
}

/* ---------------- daily tick ---------------- */

/**
 * Engagements → weddings, pregnancies → births, children → adults.
 * Runs inside the Day Roll before wages so newborns never draw pay.
 * @returns {{weddings:string[],births:string[],adulted:string[],lines:string[]}}
 */
export function tickFamily(state, dim) {
  const out = { weddings: [], births: [], adulted: [], lines: [] };
  const atCap =
    state.populationPolicy.mode === "fixed" &&
    state.citizens.filter((c) => c.alive).length >= state.populationPolicy.cap;

  // Weddings due.
  for (const r of state.familyRequests ?? []) {
    if (r.type !== "marriage" || r.status !== "engaged") continue;
    if (state.day < (r.weddingDay ?? Infinity)) continue;
    const a = state.citizens.find((c) => c.id === r.a);
    const b = state.citizens.find((c) => c.id === r.b);
    if (!a?.alive || !b?.alive) {
      r.status = "void";
      continue;
    }
    // The couple needs a roof: newlyweds take priority in the roomiest
    // house (even if it overcrowds — the strain shows in mood).
    const roof = [...(state.houses ?? [])].sort((a, b) => freeBeds(b) - freeBeds(a))[0];
    r.status = "wed";
    a.spouse = b.id;
    b.spouse = a.id;
    a.partner = null;
    b.partner = null;
    a.mood = Math.min(100, (a.mood ?? 70) + 15);
    b.mood = Math.min(100, (b.mood ?? 70) + 15);
    for (const c of state.citizens) {
      if (c.alive && c.id !== a.id && c.id !== b.id) c.mood = Math.min(100, (c.mood ?? 70) + 3);
    }
    if (roof) {
      for (const c of [a, b]) {
        const old = houseFor(state, c.id);
        if (old) old.residents = old.residents.filter((id) => id !== c.id);
        if (!roof.residents.includes(c.id)) roof.residents.push(c.id);
        c.home = roof.id;
      }
    }
    // Wedding feast from the treasury (festival joy, §26 flavor).
    const feast = Math.min(10, Math.max(0, state.treasury));
    state.treasury = Math.round((state.treasury - feast) * 100) / 100;
    state.dailyStats.welfare = Math.round(((state.dailyStats.welfare ?? 0) + feast) * 100) / 100;
    out.weddings.push(`${a.fullName} ♥ ${b.fullName}`);
    state.ledger.push({ day: state.day, type: "wedding", a: a.fullName, b: b.fullName, feast });
    if (state.ledger.length > LEDGER_CAP) {
      state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
    }
  }

  // Adoptions arrive as toddlers (paused at a fixed population cap).
  for (const r of state.familyRequests ?? []) {
    if (r.type !== "child" || r.status !== "approved-adopt") continue;
    if (atCap) continue;
    const guardian = state.citizens.find((c) => c.id === r.a);
    if (!guardian?.alive) {
      r.status = "void";
      continue;
    }
    r.status = "done";
    const adoptee = spawnChild(state, dim, guardian, null, { stage: "toddler", ageDays: 3 });
    if (adoptee) {
      out.births.push(`adopted ${adoptee.fullName}`);
      state.ledger.push({ day: state.day, type: "birth", name: adoptee.fullName, mother: guardian.fullName });
      if (state.ledger.length > LEDGER_CAP) {
        state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
      }
    }
  }

  // Pregnancies advance (paused at a fixed population cap).
  for (const c of state.citizens) {
    if (!c.alive || !c.pregnancy) continue;
    if (atCap) continue;
    c.pregnancy.day++;
    if (c.pregnancy.day >= PREGNANCY_DAYS) {
      const fatherId = c.pregnancy.fatherId;
      c.pregnancy = null;
      const father = fatherId ? state.citizens.find((x) => x.id === fatherId) : null;
      const baby = spawnChild(state, dim, c, father ?? null);
      if (baby) {
        out.births.push(baby.fullName);
        state.ledger.push({ day: state.day, type: "birth", name: baby.fullName, mother: c.fullName });
        if (state.ledger.length > LEDGER_CAP) {
          state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
        }
      }
    }
  }

  // Aging: Baby 1–2 → Toddler 3–4 → Child 5–6 → adult on day 7.
  const schooled = (state.buildings ?? []).some((b) => b.buildingId === "school");
  for (const c of state.citizens) {
    if (!c.alive || c.ageStage === "adult") continue;
    c.ageDays = (c.ageDays ?? 0) + 1;
    c.ageStage = stageFor(c.ageDays);
    if (c.ageStage === "adult") {
      c.profession = "laborer";
      c.wage = 5;
      c.wageMode = "crown";
      c.mode = "following"; // the King presents the new adult with work
      c.xp = schooled ? 60 : 15; // school + inherited skill bonus
      c.mood = Math.min(100, (c.mood ?? 70) + 5);
      out.adulted.push(c.fullName);
    }
  }

  if (out.weddings.length) out.lines.push(`§d💒 Wedding${out.weddings.length > 1 ? "s" : ""}: ${out.weddings.join("; ")}`);
  if (out.births.length) out.lines.push(`§a🍼 Newborn${out.births.length > 1 ? "s" : ""}: ${out.births.join(", ")}`);
  if (out.adulted.length) out.lines.push(`§e🎓 Came of age: ${out.adulted.join(", ")} (seeking work)`);
  if (atCap) {
    const waiting = state.citizens.filter((c) => c.alive && c.pregnancy).length;
    if (waiting > 0) out.lines.push(`§7🏠 ${waiting} birth(s) wait on the population cap.`);
  }
  return out;
}

export function stageFor(ageDays) {
  if (ageDays <= 2) return "baby";
  if (ageDays <= 4) return "toddler";
  if (ageDays <= 6) return "child";
  return "adult";
}

/** Pending inbox for the King (marriage + child requests). */
export function pendingRequests(state) {
  return (state.familyRequests ?? []).filter((r) => r.status === "pending");
}
