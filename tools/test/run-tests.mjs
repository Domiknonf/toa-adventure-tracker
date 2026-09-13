import path from "node:path";
import {
  makeActor, setupGame, settingValues, compileTemplate, dice, saveResult, queue,
  notes, emitted, journals, chatMessages
} from "./foundry-shim.mjs";

const R = path.resolve(import.meta.dirname, "../../scripts");

let failed = 0, passed = 0;
const check = (cond, msg) => { if (cond) passed++; else { failed++; console.log("FAIL  " + msg); } };
const section = (s) => console.log(`\n--- ${s} ---`);

/* Party */
const gandalf = makeActor({ id: "aaa1", name: "Gandalf", skills: { sur: 9, prc: 7, ste: 1, med: 5, inv: 6, per: 4, dec: 2, prf: 1 }, abilities: { wis: 4, con: 2, cha: 1 } });
const bilbo   = makeActor({ id: "bbb2", name: "Bilbo",   skills: { sur: 2, prc: 3, ste: 8, med: 0, inv: 2, per: 3, dec: 5, prf: 2 }, abilities: { wis: 1, con: 1, cha: 2 } });
const notMine = makeActor({ id: "ccc3", name: "Fremder", skills: { sur: 0 }, abilities: { wis: 0 }, owner: false });
/* A party member somebody ELSE plays: in the travelling list, but not this
   user's to press buttons for. Nothing else in the fixture models that. */
const theirs  = makeActor({ id: "ddd4", name: "Maleth", skills: { sur: 3, prc: 4, ste: 2, med: 3, inv: 1, per: 2, dec: 1, prf: 3 }, abilities: { wis: 2, con: 1, cha: 0 }, mine: false });
setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });

const settings = await import(`${R}/settings.mjs`);
settings.registerSettings();

const state   = await import(`${R}/state.mjs`);
const roles   = await import(`${R}/roles.mjs`);
const moon    = await import(`${R}/moon.mjs`);
const events  = await import(`${R}/events.mjs`);
const enc     = await import(`${R}/encounters.mjs`);
const weather = await import(`${R}/weather.mjs`);
const resolve = await import(`${R}/resolve.mjs`);
const conseq  = await import(`${R}/consequences.mjs`);
const app     = await import(`${R}/app.mjs`);

/** Reset to a clean, deterministic day. */
async function freshDay({ pace = "normal", nav = null, assignments = {}, mode = "foot" } = {}) {
  settingValues.state = {};
  await state.setDay(1);
  await state.setMode(mode);
  await state.setPace(pace);
  for (const [actorId, roleId] of Object.entries(assignments)) await state.assign(actorId, roleId);
  queue.d100.length = 0;
  if (nav !== null) dice.d20 = nav;
}

/** Roll one role for one actor and store it. */
async function doRoll(actor) {
  const s = state.getState();
  const role = roles.getRole(s.assignments[actor.id]);
  const record = await roles.rollRole(actor, role, {});
  if (record) await state.recordRoll(actor.id, record);
  return record;
}

/* ------------------------------------------------------------------ */
section("roles");
const list = roles.getRoles();
check(list.length === 6, `6 default roles (got ${list.length})`);
check(list[0].id === "navigator", "navigator is first");
check(roles.roleLabel(list[0]) === "Navigator", "label resolves from lang");
check(roles.roleHint(roles.getRole("vanguard")).length > 10, "vanguard has a description");
check(roles.resolveSkill("survival") === "sur", "skill resolves by fullKey");
check(roles.resolveSkill("Überleben") === "sur", "skill resolves by localized label");
check(roles.modifierFor(gandalf, roles.getRole("navigator")) === 9, "modifier read from the sheet");

check(roles.partyActors().length === 2, "player-owned characters only");
check(roles.worstExhaustion([gandalf, bilbo]) === 0, "nobody exhausted yet");

/* ------------------------------------------------------------------ */
section("weather is rolled, not set");
check(!("rain" in state.blankState()), "there is no manual rain flag in the state");
check(settingValues.rainChance === 55 && settingValues.stormChance === 10, "weather chances are settings");

queue.d100.push(5);   // <= stormChance
check((await weather.rollWeather()).key === "storm", "a 5 is a storm");
queue.d100.push(40);  // <= storm + rain
check((await weather.rollWeather()).key === "rain", "a 40 is rain");
queue.d100.push(99);
check(["humid", "clear"].includes((await weather.rollWeather()).key), "a 99 is dry");

queue.d100.push(40);
const wet = await weather.rollWeather();
check(wet.rain === true, "rain is flagged as wet");
queue.d100.push(5);
check((await weather.rollWeather()).blocks === true, "a storm costs the day");
queue.d100.push(99);
check((await weather.rollWeather()).rain === false, "a dry day is not");

/* ------------------------------------------------------------------ */
section("events compilation");
const all = events.byCategory("ambush");
check(all.length >= 8, `ambush table has depth (${all.length})`);
check(events.eventText(all[0]).length > 40, "events carry real prose, not a key");
const excluded = new Set(all.slice(0, all.length - 1).map(e => e.id));
check(events.pick("ambush", excluded).id === all[all.length - 1].id, "exclusion narrows the pool");
check(events.pick("ambush", new Set(all.map(e => e.id))) !== null, "a fully excluded category still returns something");
check(events.pick("nonexistent") === null, "an unknown category returns null");

/* ------------------------------------------------------------------ */
section("movement: 0, 1 or 2 hexes and nothing else");

// A modest success at normal pace is exactly one hex.
await freshDay({ pace: "normal", nav: 7, assignments: { [gandalf.id]: "navigator" } });
const modest = await doRoll(gandalf);
check(modest.success === true && modest.margin < 8, `a modest success: margin ${modest.margin}`);
queue.d100.push(99, 99);          // dry, no encounter
let report = await resolve.resolveDay();
check(report.hexes === 1, `normal pace + modest success = 1 hex (got ${report.hexes})`);
check(report.reasons.some(r => r.key === "navigated"), "the reason says the navigator held course");

/**
 * An EXCEPTIONAL bearing at normal pace makes one hex more.
 *
 * This is the only thing normal pace has that slow does not. Without it slow
 * would be strictly better on foot - same ground, better navigation, fewer
 * encounters - and an option nobody can ever have a reason to pick is not an
 * option. Slow must never reach this, which the next block asserts.
 */
await freshDay({ pace: "normal", nav: 20, assignments: { [gandalf.id]: "navigator" } });
const exceptional = await doRoll(gandalf);
check(exceptional.margin >= 8, `an exceptional bearing: margin ${exceptional.margin}`);
queue.d100.push(99, 99);
report = await resolve.resolveDay();
check(report.hexes === 2, `normal pace + exceptional = 2 hexes (got ${report.hexes})`);
check(report.reasons.some(r => r.key === "exceptional"), "and the report says why");

// Slow pace can NEVER reach it, however well the roll goes.
await freshDay({ pace: "slow", nav: 20, assignments: { [gandalf.id]: "navigator" } });
const slowRoll = await doRoll(gandalf);
check(slowRoll.margin >= 8, "the same exceptional bearing at slow pace");
queue.d100.push(99, 99);
report = await resolve.resolveDay();
check(report.hexes === 1, `slow pace stays at 1 even on a great roll (got ${report.hexes})`);
check(!report.reasons.some(r => r.key === "exceptional"), "no bonus hex for going carefully");

// Navigation fails, nobody keeps a map -> lost, no ground at all.
await freshDay({ pace: "normal", nav: 1, assignments: { [gandalf.id]: "navigator" } });
await doRoll(gandalf);
queue.d100.push(99, 99);
report = await resolve.resolveDay();
check(report.hexes === 0, `failed navigation = 0 hexes (got ${report.hexes})`);
check(report.events.some(e => e.category === "lost"), "a 'lost' event explains it");
check(report.reasons.some(r => r.key === "lost"), "the reason list names it");

// Fast pace with a clear margin -> two hexes.
await freshDay({ pace: "fast", nav: 20, assignments: { [gandalf.id]: "navigator" } });
await doRoll(gandalf);
queue.d100.push(99, 99);
report = await resolve.resolveDay();
check(report.hexes === 2, `fast + big margin = 2 hexes (got ${report.hexes})`);
check(report.reasons.some(r => r.key === "fastPace"), "the second hex is explained");

// Fast pace scraping the DC -> still one. The margin rule is what gives pace risk.
await freshDay({ pace: "fast", nav: 7, assignments: { [gandalf.id]: "navigator" } });
const scrape = await doRoll(gandalf);
check(scrape.success === true && scrape.margin < 5, `a scrape: total ${scrape.total}, margin ${scrape.margin}`);
queue.d100.push(99, 99);
report = await resolve.resolveDay();
check(report.hexes === 1, `fast without margin = 1 hex (got ${report.hexes})`);

// Slow pace can never reach two, however well it goes.
await freshDay({ pace: "slow", nav: 20, assignments: { [gandalf.id]: "navigator" } });
await doRoll(gandalf);
queue.d100.push(99, 99);
report = await resolve.resolveDay();
check(report.hexes === 1, `slow pace caps at 1 (got ${report.hexes})`);

// Never outside 0..2, whatever happens.
for (const pace of ["slow", "normal", "fast"]) {
  for (const face of [1, 10, 20]) {
    await freshDay({ pace, nav: face, assignments: { [gandalf.id]: "navigator", [bilbo.id]: "vanguard" } });
    await doRoll(gandalf); await doRoll(bilbo);
    queue.d100.push(5, 1);     // storm AND an encounter: the worst day available
    const r = await resolve.resolveDay();
    check(r.hexes >= 0 && r.hexes <= 2 && Number.isInteger(r.hexes),
      `hexes stay 0..2 (${pace}/${face} gave ${r.hexes})`);
  }
}

/* ------------------------------------------------------------------ */
section("a fast pace is paid for in perception, not navigation");

/**
 * The fix for a real design fault. Charging fast pace on the NAVIGATION roll
 * made hurrying slower than walking, because a failed navigation costs the
 * whole day. 5e charges it on perception and stealth instead - so the vanguard
 * and the rearguard carry it, and the day still covers more ground.
 */
const navRole = roles.getRole("navigator");
const vanRole = roles.getRole("vanguard");
const rearRole = roles.getRole("rearguard");

await state.setPace("fast");
check(roles.paceModifierFor(navRole) === 0, "a fast pace does NOT penalise navigation");
check(roles.paceModifierFor(vanRole) === -5, "it penalises the vanguard");
check(roles.paceModifierFor(rearRole) === -5, "and the rearguard");

await state.setPace("slow");
check(roles.paceModifierFor(rearRole) === 5, "a slow pace helps the rearguard hide");
check(roles.paceModifierFor(vanRole) === 0, "and leaves the vanguard alone");

await state.setPace("normal");
check(roles.paceModifierFor(navRole) === 0, "normal pace is neutral throughout");
check(roles.paceModifierFor(vanRole) === 0, "...for the vanguard");
check(roles.paceModifierFor(rearRole) === 0, "...and the rearguard");

// The modifier has to actually reach the roll, as a named term.
await freshDay({ pace: "fast", nav: 12, assignments: { [bilbo.id]: "vanguard" } });
bilbo.calls.length = 0;
await doRoll(bilbo);
const vanCall = bilbo.calls[0];
check(vanCall.config.rolls?.[0]?.parts?.[0] === "@pace", "the pace reaches the vanguard roll");
check(vanCall.config.rolls[0].data.pace === -5, "as -5");

// And a fast pace must still be the FASTEST. Same roll, three paces.
// Survival +9 against DC 15, so a d20 of 12 is a margin of 6: past the fast
// threshold of 3, short of the normal-pace bonus at 8. That band is precisely
// what separates the three paces on one and the same roll.
for (const [pace, expected] of [["slow", 1], ["normal", 1], ["fast", 2]]) {
  await freshDay({ pace, nav: 12, assignments: { [gandalf.id]: "navigator" } });
  const rec = await doRoll(gandalf);
  check(rec.success === true, `${pace}: the same roll succeeds`);
  queue.d100.push(99, 100);
  const r = await resolve.resolveDay();
  const blocked = r.events.filter(e => e.blocks).length;
  check(r.hexes === Math.max(0, expected - blocked),
    `${pace} on the same roll gives ${expected} less ${blocked} blocked (got ${r.hexes})`);
}

