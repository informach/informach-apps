import { generateKeyPair, type JSONWebKeySet } from "jose";
import type { VerificadorDeSessao } from "../contrato/tokens";
import { ALGORITMO_DOS_TOKENS } from "../contrato/tokens";
import type { PerfilId, SessaoDeJogoId } from "../dominio/ids";
import { criarEmissor, type Emissor, montarJwks } from "../emissor";
import { criarVerificadorDeSessao } from "../host/verificador";

export type EmissorDeTeste = {
  emissor: Emissor;
  jwks: JSONWebKeySet;
  /** Um verificador como o do servidor do jogo, já com as chaves deste emissor. */
  verificador(jogo?: string, agora?: () => Date): VerificadorDeSessao;
  /** Atalho para uma sessão de jogo válida. */
  sessao(dados: {
    perfilId: PerfilId;
    sid: SessaoDeJogoId;
    jogo?: string;
    agora?: Date;
    validoAte?: Date | null;
  }): Promise<string>;
};

/** Um Recreio de mentira para emitir tokens: chave Ed25519 gerada na hora. */
export async function criarEmissorDeTeste(
  opcoes: { emissor?: string; kid?: string } = {},
): Promise<EmissorDeTeste> {
  const origem = opcoes.emissor ?? "https://recreio.test";
  const kid = opcoes.kid ?? "teste-1";
  const par = await generateKeyPair(ALGORITMO_DOS_TOKENS, { extractable: true });
  const emissor = criarEmissor({ emissor: origem, kid, chavePrivada: par.privateKey });
  const jwks = await montarJwks([{ kid, chave: par.publicKey }]);

  return {
    emissor,
    jwks,
    verificador: (jogo = "morada", agora) =>
      criarVerificadorDeSessao({ emissor: origem, jogo, jwks, agora }),
    async sessao({ perfilId, sid, jogo = "morada", agora = new Date(), validoAte }) {
      const { token } = await emissor.sessao({
        jogo,
        perfilId,
        sid,
        versaoDaPolitica: 1,
        jti: crypto.randomUUID(),
        agora,
        validoAte,
      });
      return token;
    },
  };
}
