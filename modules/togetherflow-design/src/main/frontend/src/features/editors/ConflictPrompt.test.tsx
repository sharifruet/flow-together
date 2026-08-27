/**
 * The user-facing half of the concurrent-edit guard (W1.1, I1).
 *
 * `models.test.ts` in `togetherflow-common` covers the refusal itself. What is pinned here
 * is what the six editors depend on: that a refusal pauses autosave, that each of the three
 * outcomes does what its label says, and that a save failing for any *other* reason still
 * propagates — a guard that swallowed real errors would hide exactly the failures an
 * editor most needs to report.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ApiError,
  ConcurrentEditError,
  I18nProvider,
  ToastProvider,
  commonMessages,
  mergeCatalogues,
} from "@togetherflow/common";
import { designMessages } from "../../i18n/messages";
import { useConflictPrompt } from "./ConflictPrompt";

const CATALOGUES = mergeCatalogues(commonMessages, designMessages);

function Harness({
  save,
  onReload,
}: {
  save: (overwrite: boolean) => Promise<unknown>;
  onReload?: (stored: string | null) => void;
}) {
  const conflict = useConflictPrompt({ onReload: onReload ?? (() => {}) });
  return (
    <>
      <p data-testid="blocked">{String(conflict.blocked)}</p>
      <button type="button" onClick={() => void conflict.guard(save)}>
        Save
      </button>
      {conflict.prompt}
    </>
  );
}

function renderHarness(props: React.ComponentProps<typeof Harness>) {
  return render(
    <I18nProvider catalogues={CATALOGUES}>
      <ToastProvider>
        <Harness {...props} />
      </ToastProvider>
    </I18nProvider>,
  );
}

describe("useConflictPrompt", () => {
  it("stays out of the way when the save succeeds", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(true);
    renderHarness({ save });

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByTestId("blocked")).toHaveTextContent("false");
  });

  it("raises the prompt and pauses autosave when the save is refused", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockRejectedValue(new ConcurrentEditError("m1", "<theirs/>"));
    renderHarness({ save });

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alertdialog")).toHaveAccessibleName(/someone else saved/i);
    // The editors gate autosave on this; without it the prompt would reappear every 4s.
    expect(screen.getByTestId("blocked")).toHaveTextContent("true");
  });

  it("reload hands back what is stored, so the editor needs no second fetch", async () => {
    const user = userEvent.setup();
    const onReload = vi.fn();
    renderHarness({
      save: vi.fn().mockRejectedValue(new ConcurrentEditError("m1", "<theirs/>")),
      onReload,
    });

    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: /reload theirs/i }));

    expect(onReload).toHaveBeenCalledWith("<theirs/>");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByTestId("blocked")).toHaveTextContent("false");
  });

  it("overwrite replays the same save with the guard off", async () => {
    const user = userEvent.setup();
    const save = vi
      .fn()
      .mockRejectedValueOnce(new ConcurrentEditError("m1", "<theirs/>"))
      .mockResolvedValueOnce(true);
    renderHarness({ save });

    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: /overwrite with mine/i }));

    // Same callback, second call, `overwrite` true — not a separate code path.
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("keep editing changes nothing and resumes autosave", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockRejectedValue(new ConcurrentEditError("m1", "<theirs/>"));
    const onReload = vi.fn();
    renderHarness({ save, onReload });

    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: /keep editing/i }));

    expect(onReload).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("blocked")).toHaveTextContent("false");
  });

  it("does not swallow an unrelated failure", async () => {
    const user = userEvent.setup();
    const boom = new ApiError("Server exploded", 500, "corr-1", {});
    const save = vi.fn().mockRejectedValue(boom);
    const caught = vi.fn();

    function Rethrowing() {
      const conflict = useConflictPrompt({ onReload: () => {} });
      return (
        <>
          <button
            type="button"
            onClick={() => void conflict.guard(save).catch(caught)}
          >
            Save
          </button>
          {conflict.prompt}
        </>
      );
    }
    render(
      <I18nProvider catalogues={CATALOGUES}>
        <ToastProvider>
          <Rethrowing />
        </ToastProvider>
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(caught).toHaveBeenCalledWith(boom);
    // A 500 is the editor's own error to report; no conflict prompt.
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("will not dismiss on a backdrop click — this is a question about losing work", async () => {
    const user = userEvent.setup();
    renderHarness({ save: vi.fn().mockRejectedValue(new ConcurrentEditError("m1", null)) });

    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(document.querySelector(".tf-modal-backdrop")!);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
