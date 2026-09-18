import {
  MODULE_ID, MOON_DEFAULTS, PACES, PACE_ORDER, PARTY_SOURCE,
  REFRESH_HOOK, WEATHER_DEFAULTS, ENCOUNTER_DEFAULTS, DAMAGE_SCALE_DEFAULT
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
  // Only the NAVIGATION modifier is a setting. What a pace does to the other
  // roles is the rule that makes the three paces differ at all (see PACES), so
  // it is not a knob that can be turned until they collapse into each other.
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

  /* --- Encounters -------------------------------------------- */

  reg("encounterChance", {
    ...WORLD, type: Number, default: ENCOUNTER_DEFAULTS.baseChance,
    range: { min: 0, max: 100, step: 5 }
  });

  /**
   * How hard the jungle bites, in percent of the rolled damage.
   *
   * The dial for the one balance question no measurement of mine can settle:
   * how bloody a travel day should be is a matter of taste at a table. 100
   * leaves every event's dice exactly as written.
   */
  reg("damageScale", {
    ...WORLD, type: Number, default: DAMAGE_SCALE_DEFAULT,
    range: { min: 25, max: 300, step: 5 }
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

  /* --- Roles ------------------------------------------------- */

  reg("customRoles", { ...WORLD, type: String, default: "" });

  /* --- Kin ---------------------------------------------------- */

  /**
   * The grung in the party, by name, id or uuid.
   *
   * Empty by default, and that is not a degraded mode: with nothing here the
   * grung-kin events never enter the pools at all, because a patrol that
   * recognises one of its own makes no sense in a party that has none.
   *
   * Filled in, the jungle starts noticing. See KIN in const.mjs.
   */
  reg("grungKin", { ...WORLD, type: String, default: "" });

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

  /**
   * Whether players may pick their own role and roll it.
   *
   * OFF by default: this is a GM's tool, and the window a player opens is a
   * shop window - the travel day, the moon, how you are travelling and what is
   * left in the barrels. Nothing they can press.
   *
   * Switched on, the roles panel comes back for them and each player rolls
   * their own character, which puts the roll on their client where their dice
   * and their advantage keybinds live. The switch is enforced GM-side in
   * socket.mjs as well as hidden in the window: a socket message is only data,
   * and anybody can emit one.
   */
  reg("playerRolls", { ...WORLD, type: Boolean, default: false });

  /**
   * Whether the travel day moves on its own once every traveller is ready.
   *
   * OFF by default, because a counter that moves without being asked is a
   * surprise the first time. Either way the GM is told once everybody has
   * checked in - that notification costs nothing and is useful on its own.
   */
  reg("advanceOnReady", { ...WORLD, type: Boolean, default: false });

  /**
   * Whether the role checks and yield rolls produce chat cards.
   *
   * ON by default: "Gandalf rolled 18 on Survival" is the visible, meaningful
   * part of a travel day and belongs in the log everyone can see.
   *
   * Switched OFF, rolling eight roles is instant rather than eight 3D dice
   * animations in a row, which is the difference between a click and a minute
   * for anyone running Dice So Nice. Nothing is lost - the totals are on the
   * roles panel and the outcome is in the report.
   *
   * The saving throws the engine makes during resolution are NOT covered by
   * this and never reach chat either way: a dozen cards nobody asked for is
   * noise whatever your dice settings (see resolve.rollSave).
   */
  reg("rollsToChat", { ...WORLD, type: Boolean, default: true });

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
