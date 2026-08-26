/**
 * `diagram-js-minimap` ships no types.
 *
 * Typed as a diagram-js module declaration — the shape `additionalModules` expects — and
 * no further: this code only ever hands it to bpmn-js and never reads into it, so a
 * fuller declaration would be fiction with a shape.
 */
declare module "diagram-js-minimap" {
  import type { ModuleDeclaration } from "didi";

  const minimapModule: ModuleDeclaration;
  export default minimapModule;
}
