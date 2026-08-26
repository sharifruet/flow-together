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

import {
  createElement,
  emptyCase,
  parseCmmn,
  serialiseCmmn,
  type CmmnCase,
  type CmmnElementType,
} from "./cmmnModel";

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

/** Every element type, with every feature the properties panel can author set on one. */
function kitchenSink(): CmmnCase {
  const TYPES: CmmnElementType[] = [
    "humanTask",
    "processTask",
    "caseTask",
    "decisionTask",
    "serviceTask",
    "scriptTask",
    "httpTask",
    "mailTask",
    "externalWorkerTask",
    "casePageTask",
    "sendEventTask",
    "milestone",
    "stage",
    "planFragment",
    "timerEventListener",
    "userEventListener",
    "genericEventListener",
    "signalEventListener",
    "variableEventListener",
    "intentEventListener",
    "reactivateEventListener",
  ];

  const base = emptyCase("kitchenSink", "Kitchen sink");
  const elements = TYPES.map((type, index) =>
    createElement(
      type,
      { x: 100 + (index % 4) * 180, y: 100 + Math.floor(index / 4) * 140 },
      base.planModelId,
    ),
  );
  const [
    human,
    process,
    subCase,
    decision,
    service,
    script,
    http,
    mail,
    externalWorker,
    casePage,
    sendEvent,
    milestone,
    stage,
    fragment,
    timer,
    userEvent,
    ,
    signal,
    variable,
  ] = elements;

  human.attributes = { assignee: "kermit", candidateGroups: "sales", formKey: "f1" };
  human.entrySentries = [{ id: "sentry_1", onParts: [], ifPart: "${ready}" }];
  human.exitSentries = [
    {
      id: "sentry_2",
      onParts: [{ sourceRef: process.planItemId, standardEvent: "complete" }],
      exitType: "activeInstances",
    },
  ];
  human.lifecycleListeners = [
    {
      sourceState: "available",
      targetState: "active",
      implementationType: "class",
      value: "com.example.Listener",
    },
  ];
  human.documentation = "Why this task exists, for whoever inherits the case.";
  human.itemControl = {
    repetition: { enabled: true, condition: "${again}" },
    required: { enabled: true, condition: "${mandatory}" },
    manualActivation: { enabled: true },
    repetitionAttributes: {
      counterVariable: "loopCounter",
      collectionVariable: "items",
      elementVariable: "item",
      elementIndexVariable: "itemIndex",
      maxInstanceCount: "10",
      ignoreCounterVariable: "true",
    },
  };

  /*
   * Everything the attribute table can author, so the schema sees the full set rather than
   * the handful an example happens to use. These are all foreign-namespace attributes, and
   * `anyAttribute namespace="##other"` accepts them — which is exactly why a misspelt one
   * is invisible here and has to be caught by `attributeCoverage.test.ts` instead.
   */
  human.attributes = {
    ...human.attributes,
    isBlockingExpression: "${blocking}",
    async: "true",
    exclusive: "true",
    asyncLeave: "true",
    asyncLeaveExclusive: "true",
    sameDeployment: "true",
    taskIdVariableName: "taskId",
    taskCompleterVariableName: "completedBy",
  };

  process.plainAttributes = { processRef: "someProcess" };
  process.attributes = {
    businessKey: "${key}",
    inheritBusinessKey: "true",
    sameDeployment: "true",
    fallbackToDefaultTenant: "true",
    idVariableName: "startedProcessId",
  };
  milestone.attributes = {
    businessStatus: "reviewed",
    displayOrder: "2",
    includeInStageOverview: "true",
    milestoneVariable: "reviewedAt",
  };
  stage.attributes = {
    autoCompleteCondition: "${done}",
    businessStatus: "in-review",
    displayOrder: "1",
    includeInStageOverview: "true",
    formKey: "stageForm",
    formFieldValidation: "true",
  };
  userEvent.attributes = { availableCondition: "${ready}" };

  /*
   * The typed kinds. Each is a shared element carrying a `flowable:` discriminator, so what
   * the schema is being asked here is whether that discriminator — and everything it drags
   * along — is legal where it lands. `flowable:eventType` in particular was once believed
   * not to be; it is, and only the un-prefixed form is rejected.
   */
  script.attributes = { scriptFormat: "groovy", resultVariableName: "total", autoStoreVariables: "true" };
  script.fields = [{ name: "script", valueKind: "string", value: "return 1 + 1" }];
  http.attributes = { parallelInSameTransaction: "true" };
  http.fields = [
    { name: "requestUrl", valueKind: "string", value: "https://example.test" },
    { name: "requestMethod", valueKind: "string", value: "POST" },
    { name: "requestBody", valueKind: "expression", value: "${body}" },
  ];
  mail.fields = [
    { name: "to", valueKind: "string", value: "someone@example.test" },
    { name: "subject", valueKind: "string", value: "Hello" },
    { name: "html", valueKind: "string", value: "<p>Hello</p>" },
  ];
  externalWorker.attributes = { topic: "orderPicking", doNotIncludeVariables: "true" };
  casePage.attributes = { formKey: "overview", label: "Overview", icon: "chart", sameDeployment: "true" };
  sendEvent.eventType = "orderPlaced";
  sendEvent.eventInParameters = [
    { source: "orderId", target: "id" },
    { sourceExpression: "${total}", target: "amount" },
  ];
  sendEvent.eventOutParameters = [{ source: "status", target: "orderStatus", transient: true }];
  signal.attributes = { signalRef: "somethingHappened" };
  variable.attributes = { variableName: "amount", variableChangeType: "update" };
  human.exitSentries[0].exitEventType = "forceComplete";
  subCase.plainAttributes = { caseRef: "someCase" };
  decision.plainAttributes = { decisionRef: "someDecision" };
  service.attributes = { class: "com.example.Delegate", storeResultVariableAsTransient: "true" };
  timer.timerExpression = "PT1H";
  // A start trigger is an xsd:IDREF, so the schema resolves it — a dangling one fails here.
  timer.timerStartTrigger = { sourceRef: human.planItemId, standardEvent: "complete" };

  // A stage the schema will see as a real stage, with a plan item inside it.
  const inside = createElement("humanTask", { x: 140, y: 260 }, stage.planItemId);
  inside.name = "Inside the stage";

  /*
   * A plan fragment holding a task. The schema gives `tPlanFragment` `planItem` and
   * `sentry` only — no `planItemDefinition` — so this is the case that proves the
   * fragment's definition is written by the enclosing plan model rather than inside it.
   */
  const inFragment = createElement("humanTask", { x: 140, y: 400 }, fragment.planItemId);
  inFragment.name = "Inside the fragment";

  human.defaultControl = { required: { enabled: true }, manualActivation: { enabled: true } };

  return { ...base, elements: [...elements, inside, inFragment] };
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
