/**
 * Does what this serialiser produces pass the CMMN 1.1 schema?
 *
 * This is not a paraphrase of round-trip fidelity. A deployment validates the document
 * against `CMMN11.xsd` **before** the parser or `CaseValidator` ever see it, and that gate
 * is stricter than either: this editor has already shipped `<serviceTask>` (the schema
 * defines `<task>`), `<completionNeutralRule>` (in no schema at all), an `eventType`
 * attribute in the CMMN namespace (`anyAttribute` there is `##other`), and item-control
 * rules in the wrong order (the sequence is repetition, required, manualActivation). Every
 * one of those parsed fine and could not be deployed.
 *
 * So the check is the real schema, run by `xmllint` over documents this code produced.
 * There is no skip-if-missing path: a check that quietly does not run is how all four of
 * those reached a deploy in the first place. CI installs `libxml2-utils` for this.
 */

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createElement, emptyCase, parseCmmn, serialiseCmmn } from "./cmmnModel";
import { kitchenSink } from "./kitchenSink";

const REPO = resolve(__dirname, "../../../../../../../..");
const XSD = resolve(
  REPO,
  "modules/flowable-cmmn-converter/src/main/resources/org/flowable/impl/cmmn/parser/CMMN11.xsd",
);

const WORK = mkdtempSync(join(tmpdir(), "tf-cmmn-schema-"));

/** The schema's verdict on one document, or "" when it validates. */
function schemaErrors(xml: string, name: string): string {
  const file = join(WORK, `${name}.cmmn`);
  writeFileSync(file, xml);
  try {
    execFileSync("xmllint", ["--noout", "--schema", XSD, file], { stdio: "pipe" });
    return "";
  } catch (cause) {
    const failure = cause as { stderr?: Buffer; code?: string };
    if (failure.code === "ENOENT") {
      throw new Error(
        "xmllint is not installed, so the schema was never checked. Install libxml2-utils.",
        { cause },
      );
    }
    return (failure.stderr?.toString() ?? "").trim();
  }
}

describe("CMMN schema validity", () => {
  it("accepts a case using every element type and every authorable feature", () => {
    expect(schemaErrors(serialiseCmmn(kitchenSink()), "kitchen-sink")).toBe("");
  });

  it("accepts the plainest possible case", () => {
    const base = emptyCase("minimal", "Minimal");
    const task = createElement("humanTask", { x: 100, y: 100 }, base.planModelId);
    expect(schemaErrors(serialiseCmmn({ ...base, elements: [task] }), "minimal")).toBe("");
  });

  /*
   * Re-serialising an existing file has to stay deployable too. Round-trip fidelity says
   * nothing was lost; this says what came out is still a legal document — the two fail
   * independently, as `<serviceTask>` did.
   */
  it.each([
    "examples/employee-onboarding.cmmn",
    "modules/flowable-spring-boot/flowable-spring-boot-samples/flowable-spring-boot-sample-starter/src/main/resources/stageAfterTimer.cmmn",
    "modules/flowable-app-rest/src/test/resources/caseWithProcessTask.cmmn",
    "modules/flowable-app-rest/src/test/resources/oneHumanTaskCase.cmmn",
  ])("keeps %s deployable after a save", (path) => {
    const source = readFileSync(resolve(REPO, path), "utf8");
    const name = path.split("/").pop()!.replace(/\W+/g, "-");
    expect(schemaErrors(serialiseCmmn(parseCmmn(source)), name)).toBe("");
  });
});

/**
 * The checked-in copy the engine's own test deploys.
 *
 * Two checks share one document — the XSD here, a real deployment in
 * `TogetherFlowGeneratedCaseTest` over in `flowable-cmmn-engine` — and neither is worth
 * much if they drift to testing different cases. So the file is committed and this asserts
 * it still matches what the serialiser produces. When it legitimately changes, regenerate:
 *
 *     TF_WRITE_FIXTURE=1 npm test -- schemaValidity
 *
 * and commit the result, so a change to the output is reviewed rather than absorbed.
 */
describe("the fixture the engine deploys", () => {
  const FIXTURE = resolve(
    REPO,
    "modules/flowable-cmmn-engine/src/test/resources/org/flowable/cmmn/test/togetherflow/design-kitchen-sink.cmmn",
  );

  it("matches what this serialiser produces", () => {
    const generated = serialiseCmmn(kitchenSink());
    if (process.env.TF_WRITE_FIXTURE) writeFileSync(FIXTURE, generated);

    expect(
      readFileSync(FIXTURE, "utf8"),
      "The checked-in case no longer matches this serialiser. Regenerate with "
        + "TF_WRITE_FIXTURE=1 and commit it, so the engine deploys what the editor now writes.",
    ).toBe(generated);
  });

  it("is byte-identical across runs, so the comparison means something", () => {
    // `createElement` mixes Date.now() into ids; the fixture overrides them for this reason.
    expect(serialiseCmmn(kitchenSink())).toBe(serialiseCmmn(kitchenSink()));
  });
});
