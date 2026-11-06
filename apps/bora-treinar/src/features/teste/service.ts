import "server-only";
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { audit } from "@/lib/observability";
import { estadoDoTeste } from "./regras";
import { reivindicarTeste } from "./repository";

/** O e-mail nunca é guardado: só o HMAC dele, preso a este app. */
const hashDoEmail = (email: string) =>
  createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`bora-teste:${email.trim().toLowerCase()}`)
    .digest("hex");

/**
 * Começa o teste de 7 dias da conta, se este e-mail ainda não usou o dele. Sem cartão: quem
 * decide é só o banco. Devolve o motivo quando não começa, para a tela explicar.
 */
export async function comecarTeste(user: { id: string; email: string; emailVerified: boolean }) {
  if (!user.emailVerified) return { ok: false, code: "VERIFY" } as const;
  const inicio = await reivindicarTeste(user.id, hashDoEmail(user.email));
  if (!inicio) return { ok: false, code: "TRIAL_USED" } as const;
  if (!estadoDoTeste(inicio).active) return { ok: false, code: "TRIAL_ENDED" } as const;
  audit({ eventType: "bora.trial_started", actorId: user.id, payload: {} });
  return { ok: true } as const;
}
