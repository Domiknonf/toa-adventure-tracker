import {
  MODULE_ID, MOON_DEFAULTS, PACES, PACE_ORDER, SUPPLY_DEFAULTS, DEFAULT_HEX_SIZE,
  PARTY_SOURCE, REFRESH_HOOK
} from "./const.mjs";

/** Tell every open window that something it shows has changed. See REFRESH_HOOK. */
const refresh = () => Hooks.callAll(REFRESH_HOOK);

/**
 * WORLD OPTIONS.
 *
 * Every rule knob is world-scoped, because two people looking at the same travel
 * day must see the same distance. The only client-scoped entry is the roll dialog
 * toggle, which is a question about one person's clicks and nothing else.
 *
 * `state` is the odd one out: it is world-scoped like the rest but `config: false`,
 * because it is the module's data, not a setting anybody should type into. Its
 * onChange is what synchronises every open window - a world setting written by the
 * GM lands on all clients, so no extra broadcast is needed (see socket.mjs).
 */

const WORLD = { scope: "world", config: true, requiresReload: false };

export function registerSettings() {
  /** Shorthand: name/hint keys always follow the setting key. */
  const reg = (key, data) => game.settings.register(MODULE_ID, key, {
    name: `${MODULE_ID}.settings.${key}.name`,
    hint: `${MODULE_ID}.settings.${key}.hint`,
    onChange: refresh,
    ...data
  });

  /* --- The stored state ------------------------------------- */

  game.settings.register(MODULE_ID, "state", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    // Fires on EVERY client when the GM writes, which is the entire
    // synchronisation story for this module.
    onChange: refresh
  });

  /* --- Moon -------------------------------------------------- */

  reg("cycleLength", {
    ...WORLD, type: Number, default: MOON_DEFAULTS.cycleLength,
    range: { min: 2, max: 120, step: 1 }
  });
  reg("fullMoonDay", { ...WORLD, type: Number, default: MOON_DEFAULTS.fullMoonDay });

  /* --- Travel pace ------------------------------------------- */

  // Six plain numbers rather than one JSON blob: these are the values a GM
  // actually retunes ("my jungle is slower"), and a number field they can drag is
  // worth more than the tidiness of a single setting they would have to hand-edit.
  for (const pace of PACE_ORDER) {
    reg(`${pace}Miles`, {
      ...WORLD, type: Number, default: PACES[pace].miles,
      range: { min: 0, max: 100, step: 1 }
    });
    reg(`${pace}Mod`, { ...WORLD, type: Number, default: PACES[pace].mod });
  }

  /**
   * Whether the pace is also handed to dnd5e's own roll pipeline. The system's
   * 5.3 skill config carries per-pace advantage/disadvantage rules
   * (CONFIG.DND5E.skills.<key>.pace), so with this on, scouting at a fast pace
   * picks up its disadvantage without this module knowing that rule exists.
   *
   * Separate from the numeric modifier above and stacks with it: the modifier is
   * this module's house rule on navigation, the pace flag is the system's rule on
   * everything else.
   */
  reg("usePaceRules", { ...WORLD, type: Boolean, default: true });

  /** Miles per hex, for the second line under the distance. */
  reg("hexSize", {
    ...WORLD, type: Number, default: DEFAULT_HEX_SIZE,
    range: { min: 1, max: 60, step: 1 }
  });

  /* --- Party ------------------------------------------------- */

  reg("partySource", {
    ...WORLD, type: String, default: PARTY_SOURCE.PLAYERS,
    choices: {
      [PARTY_SOURCE.PLAYERS]: `${MODULE_ID}.settings.partySource.players`,
      [PARTY_SOURCE.GROUP]:   `${MODULE_ID}.settings.partySource.group`
    }
  });

  /**
   * Which group actor, when partySource is "group". Accepts an id, a uuid or the
   * actor's plain name - see tasks.resolveGroupActor(). A free text field rather
   * than a generated dropdown because settings are registered at `init`, long
   * before `game.actors` exists to be listed.
   */
  reg("groupActor", { ...WORLD, type: String, default: "" });

  /* --- Tasks ------------------------------------------------- */

  /**
   * Custom tasks as a JSON array, MERGED onto the defaults by id: a matching id
   * overrides that default, a new id is appended, and `"hidden": true` removes a
   * default. Invalid JSON is reported once and then ignored, so a typo costs a
   * warning rather than the whole window. Format documented in the README.
   */
  reg("customTasks", { ...WORLD, type: String, default: "" });

  /* --- Supplies ---------------------------------------------- */

  /** 0 = derive from the party size. Anything else is taken literally. */
  reg("travelers", {
    ...WORLD, type: Number, default: 0,
    range: { min: 0, max: 200, step: 1 }
  });
  reg("waterPerHead", {
    ...WORLD, type: Number, default: SUPPLY_DEFAULTS.waterPerHead,
    range: { min: 0, max: 20, step: 0.5 }
  });
  reg("rainCollector", { ...WORLD, type: Boolean, default: false });
  reg("conSaveDC", {
    ...WORLD, type: Number, default: SUPPLY_DEFAULTS.conSaveDC,
    range: { min: 1, max: 30, step: 1 }
  });

  /* --- Per-user presentation --------------------------------- */

  /**
   * Skip dnd5e's roll configuration dialog. Client-scoped: whether you want to be
   * asked about advantage every time is your business, not the table's, and it
   * changes nothing about the result that gets stored.
   */
  reg("skipRollDialog", { scope: "client", config: true, type: Boolean, default: false });
}

/* ------------------------------------------------------------------ */
/*  Readers                                                            */
/* ------------------------------------------------------------------ */

/** One reader for the whole module, so nobody spells a setting key twice. */
export const setting = (key) => game.settings.get(MODULE_ID, key);

/**
 * The configured pace table, `{ slow: {miles, mod}, ... }`, read fresh.
 *
 * Built per call rather than cached: settings change at runtime and a stale pace
 * table shows a distance nobody can explain. It is six `game.settings.get` calls
 * against an in-memory map, which is not worth a cache invalidation bug.
 */
export function paceTable() {
  return Object.fromEntries(PACE_ORDER.map(pace => [pace, {
    miles: Number(setting(`${pace}Miles`)) || 0,
    mod: Number(setting(`${pace}Mod`)) || 0
  }]));
}
