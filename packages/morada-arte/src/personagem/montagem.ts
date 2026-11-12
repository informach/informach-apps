import { corPeloNome, hexParaLinear, type Rgb } from "../cor/cores";
import {
  assarTextura,
  coresDosVertices,
  type ErroDePintura,
  erroDaPinturaPorVertice,
  type FonteDeCor,
} from "../cor/pintura";
import {
  camadaCoberta,
  coberturaDaPele,
  pecasAcima,
  REFERENCIAL_DO_MODELO,
  type Referencial,
} from "../encaixe/cobertura";
import { type LigacaoDaPele, montarItem, type PecaMontada, prepararPele } from "../encaixe/montar";
import { ErroDeArte } from "../erros";
import type { Biblioteca } from "../leitura/biblioteca";
import {
  type Corpo,
  indiceDoOsso,
  type MalhaDoCorpo,
  malhaDoCorpo,
  type Primitiva,
} from "../leitura/corpo";
import { escreverPng, type Imagem } from "../leitura/imagem";
import { em, item } from "../numeros";
import type { Personagem } from "./esquema";
import { cortarPorPlano, emendar, type Parte, type PrimitivaPronta, recortar } from "./partes";
import { type Plano, resolver } from "./resolucao";

/**
 * Monta um personagem inteiro: corpo, peças encaixadas, cabelo, rostos e
 * cores, já sem o que a página esconde. Sai uma malha de corpo com o mínimo de
 * primitivas, uma malha por expressão do rosto e, no bebê, a chupeta à parte.
 */

/** As expressões que o jogo usa, das doze que a biblioteca tem. */
export const EXPRESSOES_DO_JOGO = [
  "neutro",
  "feliz",
  "triste",
  "bravo",
  "dormindo",
  "chorando",
  "surpreso",
] as const;

export type OpcoesDeMontagemDoPersonagem = {
  /** Expressões que entram no pacote; a primeira é a que aparece ao carregar. */
  expressoes: readonly string[];
  /** Em quais expressões ficam as sete formas de fala. */
  fala: readonly string[];
  /**
   * Acima de quantos níveis (de 255, em sRGB) de erro, em qualquer ponto conferido, uma peça deixa de
   * ser pintada nos vértices e leva textura. As paletas dos pacotes ficam abaixo de 6; qualquer estampa
   * (até um botão ou uma faixa lateral), acima de 13.
   */
  limiarDeTextura: number;
  /** Lado máximo, em pixels, das texturas assadas. */
  ladoDaTextura: number;
  /** Quanto uma textura assada pode pesar em PNG; acima disso ela é reduzida à metade, até 64 pixels. */
  bytesDaTextura: number;
  /** Em que referencial a conta do que some é feita (o da página só serve para conferir com ela). */
  referencial: (corpo: Corpo) => Referencial;
};

export const OPCOES_PADRAO: OpcoesDeMontagemDoPersonagem = {
  expressoes: EXPRESSOES_DO_JOGO,
  fala: ["neutro"],
  limiarDeTextura: 10,
  ladoDaTextura: 512,
  bytesDaTextura: 48 * 1024,
  referencial: () => REFERENCIAL_DO_MODELO,
};

export type PecaNoRelatorio = {
  id: string;
  material: string;
  vertices: number;
  triangulos: number;
  /** Triângulos que saíram por estarem debaixo de outra peça. */
  escondidos: number;
  erro: ErroDePintura;
  comTextura: boolean;
};

export type PersonagemMontado = {
  plano: Plano;
  corpo: Corpo;
  /** As primitivas da malha do corpo: a pintada nos vértices primeiro, depois as com textura. */
  primitivas: PrimitivaPronta[];
  rostos: { expressao: string; primitiva: PrimitivaPronta }[];
  chupeta: PrimitivaPronta | null;
  /** Formas de gravidez da malha do corpo, na ordem (vazio em quem não engravida). */
  gravidez: string[];
  /** A malha do corpo traz pesos alternativos para as poses dobradas. */
  dobrado: boolean;
  /** Quais vértices da pele cada peça cobre (para conferir com a página). */
  cobertura: Map<string, Uint8Array>;
  /** Quais vértices de cada peça as de cima cobrem. */
  camadas: Map<string, Uint8Array>;
  /** O índice da pele depois de tirar o que está coberto. */
  indicesDaPele: Uint32Array;
  pecasMontadas: Map<string, PecaMontada>;
  relatorio: {
    pele: { triangulos: number; escondidos: number; erro: ErroDePintura };
    pecas: PecaNoRelatorio[];
    /** Maior componente de cor linear (acima de 1 a cor não cabe em inteiro normalizado). */
    corMaxima: number;
  };
};

