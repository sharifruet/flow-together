import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

/**
 * Lint rules shared by every TogetherFlow frontend module.
 * Kept deliberately small: rules that catch real defects, not style preferences
 * (formatting is not enforced here — there is no formatter fight to have).
 */
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      // Built output of the component gallery (§14.2), not source.
      "gallery-dist/**",
      "node_modules/**",
      "coverage/**",
      // Served verbatim to the browser as runtime config, not part of the build.
      "public/**",
      // Machine-generated from the engine's OpenAPI specs; regenerate, don't edit.
      "src/api/generated/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Unused code is usually a leftover from a refactor; allow _-prefixed escapes.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // `any` defeats the typed API client this codebase is built around.
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "smart"],
    },
  },
  {
    // Build/codegen scripts run under Node, not the browser.
    files: ["**/*.mjs", "*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
    rules: { "no-console": "off" },
  },
  {
    // Tests legitimately cast stubs and reach past the public surface.
    files: ["**/*.test.{ts,tsx}", "**/test-setup.ts", "**/test/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
