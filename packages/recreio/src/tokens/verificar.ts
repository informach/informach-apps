import { errors, type JWTVerifyGetKey, jwtVerify } from "jose";
import type { z } from "zod";
import { ALGORITMO_DOS_TOKENS, TOLERANCIA_DE_RELOGIO_S } from "../contrato/tokens";
import { type CodigoDeErro, ErroDoRecreio } from "../dominio/erros";

export type OpcoesDeVerificacao<Claims> = {
  chaves: JWTVerifyGetKey;
  emissor: string;
  tipo: string;
  /** Quando ausente, a audiência é lida do token e devolvida a quem chamou. */
  jogo?: string;
  esquema: z.ZodType<Claims>;
  erro: Extract<CodigoDeErro, "INGRESSO_INVALIDO" | "SESSAO_INVALIDA">;
  agora?: () => Date;
};

/**
 * Confere assinatura, algoritmo, tipo, emissor, audiência e prazo, e só então
 * valida a forma das claims. Qualquer falha vira o mesmo código, sem dizer
 * qual parte não conferiu.
 */
export async function verificarToken<Claims>(
  token: string,
  opcoes: OpcoesDeVerificacao<Claims>,
): Promise<Claims> {
  try {
    const { payload } = await jwtVerify(token, opcoes.chaves, {
      algorithms: [ALGORITMO_DOS_TOKENS],
      issuer: opcoes.emissor,
      typ: opcoes.tipo,
      clockTolerance: TOLERANCIA_DE_RELOGIO_S,
      ...(opcoes.jogo === undefined ? {} : { audience: opcoes.jogo }),
      ...(opcoes.agora === undefined ? {} : { currentDate: opcoes.agora() }),
    });
    const claims = opcoes.esquema.safeParse(payload);
    if (!claims.success) throw new ErroDoRecreio(opcoes.erro);
    return claims.data;
  } catch (erro) {
    if (erro instanceof ErroDoRecreio) throw erro;
    // Chave indisponível não é token inválido: quem chama pode tentar de novo.
    if (erro instanceof errors.JWKSTimeout) throw new ErroDoRecreio("INDISPONIVEL");
    throw new ErroDoRecreio(opcoes.erro);
  }
}
