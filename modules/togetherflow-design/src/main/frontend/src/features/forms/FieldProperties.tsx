/**
 * The field properties panel (W2.3, UI_POLISH_BACKLOG.md I2/I3).
 *
 * I2's finding: "the renderer reads nine `params` constraints plus `layout.colspan` and
 * the properties panel sets none of them." So a form could *validate* a length, a range,
 * a regex or an upload's accepted types — and no one could author any of it without
 * hand-editing JSON.
 *
 * Every control here maps to something `fieldConstraints` in `togetherflow-common`
 * already reads. Nothing is offered that the renderer would ignore, which is the rule
 * that keeps the two halves honest: a builder that writes params nothing honours is worse
 * than one that writes none, because it looks like it worked.
 */

import { useState } from "react";
import {
  Button,
  SelectInput,
  TextAreaInput,
  TextInput,
  fieldLocales,
  useI18n,
  withFieldLabel,
  type FormField,
} from "@togetherflow/common";
import { isNumericType, isPresentational, isTextualType } from "./formDraft";

/** The twelve-slot row grid Flowable Design uses; `layout.colspan` is what the renderer reads. */
export const COLSPANS = [12, 6, 4, 3] as const;

export interface FieldPropertiesProps {
  field: FormField;
  disabled?: boolean;
  onChange: (patch: Partial<FormField>) => void;
}

export function FieldProperties({ field, disabled = false, onChange }: FieldPropertiesProps) {
  const { t } = useI18n();
  const params = (field.params ?? {}) as Record<string, unknown>;

  /**
   * Writes one param, removing the key when the value is cleared.
   *
   * Removing rather than storing an empty string matters: `numberParam` treats an empty
   * value as absent but `stringParam` does not, so a cleared pattern left as `""` would
   * compile to a regex matching everything and silently pass every value.
   */
  const setParam = (key: string, value: string | number | undefined) => {
    const next = { ...params };
    if (value === undefined || value === "") delete next[key];
    else next[key] = value;
    onChange({ params: Object.keys(next).length > 0 ? next : undefined });
  };

  const numberParam = (key: string) => {
    const raw = params[key];
    return raw === undefined || raw === null ? "" : String(raw);
  };
  const textParam = (key: string) => String(params[key] ?? "");

  const colspan = field.layout?.colspan ?? 12;

  return (
    <>
      {/* Layout applies to every field, presentational ones included — a divider spanning
          a third of the row is a legitimate thing to want. */}
      <SelectInput
        label={t("form.field.width")}
        hint={t("form.field.width.hint")}
        value={colspan}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange({
            // Full width is the default; storing it would be noise in every field.
            layout: next === 12 ? undefined : { ...field.layout, colspan: next },
          });
        }}
      >
        {COLSPANS.map((span) => (
          <option key={span} value={span}>
            {t(`form.field.width.${span}`)}
          </option>
        ))}
      </SelectInput>

      {isPresentational(field.type) ? null : (
        <TextAreaInput
          label={t("form.field.hint")}
          hint={t("form.field.hint.hint")}
          rows={2}
          value={textParam("description")}
          disabled={disabled}
          onChange={(event) => setParam("description", event.target.value)}
        />
      )}

      {isTextualType(field.type) ? (
        <>
          <TextInput
            label={t("form.field.minLength")}
            type="number"
            min={0}
            value={numberParam("minLength")}
            disabled={disabled}
            onChange={(event) =>
              setParam("minLength", event.target.value === "" ? undefined : Number(event.target.value))
            }
          />
          <TextInput
            label={t("form.field.maxLength")}
            type="number"
            min={0}
            value={numberParam("maxLength")}
            disabled={disabled}
            onChange={(event) =>
              setParam("maxLength", event.target.value === "" ? undefined : Number(event.target.value))
            }
          />
          <TextInput
            label={t("form.field.pattern")}
            hint={t("form.field.pattern.hint")}
            value={textParam("pattern")}
            disabled={disabled}
            onChange={(event) => setParam("pattern", event.target.value)}
          />
          {textParam("pattern") ? (
            <TextInput
              label={t("form.field.patternMessage")}
              hint={t("form.field.patternMessage.hint")}
              value={textParam("patternMessage")}
              disabled={disabled}
              onChange={(event) => setParam("patternMessage", event.target.value)}
            />
          ) : null}
        </>
      ) : null}

      {isNumericType(field.type) ? (
        <>
          <TextInput
            label={t("form.field.min")}
            type="number"
            value={numberParam("min")}
            disabled={disabled}
            onChange={(event) =>
              setParam("min", event.target.value === "" ? undefined : Number(event.target.value))
            }
          />
          <TextInput
            label={t("form.field.max")}
            type="number"
            value={numberParam("max")}
            disabled={disabled}
            onChange={(event) =>
              setParam("max", event.target.value === "" ? undefined : Number(event.target.value))
            }
          />
        </>
      ) : null}

      {field.type === "upload" ? (
        <>
          <TextInput
            label={t("form.field.accept")}
            hint={t("form.field.accept.hint")}
            value={textParam("accept")}
            disabled={disabled}
            onChange={(event) => setParam("accept", event.target.value)}
          />
          <TextInput
            label={t("form.field.maxFileSize")}
            hint={t("form.field.maxFileSize.hint")}
            type="number"
            min={0}
            value={numberParam("maxFileSize")}
            disabled={disabled}
            onChange={(event) =>
              setParam("maxFileSize", event.target.value === "" ? undefined : Number(event.target.value))
            }
          />
        </>
      ) : null}

      {/*
        Conditional visibility (ADR 0012). It is a `params` convention rather than an
        engine feature, and the renderer reads it — so the builder should write it.
      */}
      {isPresentational(field.type) ? null : (
        <TextInput
          label={t("form.field.visibleWhen")}
          hint={t("form.field.visibleWhen.hint")}
          value={textParam("tfVisibleWhen")}
          disabled={disabled}
          onChange={(event) => setParam("tfVisibleWhen", event.target.value)}
        />
      )}

      {isPresentational(field.type) && field.type !== "headline" ? null : (
        <LabelTranslations field={field} disabled={disabled} onChange={onChange} />
      )}
    </>
  );
}

