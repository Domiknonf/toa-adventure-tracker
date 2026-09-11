import { MODULE_ID, WEATHER } from "./const.mjs";
import { setting } from "./settings.mjs";

/**
 * WEATHER, ROLLED.
 *
 * There is no switch for this anywhere in the module, deliberately. The supply
 * economy only means something if dry spells are something that HAPPENS to the
 * party: a GM who has to decide each morning whether it rains will, quite
 * reasonably, decide in favour of the story they already had in mind, and the
 * barrels will never run dry by accident.
 *
 * Chult in the wet season rains most days, which is why the defaults are a 10%
 * storm and a 55% rain - two days in three are wet. Both are settings, so a
 * campaign set in the dry season is two numbers away.
 */

/**
 * Roll the day's weather.
 *
 * The two configured chances are taken in order (storm first, then rain) and
 * whatever percentage is left over is dry - split evenly between the two dry
 * kinds, which differ only in what they cost: `humid` is merely unpleasant,
 * `clear` bakes and puts the water need up (see CLEAR_DAY_THIRST).
 *
 * Chances that add up past 100 are not an error to report - they simply mean
 * the world never has a dry day, which is a legitimate thing to configure.
 */
export async function rollWeather() {
  const storm = clampPercent(setting("stormChance"));
  const rain = clampPercent(setting("rainChance"));

  const roll = await new Roll("1d100").evaluate();
  const value = roll.total;

  let key;
  if (value <= storm) key = "storm";
  else if (value <= storm + rain) key = "rain";
  // The leftover splits evenly. Math.random rather than another die: nothing
  // about "is today merely muggy or properly baking" deserves a roll in chat.
  else key = Math.random() < 0.5 ? "humid" : "clear";

  return { key, roll: value, ...WEATHER[key] };
}

const clampPercent = (value) => Math.clamp(Math.floor(Number(value) || 0), 0, 100);


/** Display label for a weather key. */
export const weatherLabel = (key) => game.i18n.localize(`${MODULE_ID}.weather.${key}`);
