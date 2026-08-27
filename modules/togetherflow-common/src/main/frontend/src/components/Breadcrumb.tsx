/**
 * Where you are, and the way back (UI_POLISH_BACKLOG.md F2, B2).
 *
 * Only useful now that there is somewhere to point at: before W1.3 there were no URLs,
 * so a trail could only ever have been decorative. Each crumb but the last is a real
 * `<Link>`, so middle-click and copy-link work on it like any other navigation.
 */

import { Fragment } from "react";
import { Link } from "../routing/Link";
import { useT } from "../i18n/I18nContext";

export interface Crumb {
  label: string;
  /** Omitted on the last crumb, which is the current page. */
  to?: string;
}

export interface BreadcrumbProps {
  items: Crumb[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  const t = useT();
  if (items.length === 0) return null;

  return (
    <nav className="tf-breadcrumb" aria-label={t("breadcrumb.label")}>
      <ol className="tf-breadcrumb__list">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <Fragment key={`${item.label}-${index}`}>
              <li className="tf-breadcrumb__item">
                {item.to && !last ? (
                  <Link to={item.to} className="tf-breadcrumb__link">
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined}>{item.label}</span>
                )}
              </li>
              {last ? null : (
                <li className="tf-breadcrumb__separator" aria-hidden="true">
                  /
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
