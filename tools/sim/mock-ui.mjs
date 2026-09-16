/**
 * Headless mock of @minecraft/server-ui 2.0.0.
 *
 * STRICT: it enforces the 2.0.0 signatures (options objects instead of the
 * 1.x positional `valueStep/defaultValue/defaultValueIndex` arguments) and
 * throws on misuse — the real engine throws a TypeError at runtime, and that
 * is exactly the class of bug a headless sim must catch.
 *
 * Forms auto-cancel unless a scripted answer is queued via `queueResponse`.
 */
const responses = [];
/** Queue an answer for the next form shown: {selection} or {formValues}. */
export function queueResponse(r) { responses.push(r); }
export function pendingResponses() { return responses.length; }
export const shown = [];

function text(v, where) {
  if (typeof v === "string") return;
  if (v && typeof v === "object" && ("text" in v || "translate" in v || "rawtext" in v)) return;
  throw new TypeError(`${where}: expected string | RawMessage, got ${describe(v)}`);
}
function num(v, where) {
  if (typeof v !== "number" || Number.isNaN(v)) throw new TypeError(`${where}: expected number, got ${describe(v)}`);
}
function opts(v, where, allowed) {
  if (v === undefined || v === null) return;
  if (typeof v !== "object" || Array.isArray(v)) {
    throw new TypeError(`${where}: expected an options object { ${allowed.join(", ")} } (server-ui 2.0.0), got ${describe(v)}`);
  }
  for (const k of Object.keys(v)) {
    if (!allowed.includes(k)) throw new TypeError(`${where}: unknown option '${k}' (allowed: ${allowed.join(", ")})`);
  }
}
function describe(v) { return v === undefined ? "undefined" : Array.isArray(v) ? "array" : typeof v === "object" ? "object" : `${typeof v} ${JSON.stringify(v)}`; }
function arity(args, max, where) {
  if (args.length > max) throw new TypeError(`${where}: too many arguments (${args.length} > ${max}) — 2.0.0 takes an options object`);
}

export class ActionFormData {
  constructor() { this._buttons = 0; this._title = ""; }
  title(t) { text(t, "ActionFormData.title"); this._title = t; return this; }
  body(t) { text(t, "ActionFormData.body"); return this; }
  button(t, icon) {
    text(t, "ActionFormData.button");
    if (icon !== undefined && typeof icon !== "string") throw new TypeError("ActionFormData.button: iconPath must be a string");
    this._buttons++; return this;
  }
  divider() { return this; }
  header(t) { text(t, "ActionFormData.header"); return this; }
  label(t) { text(t, "ActionFormData.label"); return this; }
  async show(player) {
    if (!player || typeof player.sendMessage !== "function") throw new TypeError("ActionFormData.show: player required");
    shown.push({ kind: "action", title: this._title, buttons: this._buttons });
    const r = responses.shift();
    if (!r) return { canceled: true, cancelationReason: "UserClosed" };
    if (r.selection >= this._buttons) throw new RangeError(`show: scripted selection ${r.selection} but form has ${this._buttons} buttons`);
    return { canceled: false, selection: r.selection };
  }
}

export class MessageFormData {
  constructor() { this._title = ""; }
  title(t) { text(t, "MessageFormData.title"); this._title = t; return this; }
  body(t) { text(t, "MessageFormData.body"); return this; }
  button1(t) { text(t, "MessageFormData.button1"); return this; }
  button2(t) { text(t, "MessageFormData.button2"); return this; }
  async show() {
    shown.push({ kind: "message", title: this._title });
    const r = responses.shift();
    return r ? { canceled: false, selection: r.selection } : { canceled: true };
  }
}

export class ModalFormData {
  constructor() { this._fields = []; this._title = ""; }
  title(t) { text(t, "ModalFormData.title"); this._title = t; return this; }
  submitButton(t) { text(t, "ModalFormData.submitButton"); return this; }
  divider() { return this; }
  header(t) { text(t, "ModalFormData.header"); return this; }
  label(t) { text(t, "ModalFormData.label"); return this; }
  textField(label, placeholder, o, ...rest) {
    arity([label, placeholder, o, ...rest].filter((x) => x !== undefined), 3, "ModalFormData.textField");
    text(label, "textField.label"); text(placeholder, "textField.placeholder");
    opts(o, "ModalFormData.textField", ["defaultValue", "tooltip"]);
    this._fields.push({ kind: "text", def: o?.defaultValue ?? "" }); return this;
  }
  dropdown(label, items, o, ...rest) {
    arity([label, items, o, ...rest].filter((x) => x !== undefined), 3, "ModalFormData.dropdown");
    text(label, "dropdown.label");
    if (!Array.isArray(items)) throw new TypeError("dropdown.items must be an array");
    items.forEach((it, i) => text(it, `dropdown.items[${i}]`));
    opts(o, "ModalFormData.dropdown", ["defaultValueIndex", "tooltip"]);
    const d = o?.defaultValueIndex ?? 0;
    if (items.length && (d < 0 || d >= items.length)) throw new RangeError(`dropdown: defaultValueIndex ${d} out of range (0..${items.length - 1})`);
    this._fields.push({ kind: "dropdown", def: d, n: items.length }); return this;
  }
  slider(label, min, max, o, ...rest) {
    arity([label, min, max, o, ...rest].filter((x) => x !== undefined), 4, "ModalFormData.slider");
    text(label, "slider.label"); num(min, "slider.min"); num(max, "slider.max");
    if (min > max) throw new RangeError(`slider: min ${min} > max ${max}`);
    opts(o, "ModalFormData.slider", ["defaultValue", "valueStep", "tooltip"]);
    const def = o?.defaultValue ?? min;
    if (def < min || def > max) throw new RangeError(`slider "${label}": defaultValue ${def} outside ${min}..${max}`);
    this._fields.push({ kind: "slider", def }); return this;
  }
  toggle(label, o, ...rest) {
    arity([label, o, ...rest].filter((x) => x !== undefined), 2, "ModalFormData.toggle");
    text(label, "toggle.label");
    opts(o, "ModalFormData.toggle", ["defaultValue", "tooltip"]);
    this._fields.push({ kind: "toggle", def: o?.defaultValue ?? false }); return this;
  }
  async show(player) {
    if (!player || typeof player.sendMessage !== "function") throw new TypeError("ModalFormData.show: player required");
    shown.push({ kind: "modal", title: this._title, fields: this._fields.length });
    const r = responses.shift();
    if (!r) return { canceled: true, cancelationReason: "UserClosed" };
    // Scripted values overlay defaults, index by field order.
    const values = this._fields.map((f, i) => (r.formValues && r.formValues[i] !== undefined ? r.formValues[i] : f.def));
    return { canceled: false, formValues: values };
  }
}
