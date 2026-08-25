/**
 * Minimal typings for dmn-js, which ships none.
 *
 * Deliberately narrow: it declares only the surface DmnEditor uses, so a future
 * upgrade that changes one of these signatures fails the typecheck instead of
 * silently degrading to `any`.
 */
declare module "dmn-js/lib/Modeler" {
  interface DmnViewer {
    on?(event: string, callback: (...args: unknown[]) => void): void;
  }

  interface DmnModelerOptions {
    container?: HTMLElement;
    keyboard?: { bindTo?: Document | HTMLElement };
    [key: string]: unknown;
  }

  export default class DmnModeler {
    constructor(options?: DmnModelerOptions);
    importXML(xml: string): Promise<{ warnings: unknown[] }>;
    saveXML(options?: { format?: boolean }): Promise<{ xml?: string }>;
    getActiveViewer?(): DmnViewer | undefined;
    on(event: string, callback: (...args: unknown[]) => void): void;
    destroy(): void;
  }
}
