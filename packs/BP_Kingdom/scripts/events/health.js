/**
 * health.js — sickness, doctors, plagues & famine (M10, design §10).
 *
 * Crowding, dirty water and cold seasons breed ague; the sick rest at home
 * (no shifts) while doctors and hospitals nurse them. Cholera stalks
 * crowded, well-less towns; plague is rare and terrible. Empty granaries
 * count hunger days — then health fails and the desperate emigrate. The
 * graveyard keeps the names of the colony's dead.
 */
import { LEDGER_CAP } from "../core/state.js";
import { handleInheritance } from "../social/housing.js";

export function doctorRoster(state) {
  return state.citizens.filter(
    (c) => c.alive && c.ageStage === "adult" && c.mode === "living" &&
      c.profession === "doctor" && c.status !== "prisoner" && !(c.sick > 0)
  );
}

export function hasWell(state) {
  return (state.buildings ?? []).some((b) => b.buildingId === "well");
}
export function hasHospital(state) {
  return (state.buildings ?? []).some((b) => b.buildingId === "hospital");
}

/**
 * Daily health tick: new cases, doctor rounds, plague watches, famine.
 * @returns {{lines:string[],sick:number}}
 */
export function tickHealth(state, rng = Math.random) {
  const out = { lines: [], sick: 0 };
  const adults = state.citizens.filter((c) => c.alive && c.ageStage === "adult");
  const medicine = (state.tech?.unlocked ?? []).includes("medicine");

  // New sickness: crowding + season + water.
  const crowded = (state.houses ?? []).filter((h) => h.residents.length > h.beds * 1.5).length;
  let risk = 0.02 + crowded * 0.03;
  if (state.climate?.weather === "frost") risk += 0.03;
  if (state.climate?.weather === "heatwave") risk += 0.02;
  if (!hasWell(state) && adults.length >= 6) risk += 0.03;
  if (hasHospital(state)) risk *= 0.6;
  if (state.quarantine) risk *= 0.5;
  for (const c of [...adults, ...state.citizens.filter((x) => x.alive && x.ageStage !== "adult")]) {
    if (c.sick > 0 || c.status === "prisoner") continue;
    if (rng() < risk) {
      c.sick = medicine ? 2 : 3;
      out.lines.push(`§e🤒 ${c.fullName} takes to bed with fever.`);
    }
  }

  // Cholera watches dirty, crowded towns.
  if (!hasWell(state) && crowded > 0 && rng() < 0.06 + crowded * 0.03) {
    const victims = adults.filter((c) => !(c.sick > 0)).slice(0, 2 + Math.floor(rng() * 3));
    for (const v of victims) v.sick = medicine ? 3 : 4;
    out.lines.push(`§c🤢 CHOLERA in the crowded wards! ${victims.length} stricken — dig a well, build sewers of policy (hospital), quarantine.`);
    ledgerHealth(state, "cholera", { victims: victims.length });
  }

  // Plague: rare, terrible, quarantinable.
  if (rng() < 0.015 && adults.length >= 8) {
    const victims = adults.filter((c) => !(c.sick > 0)).slice(0, 3);
    for (const v of victims) {
      v.sick = 5;
      v.health = Math.max(1, (v.health ?? 20) - 6);
    }
    out.lines.push(`§4☠️ PLAGUE SHIP FEVER! ${victims.length} Burn with it. Quarantine, doctors, prayer — in that order.`);
    ledgerHealth(state, "plague", { victims: victims.length });
  }

  // Doctor rounds: each doctor shortens 3 cases (hospital doubles the ward).
  const doctors = doctorRoster(state);
  if (doctors.length) {
    const ward = hasHospital(state) ? 6 : 3;
    let capacity = doctors.length * ward;
    for (const c of state.citizens) {
      if (capacity <= 0) break;
      if (!c.alive || !(c.sick > 0)) continue;
      c.sick = Math.max(0, c.sick - 1);
      c.health = Math.min(20, (c.health ?? 20) + 4);
      capacity--;
    }
    const tended = doctors.length * ward - capacity;
    if (tended > 0) out.lines.push(`§a🩺 Doctors tend ${tended} patient${tended > 1 ? "s" : ""}.`);
  }

  // The sick worsen without care; the neglected may die.
  for (const c of state.citizens) {
    if (!c.alive || !(c.sick > 0)) continue;
    out.sick++;
    c.sick--;
    if (c.sick <= 0) {
      c.mood = Math.min(100, (c.mood ?? 70) + 3);
      continue;
    }
    if (!doctors.length && !hasHospital(state)) {
      c.health = Math.max(0, (c.health ?? 20) - 2);
    }
    if (c.health <= 0) {
      c.alive = false;
      c.status = "deceased";
      handleInheritance(state, c);
      recordGrave(state, c, "taken by fever");
      out.lines.push(`§c⚰ ${c.fullName} succumbed to fever. The chapel bell tolls.`);
      ledgerHealth(state, "death", { name: c.fullName });
    }
  }

  // Famine: empty granaries count hunger; then health fails, then feet vote.
  if (state.foodStock <= 0) {
    state.hungerDays++;
    if (state.hungerDays >= 3) {
      for (const c of state.citizens) {
        if (!c.alive) continue;
        c.health = Math.max(0, (c.health ?? 20) - 3);
        if (c.health <= 0 && c.ageStage === "adult" && c.role !== "minister") {
          c.alive = false;
          c.status = "deceased";
          handleInheritance(state, c);
          recordGrave(state, c, "starved in the famine");
          out.lines.push(`§4⚰ ${c.fullName} starved. The famine must break.`);
        }
      }
      // The desperate emigrate while the colony still stands.
      const leavers = state.citizens.filter(
        (c) => c.alive && c.ageStage === "adult" && c.role !== "minister" &&
          c.profession !== "guard" && c.profession !== "doctor"
      );
      if (leavers.length > 4 && rng() < 0.5) {
        const gone = leavers[Math.floor(rng() * leavers.length)];
        gone.alive = false;
        gone.status = "emigrated";
        out.lines.push(`§7🚶 ${gone.fullName} walked out of the famine with a bindle and no goodbye.`);
      }
      out.lines.push(`§c🍞 FAMINE, day ${state.hungerDays} — ration, import grain, or watch the town hollow out.`);
    } else {
      out.lines.push(`§6🍞 The granary stands EMPTY (${state.hungerDays} day${state.hungerDays > 1 ? "s" : ""}). Ration or import, quickly.`);
    }
  } else {
    state.hungerDays = 0;
  }
  return out;
}

function recordGrave(state, victim, epitaph) {
  state.graveyard.push(`${victim.fullName} — ${epitaph} (Day ${state.day})`);
  if (state.graveyard.length > 20) state.graveyard.shift();
}

function ledgerHealth(state, what, detail) {
  state.ledger.push({ day: state.day, type: "health", what, ...detail });
  if (state.ledger.length > LEDGER_CAP) {
    state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
  }
}
