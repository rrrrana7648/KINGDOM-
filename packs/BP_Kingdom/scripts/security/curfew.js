/**
 * curfew.js — lamp-lit order (M13, §37.17).
 *
 * The curfew bell rings at dusk: constables own the streets, crime
 * withers — but honest folk chafe at locked doors. Unrest bleeds off
 * while mood sags; a blunt tool for sharp nights.
 */

/**
 * Daily tick: order at the price of joy.
 * @returns {{lines:string[]}}
 */
export function tickCurfew(state) {
  const out = { lines: [] };
  if (!state.curfew?.on) return out;
  state.security.unrest = Math.max(0, Math.round(((state.security.unrest ?? 0) - 1.5) * 10) / 10);
  for (const c of state.citizens) {
    if (c.alive) c.mood = Math.max(5, (c.mood ?? 70) - 1);
  }
  return out;
}
