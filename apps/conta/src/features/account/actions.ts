"use server";
import { CompassoTrialUnavailableError } from "@informach/billing/compasso";
import { FamilyError } from "@informach/family";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getActions } from "@/lib/action";
import { getEnv } from "@/lib/env";
import {
  acceptFamilyInvitation,
  addFamilyPerson,
  archiveFamilyPerson,
  associateFamilyProfile,
  beginTrial,
  classifyFamilyPerson,
  createAccountFamily,
  grantFamilyAccess,
  hasRecentFamilyAuthentication,
  inviteFamilyMember,
  requestFamilyPersonTransfer,
  resolveFamilyPersonTransfer,
  restoreFamilyPerson,
  revokeFamilyAccess,
  revokeFamilyInvitation,
  revokeFamilyMember,
  transferFamilyAdministration,
  updateFamilyPerson,
} from "./service";

export type FormState = {
  message: string;
  ok: boolean;
  reauthenticate?: boolean;
  invitation?: { token: string; expiresAt: string };
};
const context = { groupId: z.uuid(), personId: z.uuid() };
const confirmed = z.literal("on");
const operation = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("request-person-transfer"),
    ...context,
    targetUserId: z.string().min(1).max(200),
    expectedVersion: z.coerce.number().int().positive(),
    confirmed,
  }),
  z.object({
    operation: z.literal("resolve-person-transfer"),
    requestId: z.uuid(),
    decision: z.enum(["accept", "revoke"]),
    confirmed,
  }),
  z.object({ operation: z.literal("create-family"), name: z.string().trim().min(1).max(80) }),
  z.object({
    operation: z.literal("add-person"),
    groupId: z.uuid(),
    displayName: z.string().trim().min(1).max(80),
    kind: z.enum(["adult", "dependent"]),
  }),
  z.object({ operation: z.literal("start-trial"), groupId: z.uuid() }),
  z.object({ operation: z.literal("invite"), groupId: z.uuid(), email: z.email().max(254) }),
  z.object({
    operation: z.literal("accept-invitation"),
    token: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{43}$/),
  }),
  z.object({
    operation: z.literal("revoke-invitation"),
    groupId: z.uuid(),
    invitationId: z.uuid(),
  }),
  z.object({
    operation: z.literal("revoke-member"),
    groupId: z.uuid(),
    userId: z.string().min(1).max(200),
    confirmed,
  }),
  z.object({
    operation: z.literal("transfer-administration"),
    groupId: z.uuid(),
    userId: z.string().min(1).max(200),
    confirmed,
  }),
  z.object({
    operation: z.literal("update-person"),
    ...context,
    expectedVersion: z.coerce.number().int().positive(),
    displayName: z.string().trim().min(1).max(80),
    color: z
      .string()
      .toUpperCase()
      .regex(/^#[0-9A-F]{6}$/),
    avatar: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  }),
  z.object({
    operation: z.literal("classify-person"),
    ...context,
    expectedVersion: z.coerce.number().int().positive(),
    kind: z.enum(["adult", "dependent"]),
  }),
  z.object({ operation: z.literal("archive-person"), ...context, confirmed }),
  z.object({ operation: z.literal("restore-person"), ...context, confirmed }),
  z.object({
    operation: z.literal("associate-profile"),
    ...context,
    sourcePersonId: z.uuid(),
    expectedSourceVersion: z.coerce.number().int().positive(),
    expectedTargetVersion: z.coerce.number().int().positive(),
    app: z.string().min(1).max(80),
    confirmed,
  }),
  z.object({
    operation: z.literal("change-access"),
    ...context,
    app: z.string().min(1).max(80),
    userId: z.string().min(1).max(200),
    action: z.enum(["read", "write", "manage", "use_ai"]),
    change: z.enum(["grant", "revoke"]),
  }),
]);

