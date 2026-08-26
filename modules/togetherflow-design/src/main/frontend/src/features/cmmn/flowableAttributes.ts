/**
 * The `flowable:` attributes the case panel can author, declared rather than hand-written.
 *
 * **Why a table.** These are strings the engine matches exactly, and a wrong one is
 * invisible: the attribute is written, the file round-trips, the case deploys, and the
 * setting simply does nothing. The engine's own naming does not always read the way you
 * would guess — the blocking override is `isBlockingExpression`, not `blockingExpression`,
 * and a CMMN service task's result variable is `resultVariableName` where BPMN's is
 * `resultVariable`. Collecting them here lets `attributeCoverage.test.ts` check every one
 * against `CmmnXmlConstants.java`, which is the only way that class of typo gets caught.
 *
 * **Prefix.** Everything here is written `flowable:`-prefixed, because the CMMN schema
 * permits unknown attributes only in a foreign namespace (`anyAttribute namespace="##other"`)
 * — an un-prefixed one fails validation at deploy. The few genuinely CMMN-defined
 * attributes the panel writes (`isBlocking`, `autoComplete`) are handled separately as
 * plain attributes and are deliberately not in this table.
 */

import type { CmmnElementType } from "./cmmnModel";

export type CmmnAttributeKind = "text" | "boolean" | "number";

export interface CmmnAttributeSpec {
  /** Local name, exactly as the engine reads it. */
  name: CmmnAttributeName;
  kind: CmmnAttributeKind;
}

export interface CmmnAttributeGroup {
  /** Section heading, via `cmmn.group.<id>`. */
  id: string;
  attributes: CmmnAttributeSpec[];
}

/**
 * Every attribute name this table may use.
 *
 * A union rather than `string` so a typo is a compile error here as well as a test failure
 * in CI — the test proves the names are the engine's, and this proves nothing else creeps
 * in past it.
 */
export type CmmnAttributeName =
  | "async"
  | "asyncLeave"
  | "autoStoreVariables"
  | "asyncLeaveExclusive"
  | "autoCompleteCondition"
  | "availableCondition"
  | "businessKey"
  | "businessStatus"
  | "collectionVariable"
  | "counterVariable"
  | "displayOrder"
  | "doNotIncludeVariables"
  | "elementIndexVariable"
  | "elementVariable"
  | "fallbackToDefaultTenant"
  | "formFieldValidation"
  | "formKey"
  | "exclusive"
  | "icon"
  | "idVariableName"
  | "ignoreCounterVariable"
  | "includeInStageOverview"
  | "inheritBusinessKey"
  | "isBlockingExpression"
  | "label"
  | "maxInstanceCount"
  | "milestoneVariable"
  | "parallelInSameTransaction"
  | "resultVariableName"
  | "sameDeployment"
  | "scriptFormat"
  | "signalRef"
  | "storeResultVariableAsTransient"
  | "taskCompleterVariableName"
  | "taskIdVariableName"
  | "topic"
  | "variableChangeType"
  | "variableName";

/**
 * How a plan item runs, rather than what it does.
 *
 * `isBlocking` decides whether the case waits for the item; the rest decide whether the
 * engine hands the work to a job. None of them were reachable, so a case could be drawn
 * but not tuned — every task ran synchronously on the thread that triggered it.
 */
const EXECUTION: CmmnAttributeGroup = {
  id: "execution",
  attributes: [
    { name: "isBlockingExpression", kind: "text" },
    { name: "async", kind: "boolean" },
    { name: "exclusive", kind: "boolean" },
    { name: "asyncLeave", kind: "boolean" },
    { name: "asyncLeaveExclusive", kind: "boolean" },
  ],
};

/** What a process or case task passes to the thing it starts, and where it looks for it. */
const CHILD_TASK: CmmnAttributeGroup = {
  id: "childTask",
  attributes: [
    { name: "businessKey", kind: "text" },
    { name: "inheritBusinessKey", kind: "boolean" },
    { name: "sameDeployment", kind: "boolean" },
    { name: "fallbackToDefaultTenant", kind: "boolean" },
    { name: "idVariableName", kind: "text" },
  ],
};

