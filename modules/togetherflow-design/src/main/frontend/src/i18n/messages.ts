/**
 * TogetherFlow Design's message catalogue (REQUIREMENTS.md §8).
 * Merged over `commonMessages`, so only Design's own copy lives here.
 */

import type { Catalogues, Messages } from "@togetherflow/common";

export const designEn = {
  "app.starting": "Signing you in…",
  "action.failed": "That action could not be completed.",

  "nav.label": "Design sections",
  "nav.models": "Models",
  "nav.workspaces": "Workspaces",

  // Workspaces (ADR 0017 / W3.1)
  "workspaces.label": "Workspace administration",
  "workspaces.title": "Workspaces",
  "workspaces.blurb":
    "A workspace groups models and decides who may open, edit and publish them. Roles are checked by the workspace service, not just hidden here.",
  "workspaces.new": "New workspace",
  "workspaces.create": "Create",
  "workspaces.created": "\"{name}\" created.",
  "workspaces.failed": "That workspace action could not be completed.",
  "workspaces.field.key": "Key",
  "workspaces.field.key.hint": "Identifies the workspace. Can't be changed later.",
  "workspaces.field.name": "Name",
  "workspaces.empty.title": "No workspaces yet",
  "workspaces.empty.description":
    "Create one to group models and grant people access to them.",
  "workspaces.membersOf": "Members of {name}",
  "workspaces.member": "Member",
  "workspaces.members.empty": "No members yet",
  "workspaces.member.add": "User or group",
  "workspaces.member.add.hint": "The id as the identity store knows it.",
  "workspaces.member.added": "{id} added.",
  "workspaces.member.removed": "{id} removed.",
  "workspaces.principalType": "Type",
  "workspaces.principal.USER": "User",
  "workspaces.principal.GROUP": "Group",
  "workspaces.role": "Role",
  "workspaces.role.READER": "Reader",
  "workspaces.role.MODELER": "Modeler",
  "workspaces.role.OWNER": "Owner",
  "workspaces.roleBlurb":
    "Readers open models. Modelers also create, edit, delete and publish them. Owners additionally manage members and the workspace itself.",
  "workspaces.sharing": "Shared models",
  "workspaces.sharedWorkspace": "Share models from",
  "workspaces.sharedWorkspace.hint":
    "Models in the chosen workspace can be referenced from this one. A workspace that already shares from another can't be shared from.",
  "workspaces.sharedWorkspace.none": "Nothing shared",
  "workspaces.shared": "Sharing updated.",
  "workspaces.delete": "Delete this workspace",
  "workspaces.delete.title": "Delete this workspace?",
  "workspaces.delete.description":
    "\"{name}\" and its membership will be deleted. The models in it are left alone — they live in the engine and stay there, unassigned.",
  "workspaces.delete.confirm": "Delete workspace",
  "workspaces.deleted": "\"{name}\" deleted.",

  // Git connectivity (ADR 0018 / W3.2)
  "git.label": "Git connectivity",
  "git.title": "Git",
  "git.failed": "That Git action could not be completed.",
  "git.notConnected": "This workspace isn't connected to a repository.",
  "git.connect": "Connect",
  "git.connected": "Connected.",
  "git.remoteUrl": "Repository URL",
  "git.remoteUrl.hint":
    "Anything Git can clone. Credentials come from this deployment's configuration, not from here.",
  "git.branch": "Branch",
  "git.subPath": "Folder",
  "git.subPath.hint": "Leave empty for the repository root; set it for a monorepo.",
  "git.remote": "Repository",
  "git.sync": "Sync",
  "git.sync.upToDate": "Up to date",
  "git.sync.diverged": "{ahead} ahead, {behind} behind",
  "git.sync.unknown": "Couldn't reach the remote",
  "git.lastCommit": "Last commit",
  "git.changes.one": "1 pending change",
  "git.changes.other": "{count} pending changes",
  "git.changes.none": "Nothing has changed since the last commit.",
  "git.change.ADDED": "Added",
  "git.change.MODIFIED": "Changed",
  "git.change.REMOVED": "Removed",
  "git.diff": "Diff",
  "git.diff.loaded": "Diff loaded.",
  "git.diff.empty": "No textual difference.",
  "git.diff.note":
    "A text diff of the stored file. It shows what Git will record, which for a diagram is the serialised XML rather than the shapes.",
  "git.commitMessage": "Commit message",
  "git.commit": "Commit",
  "git.committed": "Committed.",
  "git.push": "Push",
  "git.pushed": "Pushed.",
  "git.pull": "Pull",
  "git.pulled.done": "Pulled.",
  "git.pulled": "{created} added, {updated} updated, {failed} failed.",
  "git.revert": "Discard changes",
  "git.reverted": "Local changes discarded.",
  "git.switchBranch": "Branch",
  "git.switched": "Branch switched.",
  "git.newBranch": "New branch",
  "git.createBranch": "Create branch",
  "git.branchCreated": "Now on {name}.",
  "git.disconnect": "Disconnect from Git",
  "git.disconnect.title": "Disconnect this workspace?",
  "git.disconnect.description":
    "\"{name}\" will stop tracking its repository. The models stay exactly as they are — this removes the link and the working copy, not your work. Anything committed but not pushed is lost.",
  "git.disconnect.confirm": "Disconnect",
  "git.disconnected": "Disconnected from Git.",

  // Shared editor chrome
  "editor.back": "← Back to models",
  "editor.editing": "Editing {name}",
  "editor.unsaved": "Unsaved changes",
  "editor.saved": "Saved {time}",
  "editor.noChanges": "No changes",
  "editor.saved.toast": "Saved.",

  /*
   * Concurrent-edit guard (W1.1). The copy names what each choice discards: this is a
   * dialog about losing work, and "OK / Cancel" would be the worst possible wording.
   */
  "editor.conflict.title": "Someone else saved this model",
  "editor.conflict.description":
    "It changed on the server after you opened it, so saving now would overwrite their work.",
  "editor.conflict.note":
    "Reload discards the changes you have made here. Overwrite discards theirs. Autosave is paused until you choose.",
  "editor.conflict.reload": "Reload theirs",
  "editor.conflict.overwrite": "Overwrite with mine",
  "editor.conflict.keepEditing": "Keep editing",
  "editor.conflict.reloaded": "Reloaded the saved version.",
  "editor.saveVersion": "Save version",
  "editor.export": "Export",
  "editor.revisions": "Revisions",
  "editor.grid": "Grid",
  "editor.gridlines": "Show gridlines",
  "editor.snap": "Snap to grid",
  "editor.versionSaved": "Saved as version {version}. The draft carries on from here.",
  "editor.versionFailed": "Could not save a version of this model.",
  "editor.history": "History",
  "editor.zoom": "Zoom",
  "editor.zoomIn": "Zoom in",
  "editor.zoomOut": "Zoom out",
  "editor.zoomFit": "Fit to view",
  "editor.leave.title": "Leave without saving?",
  "editor.leave.description": "\"{name}\" has unsaved changes. Leaving now discards them.",
  "editor.leave.confirm": "Discard changes",
  "editor.leave.cancel": "Keep editing",
  "editor.deployed": "Deployed as {id}.",
  "editor.deployFailed": "Deployment failed.",
  "editor.saveFailed": "Could not save this model.",

  // Model library (§7.4.1)
  "library.label": "Model library",
  "library.title": "Models",
  "library.description":
    "Drafts you can edit and deploy. Deploying does not delete the draft — keep editing and deploy again to publish a new version.",
  "library.countLabel.one": "{count} model",
  "library.countLabel.other": "{count} models",

  /* ── W2.3: relations, templates, tags, library layout (I4, I5, I9) ─────── */

  "relations.action": "Relations",
  "relations.title": "What {name} uses, and what uses it",
  "relations.description":
    "Worked out by reading the stored sources \u2014 the engine records no relationships between models.",
  "relations.uses": "Uses",
  "relations.uses.none": "This model references nothing else.",
  "relations.usedBy": "Used by",
  "relations.usedBy.none": "Nothing references this model.",
  "relations.unresolved": "{key} (via {via}) does not match any model here yet.",
  "relations.caveat":
    "A reference written as an expression cannot be resolved without runtime values, so it is not listed. Treat this as a guide rather than a guarantee.",

  "library.template": "Template",
  "library.template.mark": "Mark as template",
  "library.template.clear": "Not a template",
  "library.template.marked": "\u201c{name}\u201d is now offered as a template.",
  "library.template.cleared": "\u201c{name}\u201d is no longer a template.",
  "library.layout": "Layout",
  "library.layout.cards": "Cards",
  "library.layout.table": "Table",
  "library.tags": "Tags",
  "library.actionsFor": "Actions for {name}",
  "library.delete.referenced":
    "\u201c{name}\u201d is referenced by {referrers}. Deleting it will leave those models pointing at something that no longer exists. Deployed versions keep running.",
  "library.newProcess": "New process",
  "library.search": "Search models…",
  "library.searchLabel": "Search models by name",
  "library.createAndOpen": "Create and open",
  "library.column.model": "Model",
  "library.column.type": "Type",
  "library.column.version": "Version",
  "library.column.lastEdited": "Last edited",
  "library.history.action": "History",
  "library.history.title": "Version history — {name}",
  "library.history.blurb":
    "A version is recorded each time this model is deployed, and whenever you save one here. The newest is the draft you are editing; the rest are snapshots and cannot be changed.",
  "library.history.current": "Editing",
  "library.history.save": "Save a version",
  "library.history.saved": "Saved version {version}.",
  "library.history.restore": "Restore",
  "library.history.restore.title": "Restore version {version}?",
  "library.history.restore.description":
    "The draft's contents will be replaced by version {version}. What is there now is kept as version {current}, so this can be undone by restoring that.",
  "library.history.restored": "Restored version {version}.",
  "library.history.failed": "That version action could not be completed.",
  "library.history.empty.title": "No versions yet",
  "library.history.empty.description":
    "Deploy this model, or save a version here, to start recording history.",
  "library.caption": "Models",
  "library.empty.title": "No models yet",
  "library.empty.description": "Create a process or decision model to get started.",
  "library.duplicated": "\"{name}\" duplicated.",
  "library.copySuffix": "{name} (copy)",
  "library.noContentToCopy": "That model has no saved content to copy.",
  "library.noContentToExport": "\"{name}\" has no saved content to export.",
  "library.unknownKind":
    "Can't tell what kind of model \"{name}\" is. Expected BPMN, CMMN, DMN, a form or an event.",
  "library.imported": "Imported \"{name}\".",
  "library.created": "\"{name}\" created.",
  "library.delete.title": "Delete this model?",
  "library.delete.description":
    "The draft \"{name}\" will be deleted. Anything already deployed from it keeps running — this removes the editable draft only. This can't be undone.",
  "library.delete.confirm": "Delete model",
  "library.deleted": "\"{name}\" deleted.",
  "library.new.bpmn": "New process",
  "library.new.cmmn": "New case",
  "library.new.app": "New app",
  "library.new.form": "New form",
  "library.new.event": "New event",
  "library.new.dmn": "New decision",
  "library.newTitle.bpmn": "New process model",
  "library.newTitle.cmmn": "New case model",
  "library.newTitle.app": "New app",
  "library.newTitle.form": "New form",
  "library.newTitle.event": "New event",
  "library.newTitle.dmn": "New decision model",
  "library.field.name": "Name",
  "library.field.key": "Key",
  "library.field.key.hint":
    "Used by the engine to identify this model. Can't contain spaces.",
  "library.error.name": "Give the model a name.",
  "library.error.keyRequired": "A key is required.",
  "library.error.keyFormat":
    "Start with a letter or underscore; letters, digits, dot, dash and underscore only.",

  // BPMN modeler (§7.4.2)
  "bpmn.xmlReadFailed": "Could not read the XML.",
  "bpmn.checkFailed": "Could not check the model.",
  "bpmn.checksClean": "No problems found.",
  "bpmn.fixBeforeDeploy": "Fix the problems listed below before deploying.",
  "bpmn.checksLabel": "Model checks",
  "bpmn.checks.summary.problems.one": "{count} problem",
  "bpmn.checks.summary.problems.other": "{count} problems",
  "bpmn.checks.summary.warnings.one": "{count} warning",
  "bpmn.checks.summary.warnings.other": "{count} warnings",
  // Which side reported a problem, shown as a badge beside the severity.
  "bpmn.checks.severity.error": "error",
  "bpmn.checks.severity.warning": "warning",
  "bpmn.checks.nonBlocking":
    "Nothing here stops a deploy. Warnings are advice about readability \u2014 an unnamed element deploys and runs.",
  "bpmn.checks.blocking.one": "1 problem has to be fixed before this can be deployed.",
  "bpmn.checks.blocking.other": "{count} problems have to be fixed before this can be deployed.",
  "bpmn.checks.source.browser": "browser",
  "bpmn.checks.source.engine": "engine",
  "bpmn.checks.source.lint": "structure",
  "bpmn.checks.caveat.engine":
    "The engine's own validator ran over this model, so what it reports is what a deploy would reject. Browser checks are shown alongside for what it does not cover.",
  "bpmn.checks.caveat.browserOnly":
    "These checks ran in the browser only \u2014 the engine could not be reached, so passing here does not guarantee it will accept the model.",
  "bpmn.checks.live": "Re-check as I edit",
  "bpmn.checks.serverUnreachable": "Could not reach the engine's validator; showing browser checks only.",
  "bpmn.xmlLabel": "BPMN XML",
  "bpmn.xmlTitle": "BPMN XML",
  "bpmn.loadingDiagram": "Loading diagram",
  "bpmn.deploy.title": "Deploy this model?",
  "bpmn.deploy.description":
    "\"{name}\" will be saved and deployed to the engine. New instances will use this version; instances already running keep the version they started on.",
  "bpmn.deploy.confirm": "Save and deploy",

  // Properties panels (§7.4.2 / §7.4.3)
  "properties.label": "Element properties",
  "properties.selectAnElement": "Select an element on the canvas to edit its properties.",
  // User task, the rest of it (§7.4.2)
  "properties.owner": "Owner",
  "properties.owner.hint": "Who is accountable for the task, as distinct from who works on it.",
  "properties.priority": "Priority",
  "properties.priority.hint": "A number. Work's inbox filters on bands of this.",
  "properties.category": "Category",
  "properties.category.hint": "Free-text grouping, available to queries but not used by the engine.",
  "properties.skipExpression": "Skip expression",
  "properties.skipExpression.hint":
    "When this evaluates true the task is completed automatically without ever appearing to anyone.",
  "properties.businessCalendarName": "Business calendar",
  "properties.businessCalendarName.hint":
    "Which calendar due dates are computed against. Empty uses the default.",

  "properties.exclusive": "Exclusive",
  "properties.exclusive.hint":
    "On by default: the job will not run at the same time as another job of the same process instance. Turning it off allows genuine parallelism, and the concurrency that comes with it.",

  // Form properties (§7.4.2) — the engine's own form model.
  "properties.formProperties": "Form properties",
  "properties.formProperties.hint":
    "The engine's own form model. Work renders these when a task has no form key.",
  "properties.formProperties.none": "No form properties.",
  "properties.formProperties.id": "Id",
  "properties.formProperties.id.hint": "What the value is submitted as. Required.",
  "properties.formProperties.name": "Label",
  "properties.formProperties.type": "Type",
  "properties.formProperties.type.string": "Text",
  "properties.formProperties.type.long": "Whole number",
  "properties.formProperties.type.double": "Decimal",
  "properties.formProperties.type.boolean": "Yes/no",
  "properties.formProperties.type.date": "Date",
  "properties.formProperties.type.enum": "Choice",
  "properties.formProperties.variable": "Variable",
  "properties.formProperties.variable.hint":
    "Process variable to read and write. Defaults to the id.",
  "properties.formProperties.datePattern": "Date format",
  "properties.formProperties.values": "Options",
  "properties.formProperties.values.hint": "Comma-separated.",
  "properties.formProperties.required": "Required",
  "properties.formProperties.writable": "Writable",
  "properties.formProperties.add": "Add form property",
  "properties.formProperties.remove": "Remove form property {index}",

  // Job behaviour (§7.4.2)
  "properties.jobs": "When this fails",
  "properties.retryCycle": "Retry cycle",
  "properties.retryCycle.hint":
    "ISO-8601 repeating interval, e.g. R3/PT10M for three retries ten minutes apart. Applies to the job, so it only takes effect when the activity is async.",
  "properties.mapException": "Exception mapping",
  "properties.mapException.hint":
    "Turns a Java exception into a BPMN error, so a boundary error event can catch it.",
  "properties.mapException.none": "No mappings.",
  "properties.mapException.class": "Exception class",
  "properties.mapException.class.hint": "Fully qualified. Empty matches any exception.",
  "properties.mapException.errorCode": "Error code",
  "properties.mapException.errorCode.hint":
    "Required — the engine refuses to read a model with a mapping that has none.",
  "properties.mapException.includeChildren": "Include subclasses",
  "properties.mapException.add": "Add mapping",
  "properties.mapException.remove": "Remove mapping {index}",

  "properties.isForCompensation": "For compensation",

  // Process-level engine listeners (§7.4.2)
  "properties.engineListeners": "Engine event listeners",
  "properties.engineListeners.hint":
    "Fire on engine events across this process — a job failing, an entity changing — rather than on one element's lifecycle.",
  "properties.engineListeners.none": "No engine listeners.",
  "properties.engineListeners.events": "Events",
  "properties.engineListeners.events.hint": "Comma-separated. Empty means every event.",
  "properties.engineListeners.add": "Add engine listener",
  "properties.engineListeners.remove": "Remove engine listener {index}",

  // Data objects (§7.4.2)
  "properties.dataObject": "Data object",
  "properties.dataObject.type": "Type",
  "properties.dataObject.type.hint": "Stored on the model as an xsd: type reference.",
  "properties.dataObject.value": "Default value",
  "properties.dataObject.value.hint": "Used when the instance starts without one.",

  // Multi-instance additions (§7.4.2)
  "properties.multiInstance.elementIndexVariable": "Index variable",
  "properties.multiInstance.elementIndexVariable.hint":
    "Holds the zero-based iteration number inside the loop.",
  "properties.aggregation.target": "Collect results into",
  "properties.aggregation.target.hint":
    "Variable the results of every iteration are gathered into. Empty means no aggregation.",
  "properties.aggregation.variables": "Variables to collect",
  "properties.aggregation.variables.hint":
    "Comma-separated variable names taken from each iteration. Empty collects the whole scope.",
  "properties.aggregation.overview": "Create an overview variable",

  "properties.elementType": "Element type",
  "properties.elementType.hint":
    "Changes what this is, keeping its name, position and connections. Also available from the wrench on the element itself.",

  "properties.decisionKey": "Decision key",
  "properties.decisionKey.hint":
    "Key of the DMN decision to evaluate. Stored as the decisionTableReferenceKey field below.",

  "properties.participantProcess": "Process",
  "properties.participantProcess.hint":
    "A pool stands for a process, and the process is what the engine runs. These properties belong to it, not to the pool.",
  "properties.participantProcess.id": "Process key",
  "properties.participantProcess.id.hint": "What the engine starts this process by.",

  "properties.documentation": "Documentation",
  "properties.documentation.hint": "Notes for whoever maintains this model. Carried into the deployed definition.",

  // Flowable service-task subtypes (§7.4.2). Every one of these is a bpmn:ServiceTask in
  // the XML, told apart only by flowable:type.
  "properties.taskType": "Task type",
  "properties.taskType.hint":
    "What the engine runs when it reaches this task. Changing it changes which settings below apply.",
  "properties.taskType.default": "Java class or expression",
  "properties.taskType.http": "HTTP call",
  "properties.taskType.mail": "Send mail",
  "properties.taskType.dmn": "Decision (DMN)",
  "properties.taskType.shell": "Shell command",
  "properties.taskType.camel": "Camel route",
  "properties.taskType.case": "Start a case",
  "properties.taskType.send-event": "Send an event",
  "properties.taskType.external-worker": "External worker",
  "properties.taskType.http.configuredBy":
    "Configured through field injections below — requestUrl, requestMethod, requestBody and the rest.",
  "properties.taskType.mail.configuredBy":
    "Configured through field injections below — to, subject, and either text or html.",
  "properties.taskType.dmn.configuredBy":
    "Configured through field injections below — decisionTableReferenceKey names the decision to evaluate.",
  "properties.taskType.shell.configuredBy":
    "Configured through field injections below — command, arg1, arg2 and so on.",
  "properties.taskType.camel.configuredBy":
    "Configured through field injections below — camelContext selects the route.",
  "properties.topic": "Topic",
  "properties.topic.hint": "The queue name external workers poll for this task.",

  // Script tasks (§7.4.2)
  "properties.script": "Script",
  "properties.scriptFormat": "Language",
  "properties.scriptFormat.hint": "The script engine to use, e.g. groovy, juel or javascript.",
  "properties.script.body": "Script body",
  "properties.script.body.hint":
    "Runs when the token reaches this task. Process variables are in scope by name.",
  "properties.resultVariable": "Result variable",
  "properties.resultVariable.hint": "Process variable the script's return value is stored in.",
  "properties.autoStoreVariables": "Store every script variable as a process variable",
  "properties.autoStoreVariables.hint":
    "Off by default, and usually best left off — it writes every local script variable into the process, including temporaries.",

  // Field injections (§7.4.2) — how the whole service-task family is configured.
  "properties.fields": "Field injections",
  "properties.fields.hint":
    "Name/value pairs passed to whatever the task runs. HTTP, mail, decision and shell tasks are configured entirely through these.",
  "properties.fields.none": "No fields.",
  "properties.fields.name": "Name",
  "properties.fields.kind": "Value type",
  "properties.fields.kind.stringValue": "Text",
  "properties.fields.kind.expression": "Expression",
  "properties.fields.kind.string": "Text (multi-line)",
  "properties.fields.value": "Value",
  "properties.fields.add": "Add field",
  "properties.fields.remove": "Remove field {index}",

  // Call activity (§7.4.2)
  "properties.callActivity": "Called process",
  "properties.calledElement": "Called process key",
  "properties.calledElement.hint": "Key of the process definition this activity starts.",
  "properties.calledElementType": "Reference by",
  "properties.calledElementType.hint":
    "By key follows the latest deployed version; by id pins one specific version forever.",
  "properties.calledElementType.key": "Key (latest version)",
  "properties.calledElementType.id": "Id (a fixed version)",
  "properties.businessKey": "Business key",
  "properties.processInstanceName": "Instance name",
  "properties.inheritVariables": "Pass all parent variables in",
  "properties.inheritVariables.hint":
    "With this off, only the mappings below cross the boundary — which is usually what you want.",
  "properties.inheritBusinessKey": "Inherit the parent's business key",
  "properties.sameDeployment": "Resolve from the same deployment",
  "properties.fallbackToDefaultTenant": "Fall back to the default tenant",
  "properties.mapping.in": "Variables in",
  "properties.mapping.in.hint": "Copied from this process into the called one when it starts.",
  "properties.mapping.out": "Variables out",
  "properties.mapping.out.hint": "Copied back when the called process finishes.",
  "properties.mapping.none": "No mappings.",
  "properties.mapping.source": "Source",
  "properties.mapping.sourceIsExpression": "Source is an expression",
  "properties.mapping.target": "Target variable",
  "properties.mapping.add": "Add mapping",
  "properties.mapping.remove": "Remove mapping {index}",

  // Business rule task (§7.4.2)
  "properties.ruleVariablesInput": "Input variables",
  "properties.ruleVariablesInput.hint": "Comma-separated process variables passed to the rules.",
  "properties.rules": "Rules",
  "properties.rules.hint": "Comma-separated rule names to evaluate. Empty means all of them.",

  // Start events (§7.4.2)
  "properties.initiator": "Initiator variable",
  "properties.initiator.hint": "Process variable the starting user's id is stored in.",
  "properties.formFieldValidation": "Validate form fields on completion",
  "properties.isInterrupting": "Interrupting",
  "properties.isExecutable": "Executable",
  "properties.versionTag": "Version tag",
  "properties.versionTag.hint": "Free-text label for this revision. Not used by the engine.",

  // Gateways (§7.4.2)
  "properties.defaultFlow": "Default flow",
  "properties.defaultFlow.hint":
    "Taken when no other outgoing flow's condition is true. Without one, the engine fails if nothing matches.",
  "properties.defaultFlow.none": "None",

  // Error / signal / message / escalation / conditional events (§7.4.2)
  "properties.boundary.errorForced":
    "An error boundary event always interrupts: the engine overrides this flag when it parses the model, so it is not offered.",
  "properties.event.error": "Error",
  "properties.event.error.ref": "Error code",
  "properties.event.error.hint":
    "Matched against the code a thrown error carries. Typing a new one declares it on the model.",
  "properties.event.signal": "Signal",
  "properties.event.signal.ref": "Signal name",
  "properties.event.signal.hint":
    "Signals are broadcast to every listener. Typing a new name declares it on the model.",
  "properties.event.message": "Message",
  "properties.event.message.ref": "Message name",
  "properties.event.message.hint":
    "A message goes to one recipient. Typing a new name declares it on the model.",
  "properties.event.escalation": "Escalation",
  "properties.event.escalation.ref": "Escalation code",
  "properties.event.escalation.hint":
    "Like an error, but does not have to be caught. Typing a new one declares it on the model.",
  "properties.event.conditional": "Condition",
  "properties.event.condition": "Condition expression",
  "properties.event.condition.hint": "Fires when this becomes true, e.g. ${amount > 10000}.",

  "properties.id": "Id",
  "properties.id.hint": "Referenced by the engine and by other models.",
  "properties.name": "Name",
  "properties.condition": "Condition",
  "properties.condition.hint":
    "An expression, e.g. ${amount > 1000}. Leave blank for an unconditional flow.",
  "properties.flowable": "Flowable",
  "properties.async": "Asynchronous",
  "properties.assignee": "Assignee",
  "properties.assignee.hint": "A user id, or an expression like ${initiator}.",
  "properties.candidateUsers": "Candidate users",
  "properties.candidateUsers.hint": "Comma-separated user ids.",
  "properties.candidateGroups": "Candidate groups",
  "properties.candidateGroups.hint": "Comma-separated group ids.",
  "properties.formKey": "Form key",
  "properties.formKey.hint": "Key of the form to render for this task.",
  "properties.dueDate": "Due date",
  "properties.dueDate.hint": "An expression, e.g. ${dueDate}.",
  "properties.class": "Class",
  "properties.class.hint": "Fully-qualified JavaDelegate class name.",
  "properties.expression": "Expression",
  "properties.delegateExpression": "Delegate expression",
  "properties.resultVariableName": "Result variable",
  "properties.candidateStarterUsers": "Candidate starter users",
  "properties.candidateStarterGroups": "Candidate starter groups",

  // Nested extension properties (§7.4.2)
  "properties.listeners.execution": "Execution listeners",
  "properties.listeners.execution.hint":
    "Code the engine runs as this element starts or ends.",
  "properties.listeners.task": "Task listeners",
  "properties.listeners.task.hint":
    "Code the engine runs as this task is created, assigned, completed or deleted.",
  "properties.listeners.none": "None.",
  "properties.listeners.add": "Add listener",
  "properties.listeners.remove": "Remove listener {index}",
  "properties.listeners.event": "On",
  "properties.listeners.implementation": "Implementation",
  "properties.listeners.value": "Value",

  "properties.multiInstance": "Multi-instance",
  "properties.multiInstance.mode": "Repeat",
  "properties.multiInstance.hint":
    "Runs this element once per item in a collection, or a fixed number of times.",
  "properties.multiInstance.none": "Once",
  "properties.multiInstance.parallel": "In parallel",
  "properties.multiInstance.sequential": "One after another",
  "properties.multiInstance.collection": "Collection",
  "properties.multiInstance.collection.hint":
    "Expression naming the collection to iterate, e.g. ${approvers}.",
  "properties.multiInstance.elementVariable": "Element variable",
  "properties.multiInstance.elementVariable.hint":
    "Name each item is bound to inside the loop.",
  "properties.multiInstance.cardinality": "Instances",
  "properties.multiInstance.cardinality.hint":
    "A fixed count, instead of a collection. Ignored when a collection is set.",
  "properties.multiInstance.completionCondition": "Stop when",
  "properties.multiInstance.completionCondition.hint":
    "Ends the loop early, e.g. ${nrOfCompletedInstances >= 2}.",

  "properties.boundary": "Boundary event",
  "properties.boundary.interrupting": "Interrupting",
  "properties.boundary.interrupting.hint":
    "An interrupting event cancels the activity it is attached to. A non-interrupting one leaves it running and starts a parallel path.",
  "properties.timer.kind": "Fires",
  "properties.timer.duration": "After a duration",
  "properties.timer.date": "At a date and time",
  "properties.timer.cycle": "Repeatedly",
  "properties.timer.value": "When",
  "properties.timer.duration.hint": "An ISO-8601 duration, e.g. PT1H for one hour.",
  "properties.timer.date.hint": "An ISO-8601 date-time, e.g. 2026-12-24T09:00:00.",
  "properties.timer.cycle.hint": "An ISO-8601 repeating interval, e.g. R3/PT10M.",

  // DMN modeler (§7.4.4)
  "dmn.openFailed": "This decision model could not be opened.",
  "dmn.notReady": "The editor is not ready yet.",
  "dmn.serialiseFailed": "The decision model could not be serialised.",
  "dmn.loading": "Loading decision model",
  "dmn.deploy.title": "Deploy this decision?",
  "dmn.deploy.description":
    "\"{name}\" will be saved and deployed to the decision engine. Evaluations from now on use this version.",
  "dmn.deploy.confirm": "Save and deploy",

  // CMMN modeler (§7.4.3)
  "cmmn.openFailed": "This case model could not be opened.",
  "cmmn.saveFailed": "Could not save this case model.",
  "cmmn.loading": "Loading case model",
  "cmmn.palette": "Palette",
  "cmmn.canvasLabel": "Case diagram",
  "cmmn.caseRef": "Case reference",
  "cmmn.autoComplete": "Complete automatically",
  "cmmn.autoComplete.hint":
    "Finish as soon as no required item is still active. Without it the stage waits to be completed explicitly.",
  "cmmn.candidateStarterUsers": "Candidate starter users",
  "cmmn.candidateStarterUsers.hint": "Comma-separated user ids allowed to start this case.",
  "cmmn.candidateStarterGroups": "Candidate starter groups",
  "cmmn.candidateStarterGroups.hint": "Comma-separated group ids allowed to start this case.",
  "cmmn.initiatorVariableName": "Initiator variable",
  "cmmn.initiatorVariableName.hint": "Case variable the starting user's id is stored in.",
  "cmmn.taskType.hint":
    "What the engine runs. Leave blank for a class or expression given below.",
  "cmmn.lifecycleListeners": "Lifecycle listeners",
  "cmmn.lifecycleListeners.hint":
    "Run something as this item moves between states. Leave a state blank to match any.",
  "cmmn.lifecycleListeners.none": "No lifecycle listeners.",
  "cmmn.lifecycleListeners.from": "From state",
  "cmmn.lifecycleListeners.to": "To state",
  "cmmn.lifecycleListeners.anyState": "Any",
  "cmmn.lifecycleListeners.add": "Add lifecycle listener",
  "cmmn.lifecycleListeners.remove": "Remove lifecycle listener {index}",
  "cmmn.addPart": "Add another trigger",
  "cmmn.removePart": "Remove trigger",
  "cmmn.fields": "Field injections",
  "cmmn.fields.hint":
    "Name/value pairs passed to whatever the task runs. HTTP, mail and decision tasks are configured entirely through these.",
  "cmmn.fields.none": "No fields.",
  "cmmn.fields.name": "Name",
  "cmmn.fields.kind": "Value type",
  "cmmn.fields.kind.stringValue": "Text",
  "cmmn.fields.kind.expression": "Expression",
  "cmmn.fields.kind.string": "Text (element)",
  "cmmn.fields.kind.expressionElement": "Expression (element)",
  "cmmn.fields.value": "Value",
  "cmmn.fields.add": "Add field",
  "cmmn.fields.remove": "Remove field {index}",
  "cmmn.exitType": "Exit type",
  "cmmn.exitType.default": "Default",
  "cmmn.exitType.activeInstances": "Active instances",
  "cmmn.exitType.activeAndEnabledInstances": "Active and enabled instances",
  "cmmn.itemControl": "Behaviour",
  "cmmn.itemControl.hint":
    "How this item behaves inside its stage. Each rule can be unconditional, or guarded by an expression.",
  "cmmn.itemControl.required": "Required to complete the stage",
  "cmmn.itemControl.repetition": "Can repeat",
  "cmmn.itemControl.manualActivation": "Needs to be started by a person",
  "cmmn.itemControl.completionNeutral": "Does not hold up completion",
  "cmmn.itemControl.condition": "Condition",
  "cmmn.itemControl.condition.hint": "Leave empty to apply always, e.g. ${amount > 1000}.",
  "cmmn.caseRef.hint": "Key of the case definition this task starts.",
  "cmmn.implementation": "Implementation",
  "cmmn.implementation.hint": "What the engine runs. Give exactly one of these.",
  "cmmn.timerExpression": "Timer expression",
  "cmmn.timerExpression.hint":
    "When the listener fires — an ISO-8601 duration, date or repeating interval, or an expression producing one.",
  "cmmn.checksLabel": "Case checks",
  "cmmn.checksClean": "No problems found.",
  "cmmn.fixBeforeDeploy": "Fix the problems listed below before deploying.",
  "cmmn.checks.unreachable": "Could not reach the engine's validator, so this case has not been checked.",
  // Which side reported a problem, shown as a badge beside the severity.
  "cmmn.checks.source.browser": "browser",
  "cmmn.checks.source.engine": "engine",
  "cmmn.checks.caveat.engine":
    "The engine's own case validator ran over this model, so what it reports is what a deploy would reject. Browser checks are shown alongside for what it does not cover.",
  "cmmn.checks.caveat.browserOnly":
    "These checks ran in the browser only \u2014 the engine has not seen this model, so passing here does not guarantee it will accept it.",
  "cmmn.xmlTitle": "CMMN XML",
  "cmmn.xmlDescription": "Exactly what will be deployed. Read-only \u2014 edit the diagram, not the text.",
  "cmmn.documentation": "Documentation",
  "cmmn.documentation.hint":
    "Why this element exists. Kept in the model as <documentation>, so it travels with the case rather than living in a wiki.",

  // Collapsible groups of `flowable:` attributes, rendered from flowableAttributes.ts.
  "cmmn.group.execution": "Execution",
  "cmmn.group.childTask": "What it starts",
  "cmmn.group.humanTask": "Task variables",
  "cmmn.group.serviceTask": "Result",
  "cmmn.group.stage": "Stage behaviour",
  "cmmn.group.milestone": "Milestone",
  "cmmn.group.listener": "Availability",
  "cmmn.group.repetition": "Repetition variables",
  "cmmn.group.count": "{set} of {total} set",

  "cmmn.attr.isBlockingExpression": "Blocking expression",
  "cmmn.attr.isBlockingExpression.hint":
    "Decides blocking per instance, overriding the checkbox above. Note the name: the engine reads isBlockingExpression.",
  "cmmn.attr.async": "Run asynchronously",
  "cmmn.attr.async.hint":
    "The engine hands the work to a job instead of running it on the thread that triggered it.",
  "cmmn.attr.exclusive": "Exclusive",
  "cmmn.attr.exclusive.hint":
    "Asynchronous jobs for this case instance do not run at the same time as each other.",
  "cmmn.attr.asyncLeave": "Leave asynchronously",
  "cmmn.attr.asyncLeave.hint": "The same, applied to finishing rather than starting.",
  "cmmn.attr.asyncLeaveExclusive": "Exclusive on leave",
  "cmmn.attr.asyncLeaveExclusive.hint": "Exclusivity for the leave job.",

  "cmmn.attr.businessKey": "Business key",
  "cmmn.attr.businessKey.hint": "Expression giving the business key of what this starts.",
  "cmmn.attr.inheritBusinessKey": "Inherit the business key",
  "cmmn.attr.inheritBusinessKey.hint": "Pass this case's business key down instead.",
  "cmmn.attr.sameDeployment": "Resolve in the same deployment",
  "cmmn.attr.sameDeployment.hint":
    "Look for the referenced definition in this case's own deployment before the latest version anywhere.",
  "cmmn.attr.fallbackToDefaultTenant": "Fall back to the default tenant",
  "cmmn.attr.fallbackToDefaultTenant.hint":
    "If this tenant has no such definition, use the default tenant's.",
  "cmmn.attr.idVariableName": "Id variable",
  "cmmn.attr.idVariableName.hint":
    "Case variable to hold the id of the process or case instance this starts.",

  "cmmn.attr.taskIdVariableName": "Task id variable",
  "cmmn.attr.taskIdVariableName.hint": "Case variable to hold the created task's id.",
  "cmmn.attr.taskCompleterVariableName": "Completed-by variable",
  "cmmn.attr.taskCompleterVariableName.hint":
    "Case variable to hold the id of whoever completed the task.",

  "cmmn.attr.storeResultVariableAsTransient": "Result is transient",
  "cmmn.attr.storeResultVariableAsTransient.hint":
    "The result variable lives for this transaction only and is never persisted.",

  "cmmn.attr.autoCompleteCondition": "Auto-complete condition",
  "cmmn.attr.autoCompleteCondition.hint":
    "Expression deciding auto-completion per instance, rather than the fixed checkbox.",
  "cmmn.attr.businessStatus": "Business status",
  "cmmn.attr.businessStatus.hint": "Status this contributes to the case's stage overview.",
  "cmmn.attr.displayOrder": "Display order",
  "cmmn.attr.displayOrder.hint": "Position in the stage overview. Lower comes first.",
  "cmmn.attr.includeInStageOverview": "Show in the stage overview",
  "cmmn.attr.includeInStageOverview.hint":
    "Whether the engine's stage overview lists this at all.",
  "cmmn.attr.milestoneVariable": "Milestone variable",
  "cmmn.attr.milestoneVariable.hint": "Case variable set when the milestone is reached.",
  "cmmn.attr.formKey": "Form key",
  "cmmn.attr.formKey.hint": "Form shown for the stage itself.",
  "cmmn.attr.formFieldValidation": "Validate form fields",
  "cmmn.attr.formFieldValidation.hint": "Enforce the form's own validation on submit.",

  "cmmn.attr.availableCondition": "Available condition",
  "cmmn.attr.availableCondition.hint":
    "Expression deciding when the listener becomes available — which is not the same as when it fires.",

  "cmmn.attr.counterVariable": "Counter variable",
  "cmmn.attr.counterVariable.hint": "Case variable holding the repetition count.",
  "cmmn.attr.collectionVariable": "Collection variable",
  "cmmn.attr.collectionVariable.hint": "Collection to repeat over: one instance per entry.",
  "cmmn.attr.elementVariable": "Element variable",
  "cmmn.attr.elementVariable.hint": "Case variable holding this instance's entry.",
  "cmmn.attr.elementIndexVariable": "Element index variable",
  "cmmn.attr.elementIndexVariable.hint": "Case variable holding this instance's position.",
  "cmmn.attr.maxInstanceCount": "Maximum instances",
  "cmmn.attr.maxInstanceCount.hint": "Cap on how many instances repetition may create.",
  "cmmn.attr.ignoreCounterVariable": "Ignore the counter variable",
  "cmmn.attr.ignoreCounterVariable.hint":
    "Do not maintain a repetition counter, which is cheaper when nothing reads it.",

  "cmmn.taskFields.scriptTask": "Script",
  "cmmn.taskFields.httpTask": "Request",
  "cmmn.taskFields.mailTask": "Message",

  "cmmn.field.script": "Script",
  "cmmn.field.script.hint": "The body the engine runs, in the language above.",
  "cmmn.field.requestMethod": "Method",
  "cmmn.field.requestMethod.hint": "GET, POST, PUT, DELETE. Required — the engine refuses the instance without it.",
  "cmmn.field.requestUrl": "URL",
  "cmmn.field.requestUrl.hint": "Required. Expressions are resolved against the case's variables.",
  "cmmn.field.requestHeaders": "Headers",
  "cmmn.field.requestHeaders.hint": "One per line, as name: value.",
  "cmmn.field.requestBody": "Body",
  "cmmn.field.requestBody.hint": "Sent as-is. Use an expression to build it from case variables.",
  "cmmn.field.requestBodyEncoding": "Body encoding",
  "cmmn.field.requestBodyEncoding.hint": "Character set for the body. Defaults to the platform's.",
  "cmmn.field.requestTimeout": "Timeout",
  "cmmn.field.requestTimeout.hint": "Milliseconds. Zero or empty means the engine's default.",
  "cmmn.field.requestSecureHeaders": "Secure headers",
  "cmmn.field.requestSecureHeaders.hint": "Headers kept out of the stored request — put credentials here, not above.",
  "cmmn.field.disallowRedirects": "Do not follow redirects",
  "cmmn.field.disallowRedirects.hint": "true to fail on a redirect instead of following it.",
  "cmmn.field.failStatusCodes": "Fail on status",
  "cmmn.field.failStatusCodes.hint": "Comma-separated codes or ranges, e.g. 400,5XX. These raise an error.",
  "cmmn.field.handleStatusCodes": "Handle status",
  "cmmn.field.handleStatusCodes.hint": "Codes that raise a catchable error rather than failing the instance.",
  "cmmn.field.ignoreException": "Ignore exceptions",
  "cmmn.field.ignoreException.hint": "true to continue past a failure instead of stopping.",
  "cmmn.field.saveRequestVariables": "Save the request",
  "cmmn.field.saveRequestVariables.hint": "true to store the request as case variables.",
  "cmmn.field.saveResponseParameters": "Save the response",
  "cmmn.field.saveResponseParameters.hint": "true to store status, headers and body as case variables.",
  "cmmn.field.saveResponseParametersTransient": "Response is transient",
  "cmmn.field.saveResponseParametersTransient.hint": "Stored for the transaction only, never persisted.",
  "cmmn.field.saveResponseVariableAsJson": "Response as JSON",
  "cmmn.field.saveResponseVariableAsJson.hint": "Store the body as JSON rather than as a string.",
  "cmmn.field.responseVariableName": "Response variable",
  "cmmn.field.responseVariableName.hint": "Case variable to hold the response body.",
  "cmmn.field.resultVariablePrefix": "Result prefix",
  "cmmn.field.resultVariablePrefix.hint": "Prefix for the saved request and response variables.",
  "cmmn.field.to": "To",
  "cmmn.field.to.hint": "Required. Comma-separated addresses, or an expression giving them.",
  "cmmn.field.from": "From",
  "cmmn.field.from.hint": "Overrides the engine's configured sender.",
  "cmmn.field.cc": "Cc",
  "cmmn.field.cc.hint": "Comma-separated addresses.",
  "cmmn.field.bcc": "Bcc",
  "cmmn.field.bcc.hint": "Comma-separated addresses.",
  "cmmn.field.subject": "Subject",
  "cmmn.field.subject.hint": "Plain text or an expression.",
  "cmmn.field.text": "Plain-text body",
  "cmmn.field.text.hint": "Sent to clients that cannot show HTML, and as the fallback.",
  "cmmn.field.html": "HTML body",
  "cmmn.field.html.hint": "Sent in preference to the plain-text body where the client supports it.",
  "cmmn.field.charset": "Character set",
  "cmmn.field.charset.hint": "Defaults to the platform's.",
  "cmmn.field.headers": "Headers",
  "cmmn.field.headers.hint": "One per line, as name: value.",
  "cmmn.field.attachments": "Attachments",
  "cmmn.field.attachments.hint": "Expression resolving to a file, a list of files, or a data source.",
  "cmmn.field.exceptionVariableName": "Exception variable",
  "cmmn.field.exceptionVariableName.hint": "Case variable to hold the failure, when exceptions are ignored.",
  "cmmn.rename": "Rename {name}",
  "cmmn.duplicate": "Duplicate",
  "cmmn.startTrigger": "Starts after",
  "cmmn.startTrigger.hint":
    "Which plan item has to happen before the clock starts. Left unset, the timer starts as soon as its stage is available.",
  "cmmn.startTrigger.source": "Start after this element",
  "cmmn.startTrigger.none": "Nothing — start with the stage",

  "cmmn.defaultControl": "Default rules",
  "cmmn.defaultControl.hint":
    "Applied to any plan item pointing at this definition that has no rules of its own. Only worth setting where more than one plan item shares the definition.",

  "cmmn.sendEvent": "Event",
  "cmmn.sendEvent.eventType": "Event key",
  "cmmn.sendEvent.eventType.hint":
    "Key of the event definition in the event registry. Its outbound channel is resolved from there, so there is nothing to name here.",
  "cmmn.sendEvent.in": "Sent with the event",
  "cmmn.sendEvent.in.hint": "Case variables carried out into the event's payload.",
  "cmmn.sendEvent.out": "Read back from the response",
  "cmmn.sendEvent.out.hint": "Event fields carried back into case variables.",
  "cmmn.sendEvent.source": "Variable",
  "cmmn.sendEvent.sourceExpression": "Or expression",
  "cmmn.sendEvent.target": "Maps to",
  "cmmn.sendEvent.transient": "Transient",
  "cmmn.sendEvent.remove": "Remove mapping {index}",
  "cmmn.sendEvent.add.in": "Add a value to send",
  "cmmn.sendEvent.add.out": "Add a value to read back",

  "cmmn.group.externalWorkerTask": "External worker",
  "cmmn.group.casePageTask": "Page",

  "cmmn.attr.topic": "Topic",
  "cmmn.attr.topic.hint":
    "Queue an external worker polls for this work. Required — nothing picks the task up without it.",
  "cmmn.attr.label": "Tab label",
  "cmmn.attr.label.hint": "Shown on the tab in the case UI. Falls back to the task's name.",
  "cmmn.attr.icon": "Icon",
  "cmmn.attr.icon.hint": "Icon name for the tab, as your case UI understands it.",

  "cmmn.group.scriptTask": "Script",
  "cmmn.group.httpTask": "HTTP",
  "cmmn.group.signalListener": "Signal",
  "cmmn.group.variableListener": "Variable",

  "cmmn.attr.scriptFormat": "Script language",
  "cmmn.attr.scriptFormat.hint":
    "A JSR-223 engine name — groovy or juel in a stock engine. Anything else has to be on the classpath.",
  "cmmn.attr.resultVariableName": "Result variable",
  "cmmn.attr.resultVariableName.hint":
    "Case variable to hold what the script returns. Note the name: CMMN reads resultVariableName where BPMN reads resultVariable.",
  "cmmn.attr.autoStoreVariables": "Store script variables",
  "cmmn.attr.autoStoreVariables.hint":
    "Write every variable the script declares back to the case, not only the result. Off is usually what you want.",
  "cmmn.attr.doNotIncludeVariables": "Do not pass case variables in",
  "cmmn.attr.doNotIncludeVariables.hint":
    "The script runs without the case's variables, which is cheaper on a large case.",
  "cmmn.attr.parallelInSameTransaction": "Run parallel calls in one transaction",
  "cmmn.attr.parallelInSameTransaction.hint":
    "Only meaningful on a repeating HTTP task: its instances share a transaction instead of taking one each.",

  "cmmn.attr.signalRef": "Signal",
  "cmmn.attr.signalRef.hint": "Name of the signal this listener waits for.",
  "cmmn.attr.variableName": "Variable",
  "cmmn.attr.variableName.hint": "Case variable whose change fires this listener.",
  "cmmn.attr.variableChangeType": "Fires on",
  "cmmn.attr.variableChangeType.hint":
    "create, update, update-create, or delete. Left empty, the engine watches all of them.",

  "cmmn.exitEventType": "Ends the stage as",
  "cmmn.exitEventType.default": "Terminated (default)",
  "cmmn.exitEventType.exit": "Terminated",
  "cmmn.exitEventType.complete": "Completed",
  "cmmn.exitEventType.forceComplete": "Completed, even if work remains",

  "cmmn.elementLabel": "{name} ({type})",
  "cmmn.deploy.title": "Deploy this case?",
  "cmmn.deploy.description":
    "\"{name}\" will be saved and deployed to the case engine. New case instances use this version; instances already running keep the version they started on.",
  "cmmn.deploy.confirm": "Save and deploy",
  "cmmn.caseProperties": "Case properties",
  "cmmn.case": "Case",
  "cmmn.caseId": "Case id",
  "cmmn.caseId.hint": "The key the engine starts this case by.",
  "cmmn.caseName": "Case name",
  "cmmn.planModelName": "Plan model name",
  "cmmn.id.hint": "Referenced by the engine and by sentries.",
  "cmmn.assignee.hint": "A user id, or an expression.",
  "cmmn.processRef": "Process reference",
  "cmmn.processRef.hint": "Key of the BPMN process to start.",
  "cmmn.decisionRef": "Decision reference",
  "cmmn.decisionRef.hint": "Key of the DMN decision to evaluate.",
  "cmmn.entryCriteria": "Entry criteria",
  "cmmn.entryCriteria.hint": "Start this item when the watched item reaches the chosen event.",
  "cmmn.entryCriteria.none": "Starts as soon as its stage becomes active.",
  "cmmn.entryCriteria.add": "Add entry criterion",
  "cmmn.exitCriteria": "Exit criteria",
  "cmmn.exitCriteria.hint": "Terminate this item when the watched item reaches the chosen event.",
  "cmmn.exitCriteria.none": "Runs until it completes on its own.",
  "cmmn.exitCriteria.add": "Add exit criterion",
  "cmmn.onEvent": "On event",
  "cmmn.blocking": "Blocking",
  "cmmn.deleteElement": "Delete element",
  "cmmn.waitFor": "Wait for",
  "cmmn.chooseElement": "Choose an element…",
  "cmmn.removeCriterion": "Remove criterion",

  // App builder (§7.4.5)
  "app.saveFailed": "Could not save this app.",
  "app.definition": "App definition",
  "app.details": "Details",
  "app.field.name": "Name",
  "app.field.key": "Key",
  "app.field.key.hint": "Identifies the app in the engine.",
  "app.field.description": "Description",
  "app.field.icon": "Icon",
  "app.field.icon.hint": "Glyph name, e.g. glyphicon-cog.",
  "app.field.theme": "Theme",
  "app.field.theme.hint":
    "Recorded on the draft only \u2014 this distribution's app engine does not read a theme.",
  "app.field.tags": "Tags",
  "app.field.tags.hint": "Comma separated. Used to group apps here, not by the engine.",
  "app.field.displayOrder": "Display order",
  "app.field.displayOrder.hint": "Lower sorts first. Leave empty to sort after everything numbered.",
  "app.export": "Export",
  "app.exported": "\u201c{name}\u201d exported as an archive.",
  "app.exportFailed": "The app could not be exported.",
  "app.field.keyError": "Start with a letter or underscore; no spaces.",
  // App-level variables (W3.3)
  // Runtime preview (W3.3)
  "preview.action": "Test run",
  "preview.title": "Start a test instance",
  "preview.description": "Runs \u201c{name}\u201d on the engine you just deployed to.",
  "preview.warning":
    "This starts a real process instance in the current tenant. There is no sandbox in this distribution \u2014 whatever it does, it has done, and it will appear in Control like any other instance.",
  "preview.businessKey": "Business key",
  "preview.businessKey.hint":
    "Optional \u2014 leave it empty and the instance still starts. It is your own reference for this run, such as an order number or a customer id: the engine stores it alongside the instance so you can search for it in Control instead of hunting through generated ids.",
  "preview.start": "Start it",
  "preview.started": "Started instance {id}.",
  "preview.failed": "The instance could not be started.",
  "preview.instance": "Instance",
  "preview.waitingAt": "Waiting at",
  "preview.completed": "Finished without waiting",
  "app.variables": "Variables",
  "app.variables.hint":
    "Draft-only. This distribution's app engine reads no app-level variables, so these record what the app expects rather than setting anything when it is published.",
  "app.variable.name": "Name",
  "app.variable.name.invalid":
    "Use letters, digits and underscores, starting with a letter or underscore.",
  "app.variable.type": "Type",
  "app.variable.mode": "When published",
  "app.variable.mode.hint":
    "A value is overwritten on every deployment; a default only applies where the variable has none yet.",
  "app.variable.mode.value": "Always set it",
  "app.variable.mode.default": "Only if unset",
  "app.variable.value": "Value",
  "app.variable.add": "Add a variable",
  "app.publishedVersions": "Published versions",
  "app.cannotPublish": "Can't publish: {models} have no saved content.",
  "app.published": "Published \"{name}\" with {count} models.",
  "app.publishFailed": "Publishing failed.",
  "app.publish.title": "Publish this app?",
  "app.publish.description":
    "\"{name}\" and its {count} bundled models will be deployed to the engine. New instances use these versions; anything already running keeps the version it started on.",
  "app.publish.confirm": "Save and publish",

  // Form builder (§7.4.6)
  "form.saveFailed": "Could not save this form.",
  "form.definition": "Form definition",
  "form.palette": "Field palette",

  /* ── W2.3 (I2, I3): form builder parity ───────────────────────────────── */

  "form.palette.entry": "Data entry",
  "form.palette.selection": "Selection",
  "form.palette.people": "People",
  "form.palette.display": "Display",
  "form.palette.container": "Container",

  "form.field.width": "Width",
  "form.field.width.hint": "Fields narrower than full width sit side by side on one row.",
  "form.field.width.12": "Full width",
  "form.field.width.6": "Half",
  "form.field.width.4": "One third",
  "form.field.width.3": "One quarter",
  "form.field.moveUp": "Move {name} up",
  "form.field.moveDown": "Move {name} down",

  "form.field.hint": "Helper text",
  "form.field.hint.hint": "Shown under the field. Say what a good answer looks like.",
  "form.field.minLength": "Minimum length",
  "form.field.maxLength": "Maximum length",
  "form.field.pattern": "Must match",
  "form.field.pattern.hint": "A regular expression. Leave empty for no pattern check.",
  "form.field.patternMessage": "Message when it does not match",
  "form.field.patternMessage.hint":
    "Shown instead of the default. Say what is wrong, not that the pattern failed.",
  "form.field.min": "Minimum value",
  "form.field.max": "Maximum value",
  "form.field.accept": "Accepted file types",
  "form.field.accept.hint": "As an HTML accept list \u2014 for example .pdf,.png or image/*.",
  "form.field.maxFileSize": "Maximum file size (bytes)",
  "form.field.maxFileSize.hint": "Leave empty for no limit beyond the server's own.",
  "form.field.visibleWhen": "Show only when",
  "form.field.visibleWhen.hint":
    "Another field's id, optionally with a value \u2014 approved, or approved=true. Empty means always shown.",
  "form.addField": "Add field",
  "form.key": "Form key",
  "form.key.hint": "Referenced by a user task's form key.",
  "form.name": "Form name",
  "form.noFields": "No fields yet — add one from the palette.",
  "form.fields.one": "1 field",
  "form.fields.other": "{count} fields",
  "form.field.id": "Id",
  "form.view": "Form view",
  "form.tab.preview": "Preview",
  "form.tab.data": "Data",

  // Per-model label translations (W3.3)
  "form.field.translations": "Translations",
  "form.field.translations.hint":
    "The label above is the source text and the fallback: a reader whose language isn't listed sees it, never a blank.",
  "form.field.translation": "Label ({locale})",
  "form.field.translation.add": "Add a language",
  "form.field.translation.add.hint": "A language tag, e.g. de or fr-CA.",

  // The data model a form implies (W3.3)
  "form.data.label": "Data this form writes",
  "form.data.note":
    "Derived from the fields, not declared separately: a field's id is the process variable it writes. Change an id and this changes with it.",
  "form.data.empty": "This form writes nothing yet — add a field.",
  "form.data.variable": "Variable",
  "form.data.type": "Type",
  "form.data.required": "Required",
  "form.data.writtenBy": "Written by",
  "form.data.unnamed": "(no id)",
  "form.data.problem.duplicate":
    "Two fields write \u201c{name}\u201d. Only the last one submitted survives.",
  "form.data.problem.invalid-name":
    "\u201c{name}\u201d isn't usable in an expression. Use letters, digits and underscores, starting with a letter or underscore.",
  "form.data.problem.missing-name": "A field has no id, so it writes nothing.",
  "form.deployNote":
    "Forms deploy as part of an app. Add this form to an app in the model library and publish that — and note it only takes effect where a form engine is configured.",

  // Live preview (§7.4.6) — the same renderer the Work app uses at runtime.
  "form.preview.label": "Form preview",
  "form.preview.note":
    "This is the form exactly as someone filling it in will see it. Try it: required fields, visibility rules and validation all behave here as they will on a task.",
  "form.preview.submit": "Submit",
  "form.preview.reset": "Reset preview",
  "form.preview.valid": "The form is complete — nothing would block a submit.",
  "form.outcomes": "Outcomes ({count})",
  "form.outcomes.blurb":
    "Named submit buttons. With none, the task shows a single \"Complete task\"; with outcomes, each becomes its own button and the choice is recorded as a variable.",
  "form.outcome": "Outcome {index}",
  "form.outcome.remove": "Remove outcome {index}",
  "form.outcome.add": "Add outcome",
  "form.option.add": "Add option",
  "form.field.delete": "Delete field",
  "form.selectField": "Select a field to edit its properties.",
  "form.outcomeVariable": "Outcome variable",
  "form.outcomeVariable.hint":
    "Where the chosen outcome is stored. Defaults to form_<key>_outcome.",
  "form.fieldProperties": "Field properties",
  "form.field.id.hint": "Becomes the process variable name.",
  "form.field.label": "Label",
  "form.field.placeholder": "Placeholder",
  "form.options": "Options",
  "form.option": "Option {index}",
  "form.option.remove": "Remove option {index}",
  "form.visibility.title": "Show this field",
  "form.visibility.when": "When",
  "form.visibility.needAnother": "Add another field first.",
  "form.visibility.always": "Leave as Always to show it unconditionally.",
  "form.visibility.alwaysOption": "Always",
  "form.visibility.condition": "Condition",
  "form.visibility.isSet": "has any answer",
  "form.visibility.isEmpty": "is empty",
  "form.visibility.equals": "equals",
  "form.visibility.notEquals": "does not equal",
  "form.visibility.value": "Value",

  // Event registry editor (§7.4.6)
  "event.definition": "Event definition",
  "event.section.event": "Event",
  "event.key": "Event key",
  "event.key.hint": "Referenced by process and case models.",
  "event.name": "Event name",
  "event.payload.none": "No payload fields.",
  "event.addField": "Add field",
  "event.correlation": "Correlation",
  "event.removeEvent": "Remove event",
  "event.addEvent": "Add an event definition",
  "event.removeChannel": "Remove channel",
  "event.addChannel": "Add a channel",
  "event.payload.name": "Name",
  "event.payload.type": "Type",
  "event.payload.remove": "Remove field {name}",
  "event.section.channel": "Channel",
  "event.channel.key": "Channel key",
  "event.channel.name": "Channel name",
  "event.channel.direction": "Direction",
  "event.channel.inbound": "Inbound — receive events",
  "event.channel.outbound": "Outbound — send events",
  "event.channel.transport": "Transport",
  "event.channel.destination": "Destination",
  "event.channel.destination.hint": "Queue, topic or exchange name.",
  "event.channel.mapsTo": "Maps to event key",
  "event.channel.mapsTo.hint": "Which event an incoming message becomes.",
  "event.deployed": "Deployed {what}.",
  "event.deploy.title": "Deploy to the event registry?",
  "event.deploy.description":
    "{what} will be deployed. An inbound channel starts listening as soon as it is deployed.",
  "event.deploy.confirm": "Save and deploy",
  "event.deploy.eventDefinition": "the event definition",
  "event.deploy.channel": "the channel",
} satisfies Messages;

export const designMessages: Catalogues = { en: designEn };
