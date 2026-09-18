import {
  MODULE_ID, ROLE, EXHAUSTION_LIMITS, EVENT_CATEGORY, BOON_CHANCE, MARGIN_FOR_SALVAGE,
  ENCOUNTER_DEFAULTS, EVENT_CHANCE, MARGIN_FOR_EXTRA_HEX, MARGIN_FOR_BONUS_HEX,
  ROLE_RELIEF, TRAVEL_MODES, DEFAULT_MODE
} from "./const.mjs";
import { setting, paceTable } from "./settings.mjs";
import { getState, isWriter, setReport } from "./state.mjs";
import {
  partyActors, roleStatus, roleFailed, roleCritical, worstExhaustion,
  kinActor, resolveSkill
} from "./roles.mjs";
import { rollWeather } from "./weather.mjs";
import { pick, targetsOf, hasEffect } from "./events.mjs";

/**
 * THE DAY ENGINE.
 *
 * Takes the day's role rolls and turns them into a story with numbers attached:
 * what the weather did, what came out of the trees, how far the party got, what
 * it cost. Everything the window shows about a resolved day comes from here.
 *
 * THE OUTPUT IS DATA, NOT ACTIONS. This builds a report and stores it; writing
 * hit points and exhaustion onto sheets is consequences.mjs, and completing the
 * day is state.mjs. Keeping those apart is what lets a GM resolve a day, read it
 * out, and decide - and what makes re-resolving a day safe, because nothing has
 * happened to anybody yet.
 *
 * GM ONLY. It rolls dice and writes state; a player who somehow called it would
 * roll a private day that never reaches anyone.
 */

/**
 * Resolve the current day and store the report.
 *
 * Called again, it rolls a fresh day - the GM's "no, let's see that again". That
 * is safe precisely because consequences have not been applied yet.
 */
