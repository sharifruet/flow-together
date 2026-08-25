import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { ToastProvider, type IdmApi, type IdmPrivilege } from "@togetherflow/common";
import { Privileges } from "./Privileges";

type StubIdm = IdmApi & {
  listPrivileges: Mock;
  getPrivilege: Mock;
  grantPrivilegeToUser: Mock;
  revokePrivilegeFromUser: Mock;
  grantPrivilegeToGroup: Mock;
  revokePrivilegeFromGroup: Mock;
};

const ACCESS_ADMIN: IdmPrivilege = {
  id: "p1",
  name: "access-admin",
  users: [{ id: "alice", firstName: "Alice", lastName: "Adams" }],
  groups: [{ id: "sales", name: "Sales" }],
};

function stubIdm(overrides: Record<string, unknown> = {}): StubIdm {
  return {
    listPrivileges: vi
      .fn()
      .mockResolvedValue({ data: [{ id: "p1", name: "access-admin" }], total: 1, start: 0, size: 100 }),
    getPrivilege: vi.fn().mockResolvedValue(ACCESS_ADMIN),
    grantPrivilegeToUser: vi.fn().mockResolvedValue(undefined),
    revokePrivilegeFromUser: vi.fn().mockResolvedValue(undefined),
    grantPrivilegeToGroup: vi.fn().mockResolvedValue(undefined),
    revokePrivilegeFromGroup: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as StubIdm;
}

function renderPrivileges(idm: IdmApi, readOnly = false) {
  return render(
    <ToastProvider>
      <Privileges idm={idm} readOnly={readOnly} />
    </ToastProvider>,
  );
}

async function openDetail() {
  await userEvent.click(await screen.findByRole("button", { name: /access-admin/i }));
  await screen.findByText("Alice Adams");
}

describe("Privileges", () => {
  it("lists the privileges the deployment defines", async () => {
    renderPrivileges(stubIdm());
    expect(await screen.findByText("access-admin")).toBeInTheDocument();
  });

  it("explains an empty state rather than showing a blank page", async () => {
    renderPrivileges(
      stubIdm({ listPrivileges: vi.fn().mockResolvedValue({ data: [], total: 0, start: 0, size: 100 }) }),
    );
    expect(await screen.findByText(/no privileges defined/i)).toBeInTheDocument();
  });

  it("shows who holds a privilege", async () => {
    renderPrivileges(stubIdm());
    await openDetail();

    expect(screen.getByText("Alice Adams")).toBeInTheDocument();
    expect(screen.getByText("Sales")).toBeInTheDocument();
  });

  it("grants to a user and to a group", async () => {
    const idm = stubIdm();
    renderPrivileges(idm);
    await openDetail();

    await userEvent.type(screen.getByLabelText(/grant to user/i), "bob");
    await userEvent.click(within(screen.getByLabelText(/grant to user/i).closest("form")!).getByRole("button", { name: /grant/i }));
    await waitFor(() => expect(idm.grantPrivilegeToUser).toHaveBeenCalledWith("p1", "bob"));

    await userEvent.type(screen.getByLabelText(/grant to group/i), "ops");
    await userEvent.click(within(screen.getByLabelText(/grant to group/i).closest("form")!).getByRole("button", { name: /grant/i }));
    await waitFor(() => expect(idm.grantPrivilegeToGroup).toHaveBeenCalledWith("p1", "ops"));
  });

  it("confirms before revoking from a user", async () => {
    const idm = stubIdm();
    renderPrivileges(idm);
    await openDetail();

    await userEvent.click(screen.getByRole("button", { name: /revoke from alice/i }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/Alice Adams/);
    expect(idm.revokePrivilegeFromUser).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: /^revoke$/i }));
    await waitFor(() => expect(idm.revokePrivilegeFromUser).toHaveBeenCalledWith("p1", "alice"));
  });

  it("revokes from a group through the group-specific endpoint", async () => {
    const idm = stubIdm();
    renderPrivileges(idm);
    await openDetail();

    await userEvent.click(screen.getByRole("button", { name: /revoke from sales/i }));
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: /^revoke$/i }),
    );

    await waitFor(() => expect(idm.revokePrivilegeFromGroup).toHaveBeenCalledWith("p1", "sales"));
    expect(idm.revokePrivilegeFromUser).not.toHaveBeenCalled();
  });

  it("hides grant and revoke controls when read-only", async () => {
    renderPrivileges(stubIdm(), true);
    await openDetail();

    expect(screen.queryByLabelText(/grant to user/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /revoke from/i })).not.toBeInTheDocument();
  });
});
