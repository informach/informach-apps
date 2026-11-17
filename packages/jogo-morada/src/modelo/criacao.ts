import {
  type CatalogoDeAparencias,
  type Fase,
  type OpcaoDeAparencia,
  type RascunhoDaFamilia,
  RascunhoDaFamiliaSchema,
} from "@informach/morada-sim";
import { corpoDaFase } from "@informach/morada-sim/conteudo";
import type { DescricaoDoMorador } from "../ativos/ativos";

export type MoradorDoRascunho = RascunhoDaFamilia["moradores"][number];
export type EditorDaFamilia = {
  nome: string;
  moradores: { chave: string; dados: MoradorDoRascunho }[];
  relacoes: {
    chave: string;
    a: string;
    b: string;
    tipo: RascunhoDaFamilia["relacoes"][number]["tipo"];
  }[];
};

export const NOMES_DAS_FASES: Record<Fase, string> = {
  colo: "Bebê de colo",
  pequeno: "Pequeno",
  crianca: "Criança",
  adolescente: "Adolescente",
  adulto: "Adulto",
  idoso: "Idoso",
};
export const NOMES_DOS_TRACOS: Record<string, string> = {
  carinhoso: "Carinhoso",
  caseiro: "Caseiro",
  extrovertido: "Extrovertido",
  curioso: "Curioso",
  tranquilo: "Tranquilo",
  criativo: "Criativo",
};
export const NOMES_DAS_PARTES: Record<string, string> = {
  inteira: "Macacão",
  cima: "Blusa",
  baixo: "Calça",
  pes: "Calçados",
  sobre: "Casaco",
  oculos: "Óculos",
  cabeca: "Chapéu",
};

export function aplicarOpcaoDeAparencia(
  dados: MoradorDoRascunho,
  opcao: OpcaoDeAparencia,
): MoradorDoRascunho {
  return {
    ...dados,
    fase: opcao.fase,
    linha: opcao.linha,
    cabelo: opcao.cabelo,
    roupa: opcao.roupa,
    edicao: {
      versao: 1,
      corDoCabelo: dados.edicao?.corDoCabelo ?? opcao.edicaoInicial.corDoCabelo,
      coresDaRoupa: Object.fromEntries(
        Object.entries(opcao.edicaoInicial.coresDaRoupa).map(([parte, cor]) => [
          parte,
          dados.edicao?.coresDaRoupa[parte] ?? cor,
        ]),
      ),
    },
  };
}

export function novoMoradorDoRascunho(
  catalogo: CatalogoDeAparencias | null,
  fase: Fase = "adulto",
  linha: "f" | "m" = "f",
  nome = "",
): MoradorDoRascunho {
  const dados: MoradorDoRascunho = {
    nome,
    fase,
    linha,
    pele: 0xa07050,
    cabelo: "coque_alto",
    roupa: "casual_vestido",
    tracos: [],
  };
  if (!catalogo) return dados;
  const opcao =
    catalogo.opcoes.find(
      (o) =>
        o.fase === fase && o.linha === linha && o.cabelo === "natural" && o.roupa === "cotidiano",
    ) ?? catalogo.opcoes.find((o) => o.fase === fase && o.linha === linha);
  if (!opcao) throw new Error("O catálogo não oferece esta fase e linha");
  return aplicarOpcaoDeAparencia({ ...dados, pele: opcao.peleInicial }, opcao);
}

export function iniciarEditorDaFamilia(
  catalogo: CatalogoDeAparencias | null,
  chave: string,
): EditorDaFamilia {
  return {
    nome: "Minha família",
    moradores: [{ chave, dados: novoMoradorDoRascunho(catalogo) }],
    relacoes: [],
  };
}

