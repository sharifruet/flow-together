/**
 * The title / description / primary-action region every screen was missing
 * (UI_POLISH_BACKLOG.md B2).
 *
 * B2's evidence: `MyHistory.tsx` rendered its `<h1>` with the class `tf-start__title`,
 * copy-pasted from the Start screen. Screens opened straight into a toolbar, so nothing
 * told the user where they were or what the main action was.
 *
 * The `<h1>` lives here, which means exactly one per screen — before this, some screens
 * had none and some had two.
 */

import type { ReactNode } from "react";
import { Breadcrumb, type Crumb } from "./Breadcrumb";

export interface PageHeaderProps {
  title: ReactNode;
  /** One sentence on what this screen is for. Skip it where the title is self-evident. */
  description?: ReactNode;
  breadcrumbs?: Crumb[];
  /** Count, status badge, last-refreshed — rendered beside the title. */
  meta?: ReactNode;
  /** The screen's primary action, and any secondary ones, right-aligned. */
  actions?: ReactNode;
  /** Filter bar / tabs, rendered under the header and inside its bottom border. */
  children?: ReactNode;
  /** Renders the title for assistive tech only, where the design shows it elsewhere. */
  hideTitle?: boolean;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  meta,
  actions,
  children,
  hideTitle = false,
}: PageHeaderProps) {
  return (
    <header className="tf-page-header">
      {breadcrumbs?.length ? <Breadcrumb items={breadcrumbs} /> : null}
      <div className="tf-page-header__row">
        <div className="tf-page-header__heading">
          <div className="tf-page-header__title-row">
            <h1 className={hideTitle ? "tf-visually-hidden" : "tf-page-header__title"}>
              {title}
            </h1>
            {meta ? <div className="tf-page-header__meta">{meta}</div> : null}
          </div>
          {description ? <p className="tf-page-header__description">{description}</p> : null}
        </div>
        {actions ? <div className="tf-page-header__actions">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