export async function resolveDay() {
  if (!isWriter()) return null;

  const state = getState();
  const actors = partyActors();
  const paces = paceTable();
  const pace = paces[state.pace] ?? paces.normal;

  // Every role's verdict, resolved once and read by everything below.
  const roles = Object.fromEntries(
    Object.values(ROLE).map(id => [id, roleStatus(id, state)])
  );

  const mode = TRAVEL_MODES[state.mode] ? state.mode : DEFAULT_MODE;
  const weather = await rollWeather();
  const used = new Set();          // event ids already told today
  const events = [];
  /** Draw one event of a category from the pools this mode can see. */
  const draw = (category) => {
    const event = pick(category, used, mode);
    if (!event) return null;
    used.add(event.id);
    events.push(event);
    return event;
  };

  /* --- Weather ------------------------------------------------ */

  // A storm is its own event: it is the reason the day went the way it did, and
  // "Sturm" alone on the weather line does not say what the storm actually did.
  if (weather.key === "storm") draw(EVENT_CATEGORY.STORM);

  /* --- Navigation: did the party keep the thread? -------------- */

  const navFailed = roleFailed(roles[ROLE.NAVIGATOR]);
  // The cartographer cannot find the way, but can find the way BACK - turning a
  // lost day into a wasted one. That is the whole value of the role.
  const rescued = navFailed && roles[ROLE.CARTOGRAPHER].status === "success";

  if (navFailed) draw(rescued ? EVENT_CATEGORY.DETOUR : EVENT_CATEGORY.LOST);

  /* --- Encounters ---------------------------------------------- */

  const encounter = await rollEncounter(roles, pace);
  if (encounter.happened) {
    // THE VANGUARD'S ENTIRE JOB. Same jungle either way; the difference is
    // whether the party sees it first. An ambush costs hit points, a sighting
    // costs at most a detour.
    const surprised = roleFailed(roles[ROLE.VANGUARD]);
    draw(surprised ? EVENT_CATEGORY.AMBUSH : EVENT_CATEGORY.ENCOUNTER);
    encounter.surprised = surprised;
  }

  // The rearguard's failure is a second, separate problem: something has the
  // party's trail, whether or not anything met them today. Chance-based, so an
  // empty role is a risk rather than a daily toll (see EVENT_CHANCE).
  maybeEvent(EVENT_CATEGORY.PURSUIT, roles[ROLE.REARGUARD], draw);

  /* --- Camp ---------------------------------------------------- */

  maybeEvent(EVENT_CATEGORY.CAMP, roles[ROLE.QUARTERMASTER], draw);

  /* --- Who takes exhaustion back off ---------------------------- */

  /**
   * The roles that RELIEVE rather than cost: the medic treating people, and a
   * quartermaster whose camp was worth sleeping in.
   *
   * This is the counterweight to a table whose house rules bar long rests
   * outside safe places. Without a daily lever, exhaustion is a ratchet - 200
   * simulated treks put a competent party at the travel cap in about three
   * weeks and killed a third of them inside forty days, with nothing they could
   * have done differently.
   *
   * Relief goes to DIFFERENT travellers where there are enough of them, worst
   * off first. Two carers helping two people is both more useful and more
   * plausible than both fussing over the same one.
   */
  const relief = [];
  const cared = new Set();
  const byNeed = actors
    .filter(a => (Number(a.system?.attributes?.exhaustion) || 0) > 0)
    .sort((a, b) => b.system.attributes.exhaustion - a.system.attributes.exhaustion);

  /**
   * WHAT EACH CARER DID, INCLUDING NOTHING.
   *
   * The medic fires on about one day in five - it needs a passed check AND
   * somebody already exhausted - so at the table it looks broken: you take the
   * role, you pass the roll, and the report says nothing at all. It was never
   * broken; it was silent, which is indistinguishable.
   *
   * Every relieving role now reports its own outcome, and "nobody was
   * exhausted" is one of them: that is the medic having a quiet day, not the
   * module forgetting the medic exists.
   */
  const care = [];

  for (const [roleId, amount] of Object.entries(ROLE_RELIEF)) {
    const status = roles[roleId]?.status;
    if (status !== "success") {
      care.push({ roleId, outcome: status === "unfilled" ? "unfilled" : "failed" });
      continue;
    }
    // The worst-off traveller nobody has seen to yet; if everyone has been
    // seen to, the carer doubles up on whoever needs it most.
    const target = byNeed.find(a => !cared.has(a.id)) ?? byNeed[0];
    if (!target) {
      care.push({ roleId, outcome: "nobodyNeeded" });
      continue;
    }
    cared.add(target.id);
    care.push({ roleId, outcome: "helped", actorName: target.name, heals: amount });
    const existing = relief.find(r => r.actorId === target.id);
    if (existing) existing.heals += amount;
    else relief.push({ actorId: target.id, actorName: target.name, heals: amount, by: roleId });
  }

  /* --- The jungle's good mood ---------------------------------- */

  /**
   * A day where nothing came at them and they got where they were going.
   *
   * It used to also demand that EVERY role had succeeded - which a party of
   * five can never satisfy, because there are six roles and an unfilled one
   * counts as failed. Boons turned up on 3 % of days: the upside was decorative.
   * Now the gate is the two things the party actually controls, so a good day is
   * something they can play for.
   */
  const flawless = !events.length && !roleFailed(roles[ROLE.NAVIGATOR]);
  if (flawless && Math.random() * 100 < BOON_CHANCE) draw(EVENT_CATEGORY.BOON);

  /* --- A word back, from the one they were talking about --------- */

  /**
   * Kin events are settled by ONE roll from the traveller they are about, not
   * by a save from everybody. It happens here rather than inside the
   * consequence pass because an event may have no mechanical cost at all and
   * still need its ending decided - the retort picks which half of the prose
   * gets read, and that is the whole point of these events.
   *
   * The drawn event objects are the const table's own, so the result goes on a
   * COPY. Writing it through would leave last Tuesday's answer sitting in the
   * table for every day after.
   */
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!event.retort) continue;
    const speaker = kinActor(event.kin);
    events[i] = {
      ...event,
      retortResult: speaker
        ? await rollRetort(speaker, event.retort)
        : { ok: false, total: null, dc: event.retort.dc, by: null }
    };
  }

  /* --- Distance ------------------------------------------------ */

  const movement = resolveMovement({ state, roles, pace, events, rescued, actors, mode });

  /* --- What it costs the travellers ---------------------------- */

  const consequences = await resolveConsequences(events, actors);

  // Relief rides on the same list the Apply button reads, so everything that
  // touches a sheet goes through exactly one path.
  for (const entry of relief) {
    const existing = consequences.find(c => c.actorId === entry.actorId);
    if (existing) existing.heals += entry.heals;
    else consequences.push({
      actorId: entry.actorId, actorName: entry.actorName,
      damage: 0, exhaustion: 0, heals: entry.heals,
      from: [{ event: entry.by, saved: null }]
    });
  }

  const report = {
    day: state.day,
    pace: state.pace,
    mode,
    weather: { key: weather.key, rain: weather.rain, roll: weather.roll },
    hexes: movement.hexes,
    reasons: movement.reasons,
    encounter,
    // What the relieving roles did today, "nothing to do" included.
    care,
    events: events.map(e => ({ ...e })),
    consequences,
    roles: Object.fromEntries(Object.entries(roles).map(([id, s]) => [id, {
      status: s.status, actorId: s.actorId ?? null, critical: roleCritical(s)
    }])),
    /**
     * What everyone rolled, as plain numbers.
     *
     * Kept on the report because the batch deliberately creates no chat cards
     * (see roles.rollRole) - without this the day's checks would exist only in
     * the window and vanish when the day is completed. They go out together in
     * the chat summary instead: one message, no dice.
     */
    rolls: Object.values(roles)
      .filter(s => s.record)
      .map(s => ({
        actorName: s.record.actorName,
        roleId: s.role.id,
        total: s.record.total,
        dc: s.record.dc,
        success: s.record.success
      })),
    at: Date.now()
  };

  await setReport(report);
  return report;
}

