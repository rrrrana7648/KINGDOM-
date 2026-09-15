/**
 * decrees.js — royal edicts with deadlines & budgets (M6, design §4).
 *
 *   "Build a warehouse in 7 days" · "Recruit 10 workers" ·
 *   "Double the war tax for 2 weeks" · "Prepare defenses"
 *
 * Every decree names a minister/manager, a deadline in days and a budget held
 * in escrow from the treasury. Managers hire, draw materials and report;
 * early finish pays bonus wages + happiness, missed deadlines sour the mood,
 * and repeat failure starts the Minister recall drumbeat. The King sets an
 * auto-approve budget for hands-off ruling (design §33).
 *
 * Kinds: build | recruit | produce | tax | custom
 */
import { LEDGER_CAP } from "../core/state.js";
import { startSite } from "../build/construction.js";
import { launchMission } from "../world/migration.js";
import { applyPreset } from "../economy/tax.js";

export const DECREE_KINDS = {
  build: { name: "Construct", icon: "🏗" },
  recruit: { name: "Recruit", icon: "📯" },
  produce: { name: "Stockpile", icon: "📦" },
  tax: { name: "Tax edict", icon: "💰" },
  custom: { name: "Custom", icon: "📜" },
};

export function nextDecreeId(state) {
  return `d-${state.nextDecreeId++}`;
}

/**
 * Issues a decree. Budget moves from the treasury into escrow immediately.
 * @param {object} opts {kind,title,budget,deadlineDays,payload,manager}
 * @returns {{ok:boolean,decree?:object,reason?:string}}
 */
export function createDecree(state, opts) {
  const kind = DECREE_KINDS[opts.kind] ? opts.kind : "custom";
  const budget = Math.max(0, Math.round((opts.budget ?? 0) * 100) / 100);
  const deadlineDays = Math.max(1, Math.min(60, opts.deadlineDays ?? 7));
  if (budget > state.treasury) {
    return { ok: false, reason: `Treasury holds only ₹${Math.round(state.treasury)}.` };
  }
  state.treasury = Math.round((state.treasury - budget) * 100) / 100;
  const decree = {
    id: nextDecreeId(state),
    kind,
    title: opts.title ?? `${DECREE_KINDS[kind].name} decree`,
    manager: opts.manager ?? "minister",
    budget,
    escrow: budget,
    deadlineDay: state.day + deadlineDays,
    daysLeft: deadlineDays,
    payload: opts.payload ?? {},
    progress: 0, // 0..100
    status: "active", // active | done | failed | cancelled
    issuedDay: state.day,
    reports: [],
  };
  state.decrees.push(decree);

  // Kind-specific kickoff.
  if (kind === "build" && decree.payload.buildingId && decree.payload.loc) {
    const res = startSite(state, decree.payload.buildingId, decree.payload.loc, {
      level: decree.payload.level ?? 1,
      decreeId: decree.id,
      name: decree.title,
    });
    if (res.ok) {
      decree.payload.siteId = res.site.id;
      decree.reports.push(`Day ${state.day}: site staked at ${res.site.loc.x}, ${res.site.loc.z}.`);
    } else {
      decree.reports.push(`Day ${state.day}: site failed — ${res.reason}`);
    }
  }
  if (kind === "recruit") {
    const count = decree.payload.count ?? 2;
    const m = launchMission(state, count, { decreeId: decree.id, free: true });
    if (m.ok) {
      decree.payload.missionId = m.mission.id;
      decree.reports.push(`Day ${state.day}: recruiter dispatched for ${count}.`);
    } else {
      decree.reports.push(`Day ${state.day}: mission failed — ${m.reason}`);
    }
  }
  if (kind === "tax" && decree.payload.preset) {
    decree.payload.restore = state.tax?.preset ?? "normal";
    applyPreset(state, decree.payload.preset);
    decree.reports.push(`Day ${state.day}: tax preset → ${decree.payload.preset}.`);
  }

  state.ledger.push({ day: state.day, type: "decree", what: "issued", title: decree.title, budget });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
  return { ok: true, decree };
}

/**
 * Daily decree tick: progress, deadline countdown, completion & failure.
 * @returns {{lines:string[],done:number,failed:number}}
 */
