import "server-only";
import { PRODUCTS } from "@informach/config";
import { JOGOS } from "@informach/config/jogos";
import {
  type AssinaturaDoGrupo,
  type DecisaoDeAcesso,
  ErroDoRecreio,
  type PerfilId,
  PerfilIdSchema,
} from "@informach/recreio";
import { decidirComCobertura, tierDoProduto } from "./cobertura";
import { type AssinaturaLida, lerFatosDeAcesso } from "./repository";

/**
 * A assinatura como `decidirAcesso` a entende. Produto que não é um plano do
 * Recreio não dá plano nenhum: fica só o registro de que já houve assinatura.
 */
function assinaturaDoGrupo(lida: AssinaturaLida | null): AssinaturaDoGrupo | null {
  if (!lida) return null;
  const produto = PRODUCTS.find((item) => item.app === "recreio" && item.id === lida.productId);
  const tier = tierDoProduto(produto?.tier);
  return tier && { id: lida.id, status: lida.status, tier, cancelaEm: lida.cancelaEm };
}

/**
 * O direito de jogar de um perfil, agora. Carrega os fatos (perfil, grupo,
 * assinatura do titular, concessões) e entrega a `decidirAcesso`, que é quem
 * decide. É a única porta do app para essa pergunta: telas, ingresso e
 * renovação de sessão chamam aqui, e ninguém mais lê assinatura ou concessão.
 *
 * `gameId` só confere que o jogo existe no catálogo. O estado de publicação
 * do jogo não é direito de abrir, e o plano vale para todos os jogos.
 */
export async function avaliarAcesso(entrada: {
  profileId: PerfilId;
  gameId?: string;
}): Promise<DecisaoDeAcesso> {
  const perfilId = PerfilIdSchema.parse(entrada.profileId);
  if (entrada.gameId !== undefined && !JOGOS.some((jogo) => jogo.id === entrada.gameId))
    throw new ErroDoRecreio("JOGO_INDISPONIVEL");
  const fatos = await lerFatosDeAcesso(perfilId);
  if (!fatos) throw new ErroDoRecreio("SEM_PERFIL");
  const { perfil, grupo } = fatos;
  const lida = grupo?.assinaturaAtiva ?? grupo?.assinaturaInativa ?? null;
  return decidirComCobertura(
    {
      agora: new Date(),
      perfil: {
        id: perfil.id,
        status: perfil.status,
        grupoId: grupo?.id ?? null,
        versaoDaPolitica: perfil.versaoDaPolitica,
      },
      assinatura: assinaturaDoGrupo(lida),
      teveAssinatura: lida !== null,
      concessoes: grupo?.concessoes ?? [],
    },
    { ligada: perfil.coberturaLigada, cobertosDoGrupo: grupo?.cobertos ?? [] },
  );
}