/**
 * Add a category's event only if the role's failure actually bites today.
 *
 * An unfilled role rolls against the higher of the two chances - nobody at all
 * is worse than somebody having a bad day, which is the same rule the encounter
 * chance follows.
 */
function maybeEvent(category, status, draw) {
  if (!roleFailed(status)) return null;
  const chance = EVENT_CHANCE[category];
  if (chance) {
    const threshold = status.status === "unfilled" ? chance.unfilled : chance.failed;
    if (Math.random() * 100 >= threshold) return null;
  }
  return draw(category);
}

/* ------------------------------------------------------------------ */
/*  Encounters                                                         */
/* ------------------------------------------------------------------ */

/**
 * Does anything find the party today?
 *
 * The rearguard moves this and the pace moves this; the vanguard does not -
 * scouting changes how an encounter GOES, not whether the jungle contains
 * things. Keeping those two separate is what makes both roles worth filling.
 */
async function rollEncounter(roles, pace) {
  let chance = Number(setting("encounterChance"));
  if (!Number.isFinite(chance)) chance = ENCOUNTER_DEFAULTS.baseChance;

  chance += pace.encounterMod ?? 0;

  const rear = roles[ROLE.REARGUARD];
  if (roleCritical(rear)) chance += ENCOUNTER_DEFAULTS.rearguardUnfilledMod;
  else if (roleFailed(rear)) chance += ENCOUNTER_DEFAULTS.rearguardFailMod;

  chance = Math.clamp(chance, 0, 100);

  const roll = await new Roll("1d100").evaluate();
  return { happened: roll.total <= chance, chance, roll: roll.total, surprised: false };
}

/* ------------------------------------------------------------------ */
/*  Distance                                                           */
/* ------------------------------------------------------------------ */

