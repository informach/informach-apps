"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fusoValido } from "@/domain/relogio";
import { canInviteGuardian, canUsePush } from "@/features/acesso/policy";
import { gerarHashDoPin, pinSchema } from "@/features/aparelho/pin";
import { createPairingCode, revokeDevice } from "@/features/aparelho/repository";
import { retainProfilesForSmallerPlan } from "@/features/billing/repository";
import { isAllowedPushEndpoint } from "@/features/lembretes/push";
import { removePushSubscription, savePushSubscription } from "@/features/lembretes/repository";
import {
  acceptInvitation,
  createInvitation,
  leaveFamily,
  removeGuardian,
  revokeInvitation,
} from "@/features/responsavel/repository";
import { avisarFamilia } from "@/features/tempo-real/bus";
import { familyAdult, familyOwner, recentParent, runAction, verifiedUser } from "@/lib/action";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import { audit } from "@/lib/observability";
import {
  completeOnboarding,
  createChild,
  deleteChild,
  setPinHash,
  updateChild,
  updateSettings,
} from "./repository";
import { familyView } from "./view";

const corSchema = z.string().regex(/^#[0-9A-F]{6}$/);
const criancaSchema = z.object({ name: z.string().trim().min(1).max(24), color: corSchema });

function atualizar() {
  revalidatePath("/", "layout");
}

/** Primeiro uso: crianças, rotinas prontas, PIN e fuso, de uma vez. */
export async function comecarAction(raw: unknown) {
  return runAction(async () => {
    const input = z
      .object({
        children: z.array(criancaSchema).min(1).max(4),
        templateIds: z.array(z.string().max(40)).max(10),
        pin: pinSchema,
        timezone: z.string().max(60).refine(fusoValido),
      })
      .parse(raw);
    const { ownerId } = await familyOwner();
    const { access } = await familyView(ownerId);
    const ids = await completeOnboarding(
      ownerId,
      {
        children: input.children,
        templateIds: input.templateIds,
        pinHash: await gerarHashDoPin(input.pin),
        timezone: input.timezone,
      },
      access.childLimit,
    );
    for (const childId of ids)
      audit({ eventType: "estrela.child_created", actorId: ownerId, payload: { childId } });
    audit({ eventType: "estrela.pin_set", actorId: ownerId, payload: { first: true } });
    atualizar();
    return { destination: "/inicio" };
  });
}

export async function adicionarCriancaAction(raw: unknown) {
  return runAction(async () => {
    const input = criancaSchema.parse(raw);
    const { ownerId, user } = await familyAdult();
    const { access } = await familyView(ownerId);
    const child = await createChild(ownerId, input, access.childLimit);
    audit({ eventType: "estrela.child_created", actorId: user.id, payload: { childId: child.id } });
    await avisarFamilia(ownerId, "ajustes");
    atualizar();
    return { id: child.id };
  });
}

export async function editarCriancaAction(raw: unknown) {
  return runAction(async () => {
    const { id, ...input } = criancaSchema.extend({ id: z.string().uuid() }).parse(raw);
    const { ownerId, user } = await familyAdult();
    await updateChild(ownerId, id, input);
    audit({
      eventType: "estrela.child_updated",
      actorId: user.id,
      payload: { childId: id, fields: ["name", "color"] },
    });
    await avisarFamilia(ownerId, "ajustes");
    atualizar();
  });
}

/** Apagar uma criança apaga a rotina, as estrelas e a meta dela. Só o titular, com e-mail recente. */
export async function apagarCriancaAction(raw: unknown) {
  return runAction(async () => {
    const id = z.string().uuid().parse(raw);
    const { ownerId } = await familyOwner({ recent: true });
    await deleteChild(ownerId, id);
    audit({ eventType: "estrela.child_deleted", actorId: ownerId, payload: { childId: id } });
    await avisarFamilia(ownerId, "ajustes");
    atualizar();
  });
}

/** No plano gratuito, a criança que continua ativa; as outras ficam guardadas. */
export async function escolherCriancaDoPlanoAction(raw: unknown) {
  return runAction(async () => {
    const childId = z.string().uuid().parse(raw);
    const { ownerId } = await familyOwner();
    await retainProfilesForSmallerPlan(ownerId, [childId], 1);
    audit({
      eventType: "estrela.child_updated",
      actorId: ownerId,
      payload: { childId, fields: ["accessEnabled"] },
    });
    await avisarFamilia(ownerId, "ajustes");
    atualizar();
  });
}

export async function salvarAjustesAction(raw: unknown) {
  return runAction(async () => {
    const input = z
      .object({
        timezone: z.string().max(60).refine(fusoValido).optional(),
        starsPerReal: z.number().int().min(1).max(100).optional(),
        warnBefore: z.number().int().min(0).max(30).optional(),
        repeatEvery: z.number().int().min(1).max(30).optional(),
        alertAfter: z.number().int().min(1).max(10).optional(),
        sound: z.boolean().optional(),
        voice: z.boolean().optional(),
        calm: z.boolean().optional(),
        chestBonus: z.number().int().min(0).max(50).optional(),
      })
      .parse(raw);
    const { ownerId, user } = await familyAdult();
    await updateSettings(ownerId, input);
    audit({
      eventType: "estrela.settings_updated",
      actorId: user.id,
      payload: { fields: Object.keys(input) },
    });
    await avisarFamilia(ownerId, "ajustes");
    atualizar();
  });
}

/** Trocar o PIN exige a conta, com o e-mail confirmado há pouco. */
export async function trocarPinAction(raw: unknown) {
  return runAction(async () => {
    const pin = pinSchema.parse(raw);
    const user = await recentParent();
    const { ownerId } = await familyAdult();
    await setPinHash(ownerId, await gerarHashDoPin(pin));
    audit({ eventType: "estrela.pin_set", actorId: user.id, payload: { first: false } });
  });
}

export async function gerarCodigoAparelhoAction(raw: unknown) {
  return runAction(async () => {
    const user = await recentParent();
    const { ownerId } = await familyAdult();
    const result = await createPairingCode(ownerId, raw);
    audit({
      eventType: "estrela.device_code_issued",
      actorId: user.id,
      payload: { deviceId: result.device.id },
    });
    return {
      code: result.code,
      expiresAt: result.device.expiresAt.toISOString(),
      url: `${env.NEXT_PUBLIC_APP_URL}/conectar?codigo=${result.code.replace("-", "")}`,
    };
  });
}

export async function desconectarAparelhoAction(raw: unknown) {
  return runAction(async () => {
    const deviceId = z.string().uuid().parse(raw);
    const user = await recentParent();
    const { ownerId } = await familyAdult();
    if (await revokeDevice(ownerId, deviceId))
      audit({ eventType: "estrela.device_revoked", actorId: user.id, payload: { deviceId } });
    await avisarFamilia(ownerId, "aparelhos");
    atualizar();
  });
}

export async function convidarResponsavelAction(raw: unknown) {
  return runAction(async () => {
    const email = z.string().trim().email().max(200).parse(raw);
    const { ownerId } = await familyOwner({ recent: true });
    const { access } = await familyView(ownerId);
    assertAllowed(canInviteGuardian(access), "PLAN", "O segundo responsável é do plano Família.");
    const invite = await createInvitation(ownerId, email);
    audit({
      eventType: "estrela.guardian_invited",
      actorId: ownerId,
      payload: { invitationId: invite.id },
    });
    atualizar();
    return { url: `${env.NEXT_PUBLIC_APP_URL}/convite?token=${invite.token}` };
  });
}

export async function cancelarConviteAction() {
  return runAction(async () => {
    const { ownerId } = await familyOwner();
    await revokeInvitation(ownerId);
    atualizar();
  });
}

export async function removerResponsavelAction() {
  return runAction(async () => {
    const { ownerId } = await familyOwner({ recent: true });
    const removido = await removeGuardian(ownerId);
    if (removido)
      audit({ eventType: "estrela.guardian_removed", actorId: ownerId, payload: { by: "owner" } });
    atualizar();
  });
}

export async function aceitarConviteAction(raw: unknown) {
  return runAction(async () => {
    const token = z.string().max(128).parse(raw);
    const user = await verifiedUser();
    const ownerId = await acceptInvitation(token, { id: user.id, email: user.email });
    audit({ eventType: "estrela.guardian_joined", actorId: user.id, payload: { ownerId } });
    await avisarFamilia(ownerId, "ajustes");
    atualizar();
    return { destination: "/inicio" };
  });
}

export async function sairDaFamiliaAction() {
  return runAction(async () => {
    const user = await recentParent();
    const ownerId = await leaveFamily(user.id);
    if (ownerId)
      audit({
        eventType: "estrela.guardian_removed",
        actorId: user.id,
        payload: { by: "guardian" },
      });
    atualizar();
    return { destination: "/comecar" };
  });
}

export async function ativarPushAction(raw: unknown) {
  return runAction(async () => {
    const sub = z
      .object({
        endpoint: z.string().url().max(800),
        keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
      })
      .parse(raw);
    const { ownerId, user } = await familyAdult();
    const { access } = await familyView(ownerId);
    assertAllowed(canUsePush(access), "PLAN", "Os alertas no celular são do plano Família.");
    assertAllowed(
      isAllowedPushEndpoint(sub.endpoint),
      "PUSH",
      "Este navegador não pode receber alertas.",
    );
    await savePushSubscription(user.id, {
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    });
    atualizar();
  });
}

export async function desativarPushAction(raw: unknown) {
  return runAction(async () => {
    const endpoint = z.string().url().max(800).parse(raw);
    const user = await verifiedUser();
    await removePushSubscription(user.id, endpoint);
    atualizar();
  });
}
