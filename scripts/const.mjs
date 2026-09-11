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
export const STATE_SCHEMA = 2;

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
 * The three paces. A day is measured in HEXES, never in miles: the only three
 * answers this module gives are "no hex", "one hex" and "two hexes".
 *
 * `max` is the ceiling a pace can reach on a perfect day, `navMod` the modifier
 * on the navigation roll, and `encounterMod` the change to the day's encounter
 * chance in percentage points. Hurrying through jungle is how you walk into
 * things; creeping is how you avoid them and get nowhere.
 *
 * The keys are the same three dnd5e uses in `CONFIG.DND5E.travelPace`, which is
 * what lets roles.mjs hand the pace straight to the system's roll pipeline and
 * pick up its own pace rules for free.
 */
export const PACES = {
  slow:   { max: 1, navMod:  5, encounterMod: -10, order: 10 },
  normal: { max: 1, navMod:  0, encounterMod:   0, order: 20 },
  // -3 rather than the -5 a miles-based model would use. Under the hex rule a
  // failed navigation costs the WHOLE day rather than half of it, so -5 made
  // hurrying strictly worse than walking - measured over 300 simulated days it
  // averaged 0.40 hexes against normal pace's 0.69, which is not a gamble but a
  // trap. At -3 it averages about the same as normal with far more spread: more
  // lost days, and the only pace that ever makes two. Both are settings.
  fast:   { max: 2, navMod: -3, encounterMod:  10, order: 30 }
};

export const PACE_ORDER = Object.keys(PACES).sort((a, b) => PACES[a].order - PACES[b].order);
export const DEFAULT_PACE = "normal";

/** Hexes a party covers on an ordinary day before anything helps or hinders. */
export const BASE_HEXES = 1;

/**
 * How far past the DC the navigator must land for a fast day to make two hexes.
 *
 * A margin rather than a flat "fast doubles": without it the pace carries no
 * risk worth weighing, and with too high a margin (5 was the first try) the
 * second hex effectively never happens and fast pace is pure downside.
 */
export const MARGIN_FOR_EXTRA_HEX = 3;

/**
 * Party exhaustion ceilings on the day's travel.
 *
 * Read as: at this much exhaustion (the HIGHEST level any single traveller
 * carries, not a sum), the party cannot make more than this many hexes. Worn-out
 * people do not march, however good the navigator is - and it gives the
 * exhaustion the rest of this module hands out somewhere to land.
 */
export const EXHAUSTION_LIMITS = [
  { atLeast: 5, hexes: 0 },
  { atLeast: 3, hexes: 1 }
];

/* ------------------------------------------------------------------ */
/*  Roles                                                              */
/* ------------------------------------------------------------------ */

/**
 * THE ROLES.
 *
 * Each traveller signs up for one job for the day and rolls it. How well the
 * party fills its roles is the whole input to how far it gets and how much it
 * suffers - there is no separate "encounter roll" the GM makes on the side.
 *
 * Fields:
 *   id            stable key; what the state stores.
 *   skill/ability what it is rolled with. Resolved through CONFIG.DND5E, never
 *                 hardcoded, so a renamed or added skill keeps working.
 *   dc            the target.
 *   unfilled      what happens when NOBODY takes the role:
 *                   "fail"  - treated exactly as a failed roll.
 *                   "worse" - treated as a failure AND the role's penalty is
 *                             sharpened (see resolve.mjs). Used where having
 *                             nobody is genuinely worse than having someone
 *                             who had a bad day: nobody watching the front at
 *                             all is not the same as a distracted lookout.
 *                   "none"  - no penalty; the role is a bonus when filled.
 *   yield         optional `{ formula, unit }`, rolled only on a success.
 *
 * Labels and descriptions live in lang/*.json under `<module>.role.<id>.*`.
 */
