/**
 * Every `flowable:` attribute the case panel writes has to be one the engine reads.
 *
 * This is the CMMN counterpart of `moddleCoverage.test.ts`, and it exists for the same
 * reason: a misspelt attribute is invisible. It is written to the file, the file
 * round-trips, the schema accepts it (unknown foreign-namespace attributes are legal), the
 * case deploys, and the setting silently does nothing. Nobody finds out until the behaviour
 * they configured fails to happen in production.
 *
 * The names are not guessable. The blocking override is `isBlockingExpression`, not
 * `blockingExpression`. A CMMN service task's result variable is `resultVariableName`,
 * where the same concept in BPMN is `resultVariable` — a difference that already shipped
 * once as a bug in the BPMN editor. So they are checked against `CmmnXmlConstants.java`
 * itself rather than against a list someone typed twice.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { allAuthoredAttributeNames, attributeGroupsFor } from "./flowableAttributes";
import { TYPE_LABELS, type CmmnElementType } from "./cmmnModel";
import { designEn } from "../../i18n/messages";

const REPO = resolve(__dirname, "../../../../../../../..");
const CONSTANTS = resolve(
  REPO,
  "modules/flowable-cmmn-converter/src/main/java/org/flowable/cmmn/converter/CmmnXmlConstants.java",
);

/** Every string literal assigned to an `ATTRIBUTE_*` constant. */
function engineAttributeNames(): Set<string> {
  const source = readFileSync(CONSTANTS, "utf8");
  return new Set(
    [...source.matchAll(/String\s+ATTRIBUTE_[A-Z0-9_]+\s*=\s*"([^"]+)"/g)].map((m) => m[1]),
  );
}

describe("CMMN attribute coverage", () => {
  const engine = engineAttributeNames();

  it("found the engine's constants at all", () => {
    // A regex that matched nothing would make every assertion below vacuous.
    expect(engine.size).toBeGreaterThan(100);
    expect(engine).toContain("isBlockingExpression");
  });

  it.each(allAuthoredAttributeNames())("the engine reads %s", (name) => {
    expect(engine).toContain(name);
  });

  it("names no attribute twice within one group", () => {
    for (const type of Object.keys(TYPE_LABELS) as CmmnElementType[]) {
      for (const group of attributeGroupsFor(type)) {
        const names = group.attributes.map((attribute) => attribute.name);
        expect(new Set(names).size, `${type}/${group.id}`).toBe(names.length);
      }
    }
  });

  /*
   * Two groups on one element must not offer the same attribute in two boxes: whichever is
   * typed second wins and the other silently shows a stale value.
   */
  it("offers no attribute twice on the same element", () => {
    for (const type of Object.keys(TYPE_LABELS) as CmmnElementType[]) {
      const names = attributeGroupsFor(type).flatMap((group) =>
        group.attributes.map((attribute) => attribute.name),
      );
      expect(new Set(names).size, type).toBe(names.length);
    }
  });

  /*
   * The catalogue test cannot do this one. It reads keys out of the source, and these are
   * built from a template literal — `cmmn.attr.${name}` — so it sees the prefix as covering
   * everything beneath it and a missing label passes. What the user would see is the raw
   * key where the label should be, which reads as copy nobody wrote rather than as a bug.
   */
  it.each(allAuthoredAttributeNames())("%s has a label and a hint", (name) => {
    expect(Object.keys(designEn)).toContain(`cmmn.attr.${name}`);
    expect(Object.keys(designEn)).toContain(`cmmn.attr.${name}.hint`);
  });

  it("has no attribute label the table cannot use", () => {
    const authored = new Set(allAuthoredAttributeNames());
    const orphans = Object.keys(designEn)
      .filter((key) => key.startsWith("cmmn.attr."))
      .map((key) => key.slice("cmmn.attr.".length).replace(/\.hint$/, ""))
      .filter((name) => !authored.has(name));

    expect([...new Set(orphans)]).toEqual([]);
  });

  it("names every group it renders", () => {
    const ids = new Set(
      (Object.keys(TYPE_LABELS) as CmmnElementType[]).flatMap((type) =>
        attributeGroupsFor(type).map((group) => group.id),
      ),
    );
    // The repetition group is rendered from its own constant rather than the type table.
    ids.add("repetition");

    for (const id of ids) {
      expect(Object.keys(designEn), id).toContain(`cmmn.group.${id}`);
    }
  });

  it("covers every element type in the palette", () => {
    const uncovered = (Object.keys(TYPE_LABELS) as CmmnElementType[]).filter(
      (type) => attributeGroupsFor(type).length === 0,
    );
    expect(uncovered).toEqual([]);
  });
});
