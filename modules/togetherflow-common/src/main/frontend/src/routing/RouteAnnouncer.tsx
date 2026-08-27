/**
 * Tells assistive technology that the screen changed, and puts the keyboard somewhere
 * useful when it does.
 *
 * A single-page app navigates without the page load a browser would otherwise announce,
 * so a screen-reader user gets no signal that anything happened and a keyboard user is
 * left with focus on a nav item that no longer reflects where they are. A router library
 * would have settled this; ADR 0016 chose to own the router, which means owning this too
 * rather than assuming it.
 *
 * Skipped on the first render: the initial screen is the page load, which the browser
 * already announced.
 */

import { useEffect, useRef, useState } from "react";
import { useLocation } from "./RouterContext";

export interface RouteAnnouncerProps {
  /** What to say — usually the new screen's title. */
  title: string;
  /** Id of the element to move focus to. Defaults to the shell's main region. */
  focusTargetId?: string;
}

export function RouteAnnouncer({ title, focusTargetId = "tf-main" }: RouteAnnouncerProps) {
  const { path } = useLocation();
  const [message, setMessage] = useState("");
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (previous.current === null) {
      previous.current = path;
      return;
    }
    if (previous.current === path) return;
    previous.current = path;

    setMessage(title);
    const target = document.getElementById(focusTargetId);
    if (target) {
      // -1 rather than 0: the main region should be focusable *programmatically* here
      // without joining the tab order, where it would be a stop with nothing to do.
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }
  }, [path, title, focusTargetId]);

  return (
    <div className="tf-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
