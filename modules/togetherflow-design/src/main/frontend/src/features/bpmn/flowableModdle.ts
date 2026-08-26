/**
 * Moddle descriptor for Flowable's BPMN extension attributes.
 *
 * Without this, bpmn-js does not know the `flowable:` namespace and **silently drops
 * every one of these attributes on save** — a diagram would round-trip through the
 * editor and come back stripped of its assignees, form keys and service-task classes.
 * That is the single most damaging failure mode for a modeller, so the descriptor is
 * defined explicitly rather than borrowed from Camunda's (whose namespace URI and
 * several attribute names differ).
 *
 * Scope is deliberately the attributes TogetherFlow's properties panel edits, plus the
 * ones commonly present in existing Flowable models so they survive an edit. It is not
 * a complete model of every Flowable extension.
 */

export const FLOWABLE_NAMESPACE = "http://flowable.org/bpmn";

export const flowableModdleDescriptor = {
  name: "Flowable",
  uri: FLOWABLE_NAMESPACE,
  prefix: "flowable",
  xml: { tagAlias: "lowerCase" },
  associations: [],
  types: [
    {
      name: "UserTask",
      extends: ["bpmn:UserTask"],
      properties: [
        { name: "assignee", isAttr: true, type: "String" },
        { name: "owner", isAttr: true, type: "String" },
        { name: "candidateUsers", isAttr: true, type: "String" },
        { name: "candidateGroups", isAttr: true, type: "String" },
        { name: "dueDate", isAttr: true, type: "String" },
        { name: "category", isAttr: true, type: "String" },
        { name: "priority", isAttr: true, type: "String" },
        { name: "formKey", isAttr: true, type: "String" },
        { name: "formFieldValidation", isAttr: true, type: "String" },
        { name: "skipExpression", isAttr: true, type: "String" },
        { name: "businessCalendarName", isAttr: true, type: "String" },
        { name: "taskIdVariableName", isAttr: true, type: "String" },
      ],
    },
    {
      name: "ServiceTask",
      extends: ["bpmn:ServiceTask", "bpmn:SendTask"],
      properties: [
        { name: "class", isAttr: true, type: "String" },
        { name: "expression", isAttr: true, type: "String" },
        { name: "delegateExpression", isAttr: true, type: "String" },
        { name: "resultVariableName", isAttr: true, type: "String" },
        /**
         * The Flowable task subtype: `http`, `mail`, `dmn`, `shell`, `camel`, `case`,
         * `send-event`, `external-worker`. Every one of those is a `bpmn:ServiceTask` in
         * the XML, distinguished only by this attribute — which is why the panel offers it
         * as a selector rather than leaving it to bpmn-js's replace menu, whose vocabulary
         * is standard BPMN only.
         */
        { name: "type", isAttr: true, type: "String" },
        /** External worker tasks poll this queue name. Meaningless on other subtypes. */
        { name: "topic", isAttr: true, type: "String" },
        { name: "skipExpression", isAttr: true, type: "String" },
        { name: "triggerable", isAttr: true, type: "Boolean" },
        { name: "useLocalScopeForResultVariable", isAttr: true, type: "Boolean" },
        { name: "storeResultVariableAsTransient", isAttr: true, type: "Boolean" },
        { name: "extensionId", isAttr: true, type: "String" },
      ],
    },
    {
      /**
       * `scriptFormat` and the `<script>` body are standard BPMN and already known to
       * bpmn-moddle. Only Flowable's own additions are declared here — note the engine
       * reads `flowable:resultVariable`, *not* `resultVariableName` as on a service task.
       * The two differ, and using the service-task spelling on a script task produces an
       * attribute the engine silently ignores.
       */
      name: "ScriptTask",
      extends: ["bpmn:ScriptTask"],
      properties: [
        { name: "resultVariable", isAttr: true, type: "String" },
        { name: "autoStoreVariables", isAttr: true, type: "Boolean" },
        { name: "doNotIncludeVariables", isAttr: true, type: "Boolean" },
        { name: "skipExpression", isAttr: true, type: "String" },
      ],
    },
    {
      /**
       * `calledElement` is standard BPMN; everything below is Flowable's. Without them a
       * call activity keeps its target but loses how it is called on the first save.
       */
      name: "CallActivity",
      extends: ["bpmn:CallActivity"],
      properties: [
        { name: "calledElementType", isAttr: true, type: "String" },
        { name: "inheritVariables", isAttr: true, type: "Boolean" },
        { name: "sameDeployment", isAttr: true, type: "Boolean" },
        { name: "fallbackToDefaultTenant", isAttr: true, type: "Boolean" },
        { name: "businessKey", isAttr: true, type: "String" },
        { name: "inheritBusinessKey", isAttr: true, type: "Boolean" },
        { name: "processInstanceName", isAttr: true, type: "String" },
        { name: "completeAsync", isAttr: true, type: "Boolean" },
        { name: "useLocalScopeForOutParameters", isAttr: true, type: "Boolean" },
        { name: "idVariableName", isAttr: true, type: "String" },
      ],
    },
    {
      name: "BusinessRuleTask",
      extends: ["bpmn:BusinessRuleTask"],
      properties: [
        { name: "ruleVariablesInput", isAttr: true, type: "String" },
        { name: "rules", isAttr: true, type: "String" },
        { name: "resultVariable", isAttr: true, type: "String" },
        { name: "class", isAttr: true, type: "String" },
        { name: "exclude", isAttr: true, type: "Boolean" },
      ],
    },
    {
      /** `isInterrupting` is standard BPMN; these three are Flowable's. */
      name: "StartEvent",
      extends: ["bpmn:StartEvent"],
      properties: [
        { name: "initiator", isAttr: true, type: "String" },
        { name: "formKey", isAttr: true, type: "String" },
        { name: "formFieldValidation", isAttr: true, type: "String" },
        { name: "sameDeployment", isAttr: true, type: "Boolean" },
      ],
    },
    {
      /**
       * Flowable's own additions to standard BPMN multi-instance. `isSequential`,
       * `loopCardinality` and `completionCondition` are standard and need no declaration;
       * these three are not, and without them a multi-instance task loses the collection
       * it iterates on the first save.
       */
      name: "MultiInstanceLoopCharacteristics",
      extends: ["bpmn:MultiInstanceLoopCharacteristics"],
      properties: [
        { name: "collection", isAttr: true, type: "String" },
        { name: "elementVariable", isAttr: true, type: "String" },
        { name: "elementIndexVariable", isAttr: true, type: "String" },
      ],
    },
    {
      name: "Process",
      extends: ["bpmn:Process"],
      properties: [
        { name: "candidateStarterUsers", isAttr: true, type: "String" },
        { name: "candidateStarterGroups", isAttr: true, type: "String" },
        { name: "versionTag", isAttr: true, type: "String" },
      ],
    },
    {
      /** Async/exclusive apply to most flow nodes, not just service tasks. */
      name: "AsyncCapable",
      isAbstract: true,
      extends: ["bpmn:Activity", "bpmn:Gateway", "bpmn:Event"],
      properties: [
        { name: "async", isAttr: true, type: "Boolean", default: false },
        { name: "exclusive", isAttr: true, type: "Boolean", default: true },
      ],
    },
    {
      name: "FormProperty",
      superClass: ["Element"],
      properties: [
        { name: "id", isAttr: true, type: "String" },
        { name: "name", isAttr: true, type: "String" },
        { name: "type", isAttr: true, type: "String" },
        { name: "expression", isAttr: true, type: "String" },
        { name: "variable", isAttr: true, type: "String" },
        { name: "default", isAttr: true, type: "String" },
        { name: "datePattern", isAttr: true, type: "String" },
        { name: "required", isAttr: true, type: "Boolean" },
        { name: "readable", isAttr: true, type: "Boolean" },
        { name: "writable", isAttr: true, type: "Boolean" },
        /** The options of an `enum` form property. */
        { name: "values", type: "Value", isMany: true },
      ],
    },
    {
      /**
       * `<flowable:value>` serves two shapes: an id/name pair for an enum form property's
       * options, and a text body for a data object's default value. Declared with both so
       * one type covers each without a second element name.
       */
      name: "Value",
      superClass: ["Element"],
      properties: [
        { name: "id", isAttr: true, type: "String" },
        { name: "name", isAttr: true, type: "String" },
        { name: "value", isBody: true, type: "String" },
      ],
    },
    {
      /**
       * Process-level event listeners: engine events (a job failing, an instance ending)
       * rather than the execution listeners that hang off a single element.
       */
      name: "EventListener",
      superClass: ["Element"],
      properties: [
        { name: "events", isAttr: true, type: "String" },
        { name: "entityType", isAttr: true, type: "String" },
        { name: "class", isAttr: true, type: "String" },
        { name: "delegateExpression", isAttr: true, type: "String" },
        { name: "throwEvent", isAttr: true, type: "String" },
        { name: "signalName", isAttr: true, type: "String" },
        { name: "messageName", isAttr: true, type: "String" },
        { name: "errorCode", isAttr: true, type: "String" },
      ],
    },
    {
      /**
       * Maps a Java exception class to a BPMN error code, so a boundary error event can
       * catch it. The class name is the element's text; `errorCode` is mandatory — the
       * engine's parser throws outright on a mapException without one, which would make
       * the whole model unreadable rather than merely wrong.
       */
      name: "MapException",
      superClass: ["Element"],
      properties: [
        { name: "errorCode", isAttr: true, type: "String" },
        { name: "includeChildExceptions", isAttr: true, type: "Boolean" },
        { name: "rootCause", isAttr: true, type: "String" },
        { name: "value", isBody: true, type: "String" },
      ],
    },
    {
      /** How often a failed job is retried, as an ISO-8601 repeating interval. */
      name: "FailedJobRetryTimeCycle",
      superClass: ["Element"],
      properties: [{ name: "value", isBody: true, type: "String" }],
    },
    {
      /**
       * Collects a variable from every multi-instance iteration into one result. Sits
       * inside the loop characteristics, not the activity's extension elements.
       */
      name: "VariableAggregation",
      superClass: ["Element"],
      properties: [
        { name: "target", isAttr: true, type: "String" },
        { name: "targetExpression", isAttr: true, type: "String" },
        { name: "class", isAttr: true, type: "String" },
        { name: "delegateExpression", isAttr: true, type: "String" },
        { name: "storeAsTransientVariable", isAttr: true, type: "Boolean" },
        { name: "createOverviewVariable", isAttr: true, type: "Boolean" },
        { name: "definitions", type: "Variable", isMany: true },
      ],
    },
    {
      /**
       * One variable carried out of each iteration.
       *
       * Named `Variable` rather than anything more descriptive because moddle derives the
       * XML tag from the type name — with `tagAlias: "lowerCase"` this serialises as
       * `<flowable:variable>`, which is what the engine's parser looks for. A clearer type
       * name would produce a tag the engine ignores.
       */
      name: "Variable",
      superClass: ["Element"],
      properties: [
        { name: "source", isAttr: true, type: "String" },
        { name: "sourceExpression", isAttr: true, type: "String" },
        { name: "target", isAttr: true, type: "String" },
        { name: "targetExpression", isAttr: true, type: "String" },
      ],
    },
    {
      name: "ExecutionListener",
      superClass: ["Element"],
      properties: [
        { name: "event", isAttr: true, type: "String" },
        { name: "class", isAttr: true, type: "String" },
        { name: "expression", isAttr: true, type: "String" },
        { name: "delegateExpression", isAttr: true, type: "String" },
      ],
    },
    {
      name: "TaskListener",
      superClass: ["Element"],
      properties: [
        { name: "event", isAttr: true, type: "String" },
        { name: "class", isAttr: true, type: "String" },
        { name: "expression", isAttr: true, type: "String" },
        { name: "delegateExpression", isAttr: true, type: "String" },
      ],
    },
    {
      /**
       * Field injection. This is how the whole service-task family is configured — an
       * HTTP task's URL and method, a mail task's recipients, a DMN task's
       * `decisionTableReferenceKey` are all fields, not attributes.
       *
       * `stringValue` and `expression` are attributes; `string` is a child element, used
       * for values that would be awkward inside an attribute (multi-line bodies, XML).
       */
      name: "Field",
      superClass: ["Element"],
      properties: [
        { name: "name", isAttr: true, type: "String" },
        { name: "stringValue", isAttr: true, type: "String" },
        { name: "expression", isAttr: true, type: "String" },
        { name: "string", type: "String" },
      ],
    },
    {
      /**
       * Variable mapping into a called process or case. Lives inside
       * `<extensionElements>`, despite reading like a standard BPMN data association.
       */
      name: "In",
      superClass: ["Element"],
      properties: [
        { name: "source", isAttr: true, type: "String" },
        { name: "sourceExpression", isAttr: true, type: "String" },
        { name: "target", isAttr: true, type: "String" },
        { name: "targetExpression", isAttr: true, type: "String" },
        { name: "transient", isAttr: true, type: "Boolean" },
      ],
    },
    {
      /** Variable mapping back out of a called process or case. */
      name: "Out",
      superClass: ["Element"],
      properties: [
        { name: "source", isAttr: true, type: "String" },
        { name: "sourceExpression", isAttr: true, type: "String" },
        { name: "target", isAttr: true, type: "String" },
        { name: "targetExpression", isAttr: true, type: "String" },
        { name: "transient", isAttr: true, type: "Boolean" },
      ],
    },
  ],
};

