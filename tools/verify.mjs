#!/usr/bin/env node
/**
 * The checks `node --check` cannot see, every one of which is a mistake that is
 * invisible in the source and obvious only in a running world. Run from the repo
 * root:
 *
 *   node tools/verify.mjs
 *
 * It reads files and never writes any, so it is safe to run at any time. It does
 * NOT replace opening the module in Foundry - it catches the class of error that
 * costs a reload to find.
 */
import fs from "node:fs";
import path from "node:path";

const MODULE_ID = "toa-adventure-tracker";
const PREFIX = `${MODULE_ID}.`;

let bad = 0;
const fail = (msg) => { console.log("FAIL  " + msg); bad++; };
const ok = (msg) => console.log("ok    " + msg);

const scripts = fs.readdirSync("scripts").filter(f => f.endsWith(".mjs"));
const templates = fs.readdirSync("templates").filter(f => f.endsWith(".hbs"));

/* 1. IMPORT CYCLES. ESM tolerates some, but a cycle in a Foundry module does not
      announce itself: it resolves to a half-initialised binding, and the symptom
      is a window that renders once and then silently stops. This file exists
      largely because settings.mjs -> app.mjs -> state.mjs -> settings.mjs was a
      real cycle during development (see REFRESH_HOOK). */
const graph = {};
for (const f of scripts) {
  const src = fs.readFileSync(path.join("scripts", f), "utf8");
  graph[f] = [...src.matchAll(/from\s+"\.\/([\w.-]+\.mjs)"/g)].map(m => m[1]);
}
const state = {};
const walk = (node, stack) => {
  if (state[node] === "done") return;
  if (state[node] === "open") return fail(`import cycle: ${[...stack, node].join(" -> ")}`);
  state[node] = "open";
  for (const dep of graph[node] ?? []) {
    if (!graph[dep]) fail(`${node} imports missing file ${dep}`);
    else walk(dep, [...stack, node]);
  }
  state[node] = "done";
};
for (const node of Object.keys(graph)) walk(node, []);
if (!bad) ok(`import graph acyclic (${Object.keys(graph).length} modules)`);

/* 2. EVERY PARTS TEMPLATE RENDERS EXACTLY ONE ROOT ELEMENT. Counted with a depth
      counter rather than by balancing tags: two siblings and zero roots both
      throw "Template part ... must render a single HTML element", and the
      application then never appears at all. */
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "source", "track", "wbr"]);
for (const file of templates) {
  const src = fs.readFileSync(path.join("templates", file), "utf8")
    .replace(/\{\{![\s\S]*?\}\}/g, "");   // handlebars comments may contain markup
  let depth = 0;
  let roots = 0;
  for (const m of src.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
    const [, closing, tag, attrs, selfClosing] = m;
    if (closing) { depth--; continue; }
    if (depth === 0) roots++;
    if (!VOID_TAGS.has(tag.toLowerCase()) && !selfClosing && !attrs.endsWith("/")) depth++;
  }
  if (roots === 1) ok(`${file}: exactly one root element`);
  else fail(`${file}: ${roots} root elements (must be exactly 1)`);
}

/* 3. EVERY data-action HAS A HANDLER. A button wired to nothing looks completely
      normal and simply does nothing when clicked. */
const handlers = new Set();
for (const file of scripts) {
  const src = fs.readFileSync(path.join("scripts", file), "utf8");
  const block = src.match(/actions:\s*\{([\s\S]*?)\n\s{4}\}/);
  if (block) for (const m of block[1].matchAll(/^\s*(\w+):/gm)) handlers.add(m[1]);
}
let unhandled = 0;
for (const file of templates) {
  const src = fs.readFileSync(path.join("templates", file), "utf8");
  for (const m of src.matchAll(/data-action="([\w-]+)"/g)) {
    if (!handlers.has(m[1])) { fail(`${file}: data-action="${m[1]}" has no handler`); unhandled++; }
  }
}
if (!unhandled) ok(`every data-action has a handler (${handlers.size} declared)`);

