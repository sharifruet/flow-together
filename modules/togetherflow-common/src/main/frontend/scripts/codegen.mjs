#!/usr/bin/env node
/**
 * Generates TypeScript types from the OpenAPI/Swagger specs this repo already
 * publishes under docs/public-api (IMPLEMENTATION_PLAN.md, Phase 0).
 *
 * The generated files are the source of truth for the engine's REST contract.
 * They are NOT imported directly by app code — src/api/types.ts holds a small
 * curated view of the handful of shapes this UI actually uses, and
 * src/api/contract.test-d.ts fails typechecking if the two drift apart.
 * That keeps call sites readable while still catching a breaking engine change.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../../..");
const specsRoot = resolve(repoRoot, "docs/public-api/references");
const outDir = resolve(here, "../src/api/generated");

/**
 * spec file -> [module name, needs Swagger 2.0 -> OpenAPI 3 conversion].
 * Only the process and decision specs are published as OpenAPI 3 today; the rest
 * are still Swagger 2.0, which openapi-typescript refuses, so they are converted
 * in a temp file first rather than being left ungenerated.
 */
const SPECS = [
  ["openapi/process/flowable-oas-process.yaml", "process", false],
  ["openapi/decision/flowable-oas-decision.yaml", "decision", false],
  // Hand-authored rather than generated from the engine's annotations — see the
  // spec's own preamble and REQUIREMENTS.md §8.
  ["openapi/idm/flowable-oas-idm.yaml", "idm", false],
  ["swagger/cmmn/flowable-swagger-cmmn.yaml", "cmmn", true],
  ["swagger/app/flowable-swagger-app.yaml", "app", true],
  ["swagger/eventregistry/flowable-swagger-eventregistry.yaml", "eventregistry", true],
];

mkdirSync(outDir, { recursive: true });

let failures = 0;
const scratch = resolve(tmpdir(), "togetherflow-codegen");
mkdirSync(scratch, { recursive: true });

for (const [relSpec, name, needsConversion] of SPECS) {
  const spec = resolve(specsRoot, relSpec);
  if (!existsSync(spec)) {
    console.error(`✗ ${name}: spec not found at ${spec}`);
    failures++;
    continue;
  }

  let source = spec;
  try {
    if (needsConversion) {
      source = resolve(scratch, `${name}-oas3.json`);
      execFileSync("npx", ["swagger2openapi", spec, "-o", source], { stdio: "pipe" });
    }
    execFileSync("npx", ["openapi-typescript", source, "-o", resolve(outDir, `${name}.ts`)], {
      stdio: "inherit",
    });
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}: ${error.message?.split("\n")[0] ?? "generation failed"}`);
    failures++;
  }
}

rmSync(scratch, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\n${failures} spec(s) failed to generate.`);
  process.exit(1);
}
console.log("\nGenerated types are checked in; commit them so CI can detect contract drift.");
