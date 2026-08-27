/**
 * Router behaviour (ADR 0016, UI_POLISH_BACKLOG.md F1).
 *
 * F1's acceptance is about what a *user* can do — deep-link, refresh, middle-click, press
 * Back — so these test that rather than the internals. The click-modifier cases matter
 * most: they are the half of routing that breaks silently and looks fine in any test
 * that only ever left-clicks.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Link } from "./Link";
import { RouteAnnouncer } from "./RouteAnnouncer";
import {
  RouterProvider,
  normalisePath,
  useLocation,
  useNavigate,
  useNavigationBlock,
} from "./RouterContext";
import { buildPath, matchPath, withQuery } from "./matchPath";
import { useQueryState } from "./useQueryState";
import { useRoute, type RouteDefinition } from "./useRoute";

function go(url: string) {
  window.history.replaceState({}, "", url);
}

beforeEach(() => go("/"));

describe("matchPath", () => {
  it("captures named segments", () => {
    expect(matchPath("/tasks/:taskId", "/tasks/t-1")).toEqual({ taskId: "t-1" });
    expect(matchPath("/inbox", "/inbox")).toEqual({});
  });

  it("returns null rather than an empty match, so a miss is distinguishable", () => {
    expect(matchPath("/inbox", "/history")).toBeNull();
    expect(matchPath("/tasks/:taskId", "/tasks")).toBeNull();
    expect(matchPath("/tasks", "/tasks/t-1")).toBeNull();
  });

  it("does not let an empty segment fill a parameter", () => {
    // "/tasks/" normalises to "/tasks", which is the list — not a task with an empty id.
    expect(matchPath("/tasks/:taskId", "/tasks/")).toBeNull();
  });

  it("decodes captured values, because engine ids are opaque", () => {
    expect(matchPath("/models/:id", "/models/a%2Fb")).toEqual({ id: "a/b" });
  });

  it("round-trips through buildPath", () => {
    const path = buildPath("/models/:id", { id: "a/b" });
    expect(path).toBe("/models/a%2Fb");
    expect(matchPath("/models/:id", path)).toEqual({ id: "a/b" });
  });

  it("refuses to build a path with a missing parameter", () => {
    expect(() => buildPath("/tasks/:taskId", {})).toThrow(/no value for ":taskId"/);
  });
});

describe("withQuery", () => {
  it("drops empty values so a cleared filter leaves the URL", () => {
    expect(withQuery("/inbox", { q: "", page: 2, open: false })).toBe("/inbox?page=2&open=false");
    expect(withQuery("/inbox", { q: undefined })).toBe("/inbox");
  });
});

describe("normalisePath", () => {
  it("collapses the shapes a hand-written href arrives in", () => {
    expect(normalisePath("")).toBe("/");
    expect(normalisePath("/")).toBe("/");
    expect(normalisePath("/inbox/")).toBe("/inbox");
    expect(normalisePath("inbox")).toBe("/inbox");
    expect(normalisePath("//a//b/")).toBe("/a/b");
  });
});

const ROUTES: RouteDefinition<"inbox" | "task" | "history">[] = [
  { id: "task", pattern: "/inbox/:taskId" },
  { id: "inbox", pattern: "/inbox" },
  { id: "history", pattern: "/history" },
];

function Screen() {
  const route = useRoute(ROUTES, "inbox");
  const navigate = useNavigate();
  return (
    <div>
      <p data-testid="route">{route.id}</p>
      <p data-testid="param">{route.params.taskId ?? "-"}</p>
      <p data-testid="fallback">{String(route.fallback)}</p>
      <Link to="/inbox/t-9">Open t-9</Link>
      <button type="button" onClick={() => navigate("/history")}>
        History
      </button>
    </div>
  );
}

describe("routing", () => {
  it("resolves the screen from the URL, so a deep link survives a refresh", () => {
    go("/inbox/t-1");
    render(
      <RouterProvider>
        <Screen />
      </RouterProvider>,
    );
    expect(screen.getByTestId("route")).toHaveTextContent("task");
    expect(screen.getByTestId("param")).toHaveTextContent("t-1");
    expect(screen.getByTestId("fallback")).toHaveTextContent("false");
  });

  it("falls back to the app's default when nothing matches", () => {
    go("/nonsense");
    render(
      <RouterProvider>
        <Screen />
      </RouterProvider>,
    );
    expect(screen.getByTestId("route")).toHaveTextContent("inbox");
    expect(screen.getByTestId("fallback")).toHaveTextContent("true");
  });

  it("navigates on a plain left-click and changes the address", () => {
    go("/inbox");
    render(
      <RouterProvider>
        <Screen />
      </RouterProvider>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Open t-9" }), { button: 0 });
    expect(window.location.pathname).toBe("/inbox/t-9");
    expect(screen.getByTestId("route")).toHaveTextContent("task");
  });

  it("renders a real href, so copy-link-address works", () => {
    render(
      <RouterProvider>
        <Screen />
      </RouterProvider>,
    );
    expect(screen.getByRole("link", { name: "Open t-9" })).toHaveAttribute("href", "/inbox/t-9");
  });

  it.each([
    ["meta (⌘-click, new tab)", { metaKey: true }],
    ["ctrl (new tab)", { ctrlKey: true }],
    ["shift (new window)", { shiftKey: true }],
    ["alt (download)", { altKey: true }],
    ["middle-click", { button: 1 }],
  ])("leaves %s to the browser", (_label, modifier) => {
    go("/inbox");
    render(
      <RouterProvider>
        <Screen />
      </RouterProvider>,
    );
    /*
     * Because the router does *not* intercept these, the click reaches the anchor's
     * default action — and jsdom then tries to follow the href and logs "Not implemented:
     * navigation". Cancel it at the body, which is outside React's root container and so
     * runs after the router has already had its chance to preventDefault.
     */
    const swallow = (event: Event) => event.preventDefault();
    document.body.addEventListener("click", swallow);
    fireEvent.click(screen.getByRole("link", { name: "Open t-9" }), { button: 0, ...modifier });
    document.body.removeEventListener("click", swallow);

    // Not intercepted: the app did not navigate, so the browser's own behaviour applies.
    expect(window.location.pathname).toBe("/inbox");
    expect(screen.getByTestId("route")).toHaveTextContent("inbox");
  });

  it("responds to Back, so Back closes a detail pane rather than leaving the app", () => {
    go("/inbox");
    render(
      <RouterProvider>
        <Screen />
      </RouterProvider>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Open t-9" }), { button: 0 });
    expect(screen.getByTestId("route")).toHaveTextContent("task");

    act(() => {
      window.history.replaceState({}, "", "/inbox");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByTestId("route")).toHaveTextContent("inbox");
  });

  it("does not stack a duplicate entry for the URL already shown", () => {
    go("/inbox");
    const push = vi.spyOn(window.history, "pushState");
    render(
      <RouterProvider>
        <Screen />
      </RouterProvider>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Open t-9" }), { button: 0 });
    fireEvent.click(screen.getByRole("link", { name: "Open t-9" }), { button: 0 });
    expect(push).toHaveBeenCalledTimes(1);
    push.mockRestore();
  });
});

describe("basePath", () => {
  it("strips the context path the app is served under", () => {
    go("/design-ui/inbox/t-1");
    render(
      <RouterProvider basePath="/design-ui">
        <Screen />
      </RouterProvider>,
    );
    expect(screen.getByTestId("route")).toHaveTextContent("task");
    expect(screen.getByTestId("param")).toHaveTextContent("t-1");
  });

  it("puts it back on the hrefs it renders", () => {
    go("/design-ui/inbox");
    render(
      <RouterProvider basePath="/design-ui">
        <Screen />
      </RouterProvider>,
    );
    expect(screen.getByRole("link", { name: "Open t-9" })).toHaveAttribute(
      "href",
      "/design-ui/inbox/t-9",
    );
    fireEvent.click(screen.getByRole("link", { name: "Open t-9" }), { button: 0 });
    expect(window.location.pathname).toBe("/design-ui/inbox/t-9");
  });
});

function Filters() {
  const { get, getNumber, setQuery } = useQueryState();
  return (
    <div>
      <p data-testid="q">{get("q", "-")}</p>
      <p data-testid="page">{getNumber("page", 0)}</p>
      <button type="button" onClick={() => setQuery({ q: "invoice" })}>
        Filter
      </button>
      <button type="button" onClick={() => setQuery({ q: "" })}>
        Clear
      </button>
    </div>
  );
}

describe("useQueryState", () => {
  it("reads filters out of the query string", () => {
    go("/inbox?q=invoice&page=2");
    render(
      <RouterProvider>
        <Filters />
      </RouterProvider>,
    );
    expect(screen.getByTestId("q")).toHaveTextContent("invoice");
    expect(screen.getByTestId("page")).toHaveTextContent("2");
  });

  it("replaces rather than pushes, so Back is not an undo buffer for a filter box", () => {
    go("/inbox");
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");
    render(
      <RouterProvider>
        <Filters />
      </RouterProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    expect(window.location.search).toBe("?q=invoice");
    expect(push).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalled();
    push.mockRestore();
    replace.mockRestore();
  });

  it("removes a cleared filter from the URL entirely", () => {
    go("/inbox?q=invoice");
    render(
      <RouterProvider>
        <Filters />
      </RouterProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(window.location.search).toBe("");
  });
});

function Guarded({ onAsk }: { onAsk: () => boolean }) {
  const navigate = useNavigate();
  useNavigationBlock(true, onAsk);
  return (
    <div>
      <p data-testid="where">{useLocation().path}</p>
      <button type="button" onClick={() => navigate("/history")}>
        Leave
      </button>
    </div>
  );
}

describe("useNavigationBlock", () => {
  it("cancels the navigation when the guard says no", () => {
    go("/inbox");
    render(
      <RouterProvider>
        <Guarded onAsk={() => false} />
      </RouterProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/inbox");
  });

  it("lets it through when the guard says yes", () => {
    go("/inbox");
    render(
      <RouterProvider>
        <Guarded onAsk={() => true} />
      </RouterProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/history");
  });
});

describe("RouteAnnouncer", () => {
  it("says nothing on first render — the page load was already announced", () => {
    go("/inbox");
    render(
      <RouterProvider>
        <RouteAnnouncer title="Inbox" />
      </RouterProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("announces the new screen and moves focus to the main region", () => {
    go("/inbox");
    const main = document.createElement("main");
    main.id = "tf-main";
    document.body.append(main);

    function Harness() {
      const route = useRoute(ROUTES, "inbox");
      const navigate = useNavigate();
      return (
        <>
          <RouteAnnouncer title={route.id} />
          <button type="button" onClick={() => navigate("/history")}>
            Go
          </button>
        </>
      );
    }
    render(
      <RouterProvider>
        <Harness />
      </RouterProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Go" }));

    expect(screen.getByRole("status")).toHaveTextContent("history");
    expect(document.activeElement).toBe(main);
    // Programmatically focusable, but not a tab stop with nothing to do.
    expect(main).toHaveAttribute("tabindex", "-1");
    main.remove();
  });
});

/* ── useListState ────────────────────────────────────────────────────────────
 * The encoding rules matter more than the plumbing: a shared link is only useful if
 * the same URL always means the same list.
 */

import { useListState } from "./useListState";

function List() {
  const list = useListState({
    defaults: { filter: "mine", q: "", due: "any" },
    defaultSort: { key: "dueDate", order: "asc" as const },
    preferenceKey: "test.list",
  });
  return (
    <div>
      <p data-testid="filter">{list.filters.filter}</p>
      <p data-testid="q">{list.filters.q || "-"}</p>
      <p data-testid="start">{list.start}</p>
      <p data-testid="size">{list.size}</p>
      <p data-testid="sort">{`${list.sort?.key}:${list.sort?.order}`}</p>
      <p data-testid="isFiltered">{String(list.isFiltered)}</p>
      <button type="button" onClick={() => list.setFilters({ q: "invoice" })}>Search</button>
      <button type="button" onClick={() => list.setFilters({ filter: "claimable" })}>Claimable</button>
      <button type="button" onClick={() => list.setStart(50)}>Page 3</button>
      <button type="button" onClick={() => list.setSize(100)}>100 per page</button>
      <button type="button" onClick={() => list.setSort({ key: "name", order: "desc" })}>By name</button>
      <button type="button" onClick={() => list.clearFilters()}>Clear</button>
    </div>
  );
}

describe("useListState", () => {
  beforeEach(() => window.localStorage.clear());

  it("restores filters, page and sort from the URL — F1's refresh requirement", () => {
    go("/inbox?filter=claimable&q=invoice&page=3&size=50&sort=name&order=desc");
    render(
      <RouterProvider>
        <List />
      </RouterProvider>,
    );
    expect(screen.getByTestId("filter")).toHaveTextContent("claimable");
    expect(screen.getByTestId("q")).toHaveTextContent("invoice");
    // page 3 at 50 per page is offset 100, which is what the REST resources take.
    expect(screen.getByTestId("start")).toHaveTextContent("100");
    expect(screen.getByTestId("size")).toHaveTextContent("50");
    expect(screen.getByTestId("sort")).toHaveTextContent("name:desc");
  });

  it("omits a filter at its default, so the URL carries only what was chosen", () => {
    go("/inbox");
    render(
      <RouterProvider>
        <List />
      </RouterProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(window.location.search).toBe("?q=invoice");

    // filter=mine is the default and must not appear.
    fireEvent.click(screen.getByRole("button", { name: "Claimable" }));
    expect(window.location.search).toContain("filter=claimable");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(window.location.search).toBe("");
  });

  it("returns to page 1 when a filter changes — page 3 of a new query is meaningless", () => {
    go("/inbox?page=3");
    render(
      <RouterProvider>
        <List />
      </RouterProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(window.location.search).toBe("?q=invoice");
    expect(screen.getByTestId("start")).toHaveTextContent("0");
  });

  it("pushes a history entry for paging, so Back returns to the previous page", () => {
    go("/inbox");
    const push = vi.spyOn(window.history, "pushState");
    render(
      <RouterProvider>
        <List />
      </RouterProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Page 3" }));
    expect(window.location.search).toBe("?page=3");
    expect(push).toHaveBeenCalled();
    push.mockRestore();
  });

  it("omits the default sort but records any other", () => {
    go("/inbox");
    render(
      <RouterProvider>
        <List />
      </RouterProvider>,
    );
    expect(screen.getByTestId("sort")).toHaveTextContent("dueDate:asc");
    expect(window.location.search).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "By name" }));
    expect(window.location.search).toBe("?sort=name&order=desc");
  });

  it("remembers the page size, and lets a shared URL override it", () => {
    go("/inbox");
    const { unmount } = render(
      <RouterProvider>
        <List />
      </RouterProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "100 per page" }));
    expect(screen.getByTestId("size")).toHaveTextContent("100");
    unmount();

    // Remembered across a remount…
    go("/inbox");
    const second = render(
      <RouterProvider>
        <List />
      </RouterProvider>,
    );
    expect(screen.getByTestId("size")).toHaveTextContent("100");
    second.unmount();

    // …but a link that names a size shows the sender's page, not the recipient's default.
    go("/inbox?size=25");
    render(
      <RouterProvider>
        <List />
      </RouterProvider>,
    );
    expect(screen.getByTestId("size")).toHaveTextContent("25");
  });

  it("reports whether anything is filtered, which drives the clear affordance", () => {
    go("/inbox");
    const { unmount } = render(
      <RouterProvider>
        <List />
      </RouterProvider>,
    );
    expect(screen.getByTestId("isFiltered")).toHaveTextContent("false");
    unmount();

    go("/inbox?due=overdue");
    render(
      <RouterProvider>
        <List />
      </RouterProvider>,
    );
    expect(screen.getByTestId("isFiltered")).toHaveTextContent("true");
  });
});
