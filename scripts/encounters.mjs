import {
  MODULE_ID, XP_THRESHOLDS, CR_XP, ENCOUNTER_MULTIPLIERS, MAX_FOES, MAX_LEVEL
} from "./const.mjs";
import { setting } from "./settings.mjs";
import { partyActors } from "./roles.mjs";

/**
 * HOW MANY OF THEM.
 *
 * The event says what came out of the trees; this works out how many of it makes
 * a hard or a deadly fight for the party as it currently stands, so a GM who
 * wants to run the encounter has a number rather than a guess.
 *
 * SUGGESTIONS ONLY. Nothing here spawns a token, rolls initiative or touches the
 * combat tracker - the module has no opinion about whether the fight happens at
 * all. It is arithmetic offered to the person who decides.
 *
 * Uses the 2014 DMG budgets, the edition Tomb of Annihilation was written for.
 */

/**
 * The party's level.
 *
 * The setting wins when it is set; 0 means "work it out", which averages the
 * travelling characters' levels. Averaging rather than taking the highest
 * because the budget table is per character and a party is budgeted as a whole -
 * one level-9 fighter among four level-5s does not make it a level-9 party.
 */
export function partyLevel() {
  const configured = Math.floor(Number(setting("partyLevel")) || 0);
  if (configured > 0) return Math.clamp(configured, 1, MAX_LEVEL);

  const levels = partyActors()
    .map(a => Number(a?.system?.details?.level))
    .filter(n => Number.isFinite(n) && n > 0);
  if (!levels.length) return 1;

  const average = levels.reduce((a, b) => a + b, 0) / levels.length;
  return Math.clamp(Math.round(average), 1, MAX_LEVEL);
}

/**
 * The party's hard and deadly XP budgets.
 *
 * Party SIZE here is the number of characters who would actually be in the
 * fight, not travelerCount() - bearers and pack mules eat and drink but they do
 * not hold a line, and counting them would inflate every budget.
 */
export function budgets(level = partyLevel(), size = partyActors().length) {
  const row = XP_THRESHOLDS[Math.clamp(level, 1, MAX_LEVEL)];
  const heads = Math.max(1, size);
  return { level, size: heads, hard: row.hard * heads, deadly: row.deadly * heads };
}

/** The DMG crowd multiplier for a given number of monsters. */
export function multiplierFor(count) {
  return ENCOUNTER_MULTIPLIERS.find(m => count <= m.upTo)?.factor ?? 1;
}

/** Adjusted XP of `count` creatures worth `xp` each. */
export const adjustedXP = (xp, count) => xp * count * multiplierFor(count);

/**
 * The largest number of this creature that still fits inside `budget`.
 *
 * Walks up rather than solving for it, because the multiplier is a step function
 * - adding one more monster can jump the adjusted total by 25% - so there is no
 * closed form worth the trouble for numbers this small.
 *
 * Returns 0 when even one is already over budget. That is a real answer, and the
 * caller says so rather than pretending one is fine.
 */
export function countFor(cr, budget) {
  const xp = CR_XP[String(cr)];
  if (!xp || !budget) return 0;
  let best = 0;
  for (let n = 1; n <= MAX_FOES; n++) {
    if (adjustedXP(xp, n) <= budget) best = n;
    else break;
  }
  return best;
}

/**
 * What to suggest for one event, or null when it has no foe.
 *
 * Events without a `foe` are hazards (quicksand), weather, or meetings that are
 * not fights (the tabaxi hunter) - offering an encounter size for those would be
 * inventing a battle the event does not describe.
 */
export function suggestionFor(event, level = partyLevel()) {
  if (!event?.foe) return null;
  const { hard, deadly, size } = budgets(level);
  const cr = event.foe.cr;
  const xp = CR_XP[String(cr)];
  if (!xp) return null;

  const hardCount = countFor(cr, hard);
  const deadlyCount = countFor(cr, deadly);

  return {
    key: event.foe.key,
    name: foeName(event.foe.key),
    cr,
    xp,
    level,
    size,
    hard: hardCount,
    deadly: deadlyCount,
    // One of them is already past the party's deadly budget: worth saying
    // outright rather than quietly suggesting a single creature as "hard".
    overwhelming: deadlyCount === 0,
    /**
     * One is already MORE than a hard fight but still inside deadly. There is
     * no honest "hard" number here, and printing the literal 0 the arithmetic
     * returns would read as "zero of them", which is worse than saying nothing.
     * The window shows only the deadly figure in this case.
     */
    hardImpossible: hardCount === 0 && deadlyCount > 0,
    // The cap bit, so the window can say "or more" instead of implying that
    // twelve is the ceiling the rules impose.
    capped: deadlyCount >= MAX_FOES
  };
}

/** A creature's display name, translated. */
export const foeName = (key) => game.i18n.localize(`${MODULE_ID}.foe.${key}`);
