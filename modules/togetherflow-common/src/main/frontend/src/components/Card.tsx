/**
 * The panel every app re-invented (UI_POLISH_BACKLOG.md F2).
 *
 * `.tf-panel` was defined in `control.css` and `identity.css`, `.tf-card` in three of the
 * four stylesheets, and `.tf-detail` in Work — all the same idea with different padding.
 * One component, one class.
 *
 * `as` exists because a card is a container, not a landmark: a list of cards is
 * `<li>`s, a card that is the page's main region is a `<section>`, and a card that is
 * decorative is a `<div>`. Getting that wrong is a real accessibility cost, and it is
 * not a styling decision.
 */

import type { ElementType, ReactNode } from "react";

export interface CardProps {
  as?: ElementType;
  /** Rendered in the card's header row, before `actions`. */
  title?: ReactNode;
  /** Sub-title under the title — counts, ids, timestamps. */
  meta?: ReactNode;
  /** Right-aligned controls in the header row. */
  actions?: ReactNode;
  /** No padding on the body — for a card whose whole body is a table. */
  flush?: boolean;
  /** Fills its grid/flex track and scrolls its own body (B5). */
  fill?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Card({
  as: Element = "div",
  title,
  meta,
  actions,
  flush = false,
  fill = false,
  className,
  children,
}: CardProps) {
  return (
    <Element
      className={["tf-card", fill ? "tf-card--fill" : "", className].filter(Boolean).join(" ")}
    >
      {title || actions || meta ? (
        <div className="tf-card__header">
          <div className="tf-card__heading">
            {title ? <h2 className="tf-card__title">{title}</h2> : null}
            {meta ? <p className="tf-card__meta">{meta}</p> : null}
          </div>
          {actions ? <div className="tf-card__actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={flush ? "tf-card__body tf-card__body--flush" : "tf-card__body"}>
        {children}
      </div>
    </Element>
  );
}
