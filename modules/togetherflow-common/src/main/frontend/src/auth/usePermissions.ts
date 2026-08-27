/**
 * Whether the signed-in user may change things (W2.1, ENTERPRISE_PARITY_PLAN E2).
 *
 * Flowable Control degrades to read-only for a non-admin rather than offering actions the
 * server will reject; ours gated the whole app or nothing. This is the per-action half.
 *
 * **This is a convenience, not a security boundary,** and the distinction matters enough
 * to state at the seam: §13.1 requires the *server* to enforce what the UI hides, and
 * hiding a button changes nothing about what a hand-rolled request can do. What it buys is
 * that an operator without the privilege is not invited to try — a rejected action is a
 * worse experience than an absent one, and a UI full of buttons that 403 teaches people to
 * ignore errors.
 *
 * Which is also why it **fails open**. When privileges cannot be read — no IDM in this
 * deployment, IDM unreachable, the endpoint restricted — the actions stay visible and the
 * server decides. Failing closed would silently turn Control into a viewer for every
 * deployment that does not run IDM, which is a larger and quieter breakage than the one it
 * would prevent.
 */

import { useMemo } from "react";
import { useAuth } from "./AuthContext";
import { useAsync } from "../hooks/useAsync";
import type { IdmApi } from "../api/idm";

/** Flowable's own admin privilege name; the deployment can name a different one. */
export const DEFAULT_ADMIN_PRIVILEGE = "access-admin";

export interface Permissions {
  /** False only when privileges were read *and* the required one was absent. */
  canMutate: boolean;
  /** True while the answer is unknown — screens should not flicker their actions. */
  loading: boolean;
  /**
   * True when the verdict is a fallback rather than a reading — no IDM, or the lookup
   * failed. Worth surfacing where a screen explains why it is read-only.
   */
  unknown: boolean;
}

export interface UsePermissionsOptions {
  /** Omit — no IDM in this deployment — and everything stays enabled. */
  idm?: IdmApi | null;
  /** Privilege that grants write access. Defaults to `access-admin`. */
  requiredPrivilege?: string;
}

export function usePermissions({
  idm,
  requiredPrivilege = DEFAULT_ADMIN_PRIVILEGE,
}: UsePermissionsOptions): Permissions {
  const { session } = useAuth();
  const userId = session?.userId;

  const privileges = useAsync(
    async (signal) => {
      if (!idm || !userId) return null;
      try {
        const page = await idm.listPrivileges({ userId, size: 200 }, signal);
        return page.data.map((privilege) => privilege.name);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        // Unreadable is not "denied" — see the fail-open note above.
        return null;
      }
    },
    [idm, userId],
  );

  return useMemo(() => {
    if (!idm || !userId) return { canMutate: true, loading: false, unknown: true };
    if (privileges.loading) return { canMutate: true, loading: true, unknown: true };
    const names = privileges.data;
    if (names === null || names === undefined) {
      return { canMutate: true, loading: false, unknown: true };
    }
    return { canMutate: names.includes(requiredPrivilege), loading: false, unknown: false };
  }, [idm, userId, privileges.loading, privileges.data, requiredPrivilege]);
}