/* ------------------------------------------------------------------ */
section("the medic actually does something");

/**
 * The medic was inert for several versions: its own description promised it was
 * the only role that takes exhaustion back off, and the resolver had never
 * heard of it. This asserts the promise, not just the wiring.
 */
gandalf.system.attributes.exhaustion = 2;
bilbo.system.attributes.exhaustion = 1;
await freshDay({ pace: "normal", assignments: { [gandalf.id]: "navigator", [bilbo.id]: "medic" } });
dice.d20 = 20; await doRoll(gandalf); await doRoll(bilbo);
queue.d100.push(99, 100);
let medReport = await resolve.resolveDay();
const relief = medReport.consequences.find(c => c.heals > 0);
check(!!relief, "a successful medic produces relief");
check(relief.actorId === gandalf.id, "given to the WORST-off traveller, not just anyone");

// And it reaches the sheet through the same Apply path as the damage.
// The net change is what the report says, not a flat -1: the same day can also
// hand out exhaustion (an unfilled quartermaster can draw a camp event), and
// asserting -1 made this fail about four runs in ten.
const exhBefore = gandalf.system.attributes.exhaustion;
const medEntry = medReport.consequences.find(c => c.actorId === gandalf.id);
const exhExpected = Math.clamp(exhBefore + (medEntry.exhaustion ?? 0) - (medEntry.heals ?? 0), 0, 6);
await conseq.applyConsequences(medReport);
check(gandalf.system.attributes.exhaustion === exhExpected,
  `the net change reached the sheet: ${exhBefore} -> ${exhExpected} (got ${gandalf.system.attributes.exhaustion})`);
check(medEntry.heals >= 1, "and the relief itself is in the report");

// A failed medic does nothing.
gandalf.system.attributes.exhaustion = 2;
await freshDay({ pace: "normal", assignments: { [gandalf.id]: "navigator", [bilbo.id]: "medic" } });
dice.d20 = 20; await doRoll(gandalf);
dice.d20 = 1;  await doRoll(bilbo);
queue.d100.push(99, 100);
medReport = await resolve.resolveDay();
check(!medReport.consequences.some(c => c.heals > 0), "a failed medic heals nothing");

// Nobody exhausted: nothing to do, and no phantom entry either.
for (const a of [gandalf, bilbo]) a.system.attributes.exhaustion = 0;
await freshDay({ pace: "normal", assignments: { [gandalf.id]: "navigator", [bilbo.id]: "medic" } });
dice.d20 = 20; await doRoll(gandalf); await doRoll(bilbo);
queue.d100.push(99, 100);
medReport = await resolve.resolveDay();
check(!medReport.consequences.some(c => c.heals > 0), "a healthy party needs no medic");

/* ------------------------------------------------------------------ */
section("exhaustion is not a ratchet");

/**
 * Tables whose house rules bar long rests outside safe places - a common one in
 * Chult - have no way to shed exhaustion between travel days. Without a daily
 * lever the module simply grinds them down: measured over 200 simulated treks
 * before this, a competent party hit the travel cap in about three weeks and a
 * third of them died of it inside forty days, with nothing they could have done
 * differently. Two rules answer that, and both are asserted here.
 */

// RULE ONE: no level of exhaustion is unavoidable. Every event that hands one
// out must offer a way past it, or it is a cost with no play in it.
//
// TWO ways count, and the second was added later: an ordinary save, or a
// RETORT - one character answering back for the whole party, which cancels the
// event exactly as a passed save does. Widened deliberately rather than
// deleted; an event with neither is still the bug this check was written for.
const { EVENTS: ALL_EVENTS } = await import(`${R}/const.mjs`);
for (const event of ALL_EVENTS.filter(e => e.exhaustion)) {
  check(!!event.save || !!event.retort,
    `event "${event.id}" offers a save or a retort against its exhaustion`);
}

// RULE TWO: a camp well made takes a level back off.
gandalf.system.attributes.exhaustion = 3;
bilbo.system.attributes.exhaustion = 1;
await freshDay({ pace: "normal", assignments: { [gandalf.id]: "navigator", [bilbo.id]: "quartermaster" } });
dice.d20 = 20; await doRoll(gandalf); await doRoll(bilbo);
queue.d100.push(99, 100);
let campReport = await resolve.resolveDay();
const campRelief = campReport.consequences.find(c => c.heals > 0);
check(!!campRelief, "a successful quartermaster relieves somebody");
check(campRelief.actorId === gandalf.id, "the worst-off traveller, not just anyone");

// A FAILED quartermaster relieves nobody - and may cost a night instead.
gandalf.system.attributes.exhaustion = 3;
await freshDay({ pace: "normal", assignments: { [gandalf.id]: "navigator", [bilbo.id]: "quartermaster" } });
dice.d20 = 20; await doRoll(gandalf);
dice.d20 = 1;  await doRoll(bilbo);
queue.d100.push(99, 100);
campReport = await resolve.resolveDay();
check(!campReport.consequences.some(c => c.heals > 0), "a failed camp relieves nobody");

/**
 * Two carers help TWO people. Doubling up on one traveller while another stays
 * at three would be both less useful and less plausible.
 */
gandalf.system.attributes.exhaustion = 3;
bilbo.system.attributes.exhaustion = 2;
await freshDay({ pace: "normal", assignments: { [gandalf.id]: "medic", [bilbo.id]: "quartermaster" } });
dice.d20 = 20; await doRoll(gandalf); await doRoll(bilbo);
queue.d100.push(99, 100);
const bothReport = await resolve.resolveDay();
const relieved = bothReport.consequences.filter(c => c.heals > 0);
check(relieved.length === 2, `both carers found somebody (${relieved.length})`);
check(new Set(relieved.map(c => c.actorId)).size === 2, "and they are different travellers");

// Nobody exhausted: no phantom relief entries.
for (const a of [gandalf, bilbo]) a.system.attributes.exhaustion = 0;
await freshDay({ pace: "normal", assignments: { [gandalf.id]: "medic", [bilbo.id]: "quartermaster" } });
dice.d20 = 20; await doRoll(gandalf); await doRoll(bilbo);
queue.d100.push(99, 100);
const healthy = await resolve.resolveDay();
check(!healthy.consequences.some(c => c.heals > 0), "a rested party needs no carers");

/* ------------------------------------------------------------------ */
section("the cartographer turns a lost day into a wasted one");
await freshDay({ pace: "normal", nav: 1, assignments: { [gandalf.id]: "cartographer", [bilbo.id]: "navigator" } });
dice.d20 = 20; await doRoll(gandalf);     // cartographer succeeds
dice.d20 = 1;  await doRoll(bilbo);       // navigator fails
queue.d100.push(99, 99);
report = await resolve.resolveDay();
check(report.hexes === 1, `rescued by the map = 1 hex (got ${report.hexes})`);
check(report.events.some(e => e.category === "detour"), "a detour event, not a lost one");
check(!report.events.some(e => e.category === "lost"), "...and no lost event");

/* ------------------------------------------------------------------ */
section("the vanguard decides ambush vs sighting");

// Vanguard fails -> ambush, and it costs hit points.
await freshDay({ pace: "normal", nav: 18, assignments: { [gandalf.id]: "navigator", [bilbo.id]: "vanguard" } });
dice.d20 = 18; await doRoll(gandalf);
dice.d20 = 1;  await doRoll(bilbo);
saveResult.value = false;
queue.d100.push(99, 1);      // dry, encounter happens
report = await resolve.resolveDay();
check(report.encounter?.happened === true, "an encounter happened");
check(report.encounter.surprised === true, "a failed vanguard means surprised");
check(report.events.some(e => e.category === "ambush"), "the event comes from the ambush table");
check(report.consequences.length > 0, "somebody got hurt");

// Vanguard succeeds -> the same jungle, seen in time.
await freshDay({ pace: "normal", nav: 18, assignments: { [gandalf.id]: "navigator", [bilbo.id]: "vanguard" } });
dice.d20 = 20; await doRoll(gandalf); await doRoll(bilbo);
queue.d100.push(99, 1);
report = await resolve.resolveDay();
check(report.encounter.surprised === false, "a good vanguard is not surprised");
check(report.events.some(e => e.category === "encounter"), "the event comes from the sighting table");
const sighting = report.events.find(e => e.category === "encounter");
check(!sighting.damage, "a sighting costs no hit points - that is what the vanguard buys");
const ambushToday = report.events.find(e => e.category === "ambush");
check(!ambushToday, "and no ambush event fires alongside it");

/* ------------------------------------------------------------------ */
section("an unfilled role is worse than a filled one");
// Nobody on the rearguard pushes the encounter chance up more than failing it.
await freshDay({ pace: "normal", assignments: { [gandalf.id]: "navigator", [bilbo.id]: "rearguard" } });
dice.d20 = 20; await doRoll(gandalf);
dice.d20 = 1;  await doRoll(bilbo);       // rearguard present but failing
queue.d100.push(99, 100);
const failedRear = await resolve.resolveDay();

await freshDay({ pace: "normal", assignments: { [gandalf.id]: "navigator" } });
dice.d20 = 20; await doRoll(gandalf);
queue.d100.push(99, 100);
const noRear = await resolve.resolveDay();
check(noRear.encounter.chance > failedRear.encounter.chance,
  `no rearguard (${noRear.encounter.chance}%) is worse than a failed one (${failedRear.encounter.chance}%)`);
check(failedRear.encounter.chance > settingValues.encounterChance,
  "and a failed rearguard is worse than a good one");

// An unfilled navigator loses the day just like a failed one.
await freshDay({ pace: "normal", assignments: { [bilbo.id]: "vanguard" } });
dice.d20 = 20; await doRoll(bilbo);
queue.d100.push(99, 99);
report = await resolve.resolveDay();
check(report.hexes === 0, "nobody navigating means nobody moves");

/* ------------------------------------------------------------------ */
section("exhaustion caps the day's travel");
gandalf.system.attributes.exhaustion = 3;
await freshDay({ pace: "fast", nav: 20, assignments: { [gandalf.id]: "navigator" } });
await doRoll(gandalf);
queue.d100.push(99, 99);
report = await resolve.resolveDay();
check(report.hexes === 1, `exhaustion 3 caps a perfect fast day at 1 (got ${report.hexes})`);
check(report.reasons.some(r => r.key === "exhausted"), "and says so");

gandalf.system.attributes.exhaustion = 5;
await freshDay({ pace: "fast", nav: 20, assignments: { [gandalf.id]: "navigator" } });
await doRoll(gandalf);
queue.d100.push(99, 99);
report = await resolve.resolveDay();
check(report.hexes === 0, `exhaustion 5 stops the party (got ${report.hexes})`);
gandalf.system.attributes.exhaustion = 0;

/* ------------------------------------------------------------------ */
section("consequences reach the sheets");
gandalf.damageTaken.length = 0;
bilbo.damageTaken.length = 0;
await freshDay({ pace: "normal", assignments: { [gandalf.id]: "navigator", [bilbo.id]: "vanguard" } });
dice.d20 = 18; await doRoll(gandalf);
dice.d20 = 1;  await doRoll(bilbo);
saveResult.value = false;
queue.d100.push(99, 1);       // ambush
report = await resolve.resolveDay();
/* NOT `consequences.length > 0` - that went vacuous the day every traveller
   started getting a line. What has to be true is that the ambush COST somebody
   something, which is the thing the sheets are then checked against. */
const billed = report.consequences.filter(c => c.damage || c.exhaustion);
check(billed.length > 0, `the ambush cost somebody something (${billed.length} travellers)`);
check(report.consequences.some(c => c.damage > 0), "and some of it was hit points");

const hpBefore = Object.fromEntries(report.consequences.map(c => [c.actorId,
  game.actors.get(c.actorId).system.attributes.hp.value]));
const applied = await conseq.applyConsequences(report);
check(applied.applied === true, "consequences are applied by default");

/* Unconditional, for everybody the day billeded. The old version guarded each
   assertion behind "if this traveller took damage", so a day that happened to
   billed nobody skipped the whole check and still reported success. */
