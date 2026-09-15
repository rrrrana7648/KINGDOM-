/**
 * workforce.js — workload math & auto-hiring (M13, §33).
 *
 * The Minister converts every open decree and site into required
 * work-hours vs mustered capacity. Past 100% the board cries for hands;
 * with auto-hire armed (within the King's budget), willing laborers walk
 * in off the road — otherwise the shortfall arrives as a decision.
 */
import { LEDGER_CAP } from "../core/state.js";

/** Workload %: open labor demand vs living adult capacity. */
export function workloadPct(state) {
  let demand = 0;
  for (const d of state.decrees ?? []) {
    if (d.status !== "active") continue;
    demand += d.kind === "build" ? 30 : d.kind === "recruit" ? 10 : d.kind === "stockpile" ? 20 : 5;
  }
  for (const s of state.sites ?? []) {
    if (s.status !== "active") continue;
    demand += Math.max(0, (s.laborNeeded ?? 0) - (s.laborDone ?? 0)) * 10;
  }
  const crew = state.citizens.filter((c) =>
    c.alive && c.ageStage === "adult" && c.mode === "living" && !c.retired &&
    ["builder", "laborer", "woodcutter", "farmer"].includes(c.profession)).length;
  const capacity = Math.max(1, crew * 20);
  return Math.round((demand / capacity) * 100);
}

/** Hands short at current capacity (rough laborers). */
export function handsShort(state) {
  const pct = workloadPct(state);
  if (pct <= 100) return 0;
  const crew = state.citizens.filter((c) =>
    c.alive && c.ageStage === "adult" && c.mode === "living" && !c.retired).length;
  return Math.max(1, Math.ceil(((pct - 100) / 100) * Math.max(1, crew) * 0.5));
}

/** Hires a willing laborer off the road (₹5 fee + first wage). */
export function hireHand(state, dim) {
  const fee = 5;
  if (state.treasury < fee + 5) return { ok: false, reason: "The purse is too light to hire." };
  // Reuse the migrant spawner through a lazy dynamic import wall: instead,
  // hire from the willing pool — spawn via migration's room logic is the
  // caller's job; here we register the intent and pay the fee.
  state.treasury = Math.round((state.treasury - fee) * 100) / 100;
  state.dailyStats.missions = Math.round(((state.dailyStats.missions ?? 0) + fee) * 100) / 100;
  return { ok: true, fee };
}

/**
 * Daily tick: auto-hire within budget, or cry the shortfall.
 * @returns {{lines:string[],hired:number}}
 */
export function tickWorkforce(state, spawnFn) {
  const out = { lines: [], hired: 0 };
  // M13: queued arrivals first (decisions, rescues) — already paid for.
  const queued = state.workforce?.pendingHires ?? 0;
  if (queued > 0 && spawnFn) {
    let arrived = 0;
    for (let i = 0; i < queued; i++) {
      try {
        spawnFn(state);
        arrived++;
      } catch { break; }
    }
    state.workforce.pendingHires = queued - arrived;
    out.hired += arrived;
    if (arrived > 0) out.lines.push(`§a🧭 ${arrived} hired soul${arrived > 1 ? "s report" : " reports"} for duty.`);
  }
  const short = handsShort(state);
  if (short <= 0) return out;
  const wf = state.workforce ?? {};
  if (!wf.autoHire) {
    if ((state.pendingDecisions ?? []).length < 3 &&
        !(state.pendingDecisions ?? []).some((d) => d.eventId === "workforce")) {
      state.pendingDecisions.push({
        id: `x-${state.nextDecisionId++}`,
        eventId: "workforce",
        title: "🙋 Hands wanted",
        body: `Workload ${workloadPct(state)}% — the foremen beg ${short} more laborer${short > 1 ? "s" : ""} (₹5 fee each). Hire, or let the deadlines slip?`,
        options: [
          { id: "hire", label: `Hire ${short} (₹${short * 5})`, desc: "Willing hands off the road" },
          { id: "wait", label: "Let it slip", desc: "Deadlines may fail" },
        ],
        data: { short },
        day: state.day,
        expiryDay: state.day + 2,
      });
      out.lines.push(`§6🙋 Workload ${workloadPct(state)}% — the King must rule on hiring (Audiences).`);
    }
    return out;
  }
  // Auto-hire within the King's budget.
  let budget = Math.min(wf.budget ?? 50, state.treasury);
  let hired = 0;
  for (let i = 0; i < short && budget >= 5; i++) {
    const pay = hireHand(state, null);
    if (!pay.ok) break;
    budget -= 5;
    if (spawnFn) {
      try {
        spawnFn(state);
        hired++;
      } catch { break; }
    } else {
      hired++;
    }
  }
  out.hired = hired;
  if (hired > 0) {
    out.lines.push(`§a🙋 Auto-hired ${hired} willing laborer${hired > 1 ? "s" : ""} off the road (₹${hired * 5}).`);
    state.ledger.push({ day: state.day, type: "workforce", what: "hire", hired });
    if (state.ledger.length > LEDGER_CAP) {
      state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
    }
  }
  return out;
}
