import "server-only";
import { UnauthorizedError } from "@informach/auth";
import { ZodError } from "zod";
import { getSession, requireUser } from "./auth";
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
