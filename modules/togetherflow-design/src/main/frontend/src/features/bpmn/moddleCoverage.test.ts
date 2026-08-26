/**
 * Moddle coverage (REQUIREMENTS.md §7.4.2).
 *
 * The failure this guards against is silent and expensive: bpmn-js only understands a
 * `flowable:` attribute if the moddle descriptor declares it. An undeclared one is parked
 * in `$attrs` — it may survive a round trip, but it never reads back into the properties
 * panel, so the panel shows an empty box for a value the model actually carries, and
 * writing that box can drop what was there.
 *
 * That bug is invisible by inspection, which is why it is a test: every attribute the
 * panel writes must be declared, either by standard BPMN or by this repo's descriptor.
 * Both times this check was written by hand instead, something was wrong — `resultVariableName`
 * on a script task was the engine's `resultVariable` misspelt, and it shipped.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { flowableModdleDescriptor } from "./flowableModdle";
import { EXTRA_WRITTEN_ATTRIBUTES, FLOWABLE_FIELDS_BY_TYPE } from "./PropertiesPanel";

const require = createRequire(import.meta.url);

interface ModdleProperty {
  name: string;
  type?: string;
  isAttr?: boolean;
  isMany?: boolean;
}
interface ModdleType {
  name: string;
  extends?: string[];
  superClass?: string[];
  properties?: ModdleProperty[];
}

/** Standard BPMN, straight from bpmn-moddle's own descriptor. */
const bpmn: { types: ModdleType[] } = JSON.parse(
  readFileSync(require.resolve("bpmn-moddle/resources/bpmn/json/bpmn.json"), "utf8"),
);

const bpmnTypes = new Map(bpmn.types.map((type) => [type.name, type]));

/** Standard BPMN properties for a type, following its superclasses. */
function standardProperties(typeName: string, seen = new Set<string>()): Set<string> {
  const bare = typeName.replace(/^bpmn:/, "");
  if (seen.has(bare)) return new Set();
  seen.add(bare);

  const type = bpmnTypes.get(bare);
  const names = new Set<string>(type?.properties?.map((property) => property.name) ?? []);
  for (const parent of type?.superClass ?? []) {
    for (const inherited of standardProperties(parent, seen)) names.add(inherited);
  }
  return names;
}

/** Flowable properties declared for a type, via `extends`. */
function flowableProperties(typeName: string): Set<string> {
  const names = new Set<string>();
  for (const type of flowableModdleDescriptor.types as ModdleType[]) {
    if (!type.extends?.includes(typeName)) continue;
    for (const property of type.properties ?? []) names.add(property.name);
  }
  return names;
}

/**
 * `AsyncCapable` extends the abstract bases, so async/exclusive reach every activity,
 * gateway and event without being redeclared on each. Resolved here rather than
 * hard-coded, so removing it from the descriptor fails this test.
 */
const ABSTRACT_BASES: Record<string, string[]> = {
  "bpmn:UserTask": ["bpmn:Activity"],
  "bpmn:ServiceTask": ["bpmn:Activity"],
  "bpmn:SendTask": ["bpmn:Activity"],
  "bpmn:ScriptTask": ["bpmn:Activity"],
  "bpmn:BusinessRuleTask": ["bpmn:Activity"],
  "bpmn:ReceiveTask": ["bpmn:Activity"],
  "bpmn:CallActivity": ["bpmn:Activity"],
  "bpmn:StartEvent": ["bpmn:Event"],
  "bpmn:BoundaryEvent": ["bpmn:Event"],
  "bpmn:ExclusiveGateway": ["bpmn:Gateway"],
  "bpmn:InclusiveGateway": ["bpmn:Gateway"],
};

function declaredFor(typeName: string): Set<string> {
  const names = standardProperties(typeName);
  for (const flowable of flowableProperties(typeName)) names.add(flowable);
  for (const base of ABSTRACT_BASES[typeName] ?? []) {
    for (const inherited of flowableProperties(base)) names.add(inherited);
  }
  return names;
}

