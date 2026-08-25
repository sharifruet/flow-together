import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { ToastProvider, type IdmUser, type UserProfileApi } from "@togetherflow/common";
import { UserProfile } from "./UserProfile";

const USER: IdmUser = { id: "ada", firstName: "Ada", lastName: "Lovelace" };

function stubApi(overrides: Record<string, unknown> = {}) {
  return {
    listInfo: vi.fn().mockResolvedValue([{ key: "phone", value: "+44 123" }]),
    setInfo: vi.fn().mockResolvedValue({}),
    deleteInfo: vi.fn().mockResolvedValue(undefined),
    pictureUrl: vi.fn().mockReturnValue("/identity/users/ada/picture"),
    uploadPicture: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as UserProfileApi & Record<string, Mock>;
}

function renderProfile(api: UserProfileApi, readOnly = false) {
  const onClose = vi.fn();
  render(
    <ToastProvider>
      <UserProfile profileApi={api} user={USER} readOnly={readOnly} onClose={onClose} />
    </ToastProvider>,
  );
  return { onClose };
}

describe("UserProfile", () => {
  it("shows the user's custom info with values, not just keys", async () => {
    renderProfile(stubApi());
    expect(await screen.findByText("phone")).toBeInTheDocument();
    expect(screen.getByText("+44 123")).toBeInTheDocument();
  });

  it("guides when there is no custom info", async () => {
    renderProfile(stubApi({ listInfo: vi.fn().mockResolvedValue([]) }));
    expect(await screen.findByText(/No custom info recorded/i)).toBeInTheDocument();
  });

  it("adds an info entry", async () => {
    const user = userEvent.setup();
    const api = stubApi();
    renderProfile(api);
    await screen.findByText("phone");

    await user.type(screen.getByLabelText("Key"), "desk");
    await user.type(screen.getByLabelText("Value"), "4A");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.setInfo).toHaveBeenCalledWith("ada", "desk", "4A"));
  });

  it("will not add an entry with no key", async () => {
    renderProfile(stubApi());
    await screen.findByText("phone");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("confirms before removing an entry", async () => {
    const user = userEvent.setup();
    const api = stubApi();
    renderProfile(api);
    await screen.findByText("phone");

    await user.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("phone");
    expect(api.deleteInfo).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(api.deleteInfo).toHaveBeenCalledWith("ada", "phone"));
  });

  it("uploads a picture", async () => {
    const user = userEvent.setup();
    const api = stubApi();
    renderProfile(api);
    await screen.findByText("phone");

    const file = new File(["x"], "me.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/Upload a picture/), file);

    await waitFor(() => expect(api.uploadPicture).toHaveBeenCalledWith("ada", file));
  });

  /**
   * A user with no picture is the normal case and the endpoint 404s for them, so the
   * image's own error path must produce a placeholder rather than a broken image icon.
   */
  it("falls back to initials when there is no picture", async () => {
    renderProfile(stubApi());
    const image = await screen.findByAltText(/Profile picture for ada/);

    image.dispatchEvent(new Event("error"));

    expect(await screen.findByText("No picture uploaded.")).toBeInTheDocument();
    expect(screen.getByText("AD")).toBeInTheDocument();
  });

  it("reports a failed save", async () => {
    const user = userEvent.setup();
    renderProfile(stubApi({ setInfo: vi.fn().mockRejectedValue(new Error("no")) }));
    await screen.findByText("phone");

    await user.type(screen.getByLabelText("Key"), "k");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("That didn't work.")).toBeInTheDocument();
  });

  /** A directory-backed deployment can be read, but nothing may be written to it. */
  it("hides every editing control when identity is read-only", async () => {
    renderProfile(stubApi(), true);
    await screen.findByText("phone");

    expect(screen.queryByLabelText(/Upload a picture/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });
});
