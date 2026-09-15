/**
 * dayroll.js — the dawn settlement (design §10, §6):
 *   1. cart-runner consolidation of buyer stalls + unspent floats return
 *   2. M7 family: weddings, births, 6-day aging
 *   3. M8 missions home + harbor ships, prices & refugee events
 *   4. CROWN salaries (freelancers were already paid per delivery)
 *   5. M4 market day (citizen spending → GDP services + sales tax + shops)
 *   6. M7 housing assignment + Crown rents
 *   7. M4 tax collection (income/head/land; sales at market, duties at harbor)
 *   8. M6 decree progress / deadlines · construction shifts
 *   9. M5 bank interest + auto-repayments
 *  10. mood from the day that just ended (+ M6–M8 modifiers)
 *  11. M4 books: GDP & net profit · M5 inflation tick
 *  12. morning float funding for licensed buyers
 *  13. the morning report
 */
import { consolidateStalls, fundFloats } from "../economy/buyers.js";
import { simulateMarketDay } from "../economy/market.js";
import { collectTaxes } from "../economy/tax.js";
import { goodsValue, settleDay, trend } from "../economy/finance.js";
import { tickInflation } from "../economy/mint.js";
import { tickBank } from "../economy/bank.js";
import { tickDecrees } from "./decrees.js";
import { tickConstruction } from "../build/construction.js";
import { tickFamily } from "../social/family.js";
import { assignHousing, collectRents, houseFor } from "../social/housing.js";
import { tickMissions, tickAutogrow } from "../world/migration.js";
import { tickHarbor } from "../world/harbor.js";
import { freshStats } from "../core/state.js";

function freshDay() {
  return {
    meals: 0, slept: false, workedTicks: 0, leisureTicks: 0,
    delivered: 0, scared: 0, breakfast: false, lunch: false, dinner: false,
    earned: 0,
  };
}

