import "server-only";
import { redisRateLimitStorage } from "@informach/auth/redis-rate-limit-storage";
import { enforceRateLimit, RateLimitError } from "@informach/auth/server-actions";
import { ErroDoRecreio } from "@informach/recreio";
import { redis } from "./redis";

/**
 * Limite de tentativas, com o contador de janela fixa de `@informach/auth`:
 * no Redis quando ele existe (produção), senão na tabela `core.rate_limit` do
 * login compartilhado. Estourou: `MUITAS_TENTATIVAS`.
 */
const armazenamento = redis
  ? redisRateLimitStorage({ client: redis, keyPrefix: "recreio:rl:" })
  : undefined;

export async function limitarTentativas(entrada: {
  /** Quem e o quê, por exemplo `convite:<perfil>`. Nunca um dado digitado pela pessoa. */
  chave: string;
  max: number;
  janelaEmSegundos: number;
}): Promise<void> {
  try {
    await enforceRateLimit(
      { key: `recreio:${entrada.chave}`, max: entrada.max, window: entrada.janelaEmSegundos },
      armazenamento,
    );
  } catch (erro) {
    if (erro instanceof RateLimitError) throw new ErroDoRecreio("MUITAS_TENTATIVAS");
    throw erro;
  }
}
