import type { Aparencia, Fase } from "../dominio/tipos";
import { DefinicaoDeBairroSchema } from "../formatos/bairro";
import { type ModeloDeImovel, ModeloDeImovelSchema } from "../formatos/imovel";
import { CATALOGO_DA_PROVA } from "./catalogo/prova";
import type {
  ComportamentoDeObjeto,
  Conteudo,
  DefInteracao,
  DefNecessidade,
  DefSensacao,
  EntradaDeCatalogo,
} from "./esquema";
import casaProva from "./imoveis/casa-prova.v1.json" with { type: "json" };
import { COMPORTAMENTOS, INTERACOES } from "./interacoes";
import bairroProva from "./mundos/bairro-prova.v1.json" with { type: "json" };
import { NECESSIDADES, SENSACOES } from "./necessidades";

export * from "./esquema";

export const CONTEUDO: Conteudo = {
  necessidades: NECESSIDADES,
  sensacoes: SENSACOES,
  interacoes: INTERACOES,
  comportamentos: COMPORTAMENTOS,
  catalogo: CATALOGO_DA_PROVA,
};

function indexar<T extends { id: string }>(itens: readonly T[]): ReadonlyMap<string, T> {
  const mapa = new Map<string, T>();
  for (const item of itens) {
    if (mapa.has(item.id)) throw new Error(`Id repetido no conteúdo: ${item.id}`);
    mapa.set(item.id, item);
  }
  return mapa;
}

const necessidadesPorId = indexar(NECESSIDADES);
const sensacoesPorId = indexar(SENSACOES);
const interacoesPorId = indexar(INTERACOES);
const comportamentosPorId = indexar(COMPORTAMENTOS);
const catalogoPorId = indexar(CATALOGO_DA_PROVA);

export function necessidade(id: string): DefNecessidade | undefined {
  return necessidadesPorId.get(id);
}

export function sensacao(id: string): DefSensacao | undefined {
  return sensacoesPorId.get(id);
}

export function interacao(id: string): DefInteracao | undefined {
  return interacoesPorId.get(id);
}

export function comportamento(id: string): ComportamentoDeObjeto | undefined {
  return comportamentosPorId.get(id);
}

export function doCatalogo(id: string): EntradaDeCatalogo | undefined {
  return catalogoPorId.get(id);
}

/** As necessidades de uma fase, na ordem do conteúdo. */
export function necessidadesDaFase(fase: Fase): DefNecessidade[] {
  return NECESSIDADES.filter((def) => def.fases.includes(fase));
}

/** Corpo de cada fase, pelas duas linhas da biblioteca de personagens. */
const CORPOS: Record<Aparencia["linha"], Record<Fase, string>> = {
  f: {
    colo: "bebe_f",
    pequeno: "pequena_f",
    crianca: "crianca_f",
    adolescente: "adolescente_f",
    adulto: "adulta",
    idoso: "idosa",
  },
  m: {
    colo: "bebe_m",
    pequeno: "pequeno_m",
    crianca: "crianca_m",
    adolescente: "adolescente_m",
    adulto: "adulto",
    idoso: "idoso",
  },
};

export function corpoDaFase(linha: Aparencia["linha"], fase: Fase): string {
  return CORPOS[linha][fase];
}

/** Quanto cada fase anda por tick (100 ms). Bebê de colo não anda. */
export const MM_POR_TICK: Record<Fase, number> = {
  colo: 0,
  pequeno: 60,
  crianca: 120,
  adolescente: 135,
  adulto: 130,
  idoso: 90,
};

export const FASES_QUE_CUIDAM: readonly Fase[] = ["adolescente", "adulto", "idoso"];

/** Qual cuidado atende cada necessidade de um bebê ou de um pequeno. */
export const CUIDADO_POR_NECESSIDADE: Record<Fase, Record<string, string>> = {
  colo: {
    mamar: "dar_mamadeira",
    fralda: "trocar_fralda",
    vinculo: "brincar_com_bebe",
    sono: "por_para_dormir",
  },
  pequeno: {
    fome: "dar_comida",
    fralda: "trocar_fralda",
    higiene: "limpar_o_pequeno",
    social: "brincar_com_bebe",
  },
  crianca: {},
  adolescente: {},
  adulto: {},
  idoso: {},
};

