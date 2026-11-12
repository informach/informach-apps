import {
  type CryptoKey,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  importPKCS8,
  importSPKI,
  type JSONWebKeySet,
  type JWTVerifyGetKey,
  type KeyObject,
  SignJWT,
} from "jose";
import {
  ALGORITMO_DOS_TOKENS,
  ClaimsDaSessaoSchema,
  ClaimsDoIngressoSchema,
  ESCOPOS,
  type IngressoVerificado,
  type SessaoVerificada,
  TIPO_DA_SESSAO,
  TIPO_DO_INGRESSO,
  VALIDADE_DA_SESSAO_S,
  VALIDADE_DO_INGRESSO_S,
} from "../contrato/tokens";
import type { PerfilId, SessaoDeAparelhoId, SessaoDeJogoId } from "../dominio/ids";
import { verificarToken } from "../tokens/verificar";

/**
 * Emissão dos tokens do Recreio. Só o servidor do Recreio importa este
 * subpath: ele precisa da chave privada. O servidor do jogo confere com
 * `@informach/recreio/host`.
 */

export type ChavePrivada = CryptoKey | KeyObject;
export type ChavePublica = CryptoKey | KeyObject;

/** PEM guardado em variável de ambiente costuma vir com `\n` escapado. */
function normalizarPem(pem: string): string {
  return pem.replace(/\\n/g, "\n").trim();
}

export async function importarChavePrivada(pem: string): Promise<ChavePrivada> {
  return importPKCS8(normalizarPem(pem), ALGORITMO_DOS_TOKENS);
}

export async function importarChavePublica(pem: string): Promise<ChavePublica> {
  return importSPKI(normalizarPem(pem), ALGORITMO_DOS_TOKENS, { extractable: true });
}

/** Um par novo, para desenvolvimento e testes: em produção a chave vem do ambiente. */
export async function gerarParDeChaves(): Promise<{
  privada: ChavePrivada;
  publica: ChavePublica;
}> {
  const par = await generateKeyPair(ALGORITMO_DOS_TOKENS, { extractable: true });
  return { privada: par.privateKey, publica: par.publicKey };
}

export type ChavePublicaComId = { kid: string; chave: ChavePublica };
/** O conjunto de chaves públicas no formato de `/api/sdk/v1/jwks`. */
export type Jwks = JSONWebKeySet;
/** Como quem confere um token acha a chave pelo `kid`. */
export type ChavesDeVerificacao = JWTVerifyGetKey;

/** O conjunto servido em `/api/sdk/v1/jwks`: a chave atual e as anteriores. */
export async function montarJwks(chaves: readonly ChavePublicaComId[]): Promise<JSONWebKeySet> {
  const keys = await Promise.all(
    chaves.map(async ({ kid, chave }) => {
      const jwk = await exportJWK(chave);
      if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || "d" in jwk) {
        throw new Error("A chave dos tokens precisa ser pública e Ed25519");
      }
      return { ...jwk, kid, use: "sig", alg: ALGORITMO_DOS_TOKENS };
    }),
  );
  return { keys };
}

export type DadosDoIngresso = {
  jogo: string;
  perfilId: PerfilId;
  sessaoDeAparelhoId: SessaoDeAparelhoId;
  versaoDaPolitica: number;
  jti: string;
  agora: Date;
};

export type DadosDaSessao = {
  jogo: string;
  perfilId: PerfilId;
  sid: SessaoDeJogoId;
  versaoDaPolitica: number;
  jti: string;
  agora: Date;
  /** Fim conhecido do acesso. A sessão nunca passa desta data. */
  validoAte?: Date | null;
};

export type TokenEmitido = { token: string; expiraEm: Date };

export type Emissor = {
  readonly emissor: string;
  readonly kid: string;
  ingresso(dados: DadosDoIngresso): Promise<TokenEmitido>;
  sessao(dados: DadosDaSessao): Promise<TokenEmitido>;
};

