import { MODULE_ID, SOCKET } from "./const.mjs";
import { assign, recordRoll, isWriter } from "./state.mjs";
import { setting } from "./settings.mjs";

/**
 * PLAYER ACTIONS -> THE GM.
 *
 * The state is a world setting, and only a GM may write one. So a player picking
 * a task or finishing a roll sends a request here, exactly one GM applies it, and
 * the resulting setting change is broadcast by Foundry itself - which is why
 * there is no "now re-render everybody" message. settings.mjs's onChange fires on
 * every client that receives the write, and that is the sync.
 *
 * `game.socket`, not socketlib. This needs three message types and no ACKs; a
 * hard dependency on another module would cost more than it buys.
 */

/* ------------------------------------------------------------------ */
/*  Receiving                                                          */
/* ------------------------------------------------------------------ */

export function registerSocket() {
  game.socket.on(SOCKET, onMessage);
}

/**
 * The GM-side handler, exported so it can be exercised directly.
 *
 * The permission that matters lives in here rather than in the window, so it is
 * worth being able to call it without a socket in the way.
 */
export { onMessage as handleRequest };

/**
 * Apply one request. Runs on every client; all but one return immediately.
 *
 * `isActiveGM` (via state.isWriter) picks EXACTLY ONE GM even when several are
 * logged in. Without that, three GMs would each apply the same assignment and
 * write the setting three times, and the last writer would win a race against a
 * state the other two had already read.
 */
async function onMessage({ action, data, userId } = {}) {
  if (!isWriter()) return;

  const user = game.users.get(userId);
  if (!user) return;

  switch (action) {
    case "assign":
      if (!mayActFor(user, data?.actorId)) return refuse(user, data?.actorId);
      return assign(data.actorId, data.roleId);

    case "ready": {
      /**
       * Deliberately NOT behind `playerRolls`.
       *
       * That switch decides whether players run the TOOL - pick roles, roll
       * checks. Saying "I am done with today" is not that: it is a statement
       * about their own character that the GM was going to ask for out loud
       * anyway. Owning the actor is the whole permission, and it stays the
       * one control a player always has.
       */
      if (!ownsActor(user, data?.actorId)) return refuse(user, data?.actorId);
      const { recordReady } = await import("./rest.mjs");
      return recordReady(data.actorId, data?.value !== false);
    }

    case "record":
      if (!mayActFor(user, data?.actorId)) return refuse(user, data?.actorId);
      // The record was built on the SENDER's client, by the system, from their
      // own roll. It is trusted only as far as the ownership check above: a user
      // may write a result for a creature they own, and for no other.
      return recordRoll(data.actorId, { ...data.record, by: userId });

    default:
      return;
  }
}

/**
 * Whether a user may act for an actor.
 *
 * Re-checked GM-side rather than trusted from the request. The sending client
 * already hides the controls it may not use, but a socket message is just data -
 * anybody can emit one - so the permission that matters is the one applied here.
 */
/** Plain ownership, with no opinion about what the world lets players do. */
function ownsActor(user, actorId) {
  if (!actorId) return false;
  if (user.isGM) return true;
  return !!game.actors.get(actorId)?.testUserPermission(user, "OWNER");
}

function mayActFor(user, actorId) {
  if (!actorId) return false;
  if (user.isGM) return true;
  // The tool is the GM's unless the world says otherwise. Checked HERE and not
  // only in the window, because the window merely hides controls - a socket
  // message is data, and anybody can emit one.
  if (!setting("playerRolls")) return false;
  const actor = game.actors.get(actorId);
  return !!actor?.testUserPermission(user, "OWNER");
}

function refuse(user, actorId) {
  console.warn(`${MODULE_ID} | refused socket request from ${user.name} for actor ${actorId}`);
}

/* ------------------------------------------------------------------ */
/*  Sending                                                            */
/* ------------------------------------------------------------------ */

/**
 * Ask the GM to apply something. Returns false - and says so - when no GM is
 * connected, because otherwise the click simply does nothing and the player is
 * left to guess whether it worked.
 */
export function requestFromGM(action, data) {
  if (!game.users.activeGM) {
    ui.notifications?.warn(game.i18n.localize(`${MODULE_ID}.notify.noGM`));
    return false;
  }
  game.socket.emit(SOCKET, { action, data, userId: game.user.id });
  return true;
}

/* ------------------------------------------------------------------ */
/*  The two calls the window makes                                     */
/* ------------------------------------------------------------------ */

/**
 * Both of these are the ONE path the window uses for these actions, GM or not:
 * a GM applies directly (no round trip, and it works in a world with no socket
 * traffic at all), anybody else asks. Keeping the branch here rather than in
 * app.mjs means the window never has to know which side of it it is on.
 */

export const requestAssign = (actorId, roleId) =>
  isWriter() ? assign(actorId, roleId) : requestFromGM("assign", { actorId, roleId });

export const requestRecord = (actorId, record) =>
  isWriter() ? recordRoll(actorId, record) : requestFromGM("record", { actorId, record });

/**
 * Say that a traveller is (or is no longer) ready for tomorrow.
 *
 * `quiet` is for the path nobody pressed: a long rest reports itself through
 * the system's hook, and a player going to bed while the GM happens to be
 * offline should not be told off for it. The BUTTON is not quiet - a click that
 * silently does nothing is worse than a warning.
 */
export const requestReady = async (actorId, value = true, { quiet = false } = {}) => {
  if (isWriter()) {
    const { recordReady } = await import("./rest.mjs");
    return recordReady(actorId, value);
  }
  if (quiet) {
    if (!game.users.activeGM) return false;
    game.socket.emit(SOCKET, { action: "ready", data: { actorId, value }, userId: game.user.id });
    return true;
  }
  return requestFromGM("ready", { actorId, value });
};
