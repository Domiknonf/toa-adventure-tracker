import {
  MODULE_ID, ROLE, EXHAUSTION_LIMITS, EVENT_CATEGORY, BOON_CHANCE,
  ENCOUNTER_DEFAULTS, EVENT_CHANCE, MARGIN_FOR_EXTRA_HEX, MARGIN_FOR_BONUS_HEX,
  MEDIC_RELIEF, TRAVEL_MODES, DEFAULT_MODE
} from "./const.mjs";
import { setting, paceTable } from "./settings.mjs";
import { getState, isWriter, setReport } from "./state.mjs";
import {
  partyActors, roleStatus, roleFailed, roleCritical, worstExhaustion
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

  /* --- The medic ------------------------------------------------ */

  /**
   * The one role that takes exhaustion back OFF.
   *
   * It promised exactly this in its description and did nothing whatsoever -
   * the engine never so much as looked at it. Found while writing the role
   * overview, which is a fair argument for having written one.
   *
   * Relief goes to the WORST-off traveller: a level off the person closest to
   * dropping is worth more than a level off somebody already at zero, and it is
   * what a medic would actually do.
   */
  const relief = [];
  if (roles[ROLE.MEDIC].status === "success") {
    const worst = actors
      .filter(a => (Number(a.system?.attributes?.exhaustion) || 0) > 0)
      .sort((a, b) => (b.system.attributes.exhaustion - a.system.attributes.exhaustion))[0];
    if (worst) relief.push({ actorId: worst.id, actorName: worst.name, heals: MEDIC_RELIEF });
  }

  /* --- The jungle's good mood ---------------------------------- */

  // Only on a day where nothing went wrong at all - which is what makes a boon
  // worth having rather than a consolation prize.
  const flawless = !events.length && Object.values(ROLE)
    .every(id => !roleFailed(roles[id]) || roles[id].role?.unfilled === "none");
  if (flawless && Math.random() * 100 < BOON_CHANCE) draw(EVENT_CATEGORY.BOON);

  /* --- Distance ------------------------------------------------ */

  const movement = resolveMovement({ state, roles, pace, events, rescued, actors, mode });

  /* --- What it costs the travellers ---------------------------- */

  const consequences = await resolveConsequences(events, actors);

  // The medic's relief rides on the same list the Apply button reads, so it is
  // written to the sheet through exactly one path.
  for (const entry of relief) {
    const existing = consequences.find(c => c.actorId === entry.actorId);
    if (existing) existing.heals += entry.heals;
    else consequences.push({ ...entry, damage: 0, exhaustion: 0, from: [{ event: "medic", saved: null }] });
  }

  const report = {
    day: state.day,
    pace: state.pace,
    mode,
    weather: { key: weather.key, rain: weather.rain, roll: weather.roll },
    hexes: movement.hexes,
    reasons: movement.reasons,
    encounter,
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

  if (navFailed && !rescued) {
    // Lost is lost, in any mode. A ship off its bearing is arguably worse than
    // a party going in circles, but zero is as low as a day goes.
    hexes = 0;
    reasons.push({ key: "lost", delta: -target });
  } else if (navFailed && rescued) {
    // The cartographer got them back on the chart: they move, but the day is
    // mostly gone. Half the pace's ceiling, and never less than one - having a
    // map should not be worse than not travelling at all.
    const salvaged = Math.max(1, Math.floor(target / 2));
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
        actorId: actor.id, actorName: actor.name, damage: 0, exhaustion: 0, heals: 0, from: []
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
        damage = roll.total;
      } catch (error) {
        // A bad formula must not take the whole day's report down with it.
        console.warn(`${MODULE_ID} | damage formula failed for event "${event.id}"`, error);
      }
    }

    for (const actor of targets) {
      let saved = false;
      let total = null;
      if (event.save) {
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
      }
      if (event.heals) entry.heals += event.heals;
      entry.from.push({
        event: event.id,
        saved: event.save ? saved : null,
        // The number, kept because the card that would have shown it is
        // deliberately not created (see rollSave). The report prints it.
        total,
        dc: event.save?.dc ?? null,
        ability: event.save?.ability ?? null
      });
    }
  }

  return [...perActor.values()].filter(e => e.damage || e.exhaustion || e.heals);
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
