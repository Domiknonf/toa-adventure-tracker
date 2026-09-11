import path from "node:path";
import {
  makeActor, setupGame, settingValues, compileTemplate, dice, notes, emitted, journals, messages
} from "./foundry-shim.mjs";

const R = path.resolve(import.meta.dirname, "../../scripts");

let failed = 0, passed = 0;
const check = (cond, msg) => {
  if (cond) { passed++; }
  else { failed++; console.log("FAIL  " + msg); }
};
const section = (s) => console.log(`\n--- ${s} ---`);

/* Party */
const gandalf = makeActor({ id: "aaa1", name: "Gandalf", skills: { sur: 7, prc: 5, ste: 1 }, abilities: { wis: 4, con: 2 } });
const bilbo   = makeActor({ id: "bbb2", name: "Bilbo",   skills: { sur: 2, prc: 3, ste: 8 }, abilities: { wis: 1, con: 1 } });
const notMine = makeActor({ id: "ccc3", name: "Fremder", skills: { sur: 0 }, abilities: { wis: 0 }, owner: false });
setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });

const settings = await import(`${R}/settings.mjs`);
settings.registerSettings();

const state = await import(`${R}/state.mjs`);
const tasks = await import(`${R}/tasks.mjs`);
const moon  = await import(`${R}/moon.mjs`);
const app   = await import(`${R}/app.mjs`);

/* ------------------------------------------------------------------ */
section("settings registered");
check(settingValues.cycleLength === 30, "cycleLength default 30");
check(settingValues.slowMiles === 9 && settingValues.slowMod === 5, "slow pace 9 / +5");
check(settingValues.normalMiles === 10 && settingValues.normalMod === 0, "normal pace 10 / 0");
check(settingValues.fastMiles === 15 && settingValues.fastMod === -5, "fast pace 15 / -5");
check(settingValues.waterPerHead === 2, "water per head default 2");

/* ------------------------------------------------------------------ */
section("state basics");
let s = state.getState();
check(s.day === 1, "fresh state starts on day 1");
check(s.pace === "normal", "fresh state pace is normal");
check(Array.isArray(s.log) && s.log.length === 0, "fresh state log is an empty array");

await state.adjustDay(1);
check(state.getState().day === 2, "adjustDay(1) -> day 2");
await state.adjustDay(-5);
check(state.getState().day === 1, "day never drops below 1");
await state.setDay(12);
check(state.getState().day === 12, "setDay(12)");
await state.setDay("not a number");
check(state.getState().day === 1, "a junk day falls back to 1");
await state.setDay(4);

/* ------------------------------------------------------------------ */
section("tasks + party");
const list = tasks.getTasks();
check(list.length === 5, `default list has 5 tasks (got ${list.length})`);
check(list[0].id === "navigation", "navigation is first");
check(tasks.taskLabel(list[0]) === "Navigation", "navigation label resolves from lang");
check(tasks.taskHint(list[1]).includes("1W6"), "water hint resolves from lang");

const party = tasks.partyActors();
check(party.length === 2, `player-owned characters only (got ${party.length})`);
check(party[0].name === "Bilbo", "party sorted by name");
check(tasks.travelerCount() === 2, "traveler count derives from party");

check(tasks.resolveSkill("sur") === "sur", "resolveSkill by key");
check(tasks.resolveSkill("survival") === "sur", "resolveSkill by fullKey");
check(tasks.resolveSkill("Überleben") === "sur", "resolveSkill by localized label");
check(tasks.resolveSkill("nonsense") === null, "unknown skill resolves to null");
check(tasks.resolveAbility("wisdom") === "wis", "resolveAbility by fullKey");

check(tasks.modifierFor(gandalf, list[0]) === 7, "modifier read from skills.sur.total");
const abilityTask = { id: "x", ability: "wis", dc: 10 };
check(tasks.modifierFor(gandalf, abilityTask) === 4, "modifier read from abilities.wis.mod");

