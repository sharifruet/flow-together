/**
 * Task attachments (REQUIREMENTS.md §7.1), on the default `db` storage provider (§7.6).
 *
 * Two creation paths, both already supported by TaskAttachmentCollectionResource:
 * upload bytes into the engine, or register a link to content held elsewhere. The link
 * path is the same seam a SharePoint/filesystem gateway plugs into later, so adopting a
 * different provider changes where the URL comes from, not this component.
 */

import { useRef, useState } from "react";
import {
  ApiError,
  Button,
  ConfirmDialog,
  TextInput,
  formatDateTime,
  useToast,
  type AttachmentResponse,
  type TaskApi,
} from "@togetherflow/common";

/** Matches the engine default; a real deployment should surface its own limit. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface AttachmentsProps {
  taskApi: TaskApi;
  taskId: string;
  attachments: AttachmentResponse[];
  disabled?: boolean;
  onChanged: () => void;
}

export function Attachments({
  taskApi,
  taskId,
  attachments,
  disabled = false,
  onChanged,
}: AttachmentsProps) {
  const { push } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"none" | "link">("none");
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | undefined>();
  const [pendingDelete, setPendingDelete] = useState<AttachmentResponse | null>(null);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      push({ tone: "success", message: label });
      onChanged();
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? "That attachment action failed.",
        reference: apiError?.correlationId,
      });
    } finally {
      setBusy(false);
    }
  }

  async function onFilePicked(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      push({
        tone: "error",
        message: `"${file.name}" is larger than the ${formatBytes(MAX_UPLOAD_BYTES)} upload limit.`,
      });
      resetFileInput();
      return;
    }
    await run(`"${file.name}" attached.`, async () => {
      await taskApi.uploadAttachment(taskId, file);
      resetFileInput();
    });
  }

  function resetFileInput() {
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submitLink() {
    const name = linkName.trim();
    const url = linkUrl.trim();
    if (!name) return setLinkError("Give the link a name.");
    if (!isSafeHttpUrl(url)) {
      return setLinkError("Enter a valid http(s) URL.");
    }
    setLinkError(undefined);
    await run(`"${name}" linked.`, async () => {
      await taskApi.addAttachmentLink(taskId, { name, externalUrl: url, type: "url" });
      setLinkName("");
      setLinkUrl("");
      setMode("none");
    });
  }

  return (
    <div className="tf-attachments">
      {attachments.length === 0 ? (
        <p className="tf-muted">No attachments.</p>
      ) : (
        <ul className="tf-attachments__list">
          {attachments.map((attachment) => (
            <li className="tf-attachments__item" key={attachment.id}>
              <span className="tf-attachments__icon" aria-hidden="true">
                {attachment.externalUrl ? "🔗" : "📎"}
              </span>
              <div className="tf-attachments__body">
                <a
                  className="tf-attachments__name"
                  href={
                    attachment.externalUrl ||
                    taskApi.attachmentContentUrl(taskId, attachment.id)
                  }
                  target="_blank"
                  // Untrusted outbound links must not get a handle on this window.
                  rel="noopener noreferrer"
                >
                  {attachment.name}
                </a>
                <span className="tf-attachments__meta">
                  {attachment.userId ? `${attachment.userId} · ` : ""}
                  {formatDateTime(attachment.time ?? undefined)}
                  {attachment.externalUrl ? " · link" : ""}
                </span>
                {attachment.description ? (
                  <span className="tf-attachments__description">{attachment.description}</span>
                ) : null}
              </div>
              {!disabled ? (
                <button
                  type="button"
                  className="tf-attachments__remove"
                  disabled={busy}
                  onClick={() => setPendingDelete(attachment)}
                  aria-label={`Remove attachment ${attachment.name}`}
                >
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!disabled ? (
        <div className="tf-attachments__actions">
          <input
            ref={fileInput}
            id="tf-attachment-file"
            className="tf-visually-hidden"
            type="file"
            disabled={busy}
            onChange={(event) => void onFilePicked(event.target.files?.[0])}
          />
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            Upload file
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setMode((current) => (current === "link" ? "none" : "link"))}
          >
            {mode === "link" ? "Cancel link" : "Add link"}
          </Button>
        </div>
      ) : null}

      {mode === "link" ? (
        <div className="tf-attachments__link-form">
          <TextInput
            label="Link name"
            value={linkName}
            required
            disabled={busy}
            onChange={(event) => setLinkName(event.target.value)}
          />
          <TextInput
            label="URL"
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={linkUrl}
            required
            disabled={busy}
            error={linkError}
            onChange={(event) => setLinkUrl(event.target.value)}
          />
          <Button loading={busy} onClick={() => void submitLink()}>
            Add link
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remove this attachment?"
        description={`"${pendingDelete?.name ?? ""}" will be removed from this task. This can't be undone.`}
        confirmLabel="Remove"
        destructive
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (!target) return;
          void run(`"${target.name}" removed.`, () =>
            taskApi.deleteAttachment(taskId, target.id),
          );
        }}
      />
    </div>
  );
}

/** Blocks javascript:/data: URLs, which would otherwise execute on click. */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}
