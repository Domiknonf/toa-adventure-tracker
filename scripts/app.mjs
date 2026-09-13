import {
  MODULE_ID, REFRESH_HOOK, PACE_ORDER, DEBOUNCE_MS, MODE_ORDER, TRAVEL_MODES,
  DEFAULT_MODE
} from "./const.mjs";
import { setting, paceTable } from "./settings.mjs";
import {
  getState, setDay, adjustDay, completeDay, setPace, setMode, clearRolls, clearLog,
  clearReport, markApplied
} from "./state.mjs";
import {
  getRoles, getRole, roleLabel, roleHint, roleEffect, roleCheck, modifierFor,
  partyActors, canControl, rollRole, unitLabel, paceModifierFor, worstExhaustion
} from "./roles.mjs";
import { moonFor, disc } from "./moon.mjs";
import { requestAssign, requestRecord, requestReady } from "./socket.mjs";
import { resolveDay } from "./resolve.mjs";
import { applyConsequences, postDayToChat } from "./consequences.mjs";
import { eventText, effectSummary } from "./events.mjs";
import { weatherLabel } from "./weather.mjs";
import { suggestionFor, partyLevel, budgets } from "./encounters.mjs";
import { allReady, notReady } from "./rest.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/**
 * THE WINDOW.
 *
 * One application, the same for GM and players. Not two views: players see every
 * number the GM sees, because the point is that the table looks at the same day.
 * What differs is which controls are ENABLED, decided per control from ownership
 * (see #prepareParty), never by hiding the panel.
 *
 * It renders from the world state and nothing else - including the day report,
 * which is STORED rather than recomputed. Recomputing it per render would reroll
 * the weather every time somebody opened the window.
 */
export class AdventureTracker extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "toa-adventure-tracker",
    classes: ["toa-tracker"],
    tag: "div",
    window: {
      title: `${MODULE_ID}.app.title`,
      icon: "fa-solid fa-person-hiking",
      resizable: true
    },
    position: { width: 760, height: 820 },
    actions: {
      dayUp: AdventureTracker.#onDayUp,
      dayDown: AdventureTracker.#onDayDown,
      resolveDay: AdventureTracker.#onResolveDay,
      completeDay: AdventureTracker.#onCompleteDay,
      discardReport: AdventureTracker.#onDiscardReport,
      clearRolls: AdventureTracker.#onClearRolls,
      rollAll: AdventureTracker.#onRollAll,
      runDay: AdventureTracker.#onRunDay,
      applyNow: AdventureTracker.#onApplyNow,
      roll: AdventureTracker.#onRoll,
      ready: AdventureTracker.#onReady,
      exportLog: AdventureTracker.#onExportLog,
      clearLog: AdventureTracker.#onClearLog
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/tracker.hbs`, scrollable: [".toa-scroll"] }
  };

  /* ---------------------------------------------------------------- */
  /*  Context                                                          */
  /* ---------------------------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const state = getState();
    const gm = game.user.isGM;
    // Whether this viewer gets the working surface at all. A player's window is
    // a shop window by default: the travel day, the moon, how the party is
    // travelling and what is left in the barrels.
    const shared = !!setting("shareReport");
    const rolling = gm || !!setting("playerRolls");
    const party = (gm || rolling) ? this.#prepareParty(state) : [];

    return {
      gm,
      shared,
      rolling,
      /** True for the compact read-only view: no roles, no report, no log. */
      viewer: !gm,
      noGM: !game.users.activeGM,
      day: state.day,
      moon: this.#prepareMoon(state),
      disc: disc(),
      paces: this.#preparePaces(state),
      pace: state.pace,
      modes: this.#prepareModes(state),
      mode: state.mode,
      party,
      // Rolling can only be judged once every filled role has an answer; the
      // resolve button says so rather than silently producing a thin day.
      pending: party.filter(m => m.roleId && !m.record).length,
      // Which roles are empty is a planning question, and planning is the GM's.
      unfilled: gm ? this.#prepareUnfilled(state) : [],
      // What the party can see for itself: how they are travelling, and today's
      // weather once it is known. Both are observable in the world, so neither
      // is a spoiler - unlike what came out of the trees.
      travel: this.#prepareTravel(state),
      board: this.#prepareBoard(state),
      sky: this.#prepareSky(state, gm, shared),
      /**
       * THE REPORT IS GM-ONLY UNLESS SHARED, AND IT IS WITHHELD HERE RATHER THAN
       * HIDDEN IN THE TEMPLATE.
       *
       * The event prose is written to be read aloud. A player who can read it in
       * their own window has already lost the surprise - and a template-level
       * `{{#if gm}}` would still have shipped every word into their browser,
       * where the console shows it to anyone who looks. So a player is simply
       * never sent it.
       */
      report: (state.report && (gm || setting("shareReport")))
        ? this.#prepareReport(state.report)
        : null,
      // Set when there IS a resolved day the viewer is not allowed to see, so
      // the window can say "your GM is looking at today" instead of looking
      // broken or empty.
      reportHidden: !!state.report && !gm && !setting("shareReport"),
      partyLevel: partyLevel(),
      budget: budgets(),
      log: (gm || shared) ? this.#prepareLog(state) : null,
      exhaustion: worstExhaustion(),
      /**
       * READY FOR TOMORROW.
       *
       * Everybody's panel, not the GM's. It is the one control a player always
       * has - it survives `playerRolls` being off, because "I am done with
       * today" is a statement about their own character rather than a use of
       * the GM's tool.
       */
      ready: this.#prepareReady(state, gm)
    };
  }

  /**
   * How the party is travelling, as one read-only line.
   *
   * Players get this instead of eight disabled buttons: the buttons would be
   * controls they cannot use, and a window full of greyed-out things reads as
   * broken rather than as "not yours".
   */
  #prepareTravel(state) {
    const mode = TRAVEL_MODES[state.mode] ?? TRAVEL_MODES[DEFAULT_MODE];
    return {
      mode: game.i18n.localize(`${MODULE_ID}.mode.${state.mode}`),
      modeIcon: mode.icon,
      modeHint: game.i18n.localize(`${MODULE_ID}.mode.${state.mode}Hint`),
      pace: game.i18n.localize(`${MODULE_ID}.pace.${state.pace}`)
    };
  }

  /**
   * Today's weather, and how long it has been dry.
   *
   * Shown to everybody once the day is resolved: whether it is raining is not a
   * secret the GM is keeping, it is the thing the characters are standing in.
   * The EVENTS of the day stay behind the report gate; this is only the sky.
   */
  #prepareSky(state, gm, shared) {
    const report = state.report;
    if (!report?.weather) return { known: false };
    return { known: true, label: weatherLabel(report.weather.key), rain: !!report.weather.rain };
  }

  /**
   * THE ROLE BOARD: every role, who is on it, and what it is worth.
   *
   * The one panel EVERYBODY gets, GM and player alike, and the answer to the
   * only question a player can actually act on: what is there to do, who has
   * already taken it, what gets rolled for it and what do I bring to it.
   *
   * None of it is a spoiler. Who volunteered for the rearguard is said out loud
   * at the table; a skill modifier is on a sheet its owner can already read.
   * What stays behind the report gate is what came out of the trees - and that
   * is a different panel entirely (see the comment on `report`).
   *
   * Writing the effect column is also what once exposed that the medic had no
   * mechanical effect at all: the cell was simply empty. If a role cannot be
   * described here, it does not deserve to be in the list.
   */
  #prepareBoard(state) {
    const actors = partyActors();
    const byId = new Map(actors.map(a => [a.id, a]));
    const assignments = state.assignments ?? {};

    /**
     * Whose numbers fill the "you" column.
     *
     * The character this user brought to the table, not every actor they
     * happen to own - a player with three sheets wants their own bonuses, not
     * a spreadsheet. The GM gets no column: they can see everyone's already,
     * and a single number would have to pick one of them arbitrarily.
     */
    const mine = game.user.isGM
      ? null
      : (byId.get(game.user.character?.id) ?? actors.find(a => a.isOwner) ?? null);

    const roles = getRoles(state.mode).map(role => {
      const check = roleCheck(role);
      // Everyone on this role. Usually nobody or one; two scouts is a legal and
      // occasionally sensible choice, so the board shows however many there are.
      const holders = Object.entries(assignments)
        .filter(([, roleId]) => roleId === role.id)
        .map(([actorId]) => byId.get(actorId))
        .filter(Boolean)
        .map(actor => ({
          id: actor.id,
          name: actor.name,
          img: actor.img,
          mod: signed(modifierFor(actor, role)),
          rolled: !!state.rolls?.[actor.id]
        }));

      return {
        id: role.id,
        icon: role.icon ?? "",
        label: roleLabel(role),
        hint: roleHint(role),
        check: check?.label ?? "",
        dc: role.dc ?? null,
        // What the CURRENT pace does to this particular roll - the malus that is
        // easiest to forget and hardest to explain after the fact.
        paceMod: signedOrEmpty(paceModifierFor(role, state)),
        effect: roleEffect(role),
        // What it costs to leave empty - the other half of the decision.
        unfilled: game.i18n.localize(`${MODULE_ID}.unfilled.${role.unfilled ?? "fail"}`),
        critical: role.unfilled === "worse",
        holders,
        empty: !holders.length,
        // This viewer's own modifier for the role, filled or not: the answer to
        // "where would I actually be useful".
        you: mine ? signed(modifierFor(mine, role)) : ""
      };
    });

    return { roles, you: mine?.name ?? "", mine: !!mine };
  }

  /**
   * WHO IS DONE WITH TODAY.
   *
   * Replaces waiting for a long rest. A table whose house rules bar long rests
   * in the wild never produces one with `newDay` set, so the old trigger simply
   * never fired for them - and the answer to "can we move on" was a question
   * asked out loud every evening. Now it is a button and a list.
   *
   * A long rest still counts, for tables that take them (see rest.mjs).
   */
  #prepareReady(state, gm) {
    const flags = state.ready ?? {};
    const rows = partyActors().map(actor => ({
      id: actor.id,
      name: actor.name,
      img: actor.img,
      ready: !!flags[actor.id],
      // Anybody may say THEIR OWN character is ready; the GM may say it for
      // anyone, because somebody has to be able to answer for the player who
      // logged off mid-jungle.
      editable: gm || actor.isOwner
    }));

    const waiting = rows.filter(r => !r.ready);
    return {
      rows,
      count: rows.length - waiting.length,
      total: rows.length,
      all: rows.length > 0 && !waiting.length,
      // Named rather than counted: "we are waiting on Brombert" is actionable,
      // "3 of 4" is not.
      waiting: waiting.map(r => r.name),
      auto: gm ? !!setting("advanceOnReady") : false
    };
  }

  /** Moon of the current day, plus the drawing geometry. */
  #prepareMoon(state) {
    const moon = moonFor(state.day);
    return {
      ...moon,
      label: game.i18n.localize(`${MODULE_ID}.moon.${moon.phase}`),
      trend: moon.waxing === null
        ? ""
        : game.i18n.localize(`${MODULE_ID}.moon.${moon.waxing ? "waxing" : "waning"}`),
      tooltip: game.i18n.format(`${MODULE_ID}.moon.tooltip`, {
        day: moon.cycleDay, length: moon.cycleLength, percent: moon.percent
      })
    };
  }

  /**
   * How the party is travelling. Each button carries what that mode's ordinary
   * day looks like, so the choice can be made by eye rather than from the README.
   */
  #prepareModes(state) {
    return MODE_ORDER.map(key => ({
      key,
      active: state.mode === key,
      label: game.i18n.localize(`${MODULE_ID}.mode.${key}`),
      icon: TRAVEL_MODES[key].icon,
      hint: game.i18n.localize(`${MODULE_ID}.mode.${key}Hint`),
      // The three ceilings as "1 / 2 / 3", which says more about the mode than
      // any adjective would.
      range: PACE_ORDER.map(p => TRAVEL_MODES[key].hexes[p]).join(" / ")
    }));
  }

  /** The three pace buttons: hex ceiling in the CURRENT mode, and modifiers. */
  #preparePaces(state) {
    const table = paceTable();
    const mode = TRAVEL_MODES[state.mode] ?? TRAVEL_MODES[DEFAULT_MODE];
    return PACE_ORDER.map(key => ({
      key,
      active: state.pace === key,
      label: game.i18n.localize(`${MODULE_ID}.pace.${key}`),
      max: mode.hexes[key],
      mod: table[key].navMod,
      modLabel: signedOrEmpty(table[key].navMod),
      encounterMod: signedOrEmpty(table[key].encounterMod),
      /**
       * What the pace does to the OTHER roles - which is where a fast pace is
       * actually paid for. Without this on the card, "schnell" looks like pure
       * upside right up until the ambush.
       */
      roleMods: Object.entries(table[key].mods ?? {}).map(([roleId, value]) => ({
        label: game.i18n.localize(`${MODULE_ID}.role.${roleId}.label`),
        mod: signed(value),
        bad: value < 0
      }))
    }));
  }

  /**
   * One row per traveller: who they are, what they took on, what they rolled,
   * and - per row - whether THIS user may touch any of it.
   *
   * `editable` is computed here and nowhere else. The template only reads it and
   * the socket re-checks it GM-side; those are the only two places that decide
   * anything about permission.
   */
  #prepareParty(state) {
    const roles = getRoles();
    const byId = new Map(roles.map(r => [r.id, r]));
    const taken = state.assignments ?? {};
    // Which roles somebody else already holds, so the dropdown can mark them.
    const heldBy = new Map(Object.entries(taken).map(([actorId, roleId]) => [roleId, actorId]));

    return partyActors().map(actor => {
      const roleId = taken[actor.id] ?? "";
      const role = roleId ? byId.get(roleId) ?? null : null;
      const record = state.rolls?.[actor.id] ?? null;
      const editable = canControl(actor);

      return {
        id: actor.id,
        name: actor.name,
        img: actor.img,
        editable,
        roleId,
        exhaustion: Number(actor.system?.attributes?.exhaustion) || 0,
        options: roles.map(r => ({
          id: r.id,
          label: roleLabel(r),
          selected: r.id === roleId,
          hint: roleHint(r),
          mod: signed(modifierFor(actor, r)),
          // A role somebody else already has. Still selectable - two scouts is a
          // legitimate choice - but worth saying, since a doubled role means an
          // empty one somewhere else.
          taken: heldBy.has(r.id) && heldBy.get(r.id) !== actor.id
        })),
        icon: role?.icon ?? "",
        hint: role ? roleHint(role) : "",
        check: role ? roleCheck(role)?.label ?? "" : "",
        dc: role?.dc ?? null,
        mod: role ? signed(modifierFor(actor, role)) : "",
        paceMod: role ? signedOrEmpty(paceModifierFor(role, state)) : "",
        canRoll: editable && !!role,
        record: record ? {
          total: record.total,
          dc: record.dc,
          success: record.success,
          undecided: record.success === null || record.success === undefined,
          formula: record.formula,
          margin: record.margin,
          yield: record.yield
            ? { total: record.yield.total, unit: unitLabel(record.yield.unit) }
            : null
        } : null
      };
    });
  }

  /**
   * Roles nobody has taken, and how much that costs.
   *
   * Shown as a warning rather than left to be noticed: an empty role is a
   * guaranteed failure, and the ones marked `worse` are guaranteed AND sharpened.
   * A party of four cannot fill eight roles, so deciding which ones to leave
   * empty is the actual tactical choice this window asks for - it should not be
   * something you discover afterwards in the report.
   */
  #prepareUnfilled(state) {
    const taken = new Set(Object.values(state.assignments ?? {}));
    return getRoles()
      .filter(role => !taken.has(role.id) && role.unfilled !== "none")
      .map(role => ({
        id: role.id,
        label: roleLabel(role),
        icon: role.icon ?? "",
        critical: role.unfilled === "worse"
      }));
  }

  /**
   * The resolved day, ready to read aloud.
   *
   * Every number here comes with its reason attached - that is the whole design
   * of the report, and the template is only allowed to print what this returns.
   */
  #prepareReport(report) {
    return {
      hexes: report.hexes,
      hexLabel: game.i18n.localize(`${MODULE_ID}.app.hex${report.hexes === 1 ? "" : "es"}`),
      mode: game.i18n.localize(`${MODULE_ID}.mode.${report.mode ?? DEFAULT_MODE}`),
      modeIcon: (TRAVEL_MODES[report.mode] ?? TRAVEL_MODES[DEFAULT_MODE]).icon,
      weather: weatherLabel(report.weather?.key),
      weatherKey: report.weather?.key,
      rain: !!report.weather?.rain,
      reasons: (report.reasons ?? []).map(r => ({
        text: game.i18n.format(`${MODULE_ID}.reason.${r.key}`, {
          level: r.level ?? 0,
          event: r.event ? game.i18n.localize(`${MODULE_ID}.eventName.${r.event}`) : ""
        }),
        delta: r.delta,
        bad: (r.delta ?? 0) < 0,
        good: (r.delta ?? 0) > 0
      })),
      encounter: report.encounter?.happened ? {
        surprised: report.encounter.surprised,
        chance: report.encounter.chance
      } : null,
      events: (report.events ?? []).map(event => ({
        id: event.id,
        category: event.category,
        title: game.i18n.localize(`${MODULE_ID}.eventName.${event.id}`),
        text: eventText(event),
        // The roll that settled a kin event, so the table sees the number
        // behind "he talked them round" rather than being told the outcome.
        retort: event.retortResult ? {
          ...event.retortResult,
          skill: game.i18n.localize(
            CONFIG.DND5E?.skills?.[event.retortResult.skill]?.label ?? event.retort?.skill ?? "")
        } : null,
        blocks: !!event.blocks,
        good: event.category === "boon",
        effects: effectSummary(event).map(e => ({ ...e, label: effectLabel(e) })),
        // How many of them make a real fight, for a GM who wants to run it
        // rather than narrate it. Null for hazards and friendly meetings.
        foe: suggestionFor(event)
      })),
      /**
       * THE ROSTER: one line per traveller, the untouched ones included.
       *
       * "Maleth: nothing, short rest tonight" is information; Maleth simply
       * missing from the list is an unanswered question. It is also the only
       * place the night's rest is reported, which for a table that cannot long
       * rest is the most consequential line in the report.
       */
      consequences: (report.consequences ?? []).map(c => ({
        ...c,
        /**
         * THREE STATES, NOT TWO.
         *
         * "Nothing happened to you" and "something came at you and you turned
         * it aside" look identical on a sheet and are completely different at
         * the table - and a report that renders them the same way invites
         * exactly one question: why did the kamadan cost nobody anything?
         *
         * A save here cancels the event outright rather than halving it (see
         * resolve.resolveConsequences), so the whole story of a warded event
         * lives in this flag and the roll printed beside it.
         */
        untouched: !c.damage && !c.exhaustion && !c.heals && !(c.from ?? []).length,
        warded: !c.damage && !c.exhaustion && !c.heals && !!(c.from ?? []).length,
        // A camp event got through, so tonight is not a rest.
        restless: !!c.restless,
        /**
         * What each save actually rolled. The engine makes these without a chat
         * card (a dozen 3D animations per day is not information, it is a
         * wait), so this is the only place the numbers appear.
         */
        saves: (c.from ?? []).filter(f => f.saved !== null && Number.isFinite(f.total)).map(f => ({
          total: f.total,
          dc: f.dc,
          saved: f.saved,
          ability: game.i18n.localize(CONFIG.DND5E?.abilities?.[f.ability]?.abbreviation
            ?? CONFIG.DND5E?.abilities?.[f.ability]?.label ?? f.ability ?? "")
        })),
        // Saved against everything that offered a save: worth calling out,
        // because otherwise a traveller with nothing next to their name looks
        // like an oversight rather than a good night.
        savedAll: c.from?.length > 0 && c.from.every(f => f.saved === true)
      })),
      willApply: !!setting("applyConsequences"),
      // Whether the consequences have already been written to the sheets. The
      // Apply button reads this so it cannot be pressed twice.
      applied: !!report.applied,
      /**
       * Something worth APPLYING - which is no longer the same as "the roster
       * has rows in it". Every traveller is listed now, so the button has to
       * ask whether any of those rows actually writes something.
       */
      hasConsequences: (report.consequences ?? [])
        .some(c => c.damage || c.exhaustion || c.heals)
    };
  }

  /** The logbook, newest first, plus the total distance it accounts for. */
  #prepareLog(state) {
    const entries = [...(state.log ?? [])].reverse().map(entry => ({
      ...entry,
      paceLabel: game.i18n.localize(`${MODULE_ID}.pace.${entry.pace}`),
      modeLabel: entry.mode ? game.i18n.localize(`${MODULE_ID}.mode.${entry.mode}`) : "",
      weatherLabel: entry.weather ? weatherLabel(entry.weather) : "",
      // Schema 1 logged miles. Those entries are kept as they were rather than
      // converted into a unit they were never measured in.
      legacy: entry.hexes === undefined
    }));
    return {
      entries,
      empty: !entries.length,
      totalHexes: (state.log ?? []).reduce((sum, e) => sum + (Number(e.hexes) || 0), 0)
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Listeners                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * The controls that are not `data-action` buttons.
   *
   * A `<select>` reports through `change`, which ApplicationV2's action system -
   * built on `click` - does not see. Bound per render on this part's own root,
   * so they go away with the markup they belong to.
   */
  _onRender(context, options) {
    super._onRender(context, options);

    for (const select of this.element.querySelectorAll("[data-role-select]")) {
      select.addEventListener("change", (event) => {
        const el = event.currentTarget;
        requestAssign(el.dataset.actorId, el.value);
      });
    }

    for (const button of this.element.querySelectorAll("[data-pace]")) {
      button.addEventListener("click", (event) => setPace(event.currentTarget.dataset.pace));
    }

    for (const button of this.element.querySelectorAll("[data-mode]")) {
      button.addEventListener("click", (event) => setMode(event.currentTarget.dataset.mode));
    }

    const levelInput = this.element.querySelector("[data-party-level]");
    if (levelInput) {
      const commitLevel = () => game.settings.set(MODULE_ID, "partyLevel", Number(levelInput.value) || 0);
      levelInput.addEventListener("change", commitLevel);
      levelInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") { event.preventDefault(); commitLevel(); }
      });
    }

    // The day field commits on Enter and on losing focus, not per keystroke:
    // typing "12" over "1" would otherwise write day 1, then day 12, and the
    // second write races the re-render the first one triggered.
    const dayInput = this.element.querySelector("[data-day-input]");
    if (dayInput) {
      const commit = () => setDay(dayInput.value);
      dayInput.addEventListener("change", commit);
      dayInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") { event.preventDefault(); commit(); }
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Day counter                                                      */
  /* ---------------------------------------------------------------- */

  static #onDayUp() { adjustDay(1); }
  static #onDayDown() { adjustDay(-1); }
  static #onClearRolls() { clearRolls(); }
  static #onDiscardReport() { clearReport(); }

  /* ---------------------------------------------------------------- */
  /*  Rolling                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Roll one row.
   *
   * The roll happens HERE, on the clicking user's own client, so their dice,
   * their modules and their advantage keybinds all apply. Only the finished
   * record travels - to the GM if this user is not one.
   *
   * The button is disabled while the roll is in flight: the configuration dialog
   * is awaited, and a second click during it would open a second dialog and
   * store whichever resolved last.
   */
  static async #onRoll(event, target) {
    const actor = game.actors.get(target.dataset.actorId);
    if (!actor || !canControl(actor)) return;

    const state = getState();
    const role = getRole(state.assignments?.[actor.id]);
    if (!role) return;

    target.disabled = true;
    try {
      const record = await rollRole(actor, role, { event });
      if (record) await requestRecord(actor.id, record);
    } finally {
      if (target.isConnected) target.disabled = false;
    }
  }

  /**
   * Roll every outstanding role this user may roll.
   *
   * Sequential rather than parallel: each roll may open the dnd5e configuration
   * dialog, and five dialogs at once is not a decision anybody can make. It also
   * keeps the chat messages in party order instead of in race order.
   */
  static async #onRollAll(event, target) {
    const state = getState();
    target.disabled = true;
    try {
      for (const actor of partyActors()) {
        if (!canControl(actor)) continue;
        if (state.rolls?.[actor.id]) continue;
        const role = getRole(state.assignments?.[actor.id]);
        if (!role) continue;
        const record = await rollRole(actor, role, { batch: true });
        if (record) await requestRecord(actor.id, record);
      }
    } finally {
      if (target.isConnected) target.disabled = false;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Ready for tomorrow                                               */
  /* ---------------------------------------------------------------- */

  /**
   * Toggle one traveller's "ready for tomorrow".
   *
   * A toggle, not a one-way flag: somebody who pressed it and then remembered
   * they wanted to search the camp can take it back without asking the GM to
   * edit the world state.
   *
   * Permission is decided in #prepareReady and re-decided GM-side in socket.mjs.
   * This only refuses the obvious - the actor is not in the party, or the row
   * was not this user's to press.
   */
  static async #onReady(event, target) {
    const actorId = target.dataset.actorId;
    const actor = game.actors.get(actorId);
    if (!actor) return;
    if (!game.user.isGM && !actor.isOwner) return;

    target.disabled = true;
    try {
      await requestReady(actorId, target.dataset.ready !== "false");
    } finally {
      if (target.isConnected) target.disabled = false;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Resolving and completing                                         */
  /* ---------------------------------------------------------------- */

  /**
   * THE WHOLE DAY IN ONE CLICK: roll every outstanding role, then resolve.
   *
   * What a GM actually wants in the morning. Rolling eight roles by hand and
   * then pressing resolve is nine clicks to answer one question, and the two
   * halves are never useful apart - the report cannot be built until the rolls
   * exist, and rolls with no report are just numbers.
   *
   * The separate buttons stay for when they are wanted: one row re-rolled, or
   * a day resolved again without touching the rolls.
   *
   * Rolls only what is MISSING, so a roll the GM made by hand - or a player
   * made, where that is allowed - is respected rather than thrown away.
   */
  static async #onRunDay(event, target) {
    target.disabled = true;
    try {
      await AdventureTracker.runDay();
    } finally {
      if (target.isConnected) target.disabled = false;
    }
  }

  /**
   * The same thing, callable without a button.
   *
   * Public because the scene-control tool needs it and the rail has no DOM
   * element to disable - the guard there is that the window opens first, so a
   * second click lands on the button, which does disable itself.
   *
   * @returns {Promise<boolean>} Whether a day was actually resolved.
   */
  static async runDay() {
    if (!game.user.isGM) return false;
    const existing = getState().report;
    if (existing && !(await AdventureTracker.#confirmReresolve(existing))) return false;

    await AdventureTracker.#rollOutstanding();
    await resolveDay();
    return true;
  }

  /**
   * Roll every role that has somebody on it and no result yet.
   *
   * Sequential, not parallel: each roll may open dnd5e's configuration dialog,
   * and five at once is not a decision anybody can make. It also keeps the chat
   * in party order instead of in race order.
   */
  static async #rollOutstanding() {
    const state = getState();
    for (const actor of partyActors()) {
      if (!canControl(actor)) continue;
      if (state.rolls?.[actor.id]) continue;
      const role = getRole(state.assignments?.[actor.id]);
      if (!role) continue;
      const record = await rollRole(actor, role, { batch: true });
      if (record) await requestRecord(actor.id, record);
    }
  }

  /**
   * Ask before rolling a day again, and say plainly when the last one has
   * already been written to the sheets - re-resolving does NOT take that back,
   * and finding out afterwards is finding out too late.
   */
  static async #confirmReresolve(report) {
    const key = report.applied ? "resolveAgainApplied" : "resolveAgain";
    return DialogV2.confirm({
      window: { title: game.i18n.localize(`${MODULE_ID}.app.resolveAgain`) },
      content: `<p>${game.i18n.localize(`${MODULE_ID}.confirm.${key}`)}</p>`
    });
  }

  /**
   * Write the day's damage and exhaustion onto the sheets, and stop there.
   *
   * Separate from completing the day because they are separate decisions: the
   * jungle has already bitten, but the party may not be bedding down yet. The
   * flag is stored on the report, so pressing it twice cannot take the same hit
   * points off twice.
   */
  static async #onApplyNow(event, target) {
    const report = getState().report;
    if (!report || report.applied) return;

    target.disabled = true;
    try {
      const result = await applyConsequences(report);
      await markApplied();
      const hurt = result?.entries?.length ?? 0;
      ui.notifications?.info(result?.applied
        ? game.i18n.format(`${MODULE_ID}.notify.applied`, { n: hurt })
        : game.i18n.localize(`${MODULE_ID}.notify.applyDisabled`));
    } finally {
      if (target.isConnected) target.disabled = false;
    }
  }

  /**
   * Work out the day. Rolls weather, encounters and saving throws, and stores
   * the report - but writes nothing to any sheet, which is what makes doing it
   * again safe.
   */
  static async #onResolveDay(event, target) {
    const state = getState();
    if (state.report && !(await AdventureTracker.#confirmReresolve(state.report))) return;
    target.disabled = true;
    try {
      await resolveDay();
    } finally {
      if (target.isConnected) target.disabled = false;
    }
  }

  /**
   * Commit the day: apply what the report says, post it to chat, log it, advance.
   *
   * Confirmed, because this is the irreversible step - it writes hit points and
   * exhaustion onto sheets. The dialog names the cost rather than asking an
   * abstract "are you sure".
   */
  static async #onCompleteDay() {
    const state = getState();
    const report = state.report;
    if (!report) return ui.notifications?.warn(game.i18n.localize(`${MODULE_ID}.notify.resolveFirst`));

    const harmed = report.consequences?.length ?? 0;
    const ok = await DialogV2.confirm({
      window: { title: game.i18n.localize(`${MODULE_ID}.app.completeDay`) },
      content: `<p>${game.i18n.format(`${MODULE_ID}.confirm.completeDay`, {
        day: report.day, hexes: report.hexes, n: harmed
      })}</p>`
    });
    if (!ok) return;

    // Sheets first, then the state. If applying to a sheet throws, the day has
    // not yet been logged and advanced, so the GM can see what happened and
    // retry rather than being left on day+1 with half the party unhurt.
    //
    // Skipped when the Apply button already did it - otherwise finishing a day
    // you had already applied would take the same hit points off twice.
    if (!report.applied) await applyConsequences(report);
    await postDayToChat(report, {
      weather: weatherLabel(report.weather?.key),
      events: (report.events ?? []).map(e => ({
        title: game.i18n.localize(`${MODULE_ID}.eventName.${e.id}`),
        text: eventText(e)
      }))
    });
    await completeDay();
  }

  /* ---------------------------------------------------------------- */
  /*  Supplies                                                         */
  /* ---------------------------------------------------------------- */

  /* ---------------------------------------------------------------- */
  /*  Logbook                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Write the logbook to a journal entry.
   *
   * A new entry every time rather than overwriting one: the log is capped, so
   * exporting is how a long campaign keeps its older days, and an export that
   * ate the previous one would defeat that.
   */
  static async #onExportLog() {
    const state = getState();
    if (!state.log?.length) {
      return ui.notifications?.info(game.i18n.localize(`${MODULE_ID}.notify.emptyLog`));
    }

    const L = (key) => game.i18n.localize(`${MODULE_ID}.log.${key}`);
    const rows = state.log.map(entry => {
      const events = (entry.events ?? [])
        .map(id => game.i18n.localize(`${MODULE_ID}.eventName.${id}`))
        .join(", ");
      return `<tr>
        <td>${entry.day}</td>
        <td>${entry.hexes ?? "&mdash;"}</td>
        <td>${entry.mode ? game.i18n.localize(`${MODULE_ID}.mode.${entry.mode}`) : "&mdash;"}</td>
        <td>${entry.weather ? weatherLabel(entry.weather) : "&mdash;"}</td>
        <td>${game.i18n.localize(`${MODULE_ID}.pace.${entry.pace}`)}</td>
        <td>${events || "&mdash;"}</td>
        <td>${entry.damage || "&mdash;"}</td>
        <td>${entry.exhaustion || "&mdash;"}</td>
      </tr>`;
    }).join("");

    const total = state.log.reduce((sum, e) => sum + (Number(e.hexes) || 0), 0);

    const content = `
      <table>
        <thead><tr>
          <th>${L("day")}</th><th>${L("hexes")}</th><th>${L("mode")}</th><th>${L("weather")}</th>
          <th>${L("pace")}</th><th>${L("events")}</th>
          <th>${L("damage")}</th><th>${L("exhaustion")}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p><strong>${game.i18n.format(`${MODULE_ID}.log.total`, { hexes: total })}</strong></p>`;

    const name = game.i18n.format(`${MODULE_ID}.log.journalName`, { date: new Date().toLocaleDateString() });
    const journal = await JournalEntry.create({
      name, pages: [{ name, type: "text", text: { content, format: 1 } }]
    });

    ui.notifications?.info(game.i18n.format(`${MODULE_ID}.notify.exported`, { name }));
    journal?.sheet?.render(true);
  }

  static async #onClearLog() {
    const ok = await DialogV2.confirm({
      window: { title: game.i18n.localize(`${MODULE_ID}.app.clearLog`) },
      content: `<p>${game.i18n.localize(`${MODULE_ID}.confirm.clearLog`)}</p>`
    });
    if (ok) await clearLog();
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Signed modifier for display: 3 -> "+3", -1 -> "-1", null -> "". */
const signed = (value) => Number.isFinite(value) ? (value >= 0 ? `+${value}` : String(value)) : "";

