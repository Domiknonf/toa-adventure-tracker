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
const gandalf = makeActor({ id: "aaa1", name: "Gandalf", skills: { sur: 9, prc: 7, ste: 1, med: 5, inv: 6 }, abilities: { wis: 4, con: 2 } });
const bilbo   = makeActor({ id: "bbb2", name: "Bilbo",   skills: { sur: 2, prc: 3, ste: 8, med: 0, inv: 2 }, abilities: { wis: 1, con: 1 } });
const notMine = makeActor({ id: "ccc3", name: "Fremder", skills: { sur: 0 }, abilities: { wis: 0 }, owner: false });
setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });

const settings = await import(`${R}/settings.mjs`);
settings.registerSettings();

const state   = await import(`${R}/state.mjs`);
const roles   = await import(`${R}/roles.mjs`);
const moon    = await import(`${R}/moon.mjs`);
const events  = await import(`${R}/events.mjs`);
const weather = await import(`${R}/weather.mjs`);
const resolve = await import(`${R}/resolve.mjs`);
const conseq  = await import(`${R}/consequences.mjs`);
const app     = await import(`${R}/app.mjs`);

/** Reset to a clean, deterministic day. */
async function freshDay({ pace = "normal", nav = null, assignments = {} } = {}) {
  settingValues.state = {};
  await state.setDay(1);
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
check(list.length === 8, `8 default roles (got ${list.length})`);
check(list[0].id === "navigator", "navigator is first");
check(roles.roleLabel(list[0]) === "Navigator", "label resolves from lang");
check(roles.roleHint(roles.getRole("vanguard")).length > 10, "vanguard has a description");
check(roles.resolveSkill("survival") === "sur", "skill resolves by fullKey");
check(roles.resolveSkill("Überleben") === "sur", "skill resolves by localized label");
check(roles.modifierFor(gandalf, roles.getRole("navigator")) === 9, "modifier read from the sheet");

check(roles.partyActors().length === 2, "player-owned characters only");
check(roles.travelerCount() === 2, "traveler count derives from party");
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
check(weather.weatherWater(wet) === 3, "rain alone yields 3 gallons");
settingValues.rainCatcher = true;
check(weather.weatherWater(wet) === 3 + settingValues.rainCatcherBonus, "a catcher adds on a wet day");
queue.d100.push(99);
const dry = await weather.rollWeather();
check(weather.weatherWater(dry) === 0, "a catcher is worthless on a dry day");
settingValues.rainCatcher = false;

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

// Navigation succeeds at normal pace -> exactly one hex.
await freshDay({ pace: "normal", nav: 18, assignments: { [gandalf.id]: "navigator" } });
await doRoll(gandalf);
queue.d100.push(99, 99);          // dry, no encounter
let report = await resolve.resolveDay();
check(report.hexes === 1, `normal pace + success = 1 hex (got ${report.hexes})`);
check(report.reasons.some(r => r.key === "navigated"), "the reason says the navigator held course");

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
await freshDay({ pace: "fast", nav: 11, assignments: { [gandalf.id]: "navigator" } });
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
section("supplies carry over between days");
await freshDay({ pace: "normal", assignments: { [gandalf.id]: "navigator" } });
await state.setSupplies({ water: 20, food: 20 });
check(state.getState().supplies.water === 20, "stocks can be set");
dice.d20 = 20; await doRoll(gandalf);
queue.d100.push(99, 99);   // dry day, no encounter
report = await resolve.resolveDay();
// 2 travellers x 2 gallons = 4, on a dry day possibly x1.5 for a clear one.
check(report.supplies.waterBefore === 20, "the report starts from yesterday's stock");
check(report.supplies.waterAfter < 20, "the day drank from it");
check(report.supplies.waterAfter > 0, "and did not empty it");

await state.completeDay();
check(state.getState().supplies.water === report.supplies.waterAfter,
  "completing the day carries the new stock forward");
check(state.getState().day === 2, "and advances the day");

/* ------------------------------------------------------------------ */
section("a dry spell empties the barrels and costs exhaustion");
await freshDay({ pace: "normal", assignments: { [gandalf.id]: "navigator" } });
await state.setSupplies({ water: 0, food: 50 });
dice.d20 = 20; await doRoll(gandalf);
saveResult.value = false;
queue.d100.push(99, 99);   // dry, no encounter
report = await resolve.resolveDay();
check(report.supplies.waterShort > 0, "with no water and no rain the party runs short");
check(report.events.some(e => e.category === "thirst"), "a thirst event fires");
check(report.consequences.some(c => c.exhaustion > 0), "and it costs exhaustion");
check(report.dryDays === 1, "the dry streak starts counting");

// The same day, but they make their saves.
saveResult.value = true;
queue.d100.push(99, 99);
report = await resolve.resolveDay();
const thirstEvent = report.events.find(e => e.category === "thirst");
check(!!thirstEvent?.save, "the thirst event offers a save");
const savedAll = report.consequences.every(c =>
  c.from.filter(f => f.saved !== null).every(f => f.saved === true));
check(savedAll, "every offered save was made");
// Anything that still cost exhaustion must be an event with no save at all.
const unsaveable = report.consequences.filter(c => c.exhaustion > 0);
check(unsaveable.every(c => c.from.some(f => f.saved === null)),
  "only events that offer no save still bite through a good save");
saveResult.value = false;

// Rain resets the streak.
await freshDay({ pace: "normal", assignments: { [gandalf.id]: "navigator" } });
dice.d20 = 20; await doRoll(gandalf);
queue.d100.push(40, 99);   // rain
report = await resolve.resolveDay();
check(report.dryDays === 0, "rain resets the dry streak");
check(report.supplies.waterFromWeather > 0, "and fills the barrels");

/* ------------------------------------------------------------------ */
section("hunger has a grace period, thirst does not");
await freshDay({ pace: "normal", assignments: { [gandalf.id]: "navigator" } });
await state.setSupplies({ water: 99, food: 0 });
dice.d20 = 20; await doRoll(gandalf);
queue.d100.push(99, 99);
report = await resolve.resolveDay();
check(report.supplies.foodShort > 0, "the party is short on food");
check(!report.events.some(e => e.category === "hunger"), "day 1 hungry costs nothing (grace)");
check(report.hungryDays === 1, "but the streak is counted");

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
check(report.consequences.length > 0, "the ambush produced consequences");

const hpBefore = gandalf.system.attributes.hp.value;
const applied = await conseq.applyConsequences(report);
check(applied.applied === true, "consequences are applied by default");
const hurt = report.consequences.find(c => c.actorId === gandalf.id);
if (hurt?.damage) {
  check(gandalf.damageTaken.length > 0, "damage went through actor.applyDamage()");
  check(gandalf.system.attributes.hp.value === hpBefore - hurt.damage, "hit points actually dropped");
}
const exhausted = report.consequences.find(c => c.exhaustion > 0);
if (exhausted) {
  const actor = game.actors.get(exhausted.actorId);
  check(actor.system.attributes.exhaustion > 0, "exhaustion was written to the sheet");
  actor.system.attributes.exhaustion = 0;
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
await state.setSupplies({ water: 50, food: 50 });
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
check(migrated.schema === 2, "schema is raised");
check(migrated.day === 14, "the day counter survives");
check(migrated.log.length === 1, "the logbook survives");
check(migrated.log[0].miles === 9, "old entries keep their miles rather than being faked into hexes");
check(Object.keys(migrated.assignments).length === 0, "task assignments are dropped");
check(migrated.report === null && migrated.supplies.water === 0, "new fields are present and empty");

/* ------------------------------------------------------------------ */
section("permissions");
setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });
check(roles.canControl(notMine) === true, "the GM controls everything");
setupGame({ actors: [gandalf, bilbo, notMine], isGM: false });
check(roles.canControl(gandalf) === true, "a player controls their own character");
check(roles.canControl(notMine) === false, "but not somebody else's");
check(state.isWriter() === false, "a player is not the writer");
const before = JSON.stringify(state.getState());
await state.setDay(999);
check(JSON.stringify(state.getState()) === before, "a player's direct write is refused");
check(await resolve.resolveDay() === null, "and a player cannot resolve the day");

const socket = await import(`${R}/socket.mjs`);
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
check(roles.getRoles().length === 8, "broken JSON falls back to the defaults");
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
await state.setSupplies({ water: 12, food: 8 });
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
check(playerHtml.includes("Gandalf"), "but still sees the whole party");
check(playerHtml.includes("toa-hexbox"), "and the same result");
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
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