describe("moddle coverage", () => {
  it("declares every attribute the properties panel offers as a field", () => {
    const undeclared: string[] = [];
    for (const [typeName, fields] of Object.entries(FLOWABLE_FIELDS_BY_TYPE)) {
      const declared = declaredFor(typeName);
      for (const field of fields) {
        if (!declared.has(field.key)) undeclared.push(`${typeName}.${field.key}`);
      }
    }
    expect(undeclared).toEqual([]);
  });

  it("declares every attribute the panel writes through a control", () => {
    const undeclared: string[] = [];
    for (const [typeName, keys] of Object.entries(EXTRA_WRITTEN_ATTRIBUTES)) {
      const declared = declaredFor(typeName);
      for (const key of keys) {
        if (!declared.has(key)) undeclared.push(`${typeName}.${key}`);
      }
    }
    expect(undeclared).toEqual([]);
  });

  it("extends only types that standard BPMN actually has", () => {
    // A typo in `extends` produces a declaration that silently applies to nothing.
    const unknown: string[] = [];
    for (const type of flowableModdleDescriptor.types as ModdleType[]) {
      for (const extended of type.extends ?? []) {
        if (!bpmnTypes.has(extended.replace(/^bpmn:/, ""))) unknown.push(extended);
      }
    }
    expect(unknown).toEqual([]);
  });

  it("names nested types so they serialise to the tag the engine reads", () => {
    /*
     * moddle derives the XML tag from the type name, lower-camelised by `tagAlias`. The
     * engine looks for specific tags, so a type named for clarity rather than for the
     * wire produces an element the parser skips — `AggregationVariable` would serialise
     * as `<flowable:aggregationVariable>` where the engine wants `<flowable:variable>`.
     */
    const expectedTags = [
      "field",
      "in",
      "out",
      "formProperty",
      "value",
      "executionListener",
      "taskListener",
      "eventListener",
      "mapException",
      "failedJobRetryTimeCycle",
      "variableAggregation",
      "variable",
    ];
    const declaredTags = (flowableModdleDescriptor.types as ModdleType[])
      .filter((type) => !type.extends)
      .map((type) => type.name[0].toLowerCase() + type.name.slice(1));

    for (const tag of expectedTags) {
      expect(declaredTags, `no type serialises to <flowable:${tag}>`).toContain(tag);
    }
  });
});

/**
 * Keys written by the panel that are structural rather than attributes — nested moddle
 * objects and standard BPMN containers. Declared by BPMN itself, so they need no Flowable
 * entry, but they still have to be named here or the scan below cannot tell a legitimate
 * one from a typo.
 */
const STRUCTURAL_KEYS = new Set([
  "extensionElements",
  "eventDefinitions",
  "loopCharacteristics",
  "documentation",
  "conditionExpression",
  "itemSubjectRef",
  "default",
  "script",
]);

/**
 * Every property key the panel writes through a literal object.
 *
 * Scanned from source rather than trusted to a hand-kept list, because a hand-kept list
 * is only as good as the last person to remember it — and the whole failure this file
 * guards against is an attribute nobody noticed was undeclared. Computed keys (`[key]:`)
 * cannot be seen statically, but every one of those is driven by `FLOWABLE_FIELDS_BY_TYPE`
 * or `EXTRA_WRITTEN_ATTRIBUTES`, which the tests above already check.
 */
function writtenKeysInSource(): string[] {
  const source = readFileSync(resolve(__dirname, "PropertiesPanel.tsx"), "utf8");
  const keys = new Set<string>();

  // `onChange(element, { someKey: ... })`, including across a line break.
  for (const match of source.matchAll(/onChange\(\s*element\s*,\s*\{\s*([A-Za-z_$][\w$]*)\s*:/g)) {
    keys.add(match[1]);
  }
  // The `set("someKey", value)` helper.
  for (const match of source.matchAll(/\bset\(\s*"([^"]+)"/g)) {
    keys.add(match[1]);
  }
  return [...keys];
}

describe("moddle coverage — the inventory itself", () => {
  it("finds the keys it is supposed to be scanning for", () => {
    // A regex that matches nothing would make the next test pass vacuously.
    const keys = writtenKeysInSource();
    expect(keys.length).toBeGreaterThan(5);
    expect(keys).toContain("async");
  });

  it("declares every key the panel writes literally", () => {
    /*
     * Union of everything declared anywhere: this asks "is this key known at all", not
     * "is it known for this type", because the scan cannot tell which element a given
     * `onChange` belongs to. It still catches the failure that matters — a name the
     * descriptor has never heard of, which is what `resultVariableName` was.
     */
    const known = new Set<string>(STRUCTURAL_KEYS);
    for (const type of flowableModdleDescriptor.types as ModdleType[]) {
      for (const property of type.properties ?? []) known.add(property.name);
    }
    for (const type of bpmn.types) {
      for (const property of type.properties ?? []) known.add(property.name);
    }

    const undeclared = writtenKeysInSource().filter((key) => !known.has(key));
    expect(undeclared).toEqual([]);
  });
});
