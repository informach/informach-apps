import type { Affine } from "../affine";
import { geometryCost } from "../geometry";
import type { Transform } from "../model";
import type { ParameterContext, ParameterDefinition, ParameterTrack } from "../parameters";
import type { PlaybackDocument } from "../playback";
import { createRigContext, evaluateRig } from "./constraints";
import type { RigEvaluationBudget, RigObject } from "./kinematics";
import { type RigDocument, rigParameterEntries, rigParameterKey } from "./model";

export function createPlaybackRigContext(document: PlaybackDocument) {
  return (document.rigScopes ?? []).map((scope) => {
    const key = JSON.stringify(scope.instancePath),
      ids = new Set(
        document.sources
          .filter((source) => JSON.stringify(source.instancePath) === key)
          .map((source) => source.id),
      ),
      objects = new Map<string, RigObject>();
    for (const object of document.objects)
      if (ids.has(object.id)) {
        if (!object.tag || object.parentId === undefined)
          throw new Error("Rig requer metadados de hierarquia.");
        objects.set(object.id, {
          ...object,
          tag: object.tag,
          parentId: object.parentId !== null && ids.has(object.parentId) ? object.parentId : null,
        });
      }
    return {
      instancePath: scope.instancePath,
      clockId: scope.clockId,
      context: createRigContext(scope.rig, objects),
    };
  });
}
export type PlaybackRigContext = ReturnType<typeof createPlaybackRigContext>;
export function createPlaybackParameterContext(rigs: PlaybackRigContext): ParameterContext {
  return parametersForScopes(
    rigs.map((scope) => ({
      rig: scope.context.rig,
      clockId: scope.clockId,
      instancePath: scope.instancePath,
    })),
  );
}
export function playbackParameterContext(document: PlaybackDocument): ParameterContext {
  return parametersForScopes(document.rigScopes ?? []);
}
function parametersForScopes(
  scopes: readonly { rig: RigDocument; clockId: string | null; instancePath: readonly string[] }[],
): ParameterContext {
  const definitions = new Map<string, ParameterDefinition>(),
    clips = new Map<string, ParameterTrack[]>();
  for (const scope of scopes) {
    for (const entry of rigParameterEntries(scope.rig))
      definitions.set(
        rigParameterKey(scope.instancePath, entry.targetId, entry.property),
        entry.definition,
      );
    for (const clip of scope.rig.parameterClips ?? []) {
      const tracks = clips.get(clip.animationId) ?? [];
      tracks.push(
        ...clip.tracks.map((track) => ({
          key: rigParameterKey(scope.instancePath, track.targetId, track.property),
          clockId: scope.instancePath.length ? (scope.clockId ?? undefined) : null,
          keys: track.keys,
        })),
      );
      clips.set(clip.animationId, tracks);
    }
  }
  return { definitions, clips };
}
export interface RigDiagnostic {
  instancePath: string[];
  id: string;
  residual: number;
  solvedResidual: number | null;
  strength: number;
  converged: boolean;
  iterations: number;
}
export function applyPlaybackRigs(
  context: PlaybackRigContext,
  input: ReadonlyMap<string, Transform>,
  budget: RigEvaluationBudget = { remaining: 2_000_000 },
  prefixes?: ReadonlyMap<string, Affine>,
  parameters?: ReadonlyMap<string, number>,
) {
  if (!context.length)
    return {
      poses: input,
      diagnostics: [],
      geometry: new Map<string, import("../geometry").Geometry>(),
      visibility: new Map<string, boolean>(),
    };
  const poses = new Map(input),
    diagnostics: RigDiagnostic[] = [],
    geometry = new Map<string, import("../geometry").Geometry>(),
    visibility = new Map<string, boolean>();
  for (const scope of context) {
    const localParameters = new Map<string, number>();
    for (const entry of rigParameterEntries(scope.context.rig)) {
      const value = parameters?.get(
        rigParameterKey(scope.instancePath, entry.targetId, entry.property),
      );
      if (value !== undefined)
        localParameters.set(rigParameterKey([], entry.targetId, entry.property), value);
    }
    const evaluated = evaluateRig(scope.context, poses, budget, prefixes, localParameters);
    for (const [id, value] of evaluated.poses) poses.set(id, value);
    for (const [id, value] of evaluated.geometry) geometry.set(id, value);
    for (const [id, value] of evaluated.visibility) visibility.set(id, value);
    for (const diagnostic of evaluated.diagnostics)
      diagnostics.push({ ...diagnostic, instancePath: scope.instancePath });
  }
  if (context.some((scope) => scope.context.rig.trims?.length)) {
    let vertices = 0;
    for (const scope of context)
      for (const [id, object] of scope.context.objects) {
        if (--budget.remaining < 0)
          throw new Error("Trim expandido excede orçamento de avaliação.");
        vertices += geometryCost(geometry.get(id) ?? object.geometry ?? []);
        if (vertices > 100000)
          throw new Error("Trim expandido excede orçamento agregado de geometria.");
      }
  }
  return { poses, diagnostics, geometry, visibility };
}
