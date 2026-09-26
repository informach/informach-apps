import type { SkillPack } from "../skill-factory";
import { balancas } from "./balancas";
import { caminhos } from "./caminhos";
import { composicaoDeFiguras } from "./composicao-de-figuras";
import { contagemCasos } from "./contagem-casos";
import { contagemInicial } from "./contagem-inicial";
import { coordenadas } from "./coordenadas";
import { equacoes } from "./equacoes";
import { inflacao } from "./inflacao";
import { invariantes } from "./invariantes";
import { investimentos } from "./investimentos";
import { juros } from "./juros";
import { logicaN2 } from "./logica-n2";
import { orcamentoN2 } from "./orcamento-n2";
import { orientacaoEspacial } from "./orientacao-espacial";
import { padroesIniciais } from "./padroes-iniciais";
import { pitagoras } from "./pitagoras";
import { porcentagemN2 } from "./porcentagem-n2";
import { proporcao } from "./proporcao";
import { restos } from "./restos";
import { semelhanca } from "./semelhanca";
import { tabelas } from "./tabelas";
import { tempoEMedidas } from "./tempo-e-medidas";

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
];
