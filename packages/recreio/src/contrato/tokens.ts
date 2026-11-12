import { z } from "zod";
import { PerfilIdSchema, SessaoDeAparelhoIdSchema, SessaoDeJogoIdSchema } from "../dominio/ids";

/**
 * Dois tokens, dois tipos. O `typ` do cabeçalho impede que um ingresso seja
 * aceito onde se espera uma sessão de jogo, e o contrário.
 *
 * Nenhum dos dois carrega e-mail, idade, conta, grupo ou cobrança: o jogo
 * recebe o perfil e a versão da política, e só.
 */

export const ALGORITMO_DOS_TOKENS = "EdDSA";

export const TIPO_DO_INGRESSO = "recreio-ingresso+jwt";
export const TIPO_DA_SESSAO = "recreio-sessao+jwt";

/** Ingresso de abertura: uso único, trocado por uma sessão na inicialização. */
export const VALIDADE_DO_INGRESSO_S = 60;
/** Sessão de jogo: renovada em silêncio enquanto acesso, sessão e política valem. */
export const VALIDADE_DA_SESSAO_S = 15 * 60;
/** O SDK renova quando passou esta fração da validade. */
export const FRACAO_PARA_RENOVAR = 2 / 3;
/** Tolerância de relógio entre quem emite e quem confere, em segundos. */
export const TOLERANCIA_DE_RELOGIO_S = 5;

/**
 * Se um token com este `exp` (em milissegundos) já venceu. É a mesma conta de
 * quem confere a assinatura: o token vale até `exp` mais a tolerância de
 * relógio. Quem guarda o prazo de uma sessão já conferida (o servidor do jogo,
 * para fechar a conexão) usa esta função, e não `agora >= exp`: assim um token
 * aceito na entrada nunca é dado como vencido no mesmo instante.
 */
export function sessaoVencida(expiraEmMs: number, agoraMs: number): boolean {
  return Math.floor(agoraMs / 1000) >= Math.floor(expiraEmMs / 1000) + TOLERANCIA_DE_RELOGIO_S;
}

export const ESCOPOS = ["perfil", "mundos"] as const;
export type Escopo = (typeof ESCOPOS)[number];

const instante = z.number().int().positive();

const comuns = {
  iss: z.string().min(1),
  /** O jogo. Um ingresso do Morada não abre outro jogo. */
  aud: z.string().min(1),
  /** O perfil, nunca a conta. */
  sub: PerfilIdSchema,
  scp: z.array(z.enum(ESCOPOS)).min(1),
  /** Versão da política do perfil quando o token foi emitido. */
  pv: z.number().int().nonnegative(),
  iat: instante,
  nbf: instante,
  exp: instante,
  jti: z.uuid(),
};

export const ClaimsDoIngressoSchema = z.strictObject({
  ...comuns,
  /** Sessão do aparelho que pediu o ingresso. */
  sid: SessaoDeAparelhoIdSchema,
});
export type ClaimsDoIngresso = z.infer<typeof ClaimsDoIngressoSchema>;

export const ClaimsDaSessaoSchema = z.strictObject({
  ...comuns,
  /** A sessão de jogo. Fica a mesma nas renovações. */
  sid: SessaoDeJogoIdSchema,
});
export type ClaimsDaSessao = z.infer<typeof ClaimsDaSessaoSchema>;

/** O que o servidor do jogo sabe depois de conferir uma sessão. */
export type SessaoVerificada = {
  perfilId: ClaimsDaSessao["sub"];
  sid: ClaimsDaSessao["sid"];
  jogo: string;
  escopos: readonly Escopo[];
  versaoDaPolitica: number;
  /** O `exp` do token, em milissegundos desde a época. Para saber se venceu, `sessaoVencida`. */
  expiraEm: number;
};

export type IngressoVerificado = {
  perfilId: ClaimsDoIngresso["sub"];
  sessaoDeAparelhoId: ClaimsDoIngresso["sid"];
  jogo: string;
  jti: string;
  versaoDaPolitica: number;
  expiraEm: number;
};

export interface VerificadorDeSessao {
  /** Recusa com `ErroDoRecreio("SESSAO_INVALIDA")` qualquer token que não confira. */
  verificar(token: string): Promise<SessaoVerificada>;
}
