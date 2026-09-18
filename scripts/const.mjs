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
export const STATE_SCHEMA = 3;

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
  /**
   * THE THREE PACES.
   *
   * `navMod` modifies the NAVIGATION roll; `mods` modifies the other roles;
   * `encounterMod` shifts the day's encounter chance in percentage points.
   *
   * WHAT A FAST PACE COSTS, and why it is not the navigation roll:
   *
   * 5e prices a fast pace in PERCEPTION (-5 passive) and in being unable to
   * move stealthily - not in getting lost. An earlier draft here charged it -3
   * on navigation instead, and that quietly made hurrying pointless: a failed
   * navigation costs the WHOLE day, so the extra lost days ate the two-hex days
   * and fast came out SLOWER than normal - 0.70 hexes a day against 0.77, over
   * 300 measured days each. A pace that covers less ground and meets more
   * trouble is not a trade, it is a mistake.
   *
   * Charging it where 5e charges it fixes both at once: fast covers the most
   * ground and pays by walking into things. A failed vanguard is an ambush
   * instead of a sighting, and a failed rearguard is something on your trail -
   * which is exactly what "we were moving too fast to look properly" means.
   *
   * Slow is the mirror: it covers the least ground and hides best.
   */
  slow: {
    // A token edge, not a decisive one. At +5 slow was simply the right answer
    // every morning (see MARGIN_FOR_BONUS_HEX).
    navMod: 1,
    mods: { rearguard: 5 },
    encounterMod: -10,
    order: 10
  },
  normal: {
    navMod: 0,
    mods: {},
    encounterMod: 0,
    order: 20
  },
  fast: {
    navMod: 0,
    mods: { vanguard: -5, rearguard: -5 },
    encounterMod: 10,
    order: 30
  }
};

/* ------------------------------------------------------------------ */
/*  Travel modes                                                       */
/* ------------------------------------------------------------------ */

/**
 * HOW THE PARTY IS TRAVELLING.
 *
 * The pace says how hard they are pushing; the MODE says what they are pushing.
 * A day under sail covers ground a day of hacking through jungle cannot, and
 * that difference belongs here rather than in the pace table - otherwise "fast"
 * would have to mean two different things at once.
 *
 * Fields:
 *   hexes     the day's ceiling per pace. This is what a good day gives; a bad
 *             navigation roll still takes it to 0, whatever the mode.
 *   terrains  which event pools the day draws from (see EVENTS.terrain). "any"
 *             events are always in play on top of these - thirst and a missed
 *             bearing happen wherever you are.
 *   roles     which roles the mode offers. A ship has no tracks to cover, so
 *             asking someone to walk rearguard on one is asking them to stand
 *             at the stern and feel useful.
 *   water     multiplier on how much the WEATHER puts in the barrels. At sea
 *             rain is the only fresh water there is, and a becalmed week is a
 *             real problem - which is why the sea has its own foul-water event
 *             for the crew that gives in and drinks what is over the side.
 *
 * Deliberately NOT settings. Four modes times three paces is twelve numbers
 * nobody wants to tune in a settings sheet, and the shape of the table - that a
 * ship outruns a canoe outruns a mule outruns a boot - is the rule rather than
 * a preference.
 */
