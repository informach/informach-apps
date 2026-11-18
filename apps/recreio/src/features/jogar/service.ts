import "server-only";
import { ehErroDoRecreio, type MundoId, MundoIdSchema } from "@informach/recreio";
import type { ReferenciaDeJogador } from "@/features/autoridade-de-jogo/aparelho-repository";
import { conferirAberturaDoJogo } from "@/features/autoridade-de-jogo/pagina-repository";
import { jogoQueAbre, origensDoJogo } from "@/features/jogos/config";
import { detalheAtualDoMundo } from "@/features/mundos/service";
import { temCliente } from "./registro";

/**
 * O que a página `/jogar/<jogo>` decide no servidor antes de entregar qualquer
 * coisa ao navegador. A referência vem do cookie nativo ou pareado; o kernel
 * relê aparelho, perfil, responsabilidade e política antes de liberar o cliente.
 *
 * A página só recebe o id do jogo, o id do mundo e textos de exibição. Nenhum
 * id de perfil ou de conta, e-mail ou token sai daqui.
 */
export type PaginaDoJogo =
  /** O jogo não existe neste deploy, não abre ou não tem cliente no portal: é um 404. */
  | { tipo: "inexistente" }
  /** O perfil não tem o direito de jogar: a estante explica a situação. */
  | { tipo: "sem_acesso" }
  /** Faltou dizer qual mundo: a estante é onde se escolhe. */
  | { tipo: "sem_mundo" }
  | {
      tipo: "pronto_sem_mundo";
      jogo: { id: string; nome: string; origemDaArte: string | null; visitas?: true };
    }
  /** O mundo não existe, é de outro jogo ou o perfil não participa dele: a mesma resposta. */
  | { tipo: "mundo_indisponivel"; jogo: { id: string; nome: string } }
  | {
      tipo: "pronto";
      /**
       * `origemDaArte`: de onde o cliente baixa a arte (`RECREIO_GAME_ORIGINS[jogo].assets`),
       * a mesma origem que a política de segurança desta página libera; `null` sem arte.
       */
      jogo: { id: string; nome: string; origemDaArte: string | null; visitas?: true };
      mundo: { id: MundoId; nome: string };
    };

export async function prepararPaginaDoJogo(
  jogador: ReferenciaDeJogador,
  jogoId: string,
  mundoPedido: string | string[] | undefined,
): Promise<PaginaDoJogo> {
  let manifesto: ReturnType<typeof jogoQueAbre>;
  try {
    manifesto = jogoQueAbre(jogoId);
  } catch (erro) {
    if (ehErroDoRecreio(erro, "JOGO_INDISPONIVEL")) return { tipo: "inexistente" };
    throw erro;
  }
  if (!temCliente(manifesto.id)) return { tipo: "inexistente" };

  if (!(await conferirAberturaDoJogo(jogador, manifesto.id))) return { tipo: "sem_acesso" };

  if (!manifesto.capacidades.mundos)
    return {
      tipo: "pronto_sem_mundo",
      jogo: {
        id: manifesto.id,
        nome: manifesto.nome,
        origemDaArte: origensDoJogo(manifesto.id)?.assets ?? null,
        ...(manifesto.capacidades.visitas ? { visitas: true } : {}),
      },
    };

  if (typeof mundoPedido !== "string" || mundoPedido === "") return { tipo: "sem_mundo" };
  const jogo = { id: manifesto.id, nome: manifesto.nome };
  const id = MundoIdSchema.safeParse(mundoPedido);
  if (!id.success) return { tipo: "mundo_indisponivel", jogo };
  const mundo = await detalheAtualDoMundo(jogador, manifesto.id, id.data).catch((erro: unknown) => {
    if (ehErroDoRecreio(erro, "NAO_MEMBRO") || ehErroDoRecreio(erro, "POLITICA_INCOMPATIVEL"))
      return null;
    throw erro;
  });
  if (!mundo || mundo.jogo !== manifesto.id) return { tipo: "mundo_indisponivel", jogo };
  return {
    tipo: "pronto",
    jogo: {
      ...jogo,
      origemDaArte: origensDoJogo(manifesto.id)?.assets ?? null,
      ...(manifesto.capacidades.visitas ? { visitas: true } : {}),
    },
    mundo: { id: mundo.id, nome: mundo.nome },
  };
}
