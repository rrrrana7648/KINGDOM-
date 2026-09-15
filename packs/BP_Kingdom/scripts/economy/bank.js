/**
 * bank.js — the State Bank (M5, design §7).
 *
 * Citizen savings accounts are the savings field every worker already keeps.
 * On top of that the bank issues LOANS & MORTGAGES (houses, farms, shops):
 * interest accrues daily, repayments are deducted automatically from savings,
 * and missed payments add arrears (mood dips; no debtors' prison — unpaid
 * balances go to the Magistrate's debt court at M9).
 *
 * The Crown itself can borrow from foreign merchant banks (national debt +
 * daily interest). The King sets both rates in the Mint & Bank menu.
 */
import { LEDGER_CAP } from "../core/state.js";

export function defaultBank() {
  return {
    crownDebt: 0,
    crownRate: 8, // % per 30 days on national debt
    citizenRate: 12, // % per 10 days on citizen loans
    loans: [], // {id,borrowerId,borrower,purpose,principal,remaining,rate,dueDay,arrears}
  };
}

export function nextLoanId(state) {
  return `l-${state.nextLoanId++}`;
}

/** Stone confidence: a State Bank cuts the citizen rate by 2 per level. */
export function citizenRate(state) {
  const bank = (state.buildings ?? []).find((b) => b.buildingId === "bank");
  const discount = 2 * (bank?.level ?? 0);
  return Math.max(0, (state.bank?.citizenRate ?? 12) - discount);
}

function ledgerBank(state, what, detail) {
  state.ledger.push({ day: state.day, type: "bank", what, ...detail });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
}

/**
 * Issues a loan to a citizen. Treasury must cover it.
 * @returns {{ok:boolean,loan?:object,reason?:string}}
 */
export function requestLoan(state, citizenId, amount, purpose = "personal", termDays = 10) {
  amount = Math.round(amount * 100) / 100;
  const c = state.citizens.find((x) => x.id === citizenId && x.alive);
  if (!c) return { ok: false, reason: "Borrower not found." };
  if (c.ageStage !== "adult") return { ok: false, reason: "Only adults may borrow." };
  if (!(amount > 0)) return { ok: false, reason: "Name a positive sum." };
  if (amount > state.treasury) return { ok: false, reason: "The treasury cannot cover that sum." };
  const open = (state.bank.loans ?? []).filter((l) => l.borrowerId === citizenId && l.remaining > 0);
  if (open.length >= 3) return { ok: false, reason: `${c.fullName.split(" ")[0]} already holds 3 loans.` };

  const loan = {
    id: nextLoanId(state),
    borrowerId: citizenId,
    borrower: c.fullName,
    purpose,
    principal: amount,
    remaining: amount,
    rate: citizenRate(state),
    dueDay: state.day + Math.max(2, termDays),
    arrears: 0,
  };
  state.bank.loans.push(loan);
  state.treasury = Math.round((state.treasury - amount) * 100) / 100;
  c.savings = Math.round(((c.savings ?? 0) + amount) * 100) / 100;
  ledgerBank(state, "loan", { to: c.fullName, amount, purpose });
  return { ok: true, loan };
}

/** Voluntary overpayment on a loan. */
export function repayLoan(state, loanId, amount) {
  const loan = (state.bank.loans ?? []).find((l) => l.id === loanId);
  if (!loan || loan.remaining <= 0) return { ok: false, reason: "Loan not found." };
  const c = state.citizens.find((x) => x.id === loan.borrowerId);
  amount = Math.min(Math.round(amount * 100) / 100, loan.remaining, Math.max(0, c?.savings ?? 0));
  if (amount <= 0) return { ok: false, reason: "No spare savings to repay with." };
  c.savings = Math.round((c.savings - amount) * 100) / 100;
  loan.remaining = Math.round((loan.remaining - amount) * 100) / 100;
  state.treasury = Math.round((state.treasury + amount) * 100) / 100;
  ledgerBank(state, "repay", { by: c.fullName, amount, left: loan.remaining });
  return { ok: true, left: loan.remaining };
}

/** The Crown borrows abroad (harbor merchant banks). */
export function borrowCrown(state, amount) {
  amount = Math.round(amount * 100) / 100;
  if (!(amount > 0)) return { ok: false, reason: "Name a positive sum." };
  state.bank.crownDebt = Math.round((state.bank.crownDebt + amount) * 100) / 100;
  state.treasury = Math.round((state.treasury + amount) * 100) / 100;
  ledgerBank(state, "crown-borrow", { amount, debt: state.bank.crownDebt });
  return { ok: true, debt: state.bank.crownDebt };
}