export const DEFAULT_ROLES = [
  {
    // Decides whether the party moves at all. The one role with no substitute.
    id: "navigator",
    skill: "sur",
    dc: 15,
    unfilled: "worse",
    icon: "fa-solid fa-compass"
  },
  {
    // Watches the front. Failing here is what turns an encounter into an ambush.
    id: "vanguard",
    skill: "prc",
    dc: 12,
    unfilled: "worse",
    icon: "fa-solid fa-binoculars"
  },
  {
    // Watches the back and covers the trail. Failing raises the odds that
    // something follows the party home.
    id: "rearguard",
    skill: "ste",
    dc: 12,
    unfilled: "worse",
    icon: "fa-solid fa-shoe-prints"
  },
  {
    // Water. In Chult the question is never "is there water" but "is it safe".
    id: "waterbearer",
    skill: "sur",
    dc: 12,
    unfilled: "fail",
    yield: { formula: "1d6 + @mod", unit: "gallons" },
    icon: "fa-solid fa-droplet"
  },
  {
    // Food. Less urgent than water and slower to hurt.
    id: "forager",
    skill: "sur",
    dc: 12,
    unfilled: "fail",
    yield: { formula: "1d6 + @mod", unit: "pounds" },
    icon: "fa-solid fa-drumstick-bite"
  },
  {
    // Makes camp. A bad camp is a night that does not count as a rest.
    id: "quartermaster",
    skill: "sur",
    dc: 12,
    unfilled: "fail",
    icon: "fa-solid fa-campground"
  },
  {
    // Treats the damage the jungle does. The only role that REMOVES exhaustion.
    id: "medic",
    skill: "med",
    dc: 12,
    unfilled: "none",
    icon: "fa-solid fa-kit-medical"
  },
  {
    // Keeps the map. Cannot find the way alone, but can get the party back onto
    // it after the navigator loses it - a wasted day instead of a lost one.
    id: "cartographer",
    skill: "inv",
    dc: 12,
    unfilled: "none",
    icon: "fa-solid fa-map"
  }
];

/** Role ids the engine reasons about by name. */
export const ROLE = {
  NAVIGATOR: "navigator",
  VANGUARD: "vanguard",
  REARGUARD: "rearguard",
  WATER: "waterbearer",
  FORAGER: "forager",
  QUARTERMASTER: "quartermaster",
  MEDIC: "medic",
  CARTOGRAPHER: "cartographer"
};

/* ------------------------------------------------------------------ */
/*  Weather                                                            */
/* ------------------------------------------------------------------ */

/**
 * Weather is ROLLED, never set by hand.
 *
 * Chult in the wet season rains most days, and the whole water economy below
 * depends on that being a fact of the world rather than a switch somebody
 * remembers to flip. The two chances are settings; what is left over is dry.
 *
 * `water` is how many gallons the day's weather puts into the party's barrels
 * on its own, before anybody goes looking. A storm gives the most water and
 * costs the most time - which is exactly the trade the jungle makes.
 */
export const WEATHER = {
  storm: { rain: true,  water: 6, blocks: true,  order: 10 },
  rain:  { rain: true,  water: 3, blocks: false, order: 20 },
  humid: { rain: false, water: 0, blocks: false, order: 30 },
  clear: { rain: false, water: 0, blocks: false, order: 40, thirsty: true }
};

/** Default percentage chances. The remainder is split between humid and clear. */
export const WEATHER_DEFAULTS = { stormChance: 10, rainChance: 55 };

/**
 * Extra water each traveller needs on a clear, baking day.
 *
 * A multiplier rather than a flat number so it scales with the party, and the
 * reason the `clear` entry above is not simply "nothing happens": a cloudless
 * day in Chult is a cost, not a rest.
 */
export const CLEAR_DAY_THIRST = 1.5;

/* ------------------------------------------------------------------ */
/*  Supplies                                                           */
/* ------------------------------------------------------------------ */

/**
 * Supplies CARRY OVER between days. That is the whole point: "a few days with
 * no rain and no water left" is only a sentence that can mean anything if
 * yesterday's barrels are still on the books this morning.
 */
export const SUPPLY_DEFAULTS = {
  waterPerHead: 2,        // gallons per traveller per day
  foodPerHead: 1,         // pounds per traveller per day
  startWater: 0,
  startFood: 0,
  thirstSaveDC: 15,       // CON save to avoid exhaustion from thirst
  hungerSaveDC: 10,       // CON save to avoid exhaustion from hunger
  foulWaterSaveDC: 12,    // CON save after drinking what the jungle offered
  // Days the party can go short on food before it starts costing exhaustion.
  // Water has no such grace: thirst in Chult is same-day.
  hungerGrace: 2
};

/** How much water a rain catcher adds on a rainy day, on top of the weather. */
export const RAIN_CATCHER_BONUS = 4;

/* ------------------------------------------------------------------ */
/*  Encounters                                                         */
/* ------------------------------------------------------------------ */

/**
 * Chance in percent that the day turns up something with teeth, before the
 * party's own choices move it. Modified by pace and by how well the rearguard
 * did (see resolve.mjs).
 */
export const ENCOUNTER_DEFAULTS = { baseChance: 20, rearguardFailMod: 15, rearguardUnfilledMod: 25 };

