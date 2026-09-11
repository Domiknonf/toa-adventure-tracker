import { MODULE_ID, DEFAULT_ROLES, ROLE, PARTY_SOURCE } from "./const.mjs";
import { setting, paceTable } from "./settings.mjs";
import { getState } from "./state.mjs";

/**
 * ROLES, THE PARTY, AND THE ROLLING.
 *
 * A traveller signs up for one job for the day and rolls it. How well the party
 * fills its roles is the entire input to resolve.mjs - there is no separate
 * encounter roll happening off to the side.
 *
 * Nothing here writes state. A roll produces a RECORD and hands it back; storing
 * it is state.mjs's business, reached directly (GM) or through the socket
 * (player). That is what keeps the roll on the roller's own client, where their
 * dice, their modules and their advantage keybinds live.
 */

/* ------------------------------------------------------------------ */
/*  The role list                                                      */
/* ------------------------------------------------------------------ */

let roleCache = { raw: null, parsed: [] };
let warnedFor = null;

/**
 * The effective role list: the defaults with the custom JSON merged in by id.
 *
 * Merge, not replace: a matching id overrides that default field by field, an
 * unknown id is appended, and `"hidden": true` removes a default. Order follows
 * the defaults, so tweaking a DC does not reshuffle the window.
 */
export function getRoles() {
  const merged = new Map(DEFAULT_ROLES.map(r => [r.id, foundry.utils.deepClone(r)]));

  for (const custom of customRoles()) {
    if (!custom?.id) continue;
    if (custom.hidden) { merged.delete(custom.id); continue; }
    const base = merged.get(custom.id) ?? {};
    merged.set(custom.id, foundry.utils.mergeObject(base, custom, { inplace: false }));
  }

  return [...merged.values()].filter(isUsable);
}

/** Parse the customRoles setting, tolerating everything except silence. */
function customRoles() {
  const raw = String(setting("customRoles") ?? "").trim();
  if (!raw) { roleCache = { raw: "", parsed: [] }; return []; }
  if (roleCache.raw === raw) return roleCache.parsed;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    // A typo costs one warning and the default list, never the window - and one
    // warning, not one per render.
    if (warnedFor !== raw) {
      warnedFor = raw;
      ui.notifications?.warn(game.i18n.format(`${MODULE_ID}.notify.badRoleJson`, { error: error.message }));
      console.warn(`${MODULE_ID} | customRoles is not valid JSON`, error);
    }
    roleCache = { raw, parsed: [] };
    return [];
  }

  if (!Array.isArray(parsed)) parsed = [parsed];
  roleCache = { raw, parsed };
  warnedFor = null;
  return parsed;
}

/** A role is usable if it names something that can actually be rolled. */
function isUsable(role) {
  return !!role?.id && (!!resolveSkill(role.skill) || !!resolveAbility(role.ability));
}

export const getRole = (id) => getRoles().find(r => r.id === id) ?? null;

/* ------------------------------------------------------------------ */
/*  Labels                                                             */
/* ------------------------------------------------------------------ */

/**
 * A role's label / description. A custom role may carry its own `label`, either
 * as literal text or as an i18n key - `localize` returns its input unchanged for
 * an unknown key, so both work with no flag to set.
 */
export function roleLabel(role) {
  if (role?.label) return game.i18n.localize(role.label);
  return game.i18n.localize(`${MODULE_ID}.role.${role.id}.label`);
}

export function roleHint(role) {
  if (role?.hint) return game.i18n.localize(role.hint);
  const key = `${MODULE_ID}.role.${role.id}.hint`;
  const text = game.i18n.localize(key);
  return text === key ? "" : text;
}

/* ------------------------------------------------------------------ */
/*  Skills and abilities                                               */
/* ------------------------------------------------------------------ */

/**
 * Resolve whatever somebody wrote into a real CONFIG.DND5E.skills key. Accepts
 * the system key ("sur"), the fullKey ("survival") and the localized label.
 *
 * Deliberately NOT a hardcoded map: the system owns that table, modules add to
 * it, and a frozen copy here would be wrong the first time anybody adds a skill.
 */
export function resolveSkill(value) {
  return resolveIn(CONFIG.DND5E?.skills, value);
}

/** The same, for CONFIG.DND5E.abilities. */
export function resolveAbility(value) {
  return resolveIn(CONFIG.DND5E?.abilities, value);
}

