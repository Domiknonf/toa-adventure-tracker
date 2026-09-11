import { MODULE_ID } from "./const.mjs";
import { registerSettings } from "./settings.mjs";
import { registerSocket } from "./socket.mjs";
import {
  getApp, openApp, refresh, registerRefresh, registerActorHooks, AdventureTracker
} from "./app.mjs";
import {
  getState, setDay, adjustDay, completeDay, setPace, setMode, setSupplies, clearReport
} from "./state.mjs";
import { getRoles, partyActors, modifierFor, worstExhaustion } from "./roles.mjs";
import { resolveDay } from "./resolve.mjs";
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
    /** Set the water and food stocks, e.g. `{ water: 40, food: 20 }`. GM only. */
    setSupplies,

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
 * A button in the Journal Notes control group.
 *
 * Deliberately NOT its own control group: a group of one button costs a whole
 * category in the left rail, and in v13 a custom category has its own sharp edges
 * (a layer-less group needs care to activate at all). Notes is where the
 * campaign-bookkeeping tools already live.
 *
 * v13 SHAPE: `controls` is an OBJECT keyed by control name, and each control's
 * `tools` is an object too - both were arrays through v12. The optional chaining
 * below is what keeps a future rename from throwing during the hook rather than
 * just leaving the button out.
 */
Hooks.on("getSceneControlButtons", (controls) => {
  const notes = controls?.notes;
  if (!notes?.tools) return;

  notes.tools[MODULE_ID] = {
    name: MODULE_ID,
    order: 100,
    title: `${MODULE_ID}.app.title`,
    icon: "fa-solid fa-person-hiking",
    // A momentary button, not a stateful tool: it opens a window and leaves the
    // active tool alone.
    button: true,
    visible: true,
    // v13 calls onChange; core throws outright on a tool that has NEITHER an
    // onChange nor an onClick, so both are supplied rather than guessed at.
    onChange: () => openApp(),
    onClick: () => openApp()
  };
});
