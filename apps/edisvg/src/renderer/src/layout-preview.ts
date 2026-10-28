import { createLayoutEngine } from "@informach/edi-motion/layout";
import { createSvgLayout, type LayoutElement } from "@informach/edi-motion/layout/dom";
import type { InteractiveDocument } from "@informach/edi-motion/runtime";
import { compileInteractiveArtboard } from "../../shared/interactive";
import type { Project } from "../../shared/project";

/** Authoring uses artboard units (zoom is not a responsive viewport). Testar
 * uses the same engine with the actual host dimensions. No behavior session
 * or scroll gestures are installed on the editable canvas. */
export function mountLayoutPreview(
  root: SVGSVGElement,
  project: Project,
  artboardId: string,
  changed: () => void,
  report: (message: string) => void,
) {
  let live = true,
    drivers: ReturnType<typeof createSvgLayout>[] = [];
  const mount = async () => {
    try {
      const compiled = compileInteractiveArtboard(project, artboardId);
      const hasLayout = (document: InteractiveDocument): boolean =>
        !!document.layout ||
        !!document.components?.some((component) => hasLayout(component.document));
      if (!hasLayout(compiled.document)) return;
      const engine = await createLayoutEngine();
      if (!live || !root.isConnected) return;
      const elements = new Map<string, LayoutElement>();
      for (const wrapper of root.querySelectorAll("[data-object],[data-edi-object]")) {
        const id = wrapper.getAttribute("data-object") ?? wrapper.getAttribute("data-edi-object"),
          shape = wrapper.firstElementChild;
        if (
          !id ||
          !(wrapper instanceof SVGGraphicsElement) ||
          !(shape instanceof SVGGraphicsElement)
        )
          throw new Error("Prévia de layout incompleta.");
        elements.set(id, { wrapper, shape });
      }
      function mount(root: SVGSVGElement, document: InteractiveDocument, nested: boolean) {
        if (document.layout) {
          const ids = new Set(document.content.map((object) => object.id));
          drivers.push(
            createSvgLayout(
              root,
              document,
              engine,
              new Map([...elements].filter(([id]) => ids.has(id))),
              {
                interactive: false,
                viewport: () =>
                  nested
                    ? { width: root.width.baseVal.value, height: root.height.baseVal.value }
                    : { width: compiled.scene.viewBox[2], height: compiled.scene.viewBox[3] },
                changed() {
                  if (!live) return;
                  // A hug axis resizes the artboard; the frame follows its proportion.
                  const frame = nested ? null : root.closest<HTMLElement>(".scene-artboard"),
                    { width, height } = root.viewBox.baseVal;
                  if (frame && width > 0 && height > 0)
                    frame.style.aspectRatio = `${width}/${height}`;
                  changed();
                },
                error(error) {
                  if (live) report(error.message);
                },
              },
            ),
          );
        }
        for (const component of document.components ?? []) {
          const viewport = elements.get(component.rootId)?.shape;
          if (!(viewport instanceof SVGSVGElement))
            throw new Error("Viewport de componente ausente.");
          mount(viewport, component.document, true);
        }
      }
      mount(root, compiled.document, false);
      if (live) changed();
    } catch (error) {
      for (const driver of drivers.reverse()) driver.destroy();
      drivers = [];
      if (live) report(error instanceof Error ? error.message : "Falha na prévia de layout.");
    }
  };
  void mount();
  return {
    transforms() {
      return new Map(drivers.flatMap((driver) => [...driver.transforms()]));
    },
    destroy() {
      live = false;
      for (const driver of drivers.reverse()) driver.destroy();
      drivers = [];
    },
  };
}
