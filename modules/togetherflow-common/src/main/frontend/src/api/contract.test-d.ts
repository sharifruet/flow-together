/**
 * Contract conformance between the curated types this UI codes against
 * (src/api/types.ts) and the types generated from the engine's own published
 * OpenAPI specs (src/api/generated/, produced by `npm run codegen`).
 *
 * This file contains no runtime assertions — it fails `tsc --noEmit` if the
 * engine's REST contract changes in a way that breaks our assumptions, which is
 * the whole point: a spec regeneration that removes a field we depend on, or
 * changes its type, becomes a build error instead of a runtime surprise.
 *
 * It is deliberately narrow. We only assert the fields this UI actually reads,
 * so unrelated churn elsewhere in a 9,000-line generated file does not fail CI.
 */

import type { components as ProcessComponents } from "./generated/process";
import type { components as IdmComponents } from "./generated/idm";
import type { IdmGroup, IdmPrivilege, IdmUser } from "./idm";
import type {
  AttachmentResponse,
  CommentResponse,
  HistoricProcessInstanceResponse,
  HistoricTaskInstanceResponse,
  ProcessDefinitionResponse,
  RestVariable,
  TaskResponse,
} from "./types";

type Generated = ProcessComponents["schemas"];
type GeneratedIdm = IdmComponents["schemas"];

/** Compile-time assertion that `Actual` covers every field of `Expected` we use. */
type AssertCompatible<Expected, Actual extends Expected> = Actual;

/**
 * Each alias below fails to compile if the generated schema no longer supplies a
 * field we depend on, or supplies it with an incompatible type.
 */

type _Task = AssertCompatible<
  Pick<TaskResponse, "id">,
  Pick<Required<Generated["TaskResponse"]>, "id">
>;

type _TaskOptional = AssertCompatible<
  Partial<Pick<TaskResponse, "name" | "assignee" | "owner" | "description" | "formKey">>,
  Partial<Pick<Generated["TaskResponse"], "name" | "assignee" | "owner" | "description" | "formKey">>
>;

type _Variable = AssertCompatible<
  Partial<Pick<RestVariable, "name" | "type">>,
  Partial<Pick<Generated["RestVariable"], "name" | "type">>
>;

type _Attachment = AssertCompatible<
  Partial<Pick<AttachmentResponse, "id" | "name" | "externalUrl" | "contentUrl" | "description">>,
  Partial<
    Pick<Generated["AttachmentResponse"], "id" | "name" | "externalUrl" | "contentUrl" | "description">
  >
>;

type _Comment = AssertCompatible<
  Partial<Pick<CommentResponse, "id" | "author" | "message">>,
  Partial<Pick<Generated["CommentResponse"], "id" | "author" | "message">>
>;

type _ProcessDefinition = AssertCompatible<
  Partial<Pick<ProcessDefinitionResponse, "id" | "key" | "name" | "description">>,
  Partial<Pick<Generated["ProcessDefinitionResponse"], "id" | "key" | "name" | "description">>
>;

type _HistoricTask = AssertCompatible<
  Partial<Pick<HistoricTaskInstanceResponse, "id" | "name" | "assignee" | "deleteReason">>,
  Partial<
    Pick<Generated["HistoricTaskInstanceResponse"], "id" | "name" | "assignee" | "deleteReason">
  >
>;

/**
 * NOTE — stale published spec: the Java class
 * `org.flowable.rest.service.api.history.HistoricProcessInstanceResponse` declares
 * `name` (and `businessStatus`, `state`), but the checked-in OpenAPI spec under
 * docs/public-api does not. Our curated type follows the Java source, which is what
 * the engine actually returns, so those fields are excluded from this assertion
 * rather than dropped from the type. Re-add them here once the spec is regenerated.
 */
type _HistoricProcess = AssertCompatible<
  Partial<Pick<HistoricProcessInstanceResponse, "id" | "businessKey" | "startUserId">>,
  Partial<
    Pick<Generated["HistoricProcessInstanceResponse"], "id" | "businessKey" | "startUserId">
  >
>;

/** The paged wrapper every collection endpoint returns. */
type _DataResponse = AssertCompatible<
  Partial<Pick<{ total: number; start: number; size: number }, "total" | "start" | "size">>,
  Partial<Pick<Generated["DataResponse"], "total" | "start" | "size">>
>;

/*
 * IDM (§7.3). Its spec is hand-authored rather than generated from the engine's
 * annotations (see docs/public-api/references/openapi/idm), so these assertions are the
 * thing that keeps it honest: if the client starts reading a field the spec does not
 * describe, this fails, and the spec — or the reading — gets fixed.
 */
type _IdmUser = AssertCompatible<
  Partial<Pick<IdmUser, "id" | "firstName" | "lastName" | "displayName" | "email">>,
  Partial<
    Pick<GeneratedIdm["UserResponse"], "id" | "firstName" | "lastName" | "displayName" | "email">
  >
>;

type _IdmGroup = AssertCompatible<
  Partial<Pick<IdmGroup, "id" | "name" | "type" | "url">>,
  Partial<Pick<GeneratedIdm["GroupResponse"], "id" | "name" | "type" | "url">>
>;

type _IdmPrivilege = AssertCompatible<
  Partial<Pick<IdmPrivilege, "id" | "name">>,
  Partial<Pick<GeneratedIdm["PrivilegeResponse"], "id" | "name">>
>;

// Referencing the aliases keeps `noUnusedLocals` satisfied without emitting anything.
export type ContractAssertions = [
  _Task,
  _TaskOptional,
  _Variable,
  _Attachment,
  _Comment,
  _ProcessDefinition,
  _HistoricTask,
  _HistoricProcess,
  _DataResponse,
  _IdmUser,
  _IdmGroup,
  _IdmPrivilege,
];
