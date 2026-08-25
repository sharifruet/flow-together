import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { ApiError, ToastProvider, type IdmApi, type IdmUser } from "@togetherflow/common";
import { Users } from "./Users";

function page(rows: IdmUser[], total = rows.length) {
  return { data: rows, total, start: 0, size: 25 };
}

type StubIdm = IdmApi & {
  listUsers: Mock;
  createUser: Mock;
  updateUser: Mock;
  deleteUser: Mock;
};

function stubIdm(overrides: Record<string, unknown> = {}): StubIdm {
  return {
    listUsers: vi.fn().mockResolvedValue(page([])),
    createUser: vi.fn().mockResolvedValue({ id: "new" }),
    updateUser: vi.fn().mockResolvedValue({ id: "u1" }),
    deleteUser: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as StubIdm;
}

function renderUsers(idm: IdmApi, readOnly = false) {
  return render(
    <ToastProvider>
      <Users idm={idm} readOnly={readOnly} />
    </ToastProvider>,
  );
}

const ALICE: IdmUser = { id: "alice", firstName: "Alice", lastName: "Adams", email: "a@x.com" };

describe("Users", () => {
  it("lists users with their display name and id", async () => {
    renderUsers(stubIdm({ listUsers: vi.fn().mockResolvedValue(page([ALICE])) }));

    expect(await screen.findByText("Alice Adams")).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("a@x.com")).toBeInTheDocument();
  });

  it("shows a guiding empty state", async () => {
    renderUsers(stubIdm());
    expect(await screen.findByText(/no users yet/i)).toBeInTheDocument();
  });

  it("creates a user, sending the password only on create", async () => {
    const idm = stubIdm();
    renderUsers(idm);
    await screen.findByText(/no users yet/i);

    await userEvent.click(screen.getAllByRole("button", { name: /new user/i })[0]);
    const dialog = await screen.findByRole("dialog", { name: /new user/i });
    await userEvent.type(within(dialog).getByLabelText(/user id/i), "bob");
    await userEvent.type(within(dialog).getByLabelText(/^password/i), "s3cret");
    await userEvent.click(within(dialog).getByRole("button", { name: /create user/i }));

    await waitFor(() => expect(idm.createUser).toHaveBeenCalled());
    expect(idm.createUser.mock.calls[0][0]).toMatchObject({ id: "bob", password: "s3cret" });
  });

  it("requires an id and an initial password before creating", async () => {
    const idm = stubIdm();
    renderUsers(idm);
    await screen.findByText(/no users yet/i);

    await userEvent.click(screen.getAllByRole("button", { name: /new user/i })[0]);
    const dialog = await screen.findByRole("dialog", { name: /new user/i });
    await userEvent.click(within(dialog).getByRole("button", { name: /create user/i }));

    expect(await within(dialog).findByText(/user id is required/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/set an initial password/i)).toBeInTheDocument();
    expect(idm.createUser).not.toHaveBeenCalled();
  });

  it("rejects a malformed email", async () => {
    const idm = stubIdm();
    renderUsers(idm);
    await screen.findByText(/no users yet/i);

    await userEvent.click(screen.getAllByRole("button", { name: /new user/i })[0]);
    const dialog = await screen.findByRole("dialog", { name: /new user/i });
    await userEvent.type(within(dialog).getByLabelText(/user id/i), "bob");
    await userEvent.type(within(dialog).getByLabelText(/^password/i), "x");
    await userEvent.type(within(dialog).getByLabelText(/email/i), "not-an-email");
    await userEvent.click(within(dialog).getByRole("button", { name: /create user/i }));

    expect(await within(dialog).findByText(/valid email/i)).toBeInTheDocument();
    expect(idm.createUser).not.toHaveBeenCalled();
  });

  it("omits an untouched password on edit so the engine does not reset it", async () => {
    const idm = stubIdm({ listUsers: vi.fn().mockResolvedValue(page([ALICE])) });
    renderUsers(idm);
    await screen.findByText("Alice Adams");

    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    const dialog = await screen.findByRole("dialog", { name: /edit alice/i });
    await userEvent.clear(within(dialog).getByLabelText(/first name/i));
    await userEvent.type(within(dialog).getByLabelText(/first name/i), "Alicia");
    await userEvent.click(within(dialog).getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(idm.updateUser).toHaveBeenCalled());
    const [userId, changes] = idm.updateUser.mock.calls[0];
    expect(userId).toBe("alice");
    expect(changes.firstName).toBe("Alicia");
    expect("password" in changes).toBe(false);
  });

  it("confirms before deleting, naming the user and the consequence", async () => {
    const idm = stubIdm({ listUsers: vi.fn().mockResolvedValue(page([ALICE])) });
    renderUsers(idm);
    await screen.findByText("Alice Adams");

    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/Alice Adams/);
    expect(dialog).toHaveTextContent(/can't be undone/i);
    expect(idm.deleteUser).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: /delete user/i }));
    await waitFor(() => expect(idm.deleteUser).toHaveBeenCalledWith("alice"));
  });

  it("surfaces a failed action as an error toast with its reference", async () => {
    const idm = stubIdm({
      listUsers: vi.fn().mockResolvedValue(page([ALICE])),
      deleteUser: vi.fn().mockRejectedValue(new ApiError("User in use", 409, "corr-u", {})),
    });
    renderUsers(idm);
    await screen.findByText("Alice Adams");

    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: /delete user/i }),
    );

    expect(await screen.findByText("User in use")).toBeInTheDocument();
    expect(screen.getByText("corr-u")).toBeInTheDocument();
  });

  it("hides every mutating control when identities are read-only", async () => {
    renderUsers(stubIdm({ listUsers: vi.fn().mockResolvedValue(page([ALICE])) }), true);
    await screen.findByText("Alice Adams");

    expect(screen.queryByRole("button", { name: /new user/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.getByText(/can't be changed here/i)).toBeInTheDocument();
  });

  it("searches by id server-side after debouncing", async () => {
    const idm = stubIdm({ listUsers: vi.fn().mockResolvedValue(page([ALICE])) });
    renderUsers(idm);
    await screen.findByText("Alice Adams");

    await userEvent.type(screen.getByRole("searchbox"), "bob");

    await waitFor(() => expect(idm.listUsers.mock.calls.at(-1)?.[0]).toMatchObject({ id: "bob" }));
  });

  it("pages server-side", async () => {
    const idm = stubIdm({ listUsers: vi.fn().mockResolvedValue(page([ALICE], 60)) });
    renderUsers(idm);
    await screen.findByText("Alice Adams");

    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(idm.listUsers.mock.calls.at(-1)?.[0]).toMatchObject({ start: 25 }));
  });
});