export function tickDecrees(state) {
  const out = { lines: [], done: 0, failed: 0 };
  for (const d of state.decrees ?? []) {
    if (d.status !== "active") continue;
    d.daysLeft = Math.max(0, (d.deadlineDay ?? state.day) - state.day);

    if (d.kind === "build" && d.payload.siteId) {
      const site = (state.sites ?? []).find((s) => s.id === d.payload.siteId);
      if (!site || site.status === "done") d.progress = 100;
      else {
        const labor = Math.min(1, site.laborDone / Math.max(1, site.laborNeeded));
        d.progress = Math.round(labor * 100);
      }
    } else if (d.kind === "recruit" && d.payload.missionId) {
      const m = (state.missions ?? []).find((x) => x.id === d.payload.missionId);
      if (m?.status === "done") {
        const want = d.payload.count ?? 1;
        d.progress = Math.min(100, Math.round(((m.arrived ?? 0) / want) * 100));
        if (d.progress >= 100) completeDecree(state, d, out);
        else if (d.daysLeft <= 0) failDecree(state, d, out, "too few answered the call");
        continue;
      }
    } else if (d.kind === "produce" && d.payload.item) {
      const have = state.stockpile[d.payload.item] ?? 0;
      d.progress = Math.min(100, Math.round((have / Math.max(1, d.payload.qty ?? 1)) * 100));
    } else if (d.kind === "tax") {
      const total = Math.max(1, (d.deadlineDay ?? state.day + 1) - d.issuedDay);
      d.progress = Math.min(100, Math.round(((total - d.daysLeft) / total) * 100));
    }
    // Custom decrees: the King marks progress by hand in the menu.

    if (d.kind === "tax" && d.daysLeft <= 0) {
      // A tax edict simply expires back to the previous preset.
      applyPreset(state, d.payload.restore ?? "normal");
      d.status = "done";
      d.progress = 100;
      d.reports.push(`Day ${state.day}: edict expired; taxes restored.`);
      refundEscrow(state, d);
      out.done++;
      out.lines.push(`§7📜 "${d.title}" expired — taxes restored.`);
    } else if (d.progress >= 100 && d.kind !== "recruit") {
      completeDecree(state, d, out);
    } else if (d.daysLeft <= 0 && d.progress < 100) {
      failDecree(state, d, out, "deadline passed");
    } else if (d.daysLeft === 2) {
      d.reports.push(`Day ${state.day}: behind schedule at ${d.progress}% — 2 days left.`);
      out.lines.push(`§6📜 "${d.title}": ${d.progress}% with 2 days left — the Minister requests aid.`);
    }
  }
  return out;
}

function completeDecree(state, d, out) {
  d.status = "done";
  d.progress = 100;
  // Early finish → bonus wages from escrow + happiness.
  const crew = state.citizens.filter((c) => c.alive && c.ageStage === "adult");
  const bonus = Math.min(d.escrow, crew.length * 2);
  if (bonus > 0 && crew.length) {
    const each = Math.round((bonus / crew.length) * 100) / 100;
    for (const c of crew) {
      c.savings = Math.round(((c.savings ?? 0) + each) * 100) / 100;
      c.day.earned = Math.round(((c.day.earned ?? 0) + each) * 100) / 100;
      c.mood = Math.min(100, (c.mood ?? 70) + 4);
    }
    d.escrow = Math.round((d.escrow - bonus) * 100) / 100;
    state.dailyStats.welfare = Math.round(((state.dailyStats.welfare ?? 0) + bonus) * 100) / 100;
  }
  refundEscrow(state, d);
  out.done++;
  out.lines.push(`§a📜 "${d.title}" complete — bonuses paid, the colony rejoices.`);
  d.reports.push(`Day ${state.day}: complete.`);
  state.ledger.push({ day: state.day, type: "decree", what: "done", title: d.title });
}

function failDecree(state, d, out, why) {
  d.status = "failed";
  refundEscrow(state, d);
  for (const c of state.citizens) {
    if (c.alive) c.mood = Math.max(5, (c.mood ?? 70) - 8);
  }
  state.ministerStrikes = (state.ministerStrikes ?? 0) + 1;
  out.failed++;
  out.lines.push(`§c📜 "${d.title}" FAILED (${why}). Unrest spreads; the Minister is warned (strike ${state.ministerStrikes}).`);
  d.reports.push(`Day ${state.day}: failed — ${why}.`);
  state.ledger.push({ day: state.day, type: "decree", what: "failed", title: d.title });
}

function refundEscrow(state, d) {
  if (d.escrow > 0) {
    state.treasury = Math.round((state.treasury + d.escrow) * 100) / 100;
    d.escrow = 0;
  }
}

/** Cancels a live decree and refunds its escrow. */
export function cancelDecree(state, decreeId) {
  const d = (state.decrees ?? []).find((x) => x.id === decreeId && x.status === "active");
  if (!d) return false;
  d.status = "cancelled";
  if (d.kind === "tax" && d.payload.restore) applyPreset(state, d.payload.restore);
  refundEscrow(state, d);
  d.reports.push(`Day ${state.day}: cancelled by the King.`);
  return true;
}

/** Hands-off ruling: requests under the auto budget need no audience. */
export function autoBudget(state) {
  return state.autoApproveBudget ?? 50;
}

/**
 * Workload estimate for a planned decree (design §33): required builder-days
 * vs crew capacity → hire / extend / overtime advice.
 */
export function workloadAdvice(state, laborDays, deadlineDays, crewCount) {
  const capacity = Math.max(1, crewCount) * Math.max(1, deadlineDays);
  const load = Math.round((laborDays / capacity) * 100);
  if (load <= 100) return `Workload ${load}% — the crew can meet it.`;
  const hire = Math.ceil(laborDays / Math.max(1, deadlineDays)) - crewCount;
  return `Workload ${load}% — hire ${hire} more, extend the deadline, or authorize overtime.`;
}