/** Where a human task's own identifiers land as case variables. */
const HUMAN_TASK: CmmnAttributeGroup = {
  id: "humanTask",
  attributes: [
    { name: "sameDeployment", kind: "boolean" },
    { name: "taskIdVariableName", kind: "text" },
    { name: "taskCompleterVariableName", kind: "text" },
  ],
};

const SERVICE_TASK: CmmnAttributeGroup = {
  id: "serviceTask",
  attributes: [{ name: "storeResultVariableAsTransient", kind: "boolean" }],
};

/**
 * What a stage or milestone contributes to a case's progress view.
 *
 * `businessStatus`, `displayOrder` and `includeInStageOverview` are what the engine's stage
 * overview is built from. A milestone had none of its four attributes reachable at all,
 * which made it a shape that could be drawn and not configured.
 */
const STAGE: CmmnAttributeGroup = {
  id: "stage",
  attributes: [
    { name: "autoCompleteCondition", kind: "text" },
    { name: "businessStatus", kind: "text" },
    { name: "displayOrder", kind: "number" },
    { name: "includeInStageOverview", kind: "boolean" },
    { name: "formKey", kind: "text" },
    { name: "formFieldValidation", kind: "boolean" },
  ],
};

const MILESTONE: CmmnAttributeGroup = {
  id: "milestone",
  attributes: [
    { name: "businessStatus", kind: "text" },
    { name: "displayOrder", kind: "number" },
    { name: "includeInStageOverview", kind: "boolean" },
    { name: "milestoneVariable", kind: "text" },
  ],
};

/** When a listener becomes available, as opposed to when it fires. */
const LISTENER: CmmnAttributeGroup = {
  id: "listener",
  attributes: [{ name: "availableCondition", kind: "text" }],
};

/** A script task's own settings. The script body itself is a field, not an attribute. */
const SCRIPT_TASK: CmmnAttributeGroup = {
  id: "scriptTask",
  attributes: [
    { name: "scriptFormat", kind: "text" },
    { name: "resultVariableName", kind: "text" },
    { name: "autoStoreVariables", kind: "boolean" },
    { name: "doNotIncludeVariables", kind: "boolean" },
  ],
};

const HTTP_TASK: CmmnAttributeGroup = {
  id: "httpTask",
  attributes: [{ name: "parallelInSameTransaction", kind: "boolean" }],
};

const EXTERNAL_WORKER_TASK: CmmnAttributeGroup = {
  id: "externalWorkerTask",
  attributes: [
    { name: "topic", kind: "text" },
    { name: "doNotIncludeVariables", kind: "boolean" },
  ],
};

/**
 * A case page task is a tab inside the case's own UI rather than work the engine performs,
 * so its settings are all about how it appears and who may see it.
 */
const CASE_PAGE_TASK: CmmnAttributeGroup = {
  id: "casePageTask",
  attributes: [
    { name: "formKey", kind: "text" },
    { name: "label", kind: "text" },
    { name: "icon", kind: "text" },
    { name: "sameDeployment", kind: "boolean" },
  ],
};

const SIGNAL_LISTENER: CmmnAttributeGroup = {
  id: "signalListener",
  attributes: [{ name: "signalRef", kind: "text" }],
};

const VARIABLE_LISTENER: CmmnAttributeGroup = {
  id: "variableListener",
  attributes: [
    { name: "variableName", kind: "text" },
    { name: "variableChangeType", kind: "text" },
  ],
};

