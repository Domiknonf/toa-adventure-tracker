/**
 * A Foundry shim that is just real enough to run this module's logic and render
 * its template. Not a test framework - a harness that turns "does it throw" and
 * "does the template read a field the context does not have" into an exit code.
 */
import fs from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";

const ROOT = path.resolve(import.meta.dirname, "../..");
const lang = JSON.parse(fs.readFileSync(`${ROOT}/lang/de.json`, "utf8"));

/* --- foundry.utils ------------------------------------------------ */
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
function mergeObject(original, other = {}, { inplace = true } = {}) {
  const target = inplace ? original : structuredClone(original);
  for (const [k, v] of Object.entries(other ?? {})) {
    if (isObj(v) && isObj(target[k])) mergeObject(target[k], v, { inplace: true });
    else target[k] = isObj(v) ? structuredClone(v) : v;
  }
  return target;
}

globalThis.foundry = {
  utils: {
    mergeObject,
    deepClone: (v) => structuredClone(v),
    debounce: (fn) => fn
  },
  applications: {
    api: {
      // Enough of ApplicationV2 for the subclass to be declared and driven.
      ApplicationV2: class {
        constructor(options = {}) { this.options = options; this.rendered = false; }
        render() { this.rendered = true; return this; }
      },
      HandlebarsApplicationMixin: (Base) => class extends Base {},
      DialogV2: { confirm: async () => true }
    },
    handlebars: { loadTemplates: async () => {} }
  },
  data: { fields: {} }
};

/* --- i18n --------------------------------------------------------- */
const i18n = {
  localize: (key) => lang[key] ?? key,
  format: (key, data = {}) =>
    String(lang[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => data[k] ?? `{${k}}`),
  has: (key) => key in lang
};

/* --- CONFIG.DND5E ------------------------------------------------- */
globalThis.CONFIG = {
  DND5E: {
    skills: {
      sur: { label: "Überleben", ability: "wis", fullKey: "survival" },
      prc: { label: "Wahrnehmung", ability: "wis", fullKey: "perception" },
      ste: { label: "Heimlichkeit", ability: "dex", fullKey: "stealth" },
      ath: { label: "Athletik", ability: "str", fullKey: "athletics" },
      med: { label: "Medizin", ability: "wis", fullKey: "medicine" }
    },
    abilities: {
      str: { label: "Stärke", fullKey: "strength" },
      dex: { label: "Geschicklichkeit", fullKey: "dexterity" },
      con: { label: "Konstitution", fullKey: "constitution" },
      int: { label: "Intelligenz", fullKey: "intelligence" },
      wis: { label: "Weisheit", fullKey: "wisdom" },
      cha: { label: "Charisma", fullKey: "charisma" }
    },
    travelPace: { slow: {}, normal: {}, fast: {} }
  }
};

/* --- Actors ------------------------------------------------------- */
export function makeActor({ id, name, skills = {}, abilities = {}, owner = true }) {
  return {
    id, name, uuid: `Actor.${id}`, type: "character",
    img: `icons/${id}.webp`,
    isOwner: owner,
    hasPlayerOwner: owner,
    testUserPermission: () => owner,
    system: {
      isCreature: true,
      skills: Object.fromEntries(Object.entries(skills).map(([k, v]) => [k, { total: v }])),
      abilities: Object.fromEntries(Object.entries(abilities).map(([k, v]) => [k, { mod: v }]))
    },
    getRollData: () => ({ prof: 2 }),
    // Records how it was called, so a test can assert the roll went through the
    // system's own entry point with the right configuration.
    calls: [],
    async rollSkill(config, dialog, message) {
      this.calls.push({ method: "rollSkill", config, dialog, message });
      return [makeRoll(config, this.system.skills[config.skill]?.total ?? 0)];
    },
    async rollAbilityCheck(config, dialog, message) {
      this.calls.push({ method: "rollAbilityCheck", config, dialog, message });
      return [makeRoll(config, this.system.abilities[config.ability]?.mod ?? 0)];
    }
  };
}

/** The next d20 face the fake roller will produce. Set by a test. */
export const dice = { d20: 12 };

function makeRoll(config, mod = 0) {
  const pace = config.rolls?.[0]?.data?.pace ?? 0;
  const total = dice.d20 + mod + pace;
  return {
    total,
    formula: `1d20 + ${mod}${pace ? ` + ${pace}` : ""}`,
    dice: [{ total: dice.d20 }],
    options: { target: config.target },
    get isSuccess() { return Number.isFinite(this.options.target) && this.total >= this.options.target; }
  };
}

/* --- Roll (for yields) -------------------------------------------- */
globalThis.Roll = class {
  constructor(formula, data) { this.formula = formula; this.data = data; }
  async evaluate() {
    // "1d6 + @mod" -> 4 + mod, deterministically.
    const mod = Number(this.data?.mod ?? 0);
    if (!/^\s*1d6\s*\+\s*@mod\s*$/.test(this.formula)) {
      if (/@nonsense/.test(this.formula)) throw new Error("bad formula");
    }
    this.total = 4 + mod;
    this.formula = `1d6 + ${mod}`;
    return this;
  }
  async toMessage() { messages.push(this.formula); return {}; }
};
export const messages = [];

globalThis.ChatMessage = { getSpeaker: () => ({}) };
globalThis.JournalEntry = {
  create: async (data) => { journals.push(data); return { sheet: { render() {} } }; }
};
export const journals = [];

/* --- game --------------------------------------------------------- */
export const settingValues = {};

export function setupGame({ actors = [], isGM = true, gmOnline = true } = {}) {
  const store = new Map(actors.map(a => [a.id, a]));
  const list = [...actors];
  list.get = (id) => store.get(id);
  list.getName = (name) => list.find(a => a.name === name);

  globalThis.game = {
    user: { id: "user1", isGM, isActiveGM: isGM },
    users: { activeGM: gmOnline ? { id: "gm" } : null, get: () => ({ id: "user1", isGM, name: "Tester" }) },
    i18n,
    actors: list,
    modules: { get: () => ({ api: null }) },
    socket: { on() {}, emit(...args) { emitted.push(args); } },
    settings: {
      register(module, key, data) { if (!(key in settingValues)) settingValues[key] = data.default; },
      get(module, key) { return settingValues[key]; },
      async set(module, key, value) { settingValues[key] = value; Hooks.callAll("toa-adventure-tracker.refresh"); }
    }
  };
  return list;
}

export const emitted = [];

/* --- Hooks -------------------------------------------------------- */
const hooks = {};
globalThis.Hooks = {
  on: (name, fn) => (hooks[name] ??= []).push(fn),
  once: (name, fn) => (hooks[name] ??= []).push(fn),
  call: (name, ...a) => { for (const fn of hooks[name] ?? []) if (fn(...a) === false) return false; return true; },
  callAll: (name, ...a) => { for (const fn of hooks[name] ?? []) fn(...a); return true; },
  fire: (name, ...a) => Hooks.callAll(name, ...a)
};

globalThis.ui = { notifications: { warn: (m) => notes.push(["warn", m]), info: (m) => notes.push(["info", m]), error: (m) => notes.push(["error", m]) } };
export const notes = [];

/* --- Handlebars --------------------------------------------------- */
Handlebars.registerHelper("localize", (key) => i18n.localize(key));
Handlebars.registerHelper("checked", (v) => (v ? "checked" : ""));

export function compileTemplate() {
  const src = fs.readFileSync(`${ROOT}/templates/tracker.hbs`, "utf8");
  return Handlebars.compile(src);
}

export { Handlebars };