/** Exemplo explícito, revisável antes de confirmar; nenhum vínculo é inferido do nome. */
export function familiaDeExemplo(
  catalogo: CatalogoDeAparencias | null,
  chaves: readonly string[],
): EditorDaFamilia {
  if (chaves.length !== 4 || new Set(chaves).size !== 4)
    throw new Error("O exemplo precisa de quatro chaves distintas");
  const definicoes: {
    nome: string;
    fase: Fase;
    linha: "f" | "m";
    pele: number;
    cabelo: string;
    roupa: string;
    tracos: MoradorDoRascunho["tracos"];
  }[] = [
    {
      nome: "Lia",
      fase: "adulto",
      linha: "f",
      pele: 13008984,
      cabelo: "coque_alto",
      roupa: "casual_vestido",
      tracos: ["carinhoso"],
    },
    {
      nome: "Marcos",
      fase: "adulto",
      linha: "m",
      pele: 9136452,
      cabelo: "curto_lateral",
      roupa: "casual_camiseta",
      tracos: ["criativo"],
    },
    {
      nome: "Nina",
      fase: "crianca",
      linha: "f",
      pele: 11897418,
      cabelo: "trancas",
      roupa: "infantil_macacao",
      tracos: ["curioso"],
    },
    {
      nome: "Vó Ana",
      fase: "idoso",
      linha: "f",
      pele: 14725500,
      cabelo: "coque_baixo",
      roupa: "casual_cardiga",
      tracos: ["tranquilo"],
    },
  ];
  const moradores = definicoes.map((d, i) => {
    const chave = chaves[i];
    if (!chave) throw new Error("Chave ausente");
    const dados = catalogo
      ? {
          ...novoMoradorDoRascunho(catalogo, d.fase, d.linha, d.nome),
          pele: d.pele,
          tracos: d.tracos,
        }
      : d;
    return { chave, dados };
  });
  const [a, b, c, d] = moradores;
  if (!a || !b || !c || !d) throw new Error("Moradores ausentes");
  return {
    nome: "Ipê",
    moradores,
    relacoes: [
      { chave: "exemplo-casal", a: a.chave, b: b.chave, tipo: "casamento" },
      { chave: "exemplo-mae", a: a.chave, b: c.chave, tipo: "genitor" },
      { chave: "exemplo-pai", a: b.chave, b: c.chave, tipo: "genitor" },
      { chave: "exemplo-avo", a: d.chave, b: a.chave, tipo: "genitor" },
    ],
  };
}

export function removerMoradorDoRascunho(editor: EditorDaFamilia, chave: string): EditorDaFamilia {
  const moradores = editor.moradores.filter((m) => m.chave !== chave);
  if (moradores.length === 0) throw new Error("A família precisa de pelo menos um morador");
  return {
    ...editor,
    moradores,
    relacoes: editor.relacoes.filter((r) => r.a !== chave && r.b !== chave),
  };
}

function montarRascunho(editor: EditorDaFamilia): RascunhoDaFamilia {
  const indices = new Map(editor.moradores.map((m, i) => [m.chave, i]));
  if (indices.size !== editor.moradores.length) throw new Error("Chaves de moradores repetidas");
  return {
    nome: editor.nome,
    moradores: editor.moradores.map((m) => m.dados),
    relacoes: editor.relacoes.map((r) => {
      const a = indices.get(r.a),
        b = indices.get(r.b);
      if (a === undefined || b === undefined) throw new Error("Relação com morador removido");
      return { a, b, tipo: r.tipo };
    }),
  };
}

export function conferirRascunho(editor: EditorDaFamilia) {
  return RascunhoDaFamiliaSchema.safeParse(montarRascunho(editor));
}
export function rascunhoParaConfirmar(editor: EditorDaFamilia): RascunhoDaFamilia {
  return RascunhoDaFamiliaSchema.parse(montarRascunho(editor));
}

export function descricaoDaPrevia(dados: MoradorDoRascunho): DescricaoDoMorador {
  return {
    moradorId: "mor_previa",
    fase: dados.fase,
    aparencia: {
      linha: dados.linha,
      corpo: corpoDaFase(dados.linha, dados.fase),
      pele: dados.pele,
      cabelo: dados.cabelo,
      roupa: dados.roupa,
      semente: 0,
      ...(dados.edicao ? { edicao: dados.edicao } : {}),
    },
  };
}
