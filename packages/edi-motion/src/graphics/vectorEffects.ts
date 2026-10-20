import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { z } from "zod";
import {
  type Affine,
  identityMatrix,
  inverse,
  isInvertible,
  multiply,
  transformMatrix,
  transformPoint,
} from "../affine";
import { type Geometry, geometryPath, parseGeometry } from "../geometry";
import { objectIdSchema, type Transform } from "../model";
import type { PlaybackDocument } from "../playback";
import { createKinematics, type RigEvaluationBudget, type RigObject } from "../rig/kinematics";
import { parseSvgPath } from "../svgPath";
import {
  type SvgPrimitive,
  svgPrimitiveAttributes,
  svgPrimitivePathData,
  svgPrimitiveSchema,
} from "../svgPrimitive";
import type { EffectPaint } from "./effectPaint";

const reference = z.strictObject({
  sourceId: objectIdSchema,
  rule: z.enum(["nonzero", "evenodd"]),
});
export const vectorEffectsSchema = z
  .strictObject({
    clip: reference.optional(),
    /** `silhouette` (default): alpha of the source shape, independent of its paint. `alpha` and
     * `luminance` (5.26–5.28 formats) draw the source with its effective paint. The source's
     * own animated opacity multiplies the strength in every mode. */
    mask: reference
      .extend({
        opacity: z.number().min(0).max(1),
        mode: z.enum(["silhouette", "alpha", "luminance"]).optional(),
      })
      .optional(),
  })
  .refine((value) => value.clip !== undefined || value.mask !== undefined, {
    error: "Informe um recorte ou máscara.",
  });
export type VectorEffects = z.infer<typeof vectorEffectsSchema>;
export interface EffectObject extends RigObject {
  effects?: VectorEffects;
  pathData?: string;
  nativeShape?: SvgPrimitive;
  /** Effective paint, required only for sources of painted masks (see effectSourcePaints). */
  paint?: EffectPaint;
}
export interface VectorEffectFrame {
  targetId: string;
  kind: "clip" | "mask";
  rule: "nonzero" | "evenodd";
  /** Path syntax only; nativeShape is authoritative for native primitives. */
  d: string;
  nativeShape?: SvgPrimitive;
  matrix: Affine;
  opacity: number;
  region: { x: number; y: number; width: number; height: number };
  /** Painted masks only: luminance or alpha of the source drawn with `paint`. */
  mode?: "alpha" | "luminance";
  paint?: EffectPaint;
}

/** A validated, reusable local reference graph. No URLs, markup or DOM reads.
 * SVG viewport boundaries are explicit: source and target share one viewport. */