for (const c of billed) {
  const actor = game.actors.get(c.actorId);
  if (c.damage) {
    check(actor.damageTaken.includes(c.damage),
      `${c.actorName}: damage went through actor.applyDamage()`);
    check(actor.system.attributes.hp.value === hpBefore[c.actorId] - c.damage,
      `${c.actorName}: hit points actually dropped`);
  }
  if (c.exhaustion) {
    check(actor.system.attributes.exhaustion >= c.exhaustion - (c.heals ?? 0),
      `${c.actorName}: exhaustion was written to the sheet`);
  }
}

/* --- AND THE OTHER SIDE: A SAVE CANCELS THE EVENT OUTRIGHT ---------- */
/* Not half damage - these are days rather than fireballs, so the save asks
   "did it get you". Which means a day CAN legitimately cost nothing at all,
   and the report has to say so as "warded off" rather than "no effect", or the
   table is left wondering why the leopard was free. */
for (const a of [gandalf, bilbo, notMine]) {
  a.system.attributes.exhaustion = 0;
  a.system.attributes.hp.value = a.system.attributes.hp.max;
  a.damageTaken.length = 0;
}
/* Pinned rather than hoped for: only SOME ambushes offer a save, and a day that
   happens to draw one that does not proves nothing. `pick` indexes its pool with
   Math.random, so this picks a saving ambush on purpose - and the same value
   sits above the pursuit (45) and camp (35) gates, so nothing else joins in. */
const evmod0 = await import(`${R}/events.mjs`);
const ambushes = evmod0.byCategory("ambush", "foot");
const savingIdx = ambushes
  .map((e, i) => [e, i])
  .filter(([e, i]) => e.save && ((i + 0.5) / ambushes.length) * 100 > 45)
  .pop();
check(!!savingIdx, "there is an ambush with a save that can be pinned cleanly");
const realRandom0 = Math.random;
Math.random = () => (savingIdx[1] + 0.5) / ambushes.length;

await freshDay({ pace: "normal", assignments: { [gandalf.id]: "navigator", [bilbo.id]: "vanguard" } });
dice.d20 = 18; await doRoll(gandalf);
dice.d20 = 1;  await doRoll(bilbo);
saveResult.value = true;                    // everybody makes it
queue.d100.length = 0;
queue.d100.push(99, 1);                     // and something jumps them anyway
const wardedReport = await resolve.resolveDay();
check(wardedReport.events.some(e => e.id === savingIdx[0].id),
  `the pinned ambush is the one that came (${savingIdx[0].id})`);
check(wardedReport.consequences.every(c => !c.damage && !c.exhaustion),
  "a passed save cancels the event outright, damage and exhaustion together");
await conseq.applyConsequences(wardedReport);
check(gandalf.damageTaken.length === 0 && bilbo.damageTaken.length === 0,
  "so nothing reaches any sheet");

const wardedCtx = await new app.AdventureTracker()._prepareContext({});
const wardedRows = wardedCtx.report.consequences.filter(c => c.warded);
check(wardedRows.length > 0, `whoever rolled it is marked as having warded it off (${wardedRows.length})`);
check(wardedRows.every(c => !c.untouched),
  "and NOT as untouched - those are different days and must not read alike");
check(wardedCtx.report.consequences.filter(c => c.untouched).every(c => !c.from.length),
  "untouched is reserved for the travellers nothing came near");
const wardedHtml = compileTemplate()(wardedCtx);
check(wardedHtml.includes(game.i18n.localize("toa-adventure-tracker.app.warded")),
  "the report says it out loud");
Math.random = realRandom0;
saveResult.value = false;
// Reset EVERY traveller, not just the one found above. A day can exhaust
// several, and leaving one at 3 silently caps the travel of every later test -
// which is exactly how this leaked into the travel-mode section and made it
// fail roughly one run in three.
for (const a of [gandalf, bilbo, notMine]) {
  a.system.attributes.exhaustion = 0;
  a.system.attributes.hp.value = a.system.attributes.hp.max;
}

// With the setting off, nothing is written but the report still says what would happen.
settingValues.applyConsequences = false;
gandalf.damageTaken.length = 0;
const dry2 = await conseq.applyConsequences(report);
check(dry2.applied === false, "applyConsequences reports that it did nothing");
check(gandalf.damageTaken.length === 0, "and wrote nothing to the sheet");
settingValues.applyConsequences = true;

// Exhaustion is clamped to the system's own ceiling.
await conseq.adjustExhaustion(bilbo, 99);
check(bilbo.system.attributes.exhaustion === 6, "exhaustion clamps at the system ceiling");
await conseq.adjustExhaustion(bilbo, -99);
check(bilbo.system.attributes.exhaustion === 0, "and does not go below zero");

/* ------------------------------------------------------------------ */
section("resolving again is safe, completing is not");
await freshDay({ pace: "normal", assignments: { [gandalf.id]: "navigator" } });
dice.d20 = 20; await doRoll(gandalf);
queue.d100.push(99, 99);
await resolve.resolveDay();
const firstReport = state.getState().report;
check(!!firstReport, "the report is stored on the state");
gandalf.damageTaken.length = 0;
queue.d100.push(5, 1);
await resolve.resolveDay();
check(state.getState().report.weather.key === "storm", "resolving again rolls a different day");
check(gandalf.damageTaken.length === 0, "and still writes nothing to any sheet");

// A new roll invalidates a stale report.
await state.recordRoll(gandalf.id, { roleId: "navigator", total: 5, dc: 15, success: false, margin: -10 });
check(state.getState().report === null, "a fresh roll clears the stale report");

// Moving the day does too.
queue.d100.push(99, 99);
await resolve.resolveDay();
await state.adjustDay(1);
check(state.getState().report === null, "moving the day clears the report");

/* ------------------------------------------------------------------ */
section("completing the day logs and advances");
await freshDay({ pace: "normal", assignments: { [gandalf.id]: "navigator" } });
dice.d20 = 20; await doRoll(gandalf);
queue.d100.push(99, 99);
report = await resolve.resolveDay();
const dayBefore = state.getState().day;
chatMessages.length = 0;
await conseq.postDayToChat(report, { weather: "Klar", events: [] });
check(chatMessages.length === 1, "the day is posted to chat");
check(!chatMessages[0].content.includes("undefined"), "the chat card has no undefined");
await state.completeDay();
const after = state.getState();
check(after.day === dayBefore + 1, "the day advanced");
check(after.log.length === 1, "one log entry");
check(after.log[0].hexes === report.hexes, "the entry records the hexes");
check(after.report === null, "the report is cleared");
check(Object.keys(after.rolls).length === 0, "rolls are cleared");
check(after.assignments[gandalf.id] === "navigator", "role assignments survive the day");

/* ------------------------------------------------------------------ */
section("migration from the miles-era state");
settingValues.state = {
  schema: 1, day: 14, pace: "normal", rain: true,
  assignments: { [gandalf.id]: "navigation" },
  rolls: { [gandalf.id]: { taskId: "navigation", total: 9 } },
  log: [{ day: 13, pace: "slow", miles: 9, lost: false }]
};
const migrated = state.getState();
check(migrated.schema === 3, "schema is raised");
check(migrated.day === 14, "the day counter survives");
check(migrated.log.length === 1, "the logbook survives");
check(migrated.log[0].miles === 9, "old entries keep their miles rather than being faked into hexes");
check(Object.keys(migrated.assignments).length === 0, "task assignments are dropped");
check(migrated.report === null, "the report field is present and empty");
check(migrated.ready && Object.keys(migrated.ready).length === 0, "and the ready record too");

/* Schema 2 -> 3 renamed `rested` to `ready`. A party halfway through a night
   when the module updates should not have to check in twice. */
settingValues.state = {
  schema: 2, day: 9, pace: "normal", mode: "foot",
  assignments: {}, rolls: {}, report: null, log: [],
  rested: { [gandalf.id]: true }
};
const fromTwo = state.getState();
check(fromTwo.schema === 3, "schema 2 is raised to 3");
check(fromTwo.ready?.[gandalf.id] === true, "who had rested is now who is ready");
check(fromTwo.rested === undefined, "and the old field is gone rather than lingering");
check(fromTwo.day === 9, "the day counter survives that too");

/* ------------------------------------------------------------------ */
section("permissions");
setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });
check(roles.canControl(notMine) === true, "the GM controls everything");
setupGame({ actors: [gandalf, bilbo, notMine], isGM: false });
// By default this is a GM's tool: a player controls nothing, not even their
// own character. The playerRolls switch is what hands that back (tested below).
check(roles.canControl(gandalf) === false, "by default a player controls nothing");
settingValues.playerRolls = true;
check(roles.canControl(gandalf) === true, "with the switch on, their own character");
check(roles.canControl(notMine) === false, "but never somebody else's");
settingValues.playerRolls = false;
check(state.isWriter() === false, "a player is not the writer");
const before = JSON.stringify(state.getState());
await state.setDay(999);
check(JSON.stringify(state.getState()) === before, "a player's direct write is refused");
check(await resolve.resolveDay() === null, "and a player cannot resolve the day");

const socket = await import(`${R}/socket.mjs`);
const socketHandler = socket.handleRequest;
setupGame({ actors: [gandalf, bilbo, notMine], isGM: false, gmOnline: false });
notes.length = 0; emitted.length = 0;
check(socket.requestAssign(gandalf.id, "navigator") === false, "with no GM online the request is refused");
check(emitted.length === 0, "and nothing is emitted");
setupGame({ actors: [gandalf, bilbo, notMine], isGM: false, gmOnline: true });
emitted.length = 0;
socket.requestAssign(gandalf.id, "navigator");
check(emitted.length === 1 && emitted[0][1].action === "assign", "a player's assignment goes over the socket");
check(emitted[0][1].data.roleId === "navigator", "carrying the role id");
setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });

/* ------------------------------------------------------------------ */
section("custom roles");
settingValues.customRoles = JSON.stringify([
  { id: "navigator", dc: 13 },
  { id: "cartographer", hidden: true },
  { id: "hunter", label: "Jäger", skill: "prc", dc: 14, yield: { formula: "1d6 + @mod", unit: "pounds" } }
]);
check(roles.getRole("navigator").dc === 13, "a matching id overrides the DC");
check(roles.getRole("navigator").skill === "sur", "and keeps the fields it does not mention");
check(roles.getRole("cartographer") === null, "hidden:true removes a default");
check(roles.getRole("hunter")?.dc === 14, "a new id is appended");
check(roles.roleLabel(roles.getRole("hunter")) === "Jäger", "an inline label is used verbatim");
notes.length = 0;
const realWarn = console.warn; console.warn = () => {};
settingValues.customRoles = "{ not json";
check(roles.getRoles().length === 6, "broken JSON falls back to the defaults");
check(notes.filter(n => n[0] === "warn").length === 1, "and warns exactly once");
roles.getRoles(); roles.getRoles();
check(notes.filter(n => n[0] === "warn").length === 1, "...not once per render");
console.warn = realWarn;
settingValues.customRoles = "";

/* ------------------------------------------------------------------ */
section("moon still works");
await state.setDay(1);
check(moon.moonFor(1).percent === 100, "day 1 is a full moon");
check(moon.moonFor(16).percent === 0, "day 16 is a new moon");
check(moon.moonFor(8).waxing === false, "day 8 is waning");

/* ------------------------------------------------------------------ */
section("template renders");
const template = compileTemplate();
settingValues.state = {};
await state.setDay(5);
await state.assign(gandalf.id, "navigator");
await state.assign(bilbo.id, "vanguard");
dice.d20 = 18; await doRoll(gandalf);
dice.d20 = 1;  await doRoll(bilbo);
queue.d100.push(99, 1);
await resolve.resolveDay();

const instance = new app.AdventureTracker();
let ctx = await instance._prepareContext({});
let html = template(ctx);
const visible = (h) => h.replace(/data-tooltip="[^"]*"/g, "").replace(/title="[^"]*"/g, "").replace(/<[^>]+>/g, " ");

