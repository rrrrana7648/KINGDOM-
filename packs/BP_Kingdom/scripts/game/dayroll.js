/**
 * dayroll.js — dawn settlement (design §10): wages, mood, production report,
 * then resets the day counters. Runs once when the world day increments.
 */

function freshDay() {
  return {
    meals: 0, slept: false, workedTicks: 0, leisureTicks: 0,
    delivered: 0, scared: 0, breakfast: false, lunch: false, dinner: false,
  };
}

/**
 * @returns {{lines:string[], production:[string,number][], wagesPaid:number}}
 */
export function runDayRoll(state) {
  const lines = [];
  let wagesPaid = 0;

  for (const c of state.citizens) {
    if (!c.alive || c.ageStage !== "adult") continue;

    // Pay: the Minister and released citizens earn; the founding retinue
    // (still following the King) is not on payroll yet.
    if (c.role === "minister" || c.mode === "living") {
      const wage = Math.round(c.wage * 100) / 100;
      state.treasury -= wage;
      c.savings = (c.savings ?? 0) + wage;
      wagesPaid += wage;
    }

    // Mood from the day that just ended.
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
    if (c.mode === "following") mood += 6; // close to the King
    c.mood = Math.max(5, Math.min(100, Math.round(mood)));

    c.day = freshDay();
  }

  state.dailyStats.wagesPaid = Math.round(wagesPaid * 100) / 100;

  const production = Object.entries(state.dayProduction)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  state.dayProduction = {};

  const foodWarning =
    state.foodStock < state.citizens.filter((c) => c.alive).length * 6
      ? " §c⚠ Food reserves low — mark a farm site!"
      : "";
  const wageWarning = state.treasury < wagesPaid * 3
    ? " §c⚠ Treasury cannot cover 3 days of wages!"
    : "";

  lines.push(
    `§6☀️ §lDawn of Day ${state.day}§r — §7Morning report`,
    `§7  Wages paid: §e₹${Math.round(wagesPaid)} §7| Treasury: §e₹${Math.round(state.treasury)}`,
    `§7  Meals eaten: §f${state.dailyStats.mealsEaten} §7| missed: §c${state.dailyStats.mealsMissed} §7| Rations left: §f${state.foodStock}${foodWarning}`
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
  if (wageWarning) lines.push(wageWarning);

  state.dailyStats = { wagesPaid: 0, mealsEaten: 0, mealsMissed: 0 };
  return { lines, production, wagesPaid };
}

function shortName(id) {
  return id.replace("minecraft:", "").replaceAll("_", " ");
}
