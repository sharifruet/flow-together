/**
 * Identities and process keys for the modeller's reference fields.
 *
 * Two sources, combined deliberately:
 *
 * - a page fetched once when the editor opens, which makes the common case instant; and
 * - a debounced lookup as the user types, which reaches past that page.
 *
 * The lookup exists because a cached page is a guess about which identities matter. On a
 * directory of any size the person being assigned is usually not in the first 200.
 *
 * **Two limits worth knowing**, both confirmed against a running engine:
 *
 * - The user resource offers `id` as an exact match and `*Like` only on first name, last
 *   name, display name and email — there is no `idLike`. So typing a *name* searches the
 *   whole directory, while typing a raw login only matches what is already cached. Groups
 *   are better served: `nameLike` searches all of them.
 * - `displayName` is usually **null**: Flowable does not derive it, and nothing sets it
 *   unless a deployment does so itself. Searching it alone found one user out of three on
 *   a stock engine. First and last name are queried alongside it for that reason.
 *
 * The `%` wildcards are also required rather than decorative — `displayNameLike=Bear`
 * matches nothing, while `%Bear%` matches.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IdmApi, ProcessApi } from "@togetherflow/common";

/** An id the model will hold, with a human label for recognising it in a list. */
export interface IdentityOption {
  id: string;
  label?: string;
}

export interface Suggestions {
  users: IdentityOption[];
  groups: IdentityOption[];
  /** Keys of deployed process definitions, for a call activity's target. */
  processes: IdentityOption[];
}

export interface IdentitySource extends Suggestions {
  /** Called as the user types; looks past the cached page and merges what it finds. */
  search: (kind: "users" | "groups", term: string) => void;
}

const PAGE_SIZE = 200;
const SEARCH_DELAY_MS = 250;

/** A person's name, falling back through what the directory actually filled in. */
function userLabel(user: {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
}): string | undefined {
  const name = user.displayName?.trim() || [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || undefined;
}

/** Merges new options in by id, keeping the first label seen for each. */
function merge(existing: IdentityOption[], incoming: IdentityOption[]): IdentityOption[] {
  const byId = new Map(existing.map((option) => [option.id, option]));
  for (const option of incoming) {
    if (!byId.has(option.id)) byId.set(option.id, option);
  }
  return [...byId.values()];
}

export function useIdentities(
  idmApi: IdmApi | null,
  processApi: ProcessApi | null,
): IdentitySource {
  const [users, setUsers] = useState<IdentityOption[]>([]);
  const [groups, setGroups] = useState<IdentityOption[]>([]);
  const [processes, setProcesses] = useState<IdentityOption[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The term each kind last searched for, so the same keystrokes are not re-fetched. */
  const lastTerm = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!idmApi) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const [userPage, groupPage] = await Promise.all([
          idmApi.listUsers({ size: PAGE_SIZE }, controller.signal),
          idmApi.listGroups({ size: PAGE_SIZE }, controller.signal),
        ]);
        setUsers((current) =>
          merge(current, (userPage.data ?? []).map((user) => ({ id: user.id, label: userLabel(user) }))),
        );
        setGroups((current) =>
          merge(current, (groupPage.data ?? []).map((group) => ({ id: group.id, label: group.name }))),
        );
      } catch {
        /*
         * Suggestions are a convenience, never a requirement. Plenty of deployments do not
         * grant Design users read access to the identity store, and the fields stay free
         * text either way — so this degrades silently rather than reporting a failure the
         * modeller can do nothing about.
         */
      }
    })();
    return () => controller.abort();
  }, [idmApi]);

  useEffect(() => {
    if (!processApi) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const page = await processApi.listDefinitions({ latest: true, size: PAGE_SIZE }, controller.signal);
        setProcesses((current) =>
          merge(
            current,
            // Keyed, not id'd: a call activity referencing a key follows the latest
            // deployed version, which is almost always what is wanted.
            (page.data ?? []).map((definition) => ({ id: definition.key, label: definition.name })),
          ),
        );
      } catch {
        /* same reasoning as above */
      }
    })();
    return () => controller.abort();
  }, [processApi]);

  const search = useCallback(
    (kind: "users" | "groups", term: string) => {
      const trimmed = term.trim();
      // Two characters is the point where a prefix stops matching most of a directory.
      if (!idmApi || trimmed.length < 2 || lastTerm.current[kind] === trimmed) return;
      lastTerm.current[kind] = trimmed;

      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void (async () => {
          try {
            if (kind === "users") {
              /*
               * Three queries because the engine has no single "name" filter and no OR
               * across fields. They are small, debounced and de-duplicated, and the
               * alternative — display name only — misses every user whose deployment did
               * not set one, which is most of them.
               */
              const like = `%${trimmed}%`;
              const pages = await Promise.all([
                idmApi.listUsers({ displayNameLike: like, size: 25 }),
                idmApi.listUsers({ firstNameLike: like, size: 25 }),
                idmApi.listUsers({ lastNameLike: like, size: 25 }),
              ]);
              const found = pages.flatMap((page) =>
                (page.data ?? []).map((user) => ({ id: user.id, label: userLabel(user) })),
              );
              setUsers((current) => merge(current, found));
            } else {
              const page = await idmApi.listGroups({ nameLike: `%${trimmed}%`, size: 25 });
              setGroups((current) =>
                merge(current, (page.data ?? []).map((group) => ({ id: group.id, label: group.name }))),
              );
            }
          } catch {
            /* a failed lookup just means no extra suggestions */
          }
        })();
      }, SEARCH_DELAY_MS);
    },
    [idmApi],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return useMemo(() => ({ users, groups, processes, search }), [users, groups, processes, search]);
}
