import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShellMenu } from "./ShellMenu";
import { ToastProvider } from "./Toast";

function renderMenu(props: Partial<React.ComponentProps<typeof ShellMenu>> = {}) {
  const onSignOut = vi.fn();
  render(
    <ToastProvider>
      <ShellMenu userId="alice" currentApp="work" onSignOut={onSignOut} {...props} />
    </ToastProvider>,
  );
  return { onSignOut };
}

const openMenu = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /Account menu/ }));

afterEach(() => {
  document.documentElement.removeAttribute("data-tf-theme");
  localStorage.clear();
});

describe("ShellMenu — app switcher", () => {
  /**
   * The apps are separately deployed origins, so there is nothing to guess. Listing
   * them as permanently disabled "coming soon" was untrue once they all existed.
   */
  it("offers no switcher at all when no sibling URLs are configured", async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    expect(screen.queryByText("Other apps")).not.toBeInTheDocument();
    expect(screen.queryByText(/Coming soon/i)).not.toBeInTheDocument();
  });

  it("links to the apps the deployment configures", async () => {
    const user = userEvent.setup();
    renderMenu({ apps: { control: "https://control.example", design: "https://design.example" } });
    await openMenu(user);

    expect(screen.getByRole("menuitem", { name: "TogetherFlow Control" })).toHaveAttribute(
      "href",
      "https://control.example",
    );
    expect(screen.getByRole("menuitem", { name: "TogetherFlow Design" })).toBeInTheDocument();
  });

  it("never offers the app you are already in", async () => {
    const user = userEvent.setup();
    renderMenu({
      currentApp: "control",
      apps: { work: "https://work.example", control: "https://control.example" },
    });
    await openMenu(user);

    expect(screen.getByRole("menuitem", { name: "TogetherFlow Work" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "TogetherFlow Control" })).not.toBeInTheDocument();
  });

  it("skips an app whose URL is configured empty", async () => {
    const user = userEvent.setup();
    // The container entrypoint emits "" for an unset variable.
    renderMenu({ apps: { control: "", design: "https://design.example" } });
    await openMenu(user);

    expect(screen.queryByRole("menuitem", { name: "TogetherFlow Control" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "TogetherFlow Design" })).toBeInTheDocument();
  });
});

describe("ShellMenu — appearance", () => {
  it("defaults to matching the system, with no attribute forced", async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    expect(screen.getByRole("radio", { name: "Match system" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(document.documentElement.hasAttribute("data-tf-theme")).toBe(false);
  });

  it("forces dark, which the token stylesheet reads from the root element", async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    await user.click(screen.getByRole("radio", { name: "Dark" }));

    await waitFor(() =>
      expect(document.documentElement.getAttribute("data-tf-theme")).toBe("dark"),
    );
  });

  it("forces light, so a dark-mode OS can be overridden too", async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    await user.click(screen.getByRole("radio", { name: "Light" }));

    await waitFor(() =>
      expect(document.documentElement.getAttribute("data-tf-theme")).toBe("light"),
    );
  });

  it("remembers the choice", async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    await user.click(screen.getByRole("radio", { name: "Dark" }));

    await waitFor(() => expect(localStorage.getItem("togetherflow.theme")).toBe("dark"));
  });

  it("going back to system clears the override rather than storing a colour", async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    await user.click(screen.getByRole("radio", { name: "Dark" }));
    await user.click(screen.getByRole("radio", { name: "Match system" }));

    await waitFor(() => expect(document.documentElement.hasAttribute("data-tf-theme")).toBe(false));
    expect(localStorage.getItem("togetherflow.theme")).toBe("system");
  });
});

describe("ShellMenu — password", () => {
  it("offers no password control where the deployment cannot change one", async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    expect(screen.queryByRole("menuitem", { name: "Change password" })).not.toBeInTheDocument();
  });

  it("changes the password once both fields agree", async () => {
    const user = userEvent.setup();
    const onChangePassword = vi.fn().mockResolvedValue(undefined);
    renderMenu({ onChangePassword });
    await openMenu(user);

    await user.click(screen.getByRole("menuitem", { name: "Change password" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("New password"), "supersecret");
    await user.type(within(dialog).getByLabelText("Confirm new password"), "supersecret");
    await user.click(within(dialog).getByRole("button", { name: "Change password" }));

    await waitFor(() => expect(onChangePassword).toHaveBeenCalledWith("supersecret"));
  });

  it("refuses a mismatch, and says so", async () => {
    const user = userEvent.setup();
    const onChangePassword = vi.fn();
    renderMenu({ onChangePassword });
    await openMenu(user);

    await user.click(screen.getByRole("menuitem", { name: "Change password" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("New password"), "supersecret");
    await user.type(within(dialog).getByLabelText("Confirm new password"), "different");

    expect(within(dialog).getByText("The two passwords don't match.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Change password" })).toBeDisabled();
    expect(onChangePassword).not.toHaveBeenCalled();
  });

  it("refuses a password that is too short", async () => {
    const user = userEvent.setup();
    renderMenu({ onChangePassword: vi.fn() });
    await openMenu(user);

    await user.click(screen.getByRole("menuitem", { name: "Change password" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("New password"), "short");

    expect(within(dialog).getByText(/at least 8 characters/i)).toBeInTheDocument();
  });

  it("reports a rejected change instead of closing as if it worked", async () => {
    const user = userEvent.setup();
    renderMenu({ onChangePassword: vi.fn().mockRejectedValue(new Error("no")) });
    await openMenu(user);

    await user.click(screen.getByRole("menuitem", { name: "Change password" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("New password"), "supersecret");
    await user.type(within(dialog).getByLabelText("Confirm new password"), "supersecret");
    await user.click(within(dialog).getByRole("button", { name: "Change password" }));

    expect(await screen.findByText("Could not change your password.")).toBeInTheDocument();
  });
});

describe("ShellMenu — basics", () => {
  it("names who is signed in, and the tenant when there is one", async () => {
    const user = userEvent.setup();
    renderMenu({ tenantId: "acme" });
    await openMenu(user);

    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("Tenant: acme")).toBeInTheDocument();
  });

  it("signs out", async () => {
    const user = userEvent.setup();
    const { onSignOut } = renderMenu();
    await openMenu(user);

    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
