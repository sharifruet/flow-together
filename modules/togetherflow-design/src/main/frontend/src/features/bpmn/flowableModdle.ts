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
        { name: "candidateUsers", isAttr: true, type: "String" },
        { name: "candidateGroups", isAttr: true, type: "String" },
        { name: "dueDate", isAttr: true, type: "String" },
        { name: "priority", isAttr: true, type: "String" },
        { name: "formKey", isAttr: true, type: "String" },
        { name: "formFieldValidation", isAttr: true, type: "String" },
        { name: "skipExpression", isAttr: true, type: "String" },
      ],
    },
    {
      name: "ServiceTask",
      extends: ["bpmn:ServiceTask"],
      properties: [
        { name: "class", isAttr: true, type: "String" },
        { name: "expression", isAttr: true, type: "String" },
        { name: "delegateExpression", isAttr: true, type: "String" },
        { name: "resultVariableName", isAttr: true, type: "String" },
        { name: "type", isAttr: true, type: "String" },
        { name: "async", isAttr: true, type: "Boolean" },
        { name: "exclusive", isAttr: true, type: "Boolean" },
      ],
    },
    {
      name: "ScriptTask",
      extends: ["bpmn:ScriptTask"],
      properties: [
        { name: "resultVariableName", isAttr: true, type: "String" },
        { name: "autoStoreVariables", isAttr: true, type: "Boolean" },
      ],
    },
    {
      name: "CallActivity",
      extends: ["bpmn:CallActivity"],
      properties: [
        { name: "calledElementType", isAttr: true, type: "String" },
        { name: "inheritVariables", isAttr: true, type: "Boolean" },
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
        { name: "required", isAttr: true, type: "Boolean" },
        { name: "readable", isAttr: true, type: "Boolean" },
        { name: "writable", isAttr: true, type: "Boolean" },
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
      name: "Field",
      superClass: ["Element"],
      properties: [
        { name: "name", isAttr: true, type: "String" },
        { name: "stringValue", isAttr: true, type: "String" },
        { name: "expression", isAttr: true, type: "String" },
        { name: "string", type: "String" },
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
