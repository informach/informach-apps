"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { deviceCookieOptions } from "@/features/aparelho/http";
import {
  conferirPin,
  DESBLOQUEIO_MS,
  emitirDesbloqueio,
  PIN_JANELA_MS,
  PIN_TENTATIVAS,
} from "@/features/aparelho/pin";
import { CHILD_COOKIE, DEVICE_COOKIE, UNLOCK_COOKIE } from "@/features/aparelho/policy";
import {
  clearAttempts,
  consumeAttempt,
  endDevice,
  getPinChallenge,
  privateHash,
} from "@/features/aparelho/repository";
import {
  childAuthority,
  getDeviceIdentity,
  pinUnlock,
  requireChild,
} from "@/features/aparelho/server";
import { completeTask } from "@/features/estrelas/repository";
import { logReminder } from "@/features/lembretes/repository";
import { requestRedemption } from "@/features/loja/repository";
import { avisarFamilia } from "@/features/tempo-real/bus";
import { runAction } from "@/lib/action";
import { env } from "@/lib/env";
import { AppError, assertAllowed } from "@/lib/errors";
import { audit } from "@/lib/observability";
import { childOfDevice } from "./dados";

/** "Quem está usando?": escolhe a criança neste aparelho. */
export async function escolherCriancaAction(raw: unknown) {
  return runAction(async () => {
    const childId = z.string().uuid().parse(raw);
    const device = await getDeviceIdentity();
    assertAllowed(device, "DEVICE", "Peça aos pais para conectar este aparelho de novo.");
    assertAllowed(device.childIds.includes(childId), "CHILD", "Criança não encontrada.");
    const { allowed } = await childOfDevice(childAuthority(device, childId), childId);
    assertAllowed(
      allowed,
      "PLAN",
      "Essa criança está fora do plano atual. Peça aos pais para ver em Ajustes.",
    );
    (await cookies()).set(CHILD_COOKIE, childId, deviceCookieOptions(device.expiresAt));
    return { destination: "/crianca/hoje" };
  });
}

export async function trocarCriancaAction() {
  (await cookies()).delete(CHILD_COOKIE);
}

/** A criança marca uma tarefa: só a que já chegou ou a próxima da fila. */
export async function marcarTarefaAction(input: unknown) {
  return runAction(async () => {
    const { childId, taskId } = z
      .object({ childId: z.string().uuid(), taskId: z.string().uuid() })
      .parse(input);
    const device = await requireChild(childId);
    const result = await completeTask({ actor: device.actor, childId, taskId });
    await avisarFamilia(device.familyGroupId, "conclusao");
    revalidatePath("/crianca", "layout");
    return { pending: result.pending, stars: result.stars, chest: result.chest };
  });
}

/** O aparelho conta cada toque de lembrete, para os pais verem quantas vezes tocou. */
export async function registrarLembreteAction(input: unknown) {
  return runAction(async () => {
    const { childId, taskId, tipo } = z
      .object({
        childId: z.string().uuid(),
        taskId: z.string().uuid(),
        tipo: z.enum(["aviso", "agora"]),
      })
      .parse(input);
    const device = await requireChild(childId);
    await logReminder(device.actor, childId, taskId, tipo);
    await avisarFamilia(device.familyGroupId, "lembrete");
  });
}

/** A criança pede um item da loja; as estrelas ficam guardadas até os pais resolverem. */
export async function pedirRecompensaAction(input: unknown) {
  return runAction(async () => {
    const { childId, rewardId } = z
      .object({ childId: z.string().uuid(), rewardId: z.string().uuid() })
      .parse(input);
    const device = await requireChild(childId);
    const pedido = await requestRedemption(device.actor, childId, rewardId);
    await avisarFamilia(device.familyGroupId, "loja");
    revalidatePath("/crianca", "layout");
    return pedido;
  });
}

/**
 * Abre a área dos pais neste aparelho por 10 minutos. Cinco erros em 15
 * minutos travam o PIN neste aparelho; o acerto zera a contagem.
 */
export async function desbloquearPinAction(raw: unknown) {
  return runAction(async () => {
    const pin = z.string().max(12).parse(raw);
    const device = await getDeviceIdentity();
    assertAllowed(device, "DEVICE", "Peça aos pais para conectar este aparelho de novo.");
    const chave = privateHash("pin", device.deviceId);
    const tentativa = await consumeAttempt(
      chave,
      PIN_TENTATIVAS,
      PIN_JANELA_MS,
      "Muitas tentativas. O PIN fica travado por 15 minutos neste aparelho.",
    );
    const family = await getPinChallenge(device);
    if (!(await conferirPin(pin, family?.pinHash))) {
      const restam = PIN_TENTATIVAS - (tentativa?.attempts ?? PIN_TENTATIVAS);
      // Uma vez por trava: no erro que a fecha, não a cada toque durante ela.
      if (restam <= 0)
        audit({
          eventType: "estrela.pin_locked",
          actorId: device.userId,
          payload: { deviceId: device.deviceId },
        });
      throw new AppError(
        "PIN",
        restam > 0
          ? `PIN errado. ${restam === 1 ? "Resta 1 tentativa" : `Restam ${restam} tentativas`}.`
          : "PIN errado. O PIN fica travado por 15 minutos neste aparelho.",
      );
    }
    assertAllowed(family?.pinHash, "PIN", "Configure o PIN na área da família.");
    await clearAttempts(chave);
    const { valor } = emitirDesbloqueio(
      env.BETTER_AUTH_SECRET,
      device.deviceId,
      family.pinGeneration,
    );
    (await cookies()).set(UNLOCK_COOKIE, valor, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: DESBLOQUEIO_MS / 1000,
    });
    audit({
      eventType: "estrela.pin_unlocked",
      actorId: device.userId,
      payload: { deviceId: device.deviceId },
    });
    return { destination: "/inicio" };
  });
}

/** Fecha a área dos pais no aparelho e volta para a criança. */
export async function fecharAreaDosPaisAction() {
  (await cookies()).delete(UNLOCK_COOKIE);
}

/** Desconecta este aparelho (com a área dos pais aberta pelo PIN). */
export async function desconectarEsteAparelhoAction() {
  return runAction(async () => {
    const jar = await cookies();
    const device = await getDeviceIdentity();
    const token = jar.get(DEVICE_COOKIE)?.value;
    assertAllowed(device && token, "DEVICE", "Este aparelho já está desconectado.");
    assertAllowed(await pinUnlock(), "PIN", "Digite o PIN dos pais para desconectar o aparelho.");
    await endDevice(token);
    jar.delete(DEVICE_COOKIE);
    jar.delete(CHILD_COOKIE);
    jar.delete(UNLOCK_COOKIE);
    audit({
      eventType: "estrela.device_revoked",
      actorId: device.userId,
      payload: { deviceId: device.deviceId, via: "pin" },
    });
    await avisarFamilia(device.familyGroupId, "aparelhos");
    return { destination: "/conectar" };
  });
}