export const TRAVEL_MODES = {
  // The original model, unchanged: 0, 1 or 2 hexes and nothing else.
  foot: {
    hexes: { slow: 1, normal: 1, fast: 2 },
    terrains: ["land"],
    roles: ["navigator", "vanguard", "rearguard", "quartermaster", "medic", "cartographer"],
    icon: "fa-solid fa-person-hiking",
    order: 10
  },
  // Faster over open ground, and the jungle has opinions about that: the mount
  // pool carries its own ways for a day to go wrong.
  mount: {
    hexes: { slow: 1, normal: 2, fast: 3 },
    terrains: ["land", "mount"],
    roles: ["navigator", "vanguard", "rearguard", "quartermaster", "medic", "cartographer"],
    icon: "fa-solid fa-horse",
    order: 20
  },
  // The river does half the work. You still camp on the bank, so the land pool
  // stays in play alongside the river one.
  canoe: {
    hexes: { slow: 1, normal: 2, fast: 3 },
    terrains: ["land", "river"],
    roles: ["navigator", "vanguard", "rearguard", "quartermaster", "medic", "cartographer"],
    icon: "fa-solid fa-sailboat",
    order: 30
  },
  // Much faster, and everything else gets harder. No tracks to cover, and the
  // only drinkable water is what falls out of the sky.
  ship: {
    hexes: { slow: 2, normal: 3, fast: 5 },
    terrains: ["sea"],
    roles: ["navigator", "vanguard", "quartermaster", "medic", "cartographer"],
    icon: "fa-solid fa-ship",
    order: 40
  }
};

export const MODE_ORDER = Object.keys(TRAVEL_MODES)
  .sort((a, b) => TRAVEL_MODES[a].order - TRAVEL_MODES[b].order);

export const DEFAULT_MODE = "foot";

/** Terrain an event belongs to. Events without one are land events. */
export const DEFAULT_TERRAIN = "land";

export const PACE_ORDER = Object.keys(PACES).sort((a, b) => PACES[a].order - PACES[b].order);
export const DEFAULT_PACE = "normal";

/**
 * How far past the DC the navigator must land for a fast day to make two hexes.
 *
 * A margin rather than a flat "fast doubles": without it the pace carries no
 * risk worth weighing, and with too high a margin (5 was the first try) the
 * second hex effectively never happens and fast pace is pure downside.
 */
export const MARGIN_FOR_EXTRA_HEX = 3;

/**
 * How far past the DC a NORMAL day must land to squeeze out one extra hex.
 *
 * This exists to stop slow pace being a free lunch. Wherever a mode's slow and
 * normal ceilings are the same - on foot they are both 1 - slow would otherwise
 * be strictly better than normal: same ground, better navigation, fewer
 * encounters, nothing given up. An option nobody can have a reason to pick is
 * not an option.
 *
 * So normal keeps a ceiling slow can never reach: on an exceptional bearing it
 * makes one hex more.
 */
export const MARGIN_FOR_BONUS_HEX = 8;

/**
 * How badly the navigator has to miss before the day is actually LOST.
 *
 * Missing the bearing by one is not the same mistake as going in circles, and
 * it should not cost the same day. Inside this margin the party loses the
 * morning to a wrong valley and picks the thread back up by afternoon: one
 * hexfield instead of none.
 *
 * The symmetric counterpart of MARGIN_FOR_EXTRA_HEX, and the single biggest
 * reason the module stopped feeling like a coin flip for a whole day's travel.
 *
 * It deliberately does NOT make the cartographer redundant: a near miss is
 * salvaged by anybody, a real one only by somebody with the map - and in the
 * faster modes the cartographer still salvages more than one hex where this
 * rule gives exactly one.
 */
export const MARGIN_FOR_SALVAGE = 2;

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
    /**
     * LOWER THAN THE REST LOOKS BACKWARDS - IT IS NOT.
     *
     * This is the one role whose failure costs the ENTIRE day, so its difficulty
     * has to be read together with that. At 15 a competent level-6 navigator
     * (Survival +5) missed 45 % of the time, and measured over 3000 days that
     * put half of all travel days at zero hexes - a party walking from dawn to
     * dusk and arriving nowhere, every other day.
     */
    dc: 13,
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
  storm: { rain: true,  blocks: true,  order: 10 },
  rain:  { rain: true,  blocks: false, order: 20 },
  humid: { rain: false, blocks: false, order: 30 },
  clear: { rain: false, blocks: false, order: 40 }
};