/**
 * How far the party got, as 0, 1 or 2 hexes - and WHY.
 *
 * `reasons` is not decoration. A number with no explanation is a number a table
 * argues about, so every step that moved it says so, in order, and the window
 * prints the list.
 */
function resolveMovement({ state, roles, pace, events, rescued, actors, mode }) {
  const reasons = [];
  const table = TRAVEL_MODES[mode] ?? TRAVEL_MODES[DEFAULT_MODE];

  // What a good day gives at this pace, in this mode. A ship under full sail
  // and a party hacking through jungle are not the same question, so the
  // ceiling comes from the mode rather than from the pace alone.
  const target = table.hexes[state.pace] ?? table.hexes.normal;
  const cruising = table.hexes.normal;
  // The most this day can yield. Normally the pace's own ceiling, but an
  // exceptional bearing at normal pace lifts it by one (see below).
  let ceiling = target;
  let hexes = target;

  const nav = roles[ROLE.NAVIGATOR];
  const navFailed = roleFailed(nav);

  /**
   * A NEAR MISS IS NOT A LOST DAY.
   *
   * Missing the bearing by one is not the same mistake as going in circles, and
   * it used to cost the same day. Measured over 3000 days with a competent
   * level-6 party, that single rule put HALF of all travel days at zero hexes.
   *
   * Only a real roll can be a near miss: an UNFILLED navigator has no margin to
   * be close by, and leaving the role empty should still be the disaster it
   * always was.
   */
  const navMargin = nav.record?.margin;
  const nearMiss = navFailed && !rescued
    && Number.isFinite(navMargin) && navMargin >= -MARGIN_FOR_SALVAGE;

  if (nearMiss) {
    // One hexfield, never more: the morning is gone to a wrong valley either
    // way. In the faster modes that is still a heavy loss, which is what keeps
    // the cartographer worth having.
    hexes = Math.min(1, target);
    reasons.push({ key: "nearMiss", delta: hexes - target });
  } else if (navFailed && !rescued) {
    // Lost is lost, in any mode. A ship off its bearing is arguably worse than
    // a party going in circles, but zero is as low as a day goes.
    hexes = 0;
    reasons.push({ key: "lost", delta: -target });
  } else if (navFailed && rescued) {
    /**
     * The cartographer got them back on the chart: they move, but the day is
     * mostly gone. Half the pace's ceiling, ROUNDED UP, and never less than one -
     * having a map should not be worse than not travelling at all.
     *
     * Rounded up rather than down since the near-miss rule arrived: rounding
     * down made a cartographer at sea salvage exactly one hexfield, which is
     * what a near miss now hands out for free. A role has to be worth more than
     * the rule that applies when nobody fills it.
     */
    const salvaged = Math.max(1, Math.ceil(target / 2));
    reasons.push({ key: "rescued", delta: salvaged - target });
    hexes = salvaged;
  } else {
    reasons.push({ key: "navigated", delta: 0 });
    const margin = nav.record?.margin ?? 0;

    if (target > cruising) {
      // Pushing beyond the cruising ceiling has to be EARNED. Without the
      // margin rule "fast" would simply be "more", and the pace would carry no
      // risk worth weighing against its encounters and its worse navigation.
      if (margin >= MARGIN_FOR_EXTRA_HEX) {
        reasons.push({ key: "fastPace", delta: target - cruising });
      } else {
        hexes = cruising;
        reasons.push({ key: "fastNoMargin", delta: cruising - target });
      }
    } else if (state.pace === "normal" && margin >= MARGIN_FOR_BONUS_HEX) {
      // THE REASON NORMAL PACE EXISTS. Where a mode's slow and normal ceilings
      // are identical - on foot they are both 1 - slow would otherwise be
      // strictly better: same ground, better navigation, fewer encounters. This
      // is the ceiling slow can never reach.
      ceiling = target + 1;
      hexes = ceiling;
      reasons.push({ key: "exceptional", delta: 1 });
    }
  }

  // Anything that ate the day.
  for (const event of events.filter(e => e.blocks)) {
    if (hexes <= 0) break;
    hexes -= 1;
    reasons.push({ key: "blocked", delta: -1, event: event.id });
  }

  // Worn-out people do not press on, however good the navigator was. Applied
  // in every mode: a sick crew sails badly too.
  const exhaustion = worstExhaustion(actors);
  for (const limit of EXHAUSTION_LIMITS) {
    if (exhaustion >= limit.atLeast && hexes > limit.hexes) {
      reasons.push({ key: "exhausted", delta: limit.hexes - hexes, level: exhaustion });
      hexes = limit.hexes;
      break;
    }
  }

  return { hexes: Math.clamp(hexes, 0, ceiling), reasons, target, ceiling, mode };
}

