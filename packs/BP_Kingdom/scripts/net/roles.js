/**
 * roles.js — the King's officers: co-op governance (M11, design §38).
 *
 * The first player to raise the Scepter claims the Crown. The Crown may
 * commission four officers by gamertag — Chamberlain (hearth & honors),
 * Treasurer (coin), Magistrate (justice) and Marshal (the sword) — who may
 * then execute their writ even when the Crown is away. The Crown's word
 * overrides all; officers may be dismissed at pleasure.
 *
 * Single-player stays frictionless: while no officers are commissioned,
 * every player at the console may act freely. Gating bites only in a
 * shared realm with officers appointed.
 */

export const OFFICER_ROLES = {
  chamberlain: { name: "Chamberlain", icon: "🕯️", writ: "Hearth, honors, decrees & festivals" },
  treasurer: { name: "Treasurer", icon: "💰", writ: "Treasury, budget, taxes, bank & mint" },
  magistrate: { name: "Magistrate", icon: "⚖️", writ: "Courts, sentences, bounties & pardons" },
  marshal: { name: "Marshal", icon: "🛡️", writ: "Guards, militia, inspectors & defense" },
};

/** Gated writ → officer roles allowed (Crown always allowed). */
export const GATES = {
  judge: ["magistrate"],      // sentences & acquittals
  bounty: ["magistrate"],     // posting bounties
  laws: ["magistrate"],       // editing the tariff
  muster: ["marshal"],        // conscription
  military: ["marshal"],      // posting/recalling guards & inspectors
  spend: ["treasurer"],       // grants, loans, mint, budget shares
  rates: ["treasurer"],       // taxes, wages, rations
  decree: ["chamberlain"],    // decrees, festivals, marriages
  officers: ["crown"],        // commissioning (Crown only, always)
};

export function ensureOfficers(state) {
  state.officers = state.officers ?? {};
  state.officers.crown = state.officers.crown ?? null;
  for (const role of Object.keys(OFFICER_ROLES)) {
    state.officers[role] = state.officers[role] ?? null;
  }
  return state.officers;
}

/** First scepter raised claims the Crown. Idempotent. */
export function claimCrown(state, gamertag) {
  ensureOfficers(state);
  if (!state.officers.crown) {
    state.officers.crown = gamertag;
    return { ok: true, crown: gamertag, claimed: true };
  }
  return { ok: true, crown: state.officers.crown, claimed: false };
}

export function roleOf(state, gamertag) {
  ensureOfficers(state);
  if (!gamertag) return null;
  const low = String(gamertag).toLowerCase();
  if (state.officers.crown && String(state.officers.crown).toLowerCase() === low) return "crown";
  for (const [role, holder] of Object.entries(state.officers)) {
    if (role === "crown" || !holder) continue;
    if (String(holder).toLowerCase() === low) return role;
  }
  return null;
}

export function anyOfficers(state) {
  ensureOfficers(state);
  return Object.keys(OFFICER_ROLES).some((r) => state.officers[r]);
}

/**
 * Permission check for a gated writ.
 * Crown always passes; open realm (no officers) passes all.
 */
export function require(state, gamertag, action) {
  ensureOfficers(state);
  const gate = GATES[action];
  if (!gate) return { ok: true };
  const role = roleOf(state, gamertag);
  if (role === "crown") return { ok: true };
  if (!anyOfficers(state)) return { ok: true }; // solo / unclaimed realm
  if (gate.includes(role)) return { ok: true };
  const titles = gate.map((r) => (r === "crown" ? "the Crown" : `the ${OFFICER_ROLES[r].name}`)).join(" or ");
  return { ok: false, reason: `That writ belongs to ${titles}.` };
}

/** Crown commissions an officer. */
export function grantOfficer(state, byGamertag, role, gamertag) {
  ensureOfficers(state);
  if (roleOf(state, byGamertag) !== "crown") return { ok: false, reason: "Only the Crown commissions officers." };
  if (!OFFICER_ROLES[role]) return { ok: false, reason: "No such office." };
  if (!gamertag || !String(gamertag).trim()) return { ok: false, reason: "Name the officer." };
  if (roleOf(state, gamertag) === "crown") return { ok: false, reason: "The Crown needs no commission." };
  state.officers[role] = String(gamertag).trim();
  return { ok: true };
}

/** Crown dismisses an officer. */
export function revokeOfficer(state, byGamertag, role) {
  ensureOfficers(state);
  if (roleOf(state, byGamertag) !== "crown") return { ok: false, reason: "Only the Crown dismisses officers." };
  if (!OFFICER_ROLES[role]) return { ok: false, reason: "No such office." };
  state.officers[role] = null;
  return { ok: true };
}

/** Crown abdicates to a named successor (or vacates the throne). */
export function abdicate(state, byGamertag, toGamertag = null) {
  ensureOfficers(state);
  if (roleOf(state, byGamertag) !== "crown") return { ok: false, reason: "Only the Crown abdicates." };
  state.officers.crown = toGamertag && String(toGamertag).trim() ? String(toGamertag).trim() : null;
  return { ok: true };
}

export function officerList(state) {
  ensureOfficers(state);
  return {
    crown: state.officers.crown,
    officers: Object.fromEntries(Object.keys(OFFICER_ROLES).map((r) => [r, state.officers[r]])),
  };
}
