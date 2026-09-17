import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { FormField } from "../api/types";
import { FormRenderer, type IdentityLookup } from "./FormRenderer";

/** A controlled parent, so typing actually changes what the field shows. */
function Harness({ field, lookup, initial = "", onChange }: { field: FormField; lookup?: IdentityLookup; initial?: string; onChange?: (id: string, value: unknown) => void }) {
  const [value, setValue] = useState<unknown>(initial);
  return (
    <FormRenderer
      id="tf-id"
      model={{ id: "f", fields: [field] }}
      values={{ [field.id]: value }}
      onChange={(id, next) => {
        setValue(next);
        onChange?.(id, next);
      }}
      identityLookup={lookup}
    />
  );
}

const PEOPLE: FormField = { id: "approver", name: "Approver", type: "people" };
const GROUP: FormField = { id: "team", name: "Team", type: "functional-group" };

function renderWith(field: FormField, lookup?: IdentityLookup, value = "") {
  const onChange = vi.fn();
  const view = render(<Harness field={field} lookup={lookup} initial={value} onChange={onChange} />);
  return { ...view, onChange };
}

describe("people and functional-group fields (FR-W.5)", () => {
  it("is a plain id input when no identity store is configured", () => {
    renderWith(PEOPLE);
    const input = screen.getByLabelText("Approver");
    expect(input).toHaveAttribute("placeholder", "User id");
    expect(input).not.toHaveAttribute("list");
  });

  it("offers matches from the store and shows the chosen one's name", async () => {
    const lookup: IdentityLookup = {
      users: vi.fn().mockResolvedValue([{ id: "imran.kabir", label: "Imran Kabir" }]),
      groups: vi.fn().mockResolvedValue([]),
    };
    const { onChange } = renderWith(PEOPLE, lookup);
    const input = screen.getByLabelText("Approver");
    expect(input).toHaveAttribute("list", "tf-id-approver-choices");

    await userEvent.type(input, "im");
    await waitFor(() => expect(lookup.users).toHaveBeenCalledWith("im", expect.anything()));
    expect(onChange).toHaveBeenLastCalledWith("approver", "im");
    await waitFor(() => expect(screen.getByRole("option", { hidden: true })).toHaveValue("imran.kabir"));

    // Picking the suggestion stores the id; the status line names the person.
    await userEvent.clear(input);
    await userEvent.type(input, "imran.kabir");
    await waitFor(() => expect(screen.getByText("Imran Kabir")).toBeInTheDocument());
  });

  it("says when nothing matched, and still sends what was typed", async () => {
    const lookup: IdentityLookup = {
      users: vi.fn().mockResolvedValue([]),
      groups: vi.fn().mockResolvedValue([]),
    };
    renderWith(GROUP, lookup, "nobody");
    await waitFor(() => expect(lookup.groups).toHaveBeenCalledWith("nobody", expect.anything()));
    await waitFor(() => expect(screen.getByText(/no match for "nobody"/i)).toBeInTheDocument());
  });
});
