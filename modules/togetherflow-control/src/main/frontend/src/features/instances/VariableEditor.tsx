/**
 * Editing a running instance's variables (W2.1, ENTERPRISE_PARITY_PLAN E2).
 *
 * Control could read variables and not change them, which is half of what an operator
 * opens Control to do — a stuck instance is very often one variable away from moving.
 *
 * Two engine details shape this:
 *
 * - **Single-variable PUT, never the collection PUT.** The collection's PUT *replaces* the
 *   whole set, so editing one variable through it would silently delete every other
 *   variable that was not sent. `InstanceApi.setVariable` uses `/variables/{name}`.
 * - **Type is not inferred.** The engine stores a declared type, and sending a string where
 *   a `double` was expected changes the variable's type as a side effect of an edit — which
 *   then breaks the expressions reading it. So the type is an explicit control, defaulted
 *   from what is already stored, and the value is parsed against it before sending.
 */

import { useCallback, useMemo, useState } from "react";
import {
  ApiError,
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Icon,
  Modal,
  SelectInput,
  TextInput,
  displayValue,
  useI18n,
  useToast,
  type Column,
  type InstanceApi,
  type RestVariable,
} from "@togetherflow/common";

/** The scalar types the REST variable converter round-trips without a content URL. */
const EDITABLE_TYPES = ["string", "integer", "long", "double", "boolean", "date"] as const;
type EditableType = (typeof EDITABLE_TYPES)[number];

const isEditableType = (type: string | undefined): type is EditableType =>
  EDITABLE_TYPES.includes(type as EditableType);

export interface VariableEditorProps {
  instanceApi: InstanceApi;
  instanceId: string;
  variables: RestVariable[];
  /** Hides every mutating control — see `Instances`' read-only note (§13.1). */
  readOnly?: boolean;
  onChanged: () => void;
}

interface Draft {
  /** Absent when adding; present when editing, and then the name is fixed. */
  original?: RestVariable;
  name: string;
  type: EditableType;
  value: string;
}

