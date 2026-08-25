import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { ToastProvider, type IdmApi, type IdmGroup, type IdmUser } from "@togetherflow/common";
import { Groups } from "./Groups";

function page<T>(rows: T[], total = rows.length) {
  return { data: rows, total, start: 0, size: 25 };
}

type StubIdm = IdmApi & {
  listGroups: Mock;
  createGroup: Mock;
  updateGroup: Mock;
  deleteGroup: Mock;
  listGroupMembers: Mock;
  addGroupMember: Mock;
  removeGroupMember: Mock;
};

const SALES: IdmGroup = { id: "sales", name: "Sales", type: "assignment" };
const BOB: IdmUser = { id: "bob", firstName: "Bob", lastName: "Brown" };

function stubIdm(overrides: Record<string, unknown> = {}): StubIdm {
  return {
    listGroups: vi.fn().mockResolvedValue(page([SALES])),
    createGroup: vi.fn().mockResolvedValue(SALES),
    updateGroup: vi.fn().mockResolvedValue(SALES),
    deleteGroup: vi.fn().mockResolvedValue(undefined),
    listGroupMembers: vi.fn().mockResolvedValue(page([BOB])),
    addGroupMember: vi.fn().mockResolvedValue(undefined),
    removeGroupMember: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as StubIdm;
}

function renderGroups(idm: IdmApi, readOnly = false) {
  return render(
    <ToastProvider>
      <Groups idm={idm} readOnly={readOnly} />
    </ToastProvider>,
  );
}

describe("Groups", () => {
  it("lists groups", async () => {
    renderGroups(stubIdm());
    expect(await screen.findByText("Sales")).toBeInTheDocument();
    expect(screen.getByText("assignment")).toBeInTheDocument();
  });

  it("creates a group", async () => {
    const idm = stubIdm({ listGroups: vi.fn().mockResolvedValue(page([])) });
    renderGroups(idm);
    await screen.findByText(/no groups yet/i);

    await userEvent.click(screen.getAllByRole("button", { name: /new group/i })[0]);
    const dialog = await screen.findByRole("dialog", { name: /new group/i });
    await userEvent.type(within(dialog).getByLabelText(/group id/i), "ops");
    await userEvent.type(within(dialog).getByLabelText(/^name/i), "Operations");
    await userEvent.click(within(dialog).getByRole("button", { name: /create group/i }));

    await waitFor(() => expect(idm.createGroup).toHaveBeenCalled());
    expect(idm.createGroup.mock.calls[0][0]).toMatchObject({ id: "ops", name: "Operations" });
  });

  it("requires a group id", async () => {
    const idm = stubIdm({ listGroups: vi.fn().mockResolvedValue(page([])) });
    renderGroups(idm);
    await screen.findByText(/no groups yet/i);

    await userEvent.click(screen.getAllByRole("button", { name: /new group/i })[0]);
    const dialog = await screen.findByRole("dialog", { name: /new group/i });
    await userEvent.click(within(dialog).getByRole("button", { name: /create group/i }));

    expect(await within(dialog).findByText(/group id is required/i)).toBeInTheDocument();
    expect(idm.createGroup).not.toHaveBeenCalled();
  });

  it("sends the id alongside changes on update, which the engine requires", async () => {
    const idm = stubIdm();
    renderGroups(idm);
    await screen.findByText("Sales");

    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    const dialog = await screen.findByRole("dialog", { name: /edit sales/i });
    await userEvent.clear(within(dialog).getByLabelText(/^name/i));
    await userEvent.type(within(dialog).getByLabelText(/^name/i), "Sales EMEA");
    await userEvent.click(within(dialog).getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(idm.updateGroup).toHaveBeenCalled());
    expect(idm.updateGroup).toHaveBeenCalledWith("sales", {
      name: "Sales EMEA",
      type: "assignment",
    });
  });

  it("confirms before deleting and names the consequence", async () => {
    const idm = stubIdm();
    renderGroups(idm);
    await screen.findByText("Sales");

    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/Sales/);
    expect(dialog).toHaveTextContent(/loses that access/i);

    await userEvent.click(within(dialog).getByRole("button", { name: /delete group/i }));
    await waitFor(() => expect(idm.deleteGroup).toHaveBeenCalledWith("sales"));
  });

  it("opens members, listing them via the user query", async () => {
    const idm = stubIdm();
    renderGroups(idm);
    await screen.findByText("Sales");

    await userEvent.click(screen.getByRole("button", { name: /members/i }));

    expect(await screen.findByText("Bob Brown")).toBeInTheDocument();
    expect(idm.listGroupMembers).toHaveBeenCalledWith("sales", { size: 100 }, expect.anything());
  });

  it("adds and removes a member", async () => {
    const idm = stubIdm();
    renderGroups(idm);
    await screen.findByText("Sales");
    await userEvent.click(screen.getByRole("button", { name: /members/i }));
    await screen.findByText("Bob Brown");

    await userEvent.type(screen.getByLabelText(/add a member/i), "carol");
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() => expect(idm.addGroupMember).toHaveBeenCalledWith("sales", "carol"));

    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /remove member/i }));
    await waitFor(() => expect(idm.removeGroupMember).toHaveBeenCalledWith("sales", "bob"));
  });

  it("still allows viewing members when read-only, but not changing them", async () => {
    renderGroups(stubIdm(), true);
    await screen.findByText("Sales");

    expect(screen.queryByRole("button", { name: /new group/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /members/i }));
    await screen.findByText("Bob Brown");
    expect(screen.queryByLabelText(/add a member/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });
});
