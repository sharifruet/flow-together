/**
 * Chunk-load recovery (`lazyWithRetry`).
 *
 * The failure this exists for is quiet and total: `React.lazy` caches a *rejected*
 * promise, so one failed dynamic import leaves a screen permanently showing "This screen
 * stopped working" — and the error boundary's Retry re-throws the same cached rejection,
 * so nothing on the page can fix it.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lazyWithRetry } from "./lazyWithRetry";

function Loaded() {
  return <p>loaded</p>;
}

const originalLocation = window.location;

beforeEach(() => {
  window.sessionStorage.clear();
  // jsdom's location.reload is not writable; replace the object for the test.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, reload: vi.fn() },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

function renderLazy(load: () => Promise<{ default: typeof Loaded }>, key: string) {
  const Lazy = lazyWithRetry(load, key);
  return render(
    <Suspense fallback={<p>loading</p>}>
      <Lazy />
    </Suspense>,
  );
}

describe("lazyWithRetry", () => {
  it("renders the module when the import succeeds", async () => {
    renderLazy(() => Promise.resolve({ default: Loaded }), "ok");
    expect(await screen.findByText("loaded")).toBeInTheDocument();
  });

  it("recovers from a transient failure without reloading", async () => {
    // The network-blip case: fails once, then succeeds.
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("chunk failed"))
      .mockResolvedValue({ default: Loaded });

    renderLazy(load, "transient");

    expect(await screen.findByText("loaded")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it("reloads once when retrying does not help", async () => {
    // The post-deploy case: the chunk is genuinely gone, and only a reload of the entry
    // can discover its new name.
    const load = vi.fn().mockRejectedValue(new Error("chunk gone"));
    renderLazy(load, "gone");

    await waitFor(() => expect(window.location.reload).toHaveBeenCalledTimes(1));
    // The initial attempt plus both retries.
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("does not reload twice for the same chunk — a reload loop is worse than the error", async () => {
    const load = vi.fn().mockRejectedValue(new Error("chunk gone"));
    renderLazy(load, "loop");
    await waitFor(() => expect(window.location.reload).toHaveBeenCalledTimes(1));

    // What the page does after coming back and failing again: give up, and let the error
    // boundary show its screen rather than reloading for ever.
    const second = lazyWithRetry(load, "loop");
    const failed = vi.fn();
    render(
      <Suspense fallback={<p>loading</p>}>
        <Boundary onError={failed}>{(() => {
          const Lazy = second;
          return <Lazy />;
        })()}</Boundary>
      </Suspense>,
    );
    await waitFor(() => expect(failed).toHaveBeenCalled());
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it("keeps working when sessionStorage throws", async () => {
    // Private windows and blocked site data both throw on access; the guard must fail
    // closed (never reload) rather than crash.
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const load = vi.fn().mockRejectedValue(new Error("chunk gone"));

    const Lazy = lazyWithRetry(load, "blocked");
    const failed = vi.fn();
    render(
      <Suspense fallback={<p>loading</p>}>
        <Boundary onError={failed}>
          <Lazy />
        </Boundary>
      </Suspense>,
    );

    await waitFor(() => expect(failed).toHaveBeenCalled());
    expect(window.location.reload).not.toHaveBeenCalled();
    getItem.mockRestore();
  });
});

/** Minimal boundary — the real one needs i18n providers this test does not want. */
class Boundary extends (await import("react")).Component<
  { children: React.ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? <p>failed</p> : this.props.children;
  }
}