check(html.includes("Gandalf") && html.includes("Bilbo"), "both travellers render");
check(html.includes("toa-hexbox"), "the hex result renders");
check(html.includes("toa-event"), "the day's events render");
check(html.includes("toa-reasons"), "the reasons render");
check(!/\{\{|\}\}/.test(html), "no unrendered handlebars");
check(!/undefined|\[object Object\]/.test(html), "no undefined / [object Object]");
check(!/toa-adventure-tracker\.[a-z]/i.test(visible(html)), "no raw i18n key in visible text");
check(html.includes("data-action=\"completeDay\""), "the GM sees the complete button");
check(ctx.report.events.every(e => e.text && e.text.length > 20), "every rendered event has real prose");
check(ctx.report.events.every(e => e.title && !e.title.includes("adventure-tracker")), "and a real name");

// Unfilled roles are surfaced before the day, not discovered after it.
check(ctx.unfilled.length > 0, "unfilled roles are listed");
check(ctx.unfilled.some(u => u.critical),
  `critical unfilled roles are marked (got ${JSON.stringify(ctx.unfilled.map(u => [u.id, u.critical]))})`);

// Player view.
setupGame({ actors: [gandalf, bilbo, notMine], isGM: false });
const playerHtml = template(await instance._prepareContext({}));
check(!playerHtml.includes("data-action=\"completeDay\""), "a player sees no complete button");
check(!playerHtml.includes("data-action=\"resolveDay\""), "and cannot resolve the day");
// By default the tool is the GM's: the player window is a shop window.
check(!playerHtml.includes("toa-hexbox"), "and not the day's result, which is the GM's to narrate");
check(!playerHtml.includes("toa-role-select"), "and no role picker - the tool is the GM's");
check(playerHtml.includes("toa-travel-line"), "they get the read-only travel line instead");
check(!/\{\{|\}\}/.test(playerHtml), "player view renders cleanly");
check(!/toa-adventure-tracker\.[a-z]/i.test(visible(playerHtml)), "player view leaks no key");
setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });

// Empty world.
setupGame({ actors: [notMine], isGM: true });
const emptyHtml = template(await instance._prepareContext({}));
check(emptyHtml.includes("Keine Reisenden"), "an empty party renders its notice");
check(!/\{\{|\}\}/.test(emptyHtml) && !/undefined/.test(emptyHtml), "empty view renders cleanly");
setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });

/* ------------------------------------------------------------------ */
section("every event renders without a hole");
// The compilation is the module's content: one entry with no prose, or an effect
// the window cannot label, prints a key into the day report in front of the table.
for (const event of (await import(`${R}/const.mjs`)).EVENTS) {
  const text = events.eventText(event);
  check(text.length > 20 && !text.includes("adventure-tracker"), `event "${event.id}" has prose`);
  for (const effect of events.effectSummary(event)) {
    check(!!effect.kind, `event "${event.id}" effect has a kind`);
  }
}

/* ------------------------------------------------------------------ */
section("travel modes");

const { TRAVEL_MODES, MODE_ORDER } = await import(`${R}/const.mjs`);
// Movement is capped by exhaustion, so start these from a rested party or the
// ceilings below measure the cap instead of the mode.
for (const a of [gandalf, bilbo, notMine]) a.system.attributes.exhaustion = 0;
check(MODE_ORDER.join(",") === "foot,mount,canoe,ship", "four modes in speed order");
check(state.blankState().mode === "foot", "a fresh state travels on foot");

// A ship outruns a canoe outruns a mule outruns a boot, at every pace.
for (const pace of ["slow", "normal", "fast"]) {
  const f = TRAVEL_MODES.foot.hexes[pace];
  const m = TRAVEL_MODES.mount.hexes[pace];
  const c = TRAVEL_MODES.canoe.hexes[pace];
  const sh = TRAVEL_MODES.ship.hexes[pace];
  check(sh >= c && c >= f && m >= f, `${pace}: ship ${sh} >= canoe ${c} >= foot ${f} (mount ${m})`);
}
// On foot the original rule still holds exactly: 0, 1 or 2 and nothing else.
check(TRAVEL_MODES.foot.hexes.slow === 1 && TRAVEL_MODES.foot.hexes.normal === 1
  && TRAVEL_MODES.foot.hexes.fast === 2, "on foot it is still 0/1/2 and nothing else");

/**
 * Each mode reaches its own ceiling on a good fast day, less whatever ate into
 * it. The blocking term is not slack in the test: with only a navigator
 * assigned, an unfilled quartermaster can still draw a camp event, and on a
 * mount that pool contains a lame animal - which costs a hex and SHOULD. So the
 * assertion is the rule itself (ceiling minus blockers) rather than a happy
 * path that quietly passes seven runs in eight.
 */
for (const mode of MODE_ORDER) {
  await freshDay({ mode, pace: "fast", nav: 20, assignments: { [gandalf.id]: "navigator" } });
  await doRoll(gandalf);
  queue.d100.push(99, 100);
  const r = await resolve.resolveDay();
  const blocked = r.events.filter(e => e.blocks).length;
  const expected = Math.max(0, TRAVEL_MODES[mode].hexes.fast - blocked);
  check(r.hexes === expected,
    `${mode} fast: ceiling ${TRAVEL_MODES[mode].hexes.fast} less ${blocked} blocked = ${expected} (got ${r.hexes})`);
  check(r.mode === mode, `${mode}: the report records the mode`);
}

// A lost day is zero in every mode - a ship off its bearing gets nowhere either.
for (const mode of MODE_ORDER) {
  await freshDay({ mode, pace: "normal", nav: 1, assignments: { [gandalf.id]: "navigator" } });
  await doRoll(gandalf);
  queue.d100.push(99, 100);
  const r = await resolve.resolveDay();
  check(r.hexes === 0, `${mode}: a failed navigation is still zero (got ${r.hexes})`);
}

// Hurrying without the margin falls back to the cruising ceiling, not to 1.
await freshDay({ mode: "ship", pace: "fast", nav: 7, assignments: { [gandalf.id]: "navigator" } });
const scrapeSea = await doRoll(gandalf);
check(scrapeSea.success && scrapeSea.margin < 3, "a scraped navigation at sea");
queue.d100.push(99, 100);
let sea = await resolve.resolveDay();
let seaBlocked = sea.events.filter(e => e.blocks).length;
check(sea.hexes === Math.max(0, TRAVEL_MODES.ship.hexes.normal - seaBlocked),
  `a scraped fast day at sea falls back to cruising (${TRAVEL_MODES.ship.hexes.normal} less ${seaBlocked}, got ${sea.hexes})`);
check(sea.reasons.some(r => r.key === "fastNoMargin"), "and says the margin was not there");

// The cartographer salvages half the pace's ceiling, never less than one.
await freshDay({ mode: "ship", pace: "normal", assignments: { [gandalf.id]: "cartographer", [bilbo.id]: "navigator" } });
dice.d20 = 20; await doRoll(gandalf);
dice.d20 = 1;  await doRoll(bilbo);
queue.d100.push(99, 100);
sea = await resolve.resolveDay();
seaBlocked = sea.events.filter(e => e.blocks).length;
const salvaged = Math.max(1, Math.floor(TRAVEL_MODES.ship.hexes.normal / 2));
check(sea.hexes === Math.max(0, salvaged - seaBlocked),
  `a rescued day at sea salvages half (${salvaged} less ${seaBlocked}, got ${sea.hexes})`);
check(salvaged < TRAVEL_MODES.ship.hexes.normal, "which is less than a full day's run");
check(sea.reasons.some(r => r.key === "rescued"), "and the report credits the chart");

/* --- the pools are actually separated ---------------------------- */
// Velociraptors must never appear at sea, and sahuagin never in the jungle.
const raptorEvent = events.byCategory("ambush", "foot").find(e => e.foe?.key === "velociraptor");
check(!!raptorEvent, "raptors are in the foot pool");
check(!events.byCategory("ambush", "ship").some(e => e.foe?.key === "velociraptor"),
  "raptors are NOT in the sea pool");
check(events.byCategory("ambush", "ship").some(e => e.foe?.key === "sahuagin"),
  "sahuagin are in the sea pool");
check(!events.byCategory("ambush", "foot").some(e => e.foe?.key === "sahuagin"),
  "sahuagin are NOT in the jungle pool");
check(events.byCategory("ambush", "canoe").some(e => e.foe?.key === "giantCrocodile"),
  "crocodiles are in the river pool");
check(events.byCategory("camp", "mount").some(e => e.id === "mountLame"),
  "mount troubles only reach mounted travel");
check(!events.byCategory("camp", "foot").some(e => e.id === "mountLame"),
  "...and not walkers");

// Thirst happens wherever you are.
for (const mode of MODE_ORDER) {
  check(events.byCategory("camp", mode).length > 0, `${mode} has a way for the night to go wrong`);
  check(events.byCategory("lost", mode).length > 0, `${mode} has a way to get lost`);
  check(events.byCategory("boon", mode).length > 0, `${mode} has at least one good day`);
}

// Over many resolved days, a ship must never draw a land event.
await freshDay({ mode: "ship", pace: "normal", assignments: { [gandalf.id]: "navigator", [bilbo.id]: "vanguard" } });
const landIds = new Set((await import(`${R}/const.mjs`)).EVENTS
  .filter(e => (e.terrain ?? "land") === "land").map(e => e.id));
let leaked = 0;
for (let i = 0; i < 60; i++) {
  await state.setDay(i + 1);
  await state.assign(gandalf.id, "navigator");
  await state.assign(bilbo.id, "vanguard");
  dice.d20 = 1 + Math.floor(Math.random() * 20); await doRoll(gandalf);
  dice.d20 = 1 + Math.floor(Math.random() * 20); await doRoll(bilbo);
  queue.d100.length = 0;
  const r = await resolve.resolveDay();
  for (const e of r.events) if (landIds.has(e.id)) leaked++;
}
check(leaked === 0, `no land event ever leaked into 60 days at sea (${leaked} leaks)`);

/* --- roles follow the mode --------------------------------------- */
check(roles.getRoles("foot").some(r => r.id === "rearguard"), "a walking party has a rearguard");
check(!roles.getRoles("ship").some(r => r.id === "rearguard"), "a ship has none - there are no tracks");
check(roles.getRoles("ship").some(r => r.id === "navigator"), "but it still has a navigator");

// A role the mode does not offer must not count as an unfilled failure.
await freshDay({ mode: "ship", pace: "normal", assignments: { [gandalf.id]: "navigator" } });
const rearAtSea = roles.roleStatus("rearguard", state.getState());
check(rearAtSea.status === "absent", "the rearguard is absent at sea, not unfilled");
check(roles.roleFailed(rearAtSea) === false, "and absence is not a failure");

// Switching mode drops anyone holding a role the new mode has no use for.
await freshDay({ mode: "foot", assignments: { [gandalf.id]: "rearguard", [bilbo.id]: "navigator" } });
check(state.getState().assignments[gandalf.id] === "rearguard", "walking rearguard assigned");
await state.setMode("ship");
check(state.getState().assignments[gandalf.id] === undefined, "boarding a ship drops the rearguard");
check(state.getState().assignments[bilbo.id] === "navigator", "but keeps the navigator");
check(state.getState().report === null && Object.keys(state.getState().rolls).length === 0,
  "and clears the day, which was worked out for a different mode");

/* ------------------------------------------------------------------ */
section("encounter sizing");

// The DMG budget table, checked at a level somebody actually plays at.
const constModEarly = await import(`${R}/const.mjs`);
settingValues.partyLevel = 6;
let b = enc.budgets();
check(b.level === 6, "the configured level wins");
check(b.size === 2, "budget counts the characters, not the bearers");
check(b.hard === 900 * 2 && b.deadly === 1400 * 2, `level 6 x2: hard ${b.hard}, deadly ${b.deadly}`);

settingValues.partyLevel = 0;
check(enc.partyLevel() === 5, "level 0 derives from the sheets (both level 5)");
gandalf.system.details.level = 9;
check(enc.partyLevel() === 7, "and averages rather than taking the highest");
gandalf.system.details.level = 5;
settingValues.partyLevel = 6;

// The crowd multiplier is a step function, straight out of the DMG.
check(enc.multiplierFor(1) === 1, "one monster: x1");
check(enc.multiplierFor(2) === 1.5, "two: x1.5");
check(enc.multiplierFor(5) === 2, "three to six: x2");
check(enc.multiplierFor(9) === 2.5, "seven to ten: x2.5");
check(enc.multiplierFor(20) === 4, "fifteen or more: x4");

