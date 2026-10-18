import {
  type Affine,
  createPlaybackContext,
  evaluatePlaybackFrame,
  factorAffine,
  identityMatrix,
  multiply,
  transformMatrix,
  transformPoint,
} from "@informach/edi-motion";
import { createRigContext, evaluateRig, type RigEvaluationBudget } from "@informach/edi-motion/rig";
import { rigObjects } from "../rigObjects";
import { lottieDashWork } from "./dashes";
import { lottieGlobalTransform } from "./globalTransform";
import { LOTTIE_GRADIENT_SAMPLE_COST, type LottieGradientSample } from "./gradient";
import type { Vector2 } from "./model";
import type { LottiePaint, prepareLottie } from "./prepare";
import { conformalStrokeScale } from "./stroke";

export class LottieSampleError extends Error {
  constructor(
    readonly objectId: string,
    message: string,
  ) {
    super(message);
  }
}
export interface LottiePaintTransform {
  position: Vector2;
  scale: Vector2;
  rotation: number;
  innerRotation: number;
}
export function visitLottieSamples(
  prepared: ReturnType<typeof prepareLottie>,
  budget: RigEvaluationBudget,
  accept: (sample: {
    time: number;
    frame: ReturnType<typeof evaluatePlaybackFrame>;
    world: ReadonlyMap<string, Affine>;
    prefix: Affine;
    paintTransforms: ReadonlyMap<string, LottiePaintTransform>;
    gradientSamples: ReadonlyMap<string, LottieGradientSample>;
  }) => void,
  onProgress?: (completed: number, total: number) => void,
) {
  const {
      project,
      compiled,
      clip,
      options,
      sourceFrames,
      report,
      strokes,
      entries,
      localPaintSpace,
    } = prepared,
    context = createPlaybackContext(compiled.playback),
    objects = rigObjects(compiled.scene),
    worldContext = createRigContext({ version: 1, bones: [], constraints: [] }, objects),
    { localPrefix: prefix, worldPrefix } = lottieGlobalTransform(
      project.transforms,
      compiled.scene.viewBox,
      localPaintSpace,
    ),
    rotations = new Map<string, number>(),
    gradients: [string, Exclude<LottiePaint, { ty: "fl" }>][] = [];
  for (const [id, paint] of prepared.paints) if (paint.ty !== "fl") gradients.push([id, paint]);
  function unwrap(key: string, angle: number) {
    const previous = rotations.get(key),
      value =
        previous === undefined
          ? angle
          : previous + ((((angle - previous + 180) % 360) + 360) % 360) - 180;
    rotations.set(key, value);
    return value;
  }
  onProgress?.(0, report.frames + 1);
  for (let time = 0; time <= report.frames; time++) {
    const local =
        clip.mode === "ping-pong" && time > sourceFrames
          ? Math.max(0, sourceFrames * 2 - time)
          : Math.min(sourceFrames, time),
      frame = evaluatePlaybackFrame(context, clip, local / options.subdivisions, undefined, budget),
      world = evaluateRig(worldContext, frame.poses, budget).world,
      transforms = new Map<string, LottiePaintTransform>(),
      gradientSamples = new Map<string, LottieGradientSample>();
    for (const [id, stroke] of strokes) {
      budget.remaining -= 3;
      if (budget.remaining < 0) throw new Error("Lottie excede orçamento agregado de avaliação.");
      const matrix = world.get(id);
      if (!matrix) throw new LottieSampleError(id, "Matriz de contorno Lottie ausente.");
      try {
        const total = multiply(worldPrefix, matrix),
          scale = conformalStrokeScale(total),
          value = stroke.width * scale;
        if (!Number.isFinite(value) || value > 1e7)
          throw new Error("Largura de contorno transformado excede o limite Lottie.");
        const geometry = frame.geometry.get(id) ?? prepared.geometries.get(id);
        if (!geometry) throw new Error("Geometria de contorno ausente.");
        budget.remaining -= lottieDashWork(geometry, stroke.dashes);
        if (budget.remaining < 0)
          throw new Error("Tracejados Lottie excedem orçamento agregado de avaliação.");
        for (const contour of geometry)
          for (const vertex of contour.points)
            for (const point of [vertex, vertex.in, vertex.out]) {
              if (!point) continue;
              if (--budget.remaining < 0)
                throw new Error("Lottie excede orçamento agregado de avaliação.");
              const transformed = transformPoint(total, point.x, point.y);
              if (
                ![transformed.x, transformed.y].every(
                  (coordinate) => Number.isFinite(coordinate) && Math.abs(coordinate) <= 1e7,
                )
              )
                throw new Error("Coordenadas de contorno excedem o perfil Lottie.");
            }
      } catch (error) {
        throw new LottieSampleError(
          id,
          error instanceof Error ? error.message : "Contorno Lottie incompatível.",
        );
      }
    }
    for (const [id, gradient] of gradients) {
      budget.remaining -= LOTTIE_GRADIENT_SAMPLE_COST;
      if (budget.remaining < 0)
        throw new Error("Gradientes Lottie excedem orçamento agregado de avaliação.");
      const matrix = world.get(id);
      if (!matrix) throw new LottieSampleError(id, "Matriz de gradiente Lottie ausente.");
      let sample: LottieGradientSample;
      try {
        if (gradient.ty === "relative-gradient") {
          const geometry = frame.geometry.get(id) ?? prepared.geometries.get(id);
          if (!geometry) throw new Error("Geometria de gradiente relativo ausente.");
          sample = gradient.sample(geometry, budget);
          gradientSamples.set(id, sample);
        } else sample = { start: gradient.s.k, end: gradient.e.k, opacity: gradient.o.k };
      } catch (error) {
        throw new LottieSampleError(
          id,
          error instanceof Error ? error.message : "Gradiente relativo incompatível.",
        );
      }
      if (sample.opacity === 0) continue;
      const total = multiply(worldPrefix, matrix),
        start = sample.start,
        end = sample.end,
        center = transformPoint(total, start[0], start[1]),
        final = transformPoint(total, end[0], end[1]);
      const bounds = [center.x, center.y, final.x, final.y];
      if (gradient.ty === "gf" && gradient.t === 2) {
        const radius = Math.hypot(end[0] - start[0], end[1] - start[1]),
          rx = radius * Math.hypot(total[0], total[2]),
          ry = radius * Math.hypot(total[1], total[3]);
        bounds.push(center.x - rx, center.x + rx, center.y - ry, center.y + ry);
      }
      if (!bounds.every((value) => Number.isFinite(value) && Math.abs(value) <= 1e7))
        throw new LottieSampleError(
          id,
          "Coordenadas de gradiente transformado excedem o perfil Lottie.",
        );
    }
    // Paint-bearing compositions retain every local coordinate boundary,
    // including groups with opacity. Never recover local space by inverting
    // a parent: collapsed parents are legitimate authored poses.
    if (localPaintSpace)
      for (const { node, parentId } of entries) {
        const id = node.id;
        budget.remaining -= 3;
        if (budget.remaining < 0)
          throw new Error("Lottie excede orçamento de transformações locais.");
        try {
          const object = objects.get(id),
            pose = frame.poses.get(id);
          if (!object || !pose) throw new Error("Pose local Lottie ausente.");
          const matrix = multiply(
              multiply(object.basis ?? identityMatrix(), transformMatrix(pose)),
              object.attributeMatrix ?? identityMatrix(),
            ),
            local = factorAffine(parentId === null ? multiply(prefix, matrix) : matrix);
          if (
            ![local.position.x, local.position.y, local.scale.x * 100, local.scale.y * 100].every(
              (value) => Number.isFinite(value) && Math.abs(value) <= 1e7,
            )
          )
            throw new Error("Fatores locais de pintura excedem o perfil Lottie.");
          transforms.set(id, {
            position: [local.position.x, local.position.y],
            scale: [local.scale.x * 100, local.scale.y * 100],
            rotation: unwrap(id, local.rotation),
            innerRotation: unwrap(`${id}:inner`, local.innerRotation),
          });
        } catch (error) {
          throw new LottieSampleError(
            id,
            error instanceof Error ? error.message : "Transformação local Lottie incompatível.",
          );
        }
      }
    accept({ time, frame, world, prefix, paintTransforms: transforms, gradientSamples });
    if (time % 8 === 0 || time === report.frames) onProgress?.(time + 1, report.frames + 1);
  }
}
