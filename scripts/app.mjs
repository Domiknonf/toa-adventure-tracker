import {
  MODULE_ID, REFRESH_HOOK, PACE_ORDER, DEBOUNCE_MS, NAVIGATION_TASK
} from "./const.mjs";
import { setting, paceTable } from "./settings.mjs";
import {
  getState, summarise, setDay, adjustDay, completeDay, setPace, setRain, clearRolls,
  clearLog
} from "./state.mjs";
import {
  getTasks, getTask, taskLabel, taskHint, taskCheck, modifierFor, partyActors,
  travelerCount, canControl, rollTask, unitLabel, paceModifierFor
} from "./tasks.mjs";
import { moonFor, disc } from "./moon.mjs";
import { requestAssign, requestRecord } from "./socket.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/**
 * THE WINDOW.
 *
 * One application, the same for GM and players. It is not two views: players see
 * every number the GM sees, because the whole point is that the table is looking
 * at the same travel day. What differs is which controls are ENABLED, and that is
 * decided per control from ownership (see #prepareParty), never by hiding the
 * panel.
 *
 * It renders from the world state and nothing else. There is no local copy of any
 * of it, so a re-render after a state change cannot disagree with another client.
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
    position: { width: 720, height: 780 },
    actions: {
      dayUp: AdventureTracker.#onDayUp,
      dayDown: AdventureTracker.#onDayDown,
      setDay: AdventureTracker.#onSetDay,
      completeDay: AdventureTracker.#onCompleteDay,
      clearRolls: AdventureTracker.#onClearRolls,
      roll: AdventureTracker.#onRoll,
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
    const summary = summarise(state);
    const gm = game.user.isGM;

    return {
      gm,
      // A world with no GM online cannot accept a player's action at all, and the
      // window says so rather than letting clicks vanish (see socket.requestFromGM).
      noGM: !game.users.activeGM,
      day: state.day,
      moon: this.#prepareMoon(state),
      disc: disc(),
      paces: this.#preparePaces(state),
      pace: state.pace,
      rain: state.rain,
      party: this.#prepareParty(state),
      distance: this.#prepareDistance(state, summary),
      supplies: this.#prepareSupplies(state, summary),
      log: this.#prepareLog(state)
    };
  }

  /** Moon of the current day, plus the drawing geometry. */
  #prepareMoon(state) {
    const moon = moonFor(state.day);
    return {
      ...moon,
      label: game.i18n.localize(`${MODULE_ID}.moon.${moon.phase}`),
      // Full and new moon are neither waxing nor waning (moon.waxing is null),
      // and get no trend word at all rather than a misleading one.
      trend: moon.waxing === null
        ? ""
        : game.i18n.localize(`${MODULE_ID}.moon.${moon.waxing ? "waxing" : "waning"}`),
      tooltip: game.i18n.format(`${MODULE_ID}.moon.tooltip`, {
        day: moon.cycleDay,
        length: moon.cycleLength,
        percent: moon.percent
      })
    };
  }

  /** The three pace buttons, with the miles and modifier each would give. */
  #preparePaces(state) {
    const table = paceTable();
    return PACE_ORDER.map(key => ({
      key,
      active: state.pace === key,
      label: game.i18n.localize(`${MODULE_ID}.pace.${key}`),
      miles: table[key].miles,
      mod: table[key].mod,
      // Signed, because "+5" and "5" read differently on a modifier.
      modLabel: table[key].mod > 0 ? `+${table[key].mod}` : String(table[key].mod)
    }));
  }

  /**
   * One row per travelling character: who they are, what they took on, what they
   * rolled, and - per row - whether THIS user may touch any of it.
   *
   * `editable` is computed here and nowhere else. The template only reads it, the
   * socket re-checks it GM-side, and those are the only two places that decide
   * anything about permission.
   */
  #prepareParty(state) {
    const tasks = getTasks();
    const byId = new Map(tasks.map(t => [t.id, t]));
    const taken = state.assignments ?? {};

    return partyActors().map(actor => {
      const taskId = taken[actor.id] ?? "";
      const task = taskId ? byId.get(taskId) ?? null : null;
      const record = state.rolls?.[actor.id] ?? null;
      const editable = canControl(actor);

      return {
        id: actor.id,
        uuid: actor.uuid,
        name: actor.name,
        img: actor.img,
        editable,
        taskId,
        // Every task stays selectable. "Jeder Aktor kann pro Tag nur eine Aufgabe
        // übernehmen" is a limit on the ACTOR, not on the task - two characters
        // may both forage, and the yields add up (see state.sumYield).
        options: tasks.map(t => ({
          id: t.id,
          label: taskLabel(t),
          selected: t.id === taskId,
          // The description rides along as the option's own title, which is the
          // only tooltip a native <option> reliably shows.
          hint: taskHint(t),
          // The modifier this actor would bring, shown in the dropdown so picking
          // a task is an informed choice rather than a guess.
          mod: signed(modifierFor(actor, t))
        })),
        check: task ? taskCheck(task)?.label ?? "" : "",
        // What the chosen task actually does. Shown on the row rather than only
        // in the dropdown, so it is still readable after the choice is made.
        hint: task ? taskHint(task) : "",
        icon: task?.icon ?? "",
        dc: task?.dc ?? null,
        mod: task ? signed(modifierFor(actor, task)) : "",
        // The pace modifier only ever applies to navigation, so it is shown only
        // on the row that actually carries it.
        paceMod: task ? signedOrEmpty(paceModifierFor(task, state)) : "",
        canRoll: editable && !!task,
        record: record ? this.#prepareRecord(record, task) : null
      };
    });
  }

  /** One stored roll, formatted. */
  #prepareRecord(record, task) {
    return {
      total: record.total,
      dc: record.dc,
      success: record.success,
      // `null` is a real third state: a task with no DC has no verdict, and the
      // row shows the total without claiming either outcome.
      undecided: record.success === null || record.success === undefined,
      formula: record.formula,
      d20: record.d20,
      yield: record.yield
        ? {
          total: record.yield.total,
          unit: unitLabel(record.yield.unit ?? task?.yield?.unit)
        }
        : null
    };
  }

  /** Miles, hexes, and whether the party got lost. */
  #prepareDistance(state, summary) {
    const hexSize = Math.max(1, Number(setting("hexSize")) || 1);
    const navigated = Object.values(state.rolls ?? {}).some(r => r?.taskId === NAVIGATION_TASK);
    return {
      miles: summary.miles,
      paceMiles: summary.paceMiles,
      lost: summary.lost,
      // No navigation roll is not a failure - it is simply not asked yet, and the
      // panel says that instead of implying the full distance is confirmed.
      pending: !navigated,
      hexSize,
      // One decimal, because 10 miles into 7-mile hexes is 1.4 and rounding that
      // to 1 loses the whole point of the second line.
      hexes: Math.round((summary.miles / hexSize) * 10) / 10
    };
  }

  /**
   * Water and food for the day.
   *
   * The rain rule: with rain today AND a collector, the party's thirst is covered
   * outright and any foraged water is a bonus on top. That is why `covered` is
   * its own flag rather than being faked by adding the need to the yield - the
   * panel has to be able to say WHY it is covered.
   */
  #prepareSupplies(state, summary) {
    const travelers = travelerCount();
    const perHead = Number(setting("waterPerHead")) || 0;
    const need = Math.round(travelers * perHead * 100) / 100;
    const collector = !!setting("rainCollector");
    const byRain = !!state.rain && collector;
    const gathered = summary.water;
    const covered = byRain || ((gathered ?? 0) >= need) || need <= 0;

    return {
      travelers,
      perHead,
      need,
      collector,
      rain: !!state.rain,
      byRain,
      water: gathered,
      food: summary.food,
      covered,
      // The shortfall is only meaningful when there IS one.
      missing: covered ? 0 : Math.round((need - (gathered ?? 0)) * 100) / 100,
      conSaveDC: Number(setting("conSaveDC")) || 0,
      waterUnit: unitLabel("gallons"),
      foodUnit: unitLabel("pounds")
    };
  }

  /** The logbook, newest first, plus the total distance it accounts for. */
  #prepareLog(state) {
    const entries = [...(state.log ?? [])].reverse().map(entry => ({
      ...entry,
      paceLabel: game.i18n.localize(`${MODULE_ID}.pace.${entry.pace}`)
    }));
    return {
      entries,
      empty: !entries.length,
      totalMiles: (state.log ?? []).reduce((sum, e) => sum + (Number(e.miles) || 0), 0)
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Listeners                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * The three controls that are not `data-action` buttons.
   *
   * A `<select>` and two checkboxes report through `change`, which ApplicationV2's
   * action system - built on `click` - does not see. Bound per render, on this
   * part's own root, so they go away with the markup they belong to.
   */
  _onRender(context, options) {
    super._onRender(context, options);

    for (const select of this.element.querySelectorAll("[data-task-select]")) {
      select.addEventListener("change", this.#onAssign.bind(this));
    }

    const rain = this.element.querySelector("[data-rain]");
    if (rain) rain.addEventListener("change", (event) => setRain(event.currentTarget.checked));

    for (const button of this.element.querySelectorAll("[data-pace]")) {
      button.addEventListener("click", (event) => setPace(event.currentTarget.dataset.pace));
    }

    // The day field commits on Enter and on losing focus, not on every keystroke:
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

  /** Task picked from a row's dropdown. */
  #onAssign(event) {
    const select = event.currentTarget;
    requestAssign(select.dataset.actorId, select.value);
  }

  /* ---------------------------------------------------------------- */
  /*  Actions                                                          */
  /* ---------------------------------------------------------------- */

  static #onDayUp() { adjustDay(1); }
  static #onDayDown() { adjustDay(-1); }

  static #onSetDay() {
    const input = this.element.querySelector("[data-day-input]");
    if (input) setDay(input.value);
  }

  /**
   * Finish the day. Confirmed, because it writes a log entry and clears every
   * roll on the board - and the undo for that is "roll everything again".
   */
  static async #onCompleteDay() {
    const ok = await DialogV2.confirm({
      window: { title: game.i18n.localize(`${MODULE_ID}.app.completeDay`) },
      content: `<p>${game.i18n.format(`${MODULE_ID}.confirm.completeDay`, { day: getState().day })}</p>`
    });
    if (ok) await completeDay();
  }

  static #onClearRolls() { clearRolls(); }

  /**
   * Roll one row.
   *
   * The roll happens HERE, on the clicking user's own client, so their dice, their
   * modules and their advantage keybinds all apply. Only the finished record
   * travels - to the GM if this user is not one (see socket.requestRecord).
   *
   * The button is disabled while the roll is in flight: the configuration dialog
   * is `await`ed, and a second click during it would open a second dialog and
   * store whichever resolved last.
   */
  static async #onRoll(event, target) {
    const actor = game.actors.get(target.dataset.actorId);
    if (!actor || !canControl(actor)) return;

    const state = getState();
    const task = getTask(state.assignments?.[actor.id]);
    if (!task) return;

    target.disabled = true;
    try {
      const record = await rollTask(actor, task, { event });
      // null = the user cancelled the dialog. Nothing to store, nothing to say.
      if (record) await requestRecord(actor.id, record);
    } finally {
      // The element may already be gone if a state change re-rendered underneath
      // us, which is the normal case on a successful roll.
      if (target.isConnected) target.disabled = false;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Logbook                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Write the logbook to a journal entry.
   *
   * A new entry every time rather than overwriting one: the log is capped at
   * LOG_LIMIT, so exporting is how a long campaign keeps its older days, and an
   * export that ate the previous one would defeat that.
   */
  static async #onExportLog() {
    const state = getState();
    if (!state.log?.length) {
      return ui.notifications?.info(game.i18n.localize(`${MODULE_ID}.notify.emptyLog`));
    }

    const rows = state.log.map(entry => `
      <tr>
        <td>${entry.day}</td>
        <td>${game.i18n.localize(`${MODULE_ID}.pace.${entry.pace}`)}</td>
        <td>${entry.miles}</td>
        <td>${entry.lost ? game.i18n.localize(`${MODULE_ID}.yes`) : game.i18n.localize(`${MODULE_ID}.no`)}</td>
        <td>${entry.water ?? "&mdash;"}</td>
        <td>${entry.food ?? "&mdash;"}</td>
      </tr>`).join("");

    const total = state.log.reduce((sum, e) => sum + (Number(e.miles) || 0), 0);

    const content = `
      <table>
        <thead>
          <tr>
            <th>${game.i18n.localize(`${MODULE_ID}.log.day`)}</th>
            <th>${game.i18n.localize(`${MODULE_ID}.log.pace`)}</th>
            <th>${game.i18n.localize(`${MODULE_ID}.log.miles`)}</th>
            <th>${game.i18n.localize(`${MODULE_ID}.log.lost`)}</th>
            <th>${game.i18n.localize(`${MODULE_ID}.log.water`)}</th>
            <th>${game.i18n.localize(`${MODULE_ID}.log.food`)}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p><strong>${game.i18n.format(`${MODULE_ID}.log.total`, { miles: total })}</strong></p>`;

    const name = game.i18n.format(`${MODULE_ID}.log.journalName`, {
      date: new Date().toLocaleDateString()
    });

    const journal = await JournalEntry.create({
      name,
      pages: [{ name, type: "text", text: { content, format: 1 } }]
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
/*  Module-level access                                                */
/* ------------------------------------------------------------------ */

/** Signed modifier for display: 3 -> "+3", -1 -> "-1", null -> "". */
const signed = (value) => Number.isFinite(value) ? (value >= 0 ? `+${value}` : String(value)) : "";

/** The same, but a plain 0 is nothing worth showing. */
const signedOrEmpty = (value) => (Number.isFinite(value) && value !== 0) ? signed(value) : "";

let instance = null;

/** The one window. Created on demand, kept afterwards so its position survives. */
export function getApp() {
  return (instance ??= new AdventureTracker());
}

export function openApp() {
  return getApp().render({ force: true });
}

/**
 * Re-render the window, if it is open.
 *
 * Debounced because a single "complete day" writes the state once but fires the
 * setting's onChange on every client, and a GM who also has settings open can
 * trip several in a row. Rendering is cheap here, but not free, and nothing is
 * lost by coalescing a burst into one draw.
 */
export const refresh = foundry.utils.debounce(() => {
  if (instance?.rendered) instance.render();
}, DEBOUNCE_MS);

/** Wire the refresh hook once, at startup (see REFRESH_HOOK). */
export function registerRefresh() {
  Hooks.on(REFRESH_HOOK, refresh);
}

// Re-read the sheet when it changes: a level-up or a Guidance effect moves the
// modifier shown next to every task, and an open window must not keep quoting
// the old one. Filtered to actors that are actually in the list, because this
// fires for every creature in the world.
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