/* ------------------------------------------------------------------ */
section("assignment");
await state.assign(gandalf.id, "navigation");
await state.assign(bilbo.id, "water");
check(state.getState().assignments[gandalf.id] === "navigation", "gandalf navigates");
check(Object.keys(state.getState().assignments).length === 2, "two assignments");

// One task per actor: re-assigning replaces rather than adding.
await state.assign(gandalf.id, "food");
check(state.getState().assignments[gandalf.id] === "food", "re-assign replaces");
await state.assign(gandalf.id, "navigation");

/* ------------------------------------------------------------------ */
section("rolling through the dnd5e API");
gandalf.calls.length = 0;
dice.d20 = 15;                       // 15 + 7 = 22 vs DC 15 -> success
let record = await tasks.rollTask(gandalf, tasks.getTask("navigation"), {});
const call = gandalf.calls[0];
check(call.method === "rollSkill", "navigation goes through actor.rollSkill");
check(call.config.skill === "sur", "rollSkill was given skill 'sur'");
check(call.config.target === 15, "the DC was passed as the roll target");
check(call.config.pace === "normal", "the pace was handed to the system");
check(call.dialog.configure === true, "the dnd5e dialog is shown by default");
check(record.success === true, `success recorded (total ${record.total})`);
check(record.paceMod === 0, "normal pace contributes no modifier");

// Fast pace: -5 must reach the roll as a named term.
await state.setPace("fast");
gandalf.calls.length = 0;
record = await tasks.rollTask(gandalf, tasks.getTask("navigation"), {});
const fastCall = gandalf.calls[0];
check(fastCall.config.rolls?.[0]?.parts?.[0] === "@pace", "pace modifier is a named @pace term");
check(fastCall.config.rolls[0].data.pace === -5, "fast pace modifier is -5");
check(record.total === 15 + 7 - 5, `fast pace total is 17 (got ${record.total})`);
check(record.paceMod === -5, "paceMod stored on the record");

// A non-navigation task must NOT get the modifier.
bilbo.calls.length = 0;
const waterRecord = await tasks.rollTask(bilbo, tasks.getTask("water"), {});
check(!bilbo.calls[0].config.rolls, "water task gets no pace modifier");
check(waterRecord.success === true, "bilbo finds water (15+2 vs DC 10)");
check(waterRecord.yield?.total === 4 + 2, `yield is 1d6 + mod = 6 (got ${waterRecord.yield?.total})`);
check(messages.length > 0, "the yield went out as a chat message");

// A failure must produce no yield at all.
dice.d20 = 1;                        // 1 + 2 = 3 vs DC 10 -> failure
const failRecord = await tasks.rollTask(bilbo, tasks.getTask("water"), {});
check(failRecord.success === false, "a low roll fails");
check(!failRecord.yield, "a failed task yields nothing");

// A cancelled dialog must return null, not a zero.
const cancelling = makeActor({ id: "ddd4", name: "Abbrecher", skills: { sur: 0 }, abilities: { wis: 0 } });
cancelling.rollSkill = async () => [];
check((await tasks.rollTask(cancelling, tasks.getTask("navigation"), {})) === null,
  "a cancelled roll returns null");

await state.setPace("normal");

/* ------------------------------------------------------------------ */
section("distance");
await state.clearRolls();
dice.d20 = 15;
await state.recordRoll(gandalf.id, await tasks.rollTask(gandalf, tasks.getTask("navigation"), {}));
let sum = state.summarise();
check(sum.miles === 10, `success at normal pace -> 10 miles (got ${sum.miles})`);
check(sum.lost === false, "not lost on a success");

dice.d20 = 1;
await state.recordRoll(gandalf.id, await tasks.rollTask(gandalf, tasks.getTask("navigation"), {}));
sum = state.summarise();
check(sum.lost === true, "lost on a failure");
check(sum.miles === 5, `failure halves the distance (got ${sum.miles})`);

// Odd distance must round DOWN.
settingValues.normalMiles = 11;
await state.setPace("normal");
check(state.summarise().miles === 5, "11 miles halved rounds down to 5");
settingValues.normalMiles = 10;

