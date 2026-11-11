import { profileDelegationSchema } from "@informach/family/delegation-contract";
import { z } from "zod";
import { trainingContextSchema } from "../sessoes/context";
import { MAX_JUNTO } from "../sessoes/limits";

export const pairingContextSchema = trainingContextSchema.extend({
  profileIds: z
    .array(z.uuid())
    .min(1)
    .max(MAX_JUNTO)
    .refine((ids) => new Set(ids).size === ids.length),
});
export type PairingContext = z.infer<typeof pairingContextSchema>;

/** Server-issued session binding, independent of a later browser's selected family. */
export const pairingAuthoritySchema = pairingContextSchema.extend({
  sessionId: z.string().min(1).max(128),
  delegations: z
    .array(profileDelegationSchema)
    .min(1)
    .max(MAX_JUNTO)
    .refine((claims) => new Set(claims.map((claim) => claim.profileId)).size === claims.length),
});
export type PairingAuthority = z.infer<typeof pairingAuthoritySchema>;
