import { keyframeSchema } from "@informach/edi-motion";
import { z } from "zod";
import { artboardIdSchema } from "./identities";

const fields = { trackId: keyframeSchema.shape.id, keyId: keyframeSchema.shape.id };
export const animationKeyReferenceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("motion"), ...fields }),
  z.strictObject({ kind: z.literal("rig"), artboardId: artboardIdSchema, ...fields }),
]);
export type AnimationKeyReference = z.infer<typeof animationKeyReferenceSchema>;
export type AnimationTrackReference =
  | { kind: "motion"; trackId: string }
  | { kind: "rig"; artboardId: string; trackId: string };

/** Persisted IDs cannot contain JSON punctuation. Motion's globally unique
 * raw key IDs stay compatible; rig IDs include board, track and key domains. */
export function animationKeySelectionId(reference: AnimationKeyReference): string {
  return reference.kind === "motion"
    ? reference.keyId
    : JSON.stringify(["rig", reference.artboardId, reference.trackId, reference.keyId]);
}
export function animationTrackSelectionId(reference: AnimationTrackReference): string {
  return reference.kind === "motion"
    ? reference.trackId
    : JSON.stringify(["rig", reference.artboardId, reference.trackId]);
}
