import {
  type Affine,
  identityMatrix,
  inverse,
  parseTransformList,
  transformAttribute,
  transformPoint,
} from "../affine";
import { createSlicedImageBinding } from "../assets/imageDom";
import { ownerWindow } from "../frameLoop";
import { geometryPath } from "../geometry";
import type { InteractiveDocument } from "../interactiveDocument";
import { identityTransform } from "../model";
import type { Bounds, LayoutObject } from "./model";
import { advanceScroll, type ScrollBounds, type ScrollState } from "./scroll";
import type { LayoutContainerResult, LayoutEngine, LayoutResult } from "./yoga";

let sequence = 0;
export interface LayoutElement {
  wrapper: SVGGraphicsElement;
  shape: SVGGraphicsElement;
}
/** A layout layer owns only its generated groups/defs/styles. Authored poses
 * remain runtime-owned; layout never rewrites the source document. */
export function createSvgLayout(
  root: SVGSVGElement,
  document: InteractiveDocument,
  engine: LayoutEngine,
  elements: ReadonlyMap<string, LayoutElement>,
  options: {
    changed(): void;
    error(error: Error): void;
    interactive?: boolean;
    viewport?(): { width: number; height: number };
  },
) {
  const view = ownerWindow(root),
    layout = document.layout;
  if (!layout) throw new Error("Documento sem layout.");
  if (!root.isConnected) throw new Error("Anexe o SVG antes de medir seu layout.");
  const responsiveComponents = new Map<string, SVGSVGElement>();
  const responsiveImages = new Map<string, ReturnType<typeof createSlicedImageBinding>>();
  const responsiveImageBounds = new Map<string, Bounds>();
  for (const component of document.components ?? []) {
    if (!component.document.layout) continue;
    const viewport = elements.get(component.rootId)?.shape;
    if (!(viewport instanceof view.SVGSVGElement))
      throw new Error("Viewport de layout do componente ausente.");
    responsiveComponents.set(component.instanceId, viewport);
  }
  const authored = new Set(
      document.playback.sources
        .filter((source) => source.instancePath.length === 0)
        .map((source) => source.id),
    ),
    objects = new Map<string, LayoutObject>();
  for (const object of document.content)
    if (authored.has(object.id)) {
      if (object.parentId === undefined) throw new Error("Layout sem hierarquia.");
      objects.set(object.id, {
        tag: object.tag,
        parentId: object.parentId,
        isComponent: object.isComponent,
      });
    }
  const containers = new Map(
      layout.containers.map((container) => [container.targetId, container.config]),
    ),
    children = new Map<string | null, string[]>(),
    managed = new Set<string>();
  for (const [id, object] of objects) {
    const list = children.get(object.parentId) ?? [];
    list.push(id);
    children.set(object.parentId, list);
  }
  const collect = (parent: string | null) => {
    for (const id of children.get(parent) ?? []) {
      managed.add(id);
      if (containers.has(id)) collect(id);
    }
  };
  collect(null);
  const originals = new Map<
      string,
      { anchor: SVGGraphicsElement; parent: Element; slot: SVGGElement }
    >(),
    intrinsic = new Map<string, Bounds>(),
    scrolls = new Map<
      string | null,
      {
        group: SVGGElement;
        viewport: SVGGraphicsElement;
        state: ScrollState;
        bounds: ScrollBounds;
        dragging: boolean;
      }
    >();
  const signalOwner = new AbortController(),
    restores: (() => void)[] = [],
    oldViewBox = root.getAttribute("viewBox"),
    initialViewBox = {
      x: root.viewBox.baseVal.x,
      y: root.viewBox.baseVal.y,
      width: root.viewBox.baseVal.width,
      height: root.viewBox.baseVal.height,
    },
    defs = root.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "defs"),
    clips = new Map<string | null, SVGRectElement>();
  let dirty = true,
    destroyed = false,
    calculating = false,
    result: LayoutResult | null = null,
    reduced = false,
    viewportStamp = "";
  let prefixMatrices: ReadonlyMap<string, Affine> = new Map(),
    prefixStamp = "";
  const viewportSize = () => {
    const rect = options.viewport?.() ?? root.parentElement?.getBoundingClientRect();
    return {
      width:
        rect && Number.isFinite(rect.width) && rect.width >= 0 ? rect.width : initialViewBox.width,
      height:
        rect && Number.isFinite(rect.height) && rect.height >= 0
          ? rect.height
          : initialViewBox.height,
    };
  };
  const createGroup = () => root.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "g");
  const identity = transformAttribute(identityTransform());
  const basePaths = new Map(
    document.playback.objects
      // Meshed images also carry geometry, but only paths take a d.
      .filter((object) => object.geometry && object.tag !== "image")
      .map((object) => [object.id, object.geometry ? geometryPath(object.geometry) : ""]),
  );
  const measure = () => {
    const poses = new Map<SVGElement, string | null>();
    const displays = new Map<SVGElement, string | null>();
    const bases = new Map(document.playback.objects.map((object) => [object.id, object.transform]));
    const helpers = new Map<SVGElement, string | null>();
    const paths = new Map<SVGElement, string | null>();
    try {
      for (const helper of root.querySelectorAll("[data-edi-rig-overlay]"))
        if (helper instanceof view.SVGElement) {
          helpers.set(helper, helper.getAttribute("display"));
          helper.setAttribute("display", "none");
        }
      // Animated/base TRS are visual offsets, not intrinsic flow dimensions.
      // Temporarily normalize them in one write batch, read, then restore.
      for (const [id, { wrapper, shape }] of elements) {
        poses.set(wrapper, wrapper.getAttribute("transform"));
        displays.set(wrapper, wrapper.getAttribute("display"));
        const base = bases.get(id);
        if (!base) throw new Error("Pose de referência de layout ausente.");
        wrapper.setAttribute("transform", managed.has(id) ? identity : transformAttribute(base));
        wrapper.setAttribute("display", "inline");
        const d = basePaths.get(id);
        if (d !== undefined) {
          if (shape.localName !== "path")
            throw new Error("Geometria base de layout não corresponde ao SVG.");
          paths.set(shape, shape.getAttribute("d"));
          shape.setAttribute("d", d);
        }
      }
      for (const [id, original] of originals) {
        if (containers.has(id)) continue;
        // Resizing a slice is output, not a new intrinsic size. Its authored
        // geometry is immutable for this driver and must not feed back on reflow.
        if (responsiveImages.has(id) && intrinsic.has(id)) continue;
        const box =
            responsiveImageBounds.get(id) ??
            document.content.find((object) => object.id === id)?.intrinsic ??
            original.anchor.getBBox(),
          matrix =
            responsiveComponents.has(id) || original.anchor === elements.get(id)?.wrapper
              ? identityMatrix()
              : parseTransformList(original.anchor.getAttribute("transform") ?? ""),
          points = [
            [box.x, box.y],
            [box.x + box.width, box.y],
            [box.x, box.y + box.height],
            [box.x + box.width, box.y + box.height],
          ].map(([x, y]) => transformPoint(matrix, x ?? 0, y ?? 0)),
          left = Math.min(...points.map((point) => point.x)),
          top = Math.min(...points.map((point) => point.y));
        intrinsic.set(id, {
          x: left,
          y: top,
          width: Math.max(...points.map((point) => point.x)) - left,
          height: Math.max(...points.map((point) => point.y)) - top,
        });
      }
    } finally {
      for (const [shape, d] of paths)
        if (d === null) shape.removeAttribute("d");
        else shape.setAttribute("d", d);
      for (const [wrapper, display] of displays)
        if (display === null) wrapper.removeAttribute("display");
        else wrapper.setAttribute("display", display);
      for (const [helper, display] of helpers)
        if (display === null) helper.removeAttribute("display");
        else helper.setAttribute("display", display);
      for (const [wrapper, transform] of poses)
        if (transform === null) wrapper.removeAttribute("transform");
        else wrapper.setAttribute("transform", transform);
    }
    dirty = false;
  };
  const boundsFor = (value: LayoutContainerResult): ScrollBounds => ({
    minX: Math.min(0, value.content.x),
    maxX: Math.max(0, value.content.x + value.content.width - value.width),
    minY: Math.min(0, value.content.y),
    maxY: Math.max(0, value.content.y + value.content.height - value.height),
  });
  const paintScroll = () => {
    for (const [id, scroll] of scrolls) {
      const config = id === null ? layout.root : containers.get(id);
      if (!config?.scroll) continue;
      if (reduced)
        scroll.state = advanceScroll(scroll.state, scroll.bounds, 0, {
          ...config.scroll,
          bounce: false,
        });
      scroll.group.setAttribute(
        "transform",
        `translate(${-scroll.state.x.position} ${-scroll.state.y.position})`,
      );
    }
  };
  const reflow = () => {
    if (destroyed || calculating) return;
    calculating = true;
    try {
      const viewport = viewportSize();
      if (dirty) measure();
      const next = engine.compute(layout, viewport, objects, intrinsic, initialViewBox),
        rootResult = next.containers.get(null),
        width = rootResult?.width ?? viewport.width,
        height = rootResult?.height ?? viewport.height;
      const transforms = new Map<string, string>();
      const imageUpdates: (() => void)[] = [];
      for (const [id, box] of next.boxes) {
        const object = objects.get(id);
        if (!object) throw new Error("Objeto de layout ausente.");
        const x = box.x + (object.parentId === null ? initialViewBox.x : 0),
          y = box.y + (object.parentId === null ? initialViewBox.y : 0);
        if (containers.has(id) || responsiveComponents.has(id)) {
          const original = originals.get(id);
          if (!original) throw new Error("Contêiner ausente.");
          const matrix =
            original.anchor === elements.get(id)?.wrapper
              ? identityMatrix()
              : parseTransformList(original.anchor.getAttribute("transform") ?? "");
          transforms.set(id, `translate(${x - matrix[4]} ${y - matrix[5]})`);
        } else {
          const source = intrinsic.get(id);
          if (!source) throw new Error("Medida intrínseca ausente.");
          const sliced = responsiveImages.get(id);
          if (sliced) {
            imageUpdates.push(sliced.prepare({ width: box.width, height: box.height }));
            transforms.set(id, `translate(${x - source.x} ${y - source.y})`);
            continue;
          }
          if (elements.get(id)?.shape.localName === "text") {
            transforms.set(id, `translate(${x - source.x} ${y - source.y})`);
            continue;
          }
          if ((source.width === 0 && box.width > 0) || (source.height === 0 && box.height > 0))
            throw new Error(
              "Não é possível esticar geometria sem extensão. Defina um tamanho compatível.",
            );
          const sx = source.width === 0 ? 1 : box.width / source.width,
            sy = source.height === 0 ? 1 : box.height / source.height;
          transforms.set(id, `matrix(${sx} 0 0 ${sy} ${x - source.x * sx} ${y - source.y * sy})`);
        }
      }
      // Publish only after every geometry/extent has been validated.
      const nextPrefixStamp = JSON.stringify([width, height, [...transforms]]);
      if (nextPrefixStamp !== prefixStamp) {
        prefixMatrices = new Map(
          [...transforms].map(([id, transform]) => [id, parseTransformList(transform)]),
        );
        prefixStamp = nextPrefixStamp;
      }
      root.setAttribute("viewBox", `${initialViewBox.x} ${initialViewBox.y} ${width} ${height}`);
      for (const [id, transform] of transforms)
        originals.get(id)?.slot.setAttribute("transform", transform);
      for (const update of imageUpdates) update();
      for (const [id, viewport] of responsiveComponents) {
        const box = next.boxes.get(id);
        if (!box) throw new Error("Caixa de componente ausente.");
        viewport.setAttribute("width", String(box.width));
        viewport.setAttribute("height", String(box.height));
      }
      for (const [id, value] of next.containers) {
        const clip = clips.get(id);
        if (clip) {
          clip.setAttribute("x", String(id === null ? initialViewBox.x : 0));
          clip.setAttribute("y", String(id === null ? initialViewBox.y : 0));
          clip.setAttribute("width", String(value.width));
          clip.setAttribute("height", String(value.height));
        }
        const scroll = scrolls.get(id);
        if (scroll) {
          scroll.bounds = boundsFor(value);
          const config = id === null ? layout.root : containers.get(id);
          if (config?.scroll)
            scroll.state = advanceScroll(scroll.state, scroll.bounds, 0, {
              ...config.scroll,
              bounce: false,
            });
        }
      }
      result = next;
      viewportStamp = JSON.stringify([viewport.width, viewport.height]);
      paintScroll();
      options.changed();
    } finally {
      calculating = false;
    }
  };
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    signalOwner.abort();
    observer.disconnect();
    for (const restore of restores.reverse()) restore();
    for (const original of [...originals.values()].reverse()) {
      original.slot.before(original.anchor);
      original.slot.remove();
    }
    defs.remove();
    if (oldViewBox === null) root.removeAttribute("viewBox");
    else root.setAttribute("viewBox", oldViewBox);
    originals.clear();
    intrinsic.clear();
    scrolls.clear();
    clips.clear();
    responsiveImages.clear();
    responsiveImageBounds.clear();
  };
  const observedReflow = () => {
    try {
      reflow();
    } catch (error) {
      options.error(error instanceof Error ? error : new Error("Falha no layout SVG."));
    }
  };
  const observer = new view.ResizeObserver(observedReflow);
  try {
    for (const id of managed) {
      const wrapper = elements.get(id)?.wrapper;
      const ancestor = wrapper?.parentElement?.closest("[data-object],[data-edi-object]");
      const parentId =
        ancestor && root.contains(ancestor)
          ? (ancestor.getAttribute("data-object") ?? ancestor.getAttribute("data-edi-object"))
          : null;
      if (!wrapper || parentId !== objects.get(id)?.parentId)
        throw new Error("Hierarquia DOM incompatível com o layout do documento.");
    }
    for (const id of managed) {
      const element = elements.get(id);
      if (!element) throw new Error("SVG de layout incompleto.");
      const parent = element.wrapper.parentElement,
        anchor =
          parent instanceof view.SVGGraphicsElement && parent.getAttribute("data-edi-basis") === id
            ? parent
            : element.wrapper,
        owner = anchor.parentElement;
      if (!owner) throw new Error("Objeto de layout sem pai DOM.");
      const slot = createGroup();
      slot.setAttribute("data-edi-layout", id);
      anchor.before(slot);
      slot.append(anchor);
      originals.set(id, { anchor, parent: owner, slot });
      const sliced = document.content.find((object) => object.id === id)?.imageSlice;
      if (sliced) {
        const shapeMatrix = parseTransformList(element.shape.getAttribute("transform") ?? ""),
          basisMatrix =
            anchor === element.wrapper
              ? identityMatrix()
              : parseTransformList(anchor.getAttribute("transform") ?? "");
        if (
          [shapeMatrix, basisMatrix].some(
            (matrix) => matrix[0] !== 1 || matrix[1] !== 0 || matrix[2] !== 0 || matrix[3] !== 1,
          )
        )
          throw new Error(
            "Nine-slice com layout requer espaço SVG/basis sem rotação, skew ou escala; use transformação animável do objeto.",
          );
        if (!(element.shape instanceof view.SVGSVGElement))
          throw new Error("Nine-slice requer viewport SVG.");
        const binding = createSlicedImageBinding(element.shape, sliced);
        responsiveImages.set(id, binding);
        // getBBox includes unclipped geometry referenced by each nested SVG.
        // The authored image viewport, not those off-crop pixels, owns sizing.
        responsiveImageBounds.set(id, {
          x: element.shape.x.baseVal.value + shapeMatrix[4],
          y: element.shape.y.baseVal.value + shapeMatrix[5],
          width: element.shape.width.baseVal.value,
          height: element.shape.height.baseVal.value,
        });
        restores.push(() => binding.destroy());
      }
      const viewport = responsiveComponents.get(id);
      if (viewport) {
        const original = [viewport.getAttribute("width"), viewport.getAttribute("height")];
        restores.push(() => {
          for (const [index, name] of ["width", "height"].entries()) {
            const value = original[index];
            if (value === null || value === undefined) viewport.removeAttribute(name);
            else viewport.setAttribute(name, value);
          }
        });
      }
    }
    root.prepend(defs);
    for (const [id, config] of [
      [null, layout.root],
      ...layout.containers.map((container) => [container.targetId, container.config] as const),
    ] as const) {
      const rootSlots =
          id === null
            ? (children.get(null) ?? []).flatMap((id) => {
                const slot = originals.get(id)?.slot;
                return slot ? [slot] : [];
              })
            : [],
        viewport = id === null ? root : elements.get(id)?.shape;
      if (!(viewport instanceof view.SVGGraphicsElement))
        throw new Error("Viewport de layout ausente.");
      const parent = id === null ? rootSlots[0]?.parentElement : viewport;
      if (!parent) continue;
      const clipGroup = createGroup(),
        scrollGroup = createGroup();
      clipGroup.setAttribute("data-edi-layout-content", id ?? "artboard");
      clipGroup.append(scrollGroup);
      if (id === null) {
        rootSlots[0]?.before(clipGroup);
        for (const slot of rootSlots) scrollGroup.append(slot);
      } else {
        while (parent.firstChild) scrollGroup.append(parent.firstChild);
        parent.append(clipGroup);
      }
      restores.push(() => {
        for (const child of [...scrollGroup.childNodes]) clipGroup.before(child);
        clipGroup.remove();
      });
      if (config.clip || config.scroll) {
        let clipId: string;
        do {
          clipId = `edi-layout-clip-${++sequence}`;
        } while (root.ownerDocument.getElementById(clipId));
        const path = root.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "clipPath"),
          rect = root.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "rect");
        path.id = clipId;
        path.setAttribute("clipPathUnits", "userSpaceOnUse");
        path.append(rect);
        defs.append(path);
        clipGroup.setAttribute("clip-path", `url(#${clipId})`);
        clips.set(id, rect);
      }
      if (!config.scroll) continue;
      const scroll = {
        group: scrollGroup,
        viewport,
        state: { x: { position: 0, velocity: 0 }, y: { position: 0, velocity: 0 } },
        bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
        dragging: false,
      };
      scrolls.set(id, scroll);
      if (options.interactive === false) continue;
      const oldTab = viewport.getAttribute("tabindex"),
        oldLabel = viewport.getAttribute("aria-label"),
        oldTouch = viewport.style.touchAction;
      viewport.setAttribute("tabindex", "0");
      if (!oldLabel) viewport.setAttribute("aria-label", "Área de rolagem");
      viewport.style.touchAction =
        config.scroll.axis === "x" ? "pan-y" : config.scroll.axis === "y" ? "pan-x" : "none";
      restores.push(() => {
        if (oldTab === null) viewport.removeAttribute("tabindex");
        else viewport.setAttribute("tabindex", oldTab);
        if (oldLabel === null) viewport.removeAttribute("aria-label");
        else viewport.setAttribute("aria-label", oldLabel);
        viewport.style.touchAction = oldTouch;
      });
      const settings = config.scroll;
      const applyDelta = (dx: number, dy: number) => {
        const before = structuredClone(scroll.state);
        if (settings.axis !== "y")
          scroll.state.x = {
            position: Math.max(
              scroll.bounds.minX,
              Math.min(scroll.bounds.maxX, scroll.state.x.position + dx),
            ),
            velocity: 0,
          };
        if (settings.axis !== "x")
          scroll.state.y = {
            position: Math.max(
              scroll.bounds.minY,
              Math.min(scroll.bounds.maxY, scroll.state.y.position + dy),
            ),
            velocity: 0,
          };
        paintScroll();
        options.changed();
        return (
          before.x.position !== scroll.state.x.position ||
          before.y.position !== scroll.state.y.position
        );
      };
      viewport.addEventListener(
        "wheel",
        (event) => {
          const scale =
            event.deltaMode === 1
              ? 16
              : event.deltaMode === 2
                ? (result?.containers.get(id)?.height ?? 1)
                : 1;
          if (applyDelta(event.deltaX * scale, event.deltaY * scale)) {
            event.preventDefault();
            event.stopPropagation();
          }
        },
        { signal: signalOwner.signal, passive: false },
      );
      viewport.addEventListener(
        "keydown",
        (event) => {
          if (event.defaultPrevented || event.target !== viewport) return;
          const delta =
            event.key === "ArrowLeft"
              ? [-40, 0]
              : event.key === "ArrowRight"
                ? [40, 0]
                : event.key === "ArrowUp"
                  ? [0, -40]
                  : event.key === "ArrowDown"
                    ? [0, 40]
                    : event.key === "PageDown"
                      ? [0, result?.containers.get(id)?.height ?? 0]
                      : event.key === "PageUp"
                        ? [0, -(result?.containers.get(id)?.height ?? 0)]
                        : null;
          if (delta && applyDelta(delta[0] ?? 0, delta[1] ?? 0)) {
            event.preventDefault();
            event.stopPropagation();
          }
        },
        { signal: signalOwner.signal },
      );
      let gesture: {
          pointerId: number;
          inverse: Affine;
          start: { x: number; y: number };
          previous: { x: number; y: number; time: number };
          state: ScrollState;
          moved: boolean;
        } | null = null,
        suppressClick = false;
      const cancel = () => {
        if (!gesture) return;
        const pointerId = gesture.pointerId;
        scroll.state = gesture.state;
        gesture = null;
        scroll.dragging = false;
        if (viewport.hasPointerCapture(pointerId)) viewport.releasePointerCapture(pointerId);
        paintScroll();
        if (!destroyed) options.changed();
      };
      restores.push(cancel);
      viewport.addEventListener(
        "pointerdown",
        (event) => {
          suppressClick = false;
          if (
            gesture ||
            event.button !== 0 ||
            (scroll.bounds.minX === scroll.bounds.maxX && scroll.bounds.minY === scroll.bounds.maxY)
          )
            return;
          const matrix =
            scrollGroup.parentElement instanceof view.SVGGraphicsElement
              ? scrollGroup.parentElement.getScreenCTM()
              : viewport.getScreenCTM();
          if (!matrix) return;
          let converted: Affine;
          try {
            converted = inverse([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]);
          } catch (error) {
            options.error(
              error instanceof Error ? error : new Error("Transformação singular no scroll."),
            );
            return;
          }
          const start = transformPoint(converted, event.clientX, event.clientY);
          gesture = {
            pointerId: event.pointerId,
            inverse: converted,
            start,
            previous: { ...start, time: event.timeStamp },
            state: structuredClone(scroll.state),
            moved: false,
          };
          scroll.dragging = true;
          viewport.setPointerCapture(event.pointerId);
        },
        { signal: signalOwner.signal },
      );
      viewport.addEventListener(
        "pointermove",
        (event) => {
          if (!gesture || gesture.pointerId !== event.pointerId) return;
          const point = transformPoint(gesture.inverse, event.clientX, event.clientY),
            elapsed = (event.timeStamp - gesture.previous.time) / 1000;
          gesture.moved ||= Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > 3;
          for (const axis of ["x", "y"] as const) {
            if (settings.axis !== "both" && settings.axis !== axis) continue;
            const min = axis === "x" ? scroll.bounds.minX : scroll.bounds.minY,
              max = axis === "x" ? scroll.bounds.maxX : scroll.bounds.maxY,
              raw = gesture.state[axis].position - (point[axis] - gesture.start[axis]),
              clamped = Math.max(min, Math.min(max, raw));
            scroll.state[axis] = {
              position: settings.bounce && !reduced ? clamped + (raw - clamped) * 0.25 : clamped,
              velocity:
                elapsed > 0
                  ? Math.max(
                      -20000,
                      Math.min(20000, (gesture.previous[axis] - point[axis]) / elapsed),
                    )
                  : scroll.state[axis].velocity,
            };
          }
          gesture.previous = { ...point, time: event.timeStamp };
          paintScroll();
          options.changed();
        },
        { signal: signalOwner.signal },
      );
      viewport.addEventListener(
        "pointerup",
        (event) => {
          if (!gesture || gesture.pointerId !== event.pointerId) return;
          suppressClick = gesture.moved;
          gesture = null;
          scroll.dragging = false;
          if (viewport.hasPointerCapture(event.pointerId))
            viewport.releasePointerCapture(event.pointerId);
          options.changed();
        },
        { signal: signalOwner.signal },
      );
      viewport.addEventListener("pointercancel", cancel, { signal: signalOwner.signal });
      viewport.addEventListener("lostpointercapture", cancel, { signal: signalOwner.signal });
      viewport.addEventListener(
        "click",
        (event) => {
          if (!suppressClick) return;
          suppressClick = false;
          event.preventDefault();
          event.stopImmediatePropagation();
        },
        { signal: signalOwner.signal, capture: true },
      );
      view.addEventListener("blur", cancel, { signal: signalOwner.signal });
    }
    if (root.parentElement) observer.observe(root.parentElement);
    observer.observe(root);
    root.ownerDocument.fonts?.addEventListener(
      "loadingdone",
      () => {
        dirty = true;
        observedReflow();
      },
      { signal: signalOwner.signal },
    );
    reflow();
  } catch (error) {
    destroy();
    throw error;
  }
  return {
    transforms() {
      return prefixMatrices;
    },
    hasViewport() {
      const viewport = result?.containers.get(null);
      return !!viewport && viewport.width > 0 && viewport.height > 0;
    },
    reflow,
    invalidateGeometry() {
      dirty = true;
    },
    paint(reduce: boolean) {
      reduced = reduce;
      const viewport = viewportSize();
      if (dirty || viewportStamp !== JSON.stringify([viewport.width, viewport.height])) reflow();
      paintScroll();
    },
    advance(seconds: number) {
      for (const [id, scroll] of scrolls) {
        const config = id === null ? layout.root : containers.get(id);
        if (config?.scroll && !scroll.dragging)
          scroll.state = advanceScroll(scroll.state, scroll.bounds, seconds, config.scroll);
      }
    },
    moving() {
      return [...scrolls.values()].some(
        (scroll) =>
          !scroll.dragging &&
          (scroll.state.x.velocity !== 0 ||
            scroll.state.y.velocity !== 0 ||
            scroll.state.x.position < scroll.bounds.minX ||
            scroll.state.x.position > scroll.bounds.maxX ||
            scroll.state.y.position < scroll.bounds.minY ||
            scroll.state.y.position > scroll.bounds.maxY),
      );
    },
    getScroll(id: string | null) {
      const scroll = scrolls.get(id);
      if (!scroll) throw new Error("Área de scroll não encontrada.");
      return structuredClone(scroll.state);
    },
    resetScroll() {
      for (const scroll of scrolls.values())
        scroll.state = { x: { position: 0, velocity: 0 }, y: { position: 0, velocity: 0 } };
      paintScroll();
      options.changed();
    },
    inspect() {
      return result ? structuredClone(result) : null;
    },
    destroy,
  };
}