// Velociraptors (CR 1/4, 50 XP) against a level-6 pair: hard 1800, deadly 2800.
// 12 x 50 x 3 = 1800 exactly; 15 would be 15 x 50 x 4 = 3000, past deadly.
const raptorSize = enc.countFor("1/4", 1800);
check(raptorSize > 0 && raptorSize <= 12, `CR 1/4 into a 1800 budget gives ${raptorSize}`);
check(enc.adjustedXP(50, raptorSize) <= 1800, "the suggested count fits the budget");
check(enc.adjustedXP(50, raptorSize + 1) > 1800 || raptorSize === 12,
  "and one more would not (or the cap was hit)");

// A tyrannosaurus (CR 8, 3900 XP) is past a level-6 pair's deadly budget alone.
check(enc.countFor("8", b.deadly) === 0, "one T-Rex is already beyond deadly for them");
const trex = events.byCategory("encounter").find(e => e.foe?.key === "tyrannosaurus");
const trexSuggestion = enc.suggestionFor(trex);
check(trexSuggestion.overwhelming === true, "and the suggestion says so");
check(trexSuggestion.name === "Tyrannosaurus", "with a translated name");

// The same creature against a high-level party is no longer overwhelming.
settingValues.partyLevel = 20;
check(enc.suggestionFor(trex).overwhelming === false, "at level 20 a T-Rex is manageable");
check(enc.suggestionFor(trex).hard >= 1, "and a hard count is offered");
settingValues.partyLevel = 6;

// A creature that is past "hard" alone must not advertise "0x hard".
// A pair of level-3 characters: hard 450 XP, deadly 800. An assassin vine is
// 700 - past hard on its own, but still a fight they could survive.
settingValues.partyLevel = 3;
const vine = constModEarly.EVENTS.find(e => e.foe?.key === "assassinVine");
const vs = enc.suggestionFor(vine);
check(vs.hard === 0 && vs.deadly >= 1, `one assassin vine is past hard but inside deadly (hard ${vs.hard}, deadly ${vs.deadly})`);
check(vs.hardImpossible === true, "and it is flagged so the window omits the hard figure");
check(vs.overwhelming === false, "it is not overwhelming, though - one is runnable");
settingValues.partyLevel = 6;

// Hazards and friendly meetings must NOT get an encounter size.
const quicksand = events.byCategory("ambush").find(e => e.id === "quicksand");
check(enc.suggestionFor(quicksand) === null, "a hazard gets no encounter suggestion");
const tabaxi = events.byCategory("encounter").find(e => e.id === "tabaxiHunter");
check(enc.suggestionFor(tabaxi) === null, "a friendly meeting gets none either");

// Every foe in the tables must produce a usable suggestion at a mid level.
for (const event of constModEarly.EVENTS.filter(e => e.foe)) {
  const sug = enc.suggestionFor(event, 8);
  check(!!sug, `event "${event.id}" produces a suggestion`);
  check(sug.name && !sug.name.includes("adventure-tracker"), `foe of "${event.id}" has a real name`);
  check(sug.xp > 0, `foe of "${event.id}" has an XP value`);
  check(sug.hard >= sug.deadly - 20, `"${event.id}": hard (${sug.hard}) is not wildly above deadly (${sug.deadly})`);
  check(sug.deadly >= sug.hard || sug.overwhelming, `"${event.id}": deadly count >= hard count`);
  check(sug.hard > 0 || sug.hardImpossible || sug.overwhelming,
    `"${event.id}": a zero hard count is always flagged rather than shown`);
}

/* ------------------------------------------------------------------ */
section("the report stays with the GM");
settingValues.state = {};
settingValues.shareReport = false;
await state.setDay(4);
await state.assign(gandalf.id, "navigator");
await state.assign(bilbo.id, "vanguard");
dice.d20 = 18; await doRoll(gandalf);
dice.d20 = 1;  await doRoll(bilbo);
queue.d100.push(99, 1);       // an ambush, so there is prose worth hiding
const secret = await resolve.resolveDay();
check(secret.events.length > 0, "the day produced events");

const gmCtx = await new app.AdventureTracker()._prepareContext({});
check(!!gmCtx.report, "the GM gets the report");
check(gmCtx.report.events.length > 0, "with its events");

setupGame({ actors: [gandalf, bilbo, notMine], isGM: false });
const playerCtx = await new app.AdventureTracker()._prepareContext({});
check(playerCtx.report === null, "a player is not sent the report at all");
check(playerCtx.reportHidden === true, "but is told the GM is working on it");
// The point of withholding at the data level: the prose must not be anywhere in
// what reaches the player, not even hidden behind a template condition.
const playerJson = JSON.stringify(playerCtx);
for (const event of secret.events) {
  const prose = events.eventText(event);
  check(!playerJson.includes(prose), `event prose "${event.id}" is absent from the player context`);
  check(!playerJson.includes(event.id), `event id "${event.id}" is absent too`);
}
const playerMarkup = compileTemplate()(playerCtx);
for (const event of secret.events) {
  check(!playerMarkup.includes(events.eventText(event)), `prose "${event.id}" never reaches the player's DOM`);
}

// Shared, the same player sees it.
settingValues.shareReport = true;
const sharedCtx = await new app.AdventureTracker()._prepareContext({});
check(!!sharedCtx.report, "with sharing on, players get the report");
check(sharedCtx.reportHidden === false, "and no longer see the placeholder");
settingValues.shareReport = false;
setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });

// The chat summary follows the same rule.
chatMessages.length = 0;
await conseq.postDayToChat(secret, { weather: "Klar", events: [] });
check(chatMessages[0].whisper?.length > 0, "the chat summary is whispered to the GM by default");
settingValues.shareReport = true;
chatMessages.length = 0;
await conseq.postDayToChat(secret, { weather: "Klar", events: [] });
check(chatMessages[0].whisper?.length === 0, "and goes to the table when shared");
settingValues.shareReport = false;

/* ------------------------------------------------------------------ */
section("the tool is the GM's");
settingValues.state = {};
settingValues.shareReport = false;
settingValues.playerRolls = false;
await state.setDay(9);
await state.setMode("canoe");
await state.assign(gandalf.id, "navigator");
await state.assign(bilbo.id, "vanguard");
dice.d20 = 18; await doRoll(gandalf);
dice.d20 = 1;  await doRoll(bilbo);
queue.d100.push(99, 1);
const gmDay = await resolve.resolveDay();
check(gmDay.events.length > 0, "the day produced events");

setupGame({ actors: [gandalf, bilbo, notMine], isGM: false });
let pc = await new app.AdventureTracker()._prepareContext({});

// What a player DOES get: the ambient facts.
check(pc.day === 9, "a player sees the travel day");
check(!!pc.moon?.label, "and the moon phase");
check(pc.travel.mode.length > 0 && pc.travel.pace.length > 0, "and how the party is travelling");
check(pc.sky.known === true && pc.sky.label.length > 0, "and today's weather, which they are standing in");

// What a player does NOT get.
check(pc.viewer === true, "the context knows it is a viewer");
check(pc.rolling === false, "rolling is off for them");
check(pc.party.length === 0, "no party list");
check(pc.report === null, "no report");
check(pc.log === null, "no logbook");
check(pc.unfilled.length === 0, "no planning information");

// Nothing secret may be anywhere in what reaches them, context or markup.
const pcJson = JSON.stringify(pc);
const pcHtml = compileTemplate()(pc);
for (const event of gmDay.events) {
  check(!pcJson.includes(events.eventText(event)), `prose "${event.id}" absent from the viewer context`);
  check(!pcHtml.includes(events.eventText(event)), `prose "${event.id}" absent from the viewer DOM`);
}
check(!pcHtml.includes("data-action=\"roll\""), "no roll button anywhere in the viewer markup");
check(!pcHtml.includes("data-action=\"resolveDay\""), "no resolve button");
check(!pcHtml.includes("data-action=\"completeDay\""), "no complete button");
check(!pcHtml.includes("data-mode="), "no mode buttons");
check(!pcHtml.includes("data-pace="), "no pace buttons");
check(!pcHtml.includes("toa-log"), "no logbook table");
check(!/\{\{|\}\}/.test(pcHtml), "the viewer window renders cleanly");
check(!/undefined|\[object Object\]/.test(pcHtml), "and has no undefined in it");

// A player may not act, and the refusal is GM-side, not just hidden.
check(roles.canControl(gandalf) === false, "a player cannot act for their own character either");
setupGame({ actors: [gandalf, bilbo, notMine], isGM: false, gmOnline: true });
emitted.length = 0;
socket.requestAssign(gandalf.id, "medic");
check(emitted.length === 1, "a determined player can still emit a socket message");
// ...and the GM-side handler is what actually refuses it.
setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });
const beforeAssign = JSON.stringify(state.getState().assignments);
const realWarn2 = console.warn; console.warn = () => {};
await socketHandler({ action: "assign", data: { actorId: gandalf.id, roleId: "medic" }, userId: "user1" });
console.warn = realWarn2;
check(JSON.stringify(state.getState().assignments) === beforeAssign,
  "the GM side refuses it, because hiding a control is not a permission");

/* --- the switch hands it back ------------------------------------- */
settingValues.playerRolls = true;
setupGame({ actors: [gandalf, bilbo, notMine], isGM: false });
pc = await new app.AdventureTracker()._prepareContext({});
check(pc.rolling === true, "with the switch on, players roll again");
check(pc.party.length === 2, "and get the party list back");
check(roles.canControl(gandalf) === true, "and may act for their own character");
check(roles.canControl(notMine) === false, "but still not for somebody else's");
const rollingHtml = compileTemplate()(pc);
check(rollingHtml.includes("toa-role-select"), "the role picker is back");
check(rollingHtml.includes("data-action=\"roll\""), "and so is the roll button");
// The report is a separate question and stays shut.
check(pc.report === null, "the report stays with the GM regardless");
check(!rollingHtml.includes("toa-hexbox"), "and so does the day's result");

setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });
const beforeAssign2 = JSON.stringify(state.getState().assignments);
await socketHandler({ action: "assign", data: { actorId: gandalf.id, roleId: "medic" }, userId: "user1" });
check(JSON.stringify(state.getState().assignments) !== beforeAssign2,
  "and the GM side now accepts the same message");
settingValues.playerRolls = false;
settingValues.shareReport = false;

/* --- sharing opens the report and the logbook --------------------- */
settingValues.shareReport = true;
setupGame({ actors: [gandalf, bilbo, notMine], isGM: false });
pc = await new app.AdventureTracker()._prepareContext({});
check(!!pc.log, "sharing gives players the logbook");
setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });
settingValues.shareReport = false;

/* ------------------------------------------------------------------ */
section("ready for tomorrow ends the travel day");
const rest = await import(`${R}/rest.mjs`);
settingValues.advanceOnReady = true;
settingValues.state = {};
await state.setDay(7);
await state.assign(gandalf.id, "navigator");
dice.d20 = 20; await doRoll(gandalf);
queue.d100.push(99, 100);
await resolve.resolveDay();

const longRest = { longRest: true, type: "long", newDay: true };
check(rest.allReady() === false, "nobody has checked in yet");
check(rest.notReady().length === 2, "two travellers still to come");

let out = await rest.recordReady(gandalf.id);
check(out.all === false, "one check-in is not the whole party");
check(state.getState().day === 7, "and the day has not moved");
check(rest.notReady().length === 1, "one traveller left to check in");

out = await rest.recordReady(bilbo.id);
check(out.all === true && out.advanced === true, "the last check-in ends the day");
check(out.completed === true, "and completes it properly, report and all");
check(state.getState().day === 8, `the counter moved to 8 (got ${state.getState().day})`);
check(state.getState().log.length === 1, "the day went into the logbook");
check(Object.keys(state.getState().ready).length === 0, "and the ready record was cleared");

