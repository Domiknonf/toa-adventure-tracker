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

/* --- Foundry's Math extension ------------------------------------- */
// Foundry adds this to the global Math; the engine clamps hexes and percentages
// with it, so the shim has to supply it too.
Math.clamp ??= (value, min, max) => Math.min(Math.max(value, min), max);

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
    escapeHTML: (v) => String(v).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
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
      med: { label: "Medizin", ability: "wis", fullKey: "medicine" },
      inv: { label: "Nachforschungen", ability: "int", fullKey: "investigation" },
      // The social three. Missing them once meant a retort silently fell back
      // to a bare Charisma check and the test that was meant to prove the
      // skill roll passed anyway - the same shape of hole as the Investigation
      // gap that quietly dropped the cartographer.
      per: { label: "Überzeugen", ability: "cha", fullKey: "persuasion" },
      dec: { label: "Täuschen", ability: "cha", fullKey: "deception" },
      prf: { label: "Auftreten", ability: "cha", fullKey: "performance" }
    },
    abilities: {
      str: { label: "Stärke", fullKey: "strength" },
      dex: { label: "Geschicklichkeit", fullKey: "dexterity" },
      con: { label: "Konstitution", fullKey: "constitution" },
      int: { label: "Intelligenz", fullKey: "intelligence" },
      wis: { label: "Weisheit", fullKey: "wisdom" },
      cha: { label: "Charisma", fullKey: "charisma" }
    },
    travelPace: { slow: {}, normal: {}, fast: {} },
    conditionTypes: { exhaustion: { levels: 6 } }
  }
};

/* --- Actors ------------------------------------------------------- */
/**
 * `owner` says this is a player character at all (`hasPlayerOwner`), which is
 * what puts it in the travelling party. `mine` says THIS user owns it, which is
 * what decides whether they may press its buttons. They are the same thing for
 * most test actors and deliberately separable: another player's character is a
 * party member the viewer may not act for, and nothing else models that.
 */
export function makeActor({ id, name, skills = {}, abilities = {}, owner = true, mine = owner, hp = 30, exhaustion = 0, level = 5 }) {
  return {
    id, name, uuid: `Actor.${id}`, type: "character",
    img: `icons/${id}.webp`,
    isOwner: mine,
    hasPlayerOwner: owner,
    testUserPermission: (user) => (user?.isGM ? true : mine),
    system: {
      isCreature: true,
      attributes: { hp: { value: hp, max: hp }, exhaustion },
      details: { level },
      skills: Object.fromEntries(Object.entries(skills).map(([k, v]) => [k, { total: v }])),
      abilities: Object.fromEntries(Object.entries(abilities).map(([k, v]) => [k, { mod: v }]))
    },
    // What the engine writes. Recorded so a test can assert it went through the
    // system's own path rather than a raw hp update.
    damageTaken: [],
    async applyDamage(amount) {
      this.damageTaken.push(amount);
      this.system.attributes.hp.value = Math.max(0, this.system.attributes.hp.value - amount);
      return this;
    },
    async update(data) {
      if ("system.attributes.exhaustion" in data) {
        this.system.attributes.exhaustion = data["system.attributes.exhaustion"];
      }
      return this;
    },
    /** Saves obey `saveResult`: true = everyone passes, false = everyone fails. */
    async rollSavingThrow(config, dialog, message = {}) {
      this.calls.push({ method: "rollSavingThrow", config, dialog, message });
      // dnd5e only creates the card when create is not false; the shim has to
      // match, or a test cannot tell a silent save from a noisy one.
      if (message.create !== false) chatMessages.push({ roll: "save", actor: this.id });
      const pass = saveResult.value;
      return [{ total: pass ? 99 : 1, options: { target: config.target } }];
    },
    getRollData: () => ({ prof: 2 }),
    // Records how it was called, so a test can assert the roll went through the
    // system's own entry point with the right configuration.
    calls: [],
    async rollSkill(config, dialog, message = {}) {
      this.calls.push({ method: "rollSkill", config, dialog, message });
      // dnd5e only creates the card when `create` is not false. The shim has to
      // match, or a test cannot tell a silent roll from a noisy one.
      if (message.create !== false) chatMessages.push({ roll: "skill", actor: this.id });
      return [makeRoll(config, this.system.skills[config.skill]?.total ?? 0)];
    },
    async rollAbilityCheck(config, dialog, message = {}) {
      this.calls.push({ method: "rollAbilityCheck", config, dialog, message });
      if (message.create !== false) chatMessages.push({ roll: "check", actor: this.id });
      return [makeRoll(config, this.system.abilities[config.ability]?.mod ?? 0)];
    }
  };
}

