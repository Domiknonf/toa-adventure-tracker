import { MODULE_ID } from "./const.mjs";
import { setting } from "./settings.mjs";
import { getState, isWriter, markRested, adjustDay, completeDay } from "./state.mjs";
import { partyActors } from "./roles.mjs";

/**
 * THE LONG REST AS THE END OF THE TRAVEL DAY.
 *
 * When everybody has bedded down for the night, the night is over - so the
 * counter can move on its own instead of waiting for somebody to remember the
 * button.
 *
 * The rest happens on whichever client ran it, so this is another
 * player-action-to-GM path: the resting client reports the fact, exactly one GM
 * records it, and that GM decides whether the day is done.
 */

/**
 * Called on every client from the `dnd5e.restCompleted` hook.
 *
 * Only a LONG rest that starts a NEW DAY counts. A short rest is a breather and
 * a long rest without the new-day flag is the party sleeping off a fight in the
 * same afternoon - neither ends a day of travel.
 */
export function noteLongRest(actor, result) {
  if (!result?.longRest && result?.type !== "long") return;
  if (!result?.newDay) return;
  if (!actor?.id) return;
  // Somebody's pet NPC resting in town should not move the travel day.
  if (!partyActors().some(a => a.id === actor.id)) return;

  // Imported lazily: socket.mjs imports state.mjs, and pulling it in at module
  // scope would put rest.mjs in the middle of that chain for no benefit.
  import("./socket.mjs").then(({ requestRested }) => requestRested(actor.id));
}

/**
 * GM side: record the rest, then decide whether the day is over.
 *
 * Returns what it did, which is mostly for the tests - at the table the answer
 * arrives as a notification and a moved counter.
 */
export async function recordRest(actorId) {
  if (!isWriter()) return null;
  await markRested(actorId);

  const state = getState();
  if (!allRested(state)) return { all: false };

  /**
   * WAS THE DAY ACTUALLY TRAVELLED?
   *
   * This is what stops the counter jumping twice. A GM who presses "complete
   * day" themselves lands on a fresh day with no rolls and no report; the
   * party then beds down, everybody reports a rest, and without this check the
   * day would advance a second time for a day nobody has played yet.
   *
   * A day that was played has either a resolved report or at least one roll on
   * the board.
   */
  const played = !!state.report || Object.keys(state.rolls ?? {}).length > 0;
  if (!played) return { all: true, advanced: false, reason: "untouched" };

  // Tell the GM either way - the counter moving on its own should never be a
  // surprise, and when it deliberately does NOT move that is worth saying too.
  const enabled = !!setting("advanceOnLongRest");
  if (!enabled) {
    ui.notifications?.info(game.i18n.localize(`${MODULE_ID}.notify.allRested`));
    return { all: true, advanced: false, reason: "disabled" };
  }

  if (state.report) {
    // The day was resolved, so finish it properly: the report goes to the log
    // and the counter steps. Consequences are applied by the caller in app.mjs
    // for the button; here they are applied through the same helper so a day
    // ended by resting costs exactly what a day ended by clicking costs.
    const { applyConsequences, postDayToChat } = await import("./consequences.mjs");
    const { weatherLabel } = await import("./weather.mjs");
    const { eventText } = await import("./events.mjs");
    await applyConsequences(state.report);
    await postDayToChat(state.report, {
      weather: weatherLabel(state.report.weather?.key),
      events: (state.report.events ?? []).map(e => ({
        title: game.i18n.localize(`${MODULE_ID}.eventName.${e.id}`),
        text: eventText(e)
      }))
    });
    await completeDay();
    ui.notifications?.info(game.i18n.format(`${MODULE_ID}.notify.restedAdvanced`, { day: getState().day }));
    return { all: true, advanced: true, completed: true };
  }

  // Rolls but no report: the GM ran the day loosely. Step the counter and
  // leave it at that rather than inventing a report nobody asked for.
  await adjustDay(1);
  ui.notifications?.info(game.i18n.format(`${MODULE_ID}.notify.restedAdvanced`, { day: getState().day }));
  return { all: true, advanced: true, completed: false };
}

/**
 * Has every traveller taken their long rest?
 *
 * An empty party is NOT "all rested" - otherwise a world with no characters in
 * the travelling list would advance its day every time anybody anywhere slept.
 */
export function allRested(state = getState()) {
  const party = partyActors();
  if (!party.length) return false;
  const rested = state.rested ?? {};
  return party.every(actor => rested[actor.id]);
}

/** Who the window is still waiting on. */
export function stillAwake(state = getState()) {
  const rested = state.rested ?? {};
  return partyActors().filter(actor => !rested[actor.id]);
}
