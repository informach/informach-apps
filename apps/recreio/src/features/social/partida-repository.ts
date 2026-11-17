import "server-only";
import type { MundoId, PerfilId } from "@informach/recreio";
import { comSessaoDeJogoAutoritativa } from "@/features/autoridade-de-jogo/repository";
import {
  confirmarCoparticipacao,
  travarMundoCompartilhado,
} from "@/features/mundos/coparticipacao-repository";
import type { SessaoDeJogoAtiva } from "@/features/sessao-de-jogo/service";
import { AppError, assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import type { ContextoSocial } from "./autoridade-repository";
import { type ComposicaoSocial, travarComposicaoSocial } from "./composicao-repository";
import { admitirPerfilSocial } from "./perfis-repository";

/** Bearer conserva SID, jogo, política, prazo e aparelho atuais; não vira cookie. */
export async function comPartidaSocial<T>(
  sessao: SessaoDeJogoAtiva,
  alvo: PerfilId | null,
  finalidade: "contato" | "protecao",
  executar: (tx: Transacao, atual: ContextoSocial) => Promise<T>,
  antesDosPerfis?: (tx: Transacao) => Promise<void>,
) {
  let composicao: ComposicaoSocial | undefined;
  let pistaDeMundo: MundoId | null = null;
  const resultado = await comSessaoDeJogoAutoritativa(
    sessao,
    async () => {},
    async (tx, contaId, admissao) => {
      assertAllowed(composicao, "AUTH", "Entre novamente para continuar.");
      const origem = await admitirPerfilSocial(
        tx,
        composicao,
        sessao.perfilId,
        await admissao.conferirPrazo(),
      );
      const destino =
        alvo && finalidade === "contato"
          ? await admitirPerfilSocial(tx, composicao, alvo, await admissao.conferirPrazo())
          : null;
      if (origem.recalculou || destino?.recalculou)
        return {
          executou: false as const,
          erro: new AppError("CONTATO", "A supervisão mudou. Reabra a tela antes de continuar."),
        };
      const conferirPrazo = async () => {
        const agora = await admissao.conferirPrazo();
        origem.conferirPrazo(agora);
        destino?.conferirPrazo(agora);
        return agora;
      };
      const valor = await executar(tx, {
        origem: origem.fato,
        destino: destino?.fato ?? null,
        contaId,
        conferirPrazo,
        mundoCompartilhado:
          alvo && finalidade === "protecao"
            ? await confirmarCoparticipacao(tx, pistaDeMundo, sessao.perfilId, alvo)
            : null,
      });
      await conferirPrazo();
      return { executou: true as const, valor };
    },
    {
      antesDaIdentidade: async (tx, referencia) => {
        composicao = await travarComposicaoSocial(
          tx,
          { tipo: "jogador", referencia },
          [...new Set([sessao.perfilId, ...(alvo ? [alvo] : [])])],
          async () => {
            await antesDosPerfis?.(tx);
            if (alvo && finalidade === "protecao")
              pistaDeMundo = await travarMundoCompartilhado(tx, sessao.perfilId, alvo);
          },
        );
      },
    },
  );
  if (!resultado.executou) throw resultado.erro;
  return resultado.valor;
}
