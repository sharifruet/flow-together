/**
 * Crash recovery (REQUIREMENTS.md §13.2). Without a boundary a single render throw
 * unmounts the whole app and leaves a blank page — the failure a user cannot describe.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";
import { configureErrorReporting } from "../observability/errorReporting";

function Boom({ explode }: { explode: boolean }): React.ReactElement {
  if (explode) throw new Error("render exploded");
  return <p>All good</p>;
}

beforeEach(() => {
  configureErrorReporting({ app: "test" });
  // React logs the caught error itself; silencing keeps the run readable.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("ErrorBoundary", () => {
  it("renders its children when nothing is wrong", () => {
    render(
      <ErrorBoundary>
        <Boom explode={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("shows a recovery screen instead of a blank page when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/this screen stopped working/i);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("reports the crash with the boundary's name", () => {
    const beacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: beacon });
    configureErrorReporting({ app: "test", endpoint: "/collect" });

    render(
      <ErrorBoundary boundary="task-detail">
        <Boom explode />
      </ErrorBoundary>,
    );

    expect(beacon).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("recovers when the user retries and the cause has gone", async () => {
    function Harness() {
      const [explode, setExplode] = useState(true);
      return (
        <>
          <button onClick={() => setExplode(false)}>fix it</button>
          <ErrorBoundary>
            <Boom explode={explode} />
          </ErrorBoundary>
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "fix it" }));
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("clears itself when resetKey changes, so navigation escapes a wedged screen", async () => {
    function Harness() {
      const [screenId, setScreenId] = useState("a");
      return (
        <>
          <button onClick={() => setScreenId("b")}>navigate</button>
          <ErrorBoundary resetKey={screenId}>
            <Boom explode={screenId === "a"} />
          </ErrorBoundary>
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "navigate" }));

    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("lets a screen supply its own fallback", () => {
    render(
      <ErrorBoundary fallback={() => <p>Custom fallback</p>}>
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Custom fallback")).toBeInTheDocument();
  });
});
