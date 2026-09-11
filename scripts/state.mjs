import {
  MODULE_ID, STATE_SCHEMA, DEFAULT_PACE, LOG_LIMIT, NAVIGATION_TASK, WATER_TASK, FOOD_TASK
} from "./const.mjs";
import { setting, paceTable } from "./settings.mjs";

/**
 * THE WORLD STATE.
 *
 * One object in one world setting. Never in client storage, never on a document
 * flag - a travel day is a fact about the table, and every client has to agree on
 * it without a sync step of its own. Writing a world setting already broadcasts to
 * every client, so `settings.mjs`'s onChange is the whole notification layer.
 *
 * ONLY THE GM WRITES. Every mutator below refuses on a non-GM client rather than
 * failing deep inside Foundry's permission check, and every player-side action
 * goes through socket.mjs to reach a GM that calls the very same function.
 *
 * KEYS ARE ACTOR IDS, NOT UUIDS. A uuid ("Actor.xKm2...") contains a dot, and a
 * dotted key in an object handed to Foundry is liable to be expanded into nested
 * objects somewhere along the way. Ids are flat, so they stay keys.
 */

/** A state with nothing in it yet. Also the shape reference for everything below. */
export function blankState() {
  return {
    schema: STATE_SCHEMA,
    /** Integer travel day, 1-based. */
    day: 1,
    /** A key of the pace table (slow / normal / fast). */
    pace: DEFAULT_PACE,
    /** "Es regnet heute" - a per-day switch, cleared when the day is completed. */
    rain: false,
    /** actorId -> taskId. At most one task per actor, enforced on write. */
    assignments: {},
    /** actorId -> roll record (see recordRoll). Cleared when the day is completed. */
    rolls: {},
    /** Completed days, oldest first, capped at LOG_LIMIT. */
    log: []
  };
}

/* ------------------------------------------------------------------ */
/*  Read                                                               */
/* ------------------------------------------------------------------ */

/**
 * The current state, always complete.
 *
 * Stored partial states are normal - a world that has never completed a day has
 * no `log` key at all - so every read merges onto a blank rather than trusting
 * what is there. That is also what makes adding an optional field a no-op.
 */
export function getState() {
  const stored = setting("state") ?? {};
  const state = foundry.utils.mergeObject(blankState(), stored, { inplace: false });
  return migrate(state);
}

/**
 * Bring an older stored shape forward.
 *
 * Empty at schema 1 and deliberately kept as a named step anyway: the moment a
 * second version exists, the place it goes is already here and already called.
 */
function migrate(state) {
  if (state.schema === STATE_SCHEMA) return state;
  // ... future steps, each guarded by the version it upgrades FROM ...
  state.schema = STATE_SCHEMA;
  return state;
}

/* ------------------------------------------------------------------ */
/*  Write                                                              */
/* ------------------------------------------------------------------ */

/** True when this client is the one GM that performs writes. */
export const isWriter = () => game.user.isActiveGM;

/**
 * Replace the stored state. The single write path - nothing else calls
 * `game.settings.set` for "state".
 *
 * Returns the state that was written, or null when this client may not write.
 * Callers on the player side never reach here: they go through socket.mjs.
 */
async function write(state) {
  if (!isWriter()) return null;
  await game.settings.set(MODULE_ID, "state", state);
  return state;
}

/** Read, hand to `fn` to mutate in place, write back. */
async function update(fn) {
  if (!isWriter()) return null;
  const state = getState();
  fn(state);
  return write(state);
}

/* ------------------------------------------------------------------ */
/*  Day                                                                */
/* ------------------------------------------------------------------ */

/** Clamp to a sane integer day. Day 0 and fractional days have no meaning. */
const cleanDay = (value) => Math.max(1, Math.floor(Number(value) || 1));

export const setDay = (day) => update(s => { s.day = cleanDay(day); });

export const adjustDay = (delta) => update(s => { s.day = cleanDay(s.day + Number(delta || 0)); });

/**
 * Finish the travel day: write the logbook entry, then clear everything that was
 * about THAT day and step the counter.
 *
 * Assignments survive on purpose. A party that navigated yesterday is navigating
 * today; making everyone re-pick the same five tasks every morning is busywork,
 * and changing one is a single click. What does not survive is the ROLLS (a new
 * day is a new check) and the rain switch (weather is per day by definition).
 */
export const completeDay = () => update(s => {
  s.log.push(dayEntry(s));
  // Cap from the front: the oldest entry is the one nobody is reading.
  if (s.log.length > LOG_LIMIT) s.log.splice(0, s.log.length - LOG_LIMIT);
  s.rolls = {};
  s.rain = false;
  s.day = cleanDay(s.day + 1);
});