function resolveIn(table, value) {
  if (!value || !table) return null;
  if (table[value]) return value;
  const needle = String(value).toLowerCase();
  for (const [key, config] of Object.entries(table)) {
    if (key.toLowerCase() === needle) return key;
    if (String(config.fullKey ?? "").toLowerCase() === needle) return key;
    if (game.i18n.localize(config.label ?? "").toLowerCase() === needle) return key;
  }
  return null;
}

/** What the role is rolled with: `{ type, key, label }`. */
export function roleCheck(role) {
  const skill = resolveSkill(role?.skill);
  if (skill) {
    return { type: "skill", key: skill, label: game.i18n.localize(CONFIG.DND5E.skills[skill]?.label ?? skill) };
  }
  const ability = resolveAbility(role?.ability);
  if (ability) {
    return { type: "ability", key: ability, label: game.i18n.localize(CONFIG.DND5E.abilities[ability]?.label ?? ability) };
  }
  return null;
}

/**
 * The modifier an actor brings to a role, READ FROM THE SHEET.
 *
 * `skills.<key>.total` and `abilities.<key>.mod` are what dnd5e has already
 * computed - proficiency, expertise, Jack of All Trades, every active effect.
 * Nothing here recomputes any of it.
 *
 * Used for DISPLAY and for `@mod` in a yield formula. Never added to the d20
 * roll: that goes through the system, which applies the same bonuses itself.
 */
export function modifierFor(actor, role) {
  const check = roleCheck(role);
  if (!check || !actor) return null;
  const value = check.type === "skill"
    ? actor.system?.skills?.[check.key]?.total
    : actor.system?.abilities?.[check.key]?.mod;
  return Number.isFinite(value) ? value : null;
}

/* ------------------------------------------------------------------ */
/*  The party                                                          */
/* ------------------------------------------------------------------ */

let warnedGroup = false;

/** The group actor named by the `groupActor` setting: uuid, id or plain name. */
export function resolveGroupActor() {
  const ref = String(setting("groupActor") ?? "").trim();
  if (!ref) return null;
  return game.actors?.get(ref)
    ?? game.actors?.find(a => a.uuid === ref)
    ?? game.actors?.getName(ref)
    ?? null;
}

/**
 * Who is travelling. A configured-but-missing group falls back to player
 * characters rather than showing an empty window, and says so once.
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

/** Whether this user may act for an actor. The GM may act for everyone. */
export const canControl = (actor) => !!actor && (game.user.isGM || actor.isOwner);

/**
 * The highest exhaustion level anyone in the party carries.
 *
 * The HIGHEST, not the sum: exhaustion is a per-creature track, and a party of
 * five at one level each is five tired people, not a party at level five. It is
 * what EXHAUSTION_LIMITS caps the day's travel against.
 */
export function worstExhaustion(actors = partyActors()) {
  return actors.reduce((worst, actor) => {
    const level = Number(actor?.system?.attributes?.exhaustion) || 0;
    return Math.max(worst, level);
  }, 0);
}

/* ------------------------------------------------------------------ */
/*  Rolling                                                            */
/* ------------------------------------------------------------------ */

/** The navigation modifier of the current pace. Applies to the navigator alone. */
export function paceModifierFor(role, state = getState()) {
  if (role?.id !== ROLE.NAVIGATOR) return 0;
  return paceTable()[state.pace]?.navMod ?? 0;
}

/**
 * Roll one role for one actor, and return the record to store.
 *
 * THE ROLL GOES THROUGH THE SYSTEM. `actor.rollSkill()` / `rollAbilityCheck()`
 * are dnd5e 5.3's own entry points, so proficiency, expertise, Bless, Halfling
 * Luck, Reliable Talent, exhaustion and every module hanging off them apply, and
 * the chat card is the system's own. This module never builds a d20 formula; the
 * only `new Roll` here is the yield, which is a resource and not a check.
 *
 * Returns null when the roller cancelled the dialog - a real outcome that must
 * not be stored as a result of 0.
 */
