/**
 * Accessibility regression checks for the shared design system (§13.6, §14.2).
 *
 * These live in `togetherflow-common` on purpose: every app renders these components, so
 * a violation fixed here is fixed everywhere, and one introduced here would otherwise
 * appear in four apps at once.
 */

import { render } from "@testing-library/react";
import { describe, it } from "vitest";
import { expectNoA11yViolations } from "../testing/a11y";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { DataTable, Pagination } from "./DataTable";
import { TextInput } from "./Field";
import { EmptyState, ErrorState, NoResultsState, PermissionDeniedState, Skeleton } from "./States";
import { ApiError } from "../api/client";

interface Row {
  id: string;
  name: string;
}

const ROWS: Row[] = [
  { id: "1", name: "Approve invoice" },
  { id: "2", name: "Review contract" },
];

describe("design system accessibility", () => {
  it("buttons, including their loading and disabled states", async () => {
    const { container } = render(
      <>
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="danger">Danger</Button>
        <Button loading>Loading</Button>
        <Button disabled>Disabled</Button>
      </>,
    );
    await expectNoA11yViolations(container);
  });

  it("text inputs, with hint and error text associated to the control", async () => {
    const { container } = render(
      <>
        <TextInput label="Username" value="" onChange={() => {}} />
        <TextInput label="Password" type="password" value="" hint="At least 8 characters" onChange={() => {}} />
        <TextInput label="Email" value="nope" error="Enter a valid email address." onChange={() => {}} />
      </>,
    );
    await expectNoA11yViolations(container);
  });

  it("the screen states every view must handle (§14.1)", async () => {
    const { container } = render(
      <>
        <Skeleton rows={3} />
        <EmptyState title="No tasks" description="Nothing to do." />
        <NoResultsState onClear={() => {}} />
        <PermissionDeniedState />
        <ErrorState error={new ApiError("boom", 500, "corr-1", {})} onRetry={() => {}} />
      </>,
    );
    await expectNoA11yViolations(container);
  });

  it("a data table with its caption and paging controls", async () => {
    const { container } = render(
      <>
        <DataTable
          caption="Tasks"
          columns={[{ key: "name", header: "Task", render: (row: Row) => row.name }]}
          rows={ROWS}
          rowKey={(row) => row.id}
        />
        <Pagination start={0} size={25} total={60} onChange={() => {}} />
      </>,
    );
    await expectNoA11yViolations(container);
  });

  it("a confirmation dialog, which must be reachable and described", async () => {
    const { container } = render(
      <ConfirmDialog
        open
        title="Delete this deployment?"
        description="Every running instance will be deleted too."
        destructive
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    await expectNoA11yViolations(container);
  });
});
