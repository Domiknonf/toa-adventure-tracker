/**
 * Central constants and default tables.
 *
 * Everything that a GM might want to change lives in a world setting (see
 * settings.mjs); what stands here is either the DEFAULT for one of those, or a
 * value that is structural rather than a rule. Keeping both in one file means a
 * question like "what is the default water need" has exactly one answer to read.
 */

export const MODULE_ID = "toa-adventure-tracker";
export const SOCKET = `module.${MODULE_ID}`;

/**
 * Hook fired whenever anything the window shows has changed - the state itself,
 * or any setting that feeds a displayed number.
 *
 * It exists to keep settings.mjs from importing app.mjs. Without it the graph is
 * settings -> app -> state -> settings, and an import cycle in a Foundry module
 * does not announce itself: it resolves to a half-initialised binding and the
 * symptom is a window that renders once and then silently stops.
 */
export const REFRESH_HOOK = `${MODULE_ID}.refresh`;

/**
 * Shape version of the stored world state (see state.mjs).
 *
 * Raise this ONLY together with a step in state.migrate(), and only when the
 * stored shape CHANGES MEANING. A new optional field needs nothing - a state that
 * lacks it already reads correctly through the defaults in state.blankState().
 */
export const STATE_SCHEMA = 1;

/* ------------------------------------------------------------------ */
/*  Moon                                                               */
/* ------------------------------------------------------------------ */

/** Default lunar cycle in days, and the day that is a full moon. Both are settings. */
export const MOON_DEFAULTS = { cycleLength: 30, fullMoonDay: 1 };

/**
 * The eight phase names, as fractions of the cycle measured from full moon.
 *
 * `from`/`to` are positions in the cycle normalised to [0, 1), where 0 is full
 * moon and 0.5 is new moon. The quarters get a narrow band around the exact point
 * rather than a single value, because a 30 day cycle puts day 8 at 0.2333 - never
 * exactly 0.25 - and "Letztes Viertel" is the honest name for it.
 *
 * Order matters: moon.phaseOf() returns the FIRST band that contains the position,
 * so the bands must be listed in ascending order and must cover [0, 1) without a
 * gap. The final band wraps past 1 back onto full moon.
 */
export const MOON_PHASES = [
  { key: "full",           from: 0.000, to: 0.030 },
  { key: "waningGibbous",  from: 0.030, to: 0.220 },
  { key: "lastQuarter",    from: 0.220, to: 0.280 },
  { key: "waningCrescent", from: 0.280, to: 0.470 },
  { key: "new",            from: 0.470, to: 0.530 },
  { key: "waxingCrescent", from: 0.530, to: 0.720 },
  { key: "firstQuarter",   from: 0.720, to: 0.780 },
  { key: "waxingGibbous",  from: 0.780, to: 0.970 },
  { key: "full",           from: 0.970, to: 1.000 }
];

/** Geometry of the rendered moon disc, in SVG user units (see moon.discPath). */
export const MOON_DISC = { size: 96, radius: 40 };

/* ------------------------------------------------------------------ */
/*  Travel pace                                                        */
/* ------------------------------------------------------------------ */

/**
 * The three paces, their default miles per day and their default modifier on the
 * NAVIGATION roll. All six numbers are world settings; these are only the seeds.
 *
 * The keys are deliberately the same three dnd5e itself uses in
 * `CONFIG.DND5E.travelPace` (slow / normal / fast), which is what lets tasks.mjs
 * hand the pace straight to `actor.rollSkill()` and pick up the system's own pace
 * rules (advantage on Stealth while slow, disadvantage on Perception while fast)
 * for free - see the `usePaceRules` setting.
 */
export const PACES = {
  slow:   { miles: 9,  mod:  5, order: 10 },
  normal: { miles: 10, mod:  0, order: 20 },
  fast:   { miles: 15, mod: -5, order: 30 }
};

/** Pace keys in display order, resolved once at load. */
export const PACE_ORDER = Object.keys(PACES).sort((a, b) => PACES[a].order - PACES[b].order);

/** Default pace of a fresh state. */
export const DEFAULT_PACE = "normal";

/* ------------------------------------------------------------------ */
/*  Tasks                                                              */
/* ------------------------------------------------------------------ */