export async function rollRole(actor, role, { event } = {}) {
  const check = roleCheck(role);
  if (!check) return null;

  const state = getState();
  const dc = Number(role.dc);
  const paceMod = paceModifierFor(role, state);

  const config = {
    // Sets roll.options.target, which makes the SYSTEM's own chat card show the
    // success/failure styling. Costs nothing here.
    target: Number.isFinite(dc) ? dc : undefined,
    event
  };

  // The pace modifier as a named term, so it is legible in the card rather than
  // folded into an anonymous number.
  if (paceMod) config.rolls = [{ parts: ["@pace"], data: { pace: paceMod } }];

  // dnd5e's OWN pace rules, which cover different skills than our modifier does.
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

  if (!rolls?.length) return null;
  const roll = rolls[0];

  // RAW: an ability check has no natural-20 auto-success, so the comparison is
  // the whole verdict.
  const success = Number.isFinite(dc) ? roll.total >= dc : null;

  const record = {
    roleId: role.id,
    actorId: actor.id,
    actorName: actor.name,
    total: roll.total,
    dc: Number.isFinite(dc) ? dc : null,
    success,
    // How far past (or short of) the DC. resolve.mjs reads this: beating a DC by
    // a clear margin is what turns a fast day into two hexes.
    margin: Number.isFinite(dc) ? roll.total - dc : 0,
    formula: roll.formula,
    d20: roll.dice?.[0]?.total ?? null,
    paceMod,
    by: game.user.id,
    at: Date.now()
  };

  if (success && role.yield?.formula) record.yield = await rollYield(actor, role);

  return record;
}

/**
 * The resource a successful role turns up: gallons of water, pounds of food.
 *
 * A plain Roll, deliberately. This is not a d20 test - no DC, no advantage,
 * nothing in the system with an opinion about it - so routing it through the
 * check pipeline would invent a check nobody is making.
 *
 * `@mod` resolves to the same modifier the check displayed, which is what the
 * default "1d6 + @mod" means by "1d6 + WIS". The actor's full roll data sits
 * underneath, so a custom formula can reach `@abilities.wis.mod` or `@prof`.
 */
async function rollYield(actor, role) {
  const mod = modifierFor(actor, role) ?? 0;
  let roll;
  try {
    roll = new Roll(String(role.yield.formula), { ...actor.getRollData(), mod });
    await roll.evaluate();
  } catch (error) {
    // A broken custom formula must not swallow the check that already succeeded.
    console.warn(`${MODULE_ID} | yield formula failed for role "${role.id}"`, error);
    ui.notifications?.warn(game.i18n.format(`${MODULE_ID}.notify.badYield`, { role: roleLabel(role) }));
    return null;
  }

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.format(`${MODULE_ID}.chat.yield`, {
      role: roleLabel(role),
      unit: unitLabel(role.yield.unit)
    })
  });

  return { total: roll.total, formula: roll.formula, unit: role.yield.unit ?? null };
}

/** Known units translate; anything else shows as written, so "Bündel" works. */
export function unitLabel(unit) {
  if (!unit) return "";
  const key = `${MODULE_ID}.unit.${unit}`;
  const text = game.i18n.localize(key);
  return text === key ? unit : text;
}

/* ------------------------------------------------------------------ */
/*  How the day's roles turned out                                     */
/* ------------------------------------------------------------------ */

/**
 * The status of one role for the day, which is what the whole engine reads.
 *
 * Four outcomes, and the difference between the last two is the point:
 *   "success"  somebody took it and made it
 *   "failure"  somebody took it and missed
 *   "unfilled" nobody took it, and the role's `unfilled` rule says how bad that
 *              is - "worse" means nobody watching the front at all is NOT the
 *              same as a distracted lookout, and resolve.mjs sharpens the
 *              penalty accordingly
 *   "pending"  somebody took it and has not rolled yet
 */
export function roleStatus(roleId, state = getState()) {
  const role = getRole(roleId);
  if (!role) return { role: null, status: "unfilled", severity: "none" };

  const actorId = Object.keys(state.assignments ?? {})
    .find(id => state.assignments[id] === roleId);

  if (!actorId) {
    return { role, status: "unfilled", severity: role.unfilled ?? "fail", record: null };
  }

  const record = state.rolls?.[actorId] ?? null;
  if (!record) return { role, status: "pending", severity: "none", actorId, record: null };

  return {
    role,
    actorId,
    record,
    status: record.success ? "success" : "failure",
    severity: "none"
  };
}

/** True when the role did NOT come good - failed, or nobody took it. */
export const roleFailed = (status) => status.status === "failure" || status.status === "unfilled";

/** True when nobody taking the role is worse than somebody failing it. */
export const roleCritical = (status) => status.status === "unfilled" && status.severity === "worse";
