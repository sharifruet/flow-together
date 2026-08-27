/**
 * F6's acceptance: "one `Modal` primitive owns trap/restore/scroll-lock/`inert`;
 * `ConfirmDialog` is built on it; no screen writes `.tf-dialog` markup directly; an axe +
 * keyboard test covers the trap."
 *
 * This is that test. Each behaviour is asserted separately because each was separately
 * absent before — `ConfirmDialog` had Escape and initial focus and none of the other
 * four, and every hand-rolled dialog had a different subset.
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n/I18nContext";
import { commonMessages } from "../i18n/messages";
import { expectNoA11yViolations } from "../testing/a11y";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { Modal } from "./Modal";

function withI18n(node: React.ReactNode) {
  return <I18nProvider catalogues={commonMessages}>{node}</I18nProvider>;
}

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  return withI18n(
    <>
      <button type="button">Behind the dialog</button>
      <Modal
        open
        title="Migrate instances"
        description="Twelve instances move to version 4."
        onClose={onClose}
        actions={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onClose}>Migrate</Button>
          </>
        }
      >
        <input aria-label="Target version" defaultValue="4" />
      </Modal>
    </>,
  );
}

describe("Modal", () => {
  it("names and describes itself, and is marked modal", () => {
    render(<Harness />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Migrate instances");
    expect(dialog).toHaveAccessibleDescription("Twelve instances move to version 4.");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("traps Tab inside the dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = screen.getByRole("dialog");
    const inside = [
      screen.getByRole("button", { name: "Close" }),
      screen.getByLabelText("Target version"),
      screen.getByRole("button", { name: "Cancel" }),
      screen.getByRole("button", { name: "Migrate" }),
    ];

    // Walk the whole ring and one step past it; focus must never leave.
    for (let step = 0; step < inside.length + 2; step++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("traps Shift+Tab backwards past the first control", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = screen.getByRole("dialog");

    await user.tab();
    for (let step = 0; step < 6; step++) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("restores focus to whatever opened it", async () => {
    const user = userEvent.setup();
    function Toggle() {
      const [open, setOpen] = React.useState(false);
      return withI18n(
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <Modal open={open} title="A dialog" onClose={() => setOpen(false)} />
        </>,
      );
    }
    render(<Toggle />);
    const opener = screen.getByRole("button", { name: "Open" });
    await user.click(opener);
    expect(document.activeElement).not.toBe(opener);

    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(opener);
  });

  it("locks the page behind it from scrolling", () => {
    const { unmount } = render(<Harness />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("makes the page behind inert and hidden from assistive tech", () => {
    /*
     * Both, not either. `aria-hidden` hides from assistive tech but leaves the background
     * clickable and focusable — the exact gap the trap then has to cover — and `inert` is
     * not in every supported browser yet.
     */
    const { unmount } = render(<Harness />);

    // Not reachable by an accessible-name query any more — which is the assertion.
    // `hidden: true` opts back into aria-hidden content so the element can be inspected.
    expect(screen.queryByRole("button", { name: "Behind the dialog" })).toBeNull();
    const behind = screen.getByRole("button", { name: "Behind the dialog", hidden: true });

    const wrapper = behind.closest("body > *")!;
    expect(wrapper).toHaveAttribute("inert");
    expect(wrapper).toHaveAttribute("aria-hidden", "true");

    unmount();
    expect(wrapper).not.toHaveAttribute("inert");
    expect(wrapper).not.toHaveAttribute("aria-hidden");
  });

  it("closes on Escape and on the close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("closes on a backdrop click, and does not when told not to", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      withI18n(<Modal open title="A dialog" onClose={onClose} />),
    );
    fireEvent.mouseDown(document.querySelector(".tf-modal-backdrop")!);
    expect(onClose).toHaveBeenCalledTimes(1);

    // A dialog with unsaved input opts out: a stray backdrop click would discard it.
    rerender(withI18n(<Modal open title="A dialog" dismissOnBackdrop={false} onClose={onClose} />));
    fireEvent.mouseDown(document.querySelector(".tf-modal-backdrop")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not let a click inside the dialog reach the backdrop", () => {
    const onClose = vi.fn();
    render(withI18n(<Modal open title="A dialog" onClose={onClose}>body</Modal>));
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("has no axe violations", async () => {
    const { container } = render(<Harness />);
    await expectNoA11yViolations(container);
  });
});

describe("ConfirmDialog on Modal", () => {
  it("is an alertdialog and focuses the confirming action", () => {
    render(
      withI18n(
        <ConfirmDialog
          open
          title="Delete this deployment?"
          description="Every running instance will be deleted too."
          destructive
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      ),
    );
    expect(screen.getByRole("alertdialog")).toHaveAccessibleName("Delete this deployment?");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Confirm" }));
  });

  it("inherits the trap rather than reimplementing it", async () => {
    const user = userEvent.setup();
    render(
      withI18n(
        <>
          <button type="button">Behind</button>
          <ConfirmDialog
            open
            title="Complete this task?"
            description="It will leave your inbox."
            onConfirm={() => {}}
            onCancel={() => {}}
          />
        </>,
      ),
    );
    const dialog = screen.getByRole("alertdialog");
    for (let step = 0; step < 5; step++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });
});
