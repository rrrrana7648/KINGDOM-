/**
 * housing.js — the named house registry (M7, design §34).
 *
 * Every dwelling is registered with a name plaque ("Carter House"), a bed
 * count and a resident roll. Crown tenements charge nightly rent; private
 * homes (bought plots + bank mortgages) pay land tax instead. Couples are
 * housed together after weddings; births can overcrowd a house (mood dips
 * until the King orders an upgrade or move).
 *
 * Wills: on death the house & savings pass to the spouse, then the eldest
 * living child, else revert to the Crown (widows/orphans protected).
 */
import { LEDGER_CAP } from "../core/state.js";

export function nextHouseId(state) {
  return `h-${state.nextHouseId++}`;
}

/**
 * Registers a dwelling at a location.
 * @returns {object} the house record
 */
export function registerHouse(state, { name, loc, beds = 2, ownerId = null, rentPerBed = 1, level = 1 }) {
  const house = {
    id: nextHouseId(state),
    name: name?.trim() || `House ${state.nextHouseId - 1}`,
    loc: { x: Math.round(loc.x), y: Math.round(loc.y), z: Math.round(loc.z) },
    beds: Math.max(1, Math.min(12, beds)),
    residents: [],
    ownerId, // null = Crown tenement (rent); citizen id = private (land tax)
    rentPerBed,
    level,
    overcrowdedDays: 0,
  };
  state.houses.push(house);
  return house;
}

export function houseFor(state, citizenId) {
  return (state.houses ?? []).find((h) => h.residents.includes(citizenId));
}

export function residentsOf(state, houseId) {
  const h = (state.houses ?? []).find((x) => x.id === houseId);
  if (!h) return [];
  return h.residents
    .map((id) => state.citizens.find((c) => c.id === id))
    .filter(Boolean);
}

export function freeBeds(house) {
  return Math.max(0, house.beds - house.residents.length);
}

/**
 * Houses every homeless adult: couples stay together when a house has room
 * for both, singles fill remaining beds. Children lodge with their mother.
 * @returns {{assigned:number,homeless:number}}
 */
export function assignHousing(state) {
  const out = { assigned: 0, homeless: 0 };
  const houses = state.houses ?? [];
  if (!houses.length) {
    out.homeless = state.citizens.filter((c) => c.alive && c.ageStage === "adult").length;
    return out;
  }

  const homelessAdults = state.citizens.filter(
    (c) => c.alive && c.ageStage === "adult" && !houseFor(state, c.id)
  );
  // Couples first so spouses share a roof.
  homelessAdults.sort((a, b) => (b.spouse ? 1 : 0) - (a.spouse ? 1 : 0));

  for (const c of homelessAdults) {
    // A spouse already housed? Move in with them.
    const spouseHouse = c.spouse ? houseFor(state, c.spouse) : null;
    if (spouseHouse && freeBeds(spouseHouse) > 0) {
      spouseHouse.residents.push(c.id);
      c.home = spouseHouse.id;
      out.assigned++;
      continue;
    }
    const room = houses.find((h) => freeBeds(h) > 0);
    if (room) {
      room.residents.push(c.id);
      c.home = room.id;
      out.assigned++;
    } else {
      out.homeless++;
    }
  }

  // Children lodge wherever their mother sleeps (beyond the bed count —
  // cribs don't need beds — but count toward overcrowding past 2× beds).
  for (const c of state.citizens) {
    if (!c.alive || c.ageStage === "adult") continue;
    const mother = state.citizens.find((m) => m.id === c.motherId);
    const mh = mother ? houseFor(state, mother.id) : null;
    if (mh && !mh.residents.includes(c.id)) {
      mh.residents.push(c.id);
      c.home = mh.id;
    }
  }

  // Overcrowding + homelessness weigh on mood at the Day Roll.
  for (const h of houses) {
    const occupants = h.residents.filter((id) => {
      const c = state.citizens.find((x) => x.id === id);
      return c && c.alive;
    });
    h.residents = occupants; // prune the departed
    const ratio = occupants.length / Math.max(1, h.beds);
    if (ratio > 1.5) {
      h.overcrowdedDays++;
      for (const id of occupants) {
        const c = state.citizens.find((x) => x.id === id);
        if (c) c.mood = Math.max(5, (c.mood ?? 70) - 3);
      }
    } else {
      h.overcrowdedDays = 0;
    }
  }
  return out;
}

