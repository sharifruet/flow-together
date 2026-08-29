/**
 * The Git panel (ADR 0018, ENTERPRISE_PARITY_PLAN.md W3.2).
 *
 * Shown inside the workspace screen, because a workspace — not an app — is what this fork
 * syncs: an app here is a deployable bundle assembled from models, whereas a workspace is
 * the durable grouping people actually work in.
 *
 * Every action is enforced server-side by the workspace role. This hides what would be
 * refused; it does not decide it (REQUIREMENTS.md §13.1).
 */

import { useCallback, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Badge,
  Button,
  ConfirmDialog,
  SelectInput,
  TextInput,
  useAsync,
  useT,
  useToast,
  type GitImportSummary,
  type GitStatus,
  type WorkspaceGitApi,
  type WorkspaceSummary,
} from "@togetherflow/common";

export interface GitPanelProps {
  gitApi: WorkspaceGitApi;
  workspace: WorkspaceSummary;
}

export function GitPanel({ gitApi, workspace }: GitPanelProps) {
  const t = useT();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState(0);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [subPath, setSubPath] = useState("");
  const [message, setMessage] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [diff, setDiff] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const mayWrite = workspace.capabilities.includes("EDIT");
  const mayManage = workspace.capabilities.includes("MANAGE_WORKSPACE");

  const status = useAsync(
    (signal) => gitApi.status(workspace.id, signal),
    [gitApi, workspace.id, token],
  );

  const run = useCallback(
    async (success: string, action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await action();
        push({ tone: "success", message: success });
        setToken((current) => current + 1);
      } catch (cause) {
        const apiError = cause instanceof ApiError ? cause : undefined;
        push({
          tone: "error",
          message: apiError?.message ?? t("git.failed"),
          reference: apiError?.correlationId,
        });
      } finally {
        setBusy(false);
      }
    },
    [push, t],
  );

  const describeImport = (summary: GitImportSummary) =>
    t("git.pulled", {
      created: summary.created.length,
      updated: summary.updated.length,
      failed: summary.failed.length,
    });

  return (
    <section className="tf-panel__section" aria-label={t("git.label")}>
      <h2 className="tf-panel__section-title">{t("git.title")}</h2>

      <AsyncBoundary
        loading={status.loading}
        error={status.error}
        data={status.data}
        onRetry={status.refetch}
        skeletonRows={3}
      >
        {(current: GitStatus) =>
          !current.connected ? (
            <>
              <p className="tf-muted">{t("git.notConnected")}</p>
              {mayManage ? (
                <div className="tf-inline-form">
                  <TextInput
                    label={t("git.remoteUrl")}
                    hint={t("git.remoteUrl.hint")}
                    value={remoteUrl}
                    disabled={busy}
                    onChange={(event) => setRemoteUrl(event.target.value)}
                  />
                  <TextInput
                    label={t("git.branch")}
                    value={branch}
                    disabled={busy}
                    onChange={(event) => setBranch(event.target.value)}
                  />
                  <TextInput
                    label={t("git.subPath")}
                    hint={t("git.subPath.hint")}
                    value={subPath}
                    disabled={busy}
                    onChange={(event) => setSubPath(event.target.value)}
                  />
                  <Button
                    disabled={busy || !remoteUrl.trim()}
                    onClick={() =>
                      void run(t("git.connected"), async () => {
                        const summary = await gitApi.connect(workspace.id, {
                          remoteUrl: remoteUrl.trim(),
                          branch: branch.trim(),
                          subPath: subPath.trim(),
                        });
                        // Connecting imports what the repository holds, so say what
                        // arrived rather than only that it worked.
                        if (summary.created.length > 0) {
                          push({ tone: "success", message: describeImport(summary) });
                        }
                      })
                    }
                  >
                    {t("git.connect")}
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <dl className="tf-detail__facts">
                <div className="tf-detail__fact">
                  <dt>{t("git.remote")}</dt>
                  <dd className="tf-mono">{current.remoteUrl}</dd>
                </div>
                <div className="tf-detail__fact">
                  <dt>{t("git.branch")}</dt>
                  <dd>{current.branch}</dd>
                </div>
                <div className="tf-detail__fact">
                  <dt>{t("git.sync")}</dt>
                  <dd>
                    {/*
                      -1 is "could not reach the remote", which is not zero. Reporting it
                      as "in sync" would be the one wrong answer that looks reassuring.
                    */}
                    {current.ahead < 0 || current.behind < 0 ? (
                      <Badge tone="warning">{t("git.sync.unknown")}</Badge>
                    ) : current.ahead === 0 && current.behind === 0 ? (
                      <Badge tone="success" subtle>
                        {t("git.sync.upToDate")}
                      </Badge>
                    ) : (
                      <Badge tone="info" subtle>
                        {t("git.sync.diverged", { ahead: current.ahead, behind: current.behind })}
                      </Badge>
                    )}
                  </dd>
                </div>
                {current.lastCommitMessage ? (
                  <div className="tf-detail__fact">
                    <dt>{t("git.lastCommit")}</dt>
                    <dd>{current.lastCommitMessage}</dd>
                  </div>
                ) : null}
              </dl>

              {current.error ? (
                <p className="tf-detail__note tf-detail__note--error" role="alert">
                  {current.error}
                </p>
              ) : null}

              <h3 className="tf-panel__section-title">
                {t("git.changes", { count: current.changes.length })}
              </h3>
              {current.changes.length === 0 ? (
                <p className="tf-muted">{t("git.changes.none")}</p>
              ) : (
                <ul className="tf-git__changes">
                  {current.changes.map((change) => (
                    <li className="tf-git__change" key={change.path}>
                      <Badge
                        tone={
                          change.kind === "REMOVED"
                            ? "danger"
                            : change.kind === "ADDED"
                              ? "success"
                              : "info"
                        }
                        subtle
                      >
                        {t(`git.change.${change.kind}`)}
                      </Badge>
                      <span className="tf-git__change-name">{change.modelKey}</span>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void run(t("git.diff.loaded"), async () => {
                            setDiff(await gitApi.diff(workspace.id, change.modelKey));
                          })
                        }
                      >
                        {t("git.diff")}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              {diff !== null ? (
                <>
                  <p className="tf-muted">{t("git.diff.note")}</p>
                  <pre className="tf-git__diff">{diff || t("git.diff.empty")}</pre>
                </>
              ) : null}

              {mayWrite ? (
                <>
                  <div className="tf-inline-form">
                    <TextInput
                      label={t("git.commitMessage")}
                      value={message}
                      disabled={busy}
                      onChange={(event) => setMessage(event.target.value)}
                    />
                    <Button
                      disabled={busy || !message.trim() || current.changes.length === 0}
                      onClick={() =>
                        void run(t("git.committed"), async () => {
                          await gitApi.commit(workspace.id, message.trim());
                          setMessage("");
                          setDiff(null);
                        })
                      }
                    >
                      {t("git.commit")}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void run(t("git.pushed"), () => gitApi.push(workspace.id))}
                    >
                      {t("git.push")}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(t("git.pulled.done"), async () => {
                          const summary = await gitApi.pull(workspace.id);
                          push({ tone: "success", message: describeImport(summary) });
                        })
                      }
                    >
                      {t("git.pull")}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy || current.changes.length === 0}
                      onClick={() => void run(t("git.reverted"), () => gitApi.revert(workspace.id))}
                    >
                      {t("git.revert")}
                    </Button>
                  </div>

                  <div className="tf-inline-form">
                    <SelectInput
                      label={t("git.switchBranch")}
                      value={current.branch ?? ""}
                      disabled={busy}
                      onChange={(event) =>
                        void run(t("git.switched"), () =>
                          gitApi.switchBranch(workspace.id, event.target.value),
                        )
                      }
                    >
                      {current.branches.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </SelectInput>
                    <TextInput
                      label={t("git.newBranch")}
                      value={newBranch}
                      disabled={busy}
                      onChange={(event) => setNewBranch(event.target.value)}
                    />
                    <Button
                      variant="secondary"
                      disabled={busy || !newBranch.trim()}
                      onClick={() =>
                        void run(t("git.branchCreated", { name: newBranch.trim() }), async () => {
                          await gitApi.createBranch(workspace.id, newBranch.trim());
                          setNewBranch("");
                        })
                      }
                    >
                      {t("git.createBranch")}
                    </Button>
                  </div>
                </>
              ) : null}

              {mayManage ? (
                <Button variant="danger" disabled={busy} onClick={() => setConfirmDisconnect(true)}>
                  {t("git.disconnect")}
                </Button>
              ) : null}
            </>
          )
        }
      </AsyncBoundary>

      <ConfirmDialog
        open={confirmDisconnect}
        title={t("git.disconnect.title")}
        description={t("git.disconnect.description", { name: workspace.name })}
        confirmLabel={t("git.disconnect.confirm")}
        destructive
        busy={busy}
        onCancel={() => setConfirmDisconnect(false)}
        onConfirm={() => {
          setConfirmDisconnect(false);
          void run(t("git.disconnected"), () => gitApi.disconnect(workspace.id));
        }}
      />
    </section>
  );
}
