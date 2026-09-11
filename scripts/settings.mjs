import {
  MODULE_ID, MOON_DEFAULTS, PACES, PACE_ORDER, SUPPLY_DEFAULTS, PARTY_SOURCE,
  REFRESH_HOOK, WEATHER_DEFAULTS, ENCOUNTER_DEFAULTS, RAIN_CATCHER_BONUS
} from "./const.mjs";

/** Tell every open window that something it shows has changed. See REFRESH_HOOK. */
const refresh = () => Hooks.callAll(REFRESH_HOOK);

/**
 * WORLD OPTIONS.
 *
 * Every rule knob is world-scoped, because two people looking at the same travel
 * day must see the same outcome. The only client-scoped entry is the roll dialog
 * toggle, which is a question about one person's clicks and nothing else.
 *
 * There is deliberately NO weather switch. Weather is rolled (see weather.mjs) -
 * the whole supply economy depends on dry spells being something that happens TO
 * the party rather than something the GM remembers to impose.
 */

const WORLD = { scope: "world", config: true, requiresReload: false };

export function registerSettings() {
  const reg = (key, data) => game.settings.register(MODULE_ID, key, {
    name: `${MODULE_ID}.settings.${key}.name`,
    hint: `${MODULE_ID}.settings.${key}.hint`,
    onChange: refresh,
    ...data
  });

  /* --- The stored state ------------------------------------- */

  game.settings.register(MODULE_ID, "state", {
    scope: "world", config: false, type: Object, default: {}, onChange: refresh
  });

  /* --- Moon -------------------------------------------------- */

  reg("cycleLength", {
    ...WORLD, type: Number, default: MOON_DEFAULTS.cycleLength,
    range: { min: 2, max: 120, step: 1 }
  });
  reg("fullMoonDay", { ...WORLD, type: Number, default: MOON_DEFAULTS.fullMoonDay });

  /* --- Travel pace ------------------------------------------- */

  // Only the navigation modifier is tunable; the hex ceiling of each pace is a
  // rule of the module (0/1/2 and nothing else), not a number to drift.
  for (const pace of PACE_ORDER) {
    reg(`${pace}NavMod`, { ...WORLD, type: Number, default: PACES[pace].navMod });
  }

  /**
   * Whether the pace is also handed to dnd5e's own roll pipeline, so its per-pace
   * advantage rules apply (advantage on Stealth while slow, disadvantage on
   * Perception while fast). Independent of the navigation modifier above.
   */
  reg("usePaceRules", { ...WORLD, type: Boolean, default: true });

  /* --- Weather ----------------------------------------------- */

  reg("stormChance", {
    ...WORLD, type: Number, default: WEATHER_DEFAULTS.stormChance,
    range: { min: 0, max: 100, step: 1 }
  });
  reg("rainChance", {
    ...WORLD, type: Number, default: WEATHER_DEFAULTS.rainChance,
    range: { min: 0, max: 100, step: 1 }
  });
  reg("rainCatcher", { ...WORLD, type: Boolean, default: false });
  reg("rainCatcherBonus", {
    ...WORLD, type: Number, default: RAIN_CATCHER_BONUS,
    range: { min: 0, max: 40, step: 1 }
  });

  /* --- Encounters -------------------------------------------- */

  reg("encounterChance", {
    ...WORLD, type: Number, default: ENCOUNTER_DEFAULTS.baseChance,
    range: { min: 0, max: 100, step: 5 }
  });

  /* --- Party ------------------------------------------------- */

  reg("partySource", {
    ...WORLD, type: String, default: PARTY_SOURCE.PLAYERS,
    choices: {
      [PARTY_SOURCE.PLAYERS]: `${MODULE_ID}.settings.partySource.players`,
      [PARTY_SOURCE.GROUP]:   `${MODULE_ID}.settings.partySource.group`
    }
  });
  reg("groupActor", { ...WORLD, type: String, default: "" });

  /** 0 = derive from the party size. Anything else is taken literally. */
  reg("travelers", {
    ...WORLD, type: Number, default: 0,
    range: { min: 0, max: 200, step: 1 }
  });

  /* --- Roles ------------------------------------------------- */

  reg("customRoles", { ...WORLD, type: String, default: "" });

  /* --- Supplies ---------------------------------------------- */

  reg("waterPerHead", {
    ...WORLD, type: Number, default: SUPPLY_DEFAULTS.waterPerHead,
    range: { min: 0, max: 20, step: 0.5 }
  });
  reg("foodPerHead", {
    ...WORLD, type: Number, default: SUPPLY_DEFAULTS.foodPerHead,
    range: { min: 0, max: 20, step: 0.5 }
  });
  reg("hungerGrace", {
    ...WORLD, type: Number, default: SUPPLY_DEFAULTS.hungerGrace,
    range: { min: 0, max: 10, step: 1 }
  });

  /* --- Encounter sizing --------------------------------------- */

  /**
   * The party's level, for the hard/deadly encounter suggestions.
   *
   * 0 means "work it out from the characters", which is right most of the time.
   * Set it when the sheets do not reflect the table - a one-shot at level 6 run
   * on level 1 characters, say.
   */
  reg("partyLevel", {
    ...WORLD, type: Number, default: 0,
    range: { min: 0, max: 20, step: 1 }
  });

  /* --- Consequences ------------------------------------------ */

  /**
   * Whether completing a day writes damage and exhaustion onto the sheets.
   *
   * ON by default - the point of the day report is that the jungle actually
   * costs something. Turn it off for a table that would rather apply it by hand;
   * the report still says exactly what it would have done.
   */
  reg("applyConsequences", { ...WORLD, type: Boolean, default: true });

  /**
   * Whether the engine rolls the saving throws that events call for. With this
   * off every save is treated as failed, which is harsher - but it is the
   * setting for a table that wants to roll its own saves at the table.
   */
  reg("rollSaves", { ...WORLD, type: Boolean, default: true });

  /**
   * Whether the day report reaches the players at all.
   *
   * OFF by default, and the window does not merely hide it - players are never
   * sent the report in the first place (see app.mjs _prepareContext). The event
   * texts are written to be read ALOUD; a player who can read ahead in their own
   * window has already had the surprise spoiled, and hiding it in CSS would
   * leave it sitting in the DOM for anyone curious enough to look.
   *
   * Switched on, the chat summary posted when the day completes goes to the
   * whole table instead of just the GM.
   */
  reg("shareReport", { ...WORLD, type: Boolean, default: false });

  /* --- Per-user presentation --------------------------------- */

  reg("skipRollDialog", { scope: "client", config: true, type: Boolean, default: false });
}

/* ------------------------------------------------------------------ */
/*  Readers                                                            */
/* ------------------------------------------------------------------ */

/** One reader for the whole module, so nobody spells a setting key twice. */
export const setting = (key) => game.settings.get(MODULE_ID, key);

/**
 * The configured pace table, read fresh on every call. Settings change at
 * runtime and a cached pace table shows an outcome nobody can explain.
 */
export function paceTable() {
  return Object.fromEntries(PACE_ORDER.map(pace => [pace, {
    ...PACES[pace],
    navMod: Number(setting(`${pace}NavMod`)) || 0
  }]));
}
