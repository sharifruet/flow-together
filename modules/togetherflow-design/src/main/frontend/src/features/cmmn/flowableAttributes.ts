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
  | "asyncLeaveExclusive"
  | "autoCompleteCondition"
  | "availableCondition"
  | "businessKey"
  | "businessStatus"
  | "collectionVariable"
  | "counterVariable"
  | "displayOrder"
  | "elementIndexVariable"
  | "elementVariable"
  | "fallbackToDefaultTenant"
  | "formFieldValidation"
  | "formKey"
  | "exclusive"
  | "idVariableName"
  | "ignoreCounterVariable"
  | "includeInStageOverview"
  | "inheritBusinessKey"
  | "isBlockingExpression"
  | "maxInstanceCount"
  | "milestoneVariable"
  | "sameDeployment"
  | "storeResultVariableAsTransient"
  | "taskCompleterVariableName"
  | "taskIdVariableName";

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

const BY_TYPE: Record<CmmnElementType, CmmnAttributeGroup[]> = {
  humanTask: [HUMAN_TASK, EXECUTION],
  processTask: [CHILD_TASK, EXECUTION],
  caseTask: [CHILD_TASK, EXECUTION],
  decisionTask: [EXECUTION],
  serviceTask: [SERVICE_TASK, EXECUTION],
  milestone: [MILESTONE],
  stage: [STAGE],
  timerEventListener: [LISTENER],
  userEventListener: [LISTENER],
  genericEventListener: [LISTENER],
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
