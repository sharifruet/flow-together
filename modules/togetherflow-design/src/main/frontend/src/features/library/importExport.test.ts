import { describe, expect, it } from "vitest";
import { describeImport, detectKind, exportFileName, mimeFor } from "./importExport";

const BPMN = `<?xml version="1.0"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <process id="orderProcess" name="Order process" />
</definitions>`;

const CMMN = `<?xml version="1.0"?>
<definitions xmlns="http://www.omg.org/spec/CMMN/20151109/MODEL">
  <case id="onboarding" name="Customer onboarding" />
</definitions>`;

const DMN = `<?xml version="1.0"?>
<definitions xmlns="http://www.omg.org/spec/DMN/20180521/MODEL/">
  <decision id="discount" name="Discount rules" />
</definitions>`;

describe("detectKind", () => {
  it("trusts an unambiguous extension", () => {
    expect(detectKind("order.bpmn20.xml", "")).toBe("bpmn");
    expect(detectKind("order.bpmn", "")).toBe("bpmn");
    expect(detectKind("case.cmmn", "")).toBe("cmmn");
    expect(detectKind("rules.dmn", "")).toBe("dmn");
    expect(detectKind("claim.form", "")).toBe("form");
    expect(detectKind("order.event", "")).toBe("event");
    expect(detectKind("orders.channel", "")).toBe("event");
  });

  it("is case-insensitive about extensions", () => {
    expect(detectKind("ORDER.BPMN", "")).toBe("bpmn");
  });

  /** A bare `.xml` says nothing, so the namespace decides. */
  it("sniffs the namespace when the extension is ambiguous", () => {
    expect(detectKind("model.xml", BPMN)).toBe("bpmn");
    expect(detectKind("model.xml", CMMN)).toBe("cmmn");
    expect(detectKind("model.xml", DMN)).toBe("dmn");
  });

  it("tells a form from an event by its shape", () => {
    expect(detectKind("x.json", '{"key":"f","fields":[]}')).toBe("form");
    expect(detectKind("x.json", '{"key":"e","payload":[]}')).toBe("event");
    expect(detectKind("x.json", '{"key":"c","channelType":"inbound"}')).toBe("event");
    expect(detectKind("x.json", '{"key":"a","modelIds":[]}')).toBe("app");
  });

  /**
   * Guessing wrong would create a draft that cannot deploy, with a confusing engine
   * error much later. Saying "I can't tell" is the useful answer.
   */
  it("returns undefined rather than guessing", () => {
    expect(detectKind("notes.txt", "hello")).toBeUndefined();
    expect(detectKind("thing.xml", "<something-else/>")).toBeUndefined();
    expect(detectKind("broken.json", "{not json")).toBeUndefined();
  });
});

describe("describeImport", () => {
  it("takes the name and key from the model, not the file name", () => {
    expect(describeImport("whatever.bpmn", BPMN, "bpmn")).toEqual({
      name: "Order process",
      key: "orderProcess",
    });
  });

  it("reads a case and a decision the same way", () => {
    expect(describeImport("x.cmmn", CMMN, "cmmn").key).toBe("onboarding");
    expect(describeImport("x.dmn", DMN, "dmn").name).toBe("Discount rules");
  });

  it("falls back to the id when the model has no name", () => {
    const xml = `<definitions><process id="onlyId" /></definitions>`;
    expect(describeImport("x.bpmn", xml, "bpmn")).toEqual({ name: "onlyId", key: "onlyId" });
  });

  it("reads JSON models from their own properties", () => {
    expect(describeImport("x.form", '{"key":"claim","name":"Expense claim"}', "form")).toEqual({
      name: "Expense claim",
      key: "claim",
    });
  });

  /** An event draft nests the definition, so the key lives one level down. */
  it("reaches into an event draft's nested definition", () => {
    const draft = '{"event":{"key":"orderPlaced","name":"Order placed","payload":[]}}';
    expect(describeImport("x.event", draft, "event")).toEqual({
      name: "Order placed",
      key: "orderPlaced",
    });
  });

  it("falls back to the file name, stripped of its extension", () => {
    expect(describeImport("my-model.bpmn20.xml", "<definitions/>", "bpmn")).toEqual({
      name: "my-model",
      key: "my-model",
    });
  });

  it("survives malformed JSON", () => {
    expect(describeImport("thing.form", "{not json", "form").key).toBe("thing");
  });
});

describe("exportFileName", () => {
  it("gives each kind the suffix its engine matches on", () => {
    expect(exportFileName("bpmn", "order")).toBe("order.bpmn20.xml");
    expect(exportFileName("cmmn", "case")).toBe("case.cmmn");
    expect(exportFileName("dmn", "rules")).toBe("rules.dmn");
    expect(exportFileName("form", "claim")).toBe("claim.form");
    expect(exportFileName("event", "placed")).toBe("placed.event");
    expect(exportFileName("app", "suite")).toBe("suite.app");
  });

  it("sanitises a key that would make an unusable file name", () => {
    expect(exportFileName("bpmn", "order / cash!")).toBe("order-cash-.bpmn20.xml");
  });

  it("falls back when there is no key at all", () => {
    expect(exportFileName("bpmn", "")).toBe("model.bpmn20.xml");
  });
});

describe("mimeFor", () => {
  it("matches how each kind is stored", () => {
    expect(mimeFor("bpmn")).toBe("application/xml");
    expect(mimeFor("cmmn")).toBe("application/xml");
    expect(mimeFor("form")).toBe("application/json");
    expect(mimeFor("event")).toBe("application/json");
    expect(mimeFor("app")).toBe("application/json");
  });
});