/* 4. NO i18n KEY IS BOTH A LEAF AND A BRANCH. Foundry expands the dotted keys into
      a nested object, so shipping "x.roll" AND "x.roll.hint" asks one key to be a
      string and an object at once - which takes down the WHOLE translation table,
      not just that key. JSON.parse cannot see it. */
const langs = fs.readdirSync("lang").filter(f => f.endsWith(".json"));
const tables = {};
for (const file of langs) {
  const table = JSON.parse(fs.readFileSync(path.join("lang", file), "utf8"));
  tables[file] = table;
  const keys = Object.keys(table);
  let shadowed = 0;
  for (const key of keys) {
    const branch = keys.find(other => other !== key && other.startsWith(key + "."));
    if (branch) { fail(`${file}: key is both leaf and branch: "${key}" vs "${branch}"`); shadowed++; }
  }
  if (!shadowed) ok(`${file}: no key shadows another (${keys.length} keys)`);
}

/* 5. EVERY LANGUAGE HAS THE SAME KEYS. A key present in one file and missing in
      another shows the raw key path to half the table and nobody else. */
const [reference, ...others] = langs;
for (const file of others) {
  const missing = Object.keys(tables[reference]).filter(k => !(k in tables[file]));
  const extra = Object.keys(tables[file]).filter(k => !(k in tables[reference]));
  for (const key of missing) fail(`${file}: missing key "${key}" (present in ${reference})`);
  for (const key of extra) fail(`${file}: extra key "${key}" (absent from ${reference})`);
  if (!missing.length && !extra.length) ok(`${file}: same key set as ${reference}`);
}

/* 6. EVERY STATICALLY REFERENCED i18n KEY EXISTS. Interpolated keys - the
      `${MODULE_ID}.task.${task.id}.label` family - cannot be checked here and are
      skipped on purpose; they are exactly the ones that fall back gracefully. */
const known = new Set(Object.keys(tables[reference]));
let missingKeys = 0;
for (const dir of ["scripts", "templates"]) {
  for (const file of fs.readdirSync(dir)) {
    // Hook names are built from MODULE_ID exactly like i18n keys are, and are not
    // translation keys at all - so the lines that declare one are dropped before
    // scanning rather than each being special-cased downstream.
    const src = fs.readFileSync(path.join(dir, file), "utf8")
      .replace(/^.*\b\w+_HOOK\s*=.*$/gm, "");
    const seen = new Set();
    for (const m of src.matchAll(/`\$\{MODULE_ID\}\.([\w.]+)`/g)) seen.add(PREFIX + m[1]);
    for (const m of src.matchAll(/"(toa-adventure-tracker\.[\w.]+)"/g)) seen.add(m[1]);
    for (const key of seen) {
      if (!known.has(key)) { fail(`${dir}/${file}: i18n key "${key}" is not in lang/${reference}`); missingKeys++; }
    }
  }
}
if (!missingKeys) ok("every statically referenced i18n key exists");

/* 7. THE MANIFEST POINTS AT FILES THAT EXIST. A typo'd path is a module that
      loads with no styles, no language and no obvious reason why. */
const manifest = JSON.parse(fs.readFileSync("module.json", "utf8"));
let missingFiles = 0;
const needFile = (p, what) => {
  if (!fs.existsSync(p)) { fail(`module.json: ${what} "${p}" does not exist`); missingFiles++; }
};
for (const p of manifest.esmodules ?? []) needFile(p, "esmodule");
for (const p of manifest.styles ?? []) needFile(p, "style");
for (const l of manifest.languages ?? []) needFile(l.path, "language");
for (const pack of manifest.packs ?? []) needFile(pack.path, "pack");
if (manifest.id !== MODULE_ID) fail(`module.json: id is "${manifest.id}", expected "${MODULE_ID}"`);
if (!missingFiles) ok(`module.json: every referenced path exists`);

/* 8. TEMPLATES REFERENCED FROM PARTS EXIST, and every template on disk is used.
      An unreferenced template is usually a rename that only got done halfway. */