/**
 * How likely a failed or unfilled role is to ACTUALLY produce its event.
 *
 * Not a certainty, and that is the important part. A party of four cannot fill
 * eight roles, so several are empty every single day - and if each empty role
 * fired its event every morning, the report would be the same paragraphs over
 * and over and none of them would land. A chance turns an empty role into a
 * risk the party carries rather than a toll it pays.
 *
 * Navigation, supplies and weather are deliberately NOT in this table: those are
 * arithmetic, not luck. A navigator who failed HAS lost the way, and an empty
 * water skin IS empty.
 */
export const EVENT_CHANCE = {
  pursuit: { failed: 35, unfilled: 45 },
  camp:    { failed: 30, unfilled: 35 }
};

/* ------------------------------------------------------------------ */
/*  Events                                                             */
/* ------------------------------------------------------------------ */

/**
 * THE EVENT COMPILATION.
 *
 * Every day the engine produces REASONS, not just numbers. A day that cost the
 * party a hex says which pack of raptors cost it; a day somebody lost hit points
 * says what bit them.
 *
 * Entries carry mechanics only. The prose lives in lang/*.json under
 * `<module>.event.<id>`, so the whole compilation is translatable and a GM can
 * overwrite any single line in a translation file without touching code.
 *
 * Fields:
 *   id        stable key, and the i18n key.
 *   damage    a dice formula, rolled ONCE for the event and applied to every
 *             affected traveller. Rolling per head reads better in theory and
 *             in practice just produces five near-identical numbers.
 *   exhaustion  levels added to each affected traveller.
 *   save      `{ ability, dc }` - when present, each affected traveller rolls it
 *             through the system and a success cancels that traveller's damage
 *             and exhaustion. This is how "möglicherweise Erschöpfung" stays a
 *             maybe rather than a certainty.
 *   blocks    true = the day is spent dealing with this; costs one hex.
 *   target    "party"  every traveller
 *             "random" one traveller, chosen at random
 *   heals     levels of exhaustion REMOVED (the medic's good days).
 *
 * CATEGORIES, and what pulls from them:
 *   ambush     an encounter the vanguard did not see coming
 *   encounter  an encounter the vanguard DID see coming - same jungle, and the
 *              party gets to choose; this is where good scouting pays
 *   pursuit    the rearguard left a trail
 *   lost       the navigator lost the thread
 *   detour     the navigator lost it but the cartographer found it again
 *   foul       what the water did
 *   thirst     not enough water
 *   hunger     not enough food
 *   camp       a night that was not a rest
 *   storm      weather with an opinion
 *   boon       the jungle's rare good mood
 */