const BY_TYPE: Record<CmmnElementType, CmmnAttributeGroup[]> = {
  humanTask: [HUMAN_TASK, EXECUTION],
  processTask: [CHILD_TASK, EXECUTION],
  caseTask: [CHILD_TASK, EXECUTION],
  decisionTask: [EXECUTION],
  serviceTask: [SERVICE_TASK, EXECUTION],
  scriptTask: [SCRIPT_TASK, EXECUTION],
  httpTask: [HTTP_TASK, SERVICE_TASK, EXECUTION],
  mailTask: [EXECUTION],
  externalWorkerTask: [EXTERNAL_WORKER_TASK, EXECUTION],
  casePageTask: [CASE_PAGE_TASK],
  sendEventTask: [EXECUTION],
  milestone: [MILESTONE],
  stage: [STAGE],
  // A plan fragment has no lifecycle, so none of the stage attributes apply to it.
  planFragment: [],
  timerEventListener: [LISTENER],
  userEventListener: [LISTENER],
  genericEventListener: [LISTENER],
  signalEventListener: [SIGNAL_LISTENER, LISTENER],
  variableEventListener: [VARIABLE_LISTENER, LISTENER],
  intentEventListener: [LISTENER],
  reactivateEventListener: [LISTENER],
};

export function attributeGroupsFor(type: CmmnElementType): CmmnAttributeGroup[] {
  return BY_TYPE[type] ?? [];
}

/**
 * The `flowable:` attributes on `<repetitionRule>`.
 *
 * Kept apart from the table above because they live on the rule element, not the plan item
 * definition. The model has round-tripped all six since repetition was added; none of them
 * had anywhere to be typed.
 */
export const REPETITION_ATTRIBUTES: CmmnAttributeSpec[] = [
  { name: "counterVariable", kind: "text" },
  { name: "collectionVariable", kind: "text" },
  { name: "elementVariable", kind: "text" },
  { name: "elementIndexVariable", kind: "text" },
  { name: "maxInstanceCount", kind: "text" },
  { name: "ignoreCounterVariable", kind: "boolean" },
];

/** Every name this module can write, for the coverage test. */
export function allAuthoredAttributeNames(): string[] {
  const names = new Set<string>();
  for (const groups of Object.values(BY_TYPE)) {
    for (const group of groups) {
      for (const attribute of group.attributes) names.add(attribute.name);
    }
  }
  for (const attribute of REPETITION_ATTRIBUTES) names.add(attribute.name);
  return [...names].sort();
}

/**
 * The field injections each typed task is configured with.
 *
 * Flowable's specialised tasks take almost all of their configuration as
 * `<flowable:field>` children rather than attributes — a script task's *script* is a field
 * named `script`, and an HTTP task's URL is a field named `requestUrl`. The generic field
 * editor could always author these, but only if you already knew the names, which is a
 * poor way to learn that `requestMethod` is required and `requestMethods` is ignored.
 *
 * Names come from the engine's own delegates: `BaseHttpActivityDelegate`,
 * `BaseMailActivityDelegate` and `ScriptServiceTask`.
 */
export const TASK_FIELDS: Partial<Record<CmmnElementType, string[]>> = {
  scriptTask: ["script"],
  httpTask: [
    "requestMethod",
    "requestUrl",
    "requestHeaders",
    "requestBody",
    "requestBodyEncoding",
    "requestTimeout",
    "requestSecureHeaders",
    "disallowRedirects",
    "failStatusCodes",
    "handleStatusCodes",
    "ignoreException",
    "saveRequestVariables",
    "saveResponseParameters",
    "saveResponseParametersTransient",
    "saveResponseVariableAsJson",
    "responseVariableName",
    "resultVariablePrefix",
  ],
  mailTask: [
    "to",
    "from",
    "cc",
    "bcc",
    "subject",
    "text",
    "html",
    "charset",
    "headers",
    "attachments",
    "ignoreException",
    "exceptionVariableName",
  ],
};

/** The fields a task of this kind is configured with, or none if it is not a typed task. */
export function taskFieldsFor(type: CmmnElementType): string[] {
  return TASK_FIELDS[type] ?? [];
}
