import { type Affine, identityMatrix, multiply, transformPoint } from "@informach/edi-motion";
import { assertSameTopology, type Contour } from "@informach/edi-motion/geometry";
import type { SceneNode } from "../sceneTypes";
import { lottieDashProperties } from "./dashes";
import { lottieGlobalTransform } from "./globalTransform";
import { stringifyLottieJson } from "./json";
import type {
  BezierShape,
  EasingHandle,
  LottieDocument,
  LottieReport,
  ScalarKeyframe,
  ScalarProperty,
  ShapeElement,
  ShapeKeyframe,
  ShapeProperty,
  StaticProperty,
  Vector2,
  VectorKeyframe,
  VectorProperty,
} from "./model";
import { failedLottieReport, prepareLottie, svgOpacity } from "./prepare";
import { visitLottieSamples } from "./sample";

export class LottieExportError extends Error {
  constructor(
    message: string,
    readonly report: LottieReport,
  ) {
    super(message);
  }
}
const linear = (): { i: EasingHandle; o: EasingHandle } => ({
  i: { x: [1], y: [1] },
  o: { x: [0], y: [0] },
});
interface Sample<T, K> {
  initial: T;
  last: T;
  lastTime: number;
  initialBytes: number;
  keys: K[] | null;
}
function sameShape(a: BezierShape, b: BezierShape) {
  return (
    a.c === b.c &&
    a.v.length === b.v.length &&
    ["v", "i", "o"].every((name) => {
      const left = name === "v" ? a.v : name === "i" ? a.i : a.o,
        right = name === "v" ? b.v : name === "i" ? b.i : b.o;
      return left.every(
        (point, index) => point[0] === right[index]?.[0] && point[1] === right[index]?.[1],
      );
    })
  );
}
/** This is an actual Lottie composition, not an Edi document with another
 * extension. All motion/rig poses come from the shared evaluator. */
