/**
 * Accessibility regression checks for Identity's screens (REQUIREMENTS.md §13.6).
 *
 * The user dialog matters most here: §14.3 requires inline validation, and a validation
 * message that is not associated with its control is invisible to a screen reader — the
 * user hears nothing and cannot tell why the form will not submit.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, vi } from "vitest";
import { expectNoA11yViolations } from "@togetherflow/common/testing/a11y";
import {
  ToastProvider,
  type DataResponse,
  type IdmApi,
  type UserProfileApi,
} from "@togetherflow/common";
import { Users } from "./users/Users";
import { Groups } from "./groups/Groups";

function page<T>(rows: T[]): DataResponse<T> {
  return { data: rows, total: rows.length, start: 0, size: 25 };
}

const IDM = {
  listUsers: vi.fn().mockResolvedValue(page([{ id: "kermit", firstName: "Kermit", email: "k@example.com" }])),
  listGroups: vi.fn().mockResolvedValue(page([{ id: "sales", name: "Sales", type: "assignment" }])),
} as unknown as IdmApi;

const PROFILE = {} as unknown as UserProfileApi;

describe("Identity screens meet WCAG 2.1 AA", () => {
  it("the user list", async () => {
    const { container } = render(
      <ToastProvider>
        <Users idm={IDM} profileApi={PROFILE} readOnly={false} />
      </ToastProvider>,
    );
    await screen.findByText("kermit");
    await expectNoA11yViolations(container);
  });

  it("the new-user dialog, with its validation errors showing", async () => {
    const { container } = render(
      <ToastProvider>
        <Users idm={IDM} profileApi={PROFILE} readOnly={false} />
      </ToastProvider>,
    );
    await screen.findByText("kermit");
    await userEvent.click(screen.getByRole("button", { name: /new user/i }));
    // Submitting empty is what surfaces the per-field errors.
    await userEvent.click(screen.getByRole("button", { name: /create user/i }));
    await screen.findByText(/a user id is required/i);
    await expectNoA11yViolations(container);
  });

  it("the group list", async () => {
    const { container } = render(
      <ToastProvider>
        <Groups idm={IDM} readOnly={false} />
      </ToastProvider>,
    );
    await screen.findByText("Sales");
    await expectNoA11yViolations(container);
  });
});