const modelos = new Map<string, ModeloDeImovel>();
for (const bruto of [casaProva]) {
  const modelo = ModeloDeImovelSchema.parse(bruto);
  modelos.set(`${modelo.id}@${modelo.versao}`, modelo);
}

/** Um modelo de imóvel, como `id@versao`. */
export function modeloDeImovel(referencia: string): ModeloDeImovel | undefined {
  return modelos.get(referencia);
}

/** O bairro da etapa 1: dois lotes, um com a casa pronta e um vazio. */
export const BAIRRO_DA_PROVA = DefinicaoDeBairroSchema.parse(bairroProva);

/**
 * Confere as referências cruzadas do conteúdo. Devolve a lista de problemas;
 * vazia quando está tudo certo.
 */
export function validarConteudo(conteudo: Conteudo = CONTEUDO): string[] {
  const problemas: string[] = [];
  const necessidades = new Set(conteudo.necessidades.map((def) => def.id));
  const sensacoes = new Set(conteudo.sensacoes.map((def) => def.id));
  const interacoes = new Map(conteudo.interacoes.map((def) => [def.id, def]));
  const comportamentos = new Map(conteudo.comportamentos.map((def) => [def.id, def]));

  for (const def of conteudo.necessidades) {
    if (!sensacoes.has(def.sensacao)) problemas.push(`${def.id}: sensação ${def.sensacao}`);
    if (def.esvaziaEmHoras <= 0) problemas.push(`${def.id}: tempo de esvaziar`);
  }

  for (const def of conteudo.interacoes) {
    for (const anuncio of def.anuncia) {
      if (!necessidades.has(anuncio.necessidade)) {
        problemas.push(`${def.id}: anuncia ${anuncio.necessidade}`);
      }
    }
    for (const efeito of def.efeitos) {
      if (efeito.t === "necessidade" || efeito.t === "necessidade_ao_concluir") {
        if (!necessidades.has(efeito.id)) problemas.push(`${def.id}: efeito em ${efeito.id}`);
      }
      if (efeito.t === "sensacao" && !sensacoes.has(efeito.id)) {
        problemas.push(`${def.id}: sensação ${efeito.id}`);
      }
      if ((efeito.t === "vinculo" || "quem" in efeito) && def.alvo !== "morador") {
        if (efeito.t === "vinculo" || efeito.quem === "alvo") {
          problemas.push(`${def.id}: efeito no alvo sem alvo morador`);
        }
      }
    }
    if ("ate" in def.duracao && !necessidades.has(def.duracao.ate.necessidade)) {
      problemas.push(`${def.id}: dura até ${def.duracao.ate.necessidade}`);
    }
    if (def.alvo === "objeto" && !def.tipoDePonto) problemas.push(`${def.id}: sem tipo de ponto`);
    for (const teste of def.requer) {
      if (teste.t === "objeto_no_lote" && !comportamentos.has(teste.comportamento)) {
        problemas.push(`${def.id}: exige ${teste.comportamento}`);
      }
    }
  }

  for (const def of conteudo.comportamentos) {
    for (const id of def.interacoes) {
      const alvo = interacoes.get(id);
      if (!alvo) problemas.push(`${def.id}: interação ${id}`);
      else if (alvo.alvo !== "objeto") problemas.push(`${def.id}: ${id} não é de objeto`);
    }
  }

  for (const entrada of conteudo.catalogo) {
    if (!entrada.comportamento) continue;
    const def = comportamentos.get(entrada.comportamento);
    if (!def) {
      problemas.push(`${entrada.id}: comportamento ${entrada.comportamento}`);
      continue;
    }
    const tipos = new Set((entrada.pontos ?? []).map((ponto) => ponto.tipo));
    for (const id of def.interacoes) {
      const tipo = interacoes.get(id)?.tipoDePonto;
      if (tipo && !tipos.has(tipo)) problemas.push(`${entrada.id}: ${id} pede ponto ${tipo}`);
    }
  }

  return problemas;
}
