import { MODULE_ID } from "./const.mjs";
import { setting } from "./settings.mjs";
import { isWriter } from "./state.mjs";

/**
 * WRITING THE DAY ONTO THE SHEETS.
 *
 * Kept apart from resolve.mjs on purpose. Resolving a day rolls dice and builds
 * a report; nothing has happened to anybody yet, which is what makes "resolve it
 * again" a safe thing for a GM to click. THIS file is the irreversible half, and
 * it runs exactly once, when the day is completed.
 *
 * GM ONLY, and it says so twice: a player cannot write to somebody else's sheet
 * anyway, but failing here silently would leave a day half-applied.
 */

/**
 * Apply one report's consequences.
 *
 * Returns a summary of what was actually written, which the caller puts in chat
 * - a GM who has just advanced the day should not have to open five sheets to
 * find out what the jungle did.
 *
 * Honours the `applyConsequences` setting: with it off, this reports what it
 * WOULD have done and touches nothing. The report already says the same thing,
 * so a table that prefers to apply damage by hand loses nothing but the writes.
 */
export async function applyConsequences(report) {
  if (!isWriter()) return null;
  if (!report?.consequences?.length) return { applied: false, entries: [] };

  const enabled = !!setting("applyConsequences");
  const entries = [];

  for (const entry of report.consequences) {
    const actor = game.actors.get(entry.actorId);
    // A character deleted between resolving and completing the day is not an
    // error worth stopping for - the rest of the party still takes its lumps.
    if (!actor) continue;

    const result = { ...entry, hpBefore: actor.system?.attributes?.hp?.value ?? null };

    if (enabled) {
      try {
        // applyDamage() rather than a raw hp update: it is the system's own
        // path, so temporary hit points, resistances and damage-reduction
        // effects all get their say.
        if (entry.damage > 0) await actor.applyDamage(entry.damage);

        const delta = (entry.exhaustion ?? 0) - (entry.heals ?? 0);
        if (delta !== 0) await adjustExhaustion(actor, delta);
      } catch (error) {
        console.warn(`${MODULE_ID} | could not apply consequences to ${actor.name}`, error);
        result.error = true;
      }
    }

    result.hpAfter = actor.system?.attributes?.hp?.value ?? null;
    entries.push(result);
  }

  return { applied: enabled, entries };
}

/**
 * Move an actor's exhaustion by a delta, clamped to the system's own range.
 *
 * The ceiling comes from `CONFIG.DND5E.conditionTypes.exhaustion.levels` rather
 * than a 6 written here: the 2014 and 2024 tracks differ, homebrew changes it,
 * and the system already knows the answer.
 */
export async function adjustExhaustion(actor, delta) {
  const current = Number(actor.system?.attributes?.exhaustion) || 0;
  const max = Number(CONFIG.DND5E?.conditionTypes?.exhaustion?.levels) || 6;
  const next = Math.clamp(current + delta, 0, max);
  if (next === current) return null;
  return actor.update({ "system.attributes.exhaustion": next });
}

/**
 * Post the day to chat.
 *
 * The window is the live view, but it is cleared when the day completes - and
 * the story of day 12 should still be readable on day 20. Chat is where a table
 * already looks for "what happened", so that is where the day goes.
 *
 * Built as plain markup rather than a template part: it is not part of any
 * application's render, and giving it one would mean a template that exists
 * solely to be stringified.
 */
export async function postDayToChat(report, texts) {
  const rows = (texts.events ?? []).map(e => `
    <li><strong>${foundry.utils.escapeHTML(e.title)}</strong><br>${foundry.utils.escapeHTML(e.text)}</li>`).join("");

  /**
   * The day's checks as one block of text.
   *
   * Text, deliberately - not Roll objects. A chat message carrying a roll is
   * exactly what Dice So Nice animates, and the whole point of rolling the
   * batch quietly was to keep six sets of dice off the screen. Putting them
   * back here as rolls would undo it at the last step.
   */
  const checks = (report.rolls ?? []).map(r => {
    const role = game.i18n.localize(`${MODULE_ID}.role.${r.roleId}.label`);
    const verdict = r.success === null || r.success === undefined
      ? ""
      : ` &mdash; ${game.i18n.localize(`${MODULE_ID}.app.${r.success ? "success" : "failure"}`)}`;
    return `<li>${foundry.utils.escapeHTML(r.actorName)} &middot; ${foundry.utils.escapeHTML(role)}: `
      + `<strong>${r.total}</strong>${r.dc ? ` / ${r.dc}` : ""}${verdict}</li>`;
  }).join("");

  const harm = (report.consequences ?? []).map(c => {
    const bits = [];
    if (c.damage) bits.push(game.i18n.format(`${MODULE_ID}.chat.damage`, { n: c.damage }));
    if (c.exhaustion) bits.push(game.i18n.format(`${MODULE_ID}.chat.exhaustion`, { n: c.exhaustion }));
    if (c.heals) bits.push(game.i18n.format(`${MODULE_ID}.chat.healed`, { n: c.heals }));
    return `<li>${foundry.utils.escapeHTML(c.actorName)}: ${bits.join(", ")}</li>`;
  }).join("");

  const content = `
    <div class="toa-chat">
      <h3>${game.i18n.format(`${MODULE_ID}.chat.dayTitle`, { day: report.day })}</h3>
      <p class="toa-chat-hexes"><strong>${game.i18n.format(`${MODULE_ID}.chat.hexes`, { n: report.hexes })}</strong></p>
      <p class="toa-chat-weather">${foundry.utils.escapeHTML(texts.weather ?? "")}</p>
      ${rows ? `<ul>${rows}</ul>` : `<p>${game.i18n.localize(`${MODULE_ID}.chat.quietDay`)}</p>`}
      ${checks ? `<hr><p class="toa-chat-label">${game.i18n.localize(`${MODULE_ID}.chat.checks`)}</p><ul>${checks}</ul>` : ""}
      ${harm ? `<hr><ul>${harm}</ul>` : ""}
    </div>`;

  // WHISPERED TO THE GM unless the table has opted in. The prose is written to
  // be read aloud, so the default is that the GM reads it and the players hear
  // it - not that it lands in their log a second before the GM opens their mouth.
  const share = !!setting("shareReport");
  const whisper = share ? [] : ChatMessage.getWhisperRecipients("GM").map(u => u.id);

  return ChatMessage.create({
    content,
    whisper,
    flags: { [MODULE_ID]: { day: report.day } }
  });
}