export const EVENTS = [
  /* --- Ambushes: the vanguard missed it ------------------------- */
  { id: "raptors",      category: "ambush", damage: "2d6", blocks: true,  target: "party" },
  { id: "zombieHorde",  category: "ambush", damage: "2d8", blocks: true,  target: "party" },
  { id: "snake",        category: "ambush", damage: "1d8", save: { ability: "con", dc: 13 }, exhaustion: 1, target: "random" },
  { id: "pterafolk",    category: "ambush", damage: "2d6", blocks: true,  target: "random" },
  { id: "batiri",       category: "ambush", damage: "1d10", blocks: true, target: "party" },
  { id: "assassinVine", category: "ambush", damage: "1d10", save: { ability: "str", dc: 14 }, target: "random" },
  { id: "stirges",      category: "ambush", damage: "1d6", exhaustion: 1, target: "random" },
  { id: "girallon",     category: "ambush", damage: "3d6", blocks: true,  target: "random" },
  { id: "yuanti",       category: "ambush", damage: "2d6", blocks: true,  target: "party" },
  { id: "quicksand",    category: "ambush", damage: "1d6", save: { ability: "str", dc: 13 }, blocks: true, target: "random" },

  /* --- Encounters spotted in time: the vanguard earned its keep -- */
  { id: "tRexTracks",   category: "encounter", blocks: true,  target: "party" },
  { id: "raptorsSeen",  category: "encounter", blocks: false, target: "party" },
  { id: "zombiesSeen",  category: "encounter", blocks: true,  target: "party" },
  { id: "grungPatrol",  category: "encounter", blocks: false, target: "party" },
  { id: "hadrosaurs",   category: "encounter", blocks: false, target: "party" },
  { id: "tabaxiHunter", category: "encounter", blocks: false, target: "party" },
  { id: "vegepygmies",  category: "encounter", blocks: true,  target: "party" },
  { id: "aldani",       category: "encounter", blocks: false, target: "party" },
  { id: "flailSnail",   category: "encounter", blocks: false, target: "party" },

  /* --- Pursuit: the rearguard left a trail ---------------------- */
  { id: "followedEyes", category: "pursuit", blocks: false, target: "party" },
  { id: "batiriTrail",  category: "pursuit", damage: "1d6", target: "random" },
  { id: "undeadFollow", category: "pursuit", blocks: false, target: "party" },
  { id: "kamadan",      category: "pursuit", damage: "2d6", exhaustion: 1, save: { ability: "con", dc: 13 }, target: "random" },
  { id: "drumsAtNight", category: "pursuit", exhaustion: 1, target: "party" },

  /* --- Lost: no map to fall back on ----------------------------- */
  { id: "circles",      category: "lost", target: "party" },
  { id: "riverWrong",   category: "lost", target: "party" },
  { id: "canopyDark",   category: "lost", target: "party" },
  { id: "ravine",       category: "lost", exhaustion: 1, target: "party" },
  { id: "swampDetour",  category: "lost", target: "party" },

  /* --- Detour: lost, but the cartographer got them back --------- */
  { id: "backtrack",    category: "detour", target: "party" },
  { id: "mapRedrawn",   category: "detour", target: "party" },
  { id: "landmark",     category: "detour", target: "party" },

  /* --- Foul water ----------------------------------------------- */
  { id: "stagnant",     category: "foul", exhaustion: 1, save: { ability: "con", dc: 12 }, target: "party" },
  { id: "leeches",      category: "foul", damage: "1d4", exhaustion: 1, save: { ability: "con", dc: 12 }, target: "random" },
  { id: "carcass",      category: "foul", exhaustion: 1, save: { ability: "con", dc: 14 }, target: "party" },
  { id: "brackish",     category: "foul", exhaustion: 1, save: { ability: "con", dc: 10 }, target: "party" },

  /* --- Thirst ---------------------------------------------------- */
  { id: "throatsDry",   category: "thirst", exhaustion: 1, save: { ability: "con", dc: 15 }, target: "party" },
  { id: "rationedSips", category: "thirst", exhaustion: 1, save: { ability: "con", dc: 15 }, target: "party" },
  { id: "heatHaze",     category: "thirst", exhaustion: 1, save: { ability: "con", dc: 15 }, target: "party" },

  /* --- Hunger ---------------------------------------------------- */
  { id: "bellyEmpty",   category: "hunger", exhaustion: 1, save: { ability: "con", dc: 10 }, target: "party" },
  { id: "rotten",       category: "hunger", exhaustion: 1, save: { ability: "con", dc: 10 }, target: "party" },

  /* --- A camp that was not a rest -------------------------------- */
  { id: "wetCamp",      category: "camp", exhaustion: 1, save: { ability: "con", dc: 12 }, target: "party" },
  { id: "antSwarm",     category: "camp", damage: "1d4", exhaustion: 1, target: "random" },
  { id: "noFire",       category: "camp", exhaustion: 1, save: { ability: "con", dc: 12 }, target: "party" },
  { id: "mosquitoes",   category: "camp", exhaustion: 1, save: { ability: "con", dc: 13 }, target: "party" },

  /* --- Storms ----------------------------------------------------- */
  { id: "monsoon",      category: "storm", blocks: true, target: "party" },
  { id: "mudslide",     category: "storm", damage: "2d6", save: { ability: "dex", dc: 13 }, blocks: true, target: "party" },
  { id: "lightning",    category: "storm", damage: "3d6", save: { ability: "dex", dc: 15 }, target: "random" },
  { id: "riverFlood",   category: "storm", blocks: true, target: "party" },

  /* --- The jungle's good days ------------------------------------- */
  { id: "chwinga",      category: "boon", heals: 1, target: "party" },
  { id: "ruinShelter",  category: "boon", heals: 1, target: "party" },
  { id: "freshSpring",  category: "boon", target: "party" },
  { id: "gameTrail",    category: "boon", target: "party" },
  { id: "fruitGrove",   category: "boon", target: "party" }
];

/** Event categories, for grouping and for the "one per category" rule. */
export const EVENT_CATEGORY = {
  AMBUSH: "ambush", ENCOUNTER: "encounter", PURSUIT: "pursuit", LOST: "lost",
  DETOUR: "detour", FOUL: "foul", THIRST: "thirst", HUNGER: "hunger",
  CAMP: "camp", STORM: "storm", BOON: "boon"
};

/**
 * Chance in percent that a flawless day turns up a boon. Small on purpose: the
 * good days are worth something because they are rare.
 */
export const BOON_CHANCE = 25;

/** How many completed days the log keeps. See the note on LOG_LIMIT below. */
export const LOG_LIMIT = 30;

/** Where the party list comes from. Values of the `partySource` setting. */
export const PARTY_SOURCE = { GROUP: "group", PLAYERS: "players" };

/** Debounce for re-rendering open windows after a state change, in ms. */
export const DEBOUNCE_MS = 60;
