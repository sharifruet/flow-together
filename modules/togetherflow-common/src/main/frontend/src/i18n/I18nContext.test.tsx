/**
 * The i18n layer (REQUIREMENTS.md §8). What matters here is not that lookup works but
 * that the failure modes are the safe ones: a missing key is visible rather than
 * silently plausible, a missing provider still renders shared copy, and storage being
 * unavailable does not take the app down.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  I18nProvider,
  interpolate,
  localeChain,
  mergeCatalogues,
  registerFallbackMessages,
  useI18n,
  useT,
} from "./I18nContext";

const CATALOGUES = {
  en: {
    greeting: "Hello {name}",
    "items.one": "{count} item",
    "items.other": "{count} items",
    plain: "Plain",
  },
  de: { greeting: "Hallo {name}" },
  "de-AT": { plain: "Servus" },
};

function Show({ id, params }: { id: string; params?: Record<string, string | number> }) {
  const t = useT();
  return <span data-testid="out">{t(id, params)}</span>;
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("interpolate", () => {
  it("substitutes named placeholders", () => {
    expect(interpolate("Hello {name}", { name: "Ada" })).toBe("Hello Ada");
  });

  it("leaves an unmatched placeholder verbatim, so the gap is visible", () => {
    expect(interpolate("Hello {name}", { other: "x" })).toBe("Hello {name}");
  });
});

describe("localeChain", () => {
  it("falls back through the base language to the default", () => {
    expect(localeChain("de-AT")).toEqual(["de-AT", "de", "en"]);
  });

  it("does not duplicate the default when it is already the locale", () => {
    expect(localeChain("en")).toEqual(["en"]);
  });
});

describe("mergeCatalogues", () => {
  it("merges per locale, with later sources winning", () => {
    const merged = mergeCatalogues({ en: { a: "1", b: "2" } }, { en: { b: "3" } });
    expect(merged.en).toEqual({ a: "1", b: "3" });
  });
});

describe("I18nProvider", () => {
  it("interpolates parameters", () => {
    render(
      <I18nProvider catalogues={CATALOGUES} locale="en">
        <Show id="greeting" params={{ name: "Ada" }} />
      </I18nProvider>,
    );
    expect(screen.getByTestId("out")).toHaveTextContent("Hello Ada");
  });

  it("picks the plural form matching the count", () => {
    render(
      <I18nProvider catalogues={CATALOGUES} locale="en">
        <>
          <Show id="items" params={{ count: 1 }} />
        </>
      </I18nProvider>,
    );
    expect(screen.getByTestId("out")).toHaveTextContent("1 item");
  });

  it("resolves a regional locale through its base language", () => {
    render(
      <I18nProvider catalogues={CATALOGUES} locale="de-AT">
        <Show id="greeting" params={{ name: "Ada" }} />
      </I18nProvider>,
    );
    // "greeting" exists only in `de`, "plain" only in `de-AT` — both must resolve.
    expect(screen.getByTestId("out")).toHaveTextContent("Hallo Ada");
  });

  it("falls back to the default locale for a key the language lacks", () => {
    render(
      <I18nProvider catalogues={CATALOGUES} locale="de">
        <Show id="plain" />
      </I18nProvider>,
    );
    expect(screen.getByTestId("out")).toHaveTextContent("Plain");
  });

  it("renders a missing key as the key itself, and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <I18nProvider catalogues={CATALOGUES} locale="en">
        <Show id="nope.not.here" />
      </I18nProvider>,
    );
    expect(screen.getByTestId("out")).toHaveTextContent("nope.not.here");
    expect(warn).toHaveBeenCalled();
  });

  it("sets the document language, which screen readers key off", () => {
    render(
      <I18nProvider catalogues={CATALOGUES} locale="de">
        <Show id="plain" />
      </I18nProvider>,
    );
    expect(document.documentElement.lang).toBe("de");
  });

  it("switches locale and remembers the choice", async () => {
    function Switcher() {
      const { t, locale, setLocale } = useI18n();
      return (
        <>
          <span data-testid="out">{t("greeting", { name: "Ada" })}</span>
          <span data-testid="locale">{locale}</span>
          <button onClick={() => setLocale("de")}>de</button>
        </>
      );
    }
    render(
      <I18nProvider catalogues={CATALOGUES}>
        <Switcher />
      </I18nProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "de" }));
    expect(screen.getByTestId("out")).toHaveTextContent("Hallo Ada");
    expect(window.localStorage.getItem("togetherflow.locale")).toBe("de");
  });

  it("still switches when storage refuses to persist the choice", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    function Switcher() {
      const { locale, setLocale } = useI18n();
      return (
        <>
          <span data-testid="locale">{locale}</span>
          <button onClick={() => setLocale("de")}>de</button>
        </>
      );
    }
    render(
      <I18nProvider catalogues={CATALOGUES} defaultLocale="en">
        <Switcher />
      </I18nProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "de" }));
    expect(screen.getByTestId("locale")).toHaveTextContent("de");
  });
});

describe("without a provider", () => {
  it("still resolves shared copy, so a component works standalone", () => {
    render(<Show id="dialog.cancel" />);
    expect(screen.getByTestId("out")).toHaveTextContent("Cancel");
  });

  it("resolves an app catalogue once it registers one", () => {
    registerFallbackMessages({ en: { "test.registered": "Registered" } });
    render(<Show id="test.registered" />);
    expect(screen.getByTestId("out")).toHaveTextContent("Registered");
  });
});
