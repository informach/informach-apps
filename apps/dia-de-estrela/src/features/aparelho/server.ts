import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import type { ChildAuthority, PinAuthority } from "../familia/authority";
import { lerDesbloqueio } from "./pin";
import {
  CHILD_COOKIE,
  DEVICE_COOKIE,
  type DeviceIdentity,
  selectedChild,
  UNLOCK_COOKIE,
} from "./policy";
import { getPinChallenge, readDevice } from "./repository";

/** O aparelho da criança, pelo cookie, conferido no banco a cada pedido. */
export const getDeviceIdentity = cache(async (): Promise<DeviceIdentity | null> => {
  const jar = await cookies();
  const token = jar.get(DEVICE_COOKIE)?.value;
  if (!token) return null;
  const access = await readDevice(token);
  if (!access) return null;
  return {
    deviceId: access.device.id,
    userId: access.device.userId,
    familyGroupId: access.device.familyGroupId,
    childIds: access.childIds,
    childId: selectedChild(access.childIds, jar.get(CHILD_COOKIE)?.value),
    expiresAt: access.device.expiresAt,
  };
});

/** O cookie existe mas não vale mais (aparelho desconectado ou vencido). */
export async function hadDeviceCookie() {
  return (await cookies()).has(DEVICE_COOKIE);
}

/** Para as telas da criança: sem aparelho conectado, vai para a conexão. */
export async function requireDevicePage() {
  const identity = await getDeviceIdentity();
  if (!identity) redirect(`/conectar${(await hadDeviceCookie()) ? "?conexao=encerrada" : ""}`);
  return identity;
}

/** Para as telas de uma criança: sem criança escolhida, volta para "Quem está usando?". */
export async function requireChildPage() {
  const identity = await requireDevicePage();
  if (!identity.childId) redirect("/crianca");
  return {
    ...identity,
    childId: identity.childId,
    actor: childAuthority(identity, identity.childId),
  };
}

/** Ações da criança: a criança tem de ser deste aparelho e a escolhida agora. */
export async function requireChild(raw: unknown) {
  const childId = z.string().uuid().parse(raw);
  const identity = await getDeviceIdentity();
  assertAllowed(identity, "DEVICE", "Peça aos pais para conectar este aparelho de novo.");
  assertAllowed(
    identity.childIds.includes(childId) && identity.childId === childId,
    "CHILD_CHANGED",
    "A criança deste aparelho mudou. Volte para a tela inicial.",
  );
  return { ...identity, childId, actor: childAuthority(identity, childId) };
}

/** A área dos pais foi aberta com o PIN neste aparelho há menos de 10 minutos? */
export const pinUnlock = cache(async () => {
  const identity = await getDeviceIdentity();
  if (!identity) return null;
  const challenge = await getPinChallenge(identity);
  if (!challenge?.pinHash) return null;
  const expira = lerDesbloqueio(
    env.BETTER_AUTH_SECRET,
    (await cookies()).get(UNLOCK_COOKIE)?.value,
    identity.deviceId,
    challenge.pinGeneration,
  );
  if (!expira) return null;
  const actor: PinAuthority = {
    kind: "pin",
    userId: identity.userId,
    familyGroupId: identity.familyGroupId,
    deviceId: identity.deviceId,
    pinGeneration: challenge.pinGeneration,
    unlockedUntil: expira,
  };
  return { ...identity, unlockedUntil: expira, actor };
});

/** A chooser may construct one authority per delegated child; domain checks still revalidate it. */
export function childAuthority(identity: DeviceIdentity, childId: string): ChildAuthority {
  assertAllowed(identity.childIds.includes(childId), "CHILD", "Criança não disponível.");
  return {
    kind: "child",
    userId: identity.userId,
    familyGroupId: identity.familyGroupId,
    deviceId: identity.deviceId,
    childId,
  };
}
