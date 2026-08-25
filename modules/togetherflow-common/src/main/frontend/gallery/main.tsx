/**
 * Entry point for the component gallery (REQUIREMENTS.md §14.2).
 *
 * Its own Vite app rather than a route in a product app — `togetherflow-common` is not
 * deployable, so this cannot end up in a shipped bundle.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../src/theme/index.css";
import "../src/gallery/gallery.css";
import { Gallery } from "../src/gallery/Gallery";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);
