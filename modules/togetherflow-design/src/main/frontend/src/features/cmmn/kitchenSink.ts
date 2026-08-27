/**
 * One case using every plan item kind and every setting the properties panel can author.
 *
 * Shared rather than local to a test because two very different checks need the *same*
 * document: `schemaValidity.test.ts` runs the CMMN 1.1 XSD over it here in the browser
 * toolchain, and `TogetherFlowGeneratedCaseTest` in `flowable-cmmn-engine` deploys the
 * checked-in copy into a real engine. Those catch different things — the schema is the gate
 * a deployment runs first, and `CaseValidator` and the parser are what run after it — and
 * neither is worth much if the two sides drift to testing different cases.
 *
 * Not reachable from the app entry, so it is not in the bundle.
 */

import {
  createElement,
  emptyCase,
  type CmmnCase,
  type CmmnElement,
  type CmmnElementType,
} from "./cmmnModel";

/** Every element type, with every feature the properties panel can author set on one. */
/** The same element with an id that does not change between runs. */
function withId(element: CmmnElement, id: string): CmmnElement {
  element.definitionId = id;
  element.planItemId = `planItem_${id}`;
  return element;
}

export function kitchenSink(): CmmnCase {
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
  /*
   * Deterministic ids. `createElement` uses `nextId`, which mixes in `Date.now()` — fine
   * for something a person is about to rename, useless for a document that is checked in
   * and compared byte for byte.
   */
  const elements = TYPES.map((type, index) =>
    withId(
      createElement(
        type,
        { x: 100 + (index % 4) * 180, y: 100 + Math.floor(index / 4) * 140 },
        base.planModelId,
      ),
      type,
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
  const inside = withId(
    createElement("humanTask", { x: 140, y: 260 }, stage.planItemId),
    "insideStage",
  );
  inside.name = "Inside the stage";

  /*
   * A plan fragment holding a task. The schema gives `tPlanFragment` `planItem` and
   * `sentry` only — no `planItemDefinition` — so this is the case that proves the
   * fragment's definition is written by the enclosing plan model rather than inside it.
   */
  const inFragment = withId(
    createElement("humanTask", { x: 140, y: 400 }, fragment.planItemId),
    "insideFragment",
  );
  inFragment.name = "Inside the fragment";

  human.defaultControl = { required: { enabled: true }, manualActivation: { enabled: true } };

  return { ...base, elements: [...elements, inside, inFragment] };
}
