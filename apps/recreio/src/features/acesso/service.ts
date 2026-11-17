import "server-only";
import {
  type DecisaoDeAcesso,
  ErroDoRecreio,
  type PerfilId,
  PerfilIdSchema,
} from "@informach/recreio";
import { manifestoDoJogo } from "@/features/jogos/config";
import { decidirFatosLidos } from "./decisao";
import { lerFatosDeAcesso } from "./repository";

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
  if (entrada.gameId !== undefined && !manifestoDoJogo(entrada.gameId))
    throw new ErroDoRecreio("JOGO_INDISPONIVEL");
  return decidirFatosLidos(await lerFatosDeAcesso(perfilId), new Date());
}