const referenced = new Set();
for (const file of scripts) {
  const src = fs.readFileSync(path.join("scripts", file), "utf8");
  for (const m of src.matchAll(/templates\/([\w.-]+\.hbs)/g)) referenced.add(m[1]);
}
for (const t of referenced) {
  if (!templates.includes(t)) fail(`scripts reference templates/${t}, which does not exist`);
}
for (const t of templates) {
  if (!referenced.has(t)) fail(`templates/${t} is never referenced from scripts`);
}
if (referenced.size === templates.length) ok(`templates all referenced (${templates.length})`);

/* 9. EVERY DEFAULT ROLE HAS A LABEL. A role whose label key is missing renders
      its own key path into the dropdown - legible enough to ship by accident and
      wrong enough to notice at the table. */
const constSrc = fs.readFileSync("scripts/const.mjs", "utf8");
const roleIds = [...constSrc.matchAll(/^\s{4}id:\s*"([\w-]+)",\n\s{4}skill:/gm)].map(m => m[1]);
let missingLabels = 0;
for (const id of roleIds) {
  if (!known.has(`${PREFIX}role.${id}.label`)) {
    fail(`default role "${id}" has no label key (${PREFIX}role.${id}.label)`);
    missingLabels++;
  }
}
if (!missingLabels) ok(`every default role has a label (${roleIds.length} roles)`);

/* 10. EVERY EVENT HAS A NAME AND A TEXT, IN EVERY LANGUAGE. The compilation is
       the module's actual content: an event that fires with no prose prints its
       own key into the day report, in front of the table. Checked against every
       language file rather than the reference one, because a German-only event
       is exactly the mistake this module is shaped to make. */
