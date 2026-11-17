import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { ComandoDeModeracaoSchema } from "../contrato/moderacao";
import { ErroDoRecreio } from "../dominio/erros";
import { UuidSchema } from "../dominio/ids";

const EMISSOR = "informach:bastidores";
const AUDIENCIA = "informach:recreio:moderacao";
const TIPO = "recreio-moderacao+jwt";
export const PRAZO_DA_PROVA_DE_MODERACAO_S = 30;
const claims = z
  .strictObject({
    iss: z.literal(EMISSOR),
    aud: z.literal(AUDIENCIA),
    sub: z.string().min(1).max(128),
    sessao: z.string().min(1).max(128),
    jti: UuidSchema,
    resumo: z.string().regex(/^[a-f0-9]{64}$/),
    iat: z.int().nonnegative(),
    nbf: z.int().nonnegative(),
    exp: z.int().positive(),
  })
  .refine((c) => c.nbf === c.iat && c.exp === c.iat + PRAZO_DA_PROVA_DE_MODERACAO_S);

function chave(segredo: string) {
  if (segredo.length < 43) throw new Error("Credencial restrita de moderação ausente ou curta.");
  return new TextEncoder().encode(segredo);
}
export async function resumoDoComandoDeModeracao(entrada: unknown) {
  const comando = ComandoDeModeracaoSchema.parse(entrada);
  const bytes = new TextEncoder().encode(
    `recreio:moderation-command:v1:${JSON.stringify(comando)}`,
  );
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/** Só o servidor do Bastidores, depois de autenticar a sessão com duas etapas. Nunca no navegador. */
export async function emitirProvaDeModeracao(
  segredo: string,
  dados: {
    contaId: string;
    authSessionId: string;
    comando: unknown;
    agora: Date;
  },
) {
  const comando = ComandoDeModeracaoSchema.parse(dados.comando),
    iat = Math.floor(dados.agora.getTime() / 1000);
  const prova = claims.parse({
    iss: EMISSOR,
    aud: AUDIENCIA,
    sub: dados.contaId,
    sessao: dados.authSessionId,
    jti: comando.comandoId,
    resumo: await resumoDoComandoDeModeracao(comando),
    iat,
    nbf: iat,
    exp: iat + PRAZO_DA_PROVA_DE_MODERACAO_S,
  });
  return new SignJWT(prova).setProtectedHeader({ alg: "HS256", typ: TIPO }).sign(chave(segredo));
}

/** Assinatura vincula corpo e sessão; papel, 2FA, banimento, revisão e recibo ainda exigem o banco. */
export async function verificarProvaDeModeracao(
  segredo: string,
  token: string,
  entrada: unknown,
  agora: Date,
) {
  try {
    if (token.length > 4096) throw new ErroDoRecreio("SEM_PERMISSAO");
    const comando = ComandoDeModeracaoSchema.parse(entrada);
    const { payload } = await jwtVerify(token, chave(segredo), {
      algorithms: ["HS256"],
      issuer: EMISSOR,
      audience: AUDIENCIA,
      typ: TIPO,
      requiredClaims: ["sub", "exp", "nbf", "iat", "jti"],
      maxTokenAge: PRAZO_DA_PROVA_DE_MODERACAO_S,
      clockTolerance: 0,
      currentDate: agora,
    });
    const prova = claims.parse(payload);
    if (
      prova.jti !== comando.comandoId ||
      prova.resumo !== (await resumoDoComandoDeModeracao(comando))
    )
      throw new ErroDoRecreio("SEM_PERMISSAO");
    return {
      contaId: prova.sub,
      authSessionId: prova.sessao,
      resumo: prova.resumo,
      emitidaEm: new Date(prova.iat * 1000),
      expiraEm: new Date(prova.exp * 1000),
      comando,
    };
  } catch {
    throw new ErroDoRecreio("SEM_PERMISSAO");
  }
}