// THE DOUBLE-ADVANCE GUARD. A GM who ends the day themselves lands on a fresh
// day; the party then beds down, and the counter must NOT move again.
settingValues.state = {};
await state.setDay(3);
await state.assign(gandalf.id, "navigator");
dice.d20 = 20; await doRoll(gandalf);
queue.d100.push(99, 100);
await resolve.resolveDay();
await state.completeDay();
check(state.getState().day === 4, "the GM completed day 3 by hand");
await rest.recordReady(gandalf.id);
out = await rest.recordReady(bilbo.id);
check(out.all === true && out.advanced === false, "everyone ready, but the day is untouched");
check(out.reason === "untouched", "and it says why");
check(state.getState().day === 4, "so the counter stays put - no double jump");

// A day with rolls but no report still advances, without inventing a report.
settingValues.state = {};
await state.setDay(11);
await state.assign(gandalf.id, "navigator");
dice.d20 = 15; await doRoll(gandalf);
await rest.recordReady(gandalf.id);
out = await rest.recordReady(bilbo.id);
check(out.advanced === true && out.completed === false, "rolls but no report: step the counter only");
check(state.getState().day === 12, "the day moved");
check(state.getState().log.length === 0, "and nothing was logged");

// Switched off, it notifies and leaves the counter alone.
settingValues.advanceOnReady = false;
settingValues.state = {};
await state.setDay(20);
await state.assign(gandalf.id, "navigator");
dice.d20 = 20; await doRoll(gandalf);
queue.d100.push(99, 100);
await resolve.resolveDay();
notes.length = 0;
await rest.recordReady(gandalf.id);
out = await rest.recordReady(bilbo.id);
check(out.advanced === false && out.reason === "disabled", "switched off it does not advance");
check(state.getState().day === 20, "the counter stays");
check(notes.some(n => n[0] === "info"), "but the GM is told everyone is ready");
settingValues.advanceOnReady = true;

// Only a LONG rest into a NEW DAY counts.
settingValues.state = {};
await state.setDay(5);
let reported = [];
const origEmit = game.socket.emit;
check(rest.allReady() === false, "fresh day, nobody ready");
// noteLongRest is the client-side filter; feed it the three rest shapes.
const seen = [];
const fakeActor = { id: gandalf.id };
rest.noteLongRest(fakeActor, { type: "short", newDay: false });
rest.noteLongRest(fakeActor, { longRest: true, type: "long", newDay: false });
await new Promise(r => setTimeout(r, 10));
check(Object.keys(state.getState().ready).length === 0,
  "a short rest and a same-day long rest are both ignored");
rest.noteLongRest(fakeActor, longRest);
await new Promise(r => setTimeout(r, 20));
check(state.getState().ready[gandalf.id] === true, "a long rest into a new day counts");

// An actor outside the travelling party must not move the travel day.
rest.noteLongRest({ id: notMine.id }, longRest);
await new Promise(r => setTimeout(r, 20));
check(!state.getState().ready[notMine.id], "somebody outside the party does not count");

// An empty party is never "all ready".
setupGame({ actors: [notMine], isGM: true });
check(rest.allReady() === false, "an empty travelling party is never all ready");
setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });

/* --- the one control a player always has -------------------------- */
/* "I am done with today" is a statement about your own character, not a use of
   the GM's tool, so it is deliberately NOT behind playerRolls - which is the
   whole point of the button for a table that runs the tracker GM-only. */
settingValues.playerRolls = false;
settingValues.state = {};
await state.setDay(2);
await socketHandler({ action: "ready", data: { actorId: gandalf.id }, userId: "user1" });
check(state.getState().ready[gandalf.id] === true,
  "a player may check in even when they may not roll");

// And take it back: somebody who wants to search the camp after all should not
// need the GM to edit the world state.
await socketHandler({ action: "ready", data: { actorId: gandalf.id, value: false }, userId: "user1" });
check(!state.getState().ready[gandalf.id], "and un-check-in again");

const realWarn3 = console.warn; console.warn = () => {};
await socketHandler({ action: "ready", data: { actorId: notMine.id }, userId: "user1" });
console.warn = realWarn3;
check(!state.getState().ready[notMine.id], "but not for a character they do not own");
settingValues.advanceOnReady = false;

/* ------------------------------------------------------------------ */
section("resolution does not flood chat (Dice So Nice)");
settingValues.state = {};
settingValues.rollsToChat = true;
await state.setDay(6);
await state.assign(gandalf.id, "navigator");
await state.assign(bilbo.id, "vanguard");
dice.d20 = 18; await doRoll(gandalf);
dice.d20 = 1;  await doRoll(bilbo);
saveResult.value = false;

// Everything the ENGINE rolls during resolution must be silent: weather,
// encounter, damage and - the expensive one - a saving throw per traveller per
// event. Each chat card is a 3D dice animation for anyone running Dice So Nice.
chatMessages.length = 0;
queue.d100.push(99, 1);           // an ambush, so there are saves to make
const noisy = await resolve.resolveDay();
check(noisy.events.length > 0, "the day produced events");
check(chatMessages.length === 0,
  `resolving a day creates no chat messages at all (got ${chatMessages.length})`);

// Every save must have been asked for with create:false.
const saveCalls = [...gandalf.calls, ...bilbo.calls].filter(c => c.method === "rollSavingThrow");
check(saveCalls.length > 0, "saving throws were actually rolled");
check(saveCalls.every(c => c.message?.create === false),
  "and every one of them suppressed its chat card");

// The numbers are not lost - they surface in the report instead.
setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });
let rc = await new app.AdventureTracker()._prepareContext({});
const withSaves = rc.report.consequences.filter(c => c.saves.length);
if (withSaves.length) {
  check(withSaves.every(c => c.saves.every(v => Number.isFinite(v.total) && Number.isFinite(v.dc))),
    "the report shows what each silent save rolled, against which DC");
  const html = compileTemplate()(rc);
  check(/\d+\/\d+/.test(html), "and the markup prints it");
}

/* --- the switch quiets the role rolls too ------------------------- */
settingValues.rollsToChat = true;
chatMessages.length = 0;
await state.setDay(1);
await state.assign(gandalf.id, "navigator");
dice.d20 = 15; await doRoll(gandalf);
check(chatMessages.length === 1,
  `with the switch on, a role check posts a card (got ${chatMessages.length}: ${JSON.stringify(chatMessages)})`);

settingValues.rollsToChat = false;
chatMessages.length = 0;
await state.setDay(2);
await state.assign(gandalf.id, "navigator");
await doRoll(gandalf);
check(chatMessages.length === 0, "with it off, the same roll is silent");
const quietCall = gandalf.calls[gandalf.calls.length - 1];
check(quietCall.message?.create === false, "because create:false reached the system");

// A silent roll must still produce a usable result - quiet, not skipped.
const quietRecord = state.getState().rolls[gandalf.id];
check(Number.isFinite(quietRecord?.total), "a silent roll still has a total");
check(quietRecord.success === true, "and a verdict");

// Yields follow the same switch.
chatMessages.length = 0;
await state.setDay(3);
await state.assign(gandalf.id, "quartermaster");
dice.d20 = 20; const quietYield = await doRoll(gandalf);
check(!!quietYield, "a silent role roll still produces a record");
check(chatMessages.length === 0, "and posts nothing");

settingValues.rollsToChat = true;
chatMessages.length = 0;
await state.setDay(4);
await state.assign(gandalf.id, "quartermaster");
await doRoll(gandalf);
check(chatMessages.length >= 1, "with the switch on the roll is announced again");

/* ------------------------------------------------------------------ */
section("one click runs the day, another applies it");
const ACTIONS = Object.getOwnPropertyDescriptor(app.AdventureTracker, "DEFAULT_OPTIONS").value.actions;
const instance2 = new app.AdventureTracker();
/** ApplicationV2 hands the clicked element to the handler; it only needs .disabled. */
const fakeButton = (dataset = {}) => ({ disabled: false, isConnected: true, dataset });

settingValues.state = {};
settingValues.applyConsequences = true;
settingValues.rollsToChat = false;
await state.setDay(12);
await state.assign(gandalf.id, "navigator");
await state.assign(bilbo.id, "vanguard");
dice.d20 = 1;                       // everyone fumbles, so there is damage to apply
saveResult.value = false;

// ONE press: roll every outstanding role AND resolve.
check(Object.keys(state.getState().rolls).length === 0, "nothing rolled yet");
queue.d100.push(99, 1);             // an ambush
await ACTIONS.runDay.call(instance2, {}, fakeButton());
const ran = state.getState();
check(Object.keys(ran.rolls).length === 2, "one press rolled both roles");
check(!!ran.report, "and resolved the day");
check(ran.report.reasons.length > 0, "the report carries its reasons");
check(ran.report.applied !== true, "but wrote nothing to any sheet yet");

// A roll already on the board is respected rather than thrown away.
const keptTotal = ran.rolls[gandalf.id].total;
queue.d100.push(99, 100);
await ACTIONS.resolveDay.call(instance2, {}, fakeButton());
check(state.getState().rolls[gandalf.id].total === keptTotal,
  "resolving again leaves existing rolls alone");

/* --- Apply is its own step ---------------------------------------- */
settingValues.state = {};
await state.setDay(13);
await state.assign(gandalf.id, "navigator");
await state.assign(bilbo.id, "vanguard");
dice.d20 = 1;
queue.d100.push(99, 1);
await ACTIONS.runDay.call(instance2, {}, fakeButton());
let rep = state.getState().report;
check(rep.consequences.length > 0, "the day cost somebody something");

for (const a of [gandalf, bilbo]) { a.damageTaken.length = 0; a.system.attributes.exhaustion = 0; }
const hpBefore2 = gandalf.system.attributes.hp.value;

await ACTIONS.applyNow.call(instance2, {}, fakeButton());
check(state.getState().report.applied === true, "the report is marked applied");
const damaged = rep.consequences.find(c => c.actorId === gandalf.id && c.damage > 0);
if (damaged) {
  check(gandalf.damageTaken.length === 1, "damage went to the sheet exactly once");
  check(gandalf.system.attributes.hp.value === hpBefore2 - damaged.damage, "hit points dropped");
}

/**
 * PRESSING APPLY AGAIN MUST DO NOTHING.
 *
 * The flag lives on the stored report rather than in a local variable, so it
 * survives a re-render and a reload - "did I already press it" is not a
 * question a GM should answer from memory, and the wrong answer costs the party
 * the same hit points a second time.
 */
const takenOnce = [...gandalf.damageTaken];
await ACTIONS.applyNow.call(instance2, {}, fakeButton());
check(gandalf.damageTaken.length === takenOnce.length, "a second Apply changes nothing");

// Completing the day must not apply them a second time either.
await ACTIONS.completeDay.call(instance2, {}, fakeButton());
check(gandalf.damageTaken.length === takenOnce.length,
  "completing an already-applied day does not double up");
check(state.getState().day === 14, "and the day still advanced");
check(state.getState().log.length === 1, "and was logged");

// The other order still works: complete WITHOUT pressing Apply first.
settingValues.state = {};
await state.setDay(20);
await state.assign(gandalf.id, "navigator");
await state.assign(bilbo.id, "vanguard");
dice.d20 = 1;
queue.d100.push(99, 1);
await ACTIONS.runDay.call(instance2, {}, fakeButton());
rep = state.getState().report;
for (const a of [gandalf, bilbo]) { a.damageTaken.length = 0; a.system.attributes.exhaustion = 0; }
const expectDamage = rep.consequences.some(c => c.damage > 0);
await ACTIONS.completeDay.call(instance2, {}, fakeButton());
if (expectDamage) {
  check([...gandalf.damageTaken, ...bilbo.damageTaken].length > 0,
    "completing an unapplied day still applies the consequences");
}
check(state.getState().day === 21, "and advances");

// The context tells the template which state the button is in.
settingValues.state = {};
await state.setDay(30);
await state.assign(gandalf.id, "navigator");
dice.d20 = 1;
queue.d100.push(99, 1);
await ACTIONS.runDay.call(instance2, {}, fakeButton());
let ctx2 = await instance2._prepareContext({});
check(ctx2.report.applied === false, "context: not applied yet");
const beforeHtml = compileTemplate()(ctx2);
check(beforeHtml.includes('data-action="applyNow"'), "so the Apply button is offered");
await ACTIONS.applyNow.call(instance2, {}, fakeButton());
ctx2 = await instance2._prepareContext({});
check(ctx2.report.applied === true, "context: applied");
const afterHtml = compileTemplate()(ctx2);
check(!afterHtml.includes('data-action="applyNow"'), "and the button is gone");
check(afterHtml.includes(game.i18n.localize("toa-adventure-tracker.app.applied")),
  "replaced by a note that it is done");