export function VariableEditor({
  instanceApi,
  instanceId,
  variables,
  readOnly = false,
  onChanged,
}: VariableEditorProps) {
  const { t } = useI18n();
  const { push } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RestVariable | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (message: string, action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await action();
        push({ tone: "success", message });
        onChanged();
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
    [push, onChanged, t],
  );

  const save = useCallback(async () => {
    if (!draft) return;
    const parsed = parseValue(draft.value, draft.type);
    if (parsed.error) {
      setError(t(parsed.error));
      return;
    }
    if (!draft.original && !draft.name.trim()) {
      setError(t("variables.nameRequired"));
      return;
    }
    setError(null);

    const variable: RestVariable = {
      name: draft.original?.name ?? draft.name.trim(),
      type: draft.type,
      value: parsed.value,
    };

    // PUT create-or-updates on this resource, so one call covers both — but a new name
    // that collides is a mistake worth catching before it silently overwrites.
    if (!draft.original && variables.some((existing) => existing.name === variable.name)) {
      setError(t("variables.duplicate", { name: variable.name }));
      return;
    }
    const ok = await run(t("variables.saved", { name: variable.name }), () =>
      instanceApi.setVariable(instanceId, variable),
    );
    if (ok) setDraft(null);
  }, [draft, variables, run, instanceApi, instanceId, t]);

  const columns = useMemo<Column<RestVariable>[]>(
    () => [
      {
        key: "name",
        header: t("variables.column.name"),
        required: true,
        render: (variable) => <span className="tf-mono">{variable.name}</span>,
      },
      {
        key: "type",
        header: t("variables.column.type"),
        width: "110px",
        render: (variable) => (
          <Badge tone="neutral" subtle>
            {variable.type ?? "string"}
          </Badge>
        ),
      },
      {
        key: "value",
        header: t("variables.column.value"),
        render: (variable) =>
          variable.valueUrl ? (
            // Binary and serializable variables are a content URL, not a value; offering
            // an edit box over one would produce a string where bytes were.
            <span className="tf-muted">{t("variables.binary")}</span>
          ) : (
            <span className="tf-mono">{displayValue(variable)}</span>
          ),
      },
    ],
    [t],
  );

  return (
    <div className="tf-variables">
      <div className="tf-toolbar">
        <h3 className="tf-panel__section-title">{t("variables.title")}</h3>
        {readOnly ? null : (
          <div className="tf-toolbar__actions">
            <Button
              variant="secondary"
              onClick={() => {
                setError(null);
                setDraft({ name: "", type: "string", value: "" });
              }}
            >
              <Icon name="add" size={16} />
              {t("variables.add")}
            </Button>
          </div>
        )}
      </div>

      <DataTable
        caption={t("variables.caption")}
        columns={columns}
        rows={variables}
        rowKey={(variable) => variable.name}
        empty={<p className="tf-muted tf-variables__empty">{t("variables.empty")}</p>}
        rowActions={
          readOnly
            ? undefined
            : (variable) =>
                variable.valueUrl
                  ? []
                  : [
                      {
                        id: "edit",
                        label: t("action.edit"),
                        icon: <Icon name="edit" size={16} />,
                        onSelect: () => {
                          setError(null);
                          setDraft({
                            original: variable,
                            name: variable.name,
                            type: isEditableType(variable.type) ? variable.type : "string",
                            value: variable.value === undefined || variable.value === null
                              ? ""
                              : String(variable.value),
                          });
                        },
                      },
                      {
                        id: "delete",
                        label: t("action.delete"),
                        icon: <Icon name="trash" size={16} />,
                        destructive: true,
                        onSelect: () => setPendingDelete(variable),
                      },
                    ]
        }
      />

      {draft ? (
        <Modal
          open
          size="sm"
          title={draft.original ? t("variables.edit.title", { name: draft.original.name }) : t("variables.add.title")}
          dismissOnBackdrop={false}
          onClose={() => setDraft(null)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setDraft(null)} disabled={busy}>
                {t("dialog.cancel")}
              </Button>
              <Button onClick={() => void save()} loading={busy}>
                {t("action.save")}
              </Button>
            </>
          }
        >
          {draft.original ? null : (
            <TextInput
              label={t("variables.column.name")}
              value={draft.name}
              required
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          )}
          <SelectInput
            label={t("variables.column.type")}
            hint={t("variables.type.hint")}
            value={draft.type}
            onChange={(event) => setDraft({ ...draft, type: event.target.value as EditableType })}
          >
            {EDITABLE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </SelectInput>
          <TextInput
            label={t("variables.column.value")}
            value={draft.value}
            error={error ?? undefined}
            hint={draft.type === "date" ? t("variables.date.hint") : undefined}
            onChange={(event) => setDraft({ ...draft, value: event.target.value })}
          />
        </Modal>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("variables.delete.title")}
        description={t("variables.delete.description", { name: pendingDelete?.name ?? "" })}
        destructive
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const name = pendingDelete?.name;
          setPendingDelete(null);
          if (name) {
            void run(t("variables.deleted", { name }), () =>
              instanceApi.deleteVariable(instanceId, name),
            );
          }
        }}
      />
    </div>
  );
}

/**
 * Parses the typed-in value against the declared type.
 *
 * Returns a message key rather than a message: this is called from a component that has a
 * translator, and returning English here would be the one untranslated string on the screen.
 */
export function parseValue(
  raw: string,
  type: EditableType,
): { value: unknown; error?: string } {
  const trimmed = raw.trim();
  switch (type) {
    case "integer":
    case "long": {
      if (!/^-?\d+$/.test(trimmed)) return { value: null, error: "variables.invalid.integer" };
      return { value: Number(trimmed) };
    }
    case "double": {
      const parsed = Number(trimmed);
      if (trimmed === "" || Number.isNaN(parsed)) {
        return { value: null, error: "variables.invalid.number" };
      }
      return { value: parsed };
    }
    case "boolean": {
      const lowered = trimmed.toLowerCase();
      if (lowered !== "true" && lowered !== "false") {
        return { value: null, error: "variables.invalid.boolean" };
      }
      return { value: lowered === "true" };
    }
    case "date": {
      // The engine expects ISO-8601; anything Date can read is normalised to it rather
      // than sent through and rejected server-side.
      const parsed = new Date(trimmed);
      if (trimmed === "" || Number.isNaN(parsed.getTime())) {
        return { value: null, error: "variables.invalid.date" };
      }
      return { value: parsed.toISOString() };
    }
    default:
      return { value: raw };
  }
}