/** Starting XML for a new process model. */
export function emptyBpmnDiagram(processKey: string, processName: string): string {
  const id = `Definitions_${Date.now().toString(36)}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:flowable="${FLOWABLE_NAMESPACE}"
                  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                  id="${id}"
                  targetNamespace="http://flowable.org/processdef">
  <bpmn:process id="${processKey}" name="${escapeXml(processName)}" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Start" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${processKey}">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="160" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
}

/** Starting XML for a new decision table. */
export function emptyDmnDiagram(decisionKey: string, decisionName: string): string {
  const id = `Definitions_${Date.now().toString(36)}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"
             xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/"
             xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/"
             id="${id}"
             name="${escapeXml(decisionName)}"
             namespace="http://flowable.org/dmn">
  <decision id="${decisionKey}" name="${escapeXml(decisionName)}">
    <decisionTable id="DecisionTable_${decisionKey}" hitPolicy="FIRST">
      <input id="Input_1" label="Input">
        <inputExpression id="InputExpression_1" typeRef="string">
          <text></text>
        </inputExpression>
      </input>
      <output id="Output_1" label="Output" name="output" typeRef="string" />
    </decisionTable>
  </decision>
  <dmndi:DMNDI>
    <dmndi:DMNDiagram id="DMNDiagram_1">
      <dmndi:DMNShape id="DMNShape_${decisionKey}" dmnElementRef="${decisionKey}">
        <dc:Bounds height="80" width="180" x="160" y="100" />
      </dmndi:DMNShape>
    </dmndi:DMNDiagram>
  </dmndi:DMNDI>
</definitions>
`;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
