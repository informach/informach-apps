import { z } from "zod";

export const profileDelegationSchema = z
  .object({
    profileId: z.uuid(),
    groupId: z.uuid(),
    delegationKey: z.uuid(),
    readGrantId: z.uuid(),
    writeGrantId: z.uuid(),
  })
  .strict();
export type ProfileDelegation = z.infer<typeof profileDelegationSchema>;

/** Read-only credentials (for example private calendars) never carry a write grant. */
export const profileReadDelegationSchema = profileDelegationSchema.omit({ writeGrantId: true });
export type ProfileReadDelegation = z.infer<typeof profileReadDelegationSchema>;
