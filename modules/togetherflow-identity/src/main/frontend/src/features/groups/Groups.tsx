import { useCallback, useMemo, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Modal,
  NoResultsState,
  Pagination,
  TextInput,
  useAsync,
  useDebouncedValue,
  useT,
  useToast,
  userDisplayName,
  type Column,
  type IdmApi,
  type IdmGroup,
  type IdmUser,
} from "@togetherflow/common";

const PAGE_SIZE = 25;

export interface GroupsProps {
  idm: IdmApi;
  readOnly: boolean;
}

export function Groups({ idm, readOnly }: GroupsProps) {
  const t = useT();
  const { push } = useToast();
  const [start, setStart] = useState(0);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search).trim();
  const [selected, setSelected] = useState<IdmGroup | null>(null);
  const [editing, setEditing] = useState<IdmGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<IdmGroup | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const query = useMemo(
    () => ({
      start,
      size: PAGE_SIZE,
      sort: "id" as const,
      ...(debounced ? { nameLike: `%${debounced}%` } : {}),
    }),
    [start, debounced],
  );

  const { data, error, loading, refetch } = useAsync(
    (signal) => idm.listGroups(query, signal),
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

  const columns = useMemo<Column<IdmGroup>[]>(
    () => [
      {
        key: "name",
        header: t("groups.column.group"),
        render: (group) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{group.name || group.id}</span>
            <span className="tf-task-cell__description">{group.id}</span>
          </div>
        ),
      },
      {
        key: "type",
        header: t("groups.column.type"),
        secondary: true,
        width: "140px",
        render: (group) => group.type || <span className="tf-muted">—</span>,
      },
      {
        key: "actions",
        header: "",
        width: "220px",
        render: (group) => (
          <div className="tf-row-actions">
            <Button variant="ghost" onClick={() => setSelected(group)}>
              {t("groups.members.action")}
            </Button>
            {!readOnly ? (
              <>
                <Button variant="ghost" onClick={() => setEditing(group)}>
                  {t("action.edit")}
                </Button>
                <Button variant="ghost" onClick={() => setPendingDelete(group)}>
                  {t("action.delete")}
                </Button>
              </>
            ) : null}
          </div>
        ),
      },
    ],
    [readOnly, t],
  );

  if (selected) {
    return (
      <GroupMembers
        idm={idm}
        group={selected}
        readOnly={readOnly}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <section className="tf-panel" aria-label={t("groups.label")}>
      <header className="tf-panel__header">
        <div>
          <h1 className="tf-panel__title">{t("groups.title")}</h1>
          <p className="tf-panel__meta">
            {readOnly
              ? t("groups.meta.readOnly")
              : t("groups.meta")}
          </p>
        </div>
        {!readOnly ? <Button onClick={() => setCreating(true)}>{t("groups.new")}</Button> : null}
      </header>

      <div className="tf-panel__search">
        <label className="tf-visually-hidden" htmlFor="tf-group-search">
          {t("groups.searchLabel")}
        </label>
        <input
          id="tf-group-search"
          className="tf-input"
          type="search"
          placeholder={t("groups.search")}
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
              title={t("groups.empty.title")}
              description={
                readOnly
                  ? t("groups.empty.description.readOnly")
                  : t("groups.empty.description")
              }
              action={
                !readOnly ? <Button onClick={() => setCreating(true)}>{t("groups.new")}</Button> : undefined
              }
            />
          )
        }
      >
        {(page) => (
          <>
            <DataTable
              caption={t("groups.caption")}
              columns={columns}
              rows={page.data}
              rowKey={(group) => group.id}
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
        <GroupDialog
          title={t("groups.create.title")}
          busy={busy}
          onCancel={() => setCreating(false)}
          onSubmit={async (values) => {
            const ok = await run(t("groups.created", { id: values.id }), () =>
              idm.createGroup(values),
            );
            if (ok) setCreating(false);
          }}
        />
      ) : null}

      {editing ? (
        <GroupDialog
          title={t("groups.edit.title", { name: editing.name || editing.id })}
          group={editing}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSubmit={async (values) => {
            const ok = await run(t("groups.updated", { id: editing.id }), () =>
              idm.updateGroup(editing.id, { name: values.name, type: values.type }),
            );
            if (ok) setEditing(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("groups.delete.title")}
        description={t("groups.delete.description", {
          name: pendingDelete?.name || pendingDelete?.id || "",
        })}
        confirmLabel={t("groups.delete.confirm")}
        destructive
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) void run(`Group "${target.id}" deleted.`, () => idm.deleteGroup(target.id));
        }}
      />
    </section>
  );
}

interface GroupMembersProps {
  idm: IdmApi;
  group: IdmGroup;
  readOnly: boolean;
  onBack: () => void;
}

