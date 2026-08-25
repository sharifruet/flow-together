/**
 * Crash recovery for the React tree (REQUIREMENTS.md §13.2).
 *
 * Without this, a single render throw unmounts the whole app and leaves a white page —
 * the failure mode a user cannot report usefully because there is nothing on screen to
 * describe. The boundary catches it, reports it with context, and offers a way back.
 *
 * `resetKey` lets a screen-level boundary recover when the user navigates: changing the
 * key clears the error, so a crash on one screen doesn't wedge the whole session.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { ApiError } from "../api/client";
import { reportInternal } from "../observability/errorReporting";
import { useT, type TFunction } from "../i18n/I18nContext";
import { Button } from "./Button";

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Names the boundary in the report — "app", "task-detail", "bpmn-editor". */
  boundary?: string;
  /** Changing this value clears a caught error, e.g. on navigation. */
  resetKey?: unknown;
  /** Replaces the default recovery screen where a screen wants its own. */
  fallback?: (error: unknown, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: unknown;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: undefined };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.error !== undefined && previous.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    reportInternal(error, "render", {
      action: this.props.boundary ? `render:${this.props.boundary}` : "render",
      componentStack: info.componentStack ?? undefined,
    });
  }

  reset = (): void => {
    this.setState({ error: undefined });
  };

  render(): ReactNode {
    if (this.state.error === undefined) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
    return <CrashScreen error={this.state.error} onReset={this.reset} />;
  }
}

function CrashScreen({ error, onReset }: { error: unknown; onReset: () => void }) {
  // A hook cannot live in the class above, and the copy still has to be translated.
  const t = useT();
  return <CrashScreenView t={t} error={error} onReset={onReset} />;
}

export function CrashScreenView({
  t,
  error,
  onReset,
}: {
  t: TFunction;
  error: unknown;
  onReset: () => void;
}) {
  const correlationId = error instanceof ApiError ? error.correlationId : undefined;

  return (
    <div className="tf-state tf-state--error" role="alert">
      <h2 className="tf-state__title">{t("errorBoundary.title")}</h2>
      <p className="tf-state__description">{t("errorBoundary.description")}</p>
      {correlationId ? (
        <p className="tf-state__meta">
          {t("errorBoundary.reference")} <code>{correlationId}</code>
        </p>
      ) : null}
      <div className="tf-state__action">
        <Button onClick={onReset}>{t("errorBoundary.retry")}</Button>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          {t("errorBoundary.reload")}
        </Button>
      </div>
    </div>
  );
}
