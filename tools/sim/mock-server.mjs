/* Minimal @minecraft/server mock for headless KINGDOM logic tests. */

const AIR = "minecraft:air";

class Container {
  constructor(size = 27) { this.size = size; this.slots = new Array(size).fill(undefined); }
  addItem(stack) {
    let amount = stack.amount;
    // merge existing stacks first
    for (let i = 0; i < this.size && amount > 0; i++) {
      const s = this.slots[i];
      if (s && s.typeId === stack.typeId && s.amount < 64) {
        const take = Math.min(amount, 64 - s.amount);
        s.amount += take; amount -= take;
      }
    }
    for (let i = 0; i < this.size && amount > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(64, amount);
        this.slots[i] = new ItemStack(stack.typeId, take);
        amount -= take;
      }
    }
    return amount > 0 ? new ItemStack(stack.typeId, amount) : undefined;
  }
  getItem(i) { return this.slots[i] ? new ItemStack(this.slots[i].typeId, this.slots[i].amount) : undefined; }
  setItem(i, stack) { this.slots[i] = stack ? new ItemStack(stack.typeId, stack.amount) : undefined; }
  clearItem(i) { this.slots[i] = undefined; }
  count(item) {
    return this.slots.reduce((n, s) => n + (s && (!item || s.typeId === item) ? s.amount : 0), 0);
  }
}

class Block {
  constructor(dim, x, y, z, typeId = AIR, states = {}) {
    this.dim = dim; this.location = { x, y, z };
    this.typeId = typeId; this._states = { ...states };
    this.permutation = { getState: (k) => this._states[k] };
    this.isValid = true;
    this._container = typeId.includes("chest") ? new Container() : undefined;
    this._componentOverride = undefined;
  }
  get isAir() { return this.typeId === AIR; }
  get isLiquid() { return this.typeId.includes("water") || this.typeId.includes("lava"); }
  setType(id) {
    this.typeId = id; this._states = {}; this._componentOverride = undefined;
    this._container = id.includes("chest") ? new Container() : undefined;
  }
  setPermutation(p) { this.typeId = p._typeId; this._states = { ...(p.states ?? {}) }; }
  getComponent(id) {
    if (id !== "inventory") return undefined;
    if (this._componentOverride) return this._componentOverride;
    return this._container ? { container: this._container } : undefined;
  }
  setInventory(container) { this._componentOverride = { container }; }
}

class ItemStack {
  constructor(typeId, amount = 1) {
    if (typeof typeId !== "string" || !typeId.includes(":")) throw new TypeError(`ItemStack: '${typeId}' is not a namespaced item id`);
    if (!Number.isInteger(amount) || amount < 1 || amount > 255) throw new RangeError(`ItemStack: amount ${amount}`);
    this.typeId = typeId; this.amount = amount; this.nameTag = undefined;
  }
  setLore(l) {
    if (l !== undefined && (!Array.isArray(l) || l.length > 20 || l.some((x) => typeof x !== "string" || x.length > 50))) {
      throw new RangeError("setLore: up to 20 strings of ≤50 chars");
    }
    this._lore = l ?? [];
  }
  getLore() { return [...(this._lore ?? [])]; }
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
  teleport(loc, o) {
    for (const k of ["x", "y", "z"]) if (typeof loc?.[k] !== "number") throw new TypeError("teleport: Vector3");
    if (o !== undefined) {
      for (const k of Object.keys(o)) {
        if (!["checkForBlocks", "dimension", "facingLocation", "keepVelocity", "rotation"].includes(k)) throw new TypeError(`teleport: unknown TeleportOptions.${k}`);
      }
    }
    this.location = { x: loc.x, y: loc.y, z: loc.z };
  }
  getComponent() { return undefined; }
}
class Player extends Entity {
  constructor(dim, loc, name = "Tester") {
    super(dim, "player", loc);
    this.name = name; this.families = [];
    this.onScreenDisplay = {
      setActionBar(t) { if (typeof t !== "string" && typeof t !== "object") throw new TypeError("setActionBar: text"); },
      setTitle(t, o) {
        if (typeof t !== "string" && typeof t !== "object") throw new TypeError("setTitle: title");
        if (o !== undefined) {
          for (const k of ["fadeInDuration", "fadeOutDuration", "stayDuration"]) {
            if (typeof o[k] !== "number") throw new TypeError(`setTitle: TitleDisplayOptions.${k} is required (number)`);
          }
        }
      },
    };
    this.messages = [];
    this.inventory = new Container(36);
  }
  sendMessage(m) {
    if (typeof m !== "string" && typeof m !== "object") throw new TypeError("sendMessage: message");
    this.messages.push(m);
  }
  playSound(id, o) {
    if (typeof id !== "string") throw new TypeError("playSound: soundId");
    if (o !== undefined && (typeof o !== "object" || o === null)) throw new TypeError("playSound: PlayerSoundOptions must be an object");
  }
  getComponent(id) {
    if (id === "inventory" || id === "minecraft:inventory") return { container: this.inventory };
    return undefined;
  }
  getBlockFromViewDirection(o) {
    if (o !== undefined && typeof o !== "object") throw new TypeError("getBlockFromViewDirection: options object");
    return this._looking ?? undefined;
  }
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
  getPlayers(opts) { return this.getEntities(opts).filter((e) => e instanceof Player); }
  spawnParticle(id, loc) {
    if (typeof id !== "string" || typeof loc?.x !== "number") throw new TypeError("spawnParticle(effectName, Vector3)");
  }
  playSound(id, loc, o) {
    if (typeof id !== "string" || typeof loc?.x !== "number") throw new TypeError("playSound(soundId, Vector3, options?)");
    if (o !== undefined && typeof o !== "object") throw new TypeError("playSound: WorldSoundOptions");
  }
}

