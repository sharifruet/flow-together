import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The stock `flowable/flowable-rest` image serves everything under the context path
 * `/flowable-rest`, and mounts the BPMN servlet at `/service` rather than the
 * `/process-api` default — verified against a running engine. The dev proxy therefore
 * rewrites, so the app's own paths stay deployment-neutral.
 *
 * Override with TF_API_TARGET (host) and TF_API_CONTEXT (context path) when pointing
 * at a deployment that mounts things differently.
 */
const target = process.env.TF_API_TARGET ?? "http://localhost:8080";
const context = process.env.TF_API_CONTEXT ?? "/flowable-rest";
const proxy = (servlet: string) => ({
  target,
  changeOrigin: true,
  rewrite: (path: string) => `${context}${servlet}${path.replace(/^\/[^/]+/, "")}`,
});


export default defineConfig({
  plugins: [react()],
  /**
   * @togetherflow/common is linked with a `file:` dependency and carries its own
   * React in devDependencies for its tests. Without deduping, that second copy gets
   * loaded alongside this one and every hook throws ("Cannot read properties of null
   * reading 'useState'"). Pin both packages to a single instance.
   */
  resolve: { dedupe: ["react", "react-dom"] },
  build: {
    outDir: "dist",
    sourcemap: true,
    /**
     * 500 kB for the app's own chunks (REQUIREMENTS.md §13.5). Raised here because
     * dmn-js is ~830 kB on its own and cannot be trimmed; it is lazily loaded, so it
     * is only fetched when someone actually opens a decision model. The entry chunk
     * is what matters for first paint and stays well under budget.
     */
    chunkSizeWarningLimit: 900,
  },
  server: {
    /*
     * The shared package is linked with a `file:` dependency, so its *source* is
     * transformed through Vite happily — but a static asset it references (the Inter
     * woff2 the theme ships) is served raw, and raw serving is refused for anything
     * outside this project's root. The result is a dev-only 403 and a failed font
     * download: every developer designs against the system fallback rather than the
     * typeface that actually ships. Production is unaffected — the build emits the file.
     *
     * The grant is the package root rather than the font directory, because the same
     * restriction applies to anything else common ships as an asset.
     */
    fs: { allow: [".", "../../../../togetherflow-common/src/main/frontend"] },
    port: 5276,
    proxy: {
      "/process-api": proxy("/service"),
      "/idm-api": proxy("/idm-api"),
      "/cmmn-api": proxy("/cmmn-api"),
      "/app-api": proxy("/app-api"),
      "/event-registry-api": proxy("/event-registry-api"),
      "/dmn-api": proxy("/dmn-api"),
      /*
       * The workspace service (ADR 0017) is its own process, not a servlet of the
       * engine, so it is proxied straight through rather than through `proxy()`'s
       * context-path rewrite. Absent, Design shows one flat library and no switcher —
       * which is the supported default, not a broken state.
       */
      "/workspace-api": {
        target: process.env.TF_WORKSPACE_TARGET ?? "http://localhost:8092",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/workspace-api/, ""),
      },
    },
  },
});
