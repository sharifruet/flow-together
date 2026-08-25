import { useCallback, useMemo, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  NoResultsState,
  Pagination,
  TextInput,
  useAsync,
  useDebouncedValue,
  useToast,
  userDisplayName,
  type Column,
  type IdmApi,
  type IdmUser,
  type UserProfileApi,
} from "@togetherflow/common";
import { UserProfile } from "./UserProfile";

const PAGE_SIZE = 25;

export interface UsersProps {
  /** Pictures and custom info live on the process API, not IDM — see UserProfile. */
  profileApi: UserProfileApi;
  idm: IdmApi;
  readOnly: boolean;
}

export function Users({ idm, profileApi, readOnly }: UsersProps) {
  const { push } = useToast();
  const [start, setStart] = useState(0);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search).trim();
  const [editing, setEditing] = useState<IdmUser | null>(null);
  const [profileFor, setProfileFor] = useState<IdmUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<IdmUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const query = useMemo(
    () => ({
      start,
      size: PAGE_SIZE,
      sort: "id" as const,
      // The engine matches on a single field at a time, so the free-text box
      // searches by id — the identifier people actually know.
      ...(debounced ? { id: debounced } : {}),
    }),
    [start, debounced],
  );

  const { data, error, loading, refetch } = useAsync(
    (signal) => idm.listUsers(query, signal),
    [idm, query, reloadToken],
  );

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  const run = useCallback(
    async (message: string, action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await action();
        push({ tone: "success", message });
        reload();
        return true;
      } catch (cause) {
        const apiError = cause instanceof ApiError ? cause : undefined;
        push({
          tone: "error",
          message: apiError?.message ?? "That action could not be completed.",
          reference: apiError?.correlationId,
        });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [push, reload],
  );

  const columns = useMemo<Column<IdmUser>[]>(
    () => [
      {
        key: "id",
        header: "User",
        render: (user) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{userDisplayName(user)}</span>
            <span className="tf-task-cell__description">{user.id}</span>
          </div>
        ),
      },
      {
        key: "email",
        header: "Email",
        secondary: true,
        render: (user) => user.email || <span className="tf-muted">—</span>,
      },
      {
        key: "actions",
        header: "",
        width: readOnly ? "110px" : "230px",
        render: (user) => (
          <div className="tf-row-actions">
            {/* Viewable even in a directory-backed deployment; editing is gated below. */}
            <Button variant="ghost" onClick={() => setProfileFor(user)}>
              Profile
            </Button>
            {readOnly ? null : (
              <>
                <Button variant="ghost" onClick={() => setEditing(user)}>
                  Edit
                </Button>
                <Button variant="ghost" onClick={() => setPendingDelete(user)}>
                  Delete
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [readOnly],
  );

  return (
    <section className="tf-panel" aria-label="Users">
      <header className="tf-panel__header">
        <div>
          <h1 className="tf-panel__title">Users</h1>
          <p className="tf-panel__meta">
            {readOnly
              ? "Users come from a directory and can't be changed here."
              : "People who can sign in and be assigned work."}
          </p>
        </div>
        {!readOnly ? <Button onClick={() => setCreating(true)}>New user</Button> : null}
      </header>

      <div className="tf-panel__search">
        <label className="tf-visually-hidden" htmlFor="tf-user-search">
          Search users by id
        </label>
        <input
          id="tf-user-search"
          className="tf-input"
          type="search"
          placeholder="Search by user id…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setStart(0);
          }}
        />
      </div>

      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={refetch}
        isEmpty={(page) => page.data.length === 0}
        empty={
          debounced ? (
            <NoResultsState
              onClear={() => {
                setSearch("");
                setStart(0);
              }}
            />
          ) : (
            <EmptyState
              title="No users yet"
              description={
                readOnly
                  ? "No users were returned by the directory."
                  : "Create the first user to get started."
              }
              action={!readOnly ? <Button onClick={() => setCreating(true)}>New user</Button> : undefined}
            />
          )
        }
      >
        {(page) => (
          <>
            <DataTable
              caption="Users"
              columns={columns}
              rows={page.data}
              rowKey={(user) => user.id}
            />
            <Pagination
              start={page.start}
              size={page.size || PAGE_SIZE}
              total={page.total}
              onChange={setStart}
            />
          </>
        )}
      </AsyncBoundary>

      {creating ? (
        <UserDialog
          title="New user"
          busy={busy}
          onCancel={() => setCreating(false)}
          onSubmit={async (values) => {
            const ok = await run(`User "${values.id}" created.`, () => idm.createUser(values));
            if (ok) setCreating(false);
          }}
        />
      ) : null}

      {editing ? (
        <UserDialog
          title={`Edit ${userDisplayName(editing)}`}
          user={editing}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSubmit={async (values) => {
            const { id: _id, ...changes } = values;
            // Omit an untouched password so the engine does not reset it.
            if (!changes.password) delete changes.password;
            const ok = await run(`User "${editing.id}" updated.`, () =>
              idm.updateUser(editing.id, changes),
            );
            if (ok) setEditing(null);
          }}
        />
      ) : null}

      {profileFor ? (
        <UserProfile
          profileApi={profileApi}
          user={profileFor}
          readOnly={readOnly}
          onClose={() => setProfileFor(null)}
        />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this user?"
        description={`"${pendingDelete ? userDisplayName(pendingDelete) : ""}" (${pendingDelete?.id ?? ""}) will be removed. They will no longer be able to sign in, and any work assigned to them stays assigned to a user that no longer exists. This can't be undone.`}
        confirmLabel="Delete user"
        destructive
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) void run(`User "${target.id}" deleted.`, () => idm.deleteUser(target.id));
        }}
      />
    </section>
  );
}

interface UserDialogProps {
  title: string;
  user?: IdmUser;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (values: IdmUser) => void;
}

function UserDialog({ title, user, busy, onCancel, onSubmit }: UserDialogProps) {
  const isEdit = Boolean(user);
  const [values, setValues] = useState<IdmUser>({
    id: user?.id ?? "",
    firstName: user?.firstName ?? "",
    lastName: user?.lastName ?? "",
    email: user?.email ?? "",
    password: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const idError = !values.id.trim() ? "A user id is required." : undefined;
  const emailError =
    values.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)
      ? "Enter a valid email address."
      : undefined;
  const passwordError =
    !isEdit && !values.password ? "Set an initial password." : undefined;
  const invalid = Boolean(idError || emailError || passwordError);

  return (
    <div className="tf-dialog-backdrop" onMouseDown={onCancel}>
      <form
        className="tf-dialog tf-dialog--form"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // Native constraint validation would block submit before our own runs, and
        // its default messages are worse than the per-field ones below.
        noValidate
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (!invalid) onSubmit(values);
        }}
      >
        <h2 className="tf-dialog__title">{title}</h2>

        <TextInput
          label="User id"
          value={values.id}
          required
          disabled={isEdit || busy}
          hint={isEdit ? "A user's id can't be changed." : "Used to sign in and to assign work."}
          error={submitted ? idError : undefined}
          onChange={(event) => setValues((v) => ({ ...v, id: event.target.value }))}
        />
        <div className="tf-dialog__row">
          <TextInput
            label="First name"
            value={values.firstName ?? ""}
            disabled={busy}
            onChange={(event) => setValues((v) => ({ ...v, firstName: event.target.value }))}
          />
          <TextInput
            label="Last name"
            value={values.lastName ?? ""}
            disabled={busy}
            onChange={(event) => setValues((v) => ({ ...v, lastName: event.target.value }))}
          />
        </div>
        <TextInput
          label="Email"
          type="email"
          value={values.email ?? ""}
          disabled={busy}
          error={submitted ? emailError : undefined}
          onChange={(event) => setValues((v) => ({ ...v, email: event.target.value }))}
        />
        <TextInput
          label={isEdit ? "New password" : "Password"}
          type="password"
          autoComplete="new-password"
          value={values.password ?? ""}
          disabled={busy}
          hint={isEdit ? "Leave blank to keep the current password." : undefined}
          error={submitted ? passwordError : undefined}
          onChange={(event) => setValues((v) => ({ ...v, password: event.target.value }))}
        />

        <div className="tf-dialog__actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {isEdit ? "Save changes" : "Create user"}
          </Button>
        </div>
      </form>
    </div>
  );
}