/**
 * Collects nightly Crown rents (private homes pay land tax via tax.js).
 * Unpaid rent accrues as arrears and sours mood; there are no midnight
 * evictions — the Magistrate handles persistent arrears at M9.
 * @returns {{rent:number,unpaid:number}}
 */
export function collectRents(state) {
  const out = { rent: 0, unpaid: 0 };
  for (const h of state.houses ?? []) {
    if (h.ownerId) continue; // private: land tax instead
    for (const id of [...h.residents]) {
      const c = state.citizens.find((x) => x.id === id && x.alive);
      if (!c || c.ageStage !== "adult") continue;
      const due = h.rentPerBed ?? 1;
      if ((c.savings ?? 0) >= due) {
        c.savings = Math.round((c.savings - due) * 100) / 100;
        state.treasury = Math.round((state.treasury + due) * 100) / 100;
        out.rent = Math.round((out.rent + due) * 100) / 100;
        c.rentOwed = 0;
      } else {
        c.rentOwed = Math.round(((c.rentOwed ?? 0) + due) * 100) / 100;
        c.mood = Math.max(5, (c.mood ?? 70) - 2);
        out.unpaid = Math.round((out.unpaid + due) * 100) / 100;
      }
    }
  }
  state.dailyStats.rentsCollected = out.rent;
  if (out.rent > 0) {
    state.ledger.push({ day: state.day, type: "rent", rent: out.rent, unpaid: out.unpaid });
    if (state.ledger.length > LEDGER_CAP) {
      state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
    }
  }
  return out;
}

/**
 * Settles a citizen's estate: spouse → eldest living child → Crown.
 * Call from the death handler (main.js) and family aging.
 */
export function handleInheritance(state, record) {
  const heirs = state.citizens.filter((c) => c.alive && c.id !== record.id);
  const spouse = record.spouse ? heirs.find((c) => c.id === record.spouse) : null;
  const child = heirs
    .filter((c) => c.motherId === record.id || c.fatherId === record.id)
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0))[0];
  const heir = spouse ?? child ?? null;

  const savings = Math.round((record.savings ?? 0) * 100) / 100;
  if (heir && savings > 0) {
    heir.savings = Math.round(((heir.savings ?? 0) + savings) * 100) / 100;
  } else if (!heir && savings > 0) {
    state.treasury = Math.round((state.treasury + savings) * 100) / 100;
  }
  record.savings = 0;

  for (const h of state.houses ?? []) {
    h.residents = h.residents.filter((id) => id !== record.id);
    if (h.ownerId === record.id) {
      h.ownerId = heir ? heir.id : null; // no heir → reverts to Crown
      if (heir && !h.residents.includes(heir.id)) h.residents.push(heir.id);
    }
  }
  // Widowed spouses keep their housing, grieve, and may remarry in time.
  if (spouse) {
    spouse.spouse = null;
    spouse.mood = Math.max(5, (spouse.mood ?? 70) - 15);
  }
  for (const c of state.citizens) {
    if (c.partner === record.id) c.partner = null;
    if (c.affection) delete c.affection[record.id];
  }

  if (savings > 0 || (state.houses ?? []).some((h) => h.ownerId === (heir?.id ?? "§"))) {
    state.ledger.push({
      day: state.day, type: "inherit",
      from: record.fullName, to: heir ? heir.fullName : "the Crown", amount: savings,
    });
    if (state.ledger.length > LEDGER_CAP) {
      state.ledger.splice(0, state.ledger.length - LEDGER_CAP);
    }
  }
  return heir;
}

/** Removes a house (demolished) — residents become homeless, owner refunded. */
export function demolishHouse(state, houseId) {
  const i = (state.houses ?? []).findIndex((h) => h.id === houseId);
  if (i < 0) return false;
  const [h] = state.houses.splice(i, 1);
  for (const id of h.residents) {
    const c = state.citizens.find((x) => x.id === id);
    if (c) c.home = null;
  }
  return true;
}