/** Default percentage chances. The remainder is split between humid and clear. */
export const WEATHER_DEFAULTS = { stormChance: 10, rainChance: 55 };


/* ------------------------------------------------------------------ */
/*  Supplies                                                           */
/* ------------------------------------------------------------------ */



/* ------------------------------------------------------------------ */
/*  Encounters                                                         */
/* ------------------------------------------------------------------ */

/**
 * Chance in percent that the day turns up something with teeth, before the
 * party's own choices move it. Modified by pace and by how well the rearguard
 * did (see resolve.mjs).
 */
export const ENCOUNTER_DEFAULTS = { baseChance: 45, rearguardFailMod: 15, rearguardUnfilledMod: 25 };

/**
 * Damage scale, in percent, applied to every event's rolled damage.
 *
 * THE ONE DIAL FOR "the jungle does not bite hard enough" - or the opposite.
 * It exists because that is a question of taste rather than of arithmetic: how
 * bloody a travel day should be depends on a table, and no measurement of mine
 * settles it. A setting can be turned at that table in ten seconds; a number
 * baked into 25 event entries cannot.
 *
 * Applied once, where the damage is rolled, so the report and the sheets can
 * never disagree about it.
 *
 * Above 100 it interacts with a house rule that bars long rests: hit points
 * then come back only from Hit Dice, and Hit Dice only from a long rest. See
 * the README before pushing this far up.
 */
export const DAMAGE_SCALE_DEFAULT = 200;

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
  pursuit: { failed: 45, unfilled: 55 },
  camp:    { failed: 25, unfilled: 30 }
};

/* ------------------------------------------------------------------ */
/*  Events                                                             */
/* ------------------------------------------------------------------ */

/**
 * KIN: EVENTS THAT ARE ABOUT SOMEBODY AT THE TABLE.
 *
 * An event may declare `kin`. It then enters the pools ONLY when the world has
 * named a traveller of that kin (see the `grungKin` setting), and its prose is
 * formatted with `{name}` - that traveller's own.
 *
 * The point is that a jungle full of grung should notice the grung walking
 * through it. A patrol that ignores your frog-blooded ranger is a patrol that
 * could have been anything; one that points at him and laughs is a scene.
 *
 * The kin never gets a worse day out of it than anybody else would: these are
 * ordinary events with ordinary costs, and the retort below is the way out of
 * every one of them.
 */
export const KIN = {
  GRUNG: "grung"
};

