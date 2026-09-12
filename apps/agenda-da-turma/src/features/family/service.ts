import "server-only";
import { randomBytes } from "node:crypto";
import { err, ok } from "@informach/auth/server-actions";
import type { z } from "zod";
import { billing } from "@/lib/billing";
import { env } from "@/lib/env";
import type { familyAccessSchema, familyInviteSchema } from "./schemas";
import {
  acceptFamilyInvitationAtomically,
  cancelFamilyInvitation,
  deleteFamilyAccess,
  findFamilyInvitation,
  insertFamilyInvitation,
  replaceFamilyAccess,
} from "./write-repository";

export { hashFamilyToken } from "./tokens";
export async function createFamilyInvitation(
  userId: string,
  input: z.infer<typeof familyInviteSchema>,
) {
  if (!(await billing.hasProSubscription({ type: "user", id: userId })))
    return err({ code: "PRO_REQUIRED" } as const);
  const token = randomBytes(32).toString("hex");
  const result = await insertFamilyInvitation(userId, input, token);
  return result.ok
    ? ok({ id: result.value.id, url: `${env.NEXT_PUBLIC_APP_URL}/familia/convite?token=${token}` })
    : result;
}
export async function acceptFamilyInvitation(userId: string, token: string) {
  const invitation = await findFamilyInvitation(token);
  if (!invitation) return err({ code: "INVITATION_UNAVAILABLE" } as const);
  if (!(await billing.hasProSubscription({ type: "user", id: invitation.ownerUserId })))
    return err({ code: "OWNER_PLAN_REQUIRED" } as const);
  return acceptFamilyInvitationAtomically(userId, invitation.id, invitation.ownerUserId);
}
export async function revokeFamilyAccess(userId: string, memberId: string) {
  return deleteFamilyAccess(userId, memberId);
}
export async function revokeFamilyInvitation(userId: string, id: string) {
  return cancelFamilyInvitation(userId, id);
}
export async function updateFamilyAccess(
  userId: string,
  input: z.infer<typeof familyAccessSchema>,
) {
  const isPro = await billing.hasProSubscription({ type: "user", id: userId });
  return replaceFamilyAccess(userId, input, isPro);
}
