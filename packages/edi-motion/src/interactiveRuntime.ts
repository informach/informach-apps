import { transformAttribute } from "./affine";
import { type BrowserAssets, loadBrowserAssets } from "./assets/browser";
import { assertTextCoverage } from "./assets/fontCoverage";
import { fontStackFamily, fontStackIds, resolveFontStack } from "./assets/fontStack";
import { createSlicedImageBinding } from "./assets/imageDom";
import type { Asset } from "./assets/model";
import { createBrowserAudioMixer } from "./audio/browser";
import type { AudioBinding, AudioCueEmission, AudioStatus } from "./audio/model";
import {
  advanceBehavior,
  type BehaviorEmission,
  createBehaviorContext,
  createBehaviorSession,
  editBehaviorData,
  evaluateBehavior,
  fireBehaviorTrigger,
  setBehaviorInput,
  writeBehaviorBinding,
} from "./behavior/engine";
import { dispatchBehaviorListeners } from "./behavior/listeners";
import type { InputValue } from "./behavior/model";
import { resolveDataPath } from "./data";
import { drawOrderScopes } from "./drawOrder";
import { createDrawOrderBinding } from "./drawOrderDom";
import { type FrameLoopOptions, type FramePolicy, ownerWindow } from "./frameLoop";
import { type Geometry, geometryCost, geometryPath } from "./geometry";
import { effectSourcePaints } from "./graphics/effectPaint";
import { filterAttributes } from "./graphics/filters";
import { validateSvgGradients } from "./graphics/gradientDom";
import { gradientAttributes } from "./graphics/gradients";
import { nativeEffectSources } from "./graphics/nativeEffectSources";
import { createVectorEffectBinding } from "./graphics/vectorEffectDom";
import { evaluateVectorEffects, playbackVectorEffectContext } from "./graphics/vectorEffects";
import { type InteractiveDocument, parseInteractiveDocument } from "./interactiveDocument";
import { documentAudioAssets } from "./interactiveResources";
import { createSvgLayout, type LayoutElement } from "./layout/dom";
import { createLayoutEngine, type LayoutEngine } from "./layout/yoga";
import type { RigEvaluationBudget } from "./rig/kinematics";
import {
  applyPlaybackRigs,
  createPlaybackParameterContext,
  createPlaybackRigContext,
} from "./rig/playbackRig";
import { documentFontIds, hasLoadedFont, loadDocumentFonts } from "./runtimeFonts";
import { createSceneClock, type SceneClock, type ScopeLoop } from "./sceneClock";
import { describeVisualDocument } from "./visual/document";
import { prepareVisualMount } from "./visual/dom";

export interface InteractivePlayerOptions extends FrameLoopOptions {
  audioContext?: AudioContext | OfflineAudioContext;
  onAudioCue?: (cue: AudioCueEmission) => void;
  onAudioStateChange?: (status: AudioStatus) => void;
  machineId?: string;
  onEvent?: (event: BehaviorEmission) => void;
  onStateChange?: (snapshot: BehaviorDebug) => void;
  layoutEngine?: LayoutEngine;
}
export interface BehaviorDebug {
  machineId: string | null;
  time: number;
  layers: { id: string; stateId: string; time: number; transitionId: string | null }[];
}
/** Trusted host supplies SVG; untrusted document contains declarative data
 * only. No innerHTML, network, Electron, subscription or script evaluation. */
