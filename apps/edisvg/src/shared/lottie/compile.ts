import {
  type Affine,
  factorAffine,
  identityMatrix,
  inverse,
  multiply,
  transformPoint,
} from "@informach/edi-motion";
import { assertSameTopology, type Contour } from "@informach/edi-motion/geometry";
import type { SceneNode } from "../sceneTypes";
import { lottieDashProperties } from "./dashes";
import { lottieGlobalTransform } from "./globalTransform";
import { stringifyLottieJson } from "./json";
import type {
  BezierShape,
  EasingHandle,
  ImageAsset,
  Layer,
  LottieDocument,
  LottieReport,
  NullLayer,
  ScalarKeyframe,
  ScalarProperty,
  ShapeElement,
  ShapeKeyframe,
  ShapeLayer,
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
      images,
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
  // Trim changes the vertex count and may empty or split contours every frame. Its paths get a
  // fixed number of shape slots (two per source contour: an open contour can wrap into two
  // pieces) sampled with hold keys, exact at every sample without interpolating between them.
  const trimmed = new Set(
      (compiled.playback.rigScopes ?? []).flatMap((scope) =>
        (scope.rig.trims ?? []).flatMap((trim) => (trim.layerId ? [] : [trim.targetId])),
      ),
    ),
    slotsOf = (id: string) => (geometries.get(id)?.length ?? 0) * (trimmed.has(id) ? 2 : 1),
    // lottie-web keeps the vertex count of a shape's first keyframe, so every trimmed slot keeps
    // one size: the longest source contour plus the cut point. Shorter pieces repeat their last
    // vertex (zero-length segments add no length, caps or joins to a butt-capped stroke).
    slotSize = (id: string) =>
      Math.max(0, ...(geometries.get(id) ?? []).map((contour) => contour.points.length)) + 1;
  const shapes = new Map<string, Sample<BezierShape, ShapeKeyframe>[]>(),
    imageAngles = new Map<string, Sample<number, ScalarKeyframe>>(),
    turns = new Map<string, number>(),
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
    for (let index = 0; index < slotsOf(node.id); index++)
      credit({ ty: "sh", nm: `${node.name} ${index + 1}`, ks: { a: 0, k: null } });
    visible(node.id);
  }
  const [, , width, height] = compiled.scene.viewBox,
    globalOpacity = globalTransform.layer.o.a === 0 ? globalTransform.layer.o.k : 100;
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
    shapeKey = (t: number, value: BezierShape): ShapeKeyframe => ({ t, s: [value], ...linear() }),
    holdShapeKey = (t: number, value: BezierShape): ShapeKeyframe => ({ t, s: [value], h: 1 });
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
    hold = false,
  ) {
    states[index] = record(states[index], time, value, sameShape, hold ? holdShapeKey : shapeKey);
  }
  try {
    visitLottieSamples(
      prepared,
      budget,
      ({ time, frame, world, prefix, paintTransforms, gradientSamples }) => {
        for (const [id, image] of images) {
          spend(8);
          // The image's whole matrix becomes a null layer (T·R·S, parented to the global
          // transform) and the image layer (inner rotation, then the box fit).
          const matrix = world.get(id);
          if (!matrix) throw new Error("Matriz Lottie ausente.");
          const factors = factorAffine(multiply(prefix, matrix)),
            unwrap = (key: string, angle: number) => {
              const previous = turns.get(key),
                value =
                  previous === undefined
                    ? angle
                    : previous + ((((angle - previous + 180) % 360) + 360) % 360) - 180;
              turns.set(key, value);
              return value;
            };
          vectorSample(`${id}:image-p`, time, [factors.position.x, factors.position.y]);
          vectorSample(`${id}:image-s`, time, [factors.scale.x * 100, factors.scale.y * 100]);
          scalarSample(imageAngles, `${id}:image-r`, time, unwrap(`${id}:r`, factors.rotation));
          scalarSample(
            imageAngles,
            `${id}:image-inner`,
            time,
            unwrap(`${id}:inner`, factors.innerRotation),
          );
          // Lottie parents pass transforms, not opacity: the layer carries the whole chain.
          let opacity = globalOpacity / 100,
            cursor: string | null = id;
          while (cursor) {
            const entry = byId.get(cursor),
              pose = frame.poses.get(cursor);
            if (!entry || !pose) throw new Error("Hierarquia Lottie de imagem incompleta.");
            const hidden =
              entry.node.visible === false ||
              entry.node.attrs.display === "none" ||
              frame.visibility.get(cursor) === false ||
              (cursor === id && visibility.get(cursor) === false);
            opacity *= hidden ? 0 : (pose.opacity / 100) * svgOpacity(entry.node.attrs.opacity);
            cursor = entry.parentId;
          }
          scalarSample(opacities, `${id}:image-o`, time, opacity * 100);
          if (!image.local.every(Number.isFinite)) throw new Error("Encaixe de imagem inválido.");
        }
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
            matrix = world.get(node.id),
            isTrimmed = trimmed.has(node.id);
          if (!matrix) throw new Error("Matriz Lottie ausente.");
          if (!isTrimmed) assertSameTopology(base, geometry);
          else if (geometry.length > slotsOf(node.id))
            throw new Error("Trim produziu mais contornos do que o perfil Lottie reserva.");
          const states = shapes.get(node.id) ?? [];
          shapes.set(node.id, states);
          const drawingMatrix = localPaintSpace ? identityMatrix() : multiply(prefix, matrix),
            validationMatrix =
              localPaintSpace && !strokes.has(node.id)
                ? multiply(globalTransform.worldPrefix, matrix)
                : undefined;
          if (isTrimmed) {
            // An empty slot is a zero-length subpath. Butt caps draw nothing, so it stays at the
            // path start; round/square caps would paint a dot, so it is placed far outside the
            // composition (clipped by its viewport) through the inverse of the layer matrix.
            // The point sits just outside the composition (in composition units, whatever the
            // layer scale), so its local coordinates stay within the vector profile.
            const composition = multiply(globalTransform.worldPrefix, matrix),
              capped =
                (strokes.get(node.id)?.cap ?? 1) !== 1 &&
                Math.abs(composition[0] * composition[3] - composition[1] * composition[2]) > 1e-12,
              outside = -4 * Math.max(width, height),
              far = capped ? transformPoint(inverse(composition), outside, outside) : undefined,
              anchor =
                far && Math.abs(far.x) <= 1e7 && Math.abs(far.y) <= 1e7
                  ? { x: far.x, y: far.y, in: null, out: null }
                  : (base[0]?.points[0] ?? { x: 0, y: 0, in: null, out: null }),
              size = slotSize(node.id);
            for (let index = 0; index < slotsOf(node.id); index++) {
              const piece = geometry[index],
                points = piece?.points.length
                  ? piece.points
                  : [{ x: anchor.x, y: anchor.y, in: null, out: null }];
              if (points.length > size || piece?.closed)
                throw new Error(
                  "Trim produziu uma peça fora do tamanho reservado no perfil Lottie.",
                );
              const last = points.at(-1) ?? anchor,
                padded = [
                  ...points,
                  ...Array.from({ length: size - points.length }, () => ({
                    x: last.x,
                    y: last.y,
                    in: null,
                    out: null,
                  })),
                ];
              shapeSample(
                states,
                index,
                time,
                bezier({ closed: false, points: padded }, drawingMatrix, validationMatrix),
                true,
              );
            }
          } else
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
  function path(state: Sample<BezierShape, ShapeKeyframe>, hold: boolean): ShapeProperty {
    return property(state, hold ? holdShapeKey : shapeKey);
  }
  /** Leaves (vector objects) a shape layer draws; null draws them all. */
  let included: ReadonlySet<string> | null = null;
  const contains = (node: SceneNode): boolean =>
    included === null
      ? !images.has(node.id)
      : included.has(node.id) || node.children.some(contains);
  function nodeGroup(node: SceneNode): ShapeElement {
    const it: ShapeElement[] = [...node.children].reverse().filter(contains).map(nodeGroup),
      states = included === null || included.has(node.id) ? (shapes.get(node.id) ?? []) : [];
    for (const [index, state] of states.entries())
      it.push({ ty: "sh", nm: `${node.name} ${index + 1}`, ks: path(state, trimmed.has(node.id)) });
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
  const layers: Layer[] = [],
    assets: ImageAsset[] = [];
  const shapeLayer = (name: string, ind: number): ShapeLayer => ({
    ty: 4,
    ind,
    nm: name,
    ip: 0,
    op: report.frames,
    st: 0,
    sr: 1,
    ddd: 0,
    ao: 0,
    bm: 0,
    ks: globalTransform.layer,
    shapes: [...compiled.scene.nodes].reverse().filter(contains).map(nodeGroup),
  });
  if (!images.size) layers.push(shapeLayer(prepared.board.name, 1));
  else {
    // Paint order (bottom to top): runs of vector leaves become shape layers, with each
    // image's layers between them. Lottie lists layers top first.
    const runs: ({ kind: "shapes"; ids: Set<string> } | { kind: "image"; id: string })[] = [];
    const walk = (nodes: readonly SceneNode[]) => {
      for (const node of nodes) {
        if (images.has(node.id)) runs.push({ kind: "image", id: node.id });
        else if (node.children.length) walk(node.children);
        else {
          const last = runs.at(-1);
          if (last?.kind === "shapes") last.ids.add(node.id);
          else runs.push({ kind: "shapes", ids: new Set([node.id]) });
        }
      }
    };
    walk(compiled.scene.nodes);
    const base = {
        ip: 0,
        op: report.frames,
        st: 0,
        sr: 1,
        ddd: 0,
        ao: 0,
        bm: 0,
      } as const,
      global: NullLayer = {
        ...base,
        ty: 3,
        ind: 1,
        nm: "Transformação global",
        ks: globalTransform.layer,
      },
      stack: Layer[] = [],
      assetIds = new Map<string, string>();
    let next = 2;
    for (const run of runs) {
      if (run.kind === "shapes") {
        included = run.ids;
        stack.push(shapeLayer(`${prepared.board.name} · formas`, next++));
        included = null;
        continue;
      }
      const image = images.get(run.id),
        entry = byId.get(run.id);
      if (!image || !entry) throw new Error("Imagem Lottie ausente.");
      let refId = assetIds.get(image.asset.id);
      if (!refId) {
        refId = `image_${assetIds.size}`;
        assetIds.set(image.asset.id, refId);
        const asset: ImageAsset = {
          id: refId,
          w: image.asset.width,
          h: image.asset.height,
          u: "",
          p: image.uri,
          e: 1,
        };
        credit(asset);
        assets.push(asset);
      }
      const [sx, , , sy, ox, oy] = image.local,
        holder: NullLayer = {
          ...base,
          ty: 3,
          ind: next++,
          nm: `${entry.node.name} · posição`,
          parent: global.ind,
          ks: {
            o: { a: 0, k: 100 },
            r: scalar(imageAngles, `${run.id}:image-r`),
            p: vector(`${run.id}:image-p`),
            a: { a: 0, k: [0, 0] },
            s: vector(`${run.id}:image-s`),
          },
        };
      stack.push(holder, {
        ...base,
        ty: 2,
        ind: next++,
        nm: entry.node.name,
        refId,
        parent: holder.ind,
        ks: {
          o: scalar(opacities, `${run.id}:image-o`),
          r: scalar(imageAngles, `${run.id}:image-inner`),
          p: { a: 0, k: [0, 0] },
          // R(inner)·S(fit)·T(offset/fit) = R(inner)·T(offset)·S(fit).
          a: { a: 0, k: [-ox / sx, -oy / sy] },
          s: { a: 0, k: [sx * 100, sy * 100] },
        },
      });
    }
    // Stacking is by array order (top first); null layers draw nothing.
    layers.push(...stack.reverse(), global);
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
    assets,
    meta: {
      g: "EdiSVG",
      sampling: `${report.fps} FPS; ${clip.mode}; curvas Bézier/amostragem confirmadas; somente animação`,
    },
    layers,
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
