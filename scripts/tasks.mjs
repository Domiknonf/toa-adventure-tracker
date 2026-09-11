import {
  MODULE_ID, DEFAULT_TASKS, NAVIGATION_TASK, PARTY_SOURCE
} from "./const.mjs";
import { setting, paceTable } from "./settings.mjs";
import { getState } from "./state.mjs";

/**
 * TASKS, THE PARTY, AND THE ROLLING.
 *
 * Three things that all have to agree about one question - "who is doing what,
 * with which modifier" - so they live together rather than drifting apart in
 * three files.
 *
 * Nothing here writes state. A roll produces a RECORD and hands it back; storing
 * it is state.mjs's business, reached either directly (GM) or through the socket
 * (player). That is what keeps the roll on the player's own client, where their
 * dice, their modules and their advantage keybinds actually live.
 */

/* ------------------------------------------------------------------ */
/*  The task list                                                      */
/* ------------------------------------------------------------------ */

/**
 * Parsed custom tasks, cached against the raw setting string.
 *
 * getTasks() is called several times per render and the JSON does not change
 * between them. Keying the cache on the raw text means editing the setting
 * invalidates it for free, with no onChange to remember to wire up.
 */
let taskCache = { raw: null, parsed: [] };

/**
 * Warn about broken JSON ONCE per distinct text, not once per render.
 *
 * Without this, a stray comma in the setting produced a notification every time
 * the window redrew - which is several times a minute during a travel day.
 */
let warnedFor = null;

/**
 * The effective task list: the defaults with the custom JSON merged in by id.
 *
 * Merge, not replace, and the three cases are all reachable from one array:
 *   - an id that matches a default OVERRIDES that default, field by field, so
 *     "just make navigation DC 13" is a two-key object;
 *   - an unknown id is APPENDED;
 *   - `"hidden": true` REMOVES the entry, which is how a default is dropped.
 *
 * Order follows the defaults, with new entries after them, so the window does not
 * reshuffle itself when somebody tweaks a DC.
 */
export function getTasks() {
  const merged = new Map(DEFAULT_TASKS.map(t => [t.id, foundry.utils.deepClone(t)]));

  for (const custom of customTasks()) {
    if (!custom?.id) continue;
    if (custom.hidden) { merged.delete(custom.id); continue; }
    const base = merged.get(custom.id) ?? {};
    merged.set(custom.id, foundry.utils.mergeObject(base, custom, { inplace: false }));
  }

  return [...merged.values()].filter(isUsable);
}

/** Parse the customTasks setting, tolerating everything except silence. */
function customTasks() {
  const raw = String(setting("customTasks") ?? "").trim();
  if (!raw) { taskCache = { raw: "", parsed: [] }; return []; }
  if (taskCache.raw === raw) return taskCache.parsed;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    // A typo costs a warning and the default list, never the window.
    if (warnedFor !== raw) {
      warnedFor = raw;
      ui.notifications?.warn(game.i18n.format(`${MODULE_ID}.notify.badTaskJson`, { error: error.message }));
      console.warn(`${MODULE_ID} | customTasks is not valid JSON`, error);
    }
    taskCache = { raw, parsed: [] };
    return [];
  }

  // A single object is a reasonable thing to write when overriding one task.
  if (!Array.isArray(parsed)) parsed = [parsed];
  taskCache = { raw, parsed };
  warnedFor = null;
  return parsed;
}

/**
 * A task is usable if it names something that can actually be rolled. An entry
 * with neither a skill nor an ability would render a button that throws when
 * clicked, so it is dropped here instead.
 */
function isUsable(task) {
  return !!task?.id && (!!resolveSkill(task.skill) || !!resolveAbility(task.ability));
}

/** One task by id, or null. */
export const getTask = (id) => getTasks().find(t => t.id === id) ?? null;

/* ------------------------------------------------------------------ */
/*  Labels                                                             */
/* ------------------------------------------------------------------ */

