import { z } from "zod";
import { MAX_JUNTO } from "./limits";

/** The browser captures this when training starts; the server reauthorizes it on every save. */
export const trainingContextSchema = z.object({
  actorId: z.string().min(1).max(128),
  familyGroupId: z.uuid(),
});
export type TrainingContext = z.infer<typeof trainingContextSchema>;

export const legacyQueueCandidateSchema = z.object({
  id: z.uuid(),
  profileIds: z.array(z.uuid()).min(1).max(MAX_JUNTO),
});
export const legacyQueueCandidatesSchema = z.array(legacyQueueCandidateSchema).max(100);
export type LegacyQueueCandidate = z.infer<typeof legacyQueueCandidateSchema>;
