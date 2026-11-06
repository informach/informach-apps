import "server-only";
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { audit } from "@/lib/observability";
import { estadoDoTeste } from "./regras";
import { reivindicarTeste } from "./repository";

/** O e-mail nunca é guardado: só o HMAC dele, preso a este app. */
const hashDoEmail = (email: string, chave: string) =>
  createHmac("sha256", chave).update(`bora-teste:${email.trim().toLowerCase()}`).digest("hex");

/**
 * Os hashes que identificam o e-mail: o da chave própria (gravado nos pedidos novos) e o da chave
 * antiga (`BETTER_AUTH_SECRET`), para que os pedidos feitos antes da chave própria continuem
 * valendo. Quem já usou o teste não ganha outro só porque a chave mudou.
 */
function hashesDoEmail(email: string) {
  const chaves = [env.BORA_TRIAL_KEY ?? env.BETTER_AUTH_SECRET, env.BETTER_AUTH_SECRET];
  return [...new Set(chaves.map((c) => hashDoEmail(email, c)))];
}

/**
 * Começa o teste de 7 dias da conta, se este e-mail ainda não usou o dele. Sem cartão: quem
 * decide é só o banco. Devolve o motivo quando não começa, para a tela explicar.
 */
export async function comecarTeste(user: { id: string; email: string; emailVerified: boolean }) {
  if (!user.emailVerified) return { ok: false, code: "VERIFY" } as const;
  const inicio = await reivindicarTeste(user.id, hashesDoEmail(user.email));
  if (!inicio) return { ok: false, code: "TRIAL_USED" } as const;
  if (!estadoDoTeste(inicio).active) return { ok: false, code: "TRIAL_ENDED" } as const;
  audit({ eventType: "bora.trial_started", actorId: user.id, payload: {} });
  return { ok: true } as const;
}
