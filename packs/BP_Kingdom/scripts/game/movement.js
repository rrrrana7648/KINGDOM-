/**
 * movement.js — small, safe, teleport-based walking.
 *
 * Native pathfinding navigation is not exposed to stable scripts, and M2 only
 * runs a handful of NPCs, so citizens step toward their goal every few ticks.
 * Steps are validated against the world (ground, head clearance, drop-offs),
 * which makes them behave predictably without physics hacks.
 */

const STEP = 0.9; // blocks per tick-call (calls run every 5 ticks)

function blockAt(dim, x, y, z) {
  try {
    return dim.getBlock({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
  } catch {
    return undefined; // unloaded chunk
  }
}

/** Solid = a block you can stand on (logs/stone/chests yes, plants no). */
function isStandable(block) {
  if (!block || !block.isValid || block.isAir || block.isLiquid) return false;

  const id = block.typeId;
  if (!id) return false;
  // Passable non-air blocks are not ground.
  if (
    id.includes("sapling") || id.includes("crop") || id.includes("carpet") ||
    id.includes("torch") || id.includes("flower") || id.includes("grass") &&
    id !== "minecraft:grass_block" || id.includes("fungus") ||
    id === "minecraft:snow" || id === "minecraft:short_grass"
  ) {
    return false;
  }
  return true;
}

function isClear(block) {
  if (!block || !block.isValid) return false;
  return block.isAir || block.isLiquid;
}

/**
 * @returns {"arrived"|"moved"|"blocked"|"unloaded"}
 */
export function walkToward(entity, target, opts = {}) {
  const {
    arrive = 1.6,
    speed = STEP,
    stepUp = true,
  } = opts;
  const loc = entity.location;
  const dx = target.x - loc.x;
  const dz = target.z - loc.z;
  const distXZ = Math.hypot(dx, dz);
  if (distXZ <= arrive) return "arrived";

  const dim = entity.dimension;
  const step = Math.min(speed, distXZ);
  const y = loc.y;
  const dirX = dx / distXZ;
  const dirZ = dz / distXZ;

  const tryMove = (xx, zz, yy) => {
    const feet = blockAt(dim, xx, yy, zz);
    const head = blockAt(dim, xx, yy + 1, zz);
    const below = blockAt(dim, xx, yy - 1, zz);
    if (!feet || !head || !below) return false;
    if (!isClear(feet) || !isClear(head)) return false;
    return isStandable(below);
  };

  // Steer straight, then increasingly sideways around obstacles, with
  // one-block step-up / up-to-two step-down at every heading.
  const angles = [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9];
  const yOffsets = stepUp ? [0, 1, -1, -2] : [0, -1, -2];
  let best = null; // {x,z,yy,remaining}
  for (const a of angles) {
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const rx = dirX * cos - dirZ * sin;
    const rz = dirX * sin + dirZ * cos;
    const xx = loc.x + rx * step;
    const zz = loc.z + rz * step;
    for (const yo of yOffsets) {
      const yy = y + yo;
      if (!tryMove(xx, zz, yy)) continue;
      // Never walk off into thin air at this heading.
      if (yo === 0 && !isStandable(blockAt(dim, xx, yy - 1, zz))) continue;
      const remaining = Math.hypot(target.x - xx, target.z - zz);
      if (!best || remaining < best.remaining) best = { x: xx, z: zz, yy, remaining };
    }
    // Small steering angles that progress are preferred over big detours.
    if (best && best.remaining < distXZ - step * 0.35) break;
  }

  if (!best || best.remaining > distXZ + 0.05) return "blocked";

  const yaw = (-Math.atan2(dx, dz) * 180) / Math.PI;
  try {
    entity.teleport(
      { x: best.x, y: best.yy, z: best.z },
      { dimension: dim, rotation: { x: 0, y: yaw }, keepVelocity: false }
    );
  } catch {
    return "blocked";
  }
  return "moved";
}

/** Idle wandering inside a radius; used during leisure. */
export function wanderAround(entity, center, radius = 5, rng = Math.random) {
  const a = rng() * Math.PI * 2;
  const r = 1 + rng() * radius;
  return walkToward(entity, {
    x: center.x + Math.cos(a) * r,
    y: center.y,
    z: center.z + Math.sin(a) * r,
  }, { arrive: 0.6, speed: 0.55 });
}

export function distanceXZ(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
