import type { SkillPack } from "../skill-factory";
import { argumentacaoEm } from "./argumentacao-em";
import { balancas } from "./balancas";
import { caminhos } from "./caminhos";
import { cenarios } from "./cenarios";
import { combinacoes } from "./combinacoes";
import { composicaoDeFiguras } from "./composicao-de-figuras";
import { contagemCasos } from "./contagem-casos";
import { contagemInicial } from "./contagem-inicial";
import { coordenadas } from "./coordenadas";
import { coordenadasEm } from "./coordenadas-em";
import { equacoes } from "./equacoes";
import { equacoesEm } from "./equacoes-em";
import { equivalenciaTemporal } from "./equivalencia-temporal";
import { espaco } from "./espaco";
import { estruturasNumericas } from "./estruturas-numericas";
import { funcoes } from "./funcoes";
import { geometriaPlana } from "./geometria-plana";
import { inducao } from "./inducao";
import { inflacao } from "./inflacao";
import { invariantes } from "./invariantes";
import { investimentos } from "./investimentos";
import { juros } from "./juros";
import { logicaEm } from "./logica-em";
import { logicaN2 } from "./logica-n2";
import { modelosFinanceiros } from "./modelos-financeiros";
import { orcamentoN2 } from "./orcamento-n2";
import { orientacaoEspacial } from "./orientacao-espacial";
import { padroesIniciais } from "./padroes-iniciais";
import { pitagoras } from "./pitagoras";
import { polinomios } from "./polinomios";
import { porcentagemN2 } from "./porcentagem-n2";
import { probabilidadeEm } from "./probabilidade-em";
import { proporcao } from "./proporcao";
import { recorrencias } from "./recorrencias";
import { rendaFixa } from "./renda-fixa";
import { rendaVariavel } from "./renda-variavel";
import { restos } from "./restos";
import { semelhanca } from "./semelhanca";
import { tabelas } from "./tabelas";
import { tempoEMedidas } from "./tempo-e-medidas";
import { trigonometria } from "./trigonometria";

/**
 * Registro das habilidades das faixas além de 6º/7º, na ordem de autoria.
 * A ordem importa: ela define a sequência dos itens no inventário e, com
 * isso, as fronteiras dos lotes de autoria em `lotes.ts`.
 */
export const skillPacks: SkillPack[] = [
  proporcao,
  equacoes,
  semelhanca,
  pitagoras,
  restos,
  contagemCasos,
  invariantes,
  coordenadas,
  logicaN2,
  // Onda 1b (8º/9º): OLITEF N2.
  porcentagemN2,
  juros,
  orcamentoN2,
  inflacao,
  investimentos,
  // Onda 2 (3º ao 5º): Canguru P e Mirim 2.
  contagemInicial,
  padroesIniciais,
  orientacaoEspacial,
  composicaoDeFiguras,
  tempoEMedidas,
  balancas,
  caminhos,
  tabelas,
  // Onda 3a (ensino médio): OBMEP N3 e Canguru J.
  funcoes,
  recorrencias,
  estruturasNumericas,
  geometriaPlana,
  combinacoes,
  probabilidadeEm,
  argumentacaoEm,
  polinomios,
  inducao,
  coordenadasEm,
  // Onda 3b (3ª série do EM): Canguru S.
  equacoesEm,
  trigonometria,
  espaco,
  logicaEm,
  // Onda 3c (ensino médio): OLITEF N3.
  modelosFinanceiros,
  equivalenciaTemporal,
  rendaFixa,
  rendaVariavel,
  cenarios,
];
