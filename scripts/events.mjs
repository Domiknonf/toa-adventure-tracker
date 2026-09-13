import { MODULE_ID, EVENTS, TRAVEL_MODES, DEFAULT_TERRAIN, DEFAULT_MODE } from "./const.mjs";
import { kinActor, kinName } from "./roles.mjs";

/**
 * THE EVENT COMPILATION, selection side.
 *
 * The tables live in const.mjs and the prose in lang/*.json; this file is only
 * "which one, and what does it do to whom".
 *
 * Everything here is PURE except pick(), which rolls. That matters because
 * resolve.mjs calls it several times for one day and the result is stored -
 * a day must be rolled once and then stay rolled.
 */

/** An event's terrain. Events that do not name one are land events. */
export const terrainOf = (event) => event?.terrain ?? DEFAULT_TERRAIN;

/**
 * Whether a travel mode can draw this event at all.
 *
 * "any" is always in play - thirst and a missed bearing happen wherever you
 * are - and beyond that a mode only sees the pools it declares. That is what
 * keeps velociraptors off the open sea and sahuagin out of the jungle.
 */
export function inMode(event, mode = DEFAULT_MODE) {
  const terrain = terrainOf(event);
  if (terrain === "any") return true;
  return (TRAVEL_MODES[mode] ?? TRAVEL_MODES[DEFAULT_MODE]).terrains.includes(terrain);
}

/**
 * Whether a kin event has somebody to be about.
 *
 * An event that names a kin is a scene involving one traveller. With nobody of
 * that kin in the party it is not a milder scene, it is a nonsensical one - so
 * it never enters the pool at all rather than being drawn and then explained
 * away.
 */
export const kinPresent = (event) => !event?.kin || !!kinActor(event.kin);

/** Every event of one category that the given mode can draw. */
export const byCategory = (category, mode = DEFAULT_MODE) =>
  EVENTS.filter(e => e.category === category && inMode(e, mode) && kinPresent(e));

/**
 * One random event from a category, avoiding anything in `exclude`.
 *
 * `exclude` is how a single day stops telling the same story twice: an ambush
 * and a pursuit on the same day should not both be batiri goblins. When the
 * exclusion empties the category, the filter is dropped rather than returning
 * nothing - a repeat beats a day with a hole in it.
 */
export function pick(category, exclude = new Set(), mode = DEFAULT_MODE) {
  const all = byCategory(category, mode);
  if (!all.length) return null;
  const fresh = all.filter(e => !exclude.has(e.id));
  const pool = fresh.length ? fresh : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * An event's narrative text.
 *
 * `format` rather than `localize` so a kin event can say the traveller's actual
 * name. For the other seventy-odd events there is no `{name}` in the string and
 * format returns it unchanged, so this costs nothing.
 *
 * A retort splits the text in two: the shout back either worked or it did not,
 * and "they moved on laughing" and "they moved on with your rations" are not
 * the same evening. The base text is the setup, and this appends whichever
 * ending was rolled.
 */
export function eventText(event) {
  const data = event.kin ? { name: kinName(event.kin) } : {};
  const setup = game.i18n.format(`${MODULE_ID}.event.${event.id}`, data);
  if (!event.retort || !event.retortResult) return setup;

  const ending = game.i18n.format(
    `${MODULE_ID}.retort.${event.id}.${event.retortResult.ok ? "ok" : "fail"}`, data);
  return `${setup} ${ending}`;
}

/**
 * Which travellers an event touches.
 *
 * "party" is everyone; "random" is one, chosen here rather than by the caller so
 * that the choice is made exactly once per event.
 */
export function targetsOf(event, actors) {
  if (!actors.length) return [];
  if (event.target === "random") return [actors[Math.floor(Math.random() * actors.length)]];
  // "kin" is the one traveller the event is about. Falls back to nobody rather
  // than to the party: an event aimed at a character who is not travelling
  // today should hit no one, not everyone.
  if (event.target === "kin") {
    const one = kinActor(event.kin);
    return one && actors.some(a => a.id === one.id) ? [one] : [];
  }
  return actors;
}

/**
 * A plain-data summary of what an event costs, for the window and the log.
 *
 * Built from the event's own fields rather than written out in prose per event,
 * so 54 entries need 54 lines of story and no lines of bookkeeping - and so the
 * numbers shown can never drift from the numbers applied.
 */
export function effectSummary(event) {
  const parts = [];
  if (event.damage) parts.push({ kind: "damage", value: event.damage });
  if (event.exhaustion) parts.push({ kind: "exhaustion", value: event.exhaustion });
  if (event.heals) parts.push({ kind: "heals", value: event.heals });
  if (event.blocks) parts.push({ kind: "blocks" });
  if (event.save) parts.push({ kind: "save", ability: event.save.ability, dc: event.save.dc });
  // A retort is a save made with words, so it is summarised as one.
  if (event.retort) parts.push({ kind: "retort", skill: event.retort.skill, dc: event.retort.dc });
  return parts;
}

/** True when the event has anything that needs applying to a sheet. */
export const hasEffect = (event) => !!(event?.damage || event?.exhaustion || event?.heals);
