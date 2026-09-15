/**
 * sounds.js — era sound stings (M12, design §13).
 *
 * Bedrock ships no custom audio in this pack (keeping mobile installs lean),
 * so the colony's bells, horns and gavels are curated vanilla voices behind
 * stable names. Every call is exception-safe: a missing voice on some
 * platform can never break the simulation. Players may mute stings in
 * Clock & Settings.
 */
import { world } from "@minecraft/server";
import { getState } from "./state.js";

/** Stable sting name → vanilla sound id. */
export const STINGS = {
  dawnBell: "note.bell",
  wedding: "note.pling",
  shipHorn: "note.bass",
  pressClank: "random.anvil_land",
  trumpet: "note.flute",
  gavel: "random.wood_click",
  alarm: "note.bassattack",
  coin: "random.orb",
  festival: "note.harp",
  sad: "note.basedrum",
};

function enabled() {
  try {
    return getState().options?.stings !== false;
  } catch {
    return true;
  }
}

/**
 * Plays a sting for every online player (or at one location).
 * @param {string} name key of STINGS
 * @param {{x:number,y:number,z:number}} [loc] omit for global UI-style play
 */
export function sting(name, loc = null) {
  if (!enabled()) return;
  const id = STINGS[name];
  if (!id) return;
  try {
    const players = world.getAllPlayers();
    for (const p of players) {
      try {
        if (loc) p.playSound(id, { location: loc, volume: 0.8 });
        else p.playSound(id);
      } catch { /* one deaf ear never stops the band */ }
    }
  } catch { /* headless or early boot */ }
}

/** Fire-and-forget world sound at a location (work effects etc.). */
export function playAt(dimension, soundId, loc, opts = {}) {
  try {
    dimension.playSound(soundId, loc, { volume: 0.6, ...opts });
  } catch { /* effects never break work */ }
}
