import { MODULE_ID, EVENTS } from "./const.mjs";

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

/** Every event of one category. */
export const byCategory = (category) => EVENTS.filter(e => e.category === category);

/**
 * One random event from a category, avoiding anything in `exclude`.
 *
 * `exclude` is how a single day stops telling the same story twice: an ambush
 * and a pursuit on the same day should not both be batiri goblins. When the
 * exclusion empties the category, the filter is dropped rather than returning
 * nothing - a repeat beats a day with a hole in it.
 */
export function pick(category, exclude = new Set()) {
  const all = byCategory(category);
  if (!all.length) return null;
  const fresh = all.filter(e => !exclude.has(e.id));
  const pool = fresh.length ? fresh : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** An event's narrative text. The whole compilation is translatable. */
export const eventText = (event) => game.i18n.localize(`${MODULE_ID}.event.${event.id}`);

/**
 * Which travellers an event touches.
 *
 * "party" is everyone; "random" is one, chosen here rather than by the caller so
 * that the choice is made exactly once per event.
 */
export function targetsOf(event, actors) {
  if (!actors.length) return [];
  if (event.target === "random") return [actors[Math.floor(Math.random() * actors.length)]];
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
  return parts;
}

/** True when the event has anything that needs applying to a sheet. */
export const hasEffect = (event) => !!(event?.damage || event?.exhaustion || event?.heals);
