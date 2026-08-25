import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Serves the component gallery (REQUIREMENTS.md §14.2). Separate from any app's config
 * because this module ships no app — it is a library plus its own documentation.
 */
export default defineConfig({
  root: "gallery",
  plugins: [react()],
  server: { port: 5280 },
  build: {
    // Built into the module's own directory, not into anything deployable.
    outDir: "../gallery-dist",
    emptyOutDir: true,
  },
});
