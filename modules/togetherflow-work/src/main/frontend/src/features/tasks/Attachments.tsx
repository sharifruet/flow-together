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
  useI18n,
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
  const { t, locale } = useI18n();
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
        message: apiError?.message ?? t("attachments.failed"),
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
        message: t("attachments.tooLarge", {
          name: file.name,
          limit: formatBytes(MAX_UPLOAD_BYTES),
        }),
      });
      resetFileInput();
      return;
    }
    await run(t("attachments.attached", { name: file.name }), async () => {
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
    if (!name) return setLinkError(t("attachments.needName"));
    if (!isSafeHttpUrl(url)) {
      return setLinkError(t("attachments.needUrl"));
    }
    setLinkError(undefined);
    await run(t("attachments.linked", { name }), async () => {
      await taskApi.addAttachmentLink(taskId, { name, externalUrl: url, type: "url" });
      setLinkName("");
      setLinkUrl("");
      setMode("none");
    });
  }

  return (
    <div className="tf-attachments">
      {attachments.length === 0 ? (
        <p className="tf-muted">{t("attachments.none")}</p>
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
                  {formatDateTime(attachment.time ?? undefined, locale)}
                  {attachment.externalUrl ? ` · ${t("attachments.link")}` : ""}
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
                  aria-label={t("attachments.remove", { name: attachment.name })}
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
            {t("attachments.upload")}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setMode((current) => (current === "link" ? "none" : "link"))}
          >
            {mode === "link" ? t("attachments.cancelLink") : t("attachments.addLink")}
          </Button>
        </div>
      ) : null}

      {mode === "link" ? (
        <div className="tf-attachments__link-form">
          <TextInput
            label={t("attachments.linkName")}
            value={linkName}
            required
            disabled={busy}
            onChange={(event) => setLinkName(event.target.value)}
          />
          <TextInput
            label={t("attachments.url")}
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
            {t("attachments.addLink")}
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("attachments.confirmRemove.title")}
        description={t("attachments.confirmRemove.description", {
          name: pendingDelete?.name ?? "",
        })}
        confirmLabel={t("attachments.confirmRemove.confirm")}
        destructive
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (!target) return;
          void run(t("attachments.removed", { name: target.name }), () =>
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
