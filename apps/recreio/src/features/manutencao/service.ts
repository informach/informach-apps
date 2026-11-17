import "server-only";
import { fecharPossesVencidas, marcarInstanciasSumidas } from "@/features/posse/repository";
import {
  apagarIngressosAntigos,
  encerrarSessoesVencidas,
} from "@/features/sessao-de-jogo/repository";
import {
  apagarConvitesAntigos,
  apagarIntencoesAntigas,
  apagarSalvamentosAntigos,
  apagarUsoAntigo,
} from "./repository";

/**
 * A rotina de manutenção do Recreio. Cada passo é idempotente e independente:
 * repetir continua os lotes restantes sem repetir efeitos. Devolve só contagens;
 * uma contagem zero pode decorrer de linhas disputadas, não de ausência global.
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
  convitesApagados: number;
  cadastrosPendentesApagados: number;
  recibosDeCadastroApagados: number;
  pareamentosApagados: number;
  aparelhosNaoConfirmadosEncerrados: number;
  diasDeUsoApagados: number;
  recibosDeSalvamentoApagados: number;
}> {
  const possesVencidas = await fecharPossesVencidas();
  const instanciasSumidas = await marcarInstanciasSumidas();
  const ingressosApagados = await apagarIngressosAntigos();
  const sessoesExpiradas = await encerrarSessoesVencidas();
  const convitesApagados = await apagarConvitesAntigos();
  const intencoes = await apagarIntencoesAntigas();
  const diasDeUsoApagados = await apagarUsoAntigo();
  const recibosDeSalvamentoApagados = await apagarSalvamentosAntigos();
  return {
    possesVencidas,
    instanciasSumidas,
    ingressosApagados,
    sessoesExpiradas,
    convitesApagados,
    ...intencoes,
    diasDeUsoApagados,
    recibosDeSalvamentoApagados,
  };
}
