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
    <section className="tf-panel" aria-label="Privileges">
      <header className="tf-panel__header">
        <div>
          <h1 className="tf-panel__title">Privileges</h1>
          <p className="tf-panel__meta">
            What users and groups are allowed to do. Privileges are defined by the
            deployment; grant and revoke them here.
          </p>
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
            title="No privileges defined"
            description="This deployment defines no privileges, so there is nothing to grant."
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
          message: apiError?.message ?? "That action could not be completed.",
          reference: apiError?.correlationId,
        });
      } finally {
        setBusy(false);
      }
    },
    [push],
  );

  const confirmDescription = useMemo(() => {
    if (!pendingRevoke) return "";
    const who = pendingRevoke.kind === "user" ? "user" : "group";
    return `"${pendingRevoke.label}" (${who}) will lose this privilege immediately, along with whatever access it grants.`;
  }, [pendingRevoke]);

  return (
    <section className="tf-panel" aria-label="Privilege detail">
      <button type="button" className="tf-back" onClick={onBack}>
        ← Back to all privileges
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
                    void run(`Granted to "${userId}".`, async () => {
                      await idm.grantPrivilegeToUser(privilege.id, userId);
                      setNewUser("");
                    });
                  }}
                >
                  <TextInput
                    label="Grant to user"
                    placeholder="User id"
                    value={newUser}
                    disabled={busy}
                    onChange={(event) => setNewUser(event.target.value)}
                  />
                  <Button type="submit" loading={busy} disabled={!newUser.trim()}>
                    Grant
                  </Button>
                </form>
              ) : null}

              {(privilege.users ?? []).length === 0 ? (
                <p className="tf-muted">No users have this privilege.</p>
              ) : (
                <ul className="tf-chips">
                  {(privilege.users ?? []).map((user) => (
                    <li className="tf-chip-item" key={user.id}>
                      <span>{userDisplayName(user)}</span>
                      {!readOnly ? (
                        <button
                          type="button"
                          className="tf-chip-item__remove"
                          aria-label={`Revoke from ${user.id}`}
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
                    void run(`Granted to "${groupId}".`, async () => {
                      await idm.grantPrivilegeToGroup(privilege.id, groupId);
                      setNewGroup("");
                    });
                  }}
                >
                  <TextInput
                    label="Grant to group"
                    placeholder="Group id"
                    value={newGroup}
                    disabled={busy}
                    onChange={(event) => setNewGroup(event.target.value)}
                  />
                  <Button type="submit" loading={busy} disabled={!newGroup.trim()}>
                    Grant
                  </Button>
                </form>
              ) : null}

              {(privilege.groups ?? []).length === 0 ? (
                <p className="tf-muted">No groups have this privilege.</p>
              ) : (
                <ul className="tf-chips">
                  {(privilege.groups ?? []).map((group) => (
                    <li className="tf-chip-item" key={group.id}>
                      <span>{group.name || group.id}</span>
                      {!readOnly ? (
                        <button
                          type="button"
                          className="tf-chip-item__remove"
                          aria-label={`Revoke from ${group.id}`}
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
              title="Revoke this privilege?"
              description={confirmDescription}
              confirmLabel="Revoke"
              destructive
              busy={busy}
              onCancel={() => setPendingRevoke(null)}
              onConfirm={() => {
                const target = pendingRevoke;
                setPendingRevoke(null);
                if (!target) return;
                void run(`Revoked from "${target.label}".`, () =>
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
