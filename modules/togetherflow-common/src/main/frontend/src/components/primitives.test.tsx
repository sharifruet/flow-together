/**
 * The rest of the W1.4 component set (UI_POLISH_BACKLOG.md F2, C3, C4, D1, B1).
 *
 * Grouped in one file because each is small; what is pinned in each case is the reason
 * the component exists rather than its markup — the WCAG rule Badge is there to satisfy,
 * the keyboard pattern Tabs and DropdownMenu implement, the id-not-name problem D1
 * describes.
 */

import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n/I18nContext";
import { commonMessages } from "../i18n/messages";
import { RouterProvider } from "../routing/RouterContext";
import { expectNoA11yViolations } from "../testing/a11y";
import { Avatar, UserChip, initialsFor } from "./Avatar";
import { Badge, toneForPriority, toneForState } from "./Badge";
import { Breadcrumb } from "./Breadcrumb";
import { Card } from "./Card";
import { DropdownMenu } from "./DropdownMenu";
import { EmptyIllustration } from "./EmptyIllustration";
import { ICON_NAMES, Icon } from "./Icon";
import { PageHeader } from "./PageHeader";
import { SidebarNav } from "./SidebarNav";
import { Tabs } from "./Tabs";

function wrap(node: React.ReactNode) {
  return (
    <I18nProvider catalogues={commonMessages}>
      <RouterProvider>{node}</RouterProvider>
    </I18nProvider>
  );
}

describe("Badge (C3)", () => {
  it("keeps the word, never colour alone — WCAG 1.4.1", () => {
    render(<Badge tone="danger">Dead letter</Badge>);
    // The tone is a class; the meaning is the text, and the text is what is read out.
    expect(screen.getByText("Dead letter")).toBeInTheDocument();
  });

  it("reads out a supplied label instead of a bare count", () => {
    render(<Badge tone="danger" srLabel="3 dead-letter jobs">3</Badge>);
    expect(screen.getByText("3 dead-letter jobs")).toBeInTheDocument();
    // The digit itself is hidden, or a screen reader says "3 dead-letter jobs 3".
    expect(screen.getByText("3")).toHaveAttribute("aria-hidden", "true");
  });

  it("maps engine state to tone in one place, so apps cannot disagree", () => {
    expect(toneForState("active")).toBe("success");
    expect(toneForState("SUSPENDED")).toBe("warning");
    expect(toneForState("dead-letter")).toBe("danger");
    expect(toneForState("completed")).toBe("neutral");
  });

  it("falls to neutral for a state the table has never heard of", () => {
    // The engines gain states faster than this table does; a grey badge beats a crash.
    expect(toneForState("some-new-engine-state")).toBe("neutral");
    expect(toneForState(undefined)).toBe("neutral");
  });

  it("bands priority, because the raw int means nothing without the scale", () => {
    expect(toneForPriority(80)).toBe("danger");
    expect(toneForPriority(50)).toBe("warning");
    expect(toneForPriority(10)).toBe("neutral");
    expect(toneForPriority(undefined)).toBe("neutral");
  });
});

