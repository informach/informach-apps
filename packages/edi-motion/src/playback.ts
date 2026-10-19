import { z } from "zod";
import type { Affine } from "./affine";
import { affineSchema } from "./affineSchema";
import { driverFrames } from "./driverClocks";
import { evaluateAnimation } from "./evaluator";

export { driverFrames } from "./driverClocks";

import { type Geometry, geometryCost, geometrySchema, parseGeometry } from "./geometry";
import {
  type Animation,
  type Motion,
  objectIdSchema,
  parseMotion,
  type Transform,
  transformSchema,
} from "./model";
import { parseRig, type RigDocument, type RigObject, rigCost, validateRigAnimations } from "./rig";

const objectsSchema = z
  .array(z.strictObject({ id: objectIdSchema, transform: transformSchema }))
  .max(2000);
const driverSchema = z.strictObject({
  id: objectIdSchema,
  parentId: objectIdSchema.nullable().default(null),
  animation: z.unknown(),
  speed: z.number().min(0.01).max(100),
  offsetSeconds: z.number().min(-3600).max(3600),
});
const legacySchema = z.strictObject({
  version: z.literal(1),
  motion: z.unknown(),
  objects: objectsSchema,
});
const currentSchema = z.strictObject({
  version: z.literal(2),
  motion: z.unknown(),
  objects: objectsSchema,
  drivers: z.array(driverSchema).max(2000),
  sources: z
    .array(
      z.strictObject({
        id: objectIdSchema,
        objectId: objectIdSchema,
        artboardId: z.string().regex(/^artboard-[\w-]{1,100}$/),
        instancePath: z.array(objectIdSchema).max(8),
      }),
    )
    .max(2000)
    .default([]),
});
const rigPlaybackSchema = currentSchema.extend({
  version: z.literal(3),
  objects: z
    .array(
      z.strictObject({
        id: objectIdSchema,
        transform: transformSchema,
        tag: z.string().min(1).max(20),
        parentId: objectIdSchema.nullable(),
        basis: affineSchema.optional(),
        attributeMatrix: affineSchema.optional(),
        isComponent: z.boolean().optional(),
        geometry: geometrySchema.optional(),
      }),
    )
    .max(2000),
  rigScopes: z
    .array(
      z.strictObject({
        instancePath: z.array(objectIdSchema).max(8),
        clockId: objectIdSchema.nullable(),
        rig: z.unknown(),
      }),
    )
    .max(128),
});
export interface AnimationDriver {
  id: string;
  parentId: string | null;
  animation: Animation;
  speed: number;
  offsetSeconds: number;
}
export interface PlaybackDocument {
  version: 2 | 3;
  motion: Motion;
  objects: {
    id: string;
    transform: Transform;
    tag?: string;
    parentId?: string | null;
    basis?: Affine;
    attributeMatrix?: Affine;
    isComponent?: boolean;
    geometry?: Geometry;
  }[];
  drivers: AnimationDriver[];
  sources: { id: string; objectId: string; artboardId: string; instancePath: string[] }[];
  rigScopes?: { instancePath: string[]; clockId: string | null; rig: RigDocument }[];
}
export type LegacyPlaybackDocument = Omit<
  PlaybackDocument,
  "version" | "drivers" | "sources" | "rigScopes"
> & {
  version: 1;
};
/** No DOM; usable by editor and native adapters. Expanded component channels
 * have exactly one time owner. Source keys remain scoped to their driver. */