const BRANCO: Rgb = [1, 1, 1];

function parteDoCorpo(
  primitiva: Primitiva,
  nome: string,
  fonte: FonteDeCor,
  formas: boolean,
): Parte {
  return {
    nome,
    posicoes: primitiva.posicoes,
    normais: primitiva.normais,
    uv: primitiva.uv,
    coresDoArquivo: primitiva.cores,
    pesos: { ossos: primitiva.ossos, pesos: primitiva.pesos },
    pesosDobrado: null,
    indices: primitiva.indices,
    formas: new Map(
      formas
        ? primitiva.formas.map((f) => [f.nome, { posicoes: f.posicoes, normais: f.normais }])
        : [],
    ),
    fonte,
  };
}

/** A cor de uma parte nos vértices, multiplicada pela cor por vértice do arquivo quando o corpo traz uma. */
function pintar(parte: Parte): Float32Array {
  const cores = coresDosVertices(parte.fonte, parte.uv, parte.posicoes.length / 3);
  const daMalha = parte.coresDoArquivo;
  if (daMalha) {
    for (let i = 0; i < cores.length; i++) cores[i] = em(cores, i) * em(daMalha, i);
  }
  return cores;
}

function exigirMalha(corpo: Corpo, sufixo: string): MalhaDoCorpo {
  const malha = malhaDoCorpo(corpo, sufixo);
  if (!malha)
    throw new ErroDeArte(corpo.arquivo, `o corpo não tem a malha ${corpo.id}_${sufixo}`, "meshes");
  return malha;
}

/** O plano acima do qual o cabelo não é desenhado com chapéu (`aplicarCorteCabelo`), no espaço da malha. */
function planoDoCorte(
  ligacao: LigacaoDaPele,
  corte: NonNullable<Plano["corte"]>,
): { ponto: number[]; normal: number[] } {
  const [hmin, hmax] = ligacao.pele.cabeca;
  const M = ligacao.pele.afim;
  const H = hmax[2] - hmin[2];
  const L = hmax[1] - hmin[1];
  const aplicar = (q: readonly number[], comTranslacao: boolean): number[] =>
    [0, 1, 2].map((r) => {
      const linha = item(M, r);
      return (
        linha[0] * em(q, 0) +
        linha[1] * em(q, 1) +
        linha[2] * em(q, 2) +
        (comTranslacao ? linha[3] : 0)
      );
    });
  const cx = (hmin[0] + hmax[0]) / 2;
  const zf = hmin[2] + corte.f * H;
  const zb = zf - corte.inc * H;
  const ponto = aplicar([cx, hmin[1], zf], true);
  const a = aplicar([1, 0, 0], false);
  const b = aplicar([0, L, zb - zf], false);
  let normal = [
    em(a, 1) * em(b, 2) - em(a, 2) * em(b, 1),
    em(a, 2) * em(b, 0) - em(a, 0) * em(b, 2),
    em(a, 0) * em(b, 1) - em(a, 1) * em(b, 0),
  ];
  const comprimento = Math.hypot(...normal) || 1;
  normal = normal.map((x) => x / comprimento);
  const cima = aplicar([0, 0, 1], false);
  if (em(normal, 0) * em(cima, 0) + em(normal, 1) * em(cima, 1) + em(normal, 2) * em(cima, 2) < 0) {
    normal = normal.map((x) => -x);
  }
  return { ponto, normal };
}

