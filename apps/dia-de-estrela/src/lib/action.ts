import "server-only";
import { UnauthorizedError } from "@informach/auth";
import { isRecentWebAuthentication } from "@informach/auth/web-sessions";
import { FamilyError } from "@informach/family";
import { ZodError } from "zod";
import { pinUnlock } from "@/features/aparelho/server";
import type { AdultAuthority, ParentAuthority } from "@/features/familia/authority";
import { requireFamilyContext } from "@/features/familia/context";
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
    session &&
      (await isRecentWebAuthentication({
        userId: user.id,
        sessionId: session.session.id,
        app: "dia-de-estrela",
        maxAgeSeconds: 600,
      })),
    "REAUTH",
    "Para proteger a área da família, entre novamente com seu e-mail. A confirmação vale por dez minutos.",
  );
  return user;
}

/** A household is selected explicitly; every repository still enforces profile grants. */
export async function familyAdult(options: { recent?: boolean } = {}) {
  const user = options.recent ? await recentParent() : await verifiedUser();
  const group = await requireFamilyContext(user.id);
  const actor: AdultAuthority = { kind: "adult", userId: user.id, familyGroupId: group.id };
  return { user, actor, role: group.role };
}
export async function familyAdministrator(options: { recent?: boolean } = {}) {
  const context = await familyAdult(options);
  assertAllowed(
    context.role === "administrator",
    "ADMINISTRATOR",
    "Peça a um administrador da família para fazer isso.",
  );
  return context;
}
export type ParentActor = ParentAuthority;
export async function parentActor(): Promise<ParentActor> {
  if (await getCurrentUser()) return (await familyAdult()).actor;
  const unlock = await pinUnlock();
  assertAllowed(unlock, "PIN", "Digite o PIN dos pais para continuar.");
  return unlock.actor;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; code: string };
export async function runAction<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    if (error instanceof UnauthorizedError)
      return { ok: false, error: "Entre novamente para continuar.", code: "AUTH" };
    if (error instanceof AppError || error instanceof FamilyError)
      return { ok: false, error: error.message, code: error.code };
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
