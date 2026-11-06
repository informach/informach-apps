import "server-only";
import { UnauthorizedError } from "@informach/auth";
import { ZodError } from "zod";
import { pinUnlock } from "@/features/aparelho/server";
import { familyOfAdult } from "@/features/familia/view";
import { getCurrentUser, getSession, requireUser } from "./auth";
import { AppError, assertAllowed } from "./errors";
import { reportError } from "./observability";

export async function verifiedUser() {
  const user = await requireUser();
  assertAllowed(user.emailVerified, "VERIFY", "Confirme o e-mail do responsável para continuar.");
  return user;
}
export async function recentParent() {
  const user = await verifiedUser();
  const session = await getSession();
  assertAllowed(
    session && Date.now() - new Date(session.session.createdAt).getTime() < 10 * 60_000,
    "REAUTH",
    "Para proteger a área da família, entre novamente com seu e-mail. A confirmação vale por dez minutos.",
  );
  return user;
}

/** Adulto com conta: o titular ou o segundo responsável, já com a família dele. */
export async function familyAdult() {
  const user = await verifiedUser();
  const { ownerId, role } = await familyOfAdult(user.id);
  return { user, ownerId, role };
}

/** Só o titular: assinatura, segundo responsável, exclusão de criança. */
export async function familyOwner(options: { recent?: boolean } = {}) {
  const user = options.recent ? await recentParent() : await verifiedUser();
  const { ownerId, role } = await familyOfAdult(user.id);
  assertAllowed(role === "owner", "OWNER", "Só o titular da conta pode fazer isso.");
  return { user, ownerId };
}

export type ParentActor = {
  ownerId: string;
  /** Quem aparece na auditoria. Pelo PIN, a ação é registrada em nome do titular. */
  actorId: string;
  via: "adult" | "pin";
  deviceId?: string;
};

/**
 * Ações do dia a dia dos pais (aprovar, marcar, lembrar, dar bônus, pagar
 * pedido, editar rotinas): valem para o adulto com conta e, no aparelho da
 * criança, para quem acabou de digitar o PIN.
 */
export async function parentActor(): Promise<ParentActor> {
  const user = await getCurrentUser();
  if (user) {
    const adult = await familyAdult();
    return { ownerId: adult.ownerId, actorId: adult.user.id, via: "adult" };
  }
  const unlock = await pinUnlock();
  assertAllowed(unlock, "PIN", "Digite o PIN dos pais para continuar.");
  return {
    ownerId: unlock.ownerId,
    actorId: unlock.ownerId,
    via: "pin",
    deviceId: unlock.deviceId,
  };
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; code: string };
export async function runAction<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    if (error instanceof UnauthorizedError)
      return { ok: false, error: "Entre novamente para continuar.", code: "AUTH" };
    if (error instanceof AppError) return { ok: false, error: error.message, code: error.code };
    if (error instanceof ZodError)
      return { ok: false, error: "Confira os campos e tente novamente.", code: "INPUT" };
    const incident = crypto.randomUUID();
    reportError(error, incident);
    return {
      ok: false,
      error: `Não foi possível concluir. Tente novamente. Referência: ${incident.slice(0, 8)}.`,
      code: "UNEXPECTED",
    };
  }
}
