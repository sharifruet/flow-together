#!/usr/bin/env node
/**
 * Bundle-size budgets, enforced (REQUIREMENTS.md §13.5: "Bundle-size budgets enforced in
 * CI (regressions fail the build, not just get noticed later)").
 *
 * Reads the built `dist/` and compares the gzipped size of each entry against the
 * budgets checked in beside the app as `bundle-budget.json`. Gzipped rather than raw,
 * because that is what actually crosses the network.
 *
 * Run from an app's frontend directory, after `npm run build`:
 *   node node_modules/@togetherflow/common/scripts/bundle-budget.mjs
 *
 * Budgets are per *named group*, not per file: Vite fingerprints filenames, so a budget
 * pinned to `index-a1b2c3.js` would silently stop matching on the next build. Each group
 * is a prefix, and every chunk matching it is summed.
 */

import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const cwd = process.cwd();
const distDir = resolve(cwd, "dist");
const budgetFile = resolve(cwd, "bundle-budget.json");

if (!existsSync(distDir)) {
  console.error("✗ No dist/ — run `npm run build` first.");
  process.exit(1);
}
if (!existsSync(budgetFile)) {
  console.error(`✗ No bundle-budget.json in ${cwd}.`);
  process.exit(1);
}

/** @type {{groups: Record<string, number>, totalKb?: number}} */
const budget = JSON.parse(readFileSync(budgetFile, "utf8"));

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const assets = walk(distDir)
  .filter((file) => file.endsWith(".js") || file.endsWith(".css"))
  .map((file) => ({
    file,
    name: file.slice(distDir.length + 1),
    gzipKb: gzipSync(readFileSync(file)).byteLength / 1024,
  }));

let failed = false;

for (const [group, limitKb] of Object.entries(budget.groups)) {
  // "assets/index" matches assets/index-a1b2c3.js and its sibling CSS.
  const matched = assets.filter((asset) => asset.name.includes(group));
  const sizeKb = matched.reduce((sum, asset) => sum + asset.gzipKb, 0);

  if (matched.length === 0) {
    // A budget for something that no longer exists is stale, and a stale budget is
    // indistinguishable from a passing one — so it fails rather than being ignored.
    console.error(`✗ ${group}: no matching chunk in dist/. Remove or rename the budget.`);
    failed = true;
    continue;
  }

  const verdict = sizeKb <= limitKb ? "✓" : "✗";
  console.log(
    `${verdict} ${group}: ${sizeKb.toFixed(1)} kB gzipped (budget ${limitKb} kB, ${matched.length} chunk${matched.length === 1 ? "" : "s"})`,
  );
  if (sizeKb > limitKb) failed = true;
}

if (budget.totalKb !== undefined) {
  const allKb = assets.reduce((sum, asset) => sum + asset.gzipKb, 0);
  const verdict = allKb <= budget.totalKb ? "✓" : "✗";
  console.log(`${verdict} total: ${allKb.toFixed(1)} kB gzipped (budget ${budget.totalKb} kB)`);
  if (allKb > budget.totalKb) failed = true;
}

if (failed) {
  console.error(
    "\nBundle budget exceeded. Either the growth is justified — in which case raise the\n" +
      "budget in bundle-budget.json in the same commit, so the increase is reviewed — or it\n" +
      "is an accidental dependency pulled into a chunk that should not carry it.",
  );
  process.exit(1);
}
console.log("\nAll bundle budgets met.");
