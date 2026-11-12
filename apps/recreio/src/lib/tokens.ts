import "server-only";
import { createPublicKey, randomBytes } from "node:crypto";
import {
  type ChavePrivada,
  type ChavePublica,
  type ChavesDeVerificacao,
  chavesLocais,
  criarEmissor,
  type Emissor,
  gerarParDeChaves,
  importarChavePrivada,
  importarChavePublica,
  type Jwks,
  montarJwks,
} from "@informach/recreio/emissor";
import { env } from "./env";
import { logger } from "./logger";

/**
 * As chaves dos tokens do Recreio (ingresso e sessão de jogo). A chave privada
 * vem de `RECREIO_TOKEN_PRIVATE_KEY`; a pública do JWKS é derivada dela, e as
 * de `RECREIO_TOKEN_PREVIOUS_PUBLIC_KEYS` continuam servidas e aceitas durante
 * a rotação.
 *
 * Fora de produção, sem a variável, o app gera um par descartável ao subir:
 * os tokens deixam de valer a cada reinício. Em produção a falta da chave é
 * erro de validação do ambiente e o app não sobe.
 */
export type ChavesDoRecreio = {
  emissor: Emissor;
  /** O que `/api/sdk/v1/jwks` serve: a chave atual e as anteriores. */
  jwks: Jwks;
  /** Para conferir tokens emitidos por este Recreio, com qualquer chave ainda servida. */
  chaves: ChavesDeVerificacao;
};

type Global = typeof globalThis & { __recreioChaves?: Promise<ChavesDoRecreio> };

async function chaveAtual(): Promise<{
  kid: string;
  privada: ChavePrivada;
  publica: ChavePublica;
}> {
  const pem = env.RECREIO_TOKEN_PRIVATE_KEY;
  const kid = env.RECREIO_TOKEN_KEY_ID;
  if (pem && kid) {
    return {
      kid,
      privada: await importarChavePrivada(pem),
      // A pública sai da própria chave privada: não há variável separada para ela.
      publica: createPublicKey({ key: pem.replace(/\\n/g, "\n").trim(), format: "pem" }),
    };
  }
  const par = await gerarParDeChaves();
  const efemero = `local-${randomBytes(4).toString("hex")}`;
  logger.warn(
    { kid: efemero },
    "recreio.tokens.chave_descartavel: RECREIO_TOKEN_PRIVATE_KEY ausente; os tokens deixam de valer a cada reinício",
  );
  return { kid: efemero, ...par };
}

async function carregar(): Promise<ChavesDoRecreio> {
  const atual = await chaveAtual();
  const anteriores = await Promise.all(
    Object.entries(env.RECREIO_TOKEN_PREVIOUS_PUBLIC_KEYS).map(async ([kid, pem]) => ({
      kid,
      chave: await importarChavePublica(pem),
    })),
  );
  const jwks = await montarJwks([{ kid: atual.kid, chave: atual.publica }, ...anteriores]);
  return {
    emissor: criarEmissor({
      emissor: new URL(env.NEXT_PUBLIC_APP_URL).origin,
      kid: atual.kid,
      chavePrivada: atual.privada,
    }),
    jwks,
    chaves: chavesLocais(jwks),
  };
}

/**
 * Carrega as chaves uma vez por processo. Fica no `globalThis` para o par
 * descartável sobreviver ao recarregamento de módulos do `next dev`.
 */
export function chavesDoRecreio(): Promise<ChavesDoRecreio> {
  const global = globalThis as Global;
  if (!global.__recreioChaves) {
    const carregando = carregar();
    global.__recreioChaves = carregando;
    // Uma falha não fica guardada: o próximo pedido tenta de novo.
    carregando.catch(() => {
      if (global.__recreioChaves === carregando) global.__recreioChaves = undefined;
    });
  }
  return global.__recreioChaves;
}