for (const a of [gandalf, bilbo, notMine]) {
  a.system.attributes.exhaustion = 0;
  a.system.attributes.hp.value = a.system.attributes.hp.max;
}
settingValues.rollsToChat = true;

/* ------------------------------------------------------------------ */
section("the role board, and batches that do not prompt");
setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });
settingValues.state = {};
await state.setDay(1);
await state.assign(gandalf.id, "navigator");
let gctx = await new app.AdventureTracker()._prepareContext({});

check(gctx.board.roles.length === 6, `the board lists every role (${gctx.board.roles.length})`);
for (const row of gctx.board.roles) {
  check(!!row.label && !row.label.includes("adventure-tracker"), `${row.id}: has a name`);
  check(!!row.check, `${row.id}: names the skill it rolls`);
  check(Number.isFinite(row.dc), `${row.id}: names its DC`);
  // The column that exposed the inert medic. An empty one means the role does
  // nothing, or nobody could say what.
  check(row.effect.length > 25 && !row.effect.includes("adventure-tracker"),
    `${row.id}: says what it mechanically does`);
  check(!!row.unfilled && !row.unfilled.includes("adventure-tracker"),
    `${row.id}: says what leaving it empty costs`);
}

/* --- who is on what ----------------------------------------------- */
const navRow = gctx.board.roles.find(r => r.id === "navigator");
check(navRow.holders.length === 1 && navRow.holders[0].name === "Gandalf",
  "the board names who took the role");
check(navRow.holders[0].mod === "+9", `and the modifier they bring (${navRow.holders[0].mod})`);
check(!navRow.empty, "a filled role is not marked empty");
check(gctx.board.roles.find(r => r.id === "vanguard").empty, "an unfilled one is");
// A GM has no single character, so no column that would have to pick one.
check(gctx.board.mine === false, "the GM gets no personal column");

const guideHtml = compileTemplate()(gctx);
check(guideHtml.includes("toa-board"), "the board renders");
check(guideHtml.includes(gctx.board.roles[0].effect), "with the effect text in it");
check(guideHtml.includes("Gandalf"), "and the name of whoever is on the role");

/* --- THE PLAYER'S VIEW -------------------------------------------- */
/* The board is the reason a player opens this window at all: what there is to
   do, who has it, what it rolls and what they would bring to it. None of it is
   the day report, which is what the secrecy is actually about. */
settingValues.playerRolls = false;
settingValues.shareReport = false;
setupGame({ actors: [gandalf, bilbo, notMine], isGM: false, character: bilbo });
const viewerCtx = await new app.AdventureTracker()._prepareContext({});
const viewerHtml = compileTemplate()(viewerCtx);

check(viewerCtx.rolling === false, "a player still gets no working surface");
check(viewerHtml.includes("toa-board"), "but they do get the board");
check(viewerHtml.includes("Gandalf"), "including who is on which role");
check(viewerHtml.includes(viewerCtx.board.roles[0].check), "and the skill each one rolls");
check(viewerHtml.includes(viewerCtx.board.roles[0].effect), "and what the role does");

// Their OWN numbers, for every role - the answer to "where would I be useful".
check(viewerCtx.board.mine === true, "a player gets a personal column");
check(viewerCtx.board.you === "Bilbo", "headed with their own character");
const viewerStealth = viewerCtx.board.roles.find(r => r.id === "rearguard");
check(viewerStealth.you === "+8", `their own modifier per role (${viewerStealth.you})`);
check(viewerCtx.board.roles.every(r => r.you !== ""), "filled in for every role, not just theirs");

// The pace malus is on the board rather than only in the report, so it can be
// read BEFORE the roll it applies to.
setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });
await state.setPace("fast");
setupGame({ actors: [gandalf, bilbo, notMine], isGM: false, character: bilbo });
const fastBoard = (await new app.AdventureTracker()._prepareContext({})).board;
check(fastBoard.roles.find(r => r.id === "vanguard").paceMod === "-5",
  "the current pace's malus is shown per role");

setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });
settingValues.state = {};
await state.setDay(1);

/* --- a batch must never ask about advantage ----------------------- */
settingValues.skipRollDialog = false;   // a single roll SHOULD still ask
await state.assign(gandalf.id, "navigator");
gandalf.calls.length = 0;
await roles.rollRole(gandalf, roles.getRole("navigator"), {});
check(gandalf.calls[0].dialog.configure === true, "a single roll still offers the dialog");

gandalf.calls.length = 0;
await roles.rollRole(gandalf, roles.getRole("navigator"), { batch: true });
check(gandalf.calls[0].dialog.configure === false, "a batch roll never does");

// And the one-click path uses the batch flag throughout.
settingValues.state = {};
await state.setDay(2);
await state.assign(gandalf.id, "navigator");
await state.assign(bilbo.id, "vanguard");
gandalf.calls.length = 0; bilbo.calls.length = 0;
queue.d100.push(99, 100);
await ACTIONS.runDay.call(instance2, {}, fakeButton());
check([...gandalf.calls, ...bilbo.calls].filter(c => c.method !== "rollSavingThrow")
  .every(c => c.dialog?.configure === false),
  "running the whole day prompts for nothing");

/* ------------------------------------------------------------------ */
section("a batch never puts dice on the screen");

/**
 * The real cost of Dice So Nice is not tidiness, it is the clock: a chat card
 * carrying a roll throws physical dice across the screen, the animations QUEUE,
 * and the batch awaits each one. Six checks became half a minute of watching.
 *
 * So a batch creates no chat messages AT ALL - not as a setting, as a rule.
 * Without a message there is no createChatMessage hook and nothing to animate.
 */
setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });
settingValues.state = {};
settingValues.rollsToChat = true;        // even with the setting ON
await state.setDay(40);
await state.assign(gandalf.id, "navigator");
await state.assign(bilbo.id, "vanguard");
chatMessages.length = 0;
gandalf.calls.length = 0; bilbo.calls.length = 0;
dice.d20 = 14;
queue.d100.push(99, 100);
await ACTIONS.runDay.call(instance2, {}, fakeButton());

check(chatMessages.length === 0,
  `running the whole day creates no chat message at all (got ${chatMessages.length})`);
const batchCalls = [...gandalf.calls, ...bilbo.calls].filter(c => c.method !== "rollSavingThrow");
check(batchCalls.length === 2, "both roles were rolled");
check(batchCalls.every(c => c.message?.create === false),
  "every batch roll suppressed its chat card");
check(batchCalls.every(c => c.dialog?.configure === false), "and prompted for nothing");

// The results are not lost - the window has them immediately...
const batchState = state.getState();
check(Object.keys(batchState.rolls).length === 2, "the results are on the board");
check(Number.isFinite(batchState.rolls[gandalf.id].total), "with real totals");

// ...and the report carries them so the day summary can print them.
check(batchState.report.rolls?.length === 2, "the report carries the day's checks");
check(batchState.report.rolls.every(r => r.actorName && Number.isFinite(r.total)),
  "each with a name and a number");

// The summary prints them as TEXT. Re-introducing them as rolls would put the
// dice straight back on the screen at the last step.
chatMessages.length = 0;
await conseq.postDayToChat(batchState.report, { weather: "Klar", events: [] });
check(chatMessages.length === 1, "the day goes out as exactly one message");
const summary = chatMessages[0].content;
check(summary.includes("Gandalf") && summary.includes("Bilbo"), "naming both travellers");
check(summary.includes(String(batchState.report.rolls[0].total)), "and their totals");
check(!summary.includes("<ol class=\"dice-rolls\"") && !summary.includes("dice-roll"),
  "as plain text, with no roll markup for anything to animate");

// A SINGLE roll from one row is the one a table wants to watch, and still posts.
chatMessages.length = 0;
await state.setDay(41);
await state.assign(gandalf.id, "navigator");
await doRoll(gandalf);
check(chatMessages.length === 1, "a single roll still posts, with the setting on");
settingValues.rollsToChat = false;
chatMessages.length = 0;
await state.setDay(42);
await state.assign(gandalf.id, "navigator");
await doRoll(gandalf);
check(chatMessages.length === 0, "and is silent with the setting off");
settingValues.rollsToChat = true;

/* ------------------------------------------------------------------ */
section("journal export");
journals.length = 0;
settingValues.state = {};
await state.setDay(3);
await state.assign(gandalf.id, "navigator");
dice.d20 = 20; await doRoll(gandalf);
queue.d100.push(99, 99);
await resolve.resolveDay();
await state.completeDay();
const exportAction = Object.getOwnPropertyDescriptor(app.AdventureTracker, "DEFAULT_OPTIONS").value.actions.exportLog;
await exportAction.call(instance);
check(journals.length === 1, "export wrote one journal entry");
check(journals[0].pages[0].text.content.includes("<table>"), "with the log table");
check(!journals[0].pages[0].text.content.includes("undefined"), "and no undefined");

/* ------------------------------------------------------------------ */
section("ready for tomorrow, in the window");

settingValues.playerRolls = false;
settingValues.advanceOnReady = false;
settingValues.state = {};
// `theirs` is a party member this user does not own; `notMine` is not a player
// character at all and so is not travelling.
setupGame({ actors: [gandalf, bilbo, theirs, notMine], isGM: true });
await state.setDay(5);

const READY = Object.getOwnPropertyDescriptor(app.AdventureTracker, "DEFAULT_OPTIONS").value.actions.ready;

let rctx = await new app.AdventureTracker()._prepareContext({});
check(rctx.ready.total === 3, `everyone travelling is listed (${rctx.ready.total})`);
check(!rctx.ready.rows.some(r => r.id === notMine.id), "and nobody who is not");
check(rctx.ready.count === 0, "nobody has checked in yet");
check(rctx.ready.all === false, "so the party is not ready");
check(rctx.ready.waiting.length === 3, "and all three are named as missing");
check(rctx.ready.waiting.includes("Gandalf"), "by name, not by number");

// The GM may check anybody in - somebody has to answer for the player who
// logged off mid-jungle.
check(rctx.ready.rows.every(r => r.editable), "the GM may press any row");
await READY.call(instance, {}, fakeButton({ actorId: gandalf.id, ready: "true" }));
rctx = await new app.AdventureTracker()._prepareContext({});
check(rctx.ready.count === 1, "one traveller is in");
check(rctx.ready.rows.find(r => r.id === gandalf.id).ready === true, "the right one");
check(!rctx.ready.waiting.includes("Gandalf"), "and no longer on the missing list");

// Taking it back.
await READY.call(instance, {}, fakeButton({ actorId: gandalf.id, ready: "false" }));
check(state.getState().ready[gandalf.id] === undefined, "a check-in can be taken back");

/* --- THE ONE CONTROL A PLAYER ALWAYS HAS -------------------------- */
/* The tracker is the GM's tool, but this button is not part of it: it belongs
   to the player's own character, so it survives playerRolls being off. */
setupGame({ actors: [gandalf, bilbo, theirs, notMine], isGM: false, character: bilbo });
const pctx = await new app.AdventureTracker()._prepareContext({});
check(pctx.rolling === false, "the player still may not roll");
check(pctx.ready.total === 3, "but they see the whole check-in list");
check(pctx.ready.rows.find(r => r.id === bilbo.id).editable === true,
  "and may press it for their own character");
check(pctx.ready.rows.find(r => r.id === theirs.id).editable === false,
  "but not for somebody else's");
const pHtml = compileTemplate()(pctx);
check(pHtml.includes('data-action="ready"'), "the button renders in a player's window");
check(pHtml.includes(game.i18n.localize("toa-adventure-tracker.app.imReady")), "with a label");

setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });
settingValues.state = {};

/* ------------------------------------------------------------------ */
section("every traveller gets a line, and the night is one of them");

/**
 * Deterministic, because the interesting assertion is "everybody is listed",
 * not "the dice were kind". Every chance gate in a day is `Math.random()`:
 * pinned high, no pursuit fires, no camp mishap fires and no boon turns up.
 */
