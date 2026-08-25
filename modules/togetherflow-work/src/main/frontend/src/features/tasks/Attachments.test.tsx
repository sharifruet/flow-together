import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider, type AttachmentResponse, type TaskApi } from "@togetherflow/common";
import type { Mock } from "vitest";
import { Attachments, formatBytes, isSafeHttpUrl } from "./Attachments";

type StubTaskApi = TaskApi & {
  uploadAttachment: Mock;
  addAttachmentLink: Mock;
  deleteAttachment: Mock;
};

function stubApi(overrides: Partial<Record<string, unknown>> = {}): StubTaskApi {
  return {
    uploadAttachment: vi.fn().mockResolvedValue({ id: "a1", name: "f" }),
    addAttachmentLink: vi.fn().mockResolvedValue({ id: "a2", name: "l" }),
    deleteAttachment: vi.fn().mockResolvedValue(undefined),
    attachmentContentUrl: (taskId: string, id: string) =>
      `/process-api/runtime/tasks/${taskId}/attachments/${id}/content`,
    ...overrides,
  } as unknown as StubTaskApi;
}

function renderAttachments(
  api: TaskApi,
  attachments: AttachmentResponse[] = [],
  onChanged = vi.fn(),
) {
  return render(
    <ToastProvider>
      <Attachments taskApi={api} taskId="task-1" attachments={attachments} onChanged={onChanged} />
    </ToastProvider>,
  );
}

describe("isSafeHttpUrl", () => {
  it("accepts http and https only", () => {
    expect(isSafeHttpUrl("https://example.com/doc.pdf")).toBe(true);
    expect(isSafeHttpUrl("http://example.com")).toBe(true);
  });

  it("rejects script-bearing and malformed URLs", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,<script>")).toBe(false);
    expect(isSafeHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeHttpUrl("not a url")).toBe(false);
    expect(isSafeHttpUrl("")).toBe(false);
  });
});

describe("formatBytes", () => {
  it("scales units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MB");
  });
});

describe("Attachments", () => {
  it("shows an empty state when there are none", () => {
    renderAttachments(stubApi());
    expect(screen.getByText(/no attachments/i)).toBeInTheDocument();
  });

  it("links engine-stored content to the content endpoint", () => {
    renderAttachments(stubApi(), [
      { id: "a1", name: "contract.pdf", contentUrl: "x", time: "2026-08-20T10:00:00Z" },
    ]);
    expect(screen.getByRole("link", { name: "contract.pdf" })).toHaveAttribute(
      "href",
      "/process-api/runtime/tasks/task-1/attachments/a1/content",
    );
  });

  it("links an external attachment straight to its URL, safely", () => {
    renderAttachments(stubApi(), [
      { id: "a2", name: "Spec on SharePoint", externalUrl: "https://contoso.sharepoint.com/x" },
    ]);
    const link = screen.getByRole("link", { name: "Spec on SharePoint" });
    expect(link).toHaveAttribute("href", "https://contoso.sharepoint.com/x");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("uploads a picked file", async () => {
    const api = stubApi();
    const onChanged = vi.fn();
    const { container } = renderAttachments(api, [], onChanged);

    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    const input = container.querySelector<HTMLInputElement>("#tf-attachment-file")!;
    await userEvent.upload(input, file);

    await waitFor(() => expect(api.uploadAttachment).toHaveBeenCalledWith("task-1", file));
    expect(onChanged).toHaveBeenCalled();
  });

  it("refuses a file over the size limit without calling the API", async () => {
    const api = stubApi();
    const { container } = renderAttachments(api);

    const big = new File(["x"], "huge.bin", { type: "application/octet-stream" });
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    const input = container.querySelector<HTMLInputElement>("#tf-attachment-file")!;
    await userEvent.upload(input, big);

    expect(await screen.findByText(/larger than the 10 MB upload limit/i)).toBeInTheDocument();
    expect(api.uploadAttachment).not.toHaveBeenCalled();
  });

  it("validates a link URL before submitting", async () => {
    const api = stubApi();
    renderAttachments(api);

    await userEvent.click(screen.getByRole("button", { name: /add link/i }));
    await userEvent.type(screen.getByLabelText(/link name/i), "Malicious");
    await userEvent.type(screen.getByLabelText(/^url/i), "javascript:alert(1)");
    await userEvent.click(screen.getByRole("button", { name: /^add link$/i }));

    expect(await screen.findByText(/valid http\(s\) url/i)).toBeInTheDocument();
    expect(api.addAttachmentLink).not.toHaveBeenCalled();
  });

  it("adds a valid link", async () => {
    const api = stubApi();
    renderAttachments(api);

    await userEvent.click(screen.getByRole("button", { name: /add link/i }));
    await userEvent.type(screen.getByLabelText(/link name/i), "Design doc");
    await userEvent.type(screen.getByLabelText(/^url/i), "https://example.com/doc");
    await userEvent.click(screen.getByRole("button", { name: /^add link$/i }));

    await waitFor(() =>
      expect(api.addAttachmentLink).toHaveBeenCalledWith("task-1", {
        name: "Design doc",
        externalUrl: "https://example.com/doc",
        type: "url",
      }),
    );
  });

  it("confirms before removing, naming the attachment", async () => {
    const api = stubApi();
    renderAttachments(api, [{ id: "a1", name: "contract.pdf" }]);

    await userEvent.click(screen.getByRole("button", { name: /remove attachment contract\.pdf/i }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/"contract\.pdf" will be removed/i);
    expect(api.deleteAttachment).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: /^remove$/i }));
    await waitFor(() => expect(api.deleteAttachment).toHaveBeenCalledWith("task-1", "a1"));
  });

  it("hides mutating controls when disabled", () => {
    render(
      <ToastProvider>
        <Attachments
          taskApi={stubApi()}
          taskId="task-1"
          attachments={[{ id: "a1", name: "contract.pdf" }]}
          disabled
          onChanged={vi.fn()}
        />
      </ToastProvider>,
    );

    expect(screen.queryByRole("button", { name: /upload file/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove attachment/i })).not.toBeInTheDocument();
  });
});
