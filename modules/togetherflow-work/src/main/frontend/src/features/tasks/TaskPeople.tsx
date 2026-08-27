/**
 * The People tab (W2.2, ENTERPRISE_PARITY_PLAN E3).
 *
 * Adds and removes the involved users and candidates on a task. Before this the panel
 * listed identity links read-only, as raw ids, and offered no way to change them — so
 * "loop someone in" meant leaving Work.
 *
 * Search is against IDM where a deployment has it, and falls back to typing an id where it
 * does not. That fallback is not a courtesy: an assignee is often an id IDM has never heard
 * of — an expression's result, an external system's principal — and a picker that refused
 * those would be narrower than the engine.
 */

import { useState } from "react";
import {
  ApiError,
  Badge,
  Button,
  Icon,
  SelectInput,
  TextInput,
  UserChip,
  useAsync,
  useDebouncedValue,
  useI18n,
  useToast,
  userDisplayName,
  type IdmApi,
  type TaskApi,
  type TaskIdentityLink,
} from "@togetherflow/common";

/**
 * The link types the engine accepts here.
 *
 * `assignee` and `owner` are deliberately absent: they are single-valued fields on the
 * task, not identity links, and the engine keeps them in step with its own link rows.
 * Adding an `assignee` link would produce a second, contradictory source of truth.
 */
const LINK_TYPES = ["participant", "candidate"] as const;
type LinkType = (typeof LINK_TYPES)[number];

export interface TaskPeopleProps {
  taskApi: TaskApi;
  /** Absent where the deployment runs no IDM; the picker degrades to a plain id field. */
  idmApi?: IdmApi | null;
  taskId: string;
  links: TaskIdentityLink[];
  disabled?: boolean;
  onChanged: () => void;
}

export function TaskPeople({
  taskApi,
  idmApi,
  taskId,
  links,
  disabled = false,
  onChanged,
}: TaskPeopleProps) {
  const { t } = useI18n();
  const { push } = useToast();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"user" | "group">("user");
  const [type, setType] = useState<LinkType>("participant");
  const [busy, setBusy] = useState(false);
  const debounced = useDebouncedValue(search).trim();

  const matches = useAsync(
    async (signal) => {
      if (!idmApi || debounced.length < 2) return [];
      if (kind === "group") {
        const page = await idmApi.listGroups({ nameLike: `%${debounced}%`, size: 10 }, signal);
        return page.data.map((group) => ({ id: group.id, label: group.name || group.id }));
      }
      const page = await idmApi.listUsers({ id: debounced, size: 10 }, signal);
      return page.data.map((user) => ({ id: user.id, label: userDisplayName(user) }));
    },
    [idmApi, kind, debounced],
  );

  const run = async (message: string, action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      push({ tone: "success", message });
      onChanged();
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
  };

  const add = (id: string) => {
    if (!id.trim()) return;
    void run(t("task.people.added", { who: id }), async () => {
      // The POST body uses `userId`/`groupId`; the rows that come back use `user`/`group`.
      await taskApi.addIdentityLink(taskId, {
        ...(kind === "user" ? { userId: id.trim() } : { groupId: id.trim() }),
        type,
      });
      setSearch("");
    });
  };

  return (
    <div className="tf-people-tab">
      {links.length === 0 ? (
        <p className="tf-muted">{t("task.people.none")}</p>
      ) : (
        <ul className="tf-people">
          {links.map((link, index) => (
            <li className="tf-people__item" key={`${link.type}:${link.user ?? link.group}:${index}`}>
              <span className="tf-people__who">
                {link.user ? (
                  // D1: this was the raw id, on the screen whose subject is who is
                  // doing what.
                  <UserChip userId={link.user} />
                ) : (
                  <span className="tf-people__group">
                    <Icon name="groups" size={16} />
                    {link.group}
                  </span>
                )}
              </span>
              <Badge tone="neutral" subtle>
                {link.group ? t("task.people.group", { type: link.type }) : link.type}
              </Badge>
              {disabled ? null : (
                <Button
                  variant="ghost"
                  aria-label={t("task.people.remove", { who: link.user ?? link.group ?? "" })}
                  disabled={busy}
                  onClick={() =>
                    void run(t("task.people.removed", { who: link.user ?? link.group ?? "" }), () =>
                      taskApi.removeIdentityLink(
                        taskId,
                        link.user ? "users" : "groups",
                        (link.user ?? link.group) as string,
                        link.type,
                      ),
                    )
                  }
                >
                  <Icon name="close" size={16} />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {disabled ? null : (
        <div className="tf-people-tab__add">
          <SelectInput
            label={t("task.people.kind")}
            value={kind}
            onChange={(event) => setKind(event.target.value as "user" | "group")}
          >
            <option value="user">{t("task.people.kind.user")}</option>
            <option value="group">{t("task.people.kind.group")}</option>
          </SelectInput>
          <SelectInput
            label={t("task.people.type")}
            value={type}
            onChange={(event) => setType(event.target.value as LinkType)}
          >
            {LINK_TYPES.map((option) => (
              <option key={option} value={option}>
                {t(`task.people.type.${option}`)}
              </option>
            ))}
          </SelectInput>
          <TextInput
            label={t("task.people.search")}
            hint={idmApi ? t("task.people.search.hint") : t("task.people.search.hint.noIdm")}
            value={search}
            disabled={busy}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add(search);
              }
            }}
          />
          <Button variant="secondary" disabled={busy || !search.trim()} onClick={() => add(search)}>
            <Icon name="add" size={16} />
            {t("task.people.add")}
          </Button>

          {(matches.data ?? []).length > 0 ? (
            <ul className="tf-people-tab__matches">
              {(matches.data ?? []).map((match) => (
                <li key={match.id}>
                  <button type="button" className="tf-chip" onClick={() => add(match.id)}>
                    {match.label}
                    <span className="tf-muted">{match.id}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
