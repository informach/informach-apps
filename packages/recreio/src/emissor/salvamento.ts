import { type JWTVerifyGetKey, SignJWT } from "jose";
import {
  ALGORITMO_DOS_TOKENS,
  ClaimsDoSalvamentoSchema,
  MARGEM_DE_SALVAMENTO_S,
  type SalvamentoVerificado,
  TIPO_DO_SALVAMENTO,
  VALIDADE_DA_SESSAO_S,
} from "../contrato/tokens";
import type { PerfilId, SessaoDeJogoId } from "../dominio/ids";
import { verificarToken } from "../tokens/verificar";
import type { ChavePrivada, TokenEmitido } from "./index";

export type DadosDoSalvamento = {
  jogo: string;
  perfilId: PerfilId;
  sid: SessaoDeJogoId;
  versaoDaPolitica: number;
  reciboId: string;
  agora: Date;
  fimDaConcessao: Date;
};

/** Tipo e escopo próprios: nunca utilizar este token para renovar ou entrar em mundo. */
export async function emitirSalvamento(
  chaves: { emissor: string; kid: string; chavePrivada: ChavePrivada },
  dados: DadosDoSalvamento,
): Promise<TokenEmitido> {
  const iat = Math.floor(dados.agora.getTime() / 1000);
  const fim = Math.floor(dados.fimDaConcessao.getTime() / 1000);
  if (fim <= iat || fim > iat + VALIDADE_DA_SESSAO_S)
    throw new Error("A concessão precisa estar vigente e dentro do limite da sessão");
  const exp = fim + MARGEM_DE_SALVAMENTO_S;
  const claims = ClaimsDoSalvamentoSchema.parse({
    iss: chaves.emissor,
    aud: dados.jogo,
    sub: dados.perfilId,
    sid: dados.sid,
    jti: dados.reciboId,
    pv: dados.versaoDaPolitica,
    scp: ["salvar"],
    iat,
    nbf: iat,
    exp,
  });
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: ALGORITMO_DOS_TOKENS, typ: TIPO_DO_SALVAMENTO, kid: chaves.kid })
    .sign(chaves.chavePrivada);
  return { token, expiraEm: new Date(exp * 1000) };
}

/** A assinatura é só a primeira etapa: todo uso exige recibo e autoridade atuais no banco. */
export async function verificarSalvamentoEmitido(
  token: string,
  opcoes: { chaves: JWTVerifyGetKey; emissor: string; jogo?: string; agora?: () => Date },
): Promise<SalvamentoVerificado> {
  const claims = await verificarToken(token, {
    ...opcoes,
    tipo: TIPO_DO_SALVAMENTO,
    esquema: ClaimsDoSalvamentoSchema,
    toleranciaDeRelogio: 0,
    erro: "SESSAO_INVALIDA",
  });
  return {
    reciboId: claims.jti,
    perfilId: claims.sub,
    sid: claims.sid,
    jogo: claims.aud,
    versaoDaPolitica: claims.pv,
    expiraEm: claims.exp * 1000,
  };
}
