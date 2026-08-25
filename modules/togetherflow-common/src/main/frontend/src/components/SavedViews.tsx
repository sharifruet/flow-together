/**
 * The control surface for saved filters (§14.4) — one component, so Work's inbox and
 * Control's lists offer the same affordance rather than each inventing one (§14.3).
 */

import { useState } from "react";
import { useT } from "../i18n/I18nContext";
import { Button } from "./Button";
import type { SavedView } from "../views/savedViews";

export interface SavedViewsProps<T> {
  views: SavedView<T>[];
  /** The filter state a "Save" would capture. */
  current: T;
  onApply: (value: T) => void;
  onSave: (name: string, value: T) => void;
  onRemove: (id: string) => void;
  /** True when the current filters are worth offering to save. */
  canSave?: boolean;
}

export function SavedViews<T>({
  views,
  current,
  onApply,
  onSave,
  onRemove,
  canSave = true,
}: SavedViewsProps<T>) {
  const t = useT();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState("");

  const submit = () => {
    onSave(name, current);
    setName("");
    setNaming(false);
  };

  return (
    <div className="tf-saved-views">
      {views.length > 0 ? (
        <label className="tf-saved-views__pick">
          <span className="tf-visually-hidden">{t("savedViews.apply")}</span>
          <select
            className="tf-input tf-select"
            value={selected}
            onChange={(event) => {
              const id = event.target.value;
              setSelected(id);
              const view = views.find((candidate) => candidate.id === id);
              if (view) onApply(view.value);
            }}
          >
            <option value="">{t("savedViews.placeholder")}</option>
            {views.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {selected ? (
        <Button
          variant="secondary"
          onClick={() => {
            onRemove(selected);
            setSelected("");
          }}
        >
          {t("savedViews.delete")}
        </Button>
      ) : null}

      {naming ? (
        <span className="tf-saved-views__name">
          <label className="tf-visually-hidden" htmlFor="tf-saved-view-name">
            {t("savedViews.nameLabel")}
          </label>
          <input
            id="tf-saved-view-name"
            className="tf-input"
            value={name}
            autoFocus
            placeholder={t("savedViews.namePlaceholder")}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              } else if (event.key === "Escape") {
                setNaming(false);
              }
            }}
          />
          <Button onClick={submit} disabled={name.trim() === ""}>
            {t("savedViews.confirmSave")}
          </Button>
          <Button variant="secondary" onClick={() => setNaming(false)}>
            {t("dialog.cancel")}
          </Button>
        </span>
      ) : (
        <Button variant="secondary" disabled={!canSave} onClick={() => setNaming(true)}>
          {t("savedViews.save")}
        </Button>
      )}
    </div>
  );
}
