/**
 * tax.js — the Treasurer's tax engine (M4, design §8).
 *
 * Seven levers + five presets. Rates are percentages unless noted.
 * War surcharge is added on top of income & sales rates ("Double War Tax").
 * A tax holiday zeroes every rate until holidayDays runs out.
 *
 * Collection happens once per Day Roll (never per tick). Income tax is taken
 * from each adult's recorded daily earnings (c.day.earned, filled when wages
 * and freelance pay land). Head tax is per adult per day. Land tax is due on
 * privately owned houses (see social/housing.js). Sales tax is collected by
 * the market sim and import/export duties by the harbor — both read
 * effectiveRates() here so there is exactly one source of truth.
 */
import { LEDGER_CAP } from "../core/state.js";

export const TAX_PRESETS = {
  low:     { incomePct: 5,  salesPct: 5,  headTax: 0, landPct: 2,  importPct: 5,  exportPct: 2,  war: 0 },
  normal:  { incomePct: 10, salesPct: 8,  headTax: 1, landPct: 5,  importPct: 10, exportPct: 5,  war: 0 },
  high:    { incomePct: 20, salesPct: 15, headTax: 2, landPct: 10, importPct: 15, exportPct: 10, war: 0 },
  war:     { incomePct: 10, salesPct: 8,  headTax: 1, landPct: 5,  importPct: 10, exportPct: 5,  war: 10 },
  holiday: { incomePct: 0,  salesPct: 0,  headTax: 0, landPct: 0,  importPct: 0,  exportPct: 0,  war: 0 },
};

export function defaultTax() {
  return { preset: "normal", ...TAX_PRESETS.normal, holidayDays: 0 };
}

/** Applies a preset by name, keeping any running holiday countdown. */
export function applyPreset(state, name) {
  const preset = TAX_PRESETS[name];
  if (!preset) return false;
  const holidayDays = state.tax?.holidayDays ?? 0;
  state.tax = { preset: name, ...preset, holidayDays };
  return true;
}

/**
 * Effective rates after war surcharge + holiday.
 * @returns {{income:number,sales:number,head:number,land:number,importDuty:number,exportDuty:number,holiday:boolean}}
 */
export function effectiveRates(state) {
  const t = state.tax ?? defaultTax();
  if ((t.holidayDays ?? 0) > 0) {
    return { income: 0, sales: 0, head: 0, land: 0, importDuty: 0, exportDuty: 0, holiday: true };
  }
  return {
    income: (t.incomePct ?? 10) + (t.war ?? 0),
    sales: (t.salesPct ?? 8) + (t.war ?? 0) / 2,
    head: t.headTax ?? 1,
    land: t.landPct ?? 5,
    importDuty: t.importPct ?? 10,
    exportDuty: t.exportPct ?? 5,
    holiday: false,
  };
}

export function describeTax(state) {
  const t = state.tax ?? defaultTax();
  const r = effectiveRates(state);
  const bits = [
    `income ${r.income}%`, `sales ${r.sales}%`, `head ₹${r.head}`,
    `land ${r.land}%`, `import ${r.importDuty}%`, `export ${r.exportDuty}%`,
  ];
  if (t.war > 0) bits.push(`⚔ war +${t.war}`);
  if (r.holiday) bits.push(`🎉 HOLIDAY ${t.holidayDays}d left`);
  return `${t.preset} · ` + bits.join(" · ");
}

/**
 * Collects income + head + land tax for the day that just ended.
 * Must run AFTER wages/market so c.day.earned and savings are final.
 * @returns {{income:number,head:number,land:number,total:number,holiday:boolean}}
 */
export function collectTaxes(state) {
  const rates = effectiveRates(state);
  const out = { income: 0, head: 0, land: 0, total: 0, holiday: rates.holiday };

  if (state.tax && (state.tax.holidayDays ?? 0) > 0) {
    state.tax.holidayDays--;
    if (state.tax.holidayDays === 0 && state.tax.preset === "holiday") {
      applyPreset(state, "normal"); // festival over — back to normal rates
    }
  }
  if (rates.holiday) return out;

  for (const c of state.citizens) {
    if (!c.alive || c.ageStage !== "adult") continue;
    const earned = Math.max(0, c.day?.earned ?? 0);
    if (earned > 0 && rates.income > 0) {
      const due = Math.round(earned * (rates.income / 100) * 100) / 100;
      const taken = Math.min(due, Math.max(0, c.savings ?? 0));
      c.savings = Math.round(((c.savings ?? 0) - taken) * 100) / 100;
      out.income = Math.round((out.income + taken) * 100) / 100;
    }
    if (rates.head > 0) {
      const taken = Math.min(rates.head, Math.max(0, c.savings ?? 0));
      c.savings = Math.round(((c.savings ?? 0) - taken) * 100) / 100;
      out.head = Math.round((out.head + taken) * 100) / 100;
    }
  }

  // Land tax on privately owned houses (crown tenements pay rent instead).
  for (const h of state.houses ?? []) {
    if (!h.ownerId) continue;
    const owner = state.citizens.find((c) => c.id === h.ownerId && c.alive);
    if (!owner) continue;
    const due = Math.round(h.beds * 2 * (rates.land / 100) * 100) / 100;
    const taken = Math.min(due, Math.max(0, owner.savings ?? 0));
    owner.savings = Math.round(((owner.savings ?? 0) - taken) * 100) / 100;
    out.land = Math.round((out.land + taken) * 100) / 100;
  }

  out.total = Math.round((out.income + out.head + out.land) * 100) / 100;
  state.treasury = Math.round((state.treasury + out.total) * 100) / 100;
  state.dailyStats.taxesCollected = out.total;

  if (out.total > 0) {
    state.ledger.push({
      day: state.day, type: "tax",
      income: out.income, head: out.head, land: out.land, total: out.total,
    });
    if (state.ledger.length > LEDGER_CAP) {
      state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
    }
  }

  // Over-taxation breeds a black market: the sim leaks sales-tax efficiency
  // (applied in market.js) and the Treasurer warns the King.
  state.market.blackMarketRisk =
    rates.sales > 20 || rates.income > 30 ? "high" : rates.sales > 14 ? "watch" : "low";

  return out;
}