export function createVectorEffectContext(input: ReadonlyMap<string, EffectObject>) {
  if (input.size > 2000) throw new Error("Efeitos excedem o orçamento de objetos.");
  const objects = new Map(input);
  const lineage = new Map<string, { viewport: string | null; depth: number }>(),
    visiting = new Set<string>();
  function ancestry(id: string, calls = 0): { viewport: string | null; depth: number } {
    const cached = lineage.get(id);
    if (cached) return cached;
    if (calls > 32 || visiting.has(id)) throw new Error("Hierarquia de efeitos inválida.");
    const object = objects.get(id);
    if (!object) throw new Error("Referência de hierarquia de efeitos ausente.");
    visiting.add(id);
    const parent = object.parentId === null ? undefined : objects.get(object.parentId);
    if (object.parentId !== null && !parent) throw new Error("Grupo de efeito ausente.");
    const previous = object.parentId === null ? undefined : ancestry(object.parentId, calls + 1),
      depth = (previous?.depth ?? 0) + 1;
    if (depth > 33) throw new Error("Hierarquia de efeitos profunda demais.");
    const result = {
      depth,
      viewport: parent?.tag === "svg" ? object.parentId : (previous?.viewport ?? null),
    };
    visiting.delete(id);
    lineage.set(id, result);
    return result;
  }
  const checkedSources = new Set<string>(),
    chargedSources = new Set<string>(),
    checkedNative = new Set<string>();
  let sourceVertices = 0;
  const references: {
    targetId: string;
    kind: "clip" | "mask";
    sourceId: string;
    rule: "nonzero" | "evenodd";
    opacity: number;
    mode?: "alpha" | "luminance";
  }[] = [];
  for (const [id, object] of objects) {
    ancestry(id);
    if (!object.effects) continue;
    const effects = vectorEffectsSchema.parse(object.effects);
    if (object.tag === "svg") throw new Error("Aplique o efeito à instância, não ao viewport.");
    for (const kind of ["clip", "mask"] as const) {
      const value = effects[kind];
      if (!value) continue;
      let source = objects.get(value.sourceId);
      if (source?.nativeShape && !checkedNative.has(value.sourceId)) {
        const nativeShape = svgPrimitiveSchema.parse(source.nativeShape),
          geometry = parseGeometry(parseSvgPath(svgPrimitivePathData(nativeShape)));
        if (
          nativeShape.kind !== source.tag ||
          (source.geometry && geometryPath(source.geometry) !== geometryPath(geometry))
        )
          throw new Error("Primitiva nativa de efeito não corresponde à geometria/tag.");
        if (nativeShape.kind === "polygon" || nativeShape.kind === "polyline") {
          for (const point of nativeShape.points) Object.freeze(point);
          Object.freeze(nativeShape.points);
        }
        Object.freeze(nativeShape);
        source = { ...source, nativeShape, geometry };
        objects.set(value.sourceId, source);
        checkedNative.add(value.sourceId);
      }
      if (
        !source ||
        (source.tag !== "path" && !source.nativeShape) ||
        !source.geometry?.length ||
        value.sourceId === id
      )
        throw new Error("Recorte/máscara requer outro caminho vetorial não vazio.");
      if (source.effects) throw new Error("A fonte do efeito não pode possuir recorte/máscara.");
      if (source.pathData !== undefined && !checkedSources.has(value.sourceId)) {
        if (geometryPath(parseSvgPath(source.pathData)) !== geometryPath(source.geometry))
          throw new Error("Sintaxe nativa do efeito não corresponde à geometria.");
        checkedSources.add(value.sourceId);
      }
      if (!chargedSources.has(value.sourceId)) {
        sourceVertices += source.geometry.reduce(
          (count, contour) => count + contour.points.length,
          0,
        );
        if (sourceVertices > 100000)
          throw new Error("Fontes de efeitos excedem orçamento agregado de geometria.");
        chargedSources.add(value.sourceId);
      }
      if (ancestry(id).viewport !== ancestry(value.sourceId).viewport)
        throw new Error("Fonte e destino do efeito precisam compartilhar o viewport.");
      if (references.length >= 256) throw new Error("Cena excede 256 recortes/máscaras.");
      const painted =
        kind === "mask" && effects.mask?.mode && effects.mask.mode !== "silhouette"
          ? effects.mask.mode
          : undefined;
      if (painted && !source.paint)
        throw new Error("Máscara pintada requer a pintura efetiva da fonte.");
      references.push({
        targetId: id,
        kind,
        sourceId: value.sourceId,
        rule: value.rule,
        opacity: kind === "mask" && effects.mask ? effects.mask.opacity : 1,
        ...(painted ? { mode: painted } : {}),
      });
    }
  }
  // Coordinates above the common SVG viewport cancel. Cutting this boundary
  // explicitly also keeps the authored hash identical after an independent
  // component scope is extracted, without floating-point inverse residuals.
  const localObjects = new Map(
    [...objects].map(
      ([id, object]) =>
        [
          id,
          object.parentId !== null && objects.get(object.parentId)?.tag === "svg"
            ? { ...object, parentId: null }
            : object,
        ] as const,
    ),
  );
  return { objects: localObjects, references };
}
export type VectorEffectContext = ReturnType<typeof createVectorEffectContext>;
export function playbackVectorEffectContext(
  playback: PlaybackDocument,
  effects: ReadonlyMap<string, VectorEffects>,
  paths?: ReadonlyMap<string, string>,
  primitives?: ReadonlyMap<string, SvgPrimitive>,
  paints?: ReadonlyMap<string, EffectPaint>,
) {
  if (!effects.size) return createVectorEffectContext(new Map());
  const objects = new Map<string, EffectObject>();
  for (const object of playback.objects) {
    if (!object.tag || object.parentId === undefined)
      throw new Error("Efeitos requerem metadados completos de playback v3.");
    objects.set(object.id, {
      ...object,
      tag: object.tag,
      parentId: object.parentId,
      effects: effects.get(object.id),
      pathData: paths?.get(object.id),
      nativeShape: primitives?.get(object.id),
      paint: paints?.get(object.id),
    });
  }
  for (const id of effects.keys())
    if (!objects.has(id)) throw new Error("Destino do efeito ausente.");
  return createVectorEffectContext(objects);
}