/**
 * A RETORT is a save made with words, by one particular character.
 *
 * Where an ordinary event offers each traveller a Constitution save, a kin
 * event offers ONE roll to the traveller it is about - the answer they shout
 * back. It is rolled once, not per head, and success cancels the event for
 * everyone, exactly as a passed save does.
 *
 * Its outcome also picks which half of the event's prose is read, so a retort
 * is worth rolling even for an event that costs nothing: the story is the point.

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
  { id: "raptors",      category: "ambush", damage: "2d6", blocks: true,  target: "party" , foe: { key: "velociraptor", cr: "1/4" }},
  { id: "zombieHorde",  category: "ambush", damage: "2d8", blocks: true,  target: "party" , foe: { key: "zombie", cr: "1/4" }},
  { id: "snake",        category: "ambush", damage: "1d8", save: { ability: "con", dc: 13 }, exhaustion: 1, target: "random" , foe: { key: "giantPoisonousSnake", cr: "1/4" }},
  { id: "pterafolk",    category: "ambush", damage: "2d6", blocks: true,  target: "party"  , foe: { key: "pterafolk", cr: "1" }},
  { id: "batiri",       category: "ambush", damage: "1d10", blocks: true, target: "party" , foe: { key: "goblin", cr: "1/4" }},
  { id: "assassinVine", category: "ambush", damage: "1d10", save: { ability: "str", dc: 14 }, target: "random" , foe: { key: "assassinVine", cr: "3" }},
  { id: "stirges",      category: "ambush", damage: "1d6", exhaustion: 1, save: { ability: "con", dc: 11 }, target: "random" , foe: { key: "stirge", cr: "1/8" }},
  { id: "girallon",     category: "ambush", damage: "3d6", blocks: true,  target: "party"  , foe: { key: "girallon", cr: "4" }},
  { id: "yuanti",       category: "ambush", damage: "2d6", blocks: true,  target: "party" , foe: { key: "yuantiPureblood", cr: "1" }},
  { id: "quicksand",    category: "ambush", damage: "1d6", save: { ability: "str", dc: 13 }, blocks: true, target: "random" },

  /* --- Encounters spotted in time: the vanguard earned its keep -- */
  { id: "tRexTracks",   category: "encounter", blocks: true,  target: "party" , foe: { key: "tyrannosaurus", cr: "8" }},
  { id: "raptorsSeen",  category: "encounter", blocks: false, damage: "1d6", save: { ability: "dex", dc: 12 }, target: "random" , foe: { key: "velociraptor", cr: "1/4" }},
  { id: "zombiesSeen",  category: "encounter", blocks: true,  damage: "1d6", save: { ability: "str", dc: 12 }, target: "random" , foe: { key: "zombie", cr: "1/4" }},
  { id: "grungPatrol",  category: "encounter", blocks: false, target: "party" , foe: { key: "grung", cr: "1/4" }},
  /* Grung who have noticed the grung walking with you. Only in play once the
     world names one (see KIN); the retort is how each of them ends. */
  { id: "grungMockery", category: "encounter", kin: KIN.GRUNG, blocks: false, damage: "1d4",
    target: "kin", retort: { skill: "per", dc: 12 }, foe: { key: "grung", cr: "1/4" }},
  { id: "grungToll",    category: "encounter", kin: KIN.GRUNG, blocks: false, exhaustion: 1,
    target: "party", retort: { skill: "dec", dc: 13 }, foe: { key: "grung", cr: "1/4" }},
  { id: "hadrosaurs",   category: "encounter", blocks: false, target: "party" , foe: { key: "hadrosaurus", cr: "1/4" }},
  { id: "tabaxiHunter", category: "encounter", blocks: false, target: "party" },
  { id: "vegepygmies",  category: "encounter", blocks: true,  damage: "1d6", save: { ability: "dex", dc: 12 }, target: "random" , foe: { key: "vegepygmy", cr: "1/4" }},
  { id: "aldani",       category: "encounter", blocks: false, damage: "1d8", save: { ability: "dex", dc: 13 }, target: "random" , foe: { key: "aldani", cr: "2" }},
  { id: "flailSnail",   category: "encounter", blocks: false, target: "party" , foe: { key: "flailSnail", cr: "3" }},

  /* --- Pursuit: the rearguard left a trail ---------------------- */
  { id: "followedEyes", category: "pursuit", blocks: false, target: "party" , terrain: "any"},
  { id: "grungNamesake", category: "pursuit", kin: KIN.GRUNG, blocks: false,
    target: "party", retort: { skill: "prf", dc: 13 }, foe: { key: "grung", cr: "1/4" }},
  { id: "batiriTrail",  category: "pursuit", damage: "1d6", target: "random" , foe: { key: "goblin", cr: "1/4" }},
  { id: "undeadFollow", category: "pursuit", blocks: false, target: "party" , foe: { key: "zombie", cr: "1/4" }},
  { id: "kamadan",      category: "pursuit", damage: "2d6", exhaustion: 1, save: { ability: "con", dc: 13 }, target: "random" , foe: { key: "kamadan", cr: "4" }},
  { id: "drumsAtNight", category: "pursuit", exhaustion: 1, save: { ability: "wis", dc: 12 }, target: "party" },

  /* --- Lost: no map to fall back on ----------------------------- */
  { id: "circles",      category: "lost", target: "party" },
  { id: "riverWrong",   category: "lost", target: "party" },
  { id: "canopyDark",   category: "lost", damage: "1d4", save: { ability: "dex", dc: 11 }, target: "party"  },
  { id: "ravine",       category: "lost", damage: "1d6", exhaustion: 1, save: { ability: "con", dc: 12 }, target: "party" },
  { id: "swampDetour",  category: "lost", damage: "1d4", save: { ability: "con", dc: 11 }, target: "party"  },

  /* --- Detour: lost, but the cartographer got them back --------- */
  { id: "backtrack",    category: "detour", target: "party" , terrain: "any"},
  { id: "mapRedrawn",   category: "detour", target: "party" , terrain: "any"},
  { id: "landmark",     category: "detour", target: "party" , terrain: "any"},




  /* --- A camp that was not a rest -------------------------------- */
  { id: "wetCamp",      category: "camp", damage: "1d4", exhaustion: 1, save: { ability: "con", dc: 12 }, target: "party" },
  { id: "antSwarm",     category: "camp", damage: "1d4", exhaustion: 1, save: { ability: "con", dc: 11 }, target: "random" },
  { id: "noFire",       category: "camp", damage: "1d4", exhaustion: 1, save: { ability: "con", dc: 12 }, target: "random" },
  { id: "mosquitoes",   category: "camp", damage: "1d4", exhaustion: 1, save: { ability: "con", dc: 13 }, target: "random" },

  /* --- Storms ----------------------------------------------------- */
  { id: "monsoon",      category: "storm", blocks: true, target: "party" },
  { id: "mudslide",     category: "storm", damage: "2d6", save: { ability: "dex", dc: 13 }, blocks: true, target: "party" },
  { id: "lightning",    category: "storm", damage: "3d6", save: { ability: "dex", dc: 15 }, target: "random" , terrain: "any"},
  { id: "riverFlood",   category: "storm", blocks: true, target: "party" },

  /* --- The jungle's good days ------------------------------------- */
  { id: "chwinga",      category: "boon", heals: 1, target: "party" },
  { id: "ruinShelter",  category: "boon", heals: 1, target: "party" },
  { id: "freshSpring",  category: "boon", target: "party" },
  { id: "gameTrail",    category: "boon", target: "party" },
  { id: "fruitGrove",   category: "boon", target: "party" },
  { id: "grungGift",    category: "boon", kin: KIN.GRUNG, heals: 1, target: "party" },

  /* --- River: the canoe's own troubles ---------------------------- */
  { id: "crocodiles",   category: "ambush", terrain: "river", damage: "2d10", blocks: true, target: "random", foe: { key: "giantCrocodile", cr: "5" } },
  { id: "riverHag",     category: "ambush", terrain: "river", damage: "2d6", save: { ability: "wis", dc: 13 }, target: "party", foe: { key: "seaHag", cr: "2" } },
  { id: "bankAmbush",   category: "ambush", terrain: "river", damage: "1d10", blocks: true, target: "party", foe: { key: "goblin", cr: "1/4" } },
  { id: "hippos",       category: "encounter", terrain: "river", blocks: true, target: "party", foe: { key: "hippopotamus", cr: "4" } },
  { id: "tradeCanoe",   category: "encounter", terrain: "river", target: "party" },
  { id: "driftwood",    category: "encounter", terrain: "river", blocks: true, target: "party" },
  { id: "wrongBranch",  category: "lost", terrain: "river", target: "party" },
  { id: "rapids",       category: "storm", terrain: "river", damage: "2d6", save: { ability: "dex", dc: 14 }, blocks: true, target: "party" },
  { id: "muddyBank",    category: "camp", terrain: "river", exhaustion: 1, save: { ability: "con", dc: 12 }, target: "party" },
  { id: "swiftCurrent", category: "boon", terrain: "river", target: "party" },

  /* --- Sea: the ship's own troubles ------------------------------- */
  { id: "sharks",       category: "ambush", terrain: "sea", damage: "2d8", blocks: true, target: "party" , foe: { key: "hunterShark", cr: "2" } },
  { id: "pirates",      category: "ambush", terrain: "sea", damage: "2d6", blocks: true, target: "party", foe: { key: "pirate", cr: "1/8" } },
  { id: "sahuagin",     category: "ambush", terrain: "sea", damage: "2d6", blocks: true, target: "party", foe: { key: "sahuagin", cr: "1/2" } },
  { id: "krakenArm",    category: "ambush", terrain: "sea", damage: "2d10", save: { ability: "str", dc: 14 }, blocks: true, target: "random", foe: { key: "giantOctopus", cr: "1" } },
  { id: "whale",        category: "encounter", terrain: "sea", target: "party" },
  { id: "sailOnHorizon", category: "encounter", terrain: "sea", target: "party" },
  { id: "reef",         category: "encounter", terrain: "sea", blocks: true, target: "party" },
  { id: "offCourse",    category: "lost", terrain: "sea", target: "party" },
  { id: "seaStorm",     category: "storm", terrain: "sea", damage: "2d6", save: { ability: "dex", dc: 13 }, blocks: true, target: "party" },
  { id: "becalmed",     category: "storm", terrain: "sea", blocks: true, target: "party" },
  { id: "nightWatch",   category: "camp", terrain: "sea", exhaustion: 1, save: { ability: "con", dc: 12 }, target: "random" },
  { id: "followingWind", category: "boon", terrain: "sea", target: "party" },
  { id: "dolphins",     category: "boon", terrain: "sea", heals: 1, target: "party" },

  /* --- Mounts: what a day on horseback costs ---------------------- */
  { id: "mountLame",    category: "camp", terrain: "mount", blocks: true, target: "party" },
  { id: "mountBolted",  category: "ambush", terrain: "mount", damage: "1d6", save: { ability: "dex", dc: 12 }, target: "party"  },
  { id: "mountSpent",   category: "camp", terrain: "mount", exhaustion: 1, save: { ability: "con", dc: 12 }, target: "party" }
];