/**
 * The task that decides the day's distance. Exactly one task carries this role,
 * and the whole distance block in the window keys off it - so it is a constant
 * here rather than a flag somebody could set twice in the JSON.
 *
 * A custom task list that drops or renames `navigation` simply has no distance
 * roll; the window then shows the pace's full miles unmodified, which is the
 * honest reading of "nobody navigated".
 */
export const NAVIGATION_TASK = "navigation";

/**
 * The two tasks whose yield the supply block adds up. Same reasoning as
 * NAVIGATION_TASK: the water/food panel asks a specific question ("is the party's
 * thirst covered"), and it has to know which task answers it.
 *
 * A custom list may drop either. The panel then shows no gathered amount for it,
 * and - for water - falls back to reporting the need as uncovered, which is what
 * "nobody went looking" actually means.
 */
export const WATER_TASK = "water";
export const FOOD_TASK = "food";

/**
 * DEFAULT TASK LIST.
 *
 * Each entry is:
 *   id      - stable key. What the world state stores, and what a custom entry
 *             overrides by matching. Never shown to a player.
 *   skill   - a key of CONFIG.DND5E.skills ("sur", "prc", "ste", ...), or
 *   ability - a key of CONFIG.DND5E.abilities ("wis", "str", ...).
 *             Exactly one of the two. `skill` wins if both are given.
 *   dc      - the DC the roll is compared against.
 *   yield   - optional `{ formula, unit }`. Rolled ONLY on a success, as a plain
 *             Roll (it is a resource, not a d20 test - nothing in the system has
 *             an opinion about it). `@mod` in the formula resolves to the same
 *             modifier the check used, which is what "1d6 + WEI" means here.
 *   icon    - Font Awesome class. Foundry ships FA, so this loads nothing.
 *
 * Labels and descriptions are NOT here: they come from lang/*.json under
 * `<module>.task.<id>.label` / `.hint`, so the list is translatable. A custom
 * task supplies its own `label`/`hint` inline instead (see README).
 */
export const DEFAULT_TASKS = [
  {
    id: "navigation",
    skill: "sur",
    dc: 15,
    icon: "fa-solid fa-compass"
  },
  {
    id: "water",
    skill: "sur",
    dc: 10,
    yield: { formula: "1d6 + @mod", unit: "gallons" },
    icon: "fa-solid fa-droplet"
  },
  {
    id: "food",
    skill: "sur",
    dc: 10,
    yield: { formula: "1d6 + @mod", unit: "pounds" },
    icon: "fa-solid fa-drumstick-bite"
  },
  {
    id: "vanguard",
    skill: "prc",
    dc: 12,
    icon: "fa-solid fa-binoculars"
  },
  {
    id: "rearguard",
    skill: "ste",
    dc: 12,
    icon: "fa-solid fa-shoe-prints"
  }
];

/* ------------------------------------------------------------------ */
/*  Supplies                                                           */
/* ------------------------------------------------------------------ */

/** Default gallons of water one traveller needs per day, and the CON save DC. */
export const SUPPLY_DEFAULTS = { waterPerHead: 2, conSaveDC: 15 };

/** Default size of one hex on the travel map, in miles. */
export const DEFAULT_HEX_SIZE = 10;

/* ------------------------------------------------------------------ */
/*  Logbook                                                            */
/* ------------------------------------------------------------------ */

/**
 * How many completed days the log keeps. Older entries fall off the front.
 *
 * A cap rather than a setting on purpose: the log lives inside a world SETTING,
 * which is one JSON blob rewritten in full on every change. Thirty entries is a
 * couple of kilobytes; an uncapped log on a year-long campaign is not, and the
 * cost lands on every client at every day change. Export to a journal first
 * (see app.mjs #onExportLog) if the whole history has to be kept.
 */
export const LOG_LIMIT = 30;

/* ------------------------------------------------------------------ */
/*  Actor source                                                       */
/* ------------------------------------------------------------------ */

/** Where the party list comes from. Values of the `partySource` setting. */
export const PARTY_SOURCE = { GROUP: "group", PLAYERS: "players" };

/** Debounce for re-rendering open windows after a state change, in ms. */
export const DEBOUNCE_MS = 60;
