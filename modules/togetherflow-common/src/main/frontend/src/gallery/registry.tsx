/**
 * The documented component set (REQUIREMENTS.md §14.2: "A real, documented shared
 * component library in `togetherflow-common` (Storybook or equivalent) … every component
 * documents its own default/hover/focus/active/disabled/loading/error visual states").
 *
 * "Or equivalent" is taken up rather than adding Storybook: the same reasoning as
 * [ADR 0001](../../../../../../docs/ui/adr/0001-in-house-design-system.md) and
 * [ADR 0013](../../../../../../docs/ui/adr/0013-in-house-i18n.md). What this product
 * needs is a page that renders every component in every state it can be put into — which
 * is a list of nodes — against a dependency with its own build, addon system and
 * configuration surface.
 *
 * Honest about one limit: `hover`, `active` and `focus` are CSS pseudo-classes and
 * cannot be forced from JavaScript without duplicating the stylesheet's rules onto
 * gallery-only classes, which would then drift from the real ones. They are marked
 * `interactive` and demonstrated live — hover the sample, or use the focus button — while
 * every state a prop controls is rendered as its own instance.
 */

import { useState, type ReactNode } from "react";
import { ApiError } from "../api/client";
import { Avatar, UserChip } from "../components/Avatar";
import { Badge, toneForPriority, toneForState } from "../components/Badge";
import { Brand } from "../components/Brand";
import { Breadcrumb } from "../components/Breadcrumb";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable, Pagination } from "../components/DataTable";
import { DropdownMenu } from "../components/DropdownMenu";
import { EmptyIllustration } from "../components/EmptyIllustration";
import { ICON_NAMES, Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { SidebarNav } from "../components/SidebarNav";
import { Tabs } from "../components/Tabs";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { SelectInput, TextAreaInput, TextInput } from "../components/Field";
import { SavedViews } from "../components/SavedViews";
import { ShellMenu } from "../components/ShellMenu";
import { ShortcutHelp } from "../components/ShortcutHelp";
import {
  EmptyState,
  ErrorState,
  NoResultsState,
  PermissionDeniedState,
  Skeleton,
} from "../components/States";
import { useToast } from "../components/Toast";

export interface GalleryState {
  label: string;
  /** Why this state exists, where that is not obvious from the name. */
  note?: string;
  /** True where the state is a CSS pseudo-class and must be produced by interacting. */
  interactive?: boolean;
  node: ReactNode;
}

export interface GalleryEntry {
  /** Matches the file in src/components, which is how coverage is checked. */
  name: string;
  description: string;
  states: GalleryState[];
}

interface Row {
  id: string;
  task: string;
  assignee: string;
}

const ROWS: Row[] = [
  { id: "1", task: "Approve invoice INV-2291", assignee: "alice" },
  { id: "2", task: "Review onboarding checklist", assignee: "bob" },
];

/** Demonstrates the focus ring, which no prop can switch on. */
function FocusDemo() {
  return (
    <div className="tf-gallery__focus">
      <Button
        variant="secondary"
        onClick={() => document.getElementById("tf-gallery-focus-target")?.focus()}
      >
        Focus the button →
      </Button>
      <Button id="tf-gallery-focus-target">Focus target</Button>
    </div>
  );
}

function ToastDemo() {
  const { push } = useToast();
  return (
    <div className="tf-gallery__row">
      <Button onClick={() => push({ tone: "success", message: "Task completed." })}>Success</Button>
      <Button
        variant="secondary"
        onClick={() => push({ tone: "info", message: "Nothing to do here yet." })}
      >
        Info
      </Button>
      <Button
        variant="secondary"
        onClick={() => push({ tone: "warning", message: "3 of 5 jobs executed; 2 failed." })}
      >
        Warning
      </Button>
      <Button
        variant="danger"
        onClick={() =>
          push({
            tone: "error",
            message: "The server rejected that request as invalid.",
            reference: "corr-8f21",
          })
        }
      >
        Error
      </Button>
    </div>
  );
}

function DialogDemo({ destructive }: { destructive?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={destructive ? "danger" : "primary"} onClick={() => setOpen(true)}>
        Open
      </Button>
      <ConfirmDialog
        open={open}
        title={destructive ? "Delete this deployment?" : "Complete this task?"}
        description={
          destructive
            ? "Every running instance from this deployment will be deleted too. Work in progress is lost."
            : "\"Approve invoice INV-2291\" will be completed and removed from your inbox. This can't be undone."
        }
        destructive={destructive}
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

function ShortcutHelpDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <ShortcutHelp
        open={open}
        onClose={() => setOpen(false)}
        shortcuts={[
          { key: "j", description: "Next task in the list", run: () => {} },
          { key: "k", description: "Previous task in the list", run: () => {} },
          { key: "c", description: "Claim the open task", run: () => {} },
        ]}
      />
    </>
  );
}

function SavedViewsDemo() {
  const [views, setViews] = useState([
    { id: "1", name: "Overdue, high priority", value: { filter: "mine" }, savedAt: "" },
  ]);
  return (
    <SavedViews
      views={views}
      current={{ filter: "mine" }}
      onApply={() => {}}
      onSave={(name, value) => setViews((v) => [...v, { id: String(v.length + 1), name, value, savedAt: "" }])}
      onRemove={(id) => setViews((v) => v.filter((view) => view.id !== id))}
    />
  );
}

/** Hoisted: a component defined inside a render remounts on every keystroke. */
function Boom({ explode }: { explode: boolean }): ReactNode {
  if (explode) throw new Error("Demonstration failure");
  return <p className="tf-muted">Nothing wrong yet.</p>;
}

function BoundaryDemo() {
  const [explode, setExplode] = useState(false);
  return (
    <div className="tf-gallery__stack">
      <Button variant="danger" onClick={() => setExplode(true)}>
        Break this subtree
      </Button>
      <ErrorBoundary boundary="gallery" resetKey={explode}>
        <Boom explode={explode} />
      </ErrorBoundary>
    </div>
  );
}


function ModalDemo({ size }: { size?: "sm" | "md" | "lg" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <Modal
        open={open}
        size={size}
        title="Migrate 12 process instances"
        description="Instances move to version 4 of Invoice Approval. Activity mappings below apply to every selected instance."
        onClose={() => setOpen(false)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setOpen(false)}>Migrate</Button>
          </>
        }
      >
        <p className="tf-muted">
          Tab and Shift+Tab cycle inside this dialog; Escape closes it and focus returns to
          the button that opened it. The page behind is inert.
        </p>
        <label className="tf-field">
          <span className="tf-field__label">Target version</span>
          <input className="tf-input" defaultValue="4" />
        </label>
      </Modal>
    </>
  );
}