// A re-roll overwrites rather than adding a second result.
dice.d20 = 18;
await state.recordRoll(gandalf.id, await tasks.rollTask(gandalf, tasks.getTask("navigation"), {}));
check(Object.keys(state.getState().rolls).length === 1, "re-roll overwrites the day's result");
check(state.summarise().lost === false, "re-roll flips the verdict back");

/* ------------------------------------------------------------------ */
section("yields add up across actors");
await state.clearRolls();
await state.assign(gandalf.id, "water");
await state.assign(bilbo.id, "water");
dice.d20 = 15;
await state.recordRoll(gandalf.id, await tasks.rollTask(gandalf, tasks.getTask("water"), {}));
await state.recordRoll(bilbo.id, await tasks.rollTask(bilbo, tasks.getTask("water"), {}));
// gandalf: 4 + 7 = 11, bilbo: 4 + 2 = 6  -> 17
check(state.summarise().water === 17, `two foragers stack (got ${state.summarise().water})`);

/* ------------------------------------------------------------------ */
section("supplies");
const instance = new app.AdventureTracker();
let ctx = await instance._prepareContext({});
check(ctx.supplies.travelers === 2, "two travellers");
check(ctx.supplies.need === 4, "2 travellers x 2 gallons = 4");
check(ctx.supplies.covered === true, "17 gallons covers a need of 4");

await state.clearRolls();
ctx = await instance._prepareContext({});
check(ctx.supplies.covered === false, "no water found -> not covered");
check(ctx.supplies.missing === 4, "shortfall is the full need");

// Rain alone is not enough; rain plus a collector is.
await state.setRain(true);
ctx = await instance._prepareContext({});
check(ctx.supplies.covered === false, "rain without a collector does not cover");
settingValues.rainCollector = true;
ctx = await instance._prepareContext({});
check(ctx.supplies.byRain === true, "rain + collector covers the need");
check(ctx.supplies.covered === true, "covered by rain");
settingValues.rainCollector = false;
await state.setRain(false);

/* ------------------------------------------------------------------ */
section("moon in context");
await state.setDay(1);
ctx = await instance._prepareContext({});
check(ctx.moon.label === "Vollmond", "day 1 is Vollmond");
check(ctx.moon.trend === "", "a full moon has no trend word");
check(ctx.moon.path.length > 0, "a full moon draws a path");
await state.setDay(8);
ctx = await instance._prepareContext({});
check(ctx.moon.trend === "abnehmend", "day 8 is abnehmend");
await state.setDay(24);
ctx = await instance._prepareContext({});
check(ctx.moon.trend === "zunehmend", "day 24 is zunehmend");
await state.setDay(16);
ctx = await instance._prepareContext({});
check(ctx.moon.path === "", "a new moon draws nothing lit");

/* ------------------------------------------------------------------ */
section("complete day + logbook");
await state.setDay(5);
await state.setPace("slow");
await state.assign(gandalf.id, "navigation");
dice.d20 = 15;
await state.recordRoll(gandalf.id, await tasks.rollTask(gandalf, tasks.getTask("navigation"), {}));
await state.completeDay();
s = state.getState();
check(s.day === 6, "completing day 5 advances to day 6");
check(s.log.length === 1, "one log entry written");
check(s.log[0].day === 5, "the entry is for day 5");
check(s.log[0].miles === 9, `slow pace logged 9 miles (got ${s.log[0].miles})`);
check(s.log[0].pace === "slow", "pace logged");
check(Object.keys(s.rolls).length === 0, "rolls cleared");
check(s.rain === false, "rain switch cleared");
check(s.assignments[gandalf.id] === "navigation", "assignments survive the day");

// The log must be a frozen record: retuning the pace cannot rewrite history.
settingValues.slowMiles = 99;
check(state.getState().log[0].miles === 9, "an old log entry is not rewritten by a settings change");
settingValues.slowMiles = 9;

// The cap must hold.
for (let i = 0; i < 40; i++) await state.completeDay();
check(state.getState().log.length === 30, `log capped at 30 (got ${state.getState().log.length})`);
check(state.getState().log[29].day > state.getState().log[0].day, "log kept in chronological order");

