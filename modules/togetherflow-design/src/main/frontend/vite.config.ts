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
    port: 5276,
    proxy: {
      "/process-api": proxy("/service"),
      "/idm-api": proxy("/idm-api"),
      "/cmmn-api": proxy("/cmmn-api"),
      "/app-api": proxy("/app-api"),
      "/event-registry-api": proxy("/event-registry-api"),
      "/dmn-api": proxy("/dmn-api"),
    },
  },
});