/** Event categories, for grouping and for the "one per category" rule. */
export const EVENT_CATEGORY = {
  AMBUSH: "ambush", ENCOUNTER: "encounter", PURSUIT: "pursuit", LOST: "lost",
  DETOUR: "detour", CAMP: "camp", STORM: "storm", BOON: "boon"
};

/**
 * Chance in percent that a flawless day turns up a boon. Small on purpose: the
 * good days are worth something because they are rare.
 */
export const BOON_CHANCE = 30;

/**
 * Levels of exhaustion a successful medic takes back off the party.
 *
 * The medic's whole description promised this and nothing implemented it - the
 * role was rolled, reported and completely inert. It came to light writing the
 * role overview, which is the argument for having one.
 *
 * Applied to the WORST-off traveller: one level off the person closest to
 * dropping is worth more than one level off somebody at zero, and it is what a
 * medic would actually do.
 */
export const MEDIC_RELIEF = 1;

/**
 * ROLES THAT TAKE EXHAUSTION BACK OFF, and how much.
 *
 * The medic treats people; a quartermaster who made a good camp gives them a
 * night that was worth something. Both are checked on SUCCESS.
 *
 * The quartermaster's entry exists for tables whose house rules bar long rests
 * outside safe places - a common one in Chult. Without any daily recovery,
 * exhaustion stops being a resource and becomes a ratchet: measured over 200
 * simulated treks, a competent party hit the travel cap after about three
 * weeks and a third of them died of it inside forty days, with nothing they
 * could do about it. A camp well made is the one lever such a party still has.
 *
 * Relief goes to DIFFERENT travellers where there are enough of them (see
 * resolve.mjs), so two carers help two people rather than doubling up on one.
 */
