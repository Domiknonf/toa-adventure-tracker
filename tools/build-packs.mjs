#!/usr/bin/env node
/**
 * Build the LevelDB compendium packs from packs/_source/*.json.
 *
 * Foundry v13 stores packs as LevelDB directories, which are binary and must not
 * be hand-edited - so the JSON under packs/_source is the source of truth and
 * this script is how it becomes a pack:
 *
 *   npm install           (once, for classic-level)
 *   node tools/build-packs.mjs
 *
 * Keys are "!<documentType>!<id>", which is the layout Foundry's own pack format
 * uses. Rebuilding is destructive on purpose: the pack directory is regenerated
 * from scratch so a renamed or deleted source file cannot leave a ghost behind.
 */
import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";

const SOURCE = "packs/_source";
const TARGET = "packs/toa-macros";
const TYPE = "macros";

fs.rmSync(TARGET, { recursive: true, force: true });
fs.mkdirSync(TARGET, { recursive: true });

const db = new ClassicLevel(TARGET, { valueEncoding: "json" });
await db.open();

let count = 0;
for (const file of fs.readdirSync(SOURCE).filter(f => f.endsWith(".json"))) {
  const doc = JSON.parse(fs.readFileSync(path.join(SOURCE, file), "utf8"));
  if (!doc._id) throw new Error(`${file}: document has no _id`);
  // Foundry ids are exactly 16 characters; a shorter one is accepted on import
  // and then collides in ways that are painful to trace back here.
  if (doc._id.length !== 16) throw new Error(`${file}: _id must be 16 characters, got ${doc._id.length}`);
  await db.put(`!${TYPE}!${doc._id}`, doc);
  count++;
}

await db.close();
console.log(`built ${TARGET} (${count} document${count === 1 ? "" : "s"})`);