/** The Crown services its foreign debt. */
export function repayCrown(state, amount) {
  amount = Math.min(Math.round(amount * 100) / 100, state.bank.crownDebt, Math.max(0, state.treasury));
  if (amount <= 0) return { ok: false, reason: "Nothing available to repay." };
  state.bank.crownDebt = Math.round((state.bank.crownDebt - amount) * 100) / 100;
  state.treasury = Math.round((state.treasury - amount) * 100) / 100;
  ledgerBank(state, "crown-repay", { amount, debt: state.bank.crownDebt });
  return { ok: true, debt: state.bank.crownDebt };
}

/**
 * Daily interest + automatic repayments from savings.
 * @returns {{citizenInterest:number,crownInterest:number,repaid:number,defaulted:number,lines:string[]}}
 */
export function tickBank(state) {
  const out = { citizenInterest: 0, crownInterest: 0, repaid: 0, defaulted: 0, lines: [] };

  for (const loan of state.bank.loans ?? []) {
    if (loan.remaining <= 0) continue;
    const interest = Math.round(loan.remaining * (loan.rate / 100 / 10) * 100) / 100;
    loan.remaining = Math.round((loan.remaining + interest) * 100) / 100;
    out.citizenInterest = Math.round((out.citizenInterest + interest) * 100) / 100;

    const c = state.citizens.find((x) => x.id === loan.borrowerId && x.alive);
    if (!c) {
      loan.arrears++;
      continue;
    }
    // Auto-instalment: a tenth of the balance plus the day's interest.
    const instalment = Math.round((loan.remaining / 10 + interest) * 100) / 100;
    const paid = Math.min(instalment, Math.max(0, c.savings ?? 0));
    if (paid > 0) {
      c.savings = Math.round((c.savings - paid) * 100) / 100;
      loan.remaining = Math.round((loan.remaining - paid) * 100) / 100;
      state.treasury = Math.round((state.treasury + paid) * 100) / 100;
      out.repaid = Math.round((out.repaid + paid) * 100) / 100;
    } else {
      loan.arrears++;
      c.mood = Math.max(5, (c.mood ?? 70) - 2);
    }
    if (state.day > loan.dueDay && loan.remaining > 0) {
      loan.arrears++;
      out.defaulted++;
      c.mood = Math.max(5, (c.mood ?? 70) - 1);
    }
  }
  // Drop fully repaid loans (history stays in the ledger).
  state.bank.loans = (state.bank.loans ?? []).filter((l) => l.remaining > 0.005);

  if (state.bank.crownDebt > 0) {
    const interest = Math.round(state.bank.crownDebt * (state.bank.crownRate / 100 / 30) * 100) / 100;
    state.bank.crownDebt = Math.round((state.bank.crownDebt + interest) * 100) / 100;
    out.crownInterest = interest;
    if (state.treasury >= interest) {
      state.treasury = Math.round((state.treasury - interest) * 100) / 100;
    }
  }

  if (out.defaulted > 0) {
    out.lines.push(`§c🏦 ${out.defaulted} loan(s) past due — arrears mount; the debt court will hear them (M9).`);
  }
  if (state.bank.crownDebt > state.moneySupply * 0.5 && state.bank.crownDebt > 0) {
    out.lines.push(`§c🏦 National debt ₹${Math.round(state.bank.crownDebt)} exceeds half the money supply!`);
  }
  return out;
}

/** Bank dashboard for the Kingdom Menu. */
export function bankDashboard(state) {
  const b = state.bank ?? defaultBank();
  const open = (b.loans ?? []).filter((l) => l.remaining > 0);
  const owed = open.reduce((s, l) => s + l.remaining, 0);
  const eff = citizenRate(state);
  const lines = [
    `§9§l🏦 State Bank §r§7· citizen rate §f${eff}%/10d${eff !== b.citizenRate ? ` §8(was ${b.citizenRate} — bank hall discount)` : ""} §7· crown rate §f${b.crownRate}%/30d`,
    `§7Citizen loans open §f${open.length} §7(owed §e₹${Math.round(owed)}§7)`,
    `§7National debt §c₹${Math.round(b.crownDebt)}`,
  ];
  for (const l of open.slice(0, 4)) {
    lines.push(`§8• ${l.borrower.split(" ")[0]} owes ₹${Math.round(l.remaining)} (${l.purpose}, due D${l.dueDay})`);
  }
  if (open.length > 4) lines.push(`§8… and ${open.length - 4} more`);
  return lines.join("\n");
}
