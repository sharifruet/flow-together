import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  /**
   * @togetherflow/common is linked with a `file:` dependency and carries its own
   * React in devDependencies for its tests. Without deduping, that second copy gets
   * loaded alongside this one and every hook throws ("Cannot read properties of null
   * reading 'useState'"). Pin both packages to a single instance.
   */
  resolve: { dedupe: ["react", "react-dom"] },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    exclude: ["e2e/**", "node_modules/**"],
  },
});