export function montarPersonagem(
  biblioteca: Biblioteca,
  personagem: Personagem,
  opcoes: OpcoesDeMontagemDoPersonagem = OPCOES_PADRAO,
): PersonagemMontado {
  const plano = resolver(biblioteca, personagem);
  const corpo = biblioteca.corpo(personagem.corpo);
  const { tabelas } = biblioteca;
  const paleta = biblioteca.paletaDoCorpo();
  const referencial = opcoes.referencial(corpo);
  const corDoCabelo: FonteDeCor = { tipo: "lisa", cor: hexParaLinear(plano.corDoCabelo) };
  const pelePrimitiva = exigirMalha(corpo, "corpo").primitivas[0];
  if (!pelePrimitiva)
    throw new ErroDeArte(corpo.arquivo, "a malha do corpo não tem primitiva", "meshes");
  const gravidez = plano.engravida ? pelePrimitiva.formas.map((f) => f.nome) : [];

  // ---------------------------------------------------------------- peças e cabelo do catálogo
  let ligacao: LigacaoDaPele | null = null;
  const pecasMontadas = new Map<string, PecaMontada>();
  if (!plano.recem) {
    const pele = biblioteca.peles.get(personagem.corpo);
    if (!pele)
      throw new ErroDeArte(
        "peles.txt",
        `sem entrada para o corpo ${personagem.corpo}`,
        personagem.corpo,
      );
    const familia = biblioteca.familias.get(pele.familia);
    if (!familia)
      throw new ErroDeArte("familias.txt", `sem a família ${pele.familia}`, pele.familia);
    ligacao = prepararPele(corpo, pele, familia);
    for (const peca of plano.pecas) {
      pecasMontadas.set(peca.id, montarItem(ligacao, biblioteca.item(peca.id), { cabelo: false }));
    }
  }

  // ---------------------------------------------------------------- o que some
  const cobertura = new Map<string, Uint8Array>();
  const cobertos = new Uint8Array(pelePrimitiva.posicoes.length / 3);
  for (const peca of plano.pecas) {
    if (peca.catalogo.tipo !== "pele") continue;
    const montada = pecasMontadas.get(peca.id);
    if (!montada) continue;
    const cv = coberturaDaPele(
      corpo,
      pelePrimitiva,
      {
        posicoes: montada.posicoes,
        indices: montada.indices,
        solta: montada.solta,
        saiaFechada: montada.saiaFechada,
      },
      referencial,
    );
    cobertura.set(peca.id, cv);
    for (let i = 0; i < cv.length; i++) if (em(cv, i)) cobertos[i] = 1;
  }
  const semCobertos = (indices: ArrayLike<number>, marcas: Uint8Array | null): Uint32Array => {
    const saida: number[] = [];
    for (let t = 0; t < indices.length; t += 3) {
      const a = em(indices, t);
      const b = em(indices, t + 1);
      const c = em(indices, t + 2);
      if (marcas && em(marcas, a) && em(marcas, b) && em(marcas, c)) continue;
      saida.push(a, b, c);
    }
    return Uint32Array.from(saida);
  };
  const indicesDaPele = semCobertos(pelePrimitiva.indices, cobertos);

  const emCamadas = plano.pecas
    .filter((p) => p.catalogo.tipo === "pele")
    .map((p) => ({ id: p.id, slot: p.slot, cobre: p.catalogo.cobre !== undefined }));
  const camadas = new Map<string, Uint8Array>();
  for (const peca of emCamadas) {
    const acima = pecasAcima(peca, emCamadas);
    const montada = pecasMontadas.get(peca.id);
    if (acima.length === 0 || !montada) continue;
    const deCima = acima.map((id) => {
      const outra = pecasMontadas.get(id);
      if (!outra) throw new Error(`peça ${id} não montada`);
      return { posicoes: outra.posicoes, indices: outra.indices };
    });
    camadas.set(peca.id, camadaCoberta(corpo.altura, montada, deCima, referencial));
  }

  // ---------------------------------------------------------------- partes pintadas
  const partes: Parte[] = [];
  const pele = recortar(
    parteDoCorpo(
      pelePrimitiva,
      "pele",
      { tipo: "paleta", imagem: paleta, fator: plano.tom.pele },
      true,
    ),
    indicesDaPele,
  );
  partes.push(pele);
  const erroDaPele = erroDaPinturaPorVertice(pele.fonte, pele.uv, pele.indices);

  const relatorioDasPecas: PecaNoRelatorio[] = [];
  const comTextura: { parte: Parte; chave: string }[] = [];
  for (const peca of plano.pecas) {
    const montada = pecasMontadas.get(peca.id);
    if (!montada) continue;
    const marcas = camadas.get(peca.id) ?? null;
    const inteira: Parte = {
      nome: peca.id,
      posicoes: montada.posicoes,
      normais: montada.normais,
      uv: montada.uv,
      coresDoArquivo: null,
      pesos: montada.pesos,
      pesosDobrado: montada.pesosDobrado,
      indices: montada.indices,
      formas: new Map(montada.formas.map((f) => [f.nome, { posicoes: f.posicoes, normais: null }])),
      fonte: { tipo: "lisa", cor: BRANCO },
    };
    for (const [inicio, quantidade, material] of montada.grupos) {
      const doGrupo = montada.indices.subarray(inicio, inicio + quantidade);
      const visiveis = semCobertos(doGrupo, marcas);
      const info = biblioteca.mascaras[peca.id]?.[material];
      const livre = peca.cor && info ? { cor: hexParaLinear(peca.cor), lum: info.lum } : null;
      const fonte: FonteDeCor = {
        tipo: "roupa",
        imagem: biblioteca.texturaDeRoupa(material),
        mascara: livre && info ? biblioteca.mascara(info.mascara) : null,
        livre,
      };
      const parte = { ...recortar(inteira, visiveis, `${peca.id}:${material}`), fonte };
      const erro = erroDaPinturaPorVertice(fonte, parte.uv, parte.indices);
      const texturizar = erro.maximo > opcoes.limiarDeTextura;
      relatorioDasPecas.push({
        id: peca.id,
        material,
        vertices: parte.posicoes.length / 3,
        triangulos: parte.indices.length / 3,
        escondidos: (doGrupo.length - visiveis.length) / 3,
        erro,
        comTextura: texturizar,
      });
      if (parte.indices.length === 0) continue;
      if (texturizar) comTextura.push({ parte, chave: `${material}|${peca.cor ?? ""}|${peca.id}` });
      else partes.push(parte);
    }
  }

  // ---------------------------------------------------------------- cabelo e barba
  const cabelos: Parte[] = [];
  if (plano.recem) {
    const tipo = personagem.recem?.cabelo ?? "baixinho";
    const manta = corPeloNome(tabelas.MANTA_CORES, personagem.recem?.manta ?? "Creme");
    if (!manta)
      throw new ErroDeArte(
        `personagem "${personagem.id}"`,
        "a cor da manta não é um nome nem #rrggbb",
        "recem.manta",
      );
    const tecido: FonteDeCor = { tipo: "lisa", cor: hexParaLinear(manta) };
    if (tipo !== "careca") {
      const primitiva = exigirMalha(corpo, "cabelo").primitivas[0];
      if (primitiva) cabelos.push(parteDoCorpo(primitiva, "cabelo", corDoCabelo, false));
    }
    for (const sufixo of tipo === "gorro" ? ["manta", "gorro"] : ["manta"]) {
      const primitiva = malhaDoCorpo(corpo, sufixo)?.primitivas[0];
      if (primitiva) cabelos.push(parteDoCorpo(primitiva, sufixo, tecido, false));
    }
  } else if (ligacao) {
    let cabelo: Parte | null = null;
    if (plano.penteado === "cabelo" || plano.penteado === "cabelo_raspado") {
      const primitiva = exigirMalha(corpo, plano.penteado).primitivas[0];
      if (primitiva) cabelo = parteDoCorpo(primitiva, plano.penteado, corDoCabelo, false);
    } else if (plano.penteado !== "careca") {
      const montada = montarItem(ligacao, biblioteca.item(plano.penteado), { cabelo: true });
      pecasMontadas.set(plano.penteado, montada);
      cabelo = parteDeCabelo(montada, corDoCabelo);
    }
    if (cabelo) {
      if (plano.corte) {
        const { ponto, normal } = planoDoCorte(ligacao, plano.corte);
        cabelo = cortarPorPlano(cabelo, ponto, normal);
      }
      if (cabelo.indices.length > 0) cabelos.push(cabelo);
    }
    if (plano.barba) {
      const montada = montarItem(ligacao, biblioteca.item(plano.barba), { cabelo: true });
      pecasMontadas.set(plano.barba, montada);
      cabelos.push(parteDeCabelo(montada, corDoCabelo));
    }
  }
  partes.push(...cabelos);

  // ---------------------------------------------------------------- emenda
  const dobrado =
    partes.some((p) => p.pesosDobrado !== null) ||
    comTextura.some((t) => t.parte.pesosDobrado !== null);
  const coresDasPartes = new Map<Parte, Float32Array>();
  for (const parte of partes) coresDasPartes.set(parte, pintar(parte));
  const primitivas: PrimitivaPronta[] = [
    emendar(partes, {
      formas: gravidez,
      normaisDasFormas: true,
      dobrado,
      cores: coresDasPartes,
      textura: null,
    }),
  ];
  // peças com estampa: uma primitiva por textura assada (material e cor)
  const porTextura = new Map<string, Parte[]>();
  for (const { parte, chave } of comTextura)
    porTextura.set(chave, [...(porTextura.get(chave) ?? []), parte]);
  for (const grupo of porTextura.values()) {
    const fonte = item(grupo, 0).fonte;
    if (fonte.tipo !== "roupa") continue;
    primitivas.push(
      emendar(grupo, {
        formas: gravidez,
        normaisDasFormas: true,
        dobrado,
        cores: null,
        textura: texturaQueCabe(fonte, opcoes),
      }),
    );
  }

  // ---------------------------------------------------------------- rostos e chupeta
  const rostos: PersonagemMontado["rostos"] = [];
  for (const expressao of opcoes.expressoes) {
    const malha = malhaDoCorpo(corpo, `rosto_${expressao}`);
    if (!malha) continue;
    const comFala = opcoes.fala.includes(expressao);
    const doRosto = malha.primitivas.map((primitiva) => {
      const fator: Rgb =
        primitiva.material === "Rosto"
          ? [plano.tom.rosto, plano.tom.rosto, plano.tom.rosto]
          : BRANCO;
      return parteDoCorpo(
        primitiva,
        `rosto_${expressao}:${primitiva.material}`,
        { tipo: "paleta", imagem: paleta, fator },
        comFala,
      );
    });
    const nomesDaFala = comFala ? (malha.primitivas[0]?.formas.map((f) => f.nome) ?? []) : [];
    const cores = new Map(doRosto.map((p) => [p, pintar(p)] as const));
    rostos.push({
      expressao,
      primitiva: emendar(doRosto, {
        formas: nomesDaFala,
        normaisDasFormas: false,
        dobrado: false,
        cores,
        textura: null,
      }),
    });
  }
  if (rostos.length === 0)
    throw new ErroDeArte(corpo.arquivo, "o corpo não tem nenhuma das expressões pedidas", "meshes");

  let chupeta: PrimitivaPronta | null = null;
  const malhaDaChupeta = malhaDoCorpo(corpo, "chupeta")?.primitivas[0];
  if (malhaDaChupeta && (!plano.recem || personagem.recem?.chupeta !== false)) {
    const parte = parteDoCorpo(
      malhaDaChupeta,
      "chupeta",
      { tipo: "paleta", imagem: paleta, fator: BRANCO },
      false,
    );
    chupeta = emendar([parte], {
      formas: [],
      normaisDasFormas: false,
      dobrado: false,
      cores: new Map([[parte, pintar(parte)]]),
      textura: null,
    });
  }

  let corMaxima = 0;
  for (const primitiva of [
    ...primitivas,
    ...rostos.map((r) => r.primitiva),
    ...(chupeta ? [chupeta] : []),
  ]) {
    if (primitiva.cores) for (const c of primitiva.cores) corMaxima = Math.max(corMaxima, c);
  }

  return {
    plano,
    corpo,
    primitivas,
    rostos,
    chupeta,
    gravidez,
    dobrado,
    cobertura,
    camadas,
    indicesDaPele,
    pecasMontadas,
    relatorio: {
      pele: {
        triangulos: pelePrimitiva.indices.length / 3,
        escondidos: (pelePrimitiva.indices.length - indicesDaPele.length) / 3,
        erro: erroDaPele,
      },
      pecas: relatorioDasPecas,
      corMaxima,
    },
  };
}

