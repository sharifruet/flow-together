/**
 * Data-retention visibility (REQUIREMENTS.md §13.7).
 *
 * The filter has to be honest in both directions: it must not miss a retention setting
 * an operator needs to see, and it must not dress unrelated properties up as one.
 */

import { describe, expect, it } from "vitest";
import { retentionProperties } from "./System";

describe("retentionProperties", () => {
  it("surfaces history and cleanup settings, whatever the engine calls them", () => {
    expect(
      retentionProperties({
        "history.level": "audit",
        "historyCleaningCycle": "0 0 1 * * ?",
        "history.cleanup.days": "365",
        "task.retention.days": "90",
      }).map(([name]) => name),
    ).toEqual([
      "history.level",
      "historyCleaningCycle",
      "history.cleanup.days",
      "task.retention.days",
    ]);
  });

  it("leaves unrelated properties out rather than padding the table", () => {
    expect(
      retentionProperties({
        "schema.version": "8.1.0",
        "database.type": "postgres",
        // A bare "ttl" is not a retention policy; matching it would pad the table.
        "cache.ttl": "600",
      }),
    ).toEqual([]);
  });

  it("returns nothing for an engine that reports no properties at all", () => {
    expect(retentionProperties({})).toEqual([]);
  });
});
