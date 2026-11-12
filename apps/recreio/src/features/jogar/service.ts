import "server-only";
import { ehErroDoRecreio, type MundoId, type PerfilId } from "@informach/recreio";
import { avaliarAcesso } from "@/features/acesso/service";
import { jogoQueAbre } from "@/features/jogos/config";
import { detalheDoMundo } from "@/features/mundos/service";
import { temCliente } from "./registro";

/**
 * O que a página `/jogar/<jogo>` decide no servidor antes de entregar qualquer
 * coisa ao navegador. O perfil já chega conferido (`paginaDoPortal`); aqui
 * entram o jogo, o direito de jogar e o mundo pedido.
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
  /** O mundo não existe, é de outro jogo ou o perfil não participa dele: a mesma resposta. */
  | { tipo: "mundo_indisponivel"; jogo: { id: string; nome: string } }
  | {
      tipo: "pronto";
      jogo: { id: string; nome: string };
      mundo: { id: MundoId; nome: string };
    };

export async function prepararPaginaDoJogo(
  perfilId: PerfilId,
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

  const acesso = await avaliarAcesso({ profileId: perfilId, gameId: manifesto.id });
  if (!acesso.podeJogar) return { tipo: "sem_acesso" };

  if (typeof mundoPedido !== "string" || mundoPedido === "") return { tipo: "sem_mundo" };
  const jogo = { id: manifesto.id, nome: manifesto.nome };
  // `detalheDoMundo` confere a forma do id com o esquema do domínio e só acha
  // o mundo de quem é membro ativo dele.
  const mundo = await detalheDoMundo(perfilId, mundoPedido);
  if (!mundo || mundo.jogo !== manifesto.id) return { tipo: "mundo_indisponivel", jogo };
  return { tipo: "pronto", jogo, mundo: { id: mundo.id, nome: mundo.nome } };
}