/* ------------------------------------------------------------------ */
/*  Consequences                                                       */
/* ------------------------------------------------------------------ */

/**
 * What the day's events cost each traveller, as data.
 *
 * Damage is rolled ONCE per event and applied to everyone it touches. Rolling
 * per head reads better in theory and in practice produces five near-identical
 * numbers and five more chat messages.
 *
 * Saving throws DO go per traveller, through the system, because that is a real
 * per-character question - a Constitution save is exactly the thing one
 * character passes and another fails, and that difference is the whole texture
 * of a bad night. With `rollSaves` off, every save counts as failed: harsher,
 * and the setting for a table that wants to roll its own at the table.
 *
 * Nothing is written to a sheet here. This only says what WOULD happen.
 */
async function resolveConsequences(events, actors) {
  const perActor = new Map();
  const get = (actor) => {
    if (!perActor.has(actor.id)) {
      perActor.set(actor.id, {
        actorId: actor.id, actorName: actor.name,
        damage: 0, exhaustion: 0, heals: 0, restless: false, from: []
      });
    }
    return perActor.get(actor.id);
  };

  const rolling = setting("rollSaves");

  for (const event of events) {
    if (!hasEffect(event)) continue;
    const targets = targetsOf(event, actors);
    if (!targets.length) continue;

    let damage = 0;
    if (event.damage) {
      try {
        const roll = await new Roll(String(event.damage)).evaluate();
        /**
         * Scaled HERE, once, where the damage is rolled - so the number in the
         * report and the number written to the sheet can never disagree.
         *
         * Rounded up and floored at 1: a table that dials this down wants
         * smaller bites, not events that quietly stop happening.
         */
        const scale = Number(setting("damageScale"));
        const factor = Number.isFinite(scale) && scale > 0 ? scale / 100 : 1;
        damage = roll.total > 0 ? Math.max(1, Math.round(roll.total * factor)) : roll.total;
      } catch (error) {
        // A bad formula must not take the whole day's report down with it.
        console.warn(`${MODULE_ID} | damage formula failed for event "${event.id}"`, error);
      }
    }

    /**
     * A retort was already rolled once, for the whole event (see resolveDay).
     * It cancels the event for everyone it would have touched, exactly as a
     * passed save cancels it for one traveller - the difference is that one
     * person spoke for the party.
     */
    const retorted = event.retort ? event.retortResult?.ok === true : null;

    for (const actor of targets) {
      let saved = retorted ?? false;
      let total = event.retort ? (event.retortResult?.total ?? null) : null;
      if (event.save && !saved) {
        const outcome = rolling ? await rollSave(actor, event.save) : { saved: false, total: null };
        saved = outcome.saved;
        total = outcome.total;
      }

      const entry = get(actor);
      // A successful save cancels this event for this traveller entirely - both
      // the damage and the exhaustion. Half damage would be the usual 5e answer,
      // but these are days rather than fireballs: the save is "did it get you".
      if (!saved) {
        if (damage) entry.damage += damage;
        if (event.exhaustion) entry.exhaustion += event.exhaustion;
        /**
         * A CAMP EVENT THAT LANDS COSTS THE NIGHT'S BREATHER.
         *
         * The quartermaster's description has always promised "a night that
         * does not count as a rest"; nothing made it true. This does. It
         * matters most at exactly the tables that need this module's exhaustion
         * maths - the ones whose house rules bar long rests in the wild, where
         * the short rest is the only healing there is.
         *
         * Saving means it did not get you, so it does not cost you the night
         * either.
         */
        if (event.category === EVENT_CATEGORY.CAMP) entry.restless = true;
      }
      if (event.heals) entry.heals += event.heals;
      entry.from.push({
        event: event.id,
        category: event.category,
        saved: (event.save || event.retort) ? saved : null,
        // Whose roll it was, when it was not this traveller's own.
        retortBy: event.retort ? (event.retortResult?.by ?? null) : null,
        // The number, kept because the card that would have shown it is
        // deliberately not created (see rollSave). The report prints it.
        total,
        dc: event.save?.dc ?? event.retort?.dc ?? null,
        ability: event.save?.ability ?? null
      });
    }
  }

  /**
   * EVERY TRAVELLER GETS A LINE, INCLUDING THE ONES NOTHING HAPPENED TO.
   *
   * This used to return only the people the day had actually cost something,
   * which reads as an oversight rather than as good news: a character simply
   * missing from the list looks forgotten, not spared. It also made the
   * report's own "saved against everything" state unreachable, because an
   * entry that saved against everything has nothing to add and was filtered
   * out before anybody could say so.
   *
   * Nothing downstream is confused by a zero entry: applying a report skips
   * writes of 0, and the day's totals sum the same.
   */
  for (const actor of actors) get(actor);
  return [...perActor.values()];
}

