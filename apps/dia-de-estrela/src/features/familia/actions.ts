"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fusoValido } from "@/domain/relogio";
import { canUsePush } from "@/features/acesso/policy";
import { gerarHashDoPin, pinSchema } from "@/features/aparelho/pin";
import { createPairingCode, revokeDevice } from "@/features/aparelho/repository";
import { isAllowedPushEndpoint } from "@/features/lembretes/push";
import { removePushSubscription, savePushSubscription } from "@/features/lembretes/repository";
import { avisarFamilia } from "@/features/tempo-real/bus";
import { familyAdministrator, familyAdult, runAction, verifiedUser } from "@/lib/action";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import { audit } from "@/lib/observability";
import {
  chooseLimitedChild,
  completeOnboarding,
  createChild,
  deleteChild,
  setPinHash,
  updateSettings,
} from "./repository";
import { familyView } from "./view";

const atualizar = () => revalidatePath("/", "layout");
export async function comecarAction(raw: unknown) {
  return runAction(async () => {
    const input = z
      .object({
        personIds: z.array(z.string().uuid()).min(1).max(4),
        templateIds: z.array(z.string().max(40)).max(10),
        pin: pinSchema,
        timezone: z.string().max(60).refine(fusoValido),
      })
      .parse(raw);
    const { actor } = await familyAdministrator({ recent: true });
    const ids = await completeOnboarding(actor, {
      personIds: input.personIds,
      templateIds: input.templateIds,
      pinHash: await gerarHashDoPin(input.pin),
      timezone: input.timezone,
    });
    for (const childId of ids)
      audit({ eventType: "estrela.child_created", actorId: actor.userId, payload: { childId } });
    audit({ eventType: "estrela.pin_set", actorId: actor.userId, payload: { first: true } });
    atualizar();
    return { destination: "/inicio" };
  });
}
export async function adicionarCriancaAction(raw: unknown) {
  return runAction(async () => {
    const personId = z.string().uuid().parse(raw);
    const { actor } = await familyAdministrator({ recent: true });
    const child = await createChild(actor, personId);
    audit({
      eventType: "estrela.child_created",
      actorId: actor.userId,
      payload: { childId: child.id },
    });
    await avisarFamilia(actor.familyGroupId, "ajustes");
    atualizar();
    return child;
  });
}
/** Erases only this app's history, keeping the shared person and other apps. */
export async function apagarCriancaAction(raw: unknown) {
  return runAction(async () => {
    const childId = z.string().uuid().parse(raw);
    const { actor } = await familyAdult({ recent: true });
    await deleteChild(actor, childId);
    audit({ eventType: "estrela.child_deleted", actorId: actor.userId, payload: { childId } });
    await avisarFamilia(actor.familyGroupId, "ajustes");
    atualizar();
  });
}
export async function escolherCriancaDoPlanoAction(raw: unknown) {
  return runAction(async () => {
    const childId = z.string().uuid().parse(raw);
    const { actor } = await familyAdministrator({ recent: true });
    await chooseLimitedChild(actor, childId);
    audit({
      eventType: "estrela.child_updated",
      actorId: actor.userId,
      payload: { childId, fields: ["accessEnabled"] },
    });
    await avisarFamilia(actor.familyGroupId, "ajustes");
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
    const { actor } = await familyAdministrator();
    await updateSettings(actor, input);
    audit({
      eventType: "estrela.settings_updated",
      actorId: actor.userId,
      payload: { fields: Object.keys(input) },
    });
    await avisarFamilia(actor.familyGroupId, "ajustes");
    atualizar();
  });
}
export async function trocarPinAction(raw: unknown) {
  return runAction(async () => {
    const pin = pinSchema.parse(raw);
    const { actor } = await familyAdministrator({ recent: true });
    await setPinHash(actor, await gerarHashDoPin(pin));
    audit({ eventType: "estrela.pin_set", actorId: actor.userId, payload: { first: false } });
    atualizar();
  });
}
export async function gerarCodigoAparelhoAction(raw: unknown) {
  return runAction(async () => {
    const { actor } = await familyAdult({ recent: true });
    const result = await createPairingCode(actor, raw);
    audit({
      eventType: "estrela.device_code_issued",
      actorId: actor.userId,
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
    const { actor } = await familyAdult({ recent: true });
    if (await revokeDevice(actor, deviceId))
      audit({ eventType: "estrela.device_revoked", actorId: actor.userId, payload: { deviceId } });
    await avisarFamilia(actor.familyGroupId, "aparelhos");
    atualizar();
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
    const { actor, user } = await familyAdult();
    const { access } = await familyView(actor);
    assertAllowed(canUsePush(access), "PLAN", "Os alertas no celular são do Compasso.");
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