function createInteractiveScope(
  root: SVGSVGElement,
  document: InteractiveDocument,
  options: InteractivePlayerOptions,
  clock: SceneClock,
  path: readonly string[],
  speed: number,
  initialBudget: RigEvaluationBudget,
  resources: ReadonlyMap<string, Asset>,
) {
  const view = ownerWindow(root);
  const audioBindings = new Map<string, AudioBinding[]>();
  for (const binding of document.audio?.bindings ?? []) {
    const list = audioBindings.get(binding.eventId) ?? [];
    list.push(binding);
    audioBindings.set(binding.eventId, list);
  }
  for (const id of documentFontIds(document))
    if (!hasLoadedFont(root.ownerDocument.fonts, id))
      throw new Error("Documento requer fonte carregada; use createInteractiveSvgPlayerAsync.");
  if (document.layout && !options.layoutEngine)
    throw new Error("Documento com layout requer layoutEngine ou createInteractiveSvgPlayerAsync.");
  const content = new Map(document.content.map((object) => [object.id, object])),
    objects = new Map(
      document.playback.objects.map((object) => {
        const details = content.get(object.id);
        if (!details) throw new Error("Conteúdo ausente.");
        return [object.id, { ...object, tag: details.tag }];
      }),
    ),
    authored = new Map(
      document.playback.sources
        .filter((source) => source.instancePath.length === 0)
        .flatMap((source) => {
          const object = objects.get(source.id);
          return object ? [[source.id, object] as const] : [];
        }),
    );
  const rigs = createPlaybackRigContext(document.playback);
  const effects = playbackVectorEffectContext(
    document.playback,
    new Map(
      document.content.flatMap((object) =>
        object.effects ? [[object.id, object.effects] as const] : [],
      ),
    ),
    new Map(
      document.content.flatMap((object) =>
        object.tag === "path" && object.visual?.attrs.d
          ? [[object.id, object.visual.attrs.d] as const]
          : [],
      ),
    ),
    nativeEffectSources(
      document.content.map((object) => ({ ...object, attrs: object.visual?.attrs })),
      new Map(
        document.content.flatMap((object) =>
          object.effects ? [[object.id, object.effects] as const] : [],
        ),
      ),
    ),
    effectSourcePaints(
      document.content.map((object) => ({
        ...object,
        parentId: object.parentId ?? null,
        attrs: object.visual?.attrs,
      })),
      new Map(
        document.content.flatMap((object) =>
          object.effects ? [[object.id, object.effects] as const] : [],
        ),
      ),
    ),
  );
  const context = createBehaviorContext(
    document.behavior,
    document.playback.motion.animations,
    objects,
    {
      drivers: document.playback.drivers,
      authoredTargets: authored,
      animationId: document.animationId,
      parameters: createPlaybackParameterContext(rigs),
    },
  );
  const fontStacks = new Map(
      document.version >= 7
        ? document.content
            .filter((object) => object.fontAssetId)
            .map((object) => [object.id, resolveFontStack(resources, object)])
        : [],
    ),
    checkedText = new Map<string, string>();
  function verifyText(id: string, text: string, budget: RigEvaluationBudget) {
    const fonts = fontStacks.get(id);
    if (!fonts) return;
    if (checkedText.get(id) !== text) {
      assertTextCoverage(text, fonts, budget);
      checkedText.set(id, text);
    } else {
      budget.remaining -= text.length + 1;
      if (budget.remaining < 0) throw new Error("Texto excede orçamento compartilhado do frame.");
    }
  }
  for (const object of document.content)
    if (object.visual) verifyText(object.id, object.visual.text, initialBudget);
  let svgLayout: ReturnType<typeof createSvgLayout> | undefined;
  function prepareFrame(raw: ReturnType<typeof evaluateBehavior>, budget?: RigEvaluationBudget) {
    const sharedBudget = budget ?? { remaining: 2_000_000 };
    for (const [id, text] of raw.text) verifyText(id, text, sharedBudget);
    // A zero viewport has no spatial solution to display. Logical state can
    // continue; reflow will evaluate geometry when the viewport exists again.
    if (svgLayout && !svgLayout.hasViewport())
      return {
        ...raw,
        rawVisibility: raw.visibility,
        rigVisibility: new Map<string, boolean>(),
        geometry: new Map<string, Geometry>(),
        rigDiagnostics: [],
        effects: [],
        vertices: 0,
      };
    const evaluated = applyPlaybackRigs(
      rigs,
      raw.poses,
      sharedBudget,
      svgLayout?.transforms(),
      raw.parameters,
    );
    let vertices = 0;
    for (const object of document.playback.objects) {
      if (--sharedBudget.remaining < 0)
        throw new Error("Geometria transitória excede orçamento de avaliação.");
      vertices += geometryCost(evaluated.geometry.get(object.id) ?? object.geometry ?? []);
    }
    return {
      ...raw,
      poses: evaluated.poses,
      geometry: evaluated.geometry,
      vertices,
      visibility: new Map([...raw.visibility, ...evaluated.visibility]),
      rawVisibility: raw.visibility,
      rigVisibility: evaluated.visibility,
      rigDiagnostics: evaluated.diagnostics,
      effects: evaluateVectorEffects(
        effects,
        evaluated.poses,
        evaluated.geometry,
        svgLayout?.transforms(),
        sharedBudget,
      ),
    };
  }
  const elements = new Map<
    string,
    {
      wrapper: SVGGraphicsElement;
      shape: SVGGraphicsElement;
      baseDisplay: string | null;
      baseFill: string | null;
      baseStroke: string | null;
      baseD: string | null | undefined;
      x: string;
      lineHeight?: number;
    }
  >();
  const childIds = new Set<string>();
  function collectChildren(document: InteractiveDocument) {
    for (const component of document.components ?? []) {
      for (const object of component.document.content) childIds.add(object.id);
      collectChildren(component.document);
    }
  }
  collectChildren(document);
  for (const wrapper of root.querySelectorAll("[data-edi-object]")) {
    const id = wrapper.getAttribute("data-edi-object"),
      shape = wrapper.firstElementChild;
    if (id && childIds.has(id)) continue;
    if (
      !(wrapper instanceof view.SVGGraphicsElement) ||
      !(shape instanceof view.SVGGraphicsElement) ||
      !id ||
      elements.has(id) ||
      shape.localName !== (content.get(id)?.tag === "image" ? "svg" : content.get(id)?.tag)
    )
      throw new Error("SVG incompatível com o conteúdo interativo.");
    const details = content.get(id);
    if (!details) throw new Error("Objeto interativo ausente.");
    if (
      details.fontAssetId &&
      shape.getAttribute("font-family") !==
        fontStackFamily(fontStackIds(details).map((id) => ({ id })))
    )
      throw new Error("SVG não corresponde à referência tipada da fonte.");
    for (const [name, value] of Object.entries(gradientAttributes(details.gradients)))
      if (shape.getAttribute(name) !== value)
        throw new Error("Pintura SVG não corresponde ao gradiente tipado.");
    if (shape.getAttribute("filter") !== (filterAttributes(details.filter).filter ?? null))
      throw new Error("SVG não corresponde ao filtro tipado.");
    if (
      details.tag === "image" &&
      (shape.getAttribute("data-edi-image") !== details.assetId ||
        (!details.imageSlice &&
          (shape.children.length !== 1 ||
            shape.firstElementChild?.localName !== "use" ||
            shape.firstElementChild.getAttribute("href") !== `#edi-${details.assetId}`)))
    )
      throw new Error("SVG não corresponde à referência tipada da imagem.");
    if (details.imageSlice) {
      if (!(shape instanceof view.SVGSVGElement))
        throw new Error("Nine-slice requer viewport SVG.");
      createSlicedImageBinding(shape, details.imageSlice).destroy();
    }
    elements.set(id, {
      wrapper,
      shape,
      baseDisplay: wrapper.getAttribute("display"),
      baseFill: shape.getAttribute("fill"),
      baseStroke: shape.getAttribute("stroke"),
      baseD: shape.localName === "path" ? shape.getAttribute("d") : undefined,
      x: shape.getAttribute("x") ?? "0",
      lineHeight: details.lineHeight,
    });
  }
  if (elements.size !== objects.size) throw new Error("SVG interativo incompleto.");
  let effectBinding: ReturnType<typeof createVectorEffectBinding> | undefined;
  const drawOrderBinding = createDrawOrderBinding(
    new Map([...elements].map(([id, value]) => [id, value.wrapper])),
    drawOrderScopes([
      ...document.playback.motion.animations,
      ...document.playback.drivers.map((driver) => driver.animation),
    ]),
  );
  let session = createBehaviorSession(context, options.machineId),
    frame = prepareFrame(evaluateBehavior(context, session), initialBudget),
    destroyed = false,
    notifying = false,
    dataVersion = 0;
  const subscribers = new Set<(event: BehaviorEmission) => void>(),
    changes = new Set<(id: string, value: InputValue) => void>(),
    dataChanges = new Set<() => void>(),
    stateChanges = new Set<(snapshot: BehaviorDebug) => void>(),
    cache = new Map<string, string>();
  if (options.onEvent) subscribers.add(options.onEvent);
  const assertLive = () => {
    if (destroyed) throw new Error("O player foi encerrado.");
  };
  const assertWritable = () => {
    assertLive();
    clock.assertWritable();
    if (notifying)
      throw new Error(
        "Não altere inputs/sessão durante um callback; agende a escrita após sua conclusão.",
      );
  };
  function notify(callback: () => void) {
    notifying = true;
    try {
      clock.notify(callback);
    } finally {
      notifying = false;
    }
  }
  function emit(events: readonly BehaviorEmission[]) {
    if (destroyed) return;
    notify(() => {
      for (const event of events)
        for (const subscriber of [...subscribers]) {
          if (destroyed) return;
          subscriber(event);
        }
    });
  }
  function writeInputs(values: Readonly<Record<string, unknown>>) {
    assertWritable();
    if (Object.keys(values).length > 100)
      throw new Error("Orçamento de inputs por escrita excedido.");
    let next = session;
    for (const [id, value] of Object.entries(values))
      next = setBehaviorInput(context, next, id, value);
    if (next === session) return;
    const result = advanceBehavior(context, next, 0);
    publish(result.session, prepareFrame(result.frame));
    loop.invalidate();
    emit(result.events);
  }
  const staticLines = [...elements].reduce(
    (total, [id, target]) =>
      total +
      (target.lineHeight !== undefined &&
      !context.behavior.bindings.some(
        (binding) => binding.kind === "text" && binding.targetId === id,
      )
        ? Math.max(1, target.shape.childElementCount)
        : 0),
    0,
  );
  function prepareText(next: typeof frame) {
    let total = staticLines;
    for (const [id, text] of next.text) {
      const target = elements.get(id);
      if (!target) throw new Error("Destino textual ausente.");
      if (target.lineHeight !== undefined) {
        const count = text.replace(/\r\n?/g, "\n").split("\n").length;
        total += count;
        if (count > 200 || total > 2000)
          throw new Error("Texto dinâmico excede o orçamento de linhas.");
      }
    }
    if (total > 2000) throw new Error("Texto excede o orçamento agregado de linhas.");
    return total;
  }
  function publish(
    next: typeof session,
    nextFrame = prepareFrame(evaluateBehavior(context, next)),
    deferred = false,
  ) {
    const lines = prepareText(nextFrame);
    if (!deferred) clock.validateFrame(path, lines, nextFrame.vertices);
    const previous = session;
    session = next;
    frame = nextFrame;
    if (previous.data !== session.data) dataVersion++;
    const observers = () => {
      if (destroyed) return;
      notify(() => {
        if (previous.data !== session.data)
          for (const subscriber of [...dataChanges]) {
            if (destroyed) return;
            subscriber();
          }
        for (const [id, value] of session.inputs)
          if (previous.inputs.get(id) !== value)
            for (const subscriber of [...changes]) {
              if (destroyed) return;
              subscriber(id, value);
            }
      });
      if (destroyed) return;
      if (
        previous.machineId !== session.machineId ||
        [...session.layers].some(
          ([id, clock]) =>
            previous.layers.get(id)?.stateId !== clock.stateId ||
            previous.layers.get(id)?.blend?.transitionId !== clock.blend?.transitionId,
        )
      )
        notify(() => {
          const snapshot = snapshotDebug();
          options.onStateChange?.(snapshot);
          for (const callback of [...stateChanges]) {
            if (destroyed) return;
            callback(snapshot);
          }
        });
    };
    if (!deferred) observers();
    return observers;
  }
  const initialFrame = frame;
  const stillFrames = new Map([[session.machineId, initialFrame]]);
  prepareText(frame);
  let loop: ScopeLoop;
  let rigPrefixes: ReturnType<ReturnType<typeof createSvgLayout>["transforms"]> | undefined;
  function snapshotDebug(): BehaviorDebug {
    return {
      machineId: session.machineId,
      time: session.seconds,
      layers: [...session.layers].map(([id, clock]) => ({
        id,
        stateId: clock.stateId,
        time: clock.seconds,
        transitionId: clock.blend?.transitionId ?? null,
      })),
    };
  }
  function paint(reduced: boolean, budget?: RigEvaluationBudget) {
    const prefixes = svgLayout?.transforms();
    if ((rigs.length || effects.references.length) && prefixes !== rigPrefixes) {
      const prepared = prepareFrame(evaluateBehavior(context, session), budget);
      clock.validateFrame(path, prepareText(prepared), prepared.vertices);
      frame = prepared;
      rigPrefixes = prefixes;
      stillFrames.clear();
    }
    let shown = frame;
    if (reduced) {
      let still = stillFrames.get(session.machineId);
      if (!still) {
        still = prepareFrame(
          evaluateBehavior(context, createBehaviorSession(context, session.machineId)),
          budget,
        );
        stillFrames.set(session.machineId, still);
      }
      shown = {
        ...still,
        text: frame.text,
        colors: frame.colors,
        visibility: new Map([...frame.rawVisibility, ...still.rigVisibility]),
      };
    }
    for (const [id, target] of elements) {
      const pose = shown.poses.get(id);
      if (!pose) throw new Error("Pose interativa ausente.");
      const value = transformAttribute(pose),
        opacity = String(pose.opacity / 100),
        visible = shown.visibility.get(id),
        text = shown.text.get(id),
        color = shown.colors.get(id),
        geometry = shown.geometry.get(id),
        d = geometry ? geometryPath(geometry) : target.baseD;
      const stamp = JSON.stringify([value, opacity, visible, text, color, d]);
      if (cache.get(id) === stamp) continue;
      target.wrapper.setAttribute("transform", value);
      target.wrapper.setAttribute("opacity", opacity);
      if (visible !== undefined)
        target.wrapper.setAttribute("display", visible ? "inline" : "none");
      else if (target.baseDisplay === null) target.wrapper.removeAttribute("display");
      else target.wrapper.setAttribute("display", target.baseDisplay);
      if (d !== undefined) {
        if (target.shape.localName !== "path") throw new Error("Deformação requer caminho SVG.");
        if (d === null) target.shape.removeAttribute("d");
        else target.shape.setAttribute("d", d);
      }
      if (text !== undefined) {
        svgLayout?.invalidateGeometry();
        if (target.lineHeight === undefined) target.shape.textContent = text;
        else
          target.shape.replaceChildren(
            ...text
              .replace(/\r\n?/g, "\n")
              .split("\n")
              .map((line, index) => {
                const tspan = root.ownerDocument.createElementNS(
                  "http://www.w3.org/2000/svg",
                  "tspan",
                );
                tspan.setAttribute("x", target.x);
                tspan.setAttribute("dy", `${index ? target.lineHeight : 0}em`);
                tspan.textContent = line || "\u00a0";
                return tspan;
              }),
          );
      }
      for (const [name, value] of [
        ["fill", color?.fill ?? target.baseFill],
        ["stroke", color?.stroke ?? target.baseStroke],
      ] as const) {
        if (value === null) {
          if (target.shape.hasAttribute(name)) target.shape.removeAttribute(name);
        } else if (target.shape.getAttribute(name) !== value)
          target.shape.setAttribute(name, value);
      }
      cache.set(id, stamp);
    }
    drawOrderBinding.paint(shown.orders);
    svgLayout?.paint(reduced);
    effectBinding?.paint(shown.effects);
  }
  if (document.layout && options.layoutEngine)
    svgLayout = createSvgLayout(
      root,
      document,
      options.layoutEngine,
      elements satisfies ReadonlyMap<string, LayoutElement>,
      {
        changed() {
          loop?.invalidate();
        },
        error(error) {
          loop?.fail(error);
        },
        ...(path.length
          ? {
              viewport: () => ({
                width: root.width.baseVal.value,
                height: root.height.baseVal.value,
              }),
            }
          : {}),
      },
    );
  try {
    effectBinding = createVectorEffectBinding(
      root,
      new Map([...elements].map(([id, value]) => [id, value.wrapper])),
      evaluateVectorEffects(effects, new Map()),
    );
    loop = clock.register(
      path,
      speed,
      {
        paint,
        prepareAdvance(seconds, playing, budget) {
          if (!Number.isFinite(seconds) || seconds < 0 || seconds > 10)
            throw new Error("Avanço efetivo do componente excede 10 segundos.");
          const result = playing ? advanceBehavior(context, session, seconds) : undefined;
          const prepared = result ? prepareFrame(result.frame, budget) : frame;
          const lines = prepareText(prepared);
          const continuing =
            playing &&
            (context.behavior.machines.length > 0 ||
              (!context.animation && !!context.drivers?.length) ||
              (!!context.animation &&
                (context.animation.mode !== "once" ||
                  (result?.session.seconds ?? session.seconds) <
                    context.animation.frames / context.animation.fps)));
          return {
            audioCues:
              result?.events.reduce(
                (sum, event) => sum + (audioBindings.get(event.eventId)?.length ?? 0),
                0,
              ) ?? 0,
            events: result?.events.length ?? 0,
            lines,
            vertices: prepared.vertices,
            continuing,
            commit() {
              const observers = result ? publish(result.session, prepared, true) : () => {};
              svgLayout?.advance(seconds);
              return () => {
                observers();
                if (result) emit(result.events);
              };
            },
          };
        },
        prepareReset(budget) {
          const next = createBehaviorSession(context, session.machineId),
            nextFrame = prepareFrame(evaluateBehavior(context, next), budget),
            lines = prepareText(nextFrame);
          return {
            events: 0,
            lines,
            vertices: nextFrame.vertices,
            continuing: false,
            commit() {
              const observers = publish(next, nextFrame, true);
              svgLayout?.resetScroll();
              cache.clear();
              return observers;
            },
          };
        },
        hasActivity: () => svgLayout?.moving() ?? false,
      },
      {
        ...options,
        autoplay: true,
      },
    );
  } catch (error) {
    effectBinding?.destroy();
    drawOrderBinding.destroy();
    svgLayout?.destroy();
    throw error;
  }
  const listeners = new AbortController(),
    restores: (() => void)[] = [];
  function point(event: MouseEvent | PointerEvent | KeyboardEvent, element: SVGElement) {
    const matrix = root.getScreenCTM();
    if (!matrix) throw new Error("Coordenadas do artboard indisponíveis.");
    const box = element.getBoundingClientRect(),
      keyboard = event instanceof view.KeyboardEvent;
    const local = new view.DOMPoint(
      keyboard ? box.x + box.width / 2 : event.clientX,
      keyboard ? box.y + box.height / 2 : event.clientY,
    ).matrixTransform(matrix.inverse());
    const boxValue = root.viewBox.baseVal;
    return {
      x: local.x,
      y: local.y,
      viewBox: [boxValue.x, boxValue.y, boxValue.width, boxValue.height] as const,
    };
  }
  function dispatch(
    event: "enter" | "leave" | "activate" | "move",
    targetId: string | null,
    native: MouseEvent | PointerEvent | KeyboardEvent,
    element: SVGElement,
    coordinates = point(native, element),
  ) {
    assertLive();
    const next = dispatchBehaviorListeners(context, session, event, targetId, coordinates);
    const settled = advanceBehavior(context, next, 0);
    publish(settled.session, prepareFrame(settled.frame));
    emit(settled.events);
    loop.invalidate();
  }
  const ownedTargets = new Set(context.behavior.listeners.map((listener) => listener.targetId));
  for (const id of ownedTargets) {
    const element = id === null ? root : elements.get(id)?.wrapper;
    if (!element) {
      loop.destroy();
      svgLayout?.destroy();
      throw new Error("Destino de listener ausente.");
    }
    const relevant = context.behavior.listeners.filter((listener) => listener.targetId === id),
      activates = relevant.some((listener) => listener.event === "activate"),
      enters = relevant.some(
        (listener) => listener.event === "enter" || listener.event === "leave",
      ),
      moves = relevant.some((listener) => listener.event === "move");
    const original = new Map(
      ["tabindex", "role", "aria-label"].map((name) => [name, element.getAttribute(name)]),
    );
    if (activates || enters || moves) {
      element.setAttribute("tabindex", "0");
      if (activates) element.setAttribute("role", "button");
      if (!element.hasAttribute("aria-label"))
        element.setAttribute(
          "aria-label",
          id === null ? "Artboard interativo" : (content.get(id)?.name ?? "Objeto interativo"),
        );
    }
    restores.push(() => {
      for (const [name, value] of original)
        if (value === null) element.removeAttribute(name);
        else element.setAttribute(name, value);
    });
    const signal = listeners.signal;
    if (moves) {
      let cursor: ReturnType<typeof point> | undefined;
      element.addEventListener(
        "keydown",
        (event) => {
          if (
            event.target !== element ||
            !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
          )
            return;
          event.preventDefault();
          const current = cursor ?? point(event, element),
            factor = event.shiftKey ? 0.1 : 0.01;
          cursor = {
            ...current,
            x: Math.max(
              current.viewBox[0],
              Math.min(
                current.viewBox[0] + current.viewBox[2],
                current.x +
                  (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0) *
                    current.viewBox[2] *
                    factor,
              ),
            ),
            y: Math.max(
              current.viewBox[1],
              Math.min(
                current.viewBox[1] + current.viewBox[3],
                current.y +
                  (event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0) *
                    current.viewBox[3] *
                    factor,
              ),
            ),
          };
          dispatch("move", id, event, element, cursor);
        },
        { signal },
      );
      element.addEventListener(
        "pointermove",
        (event) => {
          cursor = point(event, element);
        },
        { signal },
      );
    }
    if (relevant.some((listener) => listener.event === "enter")) {
      element.addEventListener("pointerenter", (event) => dispatch("enter", id, event, element), {
        signal,
      });
      element.addEventListener(
        "focus",
        () => {
          const event = new view.KeyboardEvent("keydown");
          dispatch("enter", id, event, element);
        },
        { signal },
      );
    }
    if (relevant.some((listener) => listener.event === "leave")) {
      element.addEventListener("pointerleave", (event) => dispatch("leave", id, event, element), {
        signal,
      });
      element.addEventListener(
        "blur",
        () => {
          const event = new view.KeyboardEvent("keydown");
          dispatch("leave", id, event, element);
        },
        { signal },
      );
    }
    if (relevant.some((listener) => listener.event === "move"))
      element.addEventListener("pointermove", (event) => dispatch("move", id, event, element), {
        signal,
      });
    if (activates) {
      element.addEventListener("click", (event) => dispatch("activate", id, event, element), {
        signal,
      });
      element.addEventListener(
        "keydown",
        (event) => {
          if (
            (event.key === "Enter" || event.key === " ") &&
            !event.repeat &&
            event.target === element
          ) {
            event.preventDefault();
            dispatch("activate", id, event, element);
          }
        },
        { signal },
      );
    }
  }
  return {
    get playing() {
      return loop.playing;
    },
    get time() {
      return session.seconds;
    },
    get dataVersion() {
      assertLive();
      return dataVersion;
    },
    play() {
      assertLive();
      loop.play();
    },
    pause() {
      assertLive();
      loop.pause();
    },
    setPolicy(value: FramePolicy) {
      assertLive();
      loop.setPolicy(value);
    },
    getInput(id: string) {
      assertLive();
      if (!session.inputs.has(id)) throw new Error("Input não encontrado.");
      return session.inputs.get(id);
    },
    setInput(id: string, value: unknown) {
      writeInputs({ [id]: value });
    },
    setInputs(values: Readonly<Record<string, unknown>>) {
      writeInputs(values);
    },
    getData(instanceId: string, path?: readonly string[]) {
      assertLive();
      if (!context.data || !session.data) throw new Error("Player sem modelos de dados.");
      const value = path
        ? resolveDataPath(context.data, session.data, instanceId, path).value
        : session.data.get(instanceId);
      if (value === undefined) throw new Error("Instância de dados ausente.");
      return structuredClone(value);
    },
    editData(changes: unknown) {
      assertWritable();
      const result = advanceBehavior(context, editBehaviorData(context, session, changes), 0);
      publish(result.session, prepareFrame(result.frame));
      loop.invalidate();
      emit(result.events);
    },
    trigger(id: string) {
      assertWritable();
      const result = advanceBehavior(context, fireBehaviorTrigger(context, session, id), 0);
      publish(result.session, prepareFrame(result.frame));
      loop.invalidate();
      emit(result.events);
    },
    writeBinding(id: string, value: InputValue) {
      assertWritable();
      const result = advanceBehavior(context, writeBehaviorBinding(context, session, id, value), 0);
      publish(result.session, prepareFrame(result.frame));
      loop.invalidate();
      emit(result.events);
    },
    reset() {
      assertWritable();
      clock.reset(path);
    },
    setMachine(id: string) {
      assertWritable();
      const next = createBehaviorSession(context, id);
      next.inputs = new Map(session.inputs);
      if (session.data) next.data = session.data;
      publish(next);
      cache.clear();
      loop.invalidate();
    },
    inspect() {
      assertLive();
      return {
        machineId: session.machineId,
        time: session.seconds,
        layers: [...session.layers].map(([id, clock]) => ({
          id,
          stateId: clock.stateId,
          time: clock.seconds,
          transitionId: clock.blend?.transitionId ?? null,
        })),
      };
    },
    inspectLayout() {
      assertLive();
      return svgLayout?.inspect() ?? null;
    },
    inspectRig() {
      assertLive();
      return structuredClone(frame.rigDiagnostics);
    },
    getScroll(id: string | null) {
      assertLive();
      if (!svgLayout) throw new Error("Player sem layout.");
      return svgLayout.getScroll(id);
    },
    onEvent(callback: (event: BehaviorEmission) => void) {
      assertLive();
      if (subscribers.size >= 1000) throw new Error("Limite de assinantes de eventos.");
      subscribers.add(callback);
      return () => {
        subscribers.delete(callback);
      };
    },
    onInputChange(callback: (id: string, value: InputValue) => void) {
      assertLive();
      if (changes.size >= 1000) throw new Error("Limite de observadores de inputs.");
      changes.add(callback);
      return () => {
        changes.delete(callback);
      };
    },
    onDataChange(callback: () => void) {
      assertLive();
      if (dataChanges.size >= 1000) throw new Error("Limite de assinantes de dados.");
      dataChanges.add(callback);
      return () => {
        dataChanges.delete(callback);
      };
    },
    onStateChange(callback: (snapshot: BehaviorDebug) => void) {
      assertLive();
      if (stateChanges.size >= 1000) throw new Error("Limite de assinantes de estados.");
      stateChanges.add(callback);
      return () => {
        stateChanges.delete(callback);
      };
    },
    advance(seconds: number) {
      assertWritable();
      clock.advance(path, seconds);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      loop.destroy();
      listeners.abort();
      effectBinding?.destroy();
      drawOrderBinding.destroy();
      for (const restore of restores) restore();
      svgLayout?.destroy();
      subscribers.clear();
      changes.clear();
      dataChanges.clear();
      stateChanges.clear();
      cache.clear();
    },
  };
}

