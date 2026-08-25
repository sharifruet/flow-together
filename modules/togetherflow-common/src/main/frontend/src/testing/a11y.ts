/**
 * Automated accessibility checking for component tests (REQUIREMENTS.md §13.6).
 *
 * §8 states WCAG 2.1 AA as the target; §13.6 adds the part that makes it a requirement
 * rather than a hope — "automated accessibility linting (axe-core or equivalent) in CI
 * catching regressions per PR". This is that check, run inside the existing Vitest
 * suite so it gates every pull request without a second harness.
 *
 * Imported from tests only, through the `@togetherflow/common/testing/a11y` subpath
 * rather than the package index: axe-core is around half a megabyte, and re-exporting it
 * from the index put it in every app's production bundle. The bundle budget (§13.5)
 * caught that, which is precisely the regression it exists to catch.
 *
 * It does not replace the manual audit §13.6 also asks for: axe catches roughly the
 * machine-checkable third of WCAG. A screen that passes here has not been proven
 * accessible, only proven free of the failures a machine can see.
 */

import axe, { type AxeResults, type ElementContext, type RunOptions, type Result } from "axe-core";

/**
 * WCAG 2.1 A and AA, which is the stated target. Best-practice rules are deliberately
 * excluded: they are opinions rather than the conformance bar, and mixing them in makes
 * a real failure harder to spot.
 */
const WCAG_21_AA: RunOptions = {
  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
  rules: {
    /*
     * Colour contrast cannot be evaluated here and must not be pretended otherwise:
     * jsdom applies no stylesheet and has no canvas, so axe cannot read a computed
     * colour. Leaving the rule on produces noise and, worse, an "all clear" that means
     * nothing. Contrast is a real requirement (§14.2 asks for accessible-contrast-checked
     * light and dark variants) — it belongs to the browser-based visual suite (§14.5),
     * not to a jsdom unit test.
     */
    "color-contrast": { enabled: false },
  },
};

export async function runAxe(
  container: ElementContext,
  options: RunOptions = {},
): Promise<AxeResults> {
  return axe.run(container, { ...WCAG_21_AA, ...options });
}

/** Renders a violation the way a person can act on it, not as a wall of JSON. */
export function describeViolations(violations: Result[]): string {
  return violations
    .map((violation) => {
      const where = violation.nodes
        .map((node) => `      ${node.target.join(" ")}\n        ${node.failureSummary ?? ""}`)
        .join("\n");
      return `  [${violation.impact ?? "unknown"}] ${violation.id}: ${violation.help}\n    ${violation.helpUrl}\n${where}`;
    })
    .join("\n\n");
}

/**
 * Fails the test with a readable report when the rendered container has any WCAG 2.1 AA
 * violation. Use it on a screen's default state and on the states a user actually lands
 * in — an accessible empty state and an inaccessible populated one is still a broken app.
 */
export async function expectNoA11yViolations(
  container: ElementContext,
  options: RunOptions = {},
): Promise<void> {
  const results = await runAxe(container, options);
  if (results.violations.length === 0) return;
  throw new Error(
    `Accessibility violations (WCAG 2.1 AA):\n\n${describeViolations(results.violations)}`,
  );
}