/**
 * Per-model label translations (W3.3).
 *
 * ADR 0013's layer translates the UI; a form authored in English stayed English for every
 * reader. The field's own name remains the source and the fallback — an untranslated
 * field reads as it was written, never as a key or a blank — so adding a language is
 * additive and removing one is safe.
 */
function LabelTranslations({
  field,
  disabled,
  onChange,
}: {
  field: FormField;
  disabled: boolean;
  onChange: (changes: Partial<FormField>) => void;
}) {
  const { t } = useI18n();
  const [locale, setLocale] = useState("");
  const locales = fieldLocales(field);

  const set = (target: string, label: string) => {
    const next = withFieldLabel(field, target, label);
    onChange({ params: next.params });
  };

  return (
    <section className="tf-properties__section">
      <h3 className="tf-properties__section-title">{t("form.field.translations")}</h3>
      <p className="tf-muted">{t("form.field.translations.hint")}</p>

      {locales.map((code) => (
        <TextInput
          key={code}
          label={t("form.field.translation", { locale: code })}
          value={String(
            ((field.params?.tfLabels ?? {}) as Record<string, string>)[code] ?? "",
          )}
          disabled={disabled}
          // Cleared, the locale goes rather than lingering as an empty override that
          // would render a blank label.
          onChange={(event) => set(code, event.target.value)}
        />
      ))}

      <div className="tf-inline-form">
        <TextInput
          label={t("form.field.translation.add")}
          hint={t("form.field.translation.add.hint")}
          value={locale}
          disabled={disabled}
          onChange={(event) => setLocale(event.target.value)}
        />
        <Button
          variant="secondary"
          disabled={disabled || locale.trim() === "" || locales.includes(locale.trim())}
          onClick={() => {
            // Seeded with the source text, so the translator edits rather than retypes.
            set(locale.trim(), field.name || field.id);
            setLocale("");
          }}
        >
          {t("action.add")}
        </Button>
      </div>
    </section>
  );
}
