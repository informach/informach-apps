"use server";
import { revalidatePath } from "next/cache";
import { action, err } from "@/lib/action";
import {
  familyAcceptSchema,
  familyAccessSchema,
  familyInviteSchema,
  familyRevokeSchema,
} from "./schemas";
import {
  acceptFamilyInvitation,
  createFamilyInvitation,
  revokeFamilyAccess,
  revokeFamilyInvitation,
  updateFamilyAccess,
} from "./service";

function refreshFamily() {
  revalidatePath("/", "layout");
}
export const inviteFamilyAction = action
  .input(familyInviteSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "family-invite", max: 10, window: "1h" })
  .run(async ({ input, ctx }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const result = await createFamilyInvitation(ctx.actor.id, input);
    if (result.ok) refreshFamily();
    return result;
  });
export const acceptFamilyAction = action
  .input(familyAcceptSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "family-accept", max: 10, window: "1h" })
  .run(async ({ input, ctx }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const result = await acceptFamilyInvitation(ctx.actor.id, input.token);
    if (result.ok) refreshFamily();
    return result;
  });
export const revokeFamilyAction = action
  .input(familyRevokeSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "family-revoke", max: 30, window: "1h" })
  .run(async ({ input, ctx }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const result = await revokeFamilyAccess(ctx.actor.id, input.id);
    if (result.ok) refreshFamily();
    return result;
  });
export const revokeInvitationAction = action
  .input(familyRevokeSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "family-revoke-invite", max: 30, window: "1h" })
  .run(async ({ input, ctx }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const result = await revokeFamilyInvitation(ctx.actor.id, input.id);
    if (result.ok) refreshFamily();
    return result;
  });
export const updateFamilyAccessAction = action
  .input(familyAccessSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "family-access", max: 30, window: "1h" })
  .run(async ({ input, ctx }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const result = await updateFamilyAccess(ctx.actor.id, input);
    if (result.ok) refreshFamily();
    return result;
  });
