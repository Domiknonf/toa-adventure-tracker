import { MODULE_ID, SOCKET } from "./const.mjs";
import { assign, recordRoll, isWriter } from "./state.mjs";

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
function mayActFor(user, actorId) {
  if (!actorId) return false;
  if (user.isGM) return true;
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
