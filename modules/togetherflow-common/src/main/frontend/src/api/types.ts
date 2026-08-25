/**
 * Types mirroring the Flowable REST DTOs this UI consumes.
 * Field names match the Java response/request classes in modules/flowable-rest.
 */

export type RestVariableScope = "local" | "global";

export interface RestVariable {
  name: string;
  type?: string;
  value?: unknown;
  valueUrl?: string;
  scope?: RestVariableScope;
}

export interface DataResponse<T> {
  data: T[];
  total: number;
  start: number;
  sort?: string;
  order?: string;
  size: number;
}

export interface TaskResponse {
  id: string;
  url?: string;
  owner?: string;
  assignee?: string;
  delegationState?: string;
  name?: string;
  description?: string;
  createTime?: string;
  dueDate?: string;
  priority: number;
  suspended: boolean;
  claimTime?: string;
  taskDefinitionKey?: string;
  scopeDefinitionId?: string;
  scopeId?: string;
  subScopeId?: string;
  scopeType?: string;
  propagatedStageInstanceId?: string;
  tenantId?: string;
  category?: string;
  formKey?: string;
  parentTaskId?: string;
  executionId?: string;
  processInstanceId?: string;
  processDefinitionId?: string;
  variables?: RestVariable[];
}

export type TaskAction = "complete" | "claim" | "unclaim" | "delegate" | "resolve";

export interface TaskActionRequest {
  action: TaskAction;
  assignee?: string;
  formDefinitionId?: string;
  outcome?: string;
  variables?: RestVariable[];
  transientVariables?: RestVariable[];
}

export interface QueryVariable {
  name?: string;
  operation: string;
  value?: unknown;
  type?: string;
}

/** Subset of TaskQueryRequest this UI actually sends. */
export interface TaskQueryRequest {
  start?: number;
  size?: number;
  sort?: string;
  order?: "asc" | "desc";
  assignee?: string;
  candidateUser?: string;
  candidateOrAssigned?: string;
  unassigned?: boolean;
  involvedUser?: string;
  nameLikeIgnoreCase?: string;
  processDefinitionKey?: string;
  dueBefore?: string;
  dueAfter?: string;
  withoutDueDate?: boolean;
  minimumPriority?: number;
  maximumPriority?: number;
  active?: boolean;
  tenantId?: string;
  includeProcessVariables?: boolean;
}

export interface CommentResponse {
  id: string;
  author?: string;
  message: string;
  time?: string;
  taskId?: string;
  processInstanceId?: string;
}

export interface AttachmentResponse {
  id: string;
  url?: string;
  name: string;
  userId?: string;
  description?: string;
  type?: string;
  taskUrl?: string;
  processInstanceUrl?: string;
  /** Set when the attachment is a link to content held outside the engine (§7.6). */
  externalUrl?: string | null;
  /** Set when the bytes live in the engine's own storage. */
  contentUrl?: string | null;
  time?: string | null;
}

export interface AttachmentLinkRequest {
  name: string;
  description?: string;
  type?: string;
  externalUrl: string;
}

export interface HistoricTaskInstanceResponse {
  id: string;
  name?: string;
  description?: string;
  assignee?: string;
  owner?: string;
  priority?: number;
  category?: string;
  formKey?: string;
  parentTaskId?: string;
  taskDefinitionKey?: string;
  deleteReason?: string;
  processInstanceId?: string;
  processDefinitionId?: string;
  executionId?: string;
  scopeId?: string;
  scopeType?: string;
  tenantId?: string;
  startTime?: string | null;
  endTime?: string | null;
  claimTime?: string | null;
  dueDate?: string | null;
  durationInMillis?: number | null;
  workTimeInMillis?: number | null;
  variables?: RestVariable[];
}

/** Subset of HistoricTaskInstanceQueryRequest this UI sends. */
export interface HistoricTaskInstanceQueryRequest {
  start?: number;
  size?: number;
  sort?: string;
  order?: "asc" | "desc";
  taskAssignee?: string;
  taskInvolvedUser?: string;
  taskNameLikeIgnoreCase?: string;
  processDefinitionKey?: string;
  finished?: boolean;
  tenantId?: string;
}

export interface HistoricProcessInstanceResponse {
  id: string;
  url?: string;
  name?: string;
  businessKey?: string;
  businessStatus?: string;
  processDefinitionId?: string;
  processDefinitionName?: string;
  processDefinitionDescription?: string;
  startUserId?: string;
  endUserId?: string;
  state?: string;
  deleteReason?: string;
  tenantId?: string;
  startTime?: string | null;
  endTime?: string | null;
  durationInMillis?: number | null;
  variables?: RestVariable[];
}

/** Subset of HistoricProcessInstanceQueryRequest this UI sends. */
export interface HistoricProcessInstanceQueryRequest {
  start?: number;
  size?: number;
  sort?: string;
  order?: "asc" | "desc";
  involvedUser?: string;
  startedBy?: string;
  finished?: boolean;
  tenantId?: string;
}

export interface ProcessDefinitionResponse {
  id: string;
  url?: string;
  key: string;
  version: number;
  name?: string;
  description?: string;
  tenantId?: string;
  deploymentId?: string;
  resource?: string;
  diagramResource?: string;
  category?: string;
  graphicalNotationDefined: boolean;
  suspended: boolean;
  startFormDefined: boolean;
}

