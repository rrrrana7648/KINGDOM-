/**
 * clock.js — maps the vanilla 20-minute day cycle to colony clock time.
 *
 * Vanilla: 24,000 ticks = 20 real minutes = one full day-night cycle,
 * and tick 0 is 06:00 in-game.
 *   colonyMinutes = (ticks / 1000 + 6) * 60  (mod 24h)
 * Schedule anchors live in design doc §30.
 */

export const TICKS_PER_DAY = 24000;
export const VANILLA_DAY_MINUTES = 20;

/** @param {number} ticks world time-of-day 0..23999 */
export function colonyMinutes(ticks) {
  const hours = (ticks / 1000 + 6) % 24;
  return Math.floor(hours * 60);
}

/** @param {number} ticks */
export function formatClock(ticks) {
  const total = colonyMinutes(ticks);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/**
 * Bell/activity phase for the action-bar clock.
 * @param {number} ticks
 */
export function phaseFor(ticks) {
  const h = ((ticks / 1000 + 6) % 24);
  if (h >= 6 && h < 7.5) return "§eDawn — family breakfast";
  if (h >= 7.5 && h < 12) return "§aMorning shift";
  if (h >= 12 && h < 13) return "§6Midday meal";
  if (h >= 13 && h < 17.5) return "§aAfternoon shift";
  if (h >= 17.5 && h < 18.5) return "§6Deliveries & wages";
  if (h >= 18.5 && h < 21) return "§dFamily & leisure";
  if (h >= 21 || h < 5) return "§8Curfew — night watch";
  return "§8Small hours";
}

/** True once for the tick range just after the 06:00 wrap (dawn bell window). */
export function isDawn(ticks) {
  const h = (ticks / 1000 + 6) % 24;
  return h >= 6 && h < 6.05;
}