/** The same, but a plain 0 is nothing worth showing. */
const signedOrEmpty = (value) => (Number.isFinite(value) && value !== 0) ? signed(value) : "";

/** One line of an event's mechanical cost, built from the event's own fields. */
function effectLabel(effect) {
  switch (effect.kind) {
    case "damage": return game.i18n.format(`${MODULE_ID}.effect.damage`, { formula: effect.value });
    case "exhaustion": return game.i18n.format(`${MODULE_ID}.effect.exhaustion`, { n: effect.value });
    case "heals": return game.i18n.format(`${MODULE_ID}.effect.heals`, { n: effect.value });
    case "blocks": return game.i18n.localize(`${MODULE_ID}.effect.blocks`);
    case "save": return game.i18n.format(`${MODULE_ID}.effect.save`, {
      ability: game.i18n.localize(CONFIG.DND5E?.abilities?.[effect.ability]?.abbreviation
        ?? CONFIG.DND5E?.abilities?.[effect.ability]?.label ?? effect.ability),
      dc: effect.dc
    });
    case "retort": return game.i18n.format(`${MODULE_ID}.effect.retort`, {
      skill: game.i18n.localize(CONFIG.DND5E?.skills?.[effect.skill]?.label ?? effect.skill),
      dc: effect.dc
    });
    default: return "";
  }
}