export interface ProcessInstanceResponse {
  id: string;
  url?: string;
  name?: string;
  businessKey?: string;
  businessStatus?: string;
  suspended: boolean;
  ended: boolean;
  completed: boolean;
  processDefinitionId?: string;
  processDefinitionName?: string;
  activityId?: string;
  startUserId?: string;
  startTime?: string;
  tenantId?: string;
  variables?: RestVariable[];
}

export interface ProcessInstanceCreateRequest {
  processDefinitionId?: string;
  processDefinitionKey?: string;
  name?: string;
  businessKey?: string;
  variables?: RestVariable[];
  tenantId?: string;
  returnVariables?: boolean;
}

export interface CaseDefinitionResponse {
  id: string;
  url?: string;
  key: string;
  version: number;
  name?: string;
  description?: string;
  tenantId?: string;
  deploymentId?: string;
  category?: string;
  startFormDefined?: boolean;
  /** False for hand-written .cmmn files with no CMMNDI — no diagram can be rendered. */
  graphicalNotationDefined?: boolean;
}

export interface CaseInstanceCreateRequest {
  caseDefinitionId?: string;
  caseDefinitionKey?: string;
  name?: string;
  businessKey?: string;
  variables?: RestVariable[];
  tenantId?: string;
}

export interface CaseInstanceResponse {
  id: string;
  url?: string;
  name?: string | null;
  businessKey?: string | null;
  businessStatus?: string | null;
  caseDefinitionId?: string;
  caseDefinitionName?: string | null;
  caseDefinitionKey?: string;
  caseDefinitionVersion?: number;
  caseDefinitionDescription?: string | null;
  startTime?: string;
  /** Set only on a finished case; the runtime query never returns one. */
  endTime?: string | null;
  startUserId?: string | null;
  state?: string;
  completed?: boolean;
  ended?: boolean;
  parentId?: string | null;
  tenantId?: string;
}

/* ── Forms ────────────────────────────────────────────────────────────────────
 * Returned by GET /runtime/tasks/{taskId}/form and
 * GET /repository/process-definitions/{id}/start-form.
 *
 * FormField is polymorphic on a `fieldType` discriminator (see FormField.java's
 * @JsonTypeInfo): plain fields default to "FormField", option-bearing fields are
 * "OptionFormField", and layout containers are "FormContainer". Notably `options`
 * lives only on OptionFormField, not on the base type.
 */

export type FormFieldType =
  | "text"
  | "multi-line-text"
  | "integer"
  | "decimal"
  | "amount"
  | "date"
  | "boolean"
  | "radio-buttons"
  | "dropdown"
  | "upload"
  | "expression"
  | "people"
  | "functional-group"
  | "container"
  | "hyperlink"
  | "spacer"
  | "horizontal-line"
  | "headline"
  | "headline-with-line";

export interface FormOption {
  id?: string;
  name: string;
}

export interface FormLayoutDefinition {
  row?: number;
  col?: number;
  colspan?: number;
}

export interface FormFieldBase {
  id: string;
  name?: string;
  type: FormFieldType | string;
  value?: unknown;
  required?: boolean;
  readOnly?: boolean;
  overrideId?: boolean;
  placeholder?: string;
  params?: Record<string, unknown>;
  layout?: FormLayoutDefinition;
}

export interface PlainFormField extends FormFieldBase {
  fieldType?: "FormField";
}

export interface OptionFormField extends FormFieldBase {
  fieldType: "OptionFormField";
  optionType?: string;
  hasEmptyValue?: boolean;
  options?: FormOption[];
  optionsExpression?: string;
}

export interface ExpressionFormField extends FormFieldBase {
  fieldType: "ExpressionFormField";
  expression?: string;
}

export interface FormContainerField extends FormFieldBase {
  fieldType: "FormContainer";
  /** Rows of columns. */
  fields?: FormField[][];
}

export type FormField =
  | PlainFormField
  | OptionFormField
  | ExpressionFormField
  | FormContainerField;

export interface FormOutcome {
  id?: string;
  name: string;
}

export interface FormModelResponse {
  id?: string;
  name?: string;
  description?: string;
  key?: string;
  version?: number;
  fields?: FormField[];
  outcomes?: FormOutcome[];
  outcomeVariableName?: string;
}

/* ── Task identity links and audit log (§7.1) ─────────────────────────────── */

/**
 * Someone involved with a task. `type` is the engine's own vocabulary — "assignee",
 * "owner", "candidate", "participant" — and exactly one of user/group is set.
 */
export interface TaskIdentityLink {
  url?: string;
  user?: string | null;
  group?: string | null;
  type: string;
}

/**
 * One entry in a task's audit trail.
 *
 * Only recorded when the engine sets `enableHistoricTaskLogging` (it defaults to false).
 */
export interface TaskLogEntry {
  logNumber: number;
  type?: string;
  taskId?: string;
  timeStamp?: string;
  userId?: string | null;
  data?: string | null;
  processInstanceId?: string | null;
  scopeId?: string | null;
  scopeType?: string | null;
}
