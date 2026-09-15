/**
 * finance.js — GDP, net profit & the daily books (M4, design §6).
 *
 *   GDP/day       = market value of all GOODS produced + SERVICES traded
 *   NET PROFIT/day = Total Income − Total Expenses   (HUD, green▲/red▼)
 *
 * Goods value comes from the Day Roll's production tally at Crown buy rates;
 * services value is the market day's citizen spending. Income covers taxes,
 * sales tax, shop profit, rents, harbor trade and fees; expenses cover
 * wages, freelance purchases, construction, missions, debt interest and
 * welfare. Buyer floats are revolving cash (funded then returned) and are
 * reported separately, not in net profit.
 */
import { baseRate } from "./pricebook.js";

const HISTORY_CAP = 30;

export function defaultFinances() {
  return {
    lastGDP: 0,
    lastNet: 0,
    prevMoneySupply: 1000,
    prevGDP: 0,
    income: emptyBooks().income,
    expenses: emptyBooks().expenses,
    gdpHistory: [],
    netHistory: [],
  };
}

export function emptyBooks() {
  return {
    income: { taxes: 0, salesTax: 0, shops: 0, rents: 0, harbor: 0, fees: 0, total: 0 },
    expenses: { wages: 0, freelance: 0, construction: 0, missions: 0, interest: 0, welfare: 0, trade: 0, total: 0 },
  };
}

/** Market value of everything produced since the last Day Roll. */
export function goodsValue(dayProduction) {
  let v = 0;
  for (const [item, qty] of Object.entries(dayProduction ?? {})) {
    v += baseRate(item) * qty;
  }
  return Math.round(v * 100) / 100;
}

/**
 * Closes the day's books. Call once per Day Roll after every system settled.
 * @param {object} state
 * @param {{goods:number,services:number,income:object,expenses:object}} parts
 * @returns {{gdp:number,net:number}}
 */
export function settleDay(state, parts) {
  const f = state.finances ?? (state.finances = defaultFinances());
  const gdp = Math.round(((parts.goods ?? 0) + (parts.services ?? 0)) * 100) / 100;

  const income = { ...emptyBooks().income, ...(parts.income ?? {}) };
  const expenses = { ...emptyBooks().expenses, ...(parts.expenses ?? {}) };
  income.total = Math.round(
    (income.taxes + income.salesTax + income.shops + income.rents + income.harbor + income.fees) * 100
  ) / 100;
  expenses.total = Math.round(
    (expenses.wages + expenses.freelance + expenses.construction + expenses.missions + expenses.interest + expenses.welfare + expenses.trade) * 100
  ) / 100;
  const net = Math.round((income.total - expenses.total) * 100) / 100;

  f.prevGDP = f.lastGDP;
  f.lastGDP = gdp;
  f.lastNet = net;
  f.income = income;
  f.expenses = expenses;
  f.gdpHistory.push(gdp);
  f.netHistory.push(net);
  if (f.gdpHistory.length > HISTORY_CAP) f.gdpHistory.splice(0, f.gdpHistory.length - HISTORY_CAP);
  if (f.netHistory.length > HISTORY_CAP) f.netHistory.splice(0, f.netHistory.length - HISTORY_CAP);
  return { gdp, net };
}

/** Trend arrow for HUD/report lines. */
export function trend(history) {
  if (!history || history.length < 2) return "§7—";
  const d = history[history.length - 1] - history[history.length - 2];
  if (d > 0.005) return "§a▲";
  if (d < -0.005) return "§c▼";
  return "§7▪";
}

/** Multi-line treasury report for the Kingdom Menu. */
export function treasuryReport(state) {
  const f = state.finances ?? defaultFinances();
  const lines = [
    `§6§lTreasury §e₹${Math.round(state.treasury)} §7· money supply §f₹${Math.round(state.moneySupply)}`,
    `§b🏭 GDP yesterday §f₹${f.lastGDP} ${trend(f.gdpHistory)} §7· §a📈 net §f₹${f.lastNet} ${trend(f.netHistory)}`,
    `§7— Income ₹${f.income.total}: taxes ₹${f.income.taxes} · sales ₹${f.income.salesTax} · shops ₹${f.income.shops}`,
    `§7  rents ₹${f.income.rents} · harbor ₹${f.income.harbor} · fees ₹${f.income.fees}`,
    `§7— Expenses ₹${f.expenses.total}: wages ₹${f.expenses.wages} · freelance ₹${f.expenses.freelance}`,
    `§7  building ₹${f.expenses.construction} · missions ₹${f.expenses.missions} · interest ₹${f.expenses.interest} · welfare ₹${f.expenses.welfare}`,
  ];
  return lines.join("\n");
}