/** A textura assada no maior tamanho que cabe no limite de bytes (estampas de traço fino pesam pouco). */
function texturaQueCabe(
  fonte: Extract<FonteDeCor, { tipo: "roupa" }>,
  opcoes: OpcoesDeMontagemDoPersonagem,
): Imagem {
  let lado = opcoes.ladoDaTextura;
  let imagem = assarTextura(fonte, lado);
  while (lado > 64 && escreverPng(imagem).length > opcoes.bytesDaTextura) {
    lado = Math.floor(lado / 2);
    imagem = assarTextura(fonte, lado);
  }
  return imagem;
}

function parteDeCabelo(montada: PecaMontada, fonte: FonteDeCor): Parte {
  return {
    nome: montada.id,
    posicoes: montada.posicoes,
    normais: montada.normais,
    uv: montada.uv,
    coresDoArquivo: null,
    pesos: montada.pesos,
    pesosDobrado: null,
    indices: montada.indices,
    formas: new Map(),
    fonte,
  };
}

/** O osso em que cada mão segura um objeto, pelo nome do esqueleto da biblioteca. */
export function ossosDeMao(corpo: Corpo): { esq: string; dir: string } {
  indiceDoOsso(corpo, "LeftHandProp");
  indiceDoOsso(corpo, "RightHandProp");
  return { esq: "LeftHandProp", dir: "RightHandProp" };
}
