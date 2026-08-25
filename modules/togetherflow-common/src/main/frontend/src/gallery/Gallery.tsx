/**
 * The component gallery (REQUIREMENTS.md §14.2).
 *
 * Runs as its own tiny Vite app rather than a route inside a product app:
 * `togetherflow-common` is not deployable, so documentation living here costs nothing at
 * runtime and cannot accidentally ship in a bundle with an enforced size budget.
 *
 *   npm run gallery
 */

import { useState } from "react";
import { ToastProvider } from "../components/Toast";
import { useTheme, type ThemePreference } from "../theme/useTheme";
import { GALLERY, type GalleryEntry, type GalleryState } from "./registry";
import { TOKEN_GROUPS, readToken } from "./tokens";

const THEMES: ThemePreference[] = ["system", "light", "dark"];

export function Gallery() {
  return (
    <ToastProvider>
      <GalleryShell />
    </ToastProvider>
  );
}

function GalleryShell() {
  const { theme, setTheme } = useTheme();
  const [active, setActive] = useState<string>("tokens");

  const entry = GALLERY.find((candidate) => candidate.name === active);

  return (
    <div className="tf-gallery">
      <aside className="tf-gallery__nav">
        <h1 className="tf-gallery__title">TogetherFlow</h1>
        <p className="tf-gallery__subtitle">Design system</p>

        <div className="tf-theme-choice" role="radiogroup" aria-label="Theme">
          {THEMES.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={theme === option}
              className={["tf-theme-choice__item", theme === option ? "is-selected" : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setTheme(option)}
            >
              {option}
            </button>
          ))}
        </div>

        <nav aria-label="Components">
          <button
            type="button"
            className={navClass(active === "tokens")}
            aria-current={active === "tokens" ? "page" : undefined}
            onClick={() => setActive("tokens")}
          >
            Tokens
          </button>
          {GALLERY.map((candidate) => (
            <button
              key={candidate.name}
              type="button"
              className={navClass(active === candidate.name)}
              aria-current={active === candidate.name ? "page" : undefined}
              onClick={() => setActive(candidate.name)}
            >
              {candidate.name}
            </button>
          ))}
        </nav>
      </aside>

      <main className="tf-gallery__main">
        {active === "tokens" ? <Tokens /> : entry ? <Entry entry={entry} /> : null}
      </main>
    </div>
  );
}

function navClass(current: boolean): string {
  return ["tf-gallery__nav-item", current ? "is-current" : ""].filter(Boolean).join(" ");
}

function Tokens() {
  return (
    <>
      <header className="tf-gallery__header">
        <h2>Design tokens</h2>
        <p className="tf-muted">
          Defined once and consumed everywhere, so the four apps read as one product family
          (§14.2). Values are read from the live stylesheet, not copied — switch the theme
          above to check the dark palette.
        </p>
      </header>

      {TOKEN_GROUPS.map((group) => (
        <section className="tf-gallery__section" key={group.title}>
          <h3>{group.title}</h3>
          <p className="tf-muted">{group.description}</p>
          <dl className="tf-gallery__tokens">
            {group.names.map((name) => {
              const value = readToken(name);
              return (
                <div className="tf-gallery__token" key={name}>
                  {group.render === "color" ? (
                    <span className="tf-gallery__swatch" style={{ background: value }} />
                  ) : null}
                  {group.render === "length" ? (
                    <span className="tf-gallery__bar" style={{ width: value }} />
                  ) : null}
                  <dt className="tf-mono">{name}</dt>
                  <dd className="tf-mono tf-muted">{value || "—"}</dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </>
  );
}

function Entry({ entry }: { entry: GalleryEntry }) {
  return (
    <>
      <header className="tf-gallery__header">
        <h2>{entry.name}</h2>
        <p className="tf-muted">{entry.description}</p>
      </header>
      {entry.states.map((state) => (
        <State key={state.label} state={state} />
      ))}
    </>
  );
}

function State({ state }: { state: GalleryState }) {
  return (
    <section className="tf-gallery__section">
      <h3>
        {state.label}
        {state.interactive ? <span className="tf-gallery__tag">interactive</span> : null}
      </h3>
      {state.note ? <p className="tf-muted">{state.note}</p> : null}
      <div className="tf-gallery__sample">{state.node}</div>
    </section>
  );
}
