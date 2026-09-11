import {
  MODULE_ID, STATE_SCHEMA, DEFAULT_PACE, DEFAULT_MODE, TRAVEL_MODES, LOG_LIMIT
} from "./const.mjs";
import { setting } from "./settings.mjs";

/**
 * THE WORLD STATE.
 *
 * One object in one world setting. Never in client storage, never on a document
 * flag - a travel day is a fact about the table, and every client has to agree
 * on it. Writing a world setting already broadcasts to every client, so
 * settings.mjs's onChange is the whole notification layer.
 *
 * ONLY THE GM WRITES. Every mutator refuses on a non-GM client, and every
 * player-side action goes through socket.mjs to reach a GM that calls the very
 * same function.
 *
 * KEYS ARE ACTOR IDS, NOT UUIDS. A uuid contains a dot, and a dotted key in an
 * object handed to Foundry is liable to be expanded into nested objects. Ids are
 * flat, so they stay keys.
 */

/** A state with nothing in it yet. Also the shape reference for everything below. */
export function blankState() {
  return {
    schema: STATE_SCHEMA,
    /** Integer travel day, 1-based. */
    day: 1,
    /** A key of the pace table (slow / normal / fast). */
    pace: DEFAULT_PACE,
    /**
     * How the party is travelling: on foot, mounted, by canoe or under sail.
     * Decides the day's hex ceiling, which roles are on offer and which events
     * the jungle (or the sea) is allowed to throw at them.
     */
    mode: DEFAULT_MODE,
    /** actorId -> roleId. At most one role per traveller. */
    assignments: {},
    /** actorId -> roll record. Cleared when the day is completed. */
    rolls: {},
    /**
     * SUPPLIES CARRY OVER. This is the difference between "today nobody found
     * water" and "the third day with empty barrels" - the second one is only a
     * sentence that can mean anything if yesterday's stock is still here.
     */
    supplies: { water: 0, food: 0 },
    /** Consecutive days with no rain. Drives the thirst flavour text. */
    dryDays: 0,
    /** Consecutive days the party has gone short on food (see hungerGrace). */
    hungryDays: 0,
    /**
     * The resolved day: weather, events, hexes, consequences. Null until the GM
     * resolves the day, and cleared again when the day is completed.
     *
     * Kept in state rather than recomputed on render because it contains ROLLED
     * results - weather, which event, the saving throws. Recomputing it per
     * render would reroll the day every time somebody opened the window.
     */
    report: null,
    /** Completed days, oldest first, capped at LOG_LIMIT. */
    log: []
  };
}

/* ------------------------------------------------------------------ */
/*  Read                                                               */
/* ------------------------------------------------------------------ */

/** The current state, always complete. */
export function getState() {
  const stored = setting("state") ?? {};
  const state = foundry.utils.mergeObject(blankState(), stored, { inplace: false });
  return migrate(state);
}

/**
 * Bring an older stored shape forward.
 *
 * Schema 1 was the miles-and-tasks model: it stored `rain`, per-day water and
 * food totals, and task ids that no longer exist. None of it maps onto the hex
 * model, and a half-translated state would be worse than a clean one - so the
 * day counter and the logbook survive (both still mean exactly what they meant)
 * and the rest is dropped.
 */
function migrate(state) {
  if (state.schema === STATE_SCHEMA) return state;

  if (!state.schema || state.schema < 2) {
    state.assignments = {};
    state.rolls = {};
    state.report = null;
    state.supplies = { water: 0, food: 0 };
    state.dryDays = 0;
    state.hungryDays = 0;
    // Old entries carry `miles` where new ones carry `hexes`. Left as they are:
    // the logbook renders whichever it finds, and rewriting history into a unit
    // it was never measured in would be a lie in the name of tidiness.
    state.log = Array.isArray(state.log) ? state.log : [];
  }

  state.schema = STATE_SCHEMA;
  return state;
}

/* ------------------------------------------------------------------ */
/*  Write                                                              */
/* ------------------------------------------------------------------ */

/** True when this client is the one GM that performs writes. */
export const isWriter = () => game.user.isActiveGM;

/** Replace the stored state. The single write path. */
async function write(state) {
  if (!isWriter()) return null;
  await game.settings.set(MODULE_ID, "state", state);
  return state;
}

/** Read, hand to `fn` to mutate in place, write back. */
export async function update(fn) {
  if (!isWriter()) return null;
  const state = getState();
  fn(state);
  return write(state);
}

/* ------------------------------------------------------------------ */
/*  Day                                                                */
/* ------------------------------------------------------------------ */

const cleanDay = (value) => Math.max(1, Math.floor(Number(value) || 1));

/**
 * Moving the day by hand throws away the resolved report.
 *
 * It has to: the report belongs to the day it was rolled for, and leaving it
 * attached to a different number would show yesterday's raptors under today's
 * date. Rolls go too, for the same reason.
 */
export const setDay = (day) => update(s => {
  s.day = cleanDay(day);
  s.report = null;
  s.rolls = {};
});

export const adjustDay = (delta) => update(s => {
  s.day = cleanDay(s.day + Number(delta || 0));
  s.report = null;
  s.rolls = {};
});