export function runDayRoll(state, dim) {
  // 1. Dusk cart-runner → warehouse; floats come home.
  consolidateStalls(state, dim);

  const lines = [];

  // 2–3. Family then arrivals (new mouths never draw today's pay).
  const family = tickFamily(state, dim);
  const missions = tickMissions(state, dim);
  const autogrow = tickAutogrow(state, dim);
  missions.arrived += autogrow.arrived;
  missions.lines.push(...autogrow.lines);
  const harbor = tickHarbor(state);

  // 4. Pay: Minister + CROWN employees (incl. buyer clerks). Freelancers
  //    earn piece rates at the counter and receive no daily salary.
  let wagesPaid = 0;
  for (const c of state.citizens) {
    if (!c.alive || c.ageStage !== "adult") continue;
    const onSalary = c.role === "minister" || (c.mode === "living" && c.wageMode !== "freelance");
    if (onSalary) {
      const wage = Math.round(c.wage * 100) / 100;
      state.treasury = Math.round((state.treasury - wage) * 100) / 100;
      c.savings = Math.round(((c.savings ?? 0) + wage) * 100) / 100;
      c.day = c.day ?? freshDay();
      c.day.earned = Math.round(((c.day.earned ?? 0) + wage) * 100) / 100;
      wagesPaid = Math.round((wagesPaid + wage) * 100) / 100;
    }
  }
  state.dailyStats.wagesPaid = wagesPaid;

  // 5–7. Market spending, housing & rents, then taxes.
  const market = simulateMarketDay(state);
  assignHousing(state);
  const rents = collectRents(state);
  const tax = collectTaxes(state);

  // 8. Decrees & construction shifts.
  const decrees = tickDecrees(state);
  const construction = tickConstruction(state, dim);

  // 9. Bank interest & repayments.
  const bank = tickBank(state);

  // 10. Mood from the day that just ended.
  const tavernBonus = (state.buildings ?? []).some((b) => b.buildingId === "tavern") ? 4 : 0;
  const monumentBonus = (state.buildings ?? [])
    .filter((b) => b.buildingId === "monument")
    .reduce((s, b) => s + 3 * (b.level ?? 1), 0);
  const hospital = (state.buildings ?? []).some((b) => b.buildingId === "hospital");
  for (const c of state.citizens) {
    if (!c.alive) continue;
    if (hospital) c.health = 20; // the wards make their rounds
    const d = c.day ?? freshDay();
    if (c.ageStage !== "adult") {
      // Children: full bellies, long sleep and festival joy.
      const mealRatio = Math.min(1, d.meals / 3);
      c.mood = Math.max(5, Math.min(100, Math.round(
        55 + mealRatio * 30 + (d.slept ? 10 : 0) + tavernBonus
      )));
      c.day = freshDay();
      continue;
    }
    const mealRatio = Math.min(1, d.meals / 3);
    const workRatio = Math.min(1, d.workedTicks / 300);
    const n = c.needs ?? { food: 70, rest: 70, leisure: 70, safety: 70 };
    let mood =
      38 +
      mealRatio * 28 +
      (d.slept ? 12 : 0) +
      Math.max(-12, (n.rest - 60) * 0.12) +
      n.safety * 0.12 +
      n.leisure * 0.08 +
      workRatio * 5 -
      d.scared * 6;
    if (c.mode === "following") mood += 6;
    mood += tavernBonus + monumentBonus;
    if ((state.houses ?? []).length > 0 && !houseFor(state, c.id)) mood -= 6; // homeless
    if (c.rentOwed > 10) mood -= 4;
    c.mood = Math.max(5, Math.min(100, Math.round(mood)));
    c.day = freshDay();
  }

  // 11. The books: GDP & net, then the inflation tick.
  const goods = goodsValue(state.dayProduction);
  const harborNet = state.dailyStats.harborNet ?? 0;
  const books = settleDay(state, {
    goods,
    services: market.volume,
    income: {
      taxes: tax.total,
      salesTax: market.salesTax,
      shops: market.shopProfit,
      rents: rents.rent,
      harbor: Math.max(0, harborNet),
      fees: 0,
    },
    expenses: {
      wages: wagesPaid,
      freelance: state.dailyStats.freelancePaid ?? 0,
      construction: state.dailyStats.construction ?? 0,
      missions: state.dailyStats.missions ?? 0,
      interest: bank.crownInterest ?? 0,
      welfare: state.dailyStats.welfare ?? 0,
      trade: harborNet < 0 ? Math.round(-harborNet * 100) / 100 : 0,
    },
  });
  const inflation = tickInflation(state);

  const production = Object.entries(state.dayProduction)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  state.dayProduction = {};

  // 12. Fund today's buyer floats from the treasury.
  const floatsFunded = fundFloats(state);

  // 13. Report.
  const aliveCount = state.citizens.filter((c) => c.alive).length;
  lines.push(
    `§6☀️ §lDawn of Day ${state.day}§r — §7Morning report`,
    `§7  Salaries §e₹${wagesPaid} §7| freelance purchases §e₹${Math.round((state.dailyStats.freelancePaid ?? 0) * 100) / 100} §7| buyer floats §e₹${Math.round(floatsFunded)}`,
    `§b🏭 GDP §f₹${books.gdp} ${trend(state.finances.gdpHistory)} §7| §a📈 net §f₹${books.net} ${trend(state.finances.netHistory)} §7| Treasury §e₹${Math.round(state.treasury)} §7| rations §f${state.foodStock}`,
    `§7  Market §f₹${market.volume} §7(§f${market.shoppers} §7shoppers) | taxes §e₹${tax.total} §7(income ₹${tax.income}, head ₹${tax.head}, land ₹${tax.land}) | rents §e₹${rents.rent}`,
    `§7  Meals §f${state.dailyStats.mealsEaten} §7eaten · §c${state.dailyStats.mealsMissed} §7missed`,
    `§7  ${inflation.line}`,
  );
  if (production.length) {
    const pretty = production
      .slice(0, 6)
      .map(([id, n]) => `${shortName(id)} §f${n}`)
      .join("§7, ");
    lines.push(`§7  Produced: ${pretty} §8(goods value ₹${goods})`);
  } else {
    lines.push("§8  No production — release citizens and mark work sites.");
  }
  for (const l of [...family.lines, ...missions.lines, ...harbor.lines, ...decrees.lines, ...construction.lines, ...bank.lines]) {
    lines.push(`§7  ${l}`);
  }

  if (state.foodStock < aliveCount * 6) {
    lines.push("§c⚠ Food reserves low — mark a farm site or import grain!");
  }
  const wageBuffer = wagesPaid * 3 + floatsFunded;
  if (state.treasury < wageBuffer) {
    lines.push("§c⚠ Treasury cannot cover 3 days of wages & floats!");
  }
  if (state.market?.blackMarketRisk === "high") {
    lines.push("§c⚠ The black market thrives — cut sales tax before trade flees.");
  }

  const freelancePaid = state.dailyStats.freelancePaid ?? 0;
  state.dailyStats = freshStats();
  return {
    lines, production, wagesPaid, floatsFunded, freelancePaid,
    gdp: books.gdp, net: books.net, market, tax, rents,
    bank, family, missions, harbor, decrees, construction, inflation,
  };
}

function shortName(id) {
  return id.replace("minecraft:", "").replaceAll("_", " ");
}
