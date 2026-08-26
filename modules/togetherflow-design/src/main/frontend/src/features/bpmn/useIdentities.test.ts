/**
 * The identity source behind the reference fields.
 *
 * What is worth pinning is not that it fetches, but how it behaves at the edges: it must
 * not lose the cached page when a search returns, must not re-query the same term, and
 * must stay silent when the identity store refuses it — plenty of deployments do not give
 * Design users read access to IDM, and the fields work as free text regardless.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useIdentities } from "./useIdentities";
import type { IdmApi, ProcessApi } from "@togetherflow/common";

function idm(overrides: Partial<Record<"listUsers" | "listGroups", unknown>> = {}) {
  return {
    listUsers: vi.fn().mockResolvedValue({
      data: [{ id: "kermit", firstName: "Kermit", lastName: "the Frog" }],
    }),
    listGroups: vi.fn().mockResolvedValue({ data: [{ id: "sales", name: "Sales" }] }),
    ...overrides,
  } as unknown as IdmApi;
}

const processes = {
  listDefinitions: vi.fn().mockResolvedValue({
    data: [{ key: "approvalProcess", name: "Approval", id: "approvalProcess:1:x", version: 1 }],
  }),
} as unknown as ProcessApi;

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useIdentities", () => {
  it("builds a display name from whatever the directory filled in", async () => {
    const { result } = renderHook(() => useIdentities(idm(), processes));

    await waitFor(() => expect(result.current.users).toHaveLength(1));
    // No displayName set, so first and last name are joined rather than showing a bare id.
    expect(result.current.users[0]).toEqual({ id: "kermit", label: "Kermit the Frog" });
  });

  it("takes the process definition's key, not its versioned id", async () => {
    const { result } = renderHook(() => useIdentities(null, processes));

    // A call activity referencing a key follows the latest deployed version; referencing
    // an id would pin it to one version forever.
    await waitFor(() => expect(result.current.processes).toEqual([
      { id: "approvalProcess", label: "Approval" },
    ]));
  });

  it("merges search results without losing the cached page", async () => {
    const api = idm();
    (api.listUsers as ReturnType<typeof vi.fn>)
      // The initial page, then the three name fields a user search fans out across.
      .mockResolvedValueOnce({ data: [{ id: "kermit", displayName: "Kermit the Frog" }] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: "gonzo", displayName: "Gonzo" }] })
      .mockResolvedValueOnce({ data: [] });

    const { result } = renderHook(() => useIdentities(api, null));
    await waitFor(() => expect(result.current.users).toHaveLength(1));

    act(() => result.current.search("users", "gon"));
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => expect(result.current.users.map((u) => u.id)).toEqual(["kermit", "gonzo"]));
  });

  it("does not query for a term too short to narrow anything", async () => {
    const api = idm();
    const { result } = renderHook(() => useIdentities(api, null));
    await waitFor(() => expect(result.current.users).toHaveLength(1));
    (api.listUsers as ReturnType<typeof vi.fn>).mockClear();

    act(() => result.current.search("users", "k"));
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(api.listUsers).not.toHaveBeenCalled();
  });

  it("does not re-query a term it has already searched", async () => {
    const api = idm();
    const { result } = renderHook(() => useIdentities(api, null));
    await waitFor(() => expect(result.current.users).toHaveLength(1));
    (api.listUsers as ReturnType<typeof vi.fn>).mockClear();

    act(() => result.current.search("users", "ker"));
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    act(() => result.current.search("users", "ker"));
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    /*
     * One *search*, not one request: a user search fans out across displayName, firstName
     * and lastName because the engine has no combined name filter. Repeating the term must
     * not fan out a second time.
     */
    expect(api.listUsers).toHaveBeenCalledTimes(3);
  });

  it("stays silent when the identity store refuses the request", async () => {
    const api = idm({
      listUsers: vi.fn().mockRejectedValue(new Error("403")),
      listGroups: vi.fn().mockRejectedValue(new Error("403")),
    });

    const { result } = renderHook(() => useIdentities(api, null));

    // No throw, no suggestions, and the fields carry on as free text.
    await waitFor(() => expect(api.listUsers).toHaveBeenCalled());
    expect(result.current.users).toEqual([]);
    expect(result.current.groups).toEqual([]);
  });

  it("does nothing at all without an identity store", async () => {
    const { result } = renderHook(() => useIdentities(null, null));
    act(() => result.current.search("users", "kermit"));
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.users).toEqual([]);
  });
});
