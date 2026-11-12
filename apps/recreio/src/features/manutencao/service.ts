import "server-only";
import { fecharPossesVencidas, marcarInstanciasSumidas } from "@/features/posse/repository";
import {
  apagarIngressosAntigos,
  encerrarSessoesVencidas,
} from "@/features/sessao-de-jogo/repository";

/**
 * A rotina de manutenção do Recreio. Cada passo é idempotente e independente:
 * rodar duas vezes seguidas não muda nada na segunda. Devolve só contagens.
 *
 * Nada aqui é caminho crítico. Abrir um mundo fecha a posse vencida na hora, e
 * a renovação recusa a sessão sem acesso na hora; a rotina recolhe o que ficou
 * para trás (mundo que ninguém reabriu, sessão cujo navegador sumiu).
 */
export async function executarManutencao(): Promise<{
  possesVencidas: number;
  instanciasSumidas: number;
  ingressosApagados: number;
  sessoesExpiradas: number;
}> {
  const possesVencidas = await fecharPossesVencidas();
  const instanciasSumidas = await marcarInstanciasSumidas();
  const ingressosApagados = await apagarIngressosAntigos();
  const sessoesExpiradas = await encerrarSessoesVencidas();
  return { possesVencidas, instanciasSumidas, ingressosApagados, sessoesExpiradas };
}
