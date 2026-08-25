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
  type IdmGroup,
  type IdmUser,
} from "@togetherflow/common";

const PAGE_SIZE = 25;

export interface GroupsProps {
  idm: IdmApi;
  readOnly: boolean;
}

export function Groups({ idm, readOnly }: GroupsProps) {
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

  const columns = useMemo<Column<IdmGroup>[]>(
    () => [
      {
        key: "name",
        header: "Group",
        render: (group) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{group.name || group.id}</span>
            <span className="tf-task-cell__description">{group.id}</span>
          </div>
        ),
      },
      {
        key: "type",
        header: "Type",
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
              Members
            </Button>
            {!readOnly ? (
              <>
                <Button variant="ghost" onClick={() => setEditing(group)}>
                  Edit
                </Button>
                <Button variant="ghost" onClick={() => setPendingDelete(group)}>
                  Delete
                </Button>
              </>
            ) : null}
          </div>
        ),
      },
    ],
    [readOnly],
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
    <section className="tf-panel" aria-label="Groups">
      <header className="tf-panel__header">
        <div>
          <h1 className="tf-panel__title">Groups</h1>
          <p className="tf-panel__meta">
            {readOnly
              ? "Groups come from a directory and can't be changed here."
              : "Groups collect users so work and privileges can be assigned in bulk."}
          </p>
        </div>
        {!readOnly ? <Button onClick={() => setCreating(true)}>New group</Button> : null}
      </header>

      <div className="tf-panel__search">
        <label className="tf-visually-hidden" htmlFor="tf-group-search">
          Search groups by name
        </label>
        <input
          id="tf-group-search"
          className="tf-input"
          type="search"
          placeholder="Search groups…"
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
              title="No groups yet"
              description={
                readOnly
                  ? "No groups were returned by the directory."
                  : "Create a group to assign work to a team rather than an individual."
              }
              action={
                !readOnly ? <Button onClick={() => setCreating(true)}>New group</Button> : undefined
              }
            />
          )
        }
      >
        {(page) => (
          <>
            <DataTable
              caption="Groups"
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
          title="New group"
          busy={busy}
          onCancel={() => setCreating(false)}
          onSubmit={async (values) => {
            const ok = await run(`Group "${values.id}" created.`, () => idm.createGroup(values));
            if (ok) setCreating(false);
          }}
        />
      ) : null}

      {editing ? (
        <GroupDialog
          title={`Edit ${editing.name || editing.id}`}
          group={editing}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSubmit={async (values) => {
            const ok = await run(`Group "${editing.id}" updated.`, () =>
              idm.updateGroup(editing.id, { name: values.name, type: values.type }),
            );
            if (ok) setEditing(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this group?"
        description={`"${pendingDelete?.name || pendingDelete?.id || ""}" will be removed. Anyone relying on it for task assignment or privileges loses that access. This can't be undone.`}
        confirmLabel="Delete group"
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
          message: apiError?.message ?? "That action could not be completed.",
          reference: apiError?.correlationId,
        });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [push],
  );

  const columns = useMemo<Column<IdmUser>[]>(
    () => [
      {
        key: "user",
        header: "Member",
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
                Remove
              </Button>
            </div>
          ),
      },
    ],
    [readOnly],
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
            label="Add a member"
            placeholder="User id"
            value={newMember}
            disabled={busy}
            onChange={(event) => setNewMember(event.target.value)}
          />
          <Button type="submit" loading={busy} disabled={!newMember.trim()}>
            Add
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
            title="No members"
            description={
              readOnly
                ? "This group has no members in the directory."
                : "Add a user by id to make them a member of this group."
            }
          />
        }
      >
        {(page) => (
          <DataTable
            caption={`Members of ${group.id}`}
            columns={columns}
            rows={page.data}
            rowKey={(user) => user.id}
          />
        )}
      </AsyncBoundary>

      <ConfirmDialog
        open={pendingRemove !== null}
        title="Remove this member?"
        description={`"${pendingRemove ? userDisplayName(pendingRemove) : ""}" will no longer be a member of "${group.name || group.id}", and loses any access that membership granted.`}
        confirmLabel="Remove member"
        destructive
        busy={busy}
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => {
          const target = pendingRemove;
          setPendingRemove(null);
          if (target) {
            void run(`"${target.id}" removed from ${group.id}.`, () =>
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

function GroupDialog({ title, group, busy, onCancel, onSubmit }: GroupDialogProps) {
  const isEdit = Boolean(group);
  const [values, setValues] = useState<IdmGroup>({
    id: group?.id ?? "",
    name: group?.name ?? "",
    type: group?.type ?? "",
  });
  const [submitted, setSubmitted] = useState(false);
  const idError = !values.id.trim() ? "A group id is required." : undefined;

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
          if (!idError) onSubmit(values);
        }}
      >
        <h2 className="tf-dialog__title">{title}</h2>

        <TextInput
          label="Group id"
          value={values.id}
          required
          disabled={isEdit || busy}
          hint={isEdit ? "A group's id can't be changed." : "Referenced by process models."}
          error={submitted ? idError : undefined}
          onChange={(event) => setValues((v) => ({ ...v, id: event.target.value }))}
        />
        <TextInput
          label="Name"
          value={values.name ?? ""}
          disabled={busy}
          onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
        />
        <TextInput
          label="Type"
          value={values.type ?? ""}
          disabled={busy}
          hint="Free-form, e.g. 'assignment' or 'security-role'."
          onChange={(event) => setValues((v) => ({ ...v, type: event.target.value }))}
        />

        <div className="tf-dialog__actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {isEdit ? "Save changes" : "Create group"}
          </Button>
        </div>
      </form>
    </div>
  );
}
