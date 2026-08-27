/**
 * An anchor that navigates in-app, and gets out of the way when the browser should
 * handle the click instead (ADR 0016).
 *
 * The second half is the point. F1 asks for middle-click and copy-link-address to work
 * on nav items and rows; a router built on `onClick` alone breaks both, silently, and
 * looks correct in every test that only ever left-clicks.
 */

import { forwardRef, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { useHref, useNavigate } from "./RouterContext";

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: string;
  replace?: boolean;
  children: ReactNode;
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { to, replace, onClick, target, children, ...rest },
  ref,
) {
  const navigate = useNavigate();
  const href = useHref();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    // Everything below is the browser's job, not ours:
    //   button !== 0   middle-click (new tab) and right-click (context menu)
    //   any modifier   ⌘/ctrl-click (new tab), shift (new window), alt (download)
    //   target set     an explicit request for another browsing context
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (target && target !== "_self") return;
    event.preventDefault();
    navigate(to, { replace });
  };

  return (
    <a ref={ref} href={href(to)} target={target} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
});