/** Preparation is pure and budgeted. Callers commit the whole frame only after
 * this and the other scene scopes succeed. Collapsed targets have empty clips
 * until invertible again, without attempting an invalid matrix inverse. */
export function evaluateVectorEffects(
  context: VectorEffectContext,
  poses: ReadonlyMap<string, Transform>,
  geometry: ReadonlyMap<string, Geometry> = new Map(),
  prefixes?: ReadonlyMap<string, Affine>,
  budget: RigEvaluationBudget = { remaining: 2_000_000 },
): VectorEffectFrame[] {
  if (!context.references.length) return [];
  const objects = prefixes
    ? new Map(
        [...context.objects].map(([id, object]) => {
          const prefix = prefixes.get(id);
          return [
            id,
            prefix
              ? { ...object, basis: multiply(prefix, object.basis ?? identityMatrix()) }
              : object,
          ] as const;
        }),
      )
    : context.objects;
  const tree = createKinematics(objects, poses, budget),
    paths = new Map<string, string>(),
    dataCosts = new Map<string, number>(),
    encoder = new TextEncoder();
  function chargeDefinition(sourceId: string, d: string, nativeShape?: SvgPrimitive) {
    // A collapsed path emits no data. Do not cache its small cost under the
    // source ID: another target may use the same source without collapsing.
    const emptyPath = !nativeShape && d === "";
    let cost = emptyPath ? 1026 : dataCosts.get(sourceId);
    if (cost === undefined) {
      // Charge each expanded definition, not just the shared source model.
      // The allowance includes matrix/region/IDs/attributes; JSON escaping is
      // conservative for the SVG data. The same counter spans scene scopes.
      cost = 1024 + encoder.encode(JSON.stringify(nativeShape ?? d)).length;
      dataCosts.set(sourceId, cost);
    }
    budget.remaining -= cost;
    if (budget.remaining < 0)
      throw new Error("Efeitos excedem orçamento agregado de expansão/bytes de desenho.");
  }
  return context.references.map((reference) => {
    const source = objects.get(reference.sourceId);
    if (!source) throw new Error("Fonte do efeito ausente.");
    if (source.nativeShape && geometry.has(reference.sourceId))
      throw new Error(
        "Deformação de primitiva nativa não pertence ao perfil de efeitos; converta explicitamente para caminho.",
      );
    const contours = geometry.get(reference.sourceId) ?? source.geometry;
    if (!contours) throw new Error("Geometria da fonte do efeito ausente.");
    const targetWorld = multiply(
      tree.pre(reference.targetId),
      transformMatrix(tree.pose(reference.targetId)),
    );
    if (!isInvertible(targetWorld) || contours.length === 0) {
      chargeDefinition(reference.sourceId, "", source.nativeShape);
      return {
        targetId: reference.targetId,
        kind: reference.kind,
        rule: reference.rule,
        d: "",
        ...(source.nativeShape ? { nativeShape: source.nativeShape } : {}),
        matrix: identityMatrix(),
        opacity: 0,
        region: { x: 0, y: 0, width: 1, height: 1 },
      };
    }
    const matrix = multiply(inverse(targetWorld), tree.world(reference.sourceId));
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const contour of contours)
      for (const vertex of contour.points)
        for (const point of [vertex, vertex.in, vertex.out]) {
          if (!point) continue;
          if (--budget.remaining < 0) throw new Error("Efeitos excedem o orçamento de avaliação.");
          const transformed = transformPoint(matrix, point.x, point.y);
          if (
            !Number.isFinite(transformed.x) ||
            !Number.isFinite(transformed.y) ||
            Math.max(Math.abs(transformed.x), Math.abs(transformed.y)) > 1e12
          )
            throw new Error("Efeito fora do limite numérico.");
          minX = Math.min(minX, transformed.x);
          minY = Math.min(minY, transformed.y);
          maxX = Math.max(maxX, transformed.x);
          maxY = Math.max(maxY, transformed.y);
        }
    if (!Number.isFinite(minX)) throw new Error("Fonte do efeito vazia.");
    let d = source.nativeShape ? "" : paths.get(reference.sourceId);
    if (d === undefined) {
      d = geometry.has(reference.sourceId)
        ? geometryPath(contours)
        : (source?.pathData ?? geometryPath(contours));
      paths.set(reference.sourceId, d);
    }
    chargeDefinition(reference.sourceId, d, source.nativeShape);
    const paint = reference.mode ? source.paint : undefined;
    // A painted stroke reaches past the outline: half its width, up to the default miter limit
    // of 4, scaled by the largest stretch of the source-to-target matrix.
    const stroke =
      paint?.stroke !== undefined && paint.stroke !== "none"
        ? Math.max(0, Number(paint["stroke-width"] ?? "1")) *
          2 *
          Math.max(Math.hypot(matrix[0], matrix[1]), Math.hypot(matrix[2], matrix[3]))
        : 0;
    if (!Number.isFinite(stroke)) throw new Error("Contorno da máscara fora do limite numérico.");
    // Cubic curves stay within the convex hull of their control points. This
    // region encloses the filled silhouette, including numerical edge padding.
    const pad =
      Math.max(
        1,
        Math.abs(minX) * 1e-12,
        Math.abs(maxX) * 1e-12,
        Math.abs(minY) * 1e-12,
        Math.abs(maxY) * 1e-12,
      ) + stroke;
    return {
      targetId: reference.targetId,
      kind: reference.kind,
      rule: reference.rule,
      d,
      ...(source.nativeShape ? { nativeShape: source.nativeShape } : {}),
      matrix,
      opacity:
        reference.kind === "mask"
          ? (reference.opacity * tree.pose(reference.sourceId).opacity) / 100
          : 1,
      region: {
        x: minX - pad,
        y: minY - pad,
        width: maxX - minX + 2 * pad,
        height: maxY - minY + 2 * pad,
      },
      ...(reference.mode && paint ? { mode: reference.mode, paint } : {}),
    };
  });
}
export interface VectorEffectElement {
  tag: "clipPath" | "mask" | "path" | SvgPrimitive["kind"];
  attrs: Record<string, string>;
  children: VectorEffectElement[];
}
export function vectorEffectId(frame: VectorEffectFrame) {
  return `edi-effect-${bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(frame))))}`;
}
export function vectorEffectElement(
  frame: VectorEffectFrame,
  id = vectorEffectId(frame),
): VectorEffectElement {
  if (!/^edi-effect-[\w-]{1,140}$/.test(id)) throw new Error("ID de efeito inválido.");
  return {
    tag: frame.kind === "clip" ? "clipPath" : "mask",
    attrs:
      frame.kind === "clip"
        ? { id, clipPathUnits: "userSpaceOnUse" }
        : {
            id,
            maskUnits: "userSpaceOnUse",
            maskContentUnits: "userSpaceOnUse",
            "mask-type": frame.mode === "luminance" ? "luminance" : "alpha",
            x: String(frame.region.x),
            y: String(frame.region.y),
            width: String(frame.region.width),
            height: String(frame.region.height),
          },
    children: [
      {
        tag: frame.nativeShape?.kind ?? "path",
        attrs: {
          ...(frame.nativeShape ? svgPrimitiveAttributes(frame.nativeShape) : { d: frame.d }),
          transform: `matrix(${frame.matrix.join(" ")})`,
          "clip-rule": frame.rule,
          "fill-rule": frame.rule,
          ...(frame.paint ? frame.paint : { fill: "#ffffff" }),
          ...(frame.nativeShape && !frame.paint ? { stroke: "none" } : {}),
          ...(frame.kind === "mask" ? { opacity: String(frame.opacity) } : {}),
        },
        children: [],
      },
    ],
  };
}
export function vectorEffectAttributes(frames: readonly VectorEffectFrame[]) {
  const result = new Map<string, Record<string, string>>();
  for (const frame of frames) {
    const attrs = result.get(frame.targetId) ?? {};
    attrs[frame.kind === "clip" ? "clip-path" : "mask"] = `url(#${vectorEffectId(frame)})`;
    result.set(frame.targetId, attrs);
  }
  return result;
}
export function remapVectorEffects(
  value: VectorEffects,
  map: (id: string) => string,
): VectorEffects {
  return {
    ...(value.clip ? { clip: { ...value.clip, sourceId: map(value.clip.sourceId) } } : {}),
    ...(value.mask ? { mask: { ...value.mask, sourceId: map(value.mask.sourceId) } } : {}),
  };
}
