import path from "node:path";
// Minimal Foundry shim: moon.mjs only ever reaches game.settings.get.
const values = { cycleLength: 30, fullMoonDay: 1 };
globalThis.game = { settings: { get: (_m, k) => values[k] } };
globalThis.Hooks = { callAll() {} };

const { moonFor } = await import(path.resolve(import.meta.dirname, "../../scripts/moon.mjs"));

console.log("day  pos    phase            %    waxing  cycleDay");
for (const day of [1, 4, 8, 12, 15, 16, 19, 23, 27, 30, 31, 46]) {
  const m = moonFor(day);
  console.log(
    String(day).padEnd(5),
    m.position.toFixed(3).padEnd(6),
    m.phase.padEnd(16),
    String(m.percent).padEnd(4),
    String(m.waxing).padEnd(7),
    m.cycleDay
  );
}

// Invariants that must hold, whatever the table says.
const fail = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); };

check(moonFor(1).percent === 100, "day 1 must be full moon (100%)");
check(moonFor(1).phase === "full", "day 1 phase must be 'full'");
check(moonFor(31).percent === 100, "day 31 must wrap back to full moon");
check(moonFor(16).phase === "new", "day 16 must be new moon");
check(moonFor(16).percent === 0, "day 16 must be 0% lit");
// Waning across the first half, waxing across the second.
for (let d = 2; d <= 15; d++) check(moonFor(d).waxing === false, `day ${d} must be waning`);
for (let d = 17; d <= 30; d++) check(moonFor(d).waxing === true, `day ${d} must be waxing`);
// Illumination falls monotonically to the new moon, then rises.
for (let d = 2; d <= 16; d++) {
  check(moonFor(d).illumination <= moonFor(d - 1).illumination, `illumination must fall at day ${d}`);
}
for (let d = 18; d <= 31; d++) {
  check(moonFor(d).illumination >= moonFor(d - 1).illumination, `illumination must rise at day ${d}`);
}
// Every day of the cycle must land in a band and produce a drawable path.
for (let d = 1; d <= 120; d++) {
  const m = moonFor(d);
  check(!!m.phase, `day ${d} has no phase`);
  check(typeof m.path === "string", `day ${d} has no path`);
  check(Number.isFinite(m.illumination), `day ${d} illumination is not finite`);
  check(!/NaN|undefined/.test(m.path), `day ${d} path contains NaN/undefined: ${m.path}`);
}
// Symmetry: equal distance either side of new moon is equally lit.
for (let k = 1; k <= 7; k++) {
  const a = moonFor(16 - k).percent, b = moonFor(16 + k).percent;
  check(a === b, `symmetry broken at +/-${k}: ${a} vs ${b}`);
}
// A shifted anchor must move the full moon with it, without going negative.
values.fullMoonDay = 20;
check(moonFor(20).percent === 100, "with fullMoonDay=20, day 20 must be full");
check(moonFor(1).position >= 0 && moonFor(1).position < 1, "position must stay in [0,1) before the anchor");
values.fullMoonDay = 1;
// A short cycle must still work end to end.
values.cycleLength = 8;
for (let d = 1; d <= 8; d++) check(Number.isFinite(moonFor(d).illumination), `short cycle day ${d}`);
check(moonFor(1).percent === 100, "short cycle day 1 full");
values.cycleLength = 30;

console.log(fail.length ? "\nFAILURES:\n" + fail.join("\n") : "\nall moon invariants hold");
process.exit(fail.length ? 1 : 0);
