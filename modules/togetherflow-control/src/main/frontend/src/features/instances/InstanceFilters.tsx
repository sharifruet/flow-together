/**
 * The filter bar Control's instance list was missing (W2.1, ENTERPRISE_PARITY_PLAN E2:
 * "Rich filters: date ranges, variable values, business key … saved as views").
 *
 * Every filter here is one the engine already supports and the UI simply never sent —
 * confirmed against `ProcessInstanceQueryRequest` in W2.1's discovery step, not assumed.
 *
 * **Variable filters are the interesting one.** They are a `POST /query` body, not query
 * parameters, so they have no natural URL form. Rather than drop them out of the URL —
 * which would make a variable-filtered list the one list that cannot be linked, defeating
 * F1 for exactly the query an operator most wants to paste into a ticket — they are
 * encoded compactly as `name:operation:value`, comma-separated. `encodeFilters` and
 * `decodeFilters` below are that codec, and they are tested against the values that
 * actually break it: colons, commas and tildes inside names and values.
 */

import {
  Button,
  Icon,
  SelectInput,
  TextInput,
  UNARY_VARIABLE_OPERATIONS,
  useI18n,
  type VariableFilter,
  type VariableOperation,
} from "@togetherflow/common";

const OPERATIONS: VariableOperation[] = [
  "equals",
  "notEquals",
  "like",
  "likeIgnoreCase",
  "greaterThan",
  "greaterThanOrEquals",
  "lessThan",
  "lessThanOrEquals",
  "exists",
  "notExists",
];

/**
 * Separates entries.
 *
 * A comma, specifically, and this is not arbitrary: the separator has to be a character
 * `encodeURIComponent` escapes, or a value containing it survives encoding intact and
 * splits the entry it belongs to. `~` was the first choice and is wrong — RFC 3986 lists
 * it as unreserved, so `encodeURIComponent` leaves it alone, and a URL like
 * `https://x.test/a~b` silently truncated to `https://x.test/a`. A comma becomes `%2C`.
 */
const ENTRY_SEPARATOR = ",";

/**
 * `name:operation:value`, entries joined by `~`.
 *
 * The value is encoded so a colon or a `~` inside it survives the round trip — a business
 * value like `10:30` or a URL is exactly the kind of thing people filter on.
 */
export function encodeFilters(filters: VariableFilter[]): string {
  return filters
    .filter((filter) => filter.name.trim() !== "")
    .map((filter) => {
      const unary = UNARY_VARIABLE_OPERATIONS.includes(filter.operation);
      const value = unary ? "" : encodeURIComponent(String(filter.value ?? ""));
      return `${encodeURIComponent(filter.name)}:${filter.operation}:${value}`;
    })
    .join(ENTRY_SEPARATOR);
}

export function decodeFilters(encoded: string | undefined): VariableFilter[] {
  if (!encoded) return [];
  return encoded
    .split(ENTRY_SEPARATOR)
    .map((entry): VariableFilter | null => {
      // Split on the first two colons only; the rest is the value.
      const first = entry.indexOf(":");
      const second = entry.indexOf(":", first + 1);
      if (first < 1 || second < 0) return null;
      const operation = entry.slice(first + 1, second) as VariableOperation;
      if (!OPERATIONS.includes(operation)) return null;
      const name = decodeURIComponent(entry.slice(0, first));
      if (!name) return null;
      return UNARY_VARIABLE_OPERATIONS.includes(operation)
        ? { name, operation }
        : { name, operation, value: decodeURIComponent(entry.slice(second + 1)) };
    })
    .filter((filter): filter is VariableFilter => filter !== null);
}

export interface InstanceFiltersProps {
  businessKey: string;
  startedAfter: string;
  startedBefore: string;
  variables: VariableFilter[];
  onChange: (patch: {
    businessKey?: string;
    startedAfter?: string;
    startedBefore?: string;
    variables?: VariableFilter[];
  }) => void;
}

export function InstanceFilters({
  businessKey,
  startedAfter,
  startedBefore,
  variables,
  onChange,
}: InstanceFiltersProps) {
  const { t } = useI18n();

  const setVariable = (index: number, patch: Partial<VariableFilter>) =>
    onChange({
      variables: variables.map((filter, i) => (i === index ? { ...filter, ...patch } : filter)),
    });

  return (
    <div className="tf-filter-bar">
      <div className="tf-filter-bar__field">
        <TextInput
          label={t("instances.filter.businessKey")}
          hint={t("instances.filter.businessKey.hint")}
          value={businessKey}
          onChange={(event) => onChange({ businessKey: event.target.value })}
        />
      </div>

      {/*
        `date` rather than `datetime-local`: the engine takes an instant, but an operator
        filtering "started this week" thinks in days, and a time control they have to fill
        in to get an answer is friction for precision nobody asked for. The day is widened
        to its bounds where the query is built.
      */}
      <div className="tf-filter-bar__field">
        <TextInput
          label={t("instances.filter.startedAfter")}
          type="date"
          value={startedAfter}
          onChange={(event) => onChange({ startedAfter: event.target.value })}
        />
      </div>
      <div className="tf-filter-bar__field">
        <TextInput
          label={t("instances.filter.startedBefore")}
          type="date"
          value={startedBefore}
          onChange={(event) => onChange({ startedBefore: event.target.value })}
        />
      </div>

      <div className="tf-filter-bar__variables">
        <span className="tf-filter-bar__label">{t("instances.filter.variables")}</span>
        {variables.length === 0 ? (
          <p className="tf-muted">{t("instances.filter.variables.none")}</p>
        ) : (
          <ul className="tf-variable-filters">
            {variables.map((filter, index) => {
              const unary = UNARY_VARIABLE_OPERATIONS.includes(filter.operation);
              return (
                <li className="tf-variable-filters__row" key={index}>
                  <TextInput
                    label={t("instances.filter.variable.name")}
                    hideLabel
                    placeholder={t("instances.filter.variable.name")}
                    value={filter.name}
                    onChange={(event) => setVariable(index, { name: event.target.value })}
                  />
                  <SelectInput
                    label={t("instances.filter.variable.operation")}
                    hideLabel
                    value={filter.operation}
                    onChange={(event) =>
                      setVariable(index, { operation: event.target.value as VariableOperation })
                    }
                  >
                    {OPERATIONS.map((operation) => (
                      <option key={operation} value={operation}>
                        {t(`instances.filter.operation.${operation}`)}
                      </option>
                    ))}
                  </SelectInput>
                  <TextInput
                    label={t("instances.filter.variable.value")}
                    hideLabel
                    placeholder={
                      unary ? t("instances.filter.variable.noValue") : t("instances.filter.variable.value")
                    }
                    // `exists`/`notExists` compare against nothing; an enabled box would
                    // invite a value that is then silently dropped.
                    disabled={unary}
                    value={unary ? "" : String(filter.value ?? "")}
                    onChange={(event) => setVariable(index, { value: event.target.value })}
                  />
                  <Button
                    variant="ghost"
                    aria-label={t("instances.filter.variable.remove", { name: filter.name })}
                    onClick={() =>
                      onChange({ variables: variables.filter((_, i) => i !== index) })
                    }
                  >
                    <Icon name="close" size={16} />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <Button
          variant="secondary"
          onClick={() =>
            onChange({ variables: [...variables, { name: "", operation: "equals", value: "" }] })
          }
        >
          <Icon name="add" size={16} />
          {t("instances.filter.variables.add")}
        </Button>
      </div>
    </div>
  );
}