export function parsePlaybackDocument(input: unknown): PlaybackDocument {
  if (
    typeof input === "object" &&
    input !== null &&
    "objects" in input &&
    Array.isArray(input.objects)
  ) {
    if (input.objects.length > 2000) throw new Error("Runtime excede o orçamento de objetos.");
    let vertices = 0;
    for (const object of input.objects)
      if (typeof object === "object" && object !== null && "geometry" in object) {
        vertices += geometryCost(object.geometry);
        if (vertices > 100000) throw new Error("Geometria de runtime excede orçamento agregado.");
      }
  }
  const header = z.object({ version: z.number() }).parse(input, { jitless: true });
  const raw =
    header.version === 1
      ? legacySchema.parse(input, { jitless: true })
      : header.version === 3
        ? rigPlaybackSchema.parse(input, { jitless: true })
        : currentSchema.parse(input, { jitless: true });
  const targets = new Set(raw.objects.map((object) => object.id));
  if (targets.size !== raw.objects.length) throw new Error("ID de objeto duplicado no runtime.");
  const motion = parseMotion(raw.motion, targets);
  const sources = "sources" in raw ? raw.sources : [];
  const sourceIds = new Set<string>(),
    identities = new Set<string>();
  for (const source of sources) {
    const key = JSON.stringify([source.objectId, source.instancePath]);
    if (!targets.has(source.id) || sourceIds.has(source.id) || identities.has(key))
      throw new Error("Identidade de origem incompatível com o runtime.");
    sourceIds.add(source.id);
    identities.add(key);
  }
  const owners = new Set<string>(),
    driverIds = new Set<string>(),
    drivers: AnimationDriver[] = [];
  let tracks = motion.animations.reduce((sum, clip) => sum + clip.tracks.length, 0),
    keys = motion.animations.reduce(
      (sum, clip) => sum + clip.tracks.reduce((sum, track) => sum + track.keys.length, 0),
      0,
    );
  for (const driver of "drivers" in raw ? raw.drivers : []) {
    if (!targets.has(driver.id) || driverIds.has(driver.id))
      throw new Error("Identidade de componente inválida.");
    driverIds.add(driver.id);
    const parsed = parseMotion({ version: motion.version, animations: [driver.animation] }, targets)
      .animations[0];
    if (!parsed) throw new Error("Animação do componente ausente.");
    const ownTargets = new Set(parsed.tracks.map((track) => track.targetId));
    for (const target of ownTargets) {
      if (owners.has(target)) throw new Error("Objeto com dois relógios de componente.");
      owners.add(target);
    }
    tracks += parsed.tracks.length;
    keys += parsed.tracks.reduce((sum, track) => sum + track.keys.length, 0);
    if (tracks > 12000 || keys > 100000)
      throw new Error("Orçamento agregado de componentes excedido.");
    drivers.push({ ...driver, animation: parsed });
  }
  if (motion.animations.some((clip) => clip.tracks.some((track) => owners.has(track.targetId))))
    throw new Error("Uma trilha do componente não pode ter dois donos de tempo.");
  const ordered: AnimationDriver[] = [],
    visiting = new Set<string>(),
    depths = new Map<string, number>();
  const byId = new Map(drivers.map((driver) => [driver.id, driver]));
  function visit(driver: AnimationDriver): number {
    const cached = depths.get(driver.id);
    if (cached !== undefined) return cached;
    if (visiting.has(driver.id))
      throw new Error("Relógios de componentes cíclicos ou profundos demais.");
    visiting.add(driver.id);
    let depth = 1;
    if (driver.parentId !== null) {
      const parent = byId.get(driver.parentId);
      if (!parent) throw new Error("Relógio pai de componente inexistente.");
      depth = visit(parent) + 1;
    }
    visiting.delete(driver.id);
    if (depth > 8) throw new Error("Relógios de componentes profundos demais.");
    depths.set(driver.id, depth);
    ordered.push(driver);
    return depth;
  }
  for (const driver of drivers) visit(driver);
  const rigScopes: NonNullable<PlaybackDocument["rigScopes"]> = [],
    paths = new Set<string>();
  let bones = 0,
    constraints = 0,
    controls = 0,
    deformers = 0;
  const objects: PlaybackDocument["objects"] = raw.objects;
  let vertices = 0;
  for (const object of objects)
    if (object.geometry) {
      if (object.tag !== "path") throw new Error("Geometria de runtime requer caminho.");
      object.geometry = parseGeometry(object.geometry);
      vertices += object.geometry.reduce((sum, contour) => sum + contour.points.length, 0);
      if (vertices > 100000) throw new Error("Geometria de runtime excede orçamento agregado.");
    }
  for (const scope of "rigScopes" in raw ? raw.rigScopes : []) {
    const key = JSON.stringify(scope.instancePath);
    if (paths.has(key) || (scope.clockId !== null && !driverIds.has(scope.clockId)))
      throw new Error("Escopo/relógio de rig inválido.");
    if (scope.instancePath.length) {
      const parentPath = scope.instancePath.slice(0, -1),
        instanceId = scope.instancePath.at(-1),
        instance = sources.find(
          (source) =>
            source.objectId === instanceId &&
            JSON.stringify(source.instancePath) === JSON.stringify(parentPath),
        );
      if (
        !instance ||
        !objects.find((object) => object.id === instance.id)?.isComponent ||
        (scope.clockId !== null && scope.clockId !== instance.id)
      )
        throw new Error("Escopo de rig não corresponde à instância/relógio declarado.");
    } else if (scope.clockId !== null) throw new Error("Rig raiz utiliza o relógio raiz.");
    paths.add(key);
    const owned = new Set(
      sources
        .filter((source) => JSON.stringify(source.instancePath) === key)
        .map((source) => source.id),
    );
    const scoped = new Map<string, RigObject>();
    for (const object of objects)
      if (owned.has(object.id)) {
        if (!object.tag || object.parentId === undefined)
          throw new Error("Rig requer hierarquia e tags explícitas.");
        scoped.set(object.id, {
          ...object,
          tag: object.tag,
          parentId: object.parentId !== null && owned.has(object.parentId) ? object.parentId : null,
        });
      }
    const rig = parseRig(scope.rig, scoped);
    const cost = rigCost(rig);
    vertices += cost.vertices;
    controls += cost.controls;
    deformers += cost.deformers;
    if (vertices > 100000 || controls > 100000 || deformers > 256)
      throw new Error("Runtime excede orçamento agregado de deformação/geometria.");
    validateRigAnimations(rig, [
      ...motion.animations,
      ...drivers.map((driver) => driver.animation),
    ]);
    tracks += (rig.parameterClips ?? []).reduce((sum, clip) => sum + clip.tracks.length, 0);
    keys += (rig.parameterClips ?? []).reduce(
      (sum, clip) => sum + clip.tracks.reduce((sum, track) => sum + track.keys.length, 0),
      0,
    );
    if (tracks > 12000 || keys > 100000)
      throw new Error("Orçamento agregado de canais/chaves excedido.");
    bones += rig.bones.length;
    constraints += rig.constraints.length;
    if (bones > 1000 || constraints > 256)
      throw new Error("Rig expandido excede orçamento agregado.");
    rigScopes.push({ ...scope, rig });
  }
  return {
    version: raw.version === 3 ? 3 : 2,
    motion,
    objects,
    drivers: ordered,
    sources,
    ...(raw.version === 3 ? { rigScopes } : {}),
  };
}
export function evaluatePlayback(
  animation: Animation,
  frame: number,
  drivers: readonly AnimationDriver[],
) {
  const pose = evaluateAnimation(animation, frame);
  const time = frame / animation.fps;
  for (const [id, patch] of evaluateDrivers(time, drivers)) pose.set(id, patch);
  return pose;
}
/** Component clocks can also run beneath a static/root-without-machine scene. */
export function evaluateDrivers(time: number, drivers: readonly AnimationDriver[]) {
  const pose = new Map<string, Partial<Transform>>(),
    frames = driverFrames(time, drivers);
  for (const driver of drivers) {
    const frame = frames.get(driver.id);
    if (frame === undefined) throw new Error("Relógio de componente ausente.");
    for (const [id, patch] of evaluateAnimation(driver.animation, frame)) pose.set(id, patch);
  }
  return pose;
}
