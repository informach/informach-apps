import { timingSafeEqual } from "node:crypto";
import { env } from "./env";

const EXPECTED = Buffer.from(`Bearer ${env.CRON_SECRET}`);

/**
 * Compara o header `Authorization` recebido com `Bearer ${CRON_SECRET}` em
 * tempo constante. `string !==` vaza o número de caracteres iguais via
 * timing — atacante consegue refinar caractere-a-caractere o secret medindo
 * latência ms sustentada. `timingSafeEqual` opera sobre buffers de tamanho
 * fixo: divergência de tamanho → mismatch direto; tamanhos iguais →
 * comparação byte-a-byte sem early-return.
 *
 * Retorna `null` quando autorizado e `Response(401)` quando rejeitado, pra
 * casar com o pattern `if (response = rejectUnauthorizedCron(req)) return response`.
 */
export function rejectUnauthorizedCron(request: Request): Response | null {
  const header = request.headers.get("authorization") ?? "";
  const received = Buffer.from(header);
  if (received.length !== EXPECTED.length) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!timingSafeEqual(received, EXPECTED)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