/**
 * A task's label / description.
 *
 * A custom task may carry its own `label`, either as literal text or as an i18n
 * key - `localize` returns its input unchanged when the key is unknown, so both
 * work with no flag to set. The defaults have no inline label at all and resolve
 * against lang/*.json, which is what keeps the shipped list translatable.
 */
export function taskLabel(task) {
  if (task?.label) return game.i18n.localize(task.label);
  return game.i18n.localize(`${MODULE_ID}.task.${task.id}.label`);
}

export function taskHint(task) {
  if (task?.hint) return game.i18n.localize(task.hint);
  const key = `${MODULE_ID}.task.${task.id}.hint`;
  const text = game.i18n.localize(key);
  // An unknown key localizes to itself; a custom task without a hint should show
  // nothing rather than its own key path.
  return text === key ? "" : text;
}

/* ------------------------------------------------------------------ */
/*  Skills and abilities                                               */
/* ------------------------------------------------------------------ */

/**
 * Resolve whatever somebody wrote into a real CONFIG.DND5E.skills key.
 *
 * Accepts the system key ("sur"), the fullKey ("survival") and the English label,
 * case-insensitively. Deliberately NOT a hardcoded map: the system owns that
 * table, modules add to it, and a frozen copy here would be wrong the first time
 * anybody adds a skill.
 */
export function resolveSkill(value) {
  if (!value) return null;
  const skills = CONFIG.DND5E?.skills ?? {};
  if (skills[value]) return value;
  const needle = String(value).toLowerCase();
  for (const [key, config] of Object.entries(skills)) {
    if (key.toLowerCase() === needle) return key;
    if (String(config.fullKey ?? "").toLowerCase() === needle) return key;
    if (game.i18n.localize(config.label ?? "").toLowerCase() === needle) return key;
  }
  return null;
}

/** The same, for CONFIG.DND5E.abilities ("wis", "wisdom", "Weisheit"). */
export function resolveAbility(value) {
  if (!value) return null;
  const abilities = CONFIG.DND5E?.abilities ?? {};
  if (abilities[value]) return value;
  const needle = String(value).toLowerCase();
  for (const [key, config] of Object.entries(abilities)) {
    if (key.toLowerCase() === needle) return key;
    if (String(config.fullKey ?? "").toLowerCase() === needle) return key;
    if (game.i18n.localize(config.label ?? "").toLowerCase() === needle) return key;
  }
  return null;
}

/** What the task is rolled with: `{ type: "skill"|"ability", key, label }`. */
export function taskCheck(task) {
  const skill = resolveSkill(task?.skill);
  if (skill) {
    return {
      type: "skill",
      key: skill,
      label: game.i18n.localize(CONFIG.DND5E.skills[skill]?.label ?? skill)
    };
  }
  const ability = resolveAbility(task?.ability);
  if (ability) {
    return {
      type: "ability",
      key: ability,
      label: game.i18n.localize(CONFIG.DND5E.abilities[ability]?.label ?? ability)
    };
  }
  return null;
}

/**
 * The modifier an actor brings to a task, READ FROM THE SHEET.
 *
 * `skills.<key>.total` and `abilities.<key>.mod` are what dnd5e has already
 * computed - proficiency, expertise, Jack of All Trades, every active effect that
 * touches the skill. Nothing here recomputes any of that, which is the whole
 * reason this is a lookup and not an addition.
 *
 * It is used for DISPLAY and for `@mod` in a yield formula. It is never added to
 * the d20 roll: that goes through the system, which applies the same bonuses
 * itself (see rollTask).
 */
export function modifierFor(actor, task) {
  const check = taskCheck(task);
  if (!check || !actor) return null;
  const value = check.type === "skill"
    ? actor.system?.skills?.[check.key]?.total
    : actor.system?.abilities?.[check.key]?.mod;
  return Number.isFinite(value) ? value : null;
}

/* ------------------------------------------------------------------ */
/*  The party                                                          */
/* ------------------------------------------------------------------ */

