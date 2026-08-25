/**
 * The screen states every TogetherFlow view must handle (REQUIREMENTS.md §14.1):
 * loading, empty, zero-results, error, permission-denied.
 *
 * These exist as shared components specifically so a screen cannot quietly ship
 * with only the happy path — `AsyncBoundary` makes the states the default shape
 * of rendering a request rather than something each screen remembers to add.
 */

import type { ReactNode } from "react";
import { ApiError } from "../api/client";
import { useT } from "../i18n/I18nContext";
import { Button } from "./Button";

export function Skeleton({ rows = 5, label }: { rows?: number; label?: string }) {
  const t = useT();
  // role="status" does not take its accessible name from content, so label explicitly.
  return (
    <div
      className="tf-skeleton"
      role="status"
      aria-label={label ?? t("states.loading")}
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: rows }).map((_, index) => (
        <div className="tf-skeleton__row" key={index} />
      ))}
    </div>
  );
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="tf-state" role="status">
      {icon ? <div className="tf-state__icon">{icon}</div> : null}
      <h2 className="tf-state__title">{title}</h2>
      {description ? <p className="tf-state__description">{description}</p> : null}
      {action ? <div className="tf-state__action">{action}</div> : null}
    </div>
  );
}

/** Distinct from EmptyState: the user filtered to nothing, so offer to undo the filter. */
export function NoResultsState({ onClear }: { onClear?: () => void }) {
  const t = useT();
  return (
    <EmptyState
      title={t("states.noResults.title")}
      description={t("states.noResults.description")}
      action={
        onClear ? (
          <Button variant="secondary" onClick={onClear}>
            {t("states.noResults.clear")}
          </Button>
        ) : undefined
      }
    />
  );
}

export function PermissionDeniedState({ description }: { description?: string }) {
  const t = useT();
  return (
    <EmptyState
      title={t("states.permissionDenied.title")}
      description={description ?? t("states.permissionDenied.description")}
    />
  );
}

export interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const t = useT();
  const apiError = error instanceof ApiError ? error : undefined;
  const message =
    apiError?.message ??
    (error instanceof Error ? error.message : t("states.error.fallback"));

  return (
    <div className="tf-state tf-state--error" role="alert">
      <h2 className="tf-state__title">{t("states.error.title")}</h2>
      <p className="tf-state__description">{message}</p>
      {apiError ? (
        <p className="tf-state__meta">
          {t("states.error.reference")} <code>{apiError.correlationId}</code>
        </p>
      ) : null}
      {onRetry ? (
        <div className="tf-state__action">
          <Button onClick={onRetry}>{t("states.error.retry")}</Button>
        </div>
      ) : null}
    </div>
  );
}

export interface AsyncBoundaryProps<T> {
  loading: boolean;
  error: unknown;
  data: T | undefined;
  onRetry?: () => void;
  /** Rendered when the request succeeded but returned nothing at all. */
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  skeletonRows?: number;
  children: (data: T) => ReactNode;
}

export function AsyncBoundary<T>({
  loading,
  error,
  data,
  onRetry,
  empty,
  isEmpty,
  skeletonRows,
  children,
}: AsyncBoundaryProps<T>) {
  if (loading && data === undefined) {
    return <Skeleton rows={skeletonRows} />;
  }
  if (error) {
    if (error instanceof ApiError && error.isPermissionDenied) {
      return <PermissionDeniedState />;
    }
    return <ErrorState error={error} onRetry={onRetry} />;
  }
  if (data === undefined) {
    return <Skeleton rows={skeletonRows} />;
  }
  if (empty && isEmpty?.(data)) {
    return <>{empty}</>;
  }
  return <>{children(data)}</>;
}