export async function familyAction(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = operation.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Confira os campos e tente novamente." };
  const result = await getActions()
    .input(operation)
    .auth({ require: "user" })
    .rateLimit({ key: "conta:family", max: 15, window: "1m" })
    .run(async ({ ctx, input }): Promise<FormState> => {
      if (!ctx.actor?.emailVerified)
        return { ok: false, message: "Confirme seu e-mail para continuar." };
      if (
        (input.operation === "request-person-transfer" ||
          (input.operation === "resolve-person-transfer" && input.decision === "accept")) &&
        !(await hasRecentFamilyAuthentication(ctx.actor.id, await headers()))
      )
        return {
          ok: false,
          reauthenticate: true,
          message: "Entre novamente para confirmar sua identidade antes de transferir o cadastro.",
        };
      try {
        switch (input.operation) {
          case "request-person-transfer": {
            const { operation: _operation, confirmed: _confirmed, ...request } = input;
            await requestFamilyPersonTransfer(ctx.actor.id, request);
            break;
          }
          case "resolve-person-transfer":
            await resolveFamilyPersonTransfer(ctx.actor.id, input.requestId, input.decision);
            break;
          case "create-family":
            await createAccountFamily(ctx.actor.id, input.name);
            break;
          case "add-person":
            await addFamilyPerson(ctx.actor.id, {
              groupId: input.groupId,
              displayName: input.displayName,
              kind: input.kind,
            });
            break;
          case "start-trial":
            await beginTrial(ctx.actor.id, input.groupId, getEnv().COMPASSO_TRIAL_HASH_SECRET);
            break;
          case "invite": {
            const invitation = await inviteFamilyMember(ctx.actor.id, input.groupId, input.email);
            return {
              ok: true,
              message: "Convite criado. Compartilhe o código com o adulto convidado.",
              invitation: {
                token: invitation.token,
                expiresAt: invitation.expiresAt.toISOString(),
              },
            };
          }
          case "accept-invitation":
            await acceptFamilyInvitation(ctx.actor.id, input.token);
            break;
          case "revoke-invitation":
            await revokeFamilyInvitation(ctx.actor.id, input.groupId, input.invitationId);
            break;
          case "revoke-member":
            await revokeFamilyMember(ctx.actor.id, input.groupId, input.userId);
            break;
          case "transfer-administration":
            await transferFamilyAdministration(ctx.actor.id, input.groupId, input.userId);
            break;
          case "update-person": {
            const { operation: _operation, ...person } = input;
            await updateFamilyPerson(ctx.actor.id, person);
            break;
          }
          case "classify-person": {
            const { operation: _operation, ...person } = input;
            await classifyFamilyPerson(ctx.actor.id, person);
            break;
          }
          case "archive-person":
            await archiveFamilyPerson(ctx.actor.id, input.groupId, input.personId);
            break;
          case "restore-person":
            await restoreFamilyPerson(ctx.actor.id, input.groupId, input.personId);
            break;
          case "associate-profile": {
            const { operation: _operation, ...association } = input;
            await associateFamilyProfile(ctx.actor.id, { ...association, confirmed: true });
            break;
          }
          case "change-access": {
            const { operation: _operation, change, ...permission } = input;
            await (change === "grant" ? grantFamilyAccess : revokeFamilyAccess)(
              ctx.actor.id,
              permission,
            );
            break;
          }
        }
        return {
          ok: true,
          message:
            input.operation === "start-trial"
              ? "Seu teste começou. Aproveite o Compasso por 14 dias."
              : "Salvo. Sua família está atualizada.",
        };
      } catch (error) {
        if (error instanceof FamilyError) return { ok: false, message: error.message };
        if (error instanceof CompassoTrialUnavailableError)
          return {
            ok: false,
            message:
              error.reason === "already-used"
                ? "O teste gratuito já foi utilizado. Seus dados continuam guardados."
                : "O teste não está disponível para esta conta e família.",
          };
        throw error;
      }
    })(parsed.data);
  if (result.ok) revalidatePath("/");
  return result;
}
