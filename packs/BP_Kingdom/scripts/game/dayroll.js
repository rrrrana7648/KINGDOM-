/**
 * dayroll.js — dawn settlement (design §10, §6):
 *   1. cart-runner consolidation of buyer stalls + unspent floats return
 *   2. CROWN salaries (freelancers were already paid per delivery)
 *   3. mood from meals, rest, safety, leisure, work
 *   4. morning float funding for licensed buyers
 *   5. production report
 */
import { consolidateStalls, fundFloats } from "../economy/buyers.js";
import { freshStats } from "../core/state.js";

function freshDay() {
  return {
    meals: 0, slept: false, workedTicks: 0, leisureTicks: 0,
    delivered: 0, scared: 0, breakfast: false, lunch: false, dinner: false,
  };
}

export function runDayRoll(state, dim) {
  // 1. Dusk cart-runner → warehouse; floats come home.
  consolidateStalls(state, dim);

  const lines = [];
  let wagesPaid = 0;

  for (const c of state.citizens) {
    if (!c.alive || c.ageStage !== "adult") continue;

    // 2. Pay: Minister + CROWN employees (incl. buyer clerks). Freelancers
    //    earn piece rates at the counter and receive no daily salary.
    const onSalary = c.role === "minister" || (c.mode === "living" && c.wageMode !== "freelance");
    if (onSalary) {
      const wage = Math.round(c.wage * 100) / 100;
      state.treasury -= wage;
      c.savings = (c.savings ?? 0) + wage;
      wagesPaid += wage;
    }

    // 3. Mood from the day that just ended.
    const d = c.day ?? freshDay();
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
    c.mood = Math.max(5, Math.min(100, Math.round(mood)));

    c.day = freshDay();
  }

  wagesPaid = Math.round(wagesPaid * 100) / 100;
  state.dailyStats.wagesPaid = wagesPaid;

  // 4. Fund today's buyer floats from the treasury.
  const floatsFunded = fundFloats(state);

  const production = Object.entries(state.dayProduction)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  state.dayProduction = {};

  const aliveCount = state.citizens.filter((c) => c.alive).length;
  const foodWarning = state.foodStock < aliveCount * 6
    ? " §c⚠ Food reserves low — mark a farm site!"
    : "";
  const wageBuffer = wagesPaid * 3 + floatsFunded;
  const cashWarning = state.treasury < wageBuffer
    ? " §c⚠ Treasury cannot cover 3 days of wages & floats!"
    : "";

  // 5. Report.
  lines.push(
    `§6☀️ §lDawn of Day ${state.day}§r — §7Morning report`,
    `§7  Salaries §e₹${wagesPaid} §7| freelance purchases §e₹${Math.round(
      (state.dailyStats.freelancePaid ?? 0) * 100
    ) / 100} §7| buyer floats §e₹${Math.round(floatsFunded)}`,
    `§7  Treasury §e₹${Math.round(state.treasury)} §7| rations §f${state.foodStock}`,
    `§7  Meals §f${state.dailyStats.mealsEaten} §7eaten · §c${state.dailyStats.mealsMissed} §7missed${foodWarning}`
  );
  if (production.length) {
    const pretty = production
      .slice(0, 6)
      .map(([id, n]) => `${shortName(id)} §f${n}`)
      .join("§7, ");
    lines.push(`§7  Produced: ${pretty}`);
  } else {
    lines.push("§8  No production — release citizens and mark work sites.");
  }
  if (cashWarning) lines.push(cashWarning);

  state.dailyStats = freshStats();
  return { lines, production, wagesPaid, floatsFunded };
}

function shortName(id) {
  return id.replace("minecraft:", "").replaceAll("_", " ");
}