const dims = { overworld: new Dimension("overworld") };

/* Event signals: only the members that exist in @minecraft/server 2.1.0
   (stable). Anything else is `undefined`, exactly like the real module. */
const BEFORE = ["effectAdd", "entityRemove", "explosion", "itemUse", "playerBreakBlock", "playerGameModeChange",
  "playerInteractWithBlock", "playerInteractWithEntity", "playerLeave", "weatherChange"];
const AFTER = ["blockExplode", "buttonPush", "dataDrivenEntityTrigger", "effectAdd", "entityDie", "entityHealthChanged",
  "entityHitBlock", "entityHitEntity", "entityHurt", "entityLoad", "entityRemove", "entitySpawn", "explosion",
  "gameRuleChange", "itemCompleteUse", "itemReleaseUse", "itemStartUse", "itemStartUseOn", "itemStopUse", "itemStopUseOn",
  "itemUse", "leverAction", "pistonActivate", "playerBreakBlock", "playerButtonInput", "playerDimensionChange",
  "playerEmote", "playerGameModeChange", "playerHotbarSelectedSlotChange", "playerInputModeChange",
  "playerInputPermissionCategoryChange", "playerInteractWithBlock", "playerInteractWithEntity",
  "playerInventoryItemChange", "playerJoin", "playerLeave", "playerPlaceBlock", "playerSpawn", "pressurePlatePop",
  "pressurePlatePush", "projectileHitBlock", "projectileHitEntity", "targetBlockHit", "tripWireTrip", "weatherChange", "worldLoad"];
class Signal {
  constructor(name) { this.name = name; this.handlers = []; }
  subscribe(fn) { if (typeof fn !== "function") throw new TypeError(`${this.name}.subscribe: callback`); this.handlers.push(fn); return fn; }
  unsubscribe(fn) { this.handlers = this.handlers.filter((h) => h !== fn); }
  emit(ev) { for (const h of this.handlers) h(ev); return ev; }
}
const signals = (names) => Object.freeze(Object.fromEntries(names.map((n) => [n, new Signal(n)])));

