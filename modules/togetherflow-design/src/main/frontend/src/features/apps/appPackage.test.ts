/**
 * App packaging (W2.3, I6).
 *
 * The round trip is the whole point — an export that cannot be imported back is a backup
 * nobody can restore — so that is what is tested, along with the clash rules, which are
 * where an import quietly does the wrong thing.
 */

import { describe, expect, it } from "vitest";
import { MODEL_CATEGORY, type ModelResponse } from "@togetherflow/common";
import {
  PACKAGE_VERSION,
  exportApp,
  findClashes,
  keyFor,
  readAppPackage,
} from "./appPackage";

const app: ModelResponse = {
  id: "app-1",
  key: "expenses",
  name: "Expenses",
  category: MODEL_CATEGORY.app,
};

const process: ModelResponse = {
  id: "p-1",
  key: "claim",
  name: "Claim",
  category: MODEL_CATEGORY.bpmn,
};

const form: ModelResponse = {
  id: "f-1",
  // Deliberately the same key as the process — a real and legitimate situation.
  key: "claim",
  name: "Claim form",
  category: MODEL_CATEGORY.form,
};

function build() {
  return exportApp({
    app,
    appSource: JSON.stringify({ key: "expenses", modelIds: ["p-1", "f-1"] }),
    models: [
      { model: process, source: "<definitions id=\"claim\" />" },
      { model: form, source: JSON.stringify({ key: "claim", fields: [] }) },
    ],
  });
}

describe("app package round trip", () => {
  it("reads back everything it wrote", () => {
    const read = readAppPackage(build());
    expect(read.manifest.tfAppPackage).toBe(PACKAGE_VERSION);
    expect(read.manifest.app.key).toBe("expenses");
    expect(read.manifest.models).toHaveLength(2);
    expect(read.sources.get("claim")).toBeTruthy();
    expect(JSON.parse(read.appSource).modelIds).toEqual(["p-1", "f-1"]);
  });

  it("keeps two models that share a key apart inside the archive", () => {
    // The engine's own deployment bundle cannot express this; the path prefix is why.
    const read = readAppPackage(build());
    const files = read.manifest.models.map((m) => m.file);
    expect(new Set(files).size).toBe(2);
    expect(files.some((f) => f.includes("/bpmn/"))).toBe(true);
    expect(files.some((f) => f.includes("/form/"))).toBe(true);
  });

  it("refuses an archive that is not one of ours", () => {
    // A BPMN file renamed to .zip, or an engine deployment bundle.
    const notOurs = exportApp({ app, appSource: "{}", models: [] });
    const stripped = notOurs.slice(0, 10);
    expect(() => readAppPackage(stripped)).toThrow();
  });
});

describe("clash handling", () => {
  it("matches on key and kind together, so a shared key is not a false clash", () => {
    const clashes = findClashes(readAppPackage(build()).manifest, [process]);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].kind).toBe("bpmn");
  });

  it("finds nothing in an empty environment", () => {
    expect(findClashes(readAppPackage(build()).manifest, [])).toEqual([]);
  });

  it("keeps the key for stop and update, and suffixes it for rename", () => {
    const packaged = readAppPackage(build()).manifest.models.find((m) => m.kind === "bpmn")!;
    expect(keyFor(packaged, "stop", [process])).toBe("claim");
    expect(keyFor(packaged, "update", [process])).toBe("claim");
    expect(keyFor(packaged, "rename", [process])).toBe("claim_2");
  });

  it("skips a suffix that is already taken", () => {
    const packaged = readAppPackage(build()).manifest.models.find((m) => m.kind === "bpmn")!;
    const taken = [process, { ...process, id: "p-2", key: "claim_2" }];
    expect(keyFor(packaged, "rename", taken)).toBe("claim_3");
  });

  it("does not count a same-key model of another kind when suffixing", () => {
    const packaged = readAppPackage(build()).manifest.models.find((m) => m.kind === "bpmn")!;
    // The form named claim_2 is irrelevant to a process called claim.
    const taken = [process, { ...form, id: "f-2", key: "claim_2" }];
    expect(keyFor(packaged, "rename", taken)).toBe("claim_2");
  });
});