function TabsDemo() {
  const [active, setActive] = useState<"task" | "people" | "subtasks" | "documents">("task");
  return (
    <Tabs
      label="Task sections"
      active={active}
      onChange={setActive}
      tabs={[
        { id: "task", label: "Task" },
        { id: "people", label: "People", count: 3 },
        { id: "subtasks", label: "Subtasks", count: 0 },
        { id: "documents", label: "Documents", count: 2, disabled: true },
      ]}
    >
      <p className="tf-muted">
        Arrow keys move between tabs, Enter or Space selects. Only the selected tab is a tab
        stop, so Tab moves into this panel rather than through every tab first.
      </p>
    </Tabs>
  );
}

function TableDemo() {
  const [sort, setSort] = useState({ key: "dueDate", order: "asc" as const });
  const [selection, setSelection] = useState(new Set<string>(["1"]));
  return (
    <DataTable
      caption="Tasks"
      preferenceKey="gallery.tasks"
      sort={sort}
      onSortChange={(next) => setSort(next as typeof sort)}
      selection={selection}
      onSelectionChange={setSelection}
      bulkActions={(selected) => (
        <Button variant="secondary">Reassign {selected.length}</Button>
      )}
      rowActions={(row: Row) => [
        { id: "open", label: "Open", icon: <Icon name="external" size={16} />, onSelect: () => {} },
        { id: "claim", label: "Claim", icon: <Icon name="check" size={16} />, onSelect: () => {} },
        {
          id: "delete",
          label: `Delete ${row.task}`,
          icon: <Icon name="trash" size={16} />,
          destructive: true,
          onSelect: () => {},
        },
      ]}
      columns={[
        { key: "task", header: "Task", sortKey: "name", required: true, render: (row: Row) => row.task },
        {
          key: "assignee",
          header: "Assignee",
          secondary: true,
          render: (row: Row) => <UserChip userId={row.assignee} />,
        },
        {
          key: "dueDate",
          header: "Due",
          sortKey: "dueDate",
          align: "end" as const,
          render: () => "in 2 days",
        },
      ]}
      rows={ROWS}
      rowKey={(row) => row.id}
    />
  );
}