const realRandom = Math.random;
Math.random = () => 0.99;

settingValues.state = {};
await state.setDay(6);
await state.assign(gandalf.id, "navigator");
dice.d20 = 20; await doRoll(gandalf);
queue.d100.push(99, 100);          // and no encounter
const quiet = await resolve.resolveDay();
check(quiet.events.length === 0, `a genuinely quiet day (${quiet.events.length} events)`);
check(quiet.consequences.length === 2,
  `still lists every traveller (${quiet.consequences.length})`);
check(quiet.consequences.every(c => !c.damage && !c.exhaustion),
  "with nothing against any of them");
check(quiet.consequences.every(c => c.restless === false),
  "and a breather for everyone");

const quietCtx = await new app.AdventureTracker()._prepareContext({});
check(quietCtx.report.consequences.every(c => c.untouched), "the window marks them untouched");
check(quietCtx.report.hasConsequences === false,
  "and offers nothing to apply, because there is nothing to write");
const quietHtml = compileTemplate()(quietCtx);
check(quietHtml.includes(game.i18n.localize("toa-adventure-tracker.app.noEffect")),
  '"no effect" is said out loud rather than left as a gap');
check(quietHtml.includes(game.i18n.localize("toa-adventure-tracker.app.shortRest")),
  "and so is the short rest");
check(!quietHtml.includes('data-action="applyNow"'), "no apply button on a day with nothing to apply");

/* A camp event that LANDS costs the night. The quartermaster's description has
   always promised "a night that does not count as a rest"; until now nothing
   made it true. Pin the dice low so the mishap definitely fires, and fail the
   save so it definitely gets them. */
Math.random = () => 0;
settingValues.state = {};
await state.setDay(7);
await state.assign(gandalf.id, "navigator");
await state.assign(bilbo.id, "quartermaster");
dice.d20 = 20; await doRoll(gandalf);
dice.d20 = 1;  await doRoll(bilbo);      // the camp check fails
queue.d100.push(99);                     // but nothing finds them
saveResult.value = false;
const campDay = await resolve.resolveDay();
check(campDay.events.some(e => e.category === "camp"), "a failed camp draws a camp event");
check(campDay.consequences.some(c => c.restless === true),
  "and a camp event that lands costs somebody their night");
const campHtml = compileTemplate()(await new app.AdventureTracker()._prepareContext({}));
check(campHtml.includes(game.i18n.localize("toa-adventure-tracker.app.noRest")),
  "which the report says out loud");

// Saving means it did not get you - so it does not cost you the night either.
saveResult.value = true;
settingValues.state = {};
await state.setDay(8);
await state.assign(gandalf.id, "navigator");
await state.assign(bilbo.id, "quartermaster");
dice.d20 = 20; await doRoll(gandalf);
dice.d20 = 1;  await doRoll(bilbo);
queue.d100.push(99);
const savedCamp = await resolve.resolveDay();
check(savedCamp.consequences.every(c => c.restless === false),
  "a camp event you saved against leaves the night alone");

Math.random = realRandom;
saveResult.value = false;
for (const a of [gandalf, bilbo]) {
  a.system.attributes.exhaustion = 0;
  a.system.attributes.hp.value = a.system.attributes.hp.max;
}
settingValues.state = {};
await state.setDay(1);

/* ------------------------------------------------------------------ */
section("the jungle notices the grung walking through it");

/* KIN events are about ONE traveller. Their whole design is that they do not
   exist for a party that has nobody of that kin - a patrol recognising one of
   its own makes no sense otherwise - so the first thing to prove is absence. */
settingValues.grungKin = "";
const evmod = await import(`${R}/events.mjs`);
const kinEvents = (await import(`${R}/const.mjs`)).EVENTS.filter(e => e.kin);
check(kinEvents.length > 0, `there are kin events at all (${kinEvents.length})`);

const poolIds = (cat) => evmod.byCategory(cat, "foot").map(e => e.id);
check(kinEvents.every(e => !poolIds(e.category).includes(e.id)),
  "with nobody named, no kin event is in any pool");

// Name one, and they appear.
settingValues.grungKin = gandalf.id;
check(kinEvents.every(e => poolIds(e.category).includes(e.id)),
  "name the grung and every one of them is in play");

/* --- the prose is about him, by name ------------------------------ */
const mockery = kinEvents.find(e => e.id === "grungMockery");
const setupText = evmod.eventText({ ...mockery, retortResult: null });
check(setupText.includes("Gandalf"), "the event says his name");
check(!setupText.includes("{name}"), "and no placeholder survives into the prose");

// Both endings exist and differ - the retort is the point of the scene.
const wonText = evmod.eventText({ ...mockery, retortResult: { ok: true } });
const lostText = evmod.eventText({ ...mockery, retortResult: { ok: false } });
check(wonText !== lostText, "a retort that lands reads differently from one that does not");
check(wonText.startsWith(setupText) && lostText.startsWith(setupText),
  "both endings hang off the same setup");
check(wonText.includes("Gandalf") && lostText.includes("Gandalf"), "and both name him");

/* --- "kin" as a target hits exactly him --------------------------- */
check(mockery.target === "kin", "the mockery is aimed at the kin");
const aimed = evmod.targetsOf(mockery, [gandalf, bilbo]);
check(aimed.length === 1 && aimed[0].id === gandalf.id, "which is one traveller, not the party");
// Named but not travelling today: nobody, rather than everybody.
check(evmod.targetsOf(mockery, [bilbo]).length === 0,
  "a kin who is not travelling means the event touches no one");

/* --- ONE ROLL, FOR EVERYONE --------------------------------------- */
/* A retort is a save made with words: rolled once, by the character it is
   about, cancelling the event for the whole party. That is what separates it
   from an ordinary save, and it is worth proving in both directions.

   Pinned so the grung event is the one drawn rather than hoped for: `pick`
   indexes its pool with Math.random, so a value of (index / length) picks
   exactly it. The same value sits above every chance gate in the day
   (pursuit 45, camp 35), so nothing else fires alongside it. */
const encPool = evmod.byCategory("encounter", "foot");
const mockIdx = encPool.findIndex(e => e.id === "grungMockery");
check(mockIdx >= 0, "the mockery is in the foot encounter pool");
const pinned = (mockIdx + 0.5) / encPool.length;
// The camp gate is the only one this pin has to clear; the rearguard is filled
// below, so the pursuit gate never opens, and an unfilled quartermaster makes
// the day non-flawless, so no boon turns up either. Nothing but the grung.
check(pinned * 100 >= 35, `and the pin clears the camp gate (${Math.round(pinned * 100)})`);
Math.random = () => pinned;
saveResult.value = false;
setupGame({ actors: [gandalf, bilbo, theirs], isGM: true });

/** One day where the grung meet the party in the open. */
const grungDay = async (day, d20) => {
  settingValues.state = {};
  await state.setDay(day);
  await state.assign(gandalf.id, "navigator");
  await state.assign(bilbo.id, "vanguard");     // seen in time: an encounter, not an ambush
  await state.assign(theirs.id, "rearguard");   // and no pursuit to muddy the day
  dice.d20 = 20;
  await doRoll(gandalf); await doRoll(bilbo); await doRoll(theirs);
  gandalf.calls.length = 0;
  queue.d100.length = 0;
  queue.d100.push(99, 1);                        // clear sky; something finds them
  dice.d20 = d20;                                // and this is what he has to say
  return resolve.resolveDay();
};

let kinDay = await grungDay(30, 20);
let kinEvent = kinDay.events.find(e => e.id === "grungMockery");
check(!!kinEvent, "the grung event is the one that came up");
check(kinEvent.retortResult.by === "Gandalf", "the retort is rolled by the traveller it is about");
check(kinEvent.retortResult.ok === true, "a 20 answers them");
check(gandalf.calls.some(c => c.method === "rollSkill" && c.message?.create === false),
  "through the system, and without a chat card");
check(kinDay.consequences.every(c => !c.damage && !c.exhaustion),
  "and a landed retort costs the party nothing");
check(evmod.eventText(kinEvent).includes("Gandalf"), "the prose names him");

// The same event, answered badly.
kinDay = await grungDay(31, 1);
kinEvent = kinDay.events.find(e => e.id === "grungMockery");
check(kinEvent.retortResult.ok === false, "a 1 does not");
const bill = kinDay.consequences.reduce((n, c) => n + c.damage + c.exhaustion, 0);
check(bill > 0, `and then the event actually costs something (${bill})`);
// Aimed at the kin, so it is HIS bill and nobody else's.
check(kinDay.consequences.find(c => c.actorId === gandalf.id).damage > 0, "his bill");
check(kinDay.consequences.find(c => c.actorId === bilbo.id).damage === 0, "and nobody else's");
const kinHtml = compileTemplate()(await new app.AdventureTracker()._prepareContext({}));
check(kinHtml.includes("Gandalf"), "the report names him");

Math.random = realRandom;
settingValues.grungKin = "";
settingValues.state = {};
setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });
for (const a of [gandalf, bilbo, theirs]) {
  a.system.attributes.exhaustion = 0;
  a.system.attributes.hp.value = a.system.attributes.hp.max;
}
await state.setDay(1);

/* ------------------------------------------------------------------ */
section("the button in the left rail");

/* Importing the bootstrap registers its hooks; none of them FIRE on import, so
   this is safe to do last and still exercises the real registration. */
await import(`${R}/module.mjs`);

/** Run the hook the way core does: hand it the controls object to mutate. */
const railFor = (isGM) => {
  setupGame({ actors: [gandalf, bilbo, notMine], isGM });
  const controls = { tokens: { name: "tokens", order: 0, tools: {} } };
  Hooks.callAll("getSceneControlButtons", controls);
  return controls;
};

const gmRail = railFor(true);
const group = gmRail["toa-adventure-tracker"];
check(!!group, "the module adds its own category, not a tool in somebody else's");
check(gmRail.tokens.tools["toa-adventure-tracker"] === undefined,
  "and leaves the core categories alone");
check(typeof group.title === "string" && group.title.startsWith("toa-adventure-tracker."),
  "the category is titled from the language file, not hardcoded");

/* The three things core is unforgiving about, each one a bug that only shows up
   when somebody clicks: a category with no activeTool throws, a tool with
   neither onChange nor onClick throws, and a control keyed by the wrong name
   never renders. */
check(!!group.activeTool && group.activeTool in group.tools,
  `activeTool names a real tool ("${group.activeTool}")`);
check(group.name === "toa-adventure-tracker", "the control carries its own key as its name");
for (const [key, tool] of Object.entries(group.tools)) {
  check(tool.name === key, `${key}: name matches its key`);
  check(typeof tool.onChange === "function", `${key}: has onChange (v13 calls this one)`);
  check(typeof tool.onClick === "function", `${key}: has onClick (core throws without either)`);
  check(tool.button === true, `${key}: is a momentary button, not a mode`);
  check(Number.isFinite(tool.order), `${key}: has an order`);
}

// Opening it is the common case, so the category itself does it - one click,
// not two. Deactivation must NOT (onChange fires both ways).
let opened = 0;
const realRender = app.AdventureTracker.prototype.render;
app.AdventureTracker.prototype.render = function () { opened++; return this; };
try {
  group.onChange({}, true);
  check(opened === 1, "clicking the category opens the window");
  group.onChange({}, false);
  check(opened === 1, "leaving it does not open a second one");
} finally {
  app.AdventureTracker.prototype.render = realRender;
}

// Running the day is the GM's. A player is not shown a control they cannot use.
check("runDay" in gmRail["toa-adventure-tracker"].tools, "the GM gets the run-day tool");
const playerRail = railFor(false);
check(!!playerRail["toa-adventure-tracker"], "a player still gets the category");
check(!("runDay" in playerRail["toa-adventure-tracker"].tools),
  "but not the run-day tool");

// ...and the refusal is in the code as well as in the rail, because a rail is
// only a rendering.
setupGame({ actors: [gandalf, bilbo, notMine], isGM: false });
check(await app.AdventureTracker.runDay() === false, "runDay refuses a non-GM outright");
setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });

/* ------------------------------------------------------------------ */
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
