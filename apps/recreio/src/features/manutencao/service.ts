import "server-only";
import { limparConvitesDeGrupo } from "@/features/grupo/convites-retencao-repository";
import {
  exigirFilaDeSegurancaEmDia,
  limparDenuncias,
} from "@/features/moderacao/retencao-repository";
import { limparConvitesDirigidos } from "@/features/mundos/convites-dirigidos-retencao-repository";
import { fecharPossesVencidas, marcarInstanciasSumidas } from "@/features/posse/repository";
import {
  apagarIngressosAntigos,
  encerrarSessoesVencidas,
} from "@/features/sessao-de-jogo/repository";
import { limparRegistrosSociais } from "@/features/social/retencao-repository";
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
  convitesDirigidosVencidos: number;
  recibosDeConviteDirigidoApagados: number;
  cadastrosPendentesApagados: number;
  recibosDeCadastroApagados: number;
  pareamentosApagados: number;
  aparelhosNaoConfirmadosEncerrados: number;
  diasDeUsoApagados: number;
  recibosDeSalvamentoApagados: number;
  convitesDeGrupoVencidos: number;
  recibosDeGrupoApagados: number;
  pedidosSociaisVencidos: number;
  codigosSociaisApagados: number;
  recibosSociaisApagados: number;
  avisosSociaisApagados: number;
  relacoesSociaisApagadas: number;
  vinculosDeCodigoSocialLimpos: number;
  vinculosDePedidoSocialLimpos: number;
  denunciasApagadas: number;
  denunciasVencidasSemSolucao: number;
  denunciasPrioritariasAtrasadas: number;
  denunciasAtrasadas: number;
  denunciasEncerradas: number;
  recursosDeRestricaoApagados: number;
  recursosDeRestricaoVencidosSemSolucao: number;
  recursosDeRestricaoAtrasados: number;
  comandosDeModeracaoApagados: number;
  restricoesLiberadasApagadas: number;
}> {
  const possesVencidas = await fecharPossesVencidas();
  const instanciasSumidas = await marcarInstanciasSumidas();
  const ingressosApagados = await apagarIngressosAntigos();
  const sessoesExpiradas = await encerrarSessoesVencidas();
  const convitesApagados = await apagarConvitesAntigos();
  const dirigidos = await limparConvitesDirigidos();
  const intencoes = await apagarIntencoesAntigas();
  const diasDeUsoApagados = await apagarUsoAntigo();
  const recibosDeSalvamentoApagados = await apagarSalvamentosAntigos();
  const convitesDeGrupo = await limparConvitesDeGrupo();
  const social = await limparRegistrosSociais();
  const denuncias = await limparDenuncias();
  // O expurgo já confirmou sua auditoria; atendimento atrasado continua sendo falha operacional.
  exigirFilaDeSegurancaEmDia(denuncias);
  return {
    possesVencidas,
    instanciasSumidas,
    ingressosApagados,
    sessoesExpiradas,
    convitesApagados,
    ...dirigidos,
    ...intencoes,
    diasDeUsoApagados,
    recibosDeSalvamentoApagados,
    ...convitesDeGrupo,
    ...social,
    ...denuncias,
  };
}
