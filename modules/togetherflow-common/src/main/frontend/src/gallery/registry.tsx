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
import { Brand } from "../components/Brand";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable, Pagination } from "../components/DataTable";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { SelectInput, TextInput } from "../components/Field";
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

export const GALLERY: GalleryEntry[] = [
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
        label: "Populated",
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
      { label: "First page", node: <Pagination start={0} size={25} total={60} onChange={() => {}} /> },
      { label: "Last page", node: <Pagination start={50} size={25} total={60} onChange={() => {}} /> },
      {
        label: "Single result",
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
