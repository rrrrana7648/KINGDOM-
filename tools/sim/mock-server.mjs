/* Minimal @minecraft/server mock for headless KINGDOM logic tests. */

const AIR = "minecraft:air";

class Block {
  constructor(dim, x, y, z, typeId = AIR, states = {}) {
    this.dim = dim; this.location = { x, y, z };
    this.typeId = typeId; this._states = { ...states };
    this.permutation = { getState: (k) => this._states[k] };
    this.isValid = true;
    this._componentOverride = undefined;
  }
  get isAir() { return this.typeId === AIR; }
  get isLiquid() { return this.typeId.includes("water") || this.typeId.includes("lava"); }
  setType(id) { this.typeId = id; this._states = {}; this._componentOverride = undefined; }
  setPermutation(p) { this.typeId = p._typeId; this._states = { ...(p.states ?? {}) }; }
  getComponent(id) {
    if (this._componentOverride && id === "inventory") return this._componentOverride;
    return undefined;
  }
  setInventory(container) { this._componentOverride = { container }; }
}

class ItemStack {
  constructor(typeId, amount = 1) { this.typeId = typeId; this.amount = amount; this.nameTag = ""; }
  setLore() { return this; }
}

class BlockPermutation {
  constructor(typeId, states) { this._typeId = typeId; this.states = states ?? {}; }
  static resolve(typeId, states) { return new BlockPermutation(typeId, states); }
}

let entityCounter = 0;
class Entity {
  constructor(dim, typeId, loc) {
    this.id = String(--entityCounter);
    this.typeId = typeId;
    this.dimension = dim;
    this.location = { x: loc.x, y: loc.y, z: loc.z };
    this.tags = new Set();
    this.families = typeId === "minecraft:villager_v2" ? ["villager", "mob"] : ["mob"];
    this.isValid = true;
    this.nameTag = "";
  }
  addTag(t) { this.tags.add(t); return true; }
  hasTag(t) { return this.tags.has(t); }
  getTags() { return [...this.tags]; }
  getRotation() { return { x: 0, y: 0 }; }
  teleport(loc) { this.location = { x: loc.x, y: loc.y, z: loc.z }; }
  getComponent() { return undefined; }
}
class Player extends Entity {
  constructor(dim, loc, name = "Tester") {
    super(dim, "player", loc);
    this.name = name; this.families = [];
    this.onScreenDisplay = { setActionBar() {}, setTitle() {} };
    this.messages = [];
  }
  sendMessage(m) { this.messages.push(m); }
  playSound() {}
  getBlockFromViewDirection() { return this._looking ?? undefined; }
}

class Dimension {
  constructor(name) { this.name = name; this.blocks = new Map(); this.entities = []; }
  reset() { this.blocks.clear(); this.entities.length = 0; }
  key(x, y, z) { return `${x},${y},${z}`; }
  setBlock(x, y, z, typeId, states) {
    const b = new Block(this, x, y, z, typeId, states);
    this.blocks.set(this.key(x, y, z), b);
    return b;
  }
  getBlock(v) {
    const x = Math.floor(v.x), y = Math.floor(v.y), z = Math.floor(v.z);
    const k = this.key(x, y, z);
    if (!this.blocks.has(k)) this.blocks.set(k, new Block(this, x, y, z, AIR));
    return this.blocks.get(k);
  }
  spawnEntity(typeId, loc) {
    const e = new Entity(this, typeId, { x: loc.x, y: loc.y, z: loc.z });
    this.entities.push(e);
    return e;
  }
  getEntities(opts = {}) {
    let out = this.entities.filter((e) => e.isValid);
    if (opts.tags) out = out.filter((e) => opts.tags.every((t) => e.tags.has(t)));
    if (opts.families) out = out.filter((e) => opts.families.every((f) => e.families.includes(f)));
    if (opts.location && opts.maxDistance != null) {
      out = out.filter((e) =>
        Math.hypot(e.location.x - opts.location.x, e.location.z - opts.location.z) <= opts.maxDistance
      );
    }
    return out;
  }
  getPlayers() { return this.entities.filter((e) => e instanceof Player); }
  spawnParticle() {} playSound() {}
}

const dims = { overworld: new Dimension("overworld") };

const world = {
  getDimension: (n) => dims.overworld,
  getAllPlayers: () => dims.overworld.getPlayers(),
  dynamicProps: new Map(),
  setDynamicProperty(k, v) { this.dynamicProps.set(k, v); },
  getDynamicProperty(k) { return this.dynamicProps.get(k); },
  day: 1, timeOfDay: 0,
  getDay() { return this.day; },
  getTimeOfDay() { return this.timeOfDay; },
  scoreboard: {
    getObjective: () => null,
    addObjective: () => ({ getParticipants: () => [], setScore() {}, removeParticipant() {} }),
    setObjectiveAtDisplaySlot() {},
  },
  afterEvents: new Proxy({}, { get: () => ({ subscribe() {} }) }),
  beforeEvents: new Proxy({}, { get: () => ({ subscribe() {} }) }),
  playSound() {},
};

const system = {
  currentTick: 0,
  runInterval() {}, run(fn) { fn(); },
  beforeEvents: { startup: { subscribe() {} } },
};

export const CommandPermissionLevel = { Any: 0, GameDirectors: 1, Admin: 2 };
export const CustomCommandStatus = { Success: 0, Failure: 1 };
export const CustomCommandParamType = {};
export const DisplaySlotId = { Sidebar: "Sidebar", List: "List", BelowName: "BelowName" };
export const ObjectiveSortOrder = { Ascending: 0, Descending: 1 };

export { world, system, BlockPermutation, ItemStack, Entity, Player, Dimension, AIR };