/* ------------------------------------------------------------------ */
section("custom tasks");
settingValues.customTasks = JSON.stringify([
  { id: "navigation", dc: 13 },
  { id: "rearguard", hidden: true },
  { id: "hunt", skill: "prc", dc: 14, label: "Jagen", yield: { formula: "1d6 + @mod", unit: "pounds" } }
]);
const custom = tasks.getTasks();
check(tasks.getTask("navigation").dc === 13, "a matching id overrides the default DC");
check(tasks.getTask("navigation").skill === "sur", "an override keeps the fields it does not mention");
check(tasks.getTask("rearguard") === null, "hidden:true removes a default");
check(tasks.getTask("hunt")?.dc === 14, "a new id is appended");
check(tasks.taskLabel(tasks.getTask("hunt")) === "Jagen", "an inline label is used verbatim");
check(tasks.taskHint(tasks.getTask("hunt")) === "", "a custom task with no hint shows nothing");
check(custom.length === 5, `5 tasks after +1 -1 (got ${custom.length})`);

// A single object, not an array, is a reasonable thing to write.
settingValues.customTasks = JSON.stringify({ id: "navigation", dc: 20 });
check(tasks.getTask("navigation").dc === 20, "a bare object is accepted");

// Broken JSON must warn once and fall back, never throw.
notes.length = 0;
const realWarn = console.warn; console.warn = () => {};
settingValues.customTasks = "{ this is not json";
const fallback = tasks.getTasks();
check(fallback.length === 5, "broken JSON falls back to the default list");
check(notes.filter(n => n[0] === "warn").length === 1, "broken JSON warns exactly once");
tasks.getTasks(); tasks.getTasks();
check(notes.filter(n => n[0] === "warn").length === 1, "...and not once per render");
console.warn = realWarn;

// An entry that names nothing rollable must be dropped, not rendered.
settingValues.customTasks = JSON.stringify([{ id: "broken", dc: 10 }]);
check(!tasks.getTask("broken"), "a task with no skill or ability is dropped");
settingValues.customTasks = "";

/* ------------------------------------------------------------------ */
section("group actor source");
const group = {
  id: "grp1", name: "Die Gefährten", type: "group", uuid: "Actor.grp1",
  system: { members: [{ actor: gandalf }, { actor: notMine }] }
};
const actorList = game.actors;
actorList.push(group);
settingValues.partySource = "group";
settingValues.groupActor = "Die Gefährten";
check(tasks.partyActors().length === 2, "group members are used, player-owned or not");
check(tasks.partyActors().some(a => a.id === notMine.id), "a GM-owned member still travels");
settingValues.groupActor = "grp1";
check(tasks.partyActors().length === 2, "a group can be named by id");
notes.length = 0;
settingValues.groupActor = "does not exist";
check(tasks.partyActors().length === 2, "a missing group falls back to player characters");
settingValues.partySource = "players";

/* ------------------------------------------------------------------ */
section("permissions");
check(tasks.canControl(gandalf) === true, "GM controls an owned actor");
check(tasks.canControl(notMine) === true, "GM controls everything");
setupGame({ actors: [gandalf, bilbo, notMine], isGM: false });
check(tasks.canControl(gandalf) === true, "a player controls their own character");
check(tasks.canControl(notMine) === false, "a player does not control somebody else's");
check(state.isWriter() === false, "a player is not the writer");
const before = JSON.stringify(state.getState());
await state.setDay(999);
check(JSON.stringify(state.getState()) === before, "a player's direct write is refused");

const socket = await import(`${R}/socket.mjs`);
emitted.length = 0;
// With no GM connected at all, the request must be refused rather than dropped.
setupGame({ actors: [gandalf, bilbo, notMine], isGM: false, gmOnline: false });
notes.length = 0;
check(socket.requestAssign(gandalf.id, "water") === false, "with no GM online the request is refused");
check(notes.some(n => n[0] === "warn"), "...and the player is told why");
check(emitted.length === 0, "...and nothing is emitted");