export const ROLE_RELIEF = {
  medic: 1,
  quartermaster: 1
};

/** How many completed days the log keeps. See the note on LOG_LIMIT below. */
export const LOG_LIMIT = 30;

/** Where the party list comes from. Values of the `partySource` setting. */
export const PARTY_SOURCE = { GROUP: "group", PLAYERS: "players" };

/** Debounce for re-rendering open windows after a state change, in ms. */
export const DEBOUNCE_MS = 60;

/* ------------------------------------------------------------------ */
/*  Encounter sizing                                                   */
/* ------------------------------------------------------------------ */

/**
 * ENCOUNTER BUDGETS.
 *
 * The event says a pack of velociraptors turned up; this table answers "how
 * many", so a GM who wants to actually run the fight has a number instead of a
 * guess. Suggestions only - nothing here spawns a token or starts combat.
 *
 * These are the 2014 DMG XP thresholds per character, which is the edition Tomb
 * of Annihilation was written for. Index is the character level, so entry [6] is
 * a 6th-level character. Index 0 is unused padding so the level reads directly.
 */
export const XP_THRESHOLDS = [
  null,
  { hard:   75, deadly:   100 },  //  1
  { hard:  150, deadly:   200 },  //  2
  { hard:  225, deadly:   400 },  //  3
  { hard:  375, deadly:   500 },  //  4
  { hard:  750, deadly:  1100 },  //  5
  { hard:  900, deadly:  1400 },  //  6
  { hard: 1100, deadly:  1700 },  //  7
  { hard: 1400, deadly:  2100 },  //  8
  { hard: 1600, deadly:  2400 },  //  9
  { hard: 1900, deadly:  2800 },  // 10
  { hard: 2400, deadly:  3600 },  // 11
  { hard: 3000, deadly:  4500 },  // 12
  { hard: 3400, deadly:  5100 },  // 13
  { hard: 3800, deadly:  5900 },  // 14
  { hard: 4300, deadly:  6400 },  // 15
  { hard: 4800, deadly:  7200 },  // 16
  { hard: 5900, deadly:  8800 },  // 17
  { hard: 6500, deadly:  9500 },  // 18
  { hard: 7300, deadly: 10900 },  // 19
  { hard: 8500, deadly: 12700 }   // 20
];