/** Warn about a missing group actor once, not on every render. */
let warnedGroup = false;

/**
 * The group actor named by the `groupActor` setting.
 *
 * Accepts a uuid, an id or the plain name, because the setting is a text field
 * (settings register at `init`, before `game.actors` exists to build a dropdown
 * from) and "I typed the name" is what people actually do.
 */
export function resolveGroupActor() {
  const ref = String(setting("groupActor") ?? "").trim();
  if (!ref) return null;
  const found = game.actors?.get(ref)
    ?? game.actors?.find(a => a.uuid === ref)
    ?? game.actors?.getName(ref);
  return found?.type === "group" ? found : (found ?? null);
}

/**
 * Who is travelling.
 *
 * Two sources, by setting. The group actor is the precise one - it is the party
 * the GM actually assembled - and player-owned characters is the one that works
 * in a world where nobody made a group. A configured-but-missing group falls back
 * rather than showing an empty window, and says so once.
 *
 * Sorted by name so the list does not reorder itself between renders.
 */
export function partyActors() {
  if (setting("partySource") === PARTY_SOURCE.GROUP) {
    const group = resolveGroupActor();
    const members = group?.system?.members ?? [];
    const actors = members.map(m => m.actor).filter(a => a?.system?.isCreature ?? a?.type === "character");
    if (actors.length) return sortByName(actors);
    if (!warnedGroup) {
      warnedGroup = true;
      ui.notifications?.warn(game.i18n.localize(`${MODULE_ID}.notify.noGroup`));
    }
  }
  return sortByName((game.actors ?? []).filter(a => a.type === "character" && a.hasPlayerOwner));
}

const sortByName = (actors) => [...actors].sort((a, b) => a.name.localeCompare(b.name));

/** How many mouths there are to water. 0 in the setting means "count the party". */
export function travelerCount() {
  const configured = Math.floor(Number(setting("travelers")) || 0);
  return configured > 0 ? configured : partyActors().length;
}

/** Whether this user may act for an actor at all. The GM may act for everyone. */
export const canControl = (actor) => !!actor && (game.user.isGM || actor.isOwner);

/* ------------------------------------------------------------------ */
/*  Rolling                                                            */
/* ------------------------------------------------------------------ */

/**
 * The pace modifier that applies to a task. Navigation only.
 *
 * This is the house rule from the brief ("langsam +5, schnell -5"), and it is
 * separate from dnd5e's own pace rules, which are handed to the system below via
 * `config.pace` and cover different skills entirely.
 */
export function paceModifierFor(task, state = getState()) {
  if (task?.id !== NAVIGATION_TASK) return 0;
  return paceTable()[state.pace]?.mod ?? 0;
}

/**
 * Roll one task for one actor, and return the record to store.
 *
 * THE ROLL GOES THROUGH THE SYSTEM. `actor.rollSkill()` / `rollAbilityCheck()`
 * are dnd5e 5.3's own entry points, so proficiency, expertise, Bless, Halfling
 * Luck, Reliable Talent, exhaustion, every `dnd5e.preRollSkill` hook and every
 * module hanging off them all apply, and the chat card is the system's own. This
 * module never builds a d20 formula of its own - the only `new Roll` here is the
 * yield, which is a resource and not a check.
 *
 * Returns null when the player cancelled the configuration dialog, which the
 * system reports as an empty array. That is a real outcome and must not be
 * stored as a result of 0.
 *
 * @param {Actor5e} actor
 * @param {object} task            An entry from getTasks().
 * @param {object} [options]
 * @param {Event}  [options.event] The originating click, so Foundry's own
 *                                 advantage/disadvantage keybinds work.
 * @returns {Promise<object|null>} The record for state.recordRoll().
 */
