import {
  createLocalJWKSet,
  createRemoteJWKSet,
  type JSONWebKeySet,
  type JWTVerifyGetKey,
} from "jose";
import {
  ClaimsDaSessaoSchema,
  type SessaoVerificada,
  TIPO_DA_SESSAO,
  type VerificadorDeSessao,
} from "../contrato/tokens";
import { verificarToken } from "../tokens/verificar";

export type OpcoesDoVerificador = {
  /** Origem do Recreio que emitiu o token. */
  emissor: string;
  /** O jogo deste servidor. Sessão de outro jogo é recusada. */
  jogo: string;
  agora?: () => Date;
} & (
  | {
      /** Endereço de `/api/sdk/v1/jwks`. As chaves ficam em cache e são relidas na rotação. */
      jwksUrl: string;
    }
  | { jwks: JSONWebKeySet }
);

/**
 * Confere a sessão de jogo que chega na conexão: assinatura com a chave
 * pública do Recreio, audiência, tipo e prazo. A revogação antes do prazo vem
 * pelo batimento da instância; o direito de entrar em um mundo é conferido à
 * parte, com `verificarEntrada`.
 */
export function criarVerificadorDeSessao(opcoes: OpcoesDoVerificador): VerificadorDeSessao {
  const chaves: JWTVerifyGetKey =
    "jwks" in opcoes
      ? createLocalJWKSet(opcoes.jwks)
      : createRemoteJWKSet(new URL(opcoes.jwksUrl), {
          cacheMaxAge: 5 * 60 * 1000,
          cooldownDuration: 30 * 1000,
          timeoutDuration: 5000,
        });

  return {
    async verificar(token): Promise<SessaoVerificada> {
      const claims = await verificarToken(token, {
        chaves,
        emissor: opcoes.emissor,
        jogo: opcoes.jogo,
        tipo: TIPO_DA_SESSAO,
        esquema: ClaimsDaSessaoSchema,
        erro: "SESSAO_INVALIDA",
        agora: opcoes.agora,
      });
      return {
        perfilId: claims.sub,
        sid: claims.sid,
        jogo: claims.aud,
        escopos: claims.scp,
        versaoDaPolitica: claims.pv,
        expiraEm: claims.exp * 1000,
      };
    },
  };
}