describe("Avatar and UserChip (D1)", () => {
  it("derives initials from a display name", () => {
    expect(initialsFor("Alice Brown")).toBe("AB");
    expect(initialsFor("alice")).toBe("AL");
    expect(initialsFor("alice.brown")).toBe("AB");
    expect(initialsFor("  ")).toBe("?");
  });

  it("gives one user the same colour every time", () => {
    const { container: first } = render(<Avatar userId="alice" />);
    const { container: second } = render(<Avatar userId="alice" />);
    const colourOf = (el: HTMLElement) => el.querySelector(".tf-avatar")!.getAttribute("style");
    expect(colourOf(first)).toBe(colourOf(second));
  });

  it("falls back to the id when no name is known — the state D1 found everywhere", () => {
    render(<UserChip userId="alice" />);
    expect(screen.getByText("alice")).toBeInTheDocument();
  });

  it("prefers the display name and keeps the id available on hover", () => {
    const { container } = render(<UserChip userId="alice" name="Alice Brown" />);
    expect(screen.getByText("Alice Brown")).toBeInTheDocument();
    expect(container.querySelector(".tf-user-chip")).toHaveAttribute("title", "Alice Brown (alice)");
  });

  it("keeps the name for assistive tech when compact", () => {
    render(<UserChip userId="alice" name="Alice Brown" compact />);
    expect(screen.getByText("Alice Brown")).toHaveClass("tf-visually-hidden");
  });

  it("marks the picture decorative, since the name is rendered beside it", () => {
    const { container } = render(<UserChip userId="alice" name="Alice Brown" pictureUrl="/pic.png" />);
    expect(container.querySelector("img")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("Icon (C4)", () => {
  it("is decorative by default, so surrounding text is the accessible name", () => {
    const { container } = render(
      <button type="button">
        <Icon name="trash" />
        Delete
      </button>,
    );
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button")).toHaveAccessibleName("Delete");
  });

  it("becomes an image with a name only when asked", () => {
    render(<Icon name="refresh" label="Refresh" />);
    expect(screen.getByRole("img", { name: "Refresh" })).toBeInTheDocument();
  });

  it("draws every name it advertises", () => {
    const { container } = render(
      <>
        {ICON_NAMES.map((name) => (
          <Icon key={name} name={name} />
        ))}
      </>,
    );
    const paths = container.querySelectorAll("svg > path");
    expect(paths).toHaveLength(ICON_NAMES.length);
    for (const path of paths) {
      expect(path.getAttribute("d")).toBeTruthy();
    }
  });
});

describe("EmptyIllustration (C4)", () => {
  it("is decorative — EmptyState renders the real heading beside it", () => {
    const { container } = render(<EmptyIllustration name="inbox-clear" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("Card (F2)", () => {
  it("renders its heading as a real heading", () => {
    render(<Card title="Invoice Approval" meta="v4">Body</Card>);
    expect(screen.getByRole("heading", { name: "Invoice Approval" })).toBeInTheDocument();
  });

  it("renders as the element the caller asks for — a card is not always a div", () => {
    const { container } = render(
      <ul>
        <Card as="li">Body</Card>
      </ul>,
    );
    expect(container.querySelector("li.tf-card")).toBeInTheDocument();
  });

  it("omits the header entirely when there is nothing to put in it", () => {
    const { container } = render(<Card>Body</Card>);
    expect(container.querySelector(".tf-card__header")).toBeNull();
  });
});

describe("PageHeader (B2)", () => {
  it("owns the screen's single h1", () => {
    render(wrap(<PageHeader title="Process instances" description="Everything running." />));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Process instances");
  });

  it("keeps the title for assistive tech even when hidden", () => {
    render(wrap(<PageHeader title="Models" hideTitle />));
    expect(screen.getByRole("heading", { level: 1, name: "Models" })).toHaveClass(
      "tf-visually-hidden",
    );
  });
});

describe("Breadcrumb", () => {
  it("links every crumb but the last, and marks the last as current", () => {
    render(
      wrap(<Breadcrumb items={[{ label: "Models", to: "/models" }, { label: "Invoice Approval" }]} />),
    );
    expect(screen.getByRole("link", { name: "Models" })).toHaveAttribute("href", "/models");
    expect(screen.getByText("Invoice Approval")).toHaveAttribute("aria-current", "page");
  });

  it("renders nothing for an empty trail", () => {
    const { container } = render(wrap(<Breadcrumb items={[]} />));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Tabs", () => {
  function TabsHarness() {
    const [active, setActive] = React.useState<"task" | "people" | "docs">("task");
    return wrap(
      <Tabs
        label="Task sections"
        active={active}
        onChange={setActive}
        tabs={[
          { id: "task", label: "Task" },
          { id: "people", label: "People", count: 3 },
          { id: "docs", label: "Documents", disabled: true },
        ]}
      >
        <p>Panel for {active}</p>
      </Tabs>,
    );
  }

  it("puts only the selected tab in the tab order, so Tab reaches the panel", () => {
    render(<TabsHarness />);
    expect(screen.getByRole("tab", { name: /Task/ })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: /People/ })).toHaveAttribute("tabindex", "-1");
  });

  it("moves focus with the arrows without activating — activation would fire a fetch", async () => {
    const user = userEvent.setup();
    render(<TabsHarness />);
    screen.getByRole("tab", { name: /Task/ }).focus();

    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /People/ }));
    // Still on the first panel: moving is not choosing.
    expect(screen.getByText("Panel for task")).toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(screen.getByText("Panel for people")).toBeInTheDocument();
  });

  it("skips a disabled tab and wraps around", async () => {
    const user = userEvent.setup();
    render(<TabsHarness />);
    screen.getByRole("tab", { name: /People/ }).focus();
    await user.keyboard("{ArrowRight}");
    // "Documents" is disabled, so the next enabled tab is the first one.
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /Task/ }));
  });

  it("ties the panel to its tab", () => {
    render(<TabsHarness />);
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAccessibleName("Task");
    expect(screen.getByRole("tab", { name: /Task/ })).toHaveAttribute("aria-controls", panel.id);
  });
});

describe("DropdownMenu", () => {
  function menu(onSelect = vi.fn()) {
    return {
      onSelect,
      node: wrap(
        <>
          <DropdownMenu
            label="Actions for Approve invoice"
            items={[
              { id: "open", label: "Open", onSelect },
              { id: "claim", label: "Claim", onSelect },
              { id: "hold", label: "Put on hold", disabled: true, disabledReason: "Already on hold.", onSelect },
            ]}
          />
          <button type="button">Elsewhere</button>
        </>,
      ),
    };
  }

  it("names the trigger for the row it belongs to, not just 'Actions'", () => {
    const { node } = menu();
    render(node);
    expect(screen.getByRole("button", { name: "Actions for Approve invoice" })).toHaveAttribute(
      "aria-haspopup",
      "menu",
    );
  });

  it("opens with ArrowDown onto the first item and selects with Enter", async () => {
    const user = userEvent.setup();
    const { node, onSelect } = menu();
    render(node);
    screen.getByRole("button", { name: /Actions/ }).focus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalled();
  });

  it("skips disabled items when arrowing", async () => {
    const user = userEvent.setup();
    const { node } = menu();
    render(node);
    screen.getByRole("button", { name: /Actions/ }).focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    // open → claim → wraps past the disabled "Put on hold" back to open.
    const active = screen.getByRole("menu").querySelector(".tf-menu-panel__item--active");
    expect(active).toHaveTextContent("Open");
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    const { node } = menu();
    render(node);
    const trigger = screen.getByRole("button", { name: /Actions/ });
    trigger.focus();
    await user.keyboard("{ArrowDown}{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when focus leaves, so a Tab does not strand an open popup", async () => {
    const user = userEvent.setup();
    const { node } = menu();
    render(node);
    await user.click(screen.getByRole("button", { name: /Actions/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    // fireEvent rather than .focus(): the listener sets state, which needs an act() flush.
    fireEvent.focusIn(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on a click outside", async () => {
    const user = userEvent.setup();
    const { node } = menu();
    render(node);
    await user.click(screen.getByRole("button", { name: /Actions/ }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("explains why a disabled item is disabled", async () => {
    const user = userEvent.setup();
    const { node } = menu();
    render(node);
    await user.click(screen.getByRole("button", { name: /Actions/ }));
    const item = screen.getByRole("menuitem", { name: "Put on hold" });
    expect(item).toBeDisabled();
    expect(item).toHaveAttribute("title", "Already on hold.");
  });
});

describe("SidebarNav (B1)", () => {
  beforeEach(() => window.localStorage.clear());

  const GROUPS = [
    {
      items: [
        { id: "instances", label: "Process instances", to: "/instances", icon: "instances" as const, count: 412 },
      ],
    },
    {
      label: "Operations",
      items: [
        { id: "jobs", label: "Jobs", to: "/jobs", icon: "jobs" as const, count: 3, countTone: "danger" as const },
      ],
    },
  ];

  function nav() {
    return wrap(
      <SidebarNav label="Control sections" groups={GROUPS} activeId="jobs" preferenceKey="test" />,
    );
  }

  it("renders every destination as a real link — F1's middle-click requirement", () => {
    render(nav());
    expect(screen.getByRole("link", { name: /Process instances/ })).toHaveAttribute(
      "href",
      "/instances",
    );
  });

  it("marks the current destination", () => {
    render(nav());
    expect(screen.getByRole("link", { name: /Jobs/ })).toHaveAttribute("aria-current", "page");
  });

  it("shows counts, so an operator sees 3 dead-letter jobs without opening Jobs (B3)", () => {
    render(nav());
    expect(within(screen.getByRole("link", { name: /Jobs/ })).getByText("3")).toBeInTheDocument();
  });

  it("collapses, keeps the labels for assistive tech, and remembers the choice", async () => {
    const user = userEvent.setup();
    const { unmount } = render(nav());
    await user.click(screen.getByRole("button", { name: "Collapse" }));

    // Still named, still reachable — the label is hidden visually, not removed.
    expect(screen.getByRole("link", { name: "Jobs" })).toBeInTheDocument();

    unmount();
    render(nav());
    expect(screen.getByRole("button", { name: "Expand" })).toBeInTheDocument();
  });
});

describe("accessibility of the new primitives", () => {
  it("has no axe violations", async () => {
    const { container } = render(
      wrap(
        <>
          <PageHeader
            title="Jobs"
            description="Timers, async work and the dead-letter queue."
            breadcrumbs={[{ label: "Control", to: "/" }, { label: "Jobs" }]}
            meta={<Badge tone="danger">3 failed</Badge>}
          />
          <Card title="Queue" meta="updated just now">
            <UserChip userId="alice" name="Alice Brown" />
            <Badge tone="success" dot>Running</Badge>
          </Card>
          <SidebarNav
            label="Sections"
            activeId="jobs"
            preferenceKey="a11y"
            groups={[{ items: [{ id: "jobs", label: "Jobs", to: "/jobs", icon: "jobs", count: 3 }] }]}
          />
          <DropdownMenu label="Actions for this row" items={[{ id: "a", label: "Open", onSelect: () => {} }]} />
        </>,
      ),
    );
    await expectNoA11yViolations(container);
  });
});