export interface LottieExport {
  document: LottieDocument;
  content: string;
  extension: "lottie.json";
  type: "application/json";
  report: LottieReport;
}
export function compileLottie(
  rawProject: unknown,
  rawOptions: unknown,
  onProgress?: (completed: number, total: number) => void,
): LottieExport {
  const prepared = prepareLottie(rawProject, rawOptions),
    {
      project,
      options,
      clip,
      compiled,
      entries,
      geometries,
      paints,
      strokes,
      localPaintSpace,
      report,
    } = prepared;
  if (!report.supported)
    throw new LottieExportError(
      report.issues.find((issue) => issue.severity === "error")?.message ??
        "Projeto fora do perfil Lottie.",
      report,
    );
  if (!options.confirmSampling)
    throw new LottieExportError(
      "Confirme explicitamente a conversão amostrada para Lottie.",
      report,
    );
  if (report.requiresAnimationOnlyConsent && !options.confirmAnimationOnly)
    throw new LottieExportError(
      "Confirme a conversão para animação sem lógica, áudio e semântica.",
      report,
    );
  if (report.requiresRendererPrecisionConsent && !options.confirmRendererPrecision)
    throw new LottieExportError(
      "Confirme explicitamente as possíveis diferenças de precisão e bordas do renderer Lottie.",
      report,
    );
  const shapes = new Map<string, Sample<BezierShape, ShapeKeyframe>[]>(),
    opacities = new Map<string, Sample<number, ScalarKeyframe>>(),
    paintAngles = new Map<string, Sample<number, ScalarKeyframe>>(),
    vectors = new Map<string, Sample<Vector2, VectorKeyframe>>(),
    byId = new Map(entries.map((entry) => [entry.node.id, entry])),
    visibility = new Map<string, boolean>(),
    budget = { remaining: 2_000_000 },
    encoder = new TextEncoder();
  const globalTransform = lottieGlobalTransform(
    project.transforms,
    compiled.scene.viewBox,
    localPaintSpace,
  );
  let recordingBytes = 0;
  function credit(value: unknown, previouslyCharged = 0) {
    const available = 8_000_000 - recordingBytes + previouslyCharged;
    if (available <= 0) throw new Error("Lottie excede orçamento de gravação de 8 MB.");
    const bytes = encoder.encode(stringifyLottieJson(value, available)).length;
    recordingBytes += bytes - previouslyCharged + 1;
    if (recordingBytes > 8_000_000) throw new Error("Lottie excede orçamento de gravação de 8 MB.");
    return bytes;
  }
  function spend(amount: number) {
    budget.remaining -= amount;
    if (budget.remaining < 0) throw new Error("Lottie excede orçamento agregado de avaliação.");
  }
  function visible(id: string, depth = 0): boolean {
    const cached = visibility.get(id);
    if (cached !== undefined) return cached;
    const entry = byId.get(id);
    if (!entry || depth > 32) throw new Error("Hierarquia Lottie inválida/profunda.");
    const value = entry.node.attrs.visibility,
      result =
        value === undefined || value === "inherit"
          ? entry.parentId
            ? visible(entry.parentId, depth + 1)
            : true
          : value === "visible";
    visibility.set(id, result);
    return result;
  }
  for (const { node } of entries) {
    credit({ ty: "gr", nm: node.name, it: [] });
    credit({
      ty: "tr",
      p: { a: 0, k: [0, 0] },
      a: { a: 0, k: [0, 0] },
      s: { a: 0, k: [100, 100] },
      r: { a: 0, k: 0 },
      o: { a: 0, k: null },
    });
    if (localPaintSpace) {
      credit({ ty: "gr", nm: "Pintura no espaço local", it: [] });
      credit({
        ty: "tr",
        p: { a: 0, k: null },
        a: { a: 0, k: [0, 0] },
        s: { a: 0, k: null },
        r: { a: 0, k: null },
        o: { a: 0, k: 100 },
      });
    }
    const paint = paints.get(node.id);
    if (paint)
      credit(
        paint.ty === "relative-gradient"
          ? {
              ...paint.style,
              s: { a: 0, k: null },
              e: { a: 0, k: null },
              o: { a: 0, k: null },
            }
          : paint,
      );
    const stroke = strokes.get(node.id);
    if (stroke) {
      credit({
        ty: "st",
        nm: "Contorno",
        ...(stroke.dashes ? { d: lottieDashProperties(stroke.dashes) } : {}),
        c: { a: 0, k: stroke.color },
        o: { a: 0, k: stroke.opacity },
        w: { a: 0, k: stroke.width },
        lc: stroke.cap,
        lj: stroke.join,
        ml: 4,
        bm: 0,
      });
    }
    for (const [index] of (geometries.get(node.id) ?? []).entries())
      credit({ ty: "sh", nm: `${node.name} ${index + 1}`, ks: { a: 0, k: null } });
    visible(node.id);
  }
  const [, , width, height] = compiled.scene.viewBox;
  function bezier(contour: Contour, matrix: Affine, fullMatrix?: Affine): BezierShape {
    const result: BezierShape = { v: [], i: [], o: [], c: contour.closed };
    for (const point of contour.points) {
      spend(6);
      const p = transformPoint(matrix, point.x, point.y),
        before = point.in ? transformPoint(matrix, point.in.x, point.in.y) : p,
        after = point.out ? transformPoint(matrix, point.out.x, point.out.y) : p;
      if (fullMatrix) {
        spend(6);
        const world = transformPoint(fullMatrix, point.x, point.y),
          incoming = point.in ? transformPoint(fullMatrix, point.in.x, point.in.y) : world,
          outgoing = point.out ? transformPoint(fullMatrix, point.out.x, point.out.y) : world;
        if (
          [
            world.x,
            world.y,
            incoming.x - world.x,
            incoming.y - world.y,
            outgoing.x - world.x,
            outgoing.y - world.y,
          ].some((value) => !Number.isFinite(value) || Math.abs(value) > 1e7)
        )
          throw new Error("Coordenadas globais Lottie excedem o perfil vetorial.");
      }
      const vertex: Vector2 = [p.x, p.y],
        incoming: Vector2 = [before.x - p.x, before.y - p.y],
        outgoing: Vector2 = [after.x - p.x, after.y - p.y];
      if (
        [...vertex, ...incoming, ...outgoing].some(
          (value) => !Number.isFinite(value) || Math.abs(value) > 1e7,
        )
      )
        throw new Error("Coordenadas Lottie excedem o perfil vetorial.");
      result.v.push(vertex);
      result.i.push(incoming);
      result.o.push(outgoing);
    }
    return result;
  }
  function record<T, K extends { t: number }>(
    previous: Sample<T, K> | undefined,
    time: number,
    value: T,
    equal: (left: T, right: T) => boolean,
    makeKey: (time: number, value: T) => K,
  ): Sample<T, K> {
    const state = previous;
    if (!state) {
      return {
        initial: value,
        last: value,
        lastTime: time,
        initialBytes: credit(value),
        keys: null,
      };
    }
    if (!equal(value, state.last)) {
      if (!state.keys) {
        const key = makeKey(0, state.initial);
        credit(key, state.initialBytes);
        state.keys = [key];
      }
      const last = state.keys.at(-1);
      if (!last) throw new Error("Canal Lottie vazio.");
      if (state.lastTime > last.t) {
        const key = makeKey(state.lastTime, state.last);
        credit(key);
        state.keys.push(key);
      }
      const key = makeKey(time, value);
      credit(key);
      state.keys.push(key);
    }
    state.last = value;
    state.lastTime = time;
    return state;
  }
  const scalarKey = (t: number, value: number): ScalarKeyframe => ({ t, s: [value], ...linear() }),
    vectorKey = (t: number, value: Vector2): VectorKeyframe => ({ t, s: value, ...linear() }),
    shapeKey = (t: number, value: BezierShape): ShapeKeyframe => ({ t, s: [value], ...linear() });
  function scalarSample(
    channels: Map<string, Sample<number, ScalarKeyframe>>,
    id: string,
    time: number,
    value: number,
  ) {
    channels.set(
      id,
      record(channels.get(id), time, value, (a, b) => a === b, scalarKey),
    );
  }
  function vectorSample(id: string, time: number, value: Vector2) {
    vectors.set(
      id,
      record(vectors.get(id), time, value, (a, b) => a[0] === b[0] && a[1] === b[1], vectorKey),
    );
  }
  function shapeSample(
    states: Sample<BezierShape, ShapeKeyframe>[],
    index: number,
    time: number,
    value: BezierShape,
  ) {
    states[index] = record(states[index], time, value, sameShape, shapeKey);
  }
  try {
    visitLottieSamples(
      prepared,
      budget,
      ({ time, frame, world, prefix, paintTransforms, gradientSamples }) => {
        for (const { node } of entries) {
          spend(1);
          const pose = frame.poses.get(node.id);
          if (!pose) throw new Error("Pose Lottie ausente.");
          const hidden =
            node.visible === false ||
            node.attrs.display === "none" ||
            frame.visibility.get(node.id) === false ||
            (node.tag !== "g" && visibility.get(node.id) === false);
          scalarSample(
            opacities,
            node.id,
            time,
            hidden ? 0 : pose.opacity * svgOpacity(node.attrs.opacity),
          );
          const gradient = gradientSamples.get(node.id);
          if (gradient) {
            vectorSample(`${node.id}:gradient-start`, time, gradient.start);
            vectorSample(`${node.id}:gradient-end`, time, gradient.end);
            scalarSample(opacities, `${node.id}:gradient`, time, gradient.opacity);
          }
          const strokeTransform = paintTransforms.get(node.id);
          if (strokeTransform) {
            scalarSample(paintAngles, node.id, time, strokeTransform.rotation);
            scalarSample(paintAngles, `${node.id}:inner`, time, strokeTransform.innerRotation);
            vectorSample(`${node.id}:p`, time, strokeTransform.position);
            vectorSample(`${node.id}:s`, time, strokeTransform.scale);
          }
          const base = geometries.get(node.id);
          if (!base) continue;
          const geometry = frame.geometry.get(node.id) ?? base,
            matrix = world.get(node.id);
          if (!matrix) throw new Error("Matriz Lottie ausente.");
          assertSameTopology(base, geometry);
          const states = shapes.get(node.id) ?? [];
          shapes.set(node.id, states);
          const drawingMatrix = localPaintSpace ? identityMatrix() : multiply(prefix, matrix),
            validationMatrix =
              localPaintSpace && !strokes.has(node.id)
                ? multiply(globalTransform.worldPrefix, matrix)
                : undefined;
          for (const [index, contour] of geometry.entries())
            shapeSample(states, index, time, bezier(contour, drawingMatrix, validationMatrix));
        }
      },
      onProgress,
    );
  } catch (error) {
    const failure = failedLottieReport(report, error);
    throw new LottieExportError(
      failure.issues[0]?.message ?? "Falha na amostragem Lottie.",
      failure,
    );
  }
  function property<T, K extends { t: number }>(
    state: Sample<T, K> | undefined,
    makeKey: (time: number, value: T) => K,
  ): StaticProperty<T> | { a: 1; k: K[] } {
    if (!state) throw new Error("Canal escalar Lottie ausente.");
    if (!state.keys) return { a: 0, k: state.initial };
    if (state.lastTime > (state.keys.at(-1)?.t ?? -1)) {
      const key = makeKey(state.lastTime, state.last);
      credit(key);
      state.keys.push(key);
    }
    return { a: 1, k: state.keys };
  }
  function scalar(
    channels: ReadonlyMap<string, Sample<number, ScalarKeyframe>>,
    id: string,
  ): ScalarProperty {
    return property(channels.get(id), scalarKey);
  }
  function vector(id: string): VectorProperty {
    return property(vectors.get(id), vectorKey);
  }
  function path(state: Sample<BezierShape, ShapeKeyframe>): ShapeProperty {
    return property(state, shapeKey);
  }
  function nodeGroup(node: SceneNode): ShapeElement {
    const it: ShapeElement[] = [...node.children].reverse().map(nodeGroup),
      states = shapes.get(node.id) ?? [];
    for (const [index, state] of states.entries())
      it.push({ ty: "sh", nm: `${node.name} ${index + 1}`, ks: path(state) });
    const paint = paints.get(node.id);
    const stroke = strokes.get(node.id);
    // Lottie paints in reverse style order: fill then stroke in SVG requires
    // the stroke style before the fill style in this shared shape scope.
    if (stroke)
      it.push({
        ty: "st",
        nm: "Contorno",
        ...(stroke.dashes ? { d: lottieDashProperties(stroke.dashes) } : {}),
        c: { a: 0, k: stroke.color },
        o: { a: 0, k: stroke.opacity },
        w: { a: 0, k: stroke.width },
        lc: stroke.cap,
        lj: stroke.join,
        ml: 4,
        bm: 0,
      });
    if (paint)
      it.push(
        paint.ty === "relative-gradient"
          ? {
              ...paint.style,
              s: vector(`${node.id}:gradient-start`),
              e: vector(`${node.id}:gradient-end`),
              o: scalar(opacities, `${node.id}:gradient`),
            }
          : paint,
      );
    if (localPaintSpace) {
      it.push({
        ty: "tr",
        p: { a: 0, k: [0, 0] },
        a: { a: 0, k: [0, 0] },
        s: { a: 0, k: [100, 100] },
        r: scalar(paintAngles, `${node.id}:inner`),
        o: scalar(opacities, node.id),
      });
    }
    if (localPaintSpace) {
      const outer: ShapeElement[] = [{ ty: "gr", nm: "Pintura no espaço local", it }];
      outer.push({
        ty: "tr",
        p: vector(`${node.id}:p`),
        a: { a: 0, k: [0, 0] },
        s: vector(`${node.id}:s`),
        r: scalar(paintAngles, node.id),
        o: { a: 0, k: 100 },
      });
      return { ty: "gr", nm: node.name, it: outer };
    }
    it.push({
      ty: "tr",
      p: { a: 0, k: [0, 0] },
      a: { a: 0, k: [0, 0] },
      s: { a: 0, k: [100, 100] },
      r: { a: 0, k: 0 },
      o: scalar(opacities, node.id),
    });
    return { ty: "gr", nm: node.name, it };
  }
  const document: LottieDocument = {
    v: "5.13.0",
    ver: 10000,
    nm: options.alt || project.name,
    fr: report.fps,
    ip: 0,
    op: report.frames,
    w: width,
    h: height,
    ddd: 0,
    assets: [],
    meta: {
      g: "EdiSVG",
      sampling: `${report.fps} FPS; ${clip.mode}; curvas Bézier/amostragem confirmadas; somente animação`,
    },
    layers: [
      {
        ty: 4,
        ind: 1,
        nm: prepared.board.name,
        ip: 0,
        op: report.frames,
        st: 0,
        sr: 1,
        ddd: 0,
        ao: 0,
        bm: 0,
        ks: globalTransform.layer,
        shapes: [...compiled.scene.nodes].reverse().map(nodeGroup),
      },
    ],
  };
  const content = stringifyLottieJson(document);
  return {
    document,
    content,
    extension: "lottie.json",
    type: "application/json",
    report,
  };
}
