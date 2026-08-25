/**
 * Privileges (REQUIREMENTS.md §7.3): what a user or group is allowed to do.
 *
 * Privileges themselves are defined by the deployment, not created here — the REST
 * layer exposes no create/delete for them. This screen grants and revokes them.
 */

import { useCallback, useMemo, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Button,
  ConfirmDialog,
  EmptyState,
  TextInput,
  useAsync,
  useT,
  useToast,
  userDisplayName,
  type IdmApi,
  type IdmPrivilege,
} from "@togetherflow/common";

export interface PrivilegesProps {
  idm: IdmApi;
  readOnly: boolean;
}

export function Privileges({ idm, readOnly }: PrivilegesProps) {
  const t = useT();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useAsync((signal) => idm.listPrivileges({}, signal), [idm]);

  if (selectedId) {
    return (
      <PrivilegeDetail
        idm={idm}
        privilegeId={selectedId}
        readOnly={readOnly}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <section className="tf-panel" aria-label={t("privileges.label")}>
      <header className="tf-panel__header">
        <div>
          <h1 className="tf-panel__title">{t("privileges.title")}</h1>
          <p className="tf-panel__meta">{t("privileges.meta")}</p>
        </div>
      </header>

      <AsyncBoundary
        loading={list.loading}
        error={list.error}
        data={list.data}
        onRetry={list.refetch}
        isEmpty={(page) => page.data.length === 0}
        empty={
          <EmptyState
            title={t("privileges.empty.title")}
            description={t("privileges.empty.description")}
          />
        }
      >
        {(page) => (
          <ul className="tf-cards">
            {page.data.map((privilege) => (
              <li key={privilege.id}>
                <button
                  type="button"
                  className="tf-card"
                  onClick={() => setSelectedId(privilege.id)}
                >
                  <span className="tf-card__title">{privilege.name}</span>
                  <span className="tf-card__meta">{privilege.id}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </AsyncBoundary>
    </section>
  );
}

interface DetailProps {
  idm: IdmApi;
  privilegeId: string;
  readOnly: boolean;
  onBack: () => void;
}

function PrivilegeDetail({ idm, privilegeId, readOnly, onBack }: DetailProps) {
  const t = useT();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [newUser, setNewUser] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [pendingRevoke, setPendingRevoke] = useState<
    { kind: "user" | "group"; id: string; label: string } | null
  >(null);

  const detail = useAsync(
    (signal) => idm.getPrivilege(privilegeId, signal),
    [idm, privilegeId, reloadToken],
  );

  const run = useCallback(
    async (message: string, action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await action();
        push({ tone: "success", message });
        setReloadToken((t) => t + 1);
      } catch (cause) {
        const apiError = cause instanceof ApiError ? cause : undefined;
        push({
          tone: "error",
          message: apiError?.message ?? t("action.failed"),
          reference: apiError?.correlationId,
        });
      } finally {
        setBusy(false);
      }
    },
    [push, t],
  );

  const confirmDescription = useMemo(() => {
    if (!pendingRevoke) return "";
    return t(`privileges.revoke.description.${pendingRevoke.kind}`, {
      label: pendingRevoke.label,
    });
  }, [pendingRevoke, t]);

  return (
    <section className="tf-panel" aria-label={t("privileges.detail.label")}>
      <button type="button" className="tf-back" onClick={onBack}>
        {t("privileges.back")}
      </button>

      <AsyncBoundary
        loading={detail.loading}
        error={detail.error}
        data={detail.data}
        onRetry={detail.refetch}
      >
        {(privilege: IdmPrivilege) => (
          <>
            <header className="tf-panel__header">
              <div>
                <h1 className="tf-panel__title">{privilege.name}</h1>
                <p className="tf-panel__meta">{privilege.id}</p>
              </div>
            </header>

            <section className="tf-panel__section">
              <h2 className="tf-panel__section-title">
                Users ({privilege.users?.length ?? 0})
              </h2>
              {!readOnly ? (
                <form
                  className="tf-inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const userId = newUser.trim();
                    if (!userId) return;
                    void run(t("privileges.granted", { id: userId }), async () => {
                      await idm.grantPrivilegeToUser(privilege.id, userId);
                      setNewUser("");
                    });
                  }}
                >
                  <TextInput
                    label={t("privileges.grantToUser")}
                    placeholder={t("privileges.userIdPlaceholder")}
                    value={newUser}
                    disabled={busy}
                    onChange={(event) => setNewUser(event.target.value)}
                  />
                  <Button type="submit" loading={busy} disabled={!newUser.trim()}>
                    {t("action.grant")}
                  </Button>
                </form>
              ) : null}

              {(privilege.users ?? []).length === 0 ? (
                <p className="tf-muted">{t("privileges.noUsers")}</p>
              ) : (
                <ul className="tf-chips">
                  {(privilege.users ?? []).map((user) => (
                    <li className="tf-chip-item" key={user.id}>
                      <span>{userDisplayName(user)}</span>
                      {!readOnly ? (
                        <button
                          type="button"
                          className="tf-chip-item__remove"
                          aria-label={t("privileges.revokeFrom", { id: user.id })}
                          disabled={busy}
                          onClick={() =>
                            setPendingRevoke({
                              kind: "user",
                              id: user.id,
                              label: userDisplayName(user),
                            })
                          }
                        >
                          ×
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="tf-panel__section">
              <h2 className="tf-panel__section-title">
                Groups ({privilege.groups?.length ?? 0})
              </h2>
              {!readOnly ? (
                <form
                  className="tf-inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const groupId = newGroup.trim();
                    if (!groupId) return;
                    void run(t("privileges.granted", { id: groupId }), async () => {
                      await idm.grantPrivilegeToGroup(privilege.id, groupId);
                      setNewGroup("");
                    });
                  }}
                >
                  <TextInput
                    label={t("privileges.grantToGroup")}
                    placeholder={t("privileges.groupIdPlaceholder")}
                    value={newGroup}
                    disabled={busy}
                    onChange={(event) => setNewGroup(event.target.value)}
                  />
                  <Button type="submit" loading={busy} disabled={!newGroup.trim()}>
                    {t("action.grant")}
                  </Button>
                </form>
              ) : null}

              {(privilege.groups ?? []).length === 0 ? (
                <p className="tf-muted">{t("privileges.noGroups")}</p>
              ) : (
                <ul className="tf-chips">
                  {(privilege.groups ?? []).map((group) => (
                    <li className="tf-chip-item" key={group.id}>
                      <span>{group.name || group.id}</span>
                      {!readOnly ? (
                        <button
                          type="button"
                          className="tf-chip-item__remove"
                          aria-label={t("privileges.revokeFrom", { id: group.id })}
                          disabled={busy}
                          onClick={() =>
                            setPendingRevoke({
                              kind: "group",
                              id: group.id,
                              label: group.name || group.id,
                            })
                          }
                        >
                          ×
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <ConfirmDialog
              open={pendingRevoke !== null}
              title={t("privileges.revoke.title")}
              description={confirmDescription}
              confirmLabel={t("privileges.revoke.confirm")}
              destructive
              busy={busy}
              onCancel={() => setPendingRevoke(null)}
              onConfirm={() => {
                const target = pendingRevoke;
                setPendingRevoke(null);
                if (!target) return;
                void run(t("privileges.revoked", { label: target.label }), () =>
                  target.kind === "user"
                    ? idm.revokePrivilegeFromUser(privilege.id, target.id)
                    : idm.revokePrivilegeFromGroup(privilege.id, target.id),
                );
              }}
            />
          </>
        )}
      </AsyncBoundary>
    </section>
  );
}