/** The next d20 face the fake role roller will produce. Set by a test. */
export const dice = { d20: 12 };

/** Whether saving throws pass. Set by a test. */
export const saveResult = { value: false };

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
/**
 * A deterministic Roll.
 *
 * `queue` lets a test dictate the next d100 (weather, encounters) so a day can
 * be steered; anything not queued uses the average face, which keeps damage and
 * yields stable across runs. Real dice would make every assertion a coin flip.
 */
export const queue = { d100: [], d20: [], randomWhenEmpty: false };

globalThis.Roll = class {
  constructor(formula, data) { this.formula = String(formula); this.data = data ?? {}; }
  async evaluate() {
    if (/@nonsense/.test(this.formula)) throw new Error("bad formula");
    const mod = Number(this.data?.mod ?? 0);

    const d100 = this.formula.match(/^\s*1d100\s*$/);
    if (d100) {
      if (queue.d100.length) { this.total = queue.d100.shift(); return this; }
      // Tests queue their d100s so a day is reproducible; the balance probe
      // sets `randomWhenEmpty` because a fixed 50 would pin the weather to
      // "rain" forever and make every encounter roll identical - which is
      // exactly the kind of quiet determinism that makes a simulation lie.
      this.total = queue.randomWhenEmpty ? 1 + Math.floor(Math.random() * 100) : 50;
      return this;
    }

    // NdM (+ K) and "@mod" - enough for every formula this module builds.
    let total = 0;
    for (const m of this.formula.matchAll(/(\d+)d(\d+)/g)) {
      const [, n, faces] = m;
      // The average face, rounded up: 1d6 -> 4, 2d6 -> 8. Stable and non-trivial.
      total += Number(n) * Math.ceil((Number(faces) + 1) / 2);
    }
    for (const m of this.formula.matchAll(/(?:^|[+\s])(\d+)(?![d\d])/g)) total += Number(m[1]);
    if (/@mod/.test(this.formula)) total += mod;

    this.total = total;
    this.formula = this.formula.replace("@mod", String(mod));
    return this;
  }
  async toMessage() {
    messages.push(this.formula);
    // A yield card is a chat message like any other, and Dice So Nice animates
    // it - so it has to be counted where the tests count them.
    chatMessages.push({ roll: "yield", formula: this.formula });
    return {};
  }
};
export const messages = [];

globalThis.ChatMessage = {
  getSpeaker: () => ({}),
  getWhisperRecipients: () => [{ id: "gm" }],
  create: async (data) => { chatMessages.push(data); return data; }
};
export const chatMessages = [];
globalThis.JournalEntry = {
  create: async (data) => { journals.push(data); return { sheet: { render() {} } }; }
};
export const journals = [];

/* --- game --------------------------------------------------------- */
export const settingValues = {};

export function setupGame({ actors = [], isGM = true, gmOnline = true, character = null } = {}) {
  const store = new Map(actors.map(a => [a.id, a]));
  const list = [...actors];
  list.get = (id) => store.get(id);
  list.getName = (name) => list.find(a => a.name === name);

  globalThis.game = {
    // `character` is the actor a player brought to the table - what the role
    // board fills its "you" column from. Null for a user who has none, which
    // is the normal case for a GM.
    user: { id: "user1", isGM, isActiveGM: isGM, character },
    users: {
      activeGM: gmOnline ? { id: "gm" } : null,
      // Keyed by id, not by the session: the GM-side permission check asks
      // "who sent this", and answering with the RECEIVER's rights would make
      // every socket message look like it came from a GM.
      get: (id) => ({ id, isGM: id === "gm", name: id === "gm" ? "GM" : "Player" })
    },
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
