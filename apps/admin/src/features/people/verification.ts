import "server-only";
import { getEnv } from "@/lib/env";
import { type ProductKey, serviceOrigins } from "@/lib/products";

export type VerificationRequest =
  | { ok: true }
  | { ok: false; reason: "rate_limited" | "rejected" | "unreachable"; status?: number };

/**
 * Pede ao próprio produto um código novo de confirmação de e-mail. Só o app
 * consegue emitir um código que a tela dele aceita: Cozya, Agenda, Missão e Bora Treinar
 * guardam as verificações no Redis de cada um, e cada produto manda o e-mail
 * com o próprio nome. A rota é a do Better Auth (`email-otp`) e responde igual
 * para qualquer e-mail, então o Bastidores não aprende nada novo com ela.
 */
export async function requestVerificationCode(
  app: ProductKey,
  email: string,
): Promise<VerificationRequest> {
  const origin = serviceOrigins(getEnv().ADMIN_SERVICE_URLS)[app];
  try {
    const response = await fetch(`${origin}/api/auth/email-otp/send-verification-otp`, {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        "User-Agent": "Bastidores/1 (+admin.informach.com.br)",
      },
      body: JSON.stringify({ email, type: "email-verification" }),
    });
    await response.body?.cancel().catch(() => undefined);
    if (response.ok) return { ok: true };
    if (response.status === 429) return { ok: false, reason: "rate_limited", status: 429 };
    return { ok: false, reason: "rejected", status: response.status };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}
