import type { RigDocument } from "@informach/edi-motion/rig";
import { z } from "zod";
import { inspectJsonChunk } from "./jsonInspection";

export const rigReadSchema = z.strictObject({
  collection: z.enum([
    "bones",
    "constraints",
    "targets",
    "parameterClips",
    "morphs",
    "solos",
    "skins",
    "trims",
    "joysticks",
  ]),
  offset: z.number().int().min(0).max(2000).default(0),
  limit: z.number().int().min(1).max(20).default(20),
});
export const rigValueSchema = rigReadSchema.omit({ offset: true, limit: true }).extend({
  id: z.string().min(1).max(120),
  offset: z.number().int().min(0).max(8000000).default(0),
});
function collection(
  rig: RigDocument | undefined,
  kind: z.infer<typeof rigReadSchema>["collection"],
): { id: string; value: unknown }[] {
  if (!rig) return [];
  if (kind === "bones") return rig.bones.map((bone) => ({ id: bone.targetId, value: bone }));
  if (kind === "targets") return rig.targets.map((id) => ({ id, value: id }));
  if (kind === "skins") return (rig.skins ?? []).map((skin) => ({ id: skin.id, value: skin }));
  if (kind === "trims") return (rig.trims ?? []).map((trim) => ({ id: trim.id, value: trim }));
  if (kind === "joysticks")
    return (rig.joysticks ?? []).map((joystick) => ({ id: joystick.id, value: joystick }));
  if (kind === "morphs") return (rig.morphs ?? []).map((morph) => ({ id: morph.id, value: morph }));
  if (kind === "solos") return (rig.solos ?? []).map((solo) => ({ id: solo.id, value: solo }));
  if (kind === "parameterClips")
    return (rig.parameterClips ?? []).map((clip) => ({ id: clip.animationId, value: clip }));
  return rig.constraints.map((constraint) => ({ id: constraint.id, value: constraint }));
}
export function inspectRig(rig: RigDocument | undefined, raw: unknown) {
  const request = rigReadSchema.parse(raw),
    items = collection(rig, request.collection);
  return {
    enabled: !!rig,
    collection: request.collection,
    total: items.length,
    offset: request.offset,
    nextOffset:
      request.offset + request.limit < items.length ? request.offset + request.limit : null,
    items: items.slice(request.offset, request.offset + request.limit).map(({ id }) => ({ id })),
  };
}
export function inspectRigValue(rig: RigDocument | undefined, raw: unknown) {
  const request = rigValueSchema.parse(raw),
    item = collection(rig, request.collection).find((item) => item.id === request.id);
  if (!item) throw new Error("Entidade de rig ausente.");
  return inspectJsonChunk(item.id, item.value, request.offset);
}
