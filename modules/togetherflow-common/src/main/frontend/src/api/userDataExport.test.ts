/**
 * Data subject access (REQUIREMENTS.md §13.7).
 *
 * The behaviour that matters is not the happy path but the honesty of the result: it
 * must name what it does not cover, must never carry a password, and must still produce
 * something usable when one of the optional sources is unavailable.
 */

import { describe, expect, it, vi } from "vitest";
import { exportUserData, type IdmApi, type UserProfileApi } from "./idm";

function apis(overrides: Partial<Record<string, unknown>> = {}) {
  const idm = {
    getUser: vi.fn().mockResolvedValue({ id: "kermit", firstName: "Kermit", password: "hunter2" }),
    listUserGroups: vi.fn().mockResolvedValue({ data: [{ id: "sales", name: "Sales" }], total: 1, start: 0, size: 25 }),
    listPrivileges: vi.fn().mockResolvedValue({
      data: [{ id: "p1", name: "access-admin" }],
      total: 1,
      start: 0,
      size: 25,
    }),
    ...overrides,
  } as unknown as IdmApi;
  const profile = {
    listInfo: vi.fn().mockResolvedValue([{ key: "phone", value: "555-0100" }]),
    ...overrides,
  } as unknown as UserProfileApi;
  return { idm, profile };
}

describe("exportUserData", () => {
  it("collects the identity data held about a user", async () => {
    const { idm, profile } = apis();
    const result = await exportUserData(idm, profile, "kermit");

    expect(result.user.id).toBe("kermit");
    expect(result.groups).toEqual([{ id: "sales", name: "Sales" }]);
    expect(result.privileges).toEqual(["access-admin"]);
    expect(result.customInfo).toEqual([{ key: "phone", value: "555-0100" }]);
  });

  it("never carries a password, whatever the endpoint returned", async () => {
    const { idm, profile } = apis();
    const result = await exportUserData(idm, profile, "kermit");
    expect(result.user.password).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("hunter2");
  });

  it("states what it does not cover, so it cannot be read as a complete record", async () => {
    const { idm, profile } = apis();
    const result = await exportUserData(idm, profile, "kermit");
    expect(result.scope).toMatch(/identity store only/i);
    expect(result.scope).toMatch(/task history/i);
  });

  it("degrades on an unavailable optional source rather than failing outright", async () => {
    const { idm, profile } = apis({
      listPrivileges: vi.fn().mockRejectedValue(new Error("privileges unavailable")),
      listInfo: vi.fn().mockRejectedValue(new Error("info unavailable")),
    });
    const result = await exportUserData(idm, profile, "kermit");

    expect(result.user.id).toBe("kermit");
    // The gap is visible as an empty list rather than hidden behind a thrown error.
    expect(result.privileges).toEqual([]);
    expect(result.customInfo).toEqual([]);
  });

  it("fails when the user itself cannot be read — an export without them is meaningless", async () => {
    const { idm, profile } = apis({
      getUser: vi.fn().mockRejectedValue(new Error("no such user")),
    });
    await expect(exportUserData(idm, profile, "nobody")).rejects.toThrow(/no such user/);
  });
});