export async function rollTask(actor, task, { event } = {}) {
  const check = taskCheck(task);
  if (!check) return null;

  const state = getState();
  const dc = Number(task.dc);
  const paceMod = paceModifierFor(task, state);

  /** @type {object} */
  const config = {
    // Sets roll.options.target, which is what makes the SYSTEM's chat card show
    // the success/failure styling - and it costs nothing here.
    target: Number.isFinite(dc) ? dc : undefined,
    event
  };

  // The house-rule pace modifier, as a named term so it is legible in the card
  // rather than folded into an anonymous number.
  if (paceMod) {
    config.rolls = [{ parts: ["@pace"], data: { pace: paceMod } }];
  }

  // dnd5e's OWN pace rules (advantage on Stealth while slow, disadvantage on
  // Perception while fast, per CONFIG.DND5E.skills.<key>.pace). Opt-in, and it
  // applies to every task, not just navigation.
  if (setting("usePaceRules")) config.pace = state.pace;

  const dialog = { configure: !setting("skipRollDialog") };

  let rolls;
  if (check.type === "skill") {
    config.skill = check.key;
    rolls = await actor.rollSkill(config, dialog, {});
  } else {
    config.ability = check.key;
    rolls = await actor.rollAbilityCheck(config, dialog, {});
  }

  // Cancelled dialog, or a `dnd5e.preRoll*` hook that vetoed the roll.
  if (!rolls?.length) return null;
  const roll = rolls[0];

  // RAW: an ability check has no natural-20 auto-success, so the comparison is
  // the whole verdict. `roll.isSuccess` says the same thing when a target was
  // set, but it answers `false` when one was not - so the total is the authority
  // and a task without a DC honestly has no verdict at all.
  const success = Number.isFinite(dc) ? roll.total >= dc : null;

  const record = {
    taskId: task.id,
    actorId: actor.id,
    actorName: actor.name,
    total: roll.total,
    dc: Number.isFinite(dc) ? dc : null,
    success,
    formula: roll.formula,
    // The raw d20 face, for the window's "17 (nat 3)" line. Guarded because a
    // module may well have replaced the dice term with something else.
    d20: roll.dice?.[0]?.total ?? null,
    paceMod,
    by: game.user.id,
    at: Date.now()
  };

  if (success && task.yield?.formula) {
    record.yield = await rollYield(actor, task);
  }

  return record;
}

/**
 * The bonus resource a successful task turns up: gallons of water, pounds of food.
 *
 * A plain Roll, deliberately. This is not a d20 test - there is no DC, no
 * advantage and nothing in the system that has an opinion about it - so routing
 * it through the check pipeline would only invent a check that is not being made.
 *
 * `@mod` resolves to the same modifier the check displayed, which is what the
 * default "1d6 + @mod" means by "1d6 + WEI". The actor's full roll data is merged
 * underneath, so a custom formula can reach `@abilities.wis.mod` or `@prof` too.
 */
async function rollYield(actor, task) {
  const mod = modifierFor(actor, task) ?? 0;
  const data = { ...actor.getRollData(), mod };

  let roll;
  try {
    roll = new Roll(String(task.yield.formula), data);
    await roll.evaluate();
  } catch (error) {
    // A broken custom formula must not swallow the check that already succeeded.
    console.warn(`${MODULE_ID} | yield formula failed for task "${task.id}"`, error);
    ui.notifications?.warn(game.i18n.format(`${MODULE_ID}.notify.badYield`, { task: taskLabel(task) }));
    return null;
  }

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.format(`${MODULE_ID}.chat.yield`, {
      task: taskLabel(task),
      unit: unitLabel(task.yield.unit)
    })
  });

  return { total: roll.total, formula: roll.formula, unit: task.yield.unit ?? null };
}

/**
 * The display name of a yield unit. Known units ("gallons", "pounds") translate;
 * anything else is shown as written, so a custom task can invent "Bündel".
 */
export function unitLabel(unit) {
  if (!unit) return "";
  const key = `${MODULE_ID}.unit.${unit}`;
  const text = game.i18n.localize(key);
  return text === key ? unit : text;
}
