/**
 * Keyboard shortcuts (REQUIREMENTS.md §14.4).
 *
 * The behaviours worth pinning are the ones that make shortcuts safe rather than the ones
 * that make them work: they must not fire while someone is typing, must not steal a
 * browser or OS command, must disappear with the screen that registered them, and must be
 * discoverable — a shortcut nobody can find is barely a feature.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ShortcutProvider, useRegisterShortcuts } from "./ShortcutContext";
import { isTypingTarget, type Shortcut } from "./useShortcuts";

function Screen({ shortcuts }: { shortcuts: Shortcut[] }) {
  useRegisterShortcuts(shortcuts);
  return null;
}

describe("isTypingTarget", () => {
  it("recognises the places a keystroke is text rather than a command", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const div = document.createElement("div");
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(textarea)).toBe(true);
    expect(isTypingTarget(select)).toBe(true);
    expect(isTypingTarget(div)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("ShortcutProvider", () => {
  it("runs a registered binding", async () => {
    const run = vi.fn();
    render(
      <ShortcutProvider>
        <Screen shortcuts={[{ key: "j", description: "Next", run }]} />
      </ShortcutProvider>,
    );
    await userEvent.keyboard("j");
    expect(run).toHaveBeenCalledOnce();
  });

  it("does not fire while the user is typing in a field", async () => {
    const run = vi.fn();
    render(
      <ShortcutProvider>
        <Screen shortcuts={[{ key: "j", description: "Next", run }]} />
        <input aria-label="Search" />
      </ShortcutProvider>,
    );
    await userEvent.click(screen.getByLabelText("Search"));
    await userEvent.keyboard("j");

    expect(run).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Search")).toHaveValue("j");
  });

  it("ignores a modified key, which belongs to the browser or the OS", async () => {
    const run = vi.fn();
    render(
      <ShortcutProvider>
        <Screen shortcuts={[{ key: "s", description: "Save", run }]} />
      </ShortcutProvider>,
    );
    await userEvent.keyboard("{Meta>}s{/Meta}");
    await userEvent.keyboard("{Control>}s{/Control}");
    expect(run).not.toHaveBeenCalled();
  });

  it("skips a binding whose condition is false", async () => {
    const run = vi.fn();
    render(
      <ShortcutProvider>
        <Screen shortcuts={[{ key: "d", description: "Complete", run, when: false }]} />
      </ShortcutProvider>,
    );
    await userEvent.keyboard("d");
    expect(run).not.toHaveBeenCalled();
  });

  it("unregisters when the screen that owned it goes away", async () => {
    const run = vi.fn();
    function Harness() {
      const [mounted, setMounted] = useState(true);
      const shortcuts = useMemo<Shortcut[]>(() => [{ key: "d", description: "Complete", run }], []);
      return (
        <ShortcutProvider>
          <button onClick={() => setMounted(false)}>unmount</button>
          {mounted ? <Screen shortcuts={shortcuts} /> : null}
        </ShortcutProvider>
      );
    }
    render(<Harness />);

    await userEvent.keyboard("d");
    expect(run).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button", { name: "unmount" }));
    await userEvent.keyboard("d");
    expect(run).toHaveBeenCalledOnce();
  });

  it("is inert when disabled, so nothing fires behind the login screen", async () => {
    const run = vi.fn();
    render(
      <ShortcutProvider enabled={false}>
        <Screen shortcuts={[{ key: "j", description: "Next", run }]} />
      </ShortcutProvider>,
    );
    await userEvent.keyboard("j");
    expect(run).not.toHaveBeenCalled();
  });

  it("lists every registered shortcut in the help dialog", async () => {
    render(
      <ShortcutProvider>
        <Screen
          shortcuts={[
            { key: "j", description: "Next task in the list", run: vi.fn() },
            { key: "c", description: "Claim the open task", run: vi.fn() },
            // Undescribed bindings stay out of the help rather than padding it.
            { key: "Escape", run: vi.fn() },
          ]}
        />
      </ShortcutProvider>,
    );

    await userEvent.keyboard("?");

    const dialog = await screen.findByRole("dialog", { name: /keyboard shortcuts/i });
    expect(dialog).toHaveTextContent("Next task in the list");
    expect(dialog).toHaveTextContent("Claim the open task");
    expect(dialog).not.toHaveTextContent("Esc");
  });

  it("closes the help dialog on Escape without the screen's own Escape stealing it", async () => {
    const screenEscape = vi.fn();
    render(
      <ShortcutProvider>
        <Screen shortcuts={[{ key: "Escape", run: screenEscape }]} />
      </ShortcutProvider>,
    );

    await userEvent.keyboard("?");
    expect(await screen.findByRole("dialog", { name: /keyboard shortcuts/i })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /keyboard shortcuts/i })).not.toBeInTheDocument();
    expect(screenEscape).not.toHaveBeenCalled();
  });

  it("does nothing when a component registers outside a provider", async () => {
    const run = vi.fn();
    // No provider: registration is a no-op rather than a crash, so a component stays
    // usable in isolation.
    expect(() => render(<Screen shortcuts={[{ key: "j", run }]} />)).not.toThrow();
    await userEvent.keyboard("j");
    expect(run).not.toHaveBeenCalled();
  });
});
