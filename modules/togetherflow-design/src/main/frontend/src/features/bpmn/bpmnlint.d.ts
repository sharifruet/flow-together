/**
 * Typings for bpmnlint, which ships none.
 *
 * Narrow on purpose, in the style of `dmn-js.d.ts`: only what `lintBpmn.ts` uses. A rule
 * is opaque — it is created by bpmnlint and handed straight back to it, never read here —
 * but the linter's own surface is spelled out so an upgrade that changes `lint()` fails
 * the typecheck rather than degrading to `any`.
 */
declare module "bpmnlint" {
  export interface LinterConfig {
    config: { rules: Record<string, string> };
    resolver: unknown;
  }
  export class Linter {
    constructor(options: LinterConfig);
    lint(definitions: unknown): Promise<
      Record<string, Array<{ id?: string; message: string; category: string; path?: string[] }>>
    >;
  }
}

declare module "bpmnlint/lib/resolver/static-resolver" {
  export default class StaticResolver {
    constructor(rules: Record<string, unknown>);
  }
}

/** Every bundled rule, opaque — created by bpmnlint and passed back to it unread. */
declare module "bpmnlint/rules/*" {
  const rule: unknown;
  export default rule;
}

/**
 * `bpmn-moddle` ships types under a subpath its package `exports` does not expose to
 * TypeScript's node resolution, so the one constructor used here is declared instead.
 */
declare module "bpmn-moddle" {
  export class BpmnModdle {
    constructor(packages?: Record<string, unknown>);
    fromXML(xml: string): Promise<{ rootElement: unknown; warnings: unknown[] }>;
  }
}
