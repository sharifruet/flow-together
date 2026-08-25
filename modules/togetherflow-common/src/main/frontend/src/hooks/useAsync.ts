/**
 * Minimal request hook with abort handling and manual refetch.
 *
 * Phase 1 deliberately avoids pulling in a server-state library until the component
 * library decision (REQUIREMENTS.md §11.1) is settled — the surface here is small
 * enough to swap for TanStack Query later without touching call sites.
 */

import { useCallback, useEffect, useState } from "react";

export interface AsyncState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  refetch: () => void;
}

interface InternalState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
}

export function useAsync<T>(
  run: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
): AsyncState<T> {
  const [state, setState] = useState<InternalState<T>>({
    data: undefined,
    error: undefined,
    loading: true,
  });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    // Starting a request is exactly the "synchronise with an external system" case
    // the react-hooks/set-state-in-effect rule carves out for, but the rule cannot
    // see that. Kept to a single state transition so it costs one extra render, and
    // skipped entirely when already in the loading state (a refetch mid-flight).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((previous) =>
      previous.loading && previous.error === undefined
        ? previous
        : { ...previous, loading: true, error: undefined },
    );

    // `run` is intentionally read from this render's closure rather than a ref:
    // `deps` is what decides when to refetch, so the closure captured when the
    // effect fires is the correct one, and a ref written during render is unsafe.
    run(controller.signal)
      .then((result) => {
        if (active) setState({ data: result, error: undefined, loading: false });
      })
      .catch((cause) => {
        if (!active) return;
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setState((previous) => ({ ...previous, error: cause, loading: false }));
      });

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  return { data: state.data, error: state.error, loading: state.loading, refetch };
}