const eventIds = [...constSrc.matchAll(/\{ id: "(\w+)",\s+category:/g)].map(m => m[1]);
let missingEvents = 0;
for (const file of langs) {
  const table = tables[file];
  for (const id of eventIds) {
    for (const suffix of ["eventName", "event"]) {
      const key = `${PREFIX}${suffix}.${id}`;
      if (!(key in table)) { fail(`${file}: event "${id}" has no ${suffix} ("${key}")`); missingEvents++; }
    }
  }
}
if (!missingEvents) ok(`every event has a name and text in all languages (${eventIds.length} events)`);

/* 11. NO ORPHAN EVENT PROSE. A text whose event was renamed or dropped is dead
       weight that reads as coverage - it makes check 10 look satisfied while the
       real entry goes unwritten. */
const knownEventIds = new Set(eventIds);

/* 12. EVERY FOE HAS A NAME, IN EVERY LANGUAGE. Same reasoning as the event
       prose: an encounter suggestion with no name prints its own key next to
       the challenge rating, in front of the table. */
const foeKeys = [...new Set([...constSrc.matchAll(/foe:\s*\{\s*key:\s*"(\w+)"/g)].map(m => m[1]))];
let missingFoes = 0;
for (const file of langs) {
  for (const key of foeKeys) {
    const full = `${PREFIX}foe.${key}`;
    if (!(full in tables[file])) { fail(`${file}: foe "${key}" has no name ("${full}")`); missingFoes++; }
  }
}
if (!missingFoes) ok(`every foe has a name in all languages (${foeKeys.length} foes)`);

/* 13. EVERY FOE'S CHALLENGE RATING IS ONE THE XP TABLE KNOWS. A CR with no XP
       value silently produces no suggestion at all - the event just loses its
       encounter line, which reads as "this one is not a fight" rather than as a
       typo. */
const crValues = [...constSrc.matchAll(/foe:\s*\{[^}]*cr:\s*"([^"]+)"/g)].map(m => m[1]);
const crTable = constSrc.match(/export const CR_XP = \{([\s\S]*?)\};/)?.[1] ?? "";
const knownCRs = new Set([...crTable.matchAll(/"([^"]+)":/g)].map(m => m[1]));
let badCR = 0;
for (const cr of new Set(crValues)) {
  if (!knownCRs.has(cr)) { fail(`foe challenge rating "${cr}" is not in CR_XP`); badCR++; }
}
if (!badCR) ok(`every foe CR is in the XP table (${new Set(crValues).size} ratings)`);

/* 14. EVERY TRAVEL MODE CAN ACTUALLY DRAW EVERY CATEGORY IT USES.
       A mode whose terrain pool has no "lost" event produces a lost day with no
       explanation - the hex count drops to zero and the report says nothing
       about why. That failure is invisible in the source and only shows up on
       the one day in three that the navigator misses, so it is checked here.

       `pursuit` is exempt for modes with no rearguard: the engine never asks
       for it, because a role the mode does not offer cannot fail. */
const modeBlock = constSrc.match(/export const TRAVEL_MODES = \{([\s\S]*?)\n\};/)?.[1] ?? "";
const modes = {};
for (const m of modeBlock.matchAll(/^\s{2}(\w+):\s*\{/gm)) {
  const name = m[1];
  const rest = modeBlock.slice(m.index);
  const terrains = rest.match(/terrains:\s*\[([^\]]*)\]/)?.[1] ?? "";
  const roleList = rest.match(/roles:\s*\[([^\]]*)\]/)?.[1] ?? "";
  modes[name] = {
    terrains: [...terrains.matchAll(/"(\w+)"/g)].map(x => x[1]),
    roles: [...roleList.matchAll(/"(\w+)"/g)].map(x => x[1])
  };
}

const eventBlock = constSrc.match(/export const EVENTS = \[([\s\S]*?)\n\];/)?.[1] ?? "";
const eventRows = eventBlock.split("\n").filter(l => l.includes("{ id:")).map(line => ({
  id: line.match(/id:\s*"(\w+)"/)?.[1],
  category: line.match(/category:\s*"(\w+)"/)?.[1],
  terrain: line.match(/terrain:\s*"(\w+)"/)?.[1] ?? "land"
}));

const USED_CATEGORIES = ["ambush", "encounter", "lost", "detour", "foul",
  "thirst", "hunger", "camp", "storm", "boon"];
let deadPools = 0;
for (const [name, mode] of Object.entries(modes)) {
  const needed = [...USED_CATEGORIES];
  if (mode.roles.includes("rearguard")) needed.push("pursuit");
  for (const category of needed) {
    const available = eventRows.filter(e =>
      e.category === category && (e.terrain === "any" || mode.terrains.includes(e.terrain)));
    if (!available.length) {
      fail(`travel mode "${name}" has no "${category}" event it can draw`);
      deadPools++;
    }
  }
}
if (!deadPools) ok(`every travel mode can draw every category it uses (${Object.keys(modes).length} modes)`);

/* 15. EVERY ROLE A MODE OFFERS ACTUALLY EXISTS. A typo here silently removes a
       role from that mode rather than erroring - the dropdown is simply one
       entry shorter and nobody notices which. */
const defaultRoleIds = new Set(roleIds);
let badRoles = 0;
for (const [name, mode] of Object.entries(modes)) {
  for (const role of mode.roles) {
    if (!defaultRoleIds.has(role)) { fail(`travel mode "${name}" offers unknown role "${role}"`); badRoles++; }
  }
}
if (!badRoles) ok("every mode's roles exist");

/* 16. EVERY EVENT TERRAIN IS ONE SOME MODE CAN REACH. A misspelled terrain
       makes an event unreachable in every mode - it is in the table, it has
       prose, and it can never fire. */
const reachable = new Set(["any", ...Object.values(modes).flatMap(m => m.terrains)]);
let unreachable = 0;
for (const terrain of new Set(eventRows.map(e => e.terrain))) {
  if (!reachable.has(terrain)) { fail(`no travel mode can reach terrain "${terrain}"`); unreachable++; }
}
if (!unreachable) ok(`every event terrain is reachable (${[...new Set(eventRows.map(e => e.terrain))].join(", ")})`);

let orphans = 0;
for (const key of Object.keys(tables[reference])) {
  const match = key.match(/^toa-adventure-tracker\.event\.(\w+)$/);
  if (match && !knownEventIds.has(match[1])) { fail(`orphan event text: "${key}"`); orphans++; }
}
if (!orphans) ok("no orphan event prose");

console.log(bad ? `\n${bad} problem(s)` : "\nall checks passed");
process.exit(bad ? 1 : 0);
