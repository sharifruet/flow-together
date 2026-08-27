/**
 * The menu bar every editor shares (W2.3, UI_POLISH_BACKLOG.md I8; absorbs E2 and E3).
 *
 * Flowable Design's editors share one menu bar — save, validate, undo/redo, export,
 * gridlines/snap, revisions — and ours had six bespoke button rows: BPMN and CMMN carried
 * undo/redo/zoom, DMN a subset, and Form, Event and App had no toolbar at all, so "save"
 * lived in a different place in each. That is the whole of I8.
 *
 * **Capability-shaped, not editor-shaped.** Every group is optional and appears only when
 * the editor passes a handler. A BPMN editor has undo, zoom and gridlines; a form builder
 * has none of the three and should not render three disabled buttons explaining that.
 * Absent is clearer than disabled when the capability does not exist at all — disabled
 * means "not now", and these mean "not here".
 */

import type { ReactNode } from "react";
import { Button, Icon, useI18n } from "@togetherflow/common";

export interface EditorMenuBarProps {
  /** Left-hand identity: back link, title and the save-state line. */
  title: string;
  /** "Unsaved changes" / "Saved at 14:02" — announced politely, not shouted. */
  status: string;
  onBack: () => void;

  /** Every editor saves. The one non-optional action. */
  onSave: () => void;
  saving?: boolean;
  /** Disabled until the editor is ready — a canvas that has not imported cannot serialise. */
  ready?: boolean;

  /** Cuts a version (§7.4.1). Absent where a model kind has no version history. */
  onSaveVersion?: () => void;

  /** Server- or browser-side validation, where the model kind has any. */
  onValidate?: () => void;
  validating?: boolean;

  undo?: { run: () => void; can: boolean };
  redo?: { run: () => void; can: boolean };

  zoom?: { in: () => void; out: () => void; fit: () => void };

  /** Gridlines and snapping, where the canvas has a grid at all. */
  grid?: { visible: boolean; toggle: () => void };
  snap?: { enabled: boolean; toggle: () => void };

  /** Export/view source. The label differs by kind, so the caller supplies it. */
  onExport?: () => void;
  exportLabel?: string;

  /** Version history panel. */
  onRevisions?: () => void;

  /** Deploy or publish — the primary action where the kind has one. */
  primary?: { label: string; run: () => void; busy?: boolean };

  /** Anything genuinely specific to one editor, rendered before the primary action. */
  extra?: ReactNode;
}

export function EditorMenuBar({
  title,
  status,
  onBack,
  onSave,
  saving = false,
  ready = true,
  onSaveVersion,
  onValidate,
  validating = false,
  undo,
  redo,
  zoom,
  grid,
  snap,
  onExport,
  exportLabel,
  onRevisions,
  primary,
  extra,
}: EditorMenuBarProps) {
  const { t } = useI18n();

  return (
    <header className="tf-editor__header">
      <div className="tf-editor__identity">
        <button type="button" className="tf-back" onClick={onBack}>
          <Icon name="chevron-left" size={14} />
          {t("editor.back")}
        </button>
        <h1 className="tf-editor__title">{title}</h1>
        {/* Polite, not assertive: an autosave notice must not interrupt what someone is
            typing into the properties panel. */}
        <p className="tf-editor__meta" aria-live="polite">
          {status}
        </p>
      </div>

      <div className="tf-editor__actions">
        {undo || redo ? (
          <div className="tf-editor__group" role="group" aria-label={t("editor.history")}>
            {undo ? (
              <Button
                variant="secondary"
                disabled={!undo.can}
                onClick={undo.run}
                aria-label={t("action.undo")}
              >
                <Icon name="refresh" size={16} className="tf-flip-x" />
              </Button>
            ) : null}
            {redo ? (
              <Button
                variant="secondary"
                disabled={!redo.can}
                onClick={redo.run}
                aria-label={t("action.redo")}
              >
                <Icon name="refresh" size={16} />
              </Button>
            ) : null}
          </div>
        ) : null}

        {zoom ? (
          <div className="tf-editor__group" role="group" aria-label={t("editor.zoom")}>
            <Button variant="secondary" onClick={zoom.out} aria-label={t("editor.zoomOut")}>
              −
            </Button>
            <Button variant="secondary" onClick={zoom.fit} aria-label={t("editor.zoomFit")}>
              {t("action.fit")}
            </Button>
            <Button variant="secondary" onClick={zoom.in} aria-label={t("editor.zoomIn")}>
              +
            </Button>
          </div>
        ) : null}

        {grid || snap ? (
          <div className="tf-editor__group" role="group" aria-label={t("editor.grid")}>
            {grid ? (
              // aria-pressed, not a checkbox: this is a toggle button, and a screen
              // reader should hear its state rather than infer it from the label.
              <Button
                variant="secondary"
                aria-pressed={grid.visible}
                onClick={grid.toggle}
                aria-label={t("editor.gridlines")}
              >
                <Icon name="models" size={16} />
              </Button>
            ) : null}
            {snap ? (
              <Button
                variant="secondary"
                aria-pressed={snap.enabled}
                onClick={snap.toggle}
                aria-label={t("editor.snap")}
              >
                <Icon name="add" size={16} />
              </Button>
            ) : null}
          </div>
        ) : null}

        {onExport ? (
          <Button variant="secondary" disabled={!ready} onClick={onExport}>
            <Icon name="download" size={16} />
            {exportLabel ?? t("editor.export")}
          </Button>
        ) : null}

        {onValidate ? (
          <Button variant="secondary" loading={validating} disabled={!ready} onClick={onValidate}>
            <Icon name="check" size={16} />
            {t("action.check")}
          </Button>
        ) : null}

        {onRevisions ? (
          <Button variant="secondary" onClick={onRevisions}>
            <Icon name="history" size={16} />
            {t("editor.revisions")}
          </Button>
        ) : null}

        {extra}

        <Button variant="secondary" loading={saving} disabled={!ready} onClick={onSave}>
          <Icon name="save" size={16} />
          {t("action.save")}
        </Button>

        {onSaveVersion ? (
          <Button variant="secondary" loading={saving} disabled={!ready} onClick={onSaveVersion}>
            {t("editor.saveVersion")}
          </Button>
        ) : null}

        {primary ? (
          <Button loading={primary.busy} disabled={!ready} onClick={primary.run}>
            {primary.label}
          </Button>
        ) : null}
      </div>
    </header>
  );
}