export function createInteractiveSvgPlayer(
  root: SVGSVGElement,
  input: unknown,
  options: InteractivePlayerOptions = {},
) {
  return createInteractiveSvgScene(root, input, options);
}
function createInteractiveSvgScene(
  root: SVGSVGElement,
  input: unknown,
  options: InteractivePlayerOptions,
  ownedAssets?: BrowserAssets,
  restoreArtwork?: () => void,
) {
  const document = parseInteractiveDocument(input),
    clock = createSceneClock(),
    view = ownerWindow(root);
  validateSvgGradients(root, document);
  const audio = createBrowserAudioMixer(documentAudioAssets(document), {
      onError: options.onError,
      context: options.audioContext,
      view,
    }),
    audioObservers = new Set<(cue: AudioCueEmission) => void>(),
    audioStateObservers = new Set<(status: AudioStatus) => void>();
  const removeAudioObserver = audio.onChange((status) => {
    options.onAudioStateChange?.({ ...status });
    for (const observer of audioStateObservers) observer({ ...status });
  });
  const resources = new Map(document.assets?.map((asset) => [asset.id, asset]) ?? []),
    players = new Map<string, ReturnType<typeof createInteractiveScope>>(),
    cleanups: (() => void)[] = [
      ...(ownedAssets ? [() => ownedAssets.destroy()] : []),
      ...(restoreArtwork ? [restoreArtwork] : []),
    ];
  let autoplay = false;
  let teardown: Promise<void> | undefined,
    closeReported = false;
  const initialBudget = { remaining: 2_000_000 };
  const reportAudioClose = (error: unknown) => {
    const reason = error instanceof Error ? error : new Error("Falha ao encerrar áudio.");
    if (options.onError) options.onError(reason);
    else
      queueMicrotask(() => {
        throw reason;
      });
  };
  function closeScene(): Promise<void> {
    if (teardown) return teardown;
    const errors: unknown[] = [];
    const terminal: AudioStatus = {
      ...audio.inspect(),
      enabled: false,
      activeVoices: 0,
      destroyed: true,
      contextState: audio.inspect().contextState === "not-created" ? "not-created" : "closing",
    };
    const nativeClosed = audio.destroy();
    teardown = nativeClosed.then(
      () => {
        if (errors.length) throw new AggregateError(errors, "Falha ao encerrar cena/áudio.");
      },
      (error) => {
        throw new AggregateError([...errors, error], "Falha ao encerrar cena/áudio.");
      },
    );
    removeAudioObserver();
    audioObservers.clear();
    clock.notify(() => {
      for (const callback of [options.onAudioStateChange, ...audioStateObservers])
        if (callback) {
          try {
            callback({ ...terminal });
          } catch (error) {
            errors.push(error);
          }
        }
    });
    audioStateObservers.clear();
    for (const cleanup of cleanups.reverse()) {
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    cleanups.length = 0;
    try {
      clock.destroy();
    } catch (error) {
      errors.push(error);
    }
    return teardown;
  }
  function mount(
    root: SVGSVGElement,
    document: InteractiveDocument,
    path: readonly string[],
    speed: number,
  ) {
    autoplay ||=
      !!document.behavior.machines.length ||
      !!document.playback.drivers.length ||
      !!document.animationId;
    const player = createInteractiveScope(
      root,
      document,
      {
        ...options,
        onEvent(event) {
          for (const binding of document.audio?.bindings ?? [])
            if (binding.eventId === event.eventId) {
              if (audio.inspect().destroyed) return;
              const cue: AudioCueEmission = {
                bindingId: binding.id,
                eventId: event.eventId,
                assetId: binding.assetId,
                caption: binding.caption,
                instancePath: [...path],
              };
              audio.play(
                binding.assetId,
                binding.volume,
                Math.max(0, player.time - event.time) / speed,
                path,
              );
              options.onAudioCue?.({ ...cue, instancePath: [...path] });
              for (const observer of audioObservers) {
                if (audio.inspect().destroyed) return;
                observer({ ...cue, instancePath: [...path] });
              }
            }
          if (!audio.inspect().destroyed)
            options.onEvent?.(path.length ? { ...event, instancePath: [...path] } : event);
        },
        ...(path.length
          ? {
              machineId: undefined,
              onStateChange: undefined,
              onPlaybackChange: undefined,
            }
          : {}),
      },
      clock,
      path,
      speed,
      initialBudget,
      resources,
    );
    players.set(JSON.stringify(path), player);
    cleanups.push(() => player.destroy());
    for (const component of document.components ?? []) {
      const wrapper = [...root.querySelectorAll("[data-edi-object]")].find(
          (element) => element.getAttribute("data-edi-object") === component.rootId,
        ),
        viewport = wrapper?.firstElementChild;
      if (!(viewport instanceof view.SVGSVGElement))
        throw new Error("Viewport interativo de componente ausente.");
      mount(
        viewport,
        component.document,
        [...path, ...component.instancePath],
        speed * component.speed,
      );
    }
    return player;
  }
  try {
    const player = mount(root, document, [], 1);
    clock.start(root, {
      ...options,
      autoplay: options.autoplay ?? autoplay,
      onActivityChange(active) {
        if (!active && !audio.inspect().destroyed) audio.stop();
        options.onActivityChange?.(active);
      },
    });
    return {
      ...player,
      enableAudio() {
        player.inspect();
        return audio.enable();
      },
      disableAudio() {
        player.inspect();
        audio.disable();
      },
      setAudioVolume(value: number) {
        player.inspect();
        audio.setVolume(value);
      },
      inspectAudio() {
        player.inspect();
        return audio.inspect();
      },
      onAudioCue(callback: (cue: AudioCueEmission) => void) {
        player.inspect();
        if (audioObservers.size >= 1000) throw new Error("Limite de observadores de áudio.");
        audioObservers.add(callback);
        return () => {
          audioObservers.delete(callback);
        };
      },
      onAudioStateChange(callback: (status: AudioStatus) => void) {
        player.inspect();
        if (audioStateObservers.size >= 1000)
          throw new Error("Limite de observadores de estado de áudio.");
        audioStateObservers.add(callback);
        return () => {
          audioStateObservers.delete(callback);
        };
      },
      get playing() {
        return player.playing;
      },
      get time() {
        return player.time;
      },
      get dataVersion() {
        return player.dataVersion;
      },
      getComponent(instancePath: readonly string[]) {
        player.inspect();
        const component = players.get(JSON.stringify(instancePath));
        if (!component || !instancePath.length)
          throw new Error("Instância interativa não encontrada.");
        const { destroy: _destroy, ...controls } = component;
        const audioPath = [...instancePath];
        return {
          ...controls,
          pause() {
            audio.stop(audioPath);
            component.pause();
          },
          reset() {
            audio.stop(audioPath);
            component.reset();
          },
          get playing() {
            return component.playing;
          },
          get time() {
            return component.time;
          },
          get dataVersion() {
            return component.dataVersion;
          },
        };
      },
      onEvent(callback: (event: BehaviorEmission) => void) {
        const removes: (() => void)[] = [];
        try {
          for (const [key, value] of players)
            removes.push(
              value.onEvent((event) => callback({ ...event, instancePath: JSON.parse(key) })),
            );
        } catch (error) {
          for (const remove of removes) remove();
          throw error;
        }
        return () => {
          for (const remove of removes) remove();
        };
      },
      reset() {
        audio.stop();
        player.reset();
      },
      destroy() {
        if (closeReported) return;
        closeReported = true;
        void closeScene().catch(reportAudioClose);
      },
      destroyAsync() {
        closeReported = true;
        return closeScene();
      },
    };
  } catch (error) {
    closeReported = true;
    void closeScene().catch(reportAudioClose);
    throw error;
  }
}

/** Instantiates the local, bundled Yoga WASM only for documents that need layout.
 * Abort is checked before any DOM ownership begins (React unmount/doc swap). */
export async function createInteractiveSvgPlayerAsync(
  root: SVGSVGElement,
  input: unknown,
  options: InteractivePlayerOptions = {},
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const document = parseInteractiveDocument(input);
  return prepareInteractiveSvgScene(root, document, options, signal);
}
const visualOwners = new WeakMap<SVGSVGElement, object>();
export async function createVisualSvgPlayerAsync(
  root: SVGSVGElement,
  input: unknown,
  options: InteractivePlayerOptions = {},
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (visualOwners.has(root))
    throw new Error("SVG já possui uma montagem visual ativa ou pendente.");
  const owner = {},
    release = () => {
      if (visualOwners.get(root) === owner) visualOwners.delete(root);
    };
  visualOwners.set(root, owner);
  try {
    const document = parseInteractiveDocument(input),
      mount = prepareVisualMount(root, describeVisualDocument(document));
    return await prepareInteractiveSvgScene(root, document, options, signal, () => {
      const restore = mount();
      return () => {
        try {
          restore();
        } finally {
          release();
        }
      };
    });
  } catch (error) {
    release();
    throw error;
  }
}
async function prepareInteractiveSvgScene(
  root: SVGSVGElement,
  document: InteractiveDocument,
  options: InteractivePlayerOptions,
  signal?: AbortSignal,
  mount?: () => () => void,
) {
  if (signal?.aborted) throw signal.reason;
  const assets = document.assets
    ? await loadBrowserAssets(document.assets, signal, root.ownerDocument.fonts)
    : undefined;
  let restore: (() => void) | undefined;
  try {
    await loadDocumentFonts(root, document, signal);
    const hasLayout = (document: InteractiveDocument): boolean =>
      !!document.layout ||
      !!document.components?.some((component) => hasLayout(component.document));
    const layoutEngine =
      hasLayout(document) && !options.layoutEngine
        ? await createLayoutEngine()
        : options.layoutEngine;
    if (signal?.aborted) throw signal.reason;
    restore = mount?.();
    return createInteractiveSvgScene(root, document, { ...options, layoutEngine }, assets, restore);
  } catch (error) {
    restore?.();
    assets?.destroy();
    throw error;
  }
}