export const setPace = (pace) => update(s => { s.pace = pace; });

/**
 * Switch how the party is travelling.
 *
 * Throws away the resolved report and the day's rolls: both were worked out for
 * a different mode. A navigation roll made while walking is not the roll that
 * would have been made at the helm, and the events already drawn may not even
 * exist in the new mode - leaving velociraptors on the report after boarding a
 * ship would be worse than asking for a re-roll.
 *
 * Assignments survive, minus anyone holding a role the new mode does not offer.
 */
export const setMode = (mode) => update(s => {
  if (!TRAVEL_MODES[mode]) return;
  s.mode = mode;
  s.report = null;
  s.rolls = {};
  const offered = new Set(TRAVEL_MODES[mode].roles);
  for (const [actorId, roleId] of Object.entries(s.assignments)) {
    if (!offered.has(roleId)) delete s.assignments[actorId];
  }
});

/* ------------------------------------------------------------------ */
/*  Assignments and rolls                                              */
/* ------------------------------------------------------------------ */

/**
 * Give one traveller one role, or clear it with a falsy roleId.
 *
 * "One role per traveller" is enforced by the data shape itself - one actorId,
 * one value - so re-assigning overwrites and there is no way to hold two.
 * Changing role also drops that traveller's roll: the stored result belonged to
 * the other role.
 */
export const assign = (actorId, roleId) => update(s => {
  const previous = s.assignments[actorId];
  if (!roleId) {
    delete s.assignments[actorId];
    delete s.rolls[actorId];
    return;
  }
  s.assignments[actorId] = roleId;
  if (previous !== roleId) delete s.rolls[actorId];
});

/**
 * Store one finished roll. Re-rolling overwrites.
 *
 * The record holds NUMBERS, not a Roll: the chat message is the roll's home and
 * already went out through the system. What the engine needs is a total, a DC
 * and a verdict, and those survive a JSON round trip through a world setting.
 *
 * A new roll invalidates the resolved report - the day was worked out from the
 * OLD numbers, and leaving it up would show an outcome that no longer follows
 * from what is on screen.
 */
export const recordRoll = (actorId, record) => update(s => {
  if (!s.assignments[actorId]) return;
  s.rolls[actorId] = record;
  s.report = null;
});

export const clearRolls = () => update(s => { s.rolls = {}; s.report = null; });

/* ------------------------------------------------------------------ */
/*  Report                                                             */
/* ------------------------------------------------------------------ */

/** Store the resolved day. Built by resolve.mjs, which owns its shape. */
export const setReport = (report) => update(s => { s.report = report; });

export const clearReport = () => update(s => { s.report = null; });

/* ------------------------------------------------------------------ */
/*  Supplies                                                           */
/* ------------------------------------------------------------------ */

/** Set the stocks directly - the GM's "we bought barrels in Port Nyanzaru" path. */
export const setSupplies = ({ water, food }) => update(s => {
  if (Number.isFinite(water)) s.supplies.water = Math.max(0, water);
  if (Number.isFinite(food)) s.supplies.food = Math.max(0, food);
  // The report was worked out from the old stocks; it no longer follows.
  s.report = null;
});

/* ------------------------------------------------------------------ */
/*  Completing the day                                                 */
/* ------------------------------------------------------------------ */

/**
 * Commit the resolved day: write the stocks and streaks the report worked out,
 * log it, clear the day and step the counter.
 *
 * Applying the report's CONSEQUENCES to the sheets is not done here - that is
 * consequences.mjs, because it writes to Actor documents rather than to this
 * state, and the two must not be able to half-succeed together.
 *
 * Role assignments survive on purpose: whoever navigated yesterday is navigating
 * today, and re-picking eight roles every morning is busywork. What does not
 * survive is the rolls and the report, both of which were about THAT day.
 */
export const completeDay = () => update(s => {
  const report = s.report;
  if (!report) return;

  s.log.push({
    day: s.day,
    pace: s.pace,
    mode: s.mode,
    hexes: report.hexes,
    weather: report.weather?.key ?? null,
    events: (report.events ?? []).map(e => e.id),
    water: report.supplies?.waterAfter ?? 0,
    food: report.supplies?.foodAfter ?? 0,
    damage: report.consequences?.reduce((n, c) => n + (c.damage ?? 0), 0) ?? 0,
    exhaustion: report.consequences?.reduce((n, c) => n + (c.exhaustion ?? 0), 0) ?? 0,
    at: Date.now()
  });
  if (s.log.length > LOG_LIMIT) s.log.splice(0, s.log.length - LOG_LIMIT);

  s.supplies.water = report.supplies?.waterAfter ?? s.supplies.water;
  s.supplies.food = report.supplies?.foodAfter ?? s.supplies.food;
  s.dryDays = report.dryDays ?? s.dryDays;
  s.hungryDays = report.hungryDays ?? s.hungryDays;

  s.rolls = {};
  s.report = null;
  s.day = cleanDay(s.day + 1);
});

export const clearLog = () => update(s => { s.log = []; });
