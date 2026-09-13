import { MODULE_ID } from "./const.mjs";
import { registerSettings } from "./settings.mjs";
import { registerSocket } from "./socket.mjs";
import {
  getApp, openApp, refresh, registerRefresh, registerActorHooks, AdventureTracker
} from "./app.mjs";
import {
  getState, setDay, adjustDay, completeDay, setPace, setMode, clearReport
} from "./state.mjs";
import { getRoles, partyActors, modifierFor, worstExhaustion } from "./roles.mjs";
import { resolveDay } from "./resolve.mjs";
import { noteLongRest, allRested, stillAwake } from "./rest.mjs";
import { moonFor } from "./moon.mjs";

/* ------------------------------------------------------------------ */
/*  Lifecycle                                                          */
/* ------------------------------------------------------------------ */

Hooks.once("init", () => {
  registerSettings();
  registerSocket();
  registerRefresh();

  // Preloaded so the first open does not pay a fetch. v13 moved the helper under
  // foundry.applications.handlebars; the global loadTemplates is deprecated.
  const { loadTemplates } = foundry.applications.handlebars;
  loadTemplates([`modules/${MODULE_ID}/templates/tracker.hbs`]);
});

/**
 * A long rest into a new day is the end of a travel day.
 *
 * Fires on whichever client ran the rest, so this only reports the fact; the GM
 * side decides whether the counter moves (see rest.mjs).
 */
Hooks.on("dnd5e.restCompleted", (actor, result) => noteLongRest(actor, result));

Hooks.once("ready", () => {
  registerActorHooks();

  /**
   * PUBLIC API.
   *
   * Small on purpose: open the window, move the day, read the state. Everything
   * else a macro might want is derivable from getState(), and a wide API is a
   * promise to keep it working.
   *
   * The writers are GM-only at the state layer (see state.isWriter), so a player
   * calling api.setDay() changes nothing rather than throwing - which is the same
   * answer the buttons give them.
   */
  game.modules.get(MODULE_ID).api = {
    /** Open (or focus) the tracker window. */
    open: openApp,
    /** The application instance, for a macro that wants to position it. */
    get app() { return getApp(); },

    /** Set the travel day. GM only. */
    setDay,
    /** Step the travel day by a delta. GM only. */
    adjustDay,
    /**
     * Commit the resolved day: log it, clear it and advance the counter. Does
     * NOT apply consequences to sheets - the window does that around this call,
     * so a macro that wants the full step should use the window's button.
     * GM only.
     */
    completeDay,
    /** Set the travel pace ("slow" | "normal" | "fast"). GM only. */
    setPace,
    /**
     * Set how the party is travelling: "foot" | "mount" | "canoe" | "ship".
     * Decides the day's hex ceiling, which roles are offered and which events
     * the world may throw at them. Clears the day, which was worked out for a
     * different mode. GM only.
     */
    setMode,

    /**
     * Roll the day: weather, encounters, events, supplies and saving throws.
     * Stores the report and returns it. Writes NOTHING to any sheet, so calling
     * it again simply rolls a different day. GM only.
     */
    resolveDay,
    /** Throw away the resolved day without completing it. GM only. */
    clearReport,

    /** The whole stored state, already merged onto a complete shape. */
    getState,
    /** The effective role list (defaults + the customRoles setting). */
    getRoles,
    /** The actors the tracker considers to be travelling. */
    partyActors,
    /** The modifier one actor brings to one role, read from the sheet. */
    modifierFor,
    /** The highest exhaustion level anyone in the party carries. */
    worstExhaustion,
    /** Whether every traveller has taken their long rest tonight. */
    allRested,
    /** Which travellers the module is still waiting on for a long rest. */
    stillAwake,
    /** The moon for any day, without changing anything. */
    moonFor,

    /** Re-render open windows. Rarely needed - state changes do this already. */
    refresh,

    /** The class, for anyone who wants to subclass or instance-check it. */
    AdventureTracker
  };
});

/* ------------------------------------------------------------------ */
/*  Scene controls                                                     */
/* ------------------------------------------------------------------ */

/**
 * THE TRACKER'S OWN CATEGORY IN THE LEFT RAIL.
 *
 * Its own group, next to Token Controls and Journal Notes, rather than a tool
 * buried inside somebody else's category: the travel day is not note-keeping,
 * and a button nobody can find is a button nobody presses.
 *
 * v13 SHAPE, all of it verified against the SceneControls definitions rather
 * than remembered:
 *  - `controls` is an OBJECT keyed by control name, and so is each control's
 *    `tools`. Both were arrays through v12.
 *  - `activeTool` is NOT optional in practice. A category without one throws an
 *    unhelpful error the moment somebody clicks it (foundryvtt#12903), which is
 *    the kind of bug that only ever shows up at the table.
 *  - `layer` IS optional, and omitted here on purpose: this category drives no
 *    canvas layer, it opens a window. Core guarded that path in v12 Stable 3
 *    (foundryvtt#11107); the cost of getting it wrong the other way - inventing
 *    a canvas layer just to hang a button off - is a broken canvas, which is a
 *    far worse failure than a misplaced button.
 *  - A tool with NEITHER `onChange` nor `onClick` makes core throw
 *    (foundryvtt#12761), so both are given rather than guessed at.
 *
 * Clicking the CATEGORY opens the window directly, so the common case is one
 * click; the tools inside it are for the second one.
 */
Hooks.on("getSceneControlButtons", (controls) => {
  if (!controls) return;

  // A momentary button: it does something and leaves the active tool alone.
  const button = (name, order, title, icon, onPress) => ({
    name, order, title, icon,
    visible: true,
    button: true,
    onChange: onPress,
    onClick: onPress
  });

  const tools = {
    open: button("open", 1, `${MODULE_ID}.control.open`, "fa-solid fa-person-hiking",
      () => openApp())
  };

  // Running the day is the GM's, and so is the tool. Hidden rather than
  // disabled: a control a player can see and not use is a question they have to
  // ask. The API refuses it a second time anyway (AdventureTracker.runDay).
  if (game.user.isGM) {
    tools.runDay = button("runDay", 2, `${MODULE_ID}.control.runDay`, "fa-solid fa-dice-d20",
      async () => {
        // The window first: the report is the point, and opening it afterwards
        // would mean the dice land somewhere nobody is looking.
        openApp();
        await AdventureTracker.runDay();
      });
  }

  controls[MODULE_ID] = {
    name: MODULE_ID,
    // Last in the rail. The core categories are the canvas ones and they should
    // stay where everybody's hands already know they are.
    order: 100,
    title: `${MODULE_ID}.app.title`,
    icon: "fa-solid fa-person-hiking",
    visible: true,
    activeTool: "open",
    tools,
    // Fires on activation AND deactivation, hence the guard.
    onChange: (event, active) => { if (active) openApp(); }
  };
});