setupGame({ actors: [gandalf, bilbo, notMine], isGM: false, gmOnline: true });
emitted.length = 0;
socket.requestAssign(gandalf.id, "water");
check(emitted.length === 1, "a player's assignment goes over the socket");
check(emitted[0][1].action === "assign", "...as an 'assign' request");
check(emitted[0][1].userId === "user1", "...carrying the sender's id");
setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });

/* ------------------------------------------------------------------ */
section("template renders");
const template = compileTemplate();
// GM view, a full day in progress. Day 8 has a visible crescent; the new moon
// draws no lit path at all, which is correct and would make this assertion lie.
await state.setDay(8);
await state.assign(gandalf.id, "navigation");
await state.assign(bilbo.id, "water");
dice.d20 = 15;
await state.recordRoll(gandalf.id, await tasks.rollTask(gandalf, tasks.getTask("navigation"), {}));
ctx = await instance._prepareContext({});
let html = template(ctx);
check(html.includes("Gandalf") && html.includes("Bilbo"), "both travellers render");
check(html.includes("toa-moon-lit"), "the moon path renders");
check(html.includes("data-action=\"completeDay\""), "the GM sees the complete-day button");
check(html.includes("toa-result"), "a stored result renders");
check(html.includes("toa-member-hint"), "the chosen task's description renders on the row");
check(html.includes("Hält die Gruppe auf Kurs"), "...and it is the real description text");
check(/<option[^>]+title="[^"]+"/.test(html), "task descriptions ride along on the options");
check(!/\{\{|\}\}/.test(html), "no unrendered handlebars left in the output");
check(!/undefined|\[object Object\]/.test(html), "no undefined / [object Object] in the output");
const visible = (h) => h.replace(/data-tooltip="[^"]*"/g, "").replace(/<[^>]+>/g, " ");
check(!/toa-adventure-tracker\.[a-z]/i.test(visible(html)), "no raw i18n key leaked into visible text");

// Player view: no day controls, no export.
setupGame({ actors: [gandalf, bilbo, notMine], isGM: false });
const playerCtx = await instance._prepareContext({});
const playerHtml = template(playerCtx);
check(!playerHtml.includes("data-action=\"completeDay\""), "a player sees no complete-day button");
check(!playerHtml.includes("data-action=\"exportLog\""), "a player sees no export button");
check(playerHtml.includes("data-day-static") || playerHtml.includes("toa-day-static"),
  "a player sees the day as static text");
check(playerHtml.includes("Gandalf"), "a player still sees the whole party");
check(!/\{\{|\}\}/.test(playerHtml), "player view renders cleanly");
check(!/toa-adventure-tracker\.[a-z]/i.test(visible(playerHtml)), "player view leaks no i18n key");
setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });

// Empty world: nobody owns a character, so there is genuinely no party.
setupGame({ actors: [notMine], isGM: true });
const emptyCtx = await instance._prepareContext({});
const emptyHtml = template(emptyCtx);
check(emptyHtml.includes("Keine Reisenden"), "an empty party renders its notice");
check(!/\{\{|\}\}/.test(emptyHtml), "empty view renders cleanly");
check(!/undefined/.test(emptyHtml), "empty view has no undefined");
check(emptyCtx.supplies.travelers === 0, "an empty party means zero travellers");
setupGame({ actors: [gandalf, bilbo, notMine], isGM: true });

/* ------------------------------------------------------------------ */
section("journal export");
journals.length = 0;
await app.AdventureTracker.prototype.constructor;
// Call the private-ish action through the class the way ApplicationV2 would.
const exportAction = Object.getOwnPropertyDescriptor(app.AdventureTracker, "DEFAULT_OPTIONS").value.actions.exportLog;
await exportAction.call(instance);
check(journals.length === 1, "export wrote one journal entry");
check(journals[0].pages[0].text.content.includes("<table>"), "the journal contains the log table");
check(!journals[0].pages[0].text.content.includes("undefined"), "no undefined in the exported table");

/* ------------------------------------------------------------------ */
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
