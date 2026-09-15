/**
 * dayroll.js — the dawn settlement (design §10, §6):
 *   1. cart-runner consolidation of buyer stalls + unspent floats return
 *   2. M10 the turning sky: season & weather
 *   3. M7 family: weddings, births, 6-day aging
 *   4. M8 missions home + harbor ships, prices & refugee events
 *   5. M10 doctors & disease: sickness, plague watches, famine
 *   6. CROWN salaries (freelancers were already paid per delivery)
 *   7. M4 market day (citizen spending → GDP services + sales tax + shops)
 *   8. M7 housing assignment + Crown rents
 *   9. M4 tax collection (income/head/land; sales at market, duties at harbor)
 *  10. M9 the underworld: crime, audits, investigations, bounties
 *  11. M6 decree progress / deadlines · construction shifts
 *  12. M5 bank interest + auto-repayments
 *  13. M9 the chain gang · M9 raids · M10 research & fate
 *  14. mood from the day that just ended (+ M6–M10 modifiers)
 *  15. M9 the streets: petitions → protests → riots → rebellion
 *  15b. M13 society, ventures, industry, shadows + victory parades
 *  16. M4 books: GDP & net profit · M5 inflation tick
 *  17. morning float funding for licensed buyers
 *  18. the morning report
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
import { tickClimate, seasonIcon, weatherIcon } from "../events/seasons.js";
import { tickHealth } from "../events/health.js";
import { rollEvents } from "../events/deck.js";
import { tickTech } from "../tech/tree.js";
import { tickCrime, constablePower } from "../security/crime.js";
import { tickPrison } from "../security/courts.js";
import { tickDefense, securityRating } from "../security/guards.js";
import { tickUnrest, unrestLevel } from "../security/unrest.js";
import { tickSpies } from "../security/spies.js";
import { tickCurfew } from "../security/curfew.js";
import { tickArmory, victoryParade } from "../security/armory.js";
import { tickPrestige, tickHalls, tierIcon } from "../society/prestige.js";
import { tickCalendar } from "../society/calendar.js";
import { tickLiteracy } from "../society/literacy.js";
import { tickHearth, weddingGifts } from "../society/hearth.js";
import { tickCensus } from "../society/census.js";
import { tickCaravans } from "../economy/caravans.js";
import { tickBonds } from "../economy/bonds.js";
import { tickContracts } from "../economy/contracts.js";
import { tickInsurance } from "../economy/insurance.js";
import { tickPawn } from "../economy/pawnshop.js";
import { tickAuction } from "../economy/auction.js";
import { tickTools } from "../industry/tools.js";
import { tickWorkforce } from "./workforce.js";
import { tickAppointees } from "./appointees.js";
import { tickSatellites } from "../world/satellites.js";
import { tickExpeditions } from "../world/expeditions.js";
import { spawnMigrant } from "./citizens.js";
import { freshStats } from "../core/state.js";

function freshDay() {
  return {
    meals: 0, slept: false, workedTicks: 0, leisureTicks: 0,
    delivered: 0, scared: 0, breakfast: false, lunch: false, dinner: false,
    earned: 0, thin: false,
  };
}

export function runDayRoll(state, dim, rng = Math.random) {
  // 1. Dusk cart-runner → warehouse; floats come home.
  consolidateStalls(state, dim);
  if ((state.strikeDays ?? 0) > 0) state.strikeDays--;

  const lines = [];

  // 2. The sky turns first — everything below reads it.
  const climate = tickClimate(state, rng);

  // 3–4. Family then arrivals (new mouths never draw today's pay).
  const family = tickFamily(state, dim);
  const missions = tickMissions(state, dim);
  const autogrow = tickAutogrow(state, dim);
  missions.arrived += autogrow.arrived;
  missions.lines.push(...autogrow.lines);
  const harbor = tickHarbor(state);

  // 5. Doctors & disease before pay (the dead draw no wage).
  const health = tickHealth(state, rng);

  // 6. Pay: Minister + CROWN employees (incl. buyer clerks & guards).
  //    Freelancers earn piece rates at the counter, prisoners no wage.
  let wagesPaid = 0;
  for (const c of state.citizens) {
    if (!c.alive || c.ageStage !== "adult") continue;
    const onSalary = c.role === "minister" || (c.mode === "living" && c.wageMode !== "freelance" && c.status !== "prisoner" && !c.retired);
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

  // 7–9. Market spending, housing & rents, then taxes.
  const market = simulateMarketDay(state);
  assignHousing(state);
  const rents = collectRents(state);
  const tax = collectTaxes(state);

  // 10. The underworld stirs.
  const crime = tickCrime(state, rng);

  // 11–12. Decrees, construction, bank.
  const decrees = tickDecrees(state);
  const construction = tickConstruction(state, dim);
  const bank = tickBank(state);

  // 13. Chain gang, raiders, scholars, fate.
  const prison = tickPrison(state);
  const defense = tickDefense(state, rng);
  const tech = tickTech(state);
  const fate = rollEvents(state, rng);

  // 14. Mood from the day that just ended.
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
    if (c.sick > 0) mood -= 5; // fevered
    if (c.status === "prisoner") mood = Math.min(mood, 40); // the cells weigh
    c.mood = Math.max(5, Math.min(100, Math.round(mood)));
    c.day = freshDay();
  }

  // 15. The streets answer the mood.
  const unrest = tickUnrest(state, rng);

  // 15b. M13: the hundred-features dawn — society, ventures, industry, shadows.
  const venturesBefore = state.treasury;
  const prestige = tickPrestige(state);
  const halls = tickHalls(state);
  const calendar = tickCalendar(state);
  const literacy = tickLiteracy(state);
  const hearth = tickHearth(state, rng);
  const giftLines = weddingGifts(state, family.weddings);
  const census = tickCensus(state);
  const caravans = tickCaravans(state, rng);
  const bonds = tickBonds(state);
  const contracts = tickContracts(state);
  const insurance = tickInsurance(state);
  const pawn = tickPawn(state, rng);
  const auction = tickAuction(state, rng);
  const tools = tickTools(state);
  const workforce = tickWorkforce(state, (s) => {
    const c = spawnMigrant(s, dim, "laborer");
    if (c) {
      c.mode = "living";
      c.status = "working";
    } else {
      throw new Error("no room on the road");
    }
  });
  const desks = tickAppointees(state, bank);
  const satellites = tickSatellites(state);
  const expeditions = tickExpeditions(state, rng);
  const spies = tickSpies(state, rng);
  const curfew = tickCurfew(state);
  const armory = tickArmory(state);
  const parade = defense.won ? victoryParade(state) : null;
  const venturesNet = Math.round((state.treasury - venturesBefore) * 100) / 100;

  // 16. The books: GDP & net, then the inflation tick.
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
      fines: state.dailyStats.fines ?? 0,
      harbor: Math.max(0, harborNet),
      fees: 0,
    },
    expenses: {
      wages: wagesPaid,
      freelance: state.dailyStats.freelancePaid ?? 0,
      construction: state.dailyStats.construction ?? 0,
      missions: state.dailyStats.missions ?? 0,
      security: state.dailyStats.security ?? 0,
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

  // 17. Fund today's buyer floats from the treasury.
  const floatsFunded = fundFloats(state);

  // 18. Report.
  const aliveCount = state.citizens.filter((c) => c.alive).length;
  const openCases = (state.security.cases ?? []).filter((k) => k.status !== "closed");
  const docket = openCases.filter((k) => k.status === "trial").length;
  const cl = state.climate ?? { season: "Spring", seasonDay: 1, weather: "clear", year: 1 };
  lines.push(
    `§6☀️ §lDawn of Day ${state.day}§r — §7Morning report`,
    `§7  ${seasonIcon(cl.season)} ${cl.season} ${cl.seasonDay}/10, Year ${cl.year} · ${weatherIcon(cl.weather)} ${cl.weather}${state.rationing ? " · §6🍞 rationing" : ""}${state.quarantine ? " · §6🤒 quarantine" : ""}${state.festivalDay === state.day ? " · §d🎪 FESTIVAL" : ""}`,
    `§7  Salaries §e₹${wagesPaid} §7| freelance purchases §e₹${Math.round((state.dailyStats.freelancePaid ?? 0) * 100) / 100} §7| buyer floats §e₹${Math.round(floatsFunded)}`,
    `§b🏭 GDP §f₹${books.gdp} ${trend(state.finances.gdpHistory)} §7| §a📈 net §f₹${books.net} ${trend(state.finances.netHistory)} §7| Treasury §e₹${Math.round(state.treasury)} §7| rations §f${state.foodStock}`,
    `§7  Market §f₹${market.volume} §7(§f${market.shoppers} §7shoppers) | taxes §e₹${tax.total} §7(income ₹${tax.income}, head ₹${tax.head}, land ₹${tax.land}) | rents §e₹${rents.rent} | fines §e₹${Math.round((state.dailyStats.fines ?? 0) * 100) / 100}`,
    `§7  Meals §f${state.dailyStats.mealsEaten} §7eaten · §c${state.dailyStats.mealsMissed} §7missed`,
    `§7  🛡️ security §f${securityRating(state)} §7| 🌑 cases §f${openCases.length} §7(§f${docket} §7ready) | ✊ unrest §f${Math.round(state.security.unrest)} §7(${(unrestLevel(state.security.unrest))}) | 🤒 sick §f${health.sick}`,
    `§7  ${tierIcon(state.prestige?.tier ?? "Camp")} ${state.prestige?.tier ?? "Camp"} §f${state.prestige?.score ?? 0} §7| ventures ${venturesNet >= 0 ? "§a+" : "§c"}₹${venturesNet} §7| 🕵️ agents §f${(state.spies?.agents ?? []).length} §7| 🔫 muskets §f${state.armory?.muskets ?? 0}`,
    `§7  ${inflation.line}`,
  );
  if (tech.completed) {
    // already announced in tech.lines
  } else if (state.tech?.current) {
    lines.push(`§7  🔬 ${state.tech.current.id}: ${Math.floor(state.tech.current.progress)}/${state.tech.current.needed} RP`);
  }
  if ((state.pendingDecisions ?? []).length) {
    lines.push(`§7  ⌛ ${(state.pendingDecisions ?? []).length} decision${state.pendingDecisions.length > 1 ? "s await" : " awaits"} the King's word (Audiences / !decide)`);
  }
  if (production.length) {
    const pretty = production
      .slice(0, 6)
      .map(([id, n]) => `${shortName(id)} §f${n}`)
      .join("§7, ");
    lines.push(`§7  Produced: ${pretty} §8(goods value ₹${goods})`);
  } else {
    lines.push("§8  No production — release citizens and mark work sites.");
  }
  for (const l of [...climate.lines, ...family.lines, ...missions.lines, ...harbor.lines, ...health.lines, ...crime.lines, ...decrees.lines, ...construction.lines, ...bank.lines, ...prison.lines, ...defense.lines, ...tech.lines, ...fate.lines, ...unrest.lines, ...prestige.lines, ...halls.lines, ...calendar.lines, ...literacy.lines, ...hearth.lines, ...giftLines, ...census.lines, ...caravans.lines, ...bonds.lines, ...contracts.lines, ...insurance.lines, ...pawn.lines, ...auction.lines, ...tools.lines, ...workforce.lines, ...desks.lines, ...satellites.lines, ...expeditions.lines, ...spies.lines, ...curfew.lines, ...armory.lines, ...(parade ? [parade] : [])]) {
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
  if (docket > 0) {
    lines.push(`§6⚠ ${docket} case${docket > 1 ? "s" : ""} await${docket > 1 ? "" : "s"} sentence — justice delayed is fugitives made.`);
  }

  const freelancePaid = state.dailyStats.freelancePaid ?? 0;
  state.dailyStats = freshStats();
  return {
    lines, production, wagesPaid, floatsFunded, freelancePaid,
    gdp: books.gdp, net: books.net, market, tax, rents,
    bank, family, missions, harbor, decrees, construction, inflation,
    climate, health, crime, prison, defense, tech, fate, unrest,
    prestige, halls, calendar, literacy, hearth, census, caravans, bonds,
    contracts, insurance, pawn, auction, tools, workforce, desks,
    satellites, expeditions, spies, curfew, armory, parade, venturesNet,
    constables: constablePower(state),
  };
}

function shortName(id) {
  return id.replace("minecraft:", "").replaceAll("_", " ");
}