/**
 * The logbook entry for the day as it currently stands.
 *
 * Computed from the state at completion time and then FROZEN into the log - it is
 * a record of what happened, not a live view. That matters: retuning the pace
 * table next week must not rewrite last week's distances.
 */
function dayEntry(state) {
  const summary = summarise(state);
  return {
    day: state.day,
    pace: state.pace,
    miles: summary.miles,
    lost: summary.lost,
    water: summary.water,
    food: summary.food,
    rain: state.rain,
    at: Date.now()
  };
}

/* ------------------------------------------------------------------ */
/*  Pace, weather                                                      */
/* ------------------------------------------------------------------ */

export const setPace = (pace) => update(s => {
  if (paceTable()[pace]) s.pace = pace;
});

export const setRain = (rain) => update(s => { s.rain = !!rain; });

/* ------------------------------------------------------------------ */
/*  Assignments                                                        */
/* ------------------------------------------------------------------ */

/**
 * Give one actor one task, or clear it with a falsy taskId.
 *
 * "Jeder Aktor kann pro Tag nur eine Aufgabe übernehmen" is enforced by the data
 * shape itself - one actorId, one value - so re-assigning simply overwrites, and
 * there is no way to end up holding two. Changing task also drops the day's roll
 * for that actor: the stored result belonged to the OTHER task, and leaving it
 * would show a Stealth result under Navigation.
 */
export const assign = (actorId, taskId) => update(s => {
  const previous = s.assignments[actorId];
  if (!taskId) {
    delete s.assignments[actorId];
    delete s.rolls[actorId];
    return;
  }
  s.assignments[actorId] = taskId;
  if (previous !== taskId) delete s.rolls[actorId];
});

/* ------------------------------------------------------------------ */
/*  Rolls                                                              */
/* ------------------------------------------------------------------ */

/**
 * Store one finished roll. Re-rolling simply overwrites, which is exactly the
 * "Neu würfeln überschreibt das Ergebnis des Tages" rule.
 *
 * The record holds NUMBERS, not a Roll object: the chat message is the roll's
 * home and already went out through the normal pipeline (see tasks.rollTask).
 * What the window needs is a total, a DC and a verdict, and those survive a JSON
 * round trip through a world setting - a Roll instance would not.
 */
export const recordRoll = (actorId, record) => update(s => {
  if (!s.assignments[actorId]) return;   // no task, nothing this result belongs to
  s.rolls[actorId] = record;
});

export const clearRolls = () => update(s => { s.rolls = {}; });

/* ------------------------------------------------------------------ */
/*  Logbook                                                            */
/* ------------------------------------------------------------------ */

export const clearLog = () => update(s => { s.log = []; });

/* ------------------------------------------------------------------ */
/*  Derived                                                            */
/* ------------------------------------------------------------------ */

/**
 * Everything the window computes from the day's rolls: distance, and the water
 * and food that were gathered.
 *
 * Lives here rather than in app.mjs because completeDay() needs the same numbers
 * to freeze into the log, and two implementations of "how far did we get" would
 * drift the moment one of them was fixed.
 *
 * `navigation` is looked up by task id, so a custom list that has no navigation
 * task yields `lost: false` and the pace's full miles - "nobody navigated" reads
 * as "no penalty", which beats inventing one.
 */
export function summarise(state = getState()) {
  const paces = paceTable();
  const pace = paces[state.pace] ?? paces[DEFAULT_PACE] ?? { miles: 0, mod: 0 };

  const navRoll = Object.values(state.rolls ?? {})
    .find(r => r?.taskId === NAVIGATION_TASK && Number.isFinite(r?.total));

  // Failing the navigation check halves the distance, rounded down. No roll at
  // all is NOT a failure - the party simply travelled without a navigator.
  const lost = !!navRoll && navRoll.success === false;
  const miles = lost ? Math.floor(pace.miles / 2) : pace.miles;

  return {
    miles,
    lost,
    paceMiles: pace.miles,
    paceMod: pace.mod,
    water: sumYield(state, WATER_TASK),
    food: sumYield(state, FOOD_TASK)
  };
}

/**
 * Total yield of every successful roll on one task id.
 *
 * Sums across actors on purpose: two characters foraging is two yields, and the
 * party eats both. A failed roll contributes nothing rather than a zero entry,
 * so "0 gallons" and "nobody looked" stay distinguishable in the window.
 */
function sumYield(state, taskId) {
  let total = 0;
  let any = false;
  for (const record of Object.values(state.rolls ?? {})) {
    if (record?.taskId !== taskId) continue;
    if (!record.success) continue;
    if (!Number.isFinite(record.yield?.total)) continue;
    total += record.yield.total;
    any = true;
  }
  return any ? total : null;
}