/* ------------------------------------------------------------------ */
/*  Module-level access                                                */
/* ------------------------------------------------------------------ */

let instance = null;

/**
 * The one window. Created on demand, kept afterwards so its position survives.
 *
 * A viewer's window opens narrower, because their view is a short column - day,
 * moon, how you are travelling, what is in the barrels. Opening it at the GM's
 * width would show a column of content beside a lot of nothing.
 */
export function getApp() {
  if (instance) return instance;
  const options = game.user.isGM ? {} : { position: { width: 420, height: 620 } };
  return (instance = new AdventureTracker(options));
}

export function openApp() {
  return getApp().render({ force: true });
}

/**
 * Re-render the window, if it is open. Debounced because one state write fires
 * the setting's onChange on every client, and nothing is lost by coalescing a
 * burst into one draw.
 */
export const refresh = foundry.utils.debounce(() => {
  if (instance?.rendered) instance.render();
}, DEBOUNCE_MS);

/** Wire the refresh hook once, at startup (see REFRESH_HOOK). */
export function registerRefresh() {
  Hooks.on(REFRESH_HOOK, refresh);
}

/**
 * Re-read the sheets when they change: a level-up moves the modifier shown next
 * to every role, and exhaustion applied by this very module changes the travel
 * ceiling. Filtered to actors actually in the party, because these fire for
 * every creature in the world.
 */
export function registerActorHooks() {
  const maybe = (actor) => {
    if (!instance?.rendered || !actor) return;
    if (partyActors().some(a => a.id === actor.id)) refresh();
  };
  Hooks.on("updateActor", (doc) => maybe(doc));
  Hooks.on("createActiveEffect", (doc) => maybe(effectActor(doc)));
  Hooks.on("updateActiveEffect", (doc) => maybe(effectActor(doc)));
  Hooks.on("deleteActiveEffect", (doc) => maybe(effectActor(doc)));
  // Who is IN the party can change without any one actor changing.
  Hooks.on("createActor", refresh);
  Hooks.on("deleteActor", refresh);
}

/** An effect hangs off the actor directly, or off one of its items. */
const effectActor = (effect) =>
  (effect?.parent?.documentName === "Actor" ? effect.parent : effect?.parent?.actor) ?? null;