function GroupMembers({ idm, group, readOnly, onBack }: GroupMembersProps) {
  const t = useT();
  const { push } = useToast();
  const [newMember, setNewMember] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<IdmUser | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const { data, error, loading, refetch } = useAsync(
    (signal) => idm.listGroupMembers(group.id, { size: 100 }, signal),
    [idm, group.id, reloadToken],
  );

  const run = useCallback(
    async (message: string, action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await action();
        push({ tone: "success", message });
        setReloadToken((t) => t + 1);
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
    [push, t],
  );

  const columns = useMemo<Column<IdmUser>[]>(
    () => [
      {
        key: "user",
        header: t("groups.members.column"),
        render: (user) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{userDisplayName(user)}</span>
            <span className="tf-task-cell__description">{user.id}</span>
          </div>
        ),
      },
      {
        key: "actions",
        header: "",
        width: "120px",
        render: (user) =>
          readOnly ? null : (
            <div className="tf-row-actions">
              <Button variant="ghost" onClick={() => setPendingRemove(user)}>
                {t("action.remove")}
              </Button>
            </div>
          ),
      },
    ],
    [readOnly, t],
  );

  return (
    <section className="tf-panel" aria-label={`Members of ${group.name || group.id}`}>
      <button type="button" className="tf-back" onClick={onBack}>
        ← Back to all groups
      </button>
      <header className="tf-panel__header">
        <div>
          <h1 className="tf-panel__title">{group.name || group.id}</h1>
          <p className="tf-panel__meta">Members of this group</p>
        </div>
      </header>

      {!readOnly ? (
        <form
          className="tf-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const userId = newMember.trim();
            if (!userId) return;
            void run(`"${userId}" added to ${group.id}.`, async () => {
              await idm.addGroupMember(group.id, userId);
              setNewMember("");
            });
          }}
        >
          <TextInput
            label={t("groups.members.add")}
            placeholder={t("groups.members.addPlaceholder")}
            value={newMember}
            disabled={busy}
            onChange={(event) => setNewMember(event.target.value)}
          />
          <Button type="submit" loading={busy} disabled={!newMember.trim()}>
            {t("action.add")}
          </Button>
        </form>
      ) : null}

      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={refetch}
        isEmpty={(page) => page.data.length === 0}
        empty={
          <EmptyState
            title={t("groups.members.empty.title")}
            description={
              readOnly
                ? t("groups.members.empty.description.readOnly")
                : t("groups.members.empty.description")
            }
          />
        }
      >
        {(page) => (
          <DataTable
            caption={t("groups.members.caption", { id: group.id })}
            columns={columns}
            rows={page.data}
            rowKey={(user) => user.id}
          />
        )}
      </AsyncBoundary>

      <ConfirmDialog
        open={pendingRemove !== null}
        title={t("groups.members.remove.title")}
        description={t("groups.members.remove.description", {
          name: pendingRemove ? userDisplayName(pendingRemove) : "",
          group: group.name || group.id,
        })}
        confirmLabel={t("groups.members.remove.confirm")}
        destructive
        busy={busy}
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => {
          const target = pendingRemove;
          setPendingRemove(null);
          if (target) {
            void run(t("groups.members.removed", { id: target.id, group: group.id }), () =>
              idm.removeGroupMember(group.id, target.id),
            );
          }
        }}
      />
    </section>
  );
}

interface GroupDialogProps {
  title: string;
  group?: IdmGroup;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (values: IdmGroup) => void;
}

const FORM_ID = "tf-group-form";

function GroupDialog({ title, group, busy, onCancel, onSubmit }: GroupDialogProps) {
  const t = useT();
  const isEdit = Boolean(group);
  const [values, setValues] = useState<IdmGroup>({
    id: group?.id ?? "",
    name: group?.name ?? "",
    type: group?.type ?? "",
  });
  const [submitted, setSubmitted] = useState(false);
  const idError = !values.id.trim() ? t("groups.error.idRequired") : undefined;

  return (
    <Modal
      open
      size="sm"
      title={title}
      // Typed-in work: a stray backdrop click must not discard it.
      dismissOnBackdrop={false}
      onClose={onCancel}
      actions={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {t("dialog.cancel")}
          </Button>
          {/* Footer button, form by id — see the note in Users' dialog. */}
          <Button type="submit" form={FORM_ID} loading={busy}>
            {isEdit ? t("action.saveChanges") : t("groups.create.submit")}
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        // Native constraint validation would block submit before our own runs, and
        // its default messages are worse than the per-field ones below.
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (!idError) onSubmit(values);
        }}
      >

        <TextInput
          label={t("groups.field.id")}
          value={values.id}
          required
          disabled={isEdit || busy}
          hint={isEdit ? t("groups.field.id.hintEdit") : t("groups.field.id.hintNew")}
          error={submitted ? idError : undefined}
          onChange={(event) => setValues((v) => ({ ...v, id: event.target.value }))}
        />
        <TextInput
          label={t("groups.field.name")}
          value={values.name ?? ""}
          disabled={busy}
          onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
        />
        <TextInput
          label={t("groups.field.type")}
          value={values.type ?? ""}
          disabled={busy}
          hint={t("groups.field.type.hint")}
          onChange={(event) => setValues((v) => ({ ...v, type: event.target.value }))}
        />

      </form>
    </Modal>
  );
}
