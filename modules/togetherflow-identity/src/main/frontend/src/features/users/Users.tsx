import { useCallback, useMemo, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Badge,
  Button,
  Modal,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Icon,
  NoResultsState,
  PageHeader,
  Pagination,
  TextInput,
  UserChip,
  exportUserData,
  useAsync,
  useDebouncedValue,
  useListState,
  useT,
  useToast,
  userDisplayName,
  type Column,
  type IdmApi,
  type IdmUser,
  type UserProfileApi,
} from "@togetherflow/common";
import { UserProfile } from "./UserProfile";

/** What the query string carries for this list (W1.3, F1). */
interface UsersView {
  [key: string]: string;
  q: string;
}

const DEFAULT_VIEW: UsersView = { q: "" };

export interface UsersProps {
  /** Pictures and custom info live on the process API, not IDM — see UserProfile. */
  profileApi: UserProfileApi;
  idm: IdmApi;
  readOnly: boolean;
  /**
   * Id from `/users/:userId`. Opens that user's profile, so a person can be linked to —
   * the first thing anyone wants to paste into a ticket, and impossible before W1.3.
   */
  selectedUserId?: string;
  /** Called when the open profile changes, so the URL follows it. */
  onSelectUser?: (userId: string | undefined) => void;
}

export function Users({ idm, profileApi, readOnly, selectedUserId, onSelectUser }: UsersProps) {
  const t = useT();
  const { push } = useToast();
  const list = useListState<UsersView>({ defaults: DEFAULT_VIEW, preferenceKey: "identity.users" });
  const search = list.filters.q;
  const setStart = list.setStart;
  const debounced = useDebouncedValue(search).trim();
  const [editing, setEditing] = useState<IdmUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<IdmUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  /**
   * Answers a data subject access request (§13.7) by collecting what the identity store
   * holds and handing it over as a file. The export names its own scope — it is not a
   * complete record of the person's data, and a file that implied otherwise would be
   * worse than none.
   */
  const exportData = useCallback(
    async (user: IdmUser) => {
      setBusy(true);
      try {
        const data = await exportUserData(idm, profileApi, user.id);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `togetherflow-user-${user.id}.json`;
        link.click();
        URL.revokeObjectURL(url);
        push({ tone: "success", message: t("users.export.done", { id: user.id }) });
      } catch (cause) {
        const apiError = cause instanceof ApiError ? cause : undefined;
        push({
          tone: "error",
          message: apiError?.message ?? t("users.export.failed"),
          reference: apiError?.correlationId,
        });
      } finally {
        setBusy(false);
      }
    },
    [idm, profileApi, push, t],
  );

  const query = useMemo(
    () => ({
      start: list.start,
      size: list.size,
      sort: "id" as const,
      // The engine matches on a single field at a time, so the free-text box
      // searches by id — the identifier people actually know.
      ...(debounced ? { id: debounced } : {}),
    }),
    [list.start, list.size, debounced],
  );

  const { data, error, loading, refetch } = useAsync(
    (signal) => idm.listUsers(query, signal),
    [idm, query, reloadToken],
  );

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

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
          message: apiError?.message ?? t("action.failed"),
          reference: apiError?.correlationId,
        });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [push, reload, t],
  );

  const columns = useMemo<Column<IdmUser>[]>(
    () => [
      {
        key: "id",
        header: t("users.column.user"),
        required: true,
        render: (user) => (
          <UserChip userId={user.id} name={userDisplayName(user)} size="md" secondary={user.id} />
        ),
      },
      {
        key: "email",
        header: t("users.column.email"),
        secondary: true,
        render: (user) => user.email || <span className="tf-muted">—</span>,
      },
      {
        key: "actions",
        header: "",
        width: readOnly ? "200px" : "320px",
        render: (user) => (
          <div className="tf-row-actions">
            {/* Viewable even in a directory-backed deployment; editing is gated below. */}
            <Button variant="ghost" onClick={() => onSelectUser?.(user.id)}>
              {t("users.profile.action")}
            </Button>
            {/*
              Data subject access (§13.7). Offered regardless of readOnly: reading what
              is held about someone is not a mutation, and a directory-backed deployment
              still has to be able to answer the request.
            */}
            <Button variant="ghost" onClick={() => void exportData(user)}>
              {t("users.export.action")}
            </Button>
            {readOnly ? null : (
              <>
                <Button variant="ghost" onClick={() => setEditing(user)}>
                  {t("action.edit")}
                </Button>
                <Button variant="ghost" onClick={() => setPendingDelete(user)}>
                  {t("action.delete")}
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [readOnly, t, exportData, onSelectUser],
  );

  /** The row for the id in the URL, once the page holding it has loaded. */
  const profileFor = useMemo(
    () => (selectedUserId ? (data?.data ?? []).find((user) => user.id === selectedUserId) : undefined),
    [selectedUserId, data],
  );

  return (
    <section className="tf-panel" aria-label={t("users.label")}>
      <PageHeader
        title={t("users.title")}
        description={readOnly ? t("users.meta.readOnly") : t("users.meta")}
        meta={
          data ? (
            <Badge tone="info" subtle srLabel={t("users.countLabel", { count: data.total })}>
              {data.total}
            </Badge>
          ) : undefined
        }
        actions={
          !readOnly ? (
            <Button onClick={() => setCreating(true)}>
              <Icon name="add" size={16} />
              {t("users.new")}
            </Button>
          ) : undefined
        }
      />

      <div className="tf-panel__search">
        <label className="tf-visually-hidden" htmlFor="tf-user-search">
          {t("users.searchLabel")}
        </label>
        <input
          id="tf-user-search"
          className="tf-input"
          type="search"
          placeholder={t("users.search")}
          value={search}
          onChange={(event) => list.setFilters({ q: event.target.value })}
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
            <NoResultsState onClear={list.clearFilters} />
          ) : (
            <EmptyState
              illustration="no-results"
              title={t("users.empty.title")}
              description={
                readOnly
                  ? t("users.empty.description.readOnly")
                  : t("users.empty.description")
              }
              action={!readOnly ? <Button onClick={() => setCreating(true)}>{t("users.new")}</Button> : undefined}
            />
          )
        }
      >
        {(page) => (
          <>
            <DataTable
              caption={t("users.caption")}
              preferenceKey="identity.users"
              columns={columns}
              rows={page.data}
              rowKey={(user) => user.id}
              selectedKey={selectedUserId}
              busy={loading}
            />
            <Pagination
              start={page.start}
              size={page.size || list.size}
              total={page.total}
              onChange={setStart}
              onSizeChange={list.setSize}
            />
          </>
        )}
      </AsyncBoundary>

      {creating ? (
        <UserDialog
          title={t("users.create.title")}
          busy={busy}
          onCancel={() => setCreating(false)}
          onSubmit={async (values) => {
            const ok = await run(t("users.created", { id: values.id }), () =>
              idm.createUser(values),
            );
            if (ok) setCreating(false);
          }}
        />
      ) : null}

      {editing ? (
        <UserDialog
          title={t("users.edit.title", { name: userDisplayName(editing) })}
          user={editing}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSubmit={async (values) => {
            const { id: _id, ...changes } = values;
            // Omit an untouched password so the engine does not reset it.
            if (!changes.password) delete changes.password;
            const ok = await run(t("users.updated", { id: editing.id }), () =>
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
          onClose={() => onSelectUser?.(undefined)}
        />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("users.delete.title")}
        description={t("users.delete.description", {
          name: pendingDelete ? userDisplayName(pendingDelete) : "",
          id: pendingDelete?.id ?? "",
        })}
        confirmLabel={t("users.delete.confirm")}
        destructive
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) {
            void run(t("users.deleted", { id: target.id }), () => idm.deleteUser(target.id));
          }
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
  const t = useT();
  const isEdit = Boolean(user);
  const [values, setValues] = useState<IdmUser>({
    id: user?.id ?? "",
    firstName: user?.firstName ?? "",
    lastName: user?.lastName ?? "",
    email: user?.email ?? "",
    password: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const idError = !values.id.trim() ? t("users.error.idRequired") : undefined;
  const emailError =
    values.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)
      ? t("users.error.email")
      : undefined;
  const passwordError = !isEdit && !values.password ? t("users.error.password") : undefined;
  const invalid = Boolean(idError || emailError || passwordError);

  return (
    <Modal
      open
      title={title}
      size="sm"
      // Typed input: a stray backdrop click must not discard it.
      dismissOnBackdrop={false}
      onClose={onCancel}
      actions={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {t("dialog.cancel")}
          </Button>
          <Button type="submit" form={FORM_ID} loading={busy}>
            {isEdit ? t("action.saveChanges") : t("users.create.submit")}
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        // Native constraint validation would block submit before our own runs, and its
        // default messages are worse than the per-field ones below.
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (!invalid) onSubmit(values);
        }}
      >

        <TextInput
          label={t("users.field.id")}
          value={values.id}
          required
          disabled={isEdit || busy}
          hint={isEdit ? t("users.field.id.hintEdit") : t("users.field.id.hintNew")}
          error={submitted ? idError : undefined}
          onChange={(event) => setValues((v) => ({ ...v, id: event.target.value }))}
        />
        <div className="tf-dialog__row">
          <TextInput
            label={t("users.field.firstName")}
            value={values.firstName ?? ""}
            disabled={busy}
            onChange={(event) => setValues((v) => ({ ...v, firstName: event.target.value }))}
          />
          <TextInput
            label={t("users.field.lastName")}
            value={values.lastName ?? ""}
            disabled={busy}
            onChange={(event) => setValues((v) => ({ ...v, lastName: event.target.value }))}
          />
        </div>
        <TextInput
          label={t("users.field.email")}
          type="email"
          value={values.email ?? ""}
          disabled={busy}
          error={submitted ? emailError : undefined}
          onChange={(event) => setValues((v) => ({ ...v, email: event.target.value }))}
        />
        <TextInput
          label={isEdit ? t("users.field.newPassword") : t("users.field.password")}
          type="password"
          autoComplete="new-password"
          value={values.password ?? ""}
          disabled={busy}
          hint={isEdit ? t("users.field.password.hintEdit") : undefined}
          error={submitted ? passwordError : undefined}
          onChange={(event) => setValues((v) => ({ ...v, password: event.target.value }))}
        />
      </form>
    </Modal>
  );
}

/** Ties the Modal footer's submit button to the form it sits outside of. */
const FORM_ID = "tf-user-form";