export function criarEmissor(opcoes: {
  /** Origem do Recreio; vira o `iss` e é conferida por quem verifica. */
  emissor: string;
  kid: string;
  chavePrivada: ChavePrivada;
}): Emissor {
  async function assinar(
    tipo: string,
    dados: { jogo: string; perfilId: string; sid: string; versaoDaPolitica: number; jti: string },
    emitidoEm: number,
    expira: number,
  ): Promise<string> {
    return new SignJWT({ sid: dados.sid, scp: [...ESCOPOS], pv: dados.versaoDaPolitica })
      .setProtectedHeader({ alg: ALGORITMO_DOS_TOKENS, typ: tipo, kid: opcoes.kid })
      .setIssuer(opcoes.emissor)
      .setAudience(dados.jogo)
      .setSubject(dados.perfilId)
      .setJti(dados.jti)
      .setIssuedAt(emitidoEm)
      .setNotBefore(emitidoEm)
      .setExpirationTime(expira)
      .sign(opcoes.chavePrivada);
  }

  return {
    emissor: opcoes.emissor,
    kid: opcoes.kid,
    async ingresso(dados) {
      const emitidoEm = Math.floor(dados.agora.getTime() / 1000);
      const expira = emitidoEm + VALIDADE_DO_INGRESSO_S;
      const token = await assinar(
        TIPO_DO_INGRESSO,
        { ...dados, sid: dados.sessaoDeAparelhoId },
        emitidoEm,
        expira,
      );
      return { token, expiraEm: new Date(expira * 1000) };
    },
    async sessao(dados) {
      const emitidoEm = Math.floor(dados.agora.getTime() / 1000);
      const teto = emitidoEm + VALIDADE_DA_SESSAO_S;
      const limite = dados.validoAte ? Math.floor(dados.validoAte.getTime() / 1000) : teto;
      const expira = Math.min(teto, limite);
      if (expira <= emitidoEm) throw new Error("O acesso já terminou; não há sessão a emitir");
      const token = await assinar(TIPO_DA_SESSAO, dados, emitidoEm, expira);
      return { token, expiraEm: new Date(expira * 1000) };
    },
  };
}

/**
 * Confere um ingresso na troca por sessão. O uso único não é conferido aqui:
 * quem chama consome o `jti` na mesma transação em que cria a sessão.
 */
export async function verificarIngresso(
  token: string,
  opcoes: { chaves: JWTVerifyGetKey; emissor: string; agora?: () => Date },
): Promise<IngressoVerificado> {
  const claims = await verificarToken(token, {
    chaves: opcoes.chaves,
    emissor: opcoes.emissor,
    tipo: TIPO_DO_INGRESSO,
    esquema: ClaimsDoIngressoSchema,
    erro: "INGRESSO_INVALIDO",
    agora: opcoes.agora,
  });
  return {
    perfilId: claims.sub,
    sessaoDeAparelhoId: claims.sid,
    jogo: claims.aud,
    jti: claims.jti,
    versaoDaPolitica: claims.pv,
    expiraEm: claims.exp * 1000,
  };
}

/**
 * Confere uma sessão de jogo que este Recreio emitiu, de qualquer jogo: a
 * audiência não é fixada aqui, vem do token. Quem chama confere que o jogo
 * existe e que a sessão continua aberta no banco. O servidor de um jogo usa
 * `criarVerificadorDeSessao` (`@informach/recreio/host`), que fixa a audiência.
 */
export async function verificarSessaoEmitida(
  token: string,
  opcoes: { chaves: JWTVerifyGetKey; emissor: string; agora?: () => Date },
): Promise<SessaoVerificada> {
  const claims = await verificarToken(token, {
    chaves: opcoes.chaves,
    emissor: opcoes.emissor,
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
}

export function chavesLocais(jwks: JSONWebKeySet): JWTVerifyGetKey {
  return createLocalJWKSet(jwks);
}