/* Custom command registry (2.1.0). */
class CustomCommandRegistry {
  constructor() { this.commands = new Map(); this.enums = new Map(); }
  registerCommand(def, cb) {
    if (!def || typeof def.name !== "string" || !/^[a-z0-9_]+:[a-z0-9_]+$/.test(def.name)) {
      throw new Error(`NamespaceNameError: command name '${def?.name}' must be namespace:name`);
    }
    if (def.name.startsWith("minecraft:")) throw new Error("NamespaceNameError: reserved namespace");
    if (typeof def.description !== "string") throw new TypeError("CustomCommand.description required");
    if (![0, 1, 2, 3, 4].includes(def.permissionLevel)) throw new TypeError("CustomCommand.permissionLevel required");
    if (def.cheatsRequired !== undefined && typeof def.cheatsRequired !== "boolean") throw new TypeError("cheatsRequired: boolean");
    for (const p of [...(def.mandatoryParameters ?? []), ...(def.optionalParameters ?? [])]) {
      if (typeof p.name !== "string" || !Object.values(CustomCommandParamType).includes(p.type)) {
        throw new TypeError(`CustomCommandParameter '${p?.name}': bad type '${p?.type}'`);
      }
    }
    for (const k of Object.keys(def)) {
      if (!["name", "description", "permissionLevel", "cheatsRequired", "mandatoryParameters", "optionalParameters"].includes(k)) {
        throw new TypeError(`CustomCommand: unknown field '${k}'`);
      }
    }
    if (this.commands.has(def.name)) throw new Error(`CustomCommandError: '${def.name}' already registered`);
    if (typeof cb !== "function") throw new TypeError("registerCommand: callback");
    this.commands.set(def.name, { def, cb });
  }
  registerEnum(name, values) {
    if (typeof name !== "string" || !name.includes(":") || !Array.isArray(values)) throw new TypeError("registerEnum(name, values)");
    this.enums.set(name, values);
  }
  /** Test helper: runs a command as the engine would. */
  run(name, origin, ...args) {
    const c = this.commands.get(name);
    if (!c) throw new Error(`Unknown command ${name}`);
    const min = (c.def.mandatoryParameters ?? []).length;
    const max = min + (c.def.optionalParameters ?? []).length;
    if (args.length < min || args.length > max) throw new Error(`Syntax error: ${name} takes ${min}..${max} args`);
    const res = c.cb(origin, ...args);
    if (res !== undefined && (typeof res !== "object" || ![0, 1].includes(res.status))) throw new TypeError("CustomCommandResult");
    return res;
  }
}

const world = {
  getDimension: (n) => dims.overworld,
  getAllPlayers: () => dims.overworld.getPlayers(),
  dynamicProps: new Map(),
  setDynamicProperty(k, v) {
    if (v === undefined || v === null) this.dynamicProps.delete(k);
    else this.dynamicProps.set(k, v);
  },
  getDynamicProperty(k) { return this.dynamicProps.get(k); },
  day: 1, timeOfDay: 0,
  getDay() { return this.day; },
  getTimeOfDay() { return this.timeOfDay; },
  scoreboard: {
    getObjective: () => null,
    addObjective: () => ({ getParticipants: () => [], setScore() {}, removeParticipant() {} }),
    setObjectiveAtDisplaySlot() {},
  },
  afterEvents: signals(AFTER),
  beforeEvents: signals(BEFORE),
  sendMessage(m) { if (typeof m !== "string" && typeof m !== "object") throw new TypeError("sendMessage"); },
};

const system = {
  currentTick: 0,
  intervals: [],
  runInterval(fn, ticks) { if (typeof fn !== "function") throw new TypeError("runInterval"); this.intervals.push({ fn, ticks: ticks ?? 1 }); return this.intervals.length; },
  runTimeout(fn) { if (typeof fn !== "function") throw new TypeError("runTimeout"); return 0; },
  run(fn) { if (typeof fn !== "function") throw new TypeError("run"); fn(); return 0; },
  beforeEvents: signals(["shutdown", "startup"]),
  afterEvents: signals(["scriptEventReceive"]),
  /** Test helper: fires startup with a fresh registry and returns it. */
  startup() {
    const customCommandRegistry = new CustomCommandRegistry();
    this.beforeEvents.startup.emit({ customCommandRegistry, blockComponentRegistry: {}, itemComponentRegistry: {} });
    return customCommandRegistry;
  },
  /** Test helper: runs every interval whose period divides `tick`. */
  tick(tick) { this.currentTick = tick; for (const i of this.intervals) if (tick % i.ticks === 0) i.fn(); },
};

export const CommandPermissionLevel = { Any: 0, GameDirectors: 1, Admin: 2, Host: 3, Owner: 4 };
export const CustomCommandStatus = { Success: 0, Failure: 1 };
export const CustomCommandSource = { Block: "Block", Entity: "Entity", NPCDialogue: "NPCDialogue", Server: "Server" };
export const CustomCommandParamType = {
  BlockType: "BlockType", Boolean: "Boolean", EntitySelector: "EntitySelector", EntityType: "EntityType", Enum: "Enum",
  Float: "Float", Integer: "Integer", ItemType: "ItemType", Location: "Location", PlayerSelector: "PlayerSelector", String: "String",
};
export const DisplaySlotId = { Sidebar: "Sidebar", List: "List", BelowName: "BelowName" };
export const ObjectiveSortOrder = { Ascending: 0, Descending: 1 };

export { world, system, BlockPermutation, ItemStack, Entity, Player, Dimension, AIR };
