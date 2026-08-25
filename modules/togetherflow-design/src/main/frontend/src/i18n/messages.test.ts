/**
 * Message catalogue conformance (REQUIREMENTS.md §8).
 *
 * Externalizing strings is only half of it; keeping them resolvable is the other half.
 * A key typo'd at a call site renders as the raw key — copy nobody wrote, rather than an
 * obvious bug — and a catalogue entry nothing references is dead weight that survives a
 * rename. Both are caught here rather than by someone noticing in the UI.
 */

import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  collectKeyUsage,
  localeGaps,
  missingKeys,
  unusedKeys,
} from "@togetherflow/common/testing/catalogue";
import { commonEn, mergeCatalogues, commonMessages } from "@togetherflow/common";
import { designEn, designMessages } from "./messages";

const SRC = resolve(__dirname, "..");
const usage = collectKeyUsage(SRC);

/** What the app actually resolves against at runtime: its own catalogue over the shared one. */
const merged = { ...commonEn, ...designEn };

describe("Design message catalogue", () => {
  it("supplies every key the app asks for", () => {
    expect(missingKeys(usage, merged)).toEqual([]);
  });

  it("has no entries nothing references", () => {
    // Scoped to this app's own keys: the shared catalogue is used by four apps, so an
    // entry unused *here* says nothing about whether it is dead.
    expect(unusedKeys(usage, designEn)).toEqual([]);
  });

  it("keeps every locale in step with the source locale", () => {
    // Only `en` ships today, so this passes trivially — and starts doing real work the
    // moment a second catalogue is added, which is the point of having it now.
    expect(localeGaps(mergeCatalogues(commonMessages, designMessages))).toEqual({});
  });
});