/**
 * One saving throw, through the system so every bonus and effect applies.
 *
 * NO DIALOG and NO CHAT CARD.
 *
 * The dialog is obvious: this fires once per traveller per event, and a stack
 * of prompts mid-resolution is not a decision anybody wants to make.
 *
 * The chat card is the important one. Resolving a bad day can call this a dozen
 * times, and every card is a 3D dice animation for anyone running Dice So Nice
 * - which turns one click into a minute of watching dice land. `create: false`
 * makes dnd5e evaluate the roll and hand it back WITHOUT creating the message,
 * so nothing downstream ever sees it. The numbers are not lost: each total goes
 * into the report, which is where the GM reads the day anyway.
 */
/**
 * A retort: one character answering back, rolled through the system.
 *
 * A skill check rather than a save, because it is a thing somebody DOES.
 * Silent for the same reason the saves are (see rollSave): a dozen 3D dice per
 * day is a wait, not information - the number is printed in the report.
 *
 * A misconfigured skill falls back to a plain Charisma check rather than
 * failing the day: the retort still happens, just without the proficiency.
 */
async function rollRetort(actor, { skill, ability = "cha", dc }) {
  const key = resolveSkill(skill);
  try {
    const rolls = key
      ? await actor.rollSkill({ skill: key, target: dc }, { configure: false }, { create: false })
      : await actor.rollAbilityCheck({ ability, target: dc }, { configure: false }, { create: false });
    const roll = rolls?.[0];
    if (!roll) return { ok: false, total: null, dc, by: actor.name };
    return { ok: roll.total >= dc, total: roll.total, dc, by: actor.name, skill: key ?? null };
  } catch (error) {
    console.warn(`${MODULE_ID} | retort failed for ${actor.name}`, error);
    return { ok: false, total: null, dc, by: actor.name };
  }
}

async function rollSave(actor, { ability, dc }) {
  try {
    const rolls = await actor.rollSavingThrow(
      { ability, target: dc },
      { configure: false },
      { create: false }
    );
    const roll = rolls?.[0];
    if (!roll) return { saved: false, total: null };
    return { saved: roll.total >= dc, total: roll.total };
  } catch (error) {
    console.warn(`${MODULE_ID} | saving throw failed for ${actor.name}`, error);
    return { saved: false, total: null };
  }
}
