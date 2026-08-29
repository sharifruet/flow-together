/**
 * Workspace administration (ADR 0017, ENTERPRISE_PARITY_PLAN.md W3.1).
 *
 * The screen that makes the permission model usable: without somewhere to grant a role,
 * a workspace is a container only its creator can ever open.
 *
 * Every action here is *also* enforced by the service — this hides what would be
 * refused, it does not decide it (REQUIREMENTS.md §13.1).
 */

import { useCallback, useMemo, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  PageHeader,
  SelectInput,
  TextInput,
  useAsync,
  useT,
  useToast,
  useWorkspace,
  type Column,
  type WorkspaceApi,
  type WorkspaceMember,
  type WorkspaceRole,
  type WorkspaceGitApi,
  type WorkspaceSummary,
} from "@togetherflow/common";
import { GitPanel } from "./GitPanel";

const ROLES: WorkspaceRole[] = ["READER", "MODELER", "OWNER"];

export interface WorkspacesProps {
  workspaceApi: WorkspaceApi;
  /** Omitted where the deployment has not enabled Git; the panel is then absent. */
  gitApi?: WorkspaceGitApi;
}

export function Workspaces({ workspaceApi, gitApi }: WorkspacesProps) {
  const t = useT();
  const { push } = useToast();
  const { workspaces, active, refresh, status } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<WorkspaceSummary | null>(null);
  const [memberId, setMemberId] = useState("");
  const [memberType, setMemberType] = useState<"USER" | "GROUP">("USER");
  const [memberRole, setMemberRole] = useState<WorkspaceRole>("MODELER");
  const [membersToken, setMembersToken] = useState(0);

  const run = useCallback(
    async (message: string, action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await action();
        push({ tone: "success", message });
        refresh();
        setMembersToken((token) => token + 1);
      } catch (cause) {
        const apiError = cause instanceof ApiError ? cause : undefined;
        push({
          tone: "error",
          message: apiError?.message ?? t("workspaces.failed"),
          reference: apiError?.correlationId,
        });
      } finally {
        setBusy(false);
      }
    },
    [push, refresh, t],
  );

  const members = useAsync(
    (signal) =>
      active ? workspaceApi.members(active.id, signal) : Promise.resolve([] as WorkspaceMember[]),
    [workspaceApi, active?.id, membersToken],
  );

  const mayManageMembers = active?.capabilities.includes("MANAGE_MEMBERS") ?? false;
  const mayManageWorkspace = active?.capabilities.includes("MANAGE_WORKSPACE") ?? false;

  const columns = useMemo<Column<WorkspaceMember>[]>(
    () => [
      {
        key: "principal",
        header: t("workspaces.member"),
        render: (member) => (
          <span className="tf-task-cell__name">{member.principalId}</span>
        ),
      },
      {
        key: "type",
        header: t("workspaces.principalType"),
        secondary: true,
        render: (member) => t(`workspaces.principal.${member.principalType}`),
      },
      {
        key: "role",
        header: t("workspaces.role"),
        width: "160px",
        render: (member) => <Badge tone="info" subtle>{t(`workspaces.role.${member.role}`)}</Badge>,
      },
      {
        key: "actions",
        header: "",
        width: "120px",
        render: (member) =>
          mayManageMembers ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void run(
                  t("workspaces.member.removed", { id: member.principalId }),
                  () =>
                    workspaceApi.removeMember(
                      member.workspaceId,
                      member.principalType,
                      member.principalId,
                    ),
                )
              }
            >
              {t("action.remove")}
            </Button>
          ) : null,
      },
    ],
    [t, mayManageMembers, busy, run, workspaceApi],
  );

  if (status === "unavailable") {
    return (
      <EmptyState
        title={t("workspace.unavailable")}
        description={t("workspace.unavailable.hint")}
      />
    );
  }

  return (
    <section className="tf-panel" aria-label={t("workspaces.label")}>
      <PageHeader
        title={t("workspaces.title")}
        description={t("workspaces.blurb")}
        actions={
          <Button onClick={() => setCreating((open) => !open)}>{t("workspaces.new")}</Button>
        }
      />

      {creating ? (
        <div className="tf-inline-form">
          <TextInput
            label={t("workspaces.field.key")}
            hint={t("workspaces.field.key.hint")}
            value={newKey}
            disabled={busy}
            onChange={(event) => setNewKey(event.target.value)}
          />
          <TextInput
            label={t("workspaces.field.name")}
            value={newName}
            disabled={busy}
            onChange={(event) => setNewName(event.target.value)}
          />
          <Button
            disabled={busy || !newKey.trim()}
            onClick={() =>
              void run(t("workspaces.created", { name: newName || newKey }), async () => {
                await workspaceApi.create({ key: newKey.trim(), name: newName.trim() || undefined });
                setNewKey("");
                setNewName("");
                setCreating(false);
              })
            }
          >
            {t("workspaces.create")}
          </Button>
        </div>
      ) : null}

      {workspaces.length === 0 ? (
        <EmptyState
          title={t("workspaces.empty.title")}
          description={t("workspaces.empty.description")}
        />
      ) : null}

      {active ? (
        <>
          <section className="tf-panel__section">
            <h2 className="tf-panel__section-title">
              {t("workspaces.membersOf", { name: active.name })}
            </h2>
            <p className="tf-muted">{t("workspaces.roleBlurb")}</p>

            {mayManageMembers ? (
              <div className="tf-inline-form">
                <TextInput
                  label={t("workspaces.member.add")}
                  hint={t("workspaces.member.add.hint")}
                  value={memberId}
                  disabled={busy}
                  onChange={(event) => setMemberId(event.target.value)}
                />
                <SelectInput
                  label={t("workspaces.principalType")}
                  value={memberType}
                  disabled={busy}
                  onChange={(event) => setMemberType(event.target.value as "USER" | "GROUP")}
                >
                  <option value="USER">{t("workspaces.principal.USER")}</option>
                  <option value="GROUP">{t("workspaces.principal.GROUP")}</option>
                </SelectInput>
                <SelectInput
                  label={t("workspaces.role")}
                  value={memberRole}
                  disabled={busy}
                  onChange={(event) => setMemberRole(event.target.value as WorkspaceRole)}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {t(`workspaces.role.${role}`)}
                    </option>
                  ))}
                </SelectInput>
                <Button
                  disabled={busy || !memberId.trim()}
                  onClick={() =>
                    void run(t("workspaces.member.added", { id: memberId.trim() }), async () => {
                      await workspaceApi.addMember(active.id, {
                        principalType: memberType,
                        principalId: memberId.trim(),
                        role: memberRole,
                      });
                      setMemberId("");
                    })
                  }
                >
                  {t("action.add")}
                </Button>
              </div>
            ) : null}

            <AsyncBoundary
              loading={members.loading}
              error={members.error}
              data={members.data}
              onRetry={members.refetch}
              isEmpty={(rows) => rows.length === 0}
              empty={<EmptyState title={t("workspaces.members.empty")} />}
            >
              {(rows) => (
                <DataTable
                  caption={t("workspaces.membersOf", { name: active.name })}
                  columns={columns}
                  rows={rows}
                  rowKey={(member) => `${member.principalType}:${member.principalId}`}
                />
              )}
            </AsyncBoundary>
          </section>

          {gitApi ? <GitPanel gitApi={gitApi} workspace={active} /> : null}

          {mayManageWorkspace ? (
            <section className="tf-panel__section">
              <h2 className="tf-panel__section-title">{t("workspaces.sharing")}</h2>
              <SelectInput
                label={t("workspaces.sharedWorkspace")}
                hint={t("workspaces.sharedWorkspace.hint")}
                value={active.sharedWorkspaceId}
                disabled={busy}
                onChange={(event) =>
                  void run(t("workspaces.shared"), () =>
                    workspaceApi.share(active.id, event.target.value),
                  )
                }
              >
                <option value="">{t("workspaces.sharedWorkspace.none")}</option>
                {workspaces
                  .filter((candidate) => candidate.id !== active.id && !candidate.sharedWorkspaceId)
                  .map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
              </SelectInput>

              <Button variant="danger" disabled={busy} onClick={() => setPendingDelete(active)}>
                {t("workspaces.delete")}
              </Button>
            </section>
          ) : null}
        </>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("workspaces.delete.title")}
        description={t("workspaces.delete.description", { name: pendingDelete?.name ?? "" })}
        confirmLabel={t("workspaces.delete.confirm")}
        destructive
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) {
            void run(t("workspaces.deleted", { name: target.name }), () =>
              workspaceApi.delete(target.id),
            );
          }
        }}
      />
    </section>
  );
}