export const MAX_LEVEL = XP_THRESHOLDS.length - 1;

/** Experience a creature of each challenge rating is worth (2014 DMG). */
export const CR_XP = {
  "0": 10, "1/8": 25, "1/4": 50, "1/2": 100,
  "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800, "6": 2300, "7": 2900,
  "8": 3900, "9": 5000, "10": 5900, "11": 7200, "12": 8400, "13": 10000,
  "14": 11500, "15": 13000, "16": 15000, "17": 18000, "18": 20000, "19": 22000,
  "20": 25000, "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000,
  "26": 90000, "27": 105000, "28": 120000, "29": 135000, "30": 155000
};

/**
 * The "encounter multiplier": a crowd is harder than the sum of its parts.
 *
 * `upTo` is the highest monster count the multiplier applies to, read in order.
 * Straight from the DMG's own table, and the reason four raptors are not simply
 * twice as dangerous as two.
 */
export const ENCOUNTER_MULTIPLIERS = [
  { upTo: 1, factor: 1 },
  { upTo: 2, factor: 1.5 },
  { upTo: 6, factor: 2 },
  { upTo: 10, factor: 2.5 },
  { upTo: 14, factor: 3 },
  { upTo: Infinity, factor: 4 }
];

/**
 * Most creatures of one kind worth suggesting.
 *
 * A cap, not a rule: against a low-CR foe the arithmetic will happily propose
 * forty stirges for a high-level party, which is technically a deadly encounter
 * and practically an afternoon of rolling initiative. Past this the suggestion
 * says "swarm" and leaves the staging to the GM.
 */
export const MAX_FOES = 12;