const MANY_ROWS: Row[] = Array.from({ length: 120 }, (_, index) => ({
  id: String(index + 1),
  task: `Approve invoice INV-${2200 + index}`,
  assignee: index % 2 ? "bob" : "alice",
}));

export const GALLERY: GalleryEntry[] = [
  {
    name: "Badge",
    description:
      "Status as a badge rather than prose (C3). Never colour alone — the word always stays, and the tone is redundant encoding.",
    states: [
      {
        label: "Tones",
        node: (
          <div className="tf-gallery__row">
            <Badge tone="neutral">Completed</Badge>
            <Badge tone="info">Available</Badge>
            <Badge tone="success">Active</Badge>
            <Badge tone="warning">Suspended</Badge>
            <Badge tone="danger">Dead letter</Badge>
          </div>
        ),
      },
      {
        label: "Subtle",
        note: "Hollow, for a dense table where filled badges would stripe the page.",
        node: (
          <div className="tf-gallery__row">
            <Badge tone="neutral" subtle>12</Badge>
            <Badge tone="info" subtle>v4</Badge>
            <Badge tone="danger" subtle>3 failed</Badge>
          </div>
        ),
      },
      {
        label: "With a dot",
        note: "For a state that reads as live/stopped rather than as a label.",
        node: (
          <div className="tf-gallery__row">
            <Badge tone="success" dot>Running</Badge>
            <Badge tone="warning" dot>Suspended</Badge>
          </div>
        ),
      },
      {
        label: "Mapped from engine state",
        note: "toneForState/toneForPriority keep Work and Control agreeing about what colour a state is.",
        node: (
          <div className="tf-gallery__row">
            {["active", "suspended", "terminated", "completed", "deadletter"].map((state) => (
              <Badge key={state} tone={toneForState(state)}>{state}</Badge>
            ))}
            <Badge tone={toneForPriority(80)}>High</Badge>
            <Badge tone={toneForPriority(50)}>Normal</Badge>
            <Badge tone={toneForPriority(10)}>Low</Badge>
          </div>
        ),
      },
      {
        label: "Screen-reader label",
        note: "A bare count in a nav badge is meaningless out of context; srLabel supplies the sentence.",
        node: <Badge tone="danger" srLabel="3 dead-letter jobs">3</Badge>,
      },
    ],
  },
  {
    name: "Card",
    description:
      "The panel every app re-invented — .tf-panel in two stylesheets, .tf-card in three, .tf-detail in Work (F2).",
    states: [
      { label: "Plain", node: <Card>Body content.</Card> },
      {
        label: "With header and actions",
        node: (
          <Card
            title="Invoice Approval"
            meta="v4 · deployed 2 days ago"
            actions={<Button variant="secondary">Edit</Button>}
          >
            Body content.
          </Card>
        ),
      },
      {
        label: "Flush",
        note: "No body padding — for a card whose whole body is a table.",
        node: (
          <Card title="Tasks" flush>
            <DataTable
              caption="Tasks"
              columns={[{ key: "task", header: "Task", render: (row: Row) => row.task }]}
              rows={ROWS}
              rowKey={(row) => row.id}
            />
          </Card>
        ),
      },
    ],
  },
  {
    name: "PageHeader",
    description:
      "The title / description / primary-action region every screen was missing (B2). Owns the screen's single <h1>.",
    states: [
      {
        label: "Full",
        node: (
          <PageHeader
            title="Process instances"
            description="Every running and recently finished process instance in this tenant."
            breadcrumbs={[{ label: "Control", to: "/" }, { label: "Process instances" }]}
            meta={<Badge tone="info" subtle>412</Badge>}
            actions={
              <>
                <Button variant="secondary">
                  <Icon name="download" size={16} />
                  Export
                </Button>
                <Button>
                  <Icon name="add" size={16} />
                  Start instance
                </Button>
              </>
            }
          />
        ),
      },
      { label: "Title only", node: <PageHeader title="System" /> },
      {
        label: "With filters underneath",
        node: (
          <PageHeader title="Jobs" description="Timers, async work and the dead-letter queue.">
            <div className="tf-chips" style={{ marginTop: "var(--tf-space-3)" }}>
              <button type="button" className="tf-chip tf-chip--active">All</button>
              <button type="button" className="tf-chip">Timers</button>
              <button type="button" className="tf-chip">Dead letter</button>
            </div>
          </PageHeader>
        ),
      },
    ],
  },
  {
    name: "Breadcrumb",
    description:
      "Where you are and the way back. Only meaningful now that every screen has a URL (F1) — before W1.3 a trail could only have been decorative.",
    states: [
      {
        label: "Two levels",
        node: <Breadcrumb items={[{ label: "Models", to: "/models" }, { label: "Invoice Approval" }]} />,
      },
      {
        label: "Three levels",
        node: (
          <Breadcrumb
            items={[
              { label: "Control", to: "/" },
              { label: "Process instances", to: "/instances" },
              { label: "b8f1e0c2" },
            ]}
          />
        ),
      },
    ],
  },
  {
    name: "Modal",
    description:
      "The one modal (F6): focus trap, focus restore, body scroll lock, and the page behind marked inert. ConfirmDialog is built on it.",
    states: [
      { label: "Default", interactive: true, node: <ModalDemo /> },
      { label: "Large", interactive: true, node: <ModalDemo size="lg" /> },
    ],
  },
  {
    name: "Tabs",
    description:
      "WAI-ARIA tabs with manual activation: arrows move focus, Enter selects. Automatic activation would fire a fetch per arrow press.",
    states: [
      { label: "Default", interactive: true, node: <TabsDemo /> },
    ],
  },
  {
    name: "Avatar",
    description:
      "A person, shown as a person (D1). Every screen renders the raw engine id today; this is the primitive that replaces it.",
    states: [
      {
        label: "Sizes",
        node: (
          <div className="tf-gallery__row">
            <Avatar userId="alice" name="Alice Brown" size="sm" />
            <Avatar userId="alice" name="Alice Brown" size="md" />
            <Avatar userId="alice" name="Alice Brown" size="lg" />
          </div>
        ),
      },
      {
        label: "Stable colour per user",
        note: "Hashed from the id, so the same person is the same colour on every screen and in every session.",
        node: (
          <div className="tf-gallery__row">
            {["alice", "bob", "carol", "dave", "erin", "frank"].map((id) => (
              <Avatar key={id} userId={id} size="md" />
            ))}
          </div>
        ),
      },
      {
        label: "UserChip",
        node: (
          <div className="tf-gallery__row">
            <UserChip userId="alice" name="Alice Brown" />
            <UserChip userId="bob" name="Bob Chen" secondary="Approver" />
            <UserChip userId="unknown-id" />
          </div>
        ),
      },
      {
        label: "UserChip — compact",
        note: "Avatar alone; the name is still there for assistive tech.",
        node: <UserChip userId="alice" name="Alice Brown" compact />,
      },
    ],
  },
  {
    name: "DropdownMenu",
    description:
      "The row-action and toolbar menu (C1). Closes on Escape, on a click outside, on selection, and on focus leaving — the last is how a Tab strands an open popup.",
    states: [
      {
        label: "Row actions",
        interactive: true,
        node: (
          <DropdownMenu
            label="Actions for Approve invoice INV-2291"
            items={[
              { id: "open", label: "Open", icon: <Icon name="external" size={16} />, onSelect: () => {} },
              { id: "claim", label: "Claim", icon: <Icon name="check" size={16} />, onSelect: () => {} },
              {
                id: "delete",
                label: "Delete",
                icon: <Icon name="trash" size={16} />,
                destructive: true,
                onSelect: () => {},
              },
            ]}
          />
        ),
      },
      {
        label: "With a disabled item",
        note: "A disabled control that says nothing is a dead end, so it carries its reason.",
        interactive: true,
        node: (
          <DropdownMenu
            label="Actions"
            align="start"
            trigger={<>Actions <Icon name="chevron-down" size={16} /></>}
            items={[
              { id: "retry", label: "Retry", onSelect: () => {} },
              {
                id: "move",
                label: "Move to dead letter",
                disabled: true,
                disabledReason: "Already in the dead-letter queue.",
                onSelect: () => {},
              },
            ]}
          />
        ),
      },
    ],
  },
  {
    name: "SidebarNav",
    description:
      "The left rail (B1). Control has seven top-level areas and had a flat button row; every item is a real link, so middle-click works.",
    states: [
      {
        label: "Expanded",
        node: (
          <div style={{ height: 320, display: "flex" }}>
            <SidebarNav
              label="Control sections"
              activeId="jobs"
              preferenceKey="gallery"
              groups={[
                {
                  items: [
                    { id: "instances", label: "Process instances", to: "/instances", icon: "instances", count: 412 },
                    { id: "cases", label: "Case instances", to: "/cases", icon: "cases", count: 18 },
                  ],
                },
                {
                  label: "Operations",
                  items: [
                    { id: "jobs", label: "Jobs", to: "/jobs", icon: "jobs", count: 3, countTone: "danger" },
                    { id: "deployments", label: "Deployments", to: "/deployments", icon: "deployments" },
                    { id: "system", label: "System", to: "/system", icon: "system" },
                  ],
                },
              ]}
            />
          </div>
        ),
      },
    ],
  },
  {
    name: "Icon",
    description:
      "The icon set (C4). Two <svg> elements existed in the whole frontend before this. Drawn in-house on one 24x24 grid rather than adopting a library, for the bundle-budget reason C4 itself flags.",
    states: [
      {
        label: "The set",
        note: "One grid, one stroke width, currentColor — which is what makes them read as a set.",
        node: (
          <div className="tf-gallery__row" style={{ flexWrap: "wrap", gap: "var(--tf-space-4)" }}>
            {ICON_NAMES.map((name) => (
              <span key={name} title={name} style={{ display: "grid", justifyItems: "center", width: 64, gap: 4 }}>
                <Icon name={name} size={22} />
                <small className="tf-muted" style={{ fontSize: 10 }}>{name}</small>
              </span>
            ))}
          </div>
        ),
      },
      {
        label: "Sizes",
        node: (
          <div className="tf-gallery__row">
            <Icon name="inbox" size={14} />
            <Icon name="inbox" size={16} />
            <Icon name="inbox" size={20} />
            <Icon name="inbox" size={24} />
            <Icon name="inbox" size={32} />
          </div>
        ),
      },
      {
        label: "Labelled",
        note: "Only where the icon is the whole meaning. With visible text beside it, leave it decorative or a screen reader reads the action twice.",
        node: (
          <Button variant="secondary" aria-label="Refresh">
            <Icon name="refresh" label="Refresh" />
          </Button>
        ),
      },
    ],
  },
  {
    name: "EmptyIllustration",
    description:
      "Empty-state illustrations (C4), built from the brand glyph's own vocabulary so an empty screen still reads as this product. Theme-aware: one asset, both modes.",
    states: [
      {
        label: "All six",
        node: (
          <div className="tf-gallery__row" style={{ flexWrap: "wrap" }}>
            {(["inbox-clear", "no-results", "nothing-deployed", "no-models", "permission-denied", "error"] as const).map(
              (name) => (
                <span key={name} style={{ display: "grid", justifyItems: "center" }}>
                  <EmptyIllustration name={name} width={120} />
                  <small className="tf-muted">{name}</small>
                </span>
              ),
            )}
          </div>
        ),
      },
    ],
  },
  {
    name: "Brand",
    description:
      "The product lockup. The one place the TogetherFlow identity is defined, so no app can drift from it (§7.5).",
    states: [
      { label: "Default", node: <Brand /> },
      { label: "Large", note: "Used on the login screen.", node: <Brand size={40} /> },
    ],
  },
  {
    name: "Button",
    description: "Four variants. Loading implies disabled — a busy button must not be pressed twice.",
    states: [
      { label: "Primary", node: <Button>Complete task</Button> },
      { label: "Secondary", node: <Button variant="secondary">Cancel</Button> },
      { label: "Ghost", node: <Button variant="ghost">Edit</Button> },
      {
        label: "Danger",
        note: "Every destructive action (§14.3).",
        node: <Button variant="danger">Delete instance</Button>,
      },
      { label: "Disabled", node: <Button disabled>Complete task</Button> },
      {
        label: "Loading",
        note: "Sets aria-busy and disables itself.",
        node: <Button loading>Completing…</Button>,
      },
      {
        label: "Hover / active",
        interactive: true,
        note: "CSS pseudo-classes — hover and hold the sample.",
        node: <Button>Hover me</Button>,
      },
      {
        label: "Focus",
        interactive: true,
        note: "The focus ring is a token (--tf-focus-ring) and must be visible on every control (§14.4).",
        node: <FocusDemo />,
      },
    ],
  },
  {
    name: "Field",
    description:
      "Labelled inputs. Hint and error text are associated to the control, so a screen reader announces why a value was rejected (§14.3).",
    states: [
      { label: "Text", node: <TextInput label="Username" value="" onChange={() => {}} /> },
      {
        label: "With hint",
        node: <TextInput label="Business key" hint="Optional reference you can use to find this instance later." value="" onChange={() => {}} />,
      },
      {
        label: "Required",
        node: <TextInput label="User id" required value="" onChange={() => {}} />,
      },
      {
        label: "Error",
        node: <TextInput label="Email" value="not-an-email" error="Enter a valid email address." onChange={() => {}} />,
      },
      {
        label: "Disabled",
        node: <TextInput label="User id" value="kermit" disabled onChange={() => {}} />,
      },
      {
        label: "Select",
        node: (
          <SelectInput label="Priority" value="high" onChange={() => {}}>
            <option value="high">High</option>
            <option value="normal">Normal</option>
          </SelectInput>
        ),
      },
      {
        label: "Multi-line",
        node: (
          <TextAreaInput
            label="Script"
            hint="Monospaced, because what goes in here is usually code."
            value={'var total = 0;\nfor (var line in order.lines) {\n  total += line.amount;\n}'}
            onChange={() => {}}
          />
        ),
      },
    ],
  },
  {
    name: "States",
    description:
      "The states every screen must handle before it counts as done (§14.1). Shared so a screen cannot quietly ship with only the happy path.",
    states: [
      { label: "Loading", note: "A skeleton matching the eventual layout, not a bare spinner.", node: <Skeleton rows={3} /> },
      {
        label: "Empty",
        note: "Says what to do next, rather than 'no data'.",
        node: <EmptyState title="No tasks assigned to you" description="You're all caught up. Tasks assigned to you will appear here." action={<Button>Start something new</Button>} />,
      },
      {
        label: "Zero results",
        note: "Distinct from empty: the filter matched nothing, and can be cleared.",
        node: <NoResultsState onClear={() => {}} />,
      },
      { label: "Permission denied", node: <PermissionDeniedState /> },
      {
        label: "Error",
        note: "Carries the correlation id, so a user's screenshot is enough to find the request.",
        node: <ErrorState error={new ApiError("The server returned an unexpected error (500).", 500, "corr-8f21", {})} onRetry={() => {}} />,
      },
    ],
  },
  {
    name: "DataTable",
    description: "Server-paged table. Paging is never done client-side (§8).",
    states: [
      {
        label: "Full",
        note:
          "Sortable headers wired to the server query, selection with a bulk bar, a per-row overflow menu, and the column/density controls — all of which the previous DataTable lacked (C1).",
        node: <TableDemo />,
      },
      {
        label: "Plain",
        note: "No preferenceKey, so no column chooser or density control — right for a small fixed table.",
        node: (
          <DataTable
            caption="Tasks"
            columns={[
              { key: "task", header: "Task", render: (row: Row) => row.task },
              { key: "assignee", header: "Assignee", secondary: true, render: (row: Row) => row.assignee },
            ]}
            rows={ROWS}
            rowKey={(row) => row.id}
          />
        ),
      },
      {
        label: "Virtualized",
        note:
          "120 rows; only the window plus an overscan is in the DOM. Kicks in above 60 rows — below that the spacer rows would cost more than they save.",
        node: (
          <div style={{ height: 260, display: "flex" }}>
            <DataTable
              caption="Many tasks"
              columns={[
                { key: "task", header: "Task", render: (row: Row) => row.task },
                { key: "assignee", header: "Assignee", render: (row: Row) => <UserChip userId={row.assignee} /> },
              ]}
              rows={MANY_ROWS}
              rowKey={(row) => row.id}
            />
          </div>
        ),
      },
      {
        label: "Empty",
        node: (
          <DataTable
            caption="Tasks"
            columns={[{ key: "task", header: "Task", render: (row: Row) => row.task }]}
            rows={[]}
            rowKey={(row) => row.id}
            empty={<EmptyState illustration="inbox-clear" title="Inbox zero" description="Nothing is waiting on you." />}
          />
        ),
      },
      {
        label: "Busy",
        note: "Refreshing an already-populated table: dimmed rather than replaced with a skeleton, so the rows do not jump.",
        node: (
          <DataTable
            caption="Tasks"
            busy
            columns={[{ key: "task", header: "Task", render: (row: Row) => row.task }]}
            rows={ROWS}
            rowKey={(row) => row.id}
          />
        ),
      },
      {
        label: "Selectable rows",
        note: "Rows are focusable and respond to Enter and Space when clickable.",
        node: (
          <DataTable
            caption="Tasks"
            columns={[{ key: "task", header: "Task", render: (row: Row) => row.task }]}
            rows={ROWS}
            rowKey={(row) => row.id}
            selectedKey="1"
            onRowClick={() => {}}
          />
        ),
      },
      {
        label: "Pagination — first page",
        note: "Page indicator, first/last jumps and a page-size control; previously this was Previous / Next alone (C2).",
        node: <Pagination start={0} size={25} total={640} onChange={() => {}} onSizeChange={() => {}} />,
      },
      { label: "Pagination — last page", node: <Pagination start={50} size={25} total={60} onChange={() => {}} onSizeChange={() => {}} /> },
      {
        label: "Pagination — single result",
        note: "A pagination edge §14.1 names explicitly.",
        node: <Pagination start={0} size={25} total={1} onChange={() => {}} />,
      },
    ],
  },
  {
    name: "ConfirmDialog",
    description:
      "Confirmation for consequential actions (§14.3). The message names what is about to happen — a bare 'Are you sure?' is explicitly not acceptable.",
    states: [
      { label: "Default", node: <DialogDemo /> },
      { label: "Destructive", node: <DialogDemo destructive /> },
    ],
  },
  {
    name: "Toast",
    description:
      "One feedback mechanism reused everywhere (§14.3). Errors stay until dismissed; everything else auto-hides.",
    states: [{ label: "All tones", node: <ToastDemo /> }],
  },
  {
    name: "SavedViews",
    description: "Saved filter sets (§14.4), shared by Work's inbox and Control's lists.",
    states: [{ label: "With a saved view", node: <SavedViewsDemo /> }],
  },
  {
    name: "ShortcutHelp",
    description:
      "Generated from the registered bindings themselves (§14.4), so it cannot describe a shortcut that no longer exists.",
    states: [{ label: "Default", node: <ShortcutHelpDemo /> }],
  },
  {
    name: "ErrorBoundary",
    description:
      "Crash recovery (§13.2). Without it a single render throw leaves a white page — the failure a user cannot report.",
    states: [{ label: "Before and after a crash", node: <BoundaryDemo /> }],
  },
  {
    name: "ShellMenu",
    description:
      "The shell's account menu (§7.5): who you are, where else you can go, appearance, language, sign out.",
    states: [
      {
        label: "Default",
        note: "Rendered inside the gallery's own providers; the app switcher lists only configured siblings.",
        node: (
          <ShellMenu
            userId="kermit"
            currentApp="work"
            apps={{ control: "https://control.example.com", design: "https://design.example.com" }}
            tenantId="acme"
            onSignOut={() => {}}
          />
        ),
      },
    ],
  },
];
