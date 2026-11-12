import { inteiroParaHex } from "../cor/cores";
import { type Personagem, type PersonagemDeEntrada, PersonagemSchema } from "./esquema";

/**
 * O elenco da prova: os quatro moradores da família Ipê e os dois vizinhos do
 * bairro da prova (`packages/morada-sim/src/conteudo/mundos/bairro-prova.v1.json`),
 * mais o bebê de colo que a família pode ter e o recém-nascido.
 *
 * A simulação descreve a aparência com nomes dela (`coque_alto`,
 * `casual_vestido`) e um tom de pele; aqui cada nome vira corpo, penteado e
 * peças do catálogo da biblioteca. A cor do cabelo não existe na simulação e
 * é escolhida aqui.
 */

type MoradorDaProva = {
  ref: string;
  nome: string;
  /** Corpo da fase e da linha, como `corpoDaFase` da simulação devolve. */
  corpo: string;
  pele: number;
  cabelo: string;
  roupa: string;
};

/** Cópia do que o bairro da prova declara: é por estes campos que o cliente acha o pacote. */
const MORADORES: readonly MoradorDaProva[] = [
  {
    ref: "lia",
    nome: "Lia",
    corpo: "adulta",
    pele: 13008984,
    cabelo: "coque_alto",
    roupa: "casual_vestido",
  },
  {
    ref: "marcos",
    nome: "Marcos",
    corpo: "adulto",
    pele: 9136452,
    cabelo: "curto_lateral",
    roupa: "casual_camiseta",
  },
  {
    ref: "nina",
    nome: "Nina",
    corpo: "crianca_f",
    pele: 11897418,
    cabelo: "trancas",
    roupa: "infantil_macacao",
  },
  {
    ref: "vo_ana",
    nome: "Vó Ana",
    corpo: "idosa",
    pele: 14725500,
    cabelo: "coque_baixo",
    roupa: "casual_cardiga",
  },
  {
    ref: "duda",
    nome: "Duda",
    corpo: "adulta",
    pele: 8018223,
    cabelo: "black_power",
    roupa: "casual_jaqueta",
  },
  {
    ref: "caio",
    nome: "Caio",
    corpo: "adulto",
    pele: 12161662,
    cabelo: "rabo_de_cavalo",
    roupa: "casual_camisa",
  },
  // O bebê que nasce na família: a simulação dá a pele e o cabelo de um dos pais e a roupa `bebe_body`.
  {
    ref: "bebe",
    nome: "Bebê",
    corpo: "bebe_f",
    pele: 13008984,
    cabelo: "coque_alto",
    roupa: "bebe_body",
  },
];

/** Penteado e cor para cada nome de cabelo da simulação. */
const CABELOS: Readonly<Record<string, PersonagemDeEntrada["cabelo"]>> = {
  coque_alto: { penteado: "coque", cor: "Castanho" },
  curto_lateral: { penteado: "cabelo_seguranca", cor: "Preto" },
  trancas: { penteado: "trancas", cor: "Castanho" },
  coque_baixo: { penteado: "coque_franja", cor: "Grisalho" },
  black_power: { penteado: "afro", cor: "Preto" },
  rabo_de_cavalo: { penteado: "rabo_cavalo", cor: "Castanho claro", barba: "barba_rente" },
};

/** Peças para cada nome de roupa da simulação. */
const ROUPAS: Readonly<Record<string, PersonagemDeEntrada["roupa"]>> = {
  casual_vestido: {
    inteira: { id: "gen_vestido_casual", cor: "#3FC1B0" },
    pes: { id: "roupa_tenis_009", cor: null },
  },
  casual_camiseta: {
    cima: { id: "roupa_camiseta_criativa", cor: "#E27B3B" },
    baixo: { id: "nov_calca_jeans", cor: "#3D5A8A" },
    pes: { id: "roupa_tenis_plus", cor: null },
  },
  infantil_macacao: {
    inteira: { id: "nov_jardineira", cor: "#D9433B" },
    cima: { id: "nov_manga_longa", cor: "#F2C231" },
    pes: { id: "roupa_tenis_009", cor: "#F2F2F2" },
  },
  casual_cardiga: {
    cima: { id: "nov_gola_alta", cor: "#F2F2F2" },
    sobre: { id: "nov_cardiga", cor: "#8E55D6" },
    baixo: { id: "nov_calca_social", cor: "#6B4A32" },
    oculos: { id: "nov_oculos_redondos", cor: "#C9A46E" },
    pes: { id: "roupa_sapato_caixa", cor: "#5A3A2A" },
  },
  casual_jaqueta: {
    cima: { id: "nov_camiseta_justa", cor: "#F2C231" },
    sobre: { id: "nov_jaqueta_aberta", cor: "#24346B" },
    baixo: { id: "nov_legging", cor: "#2B2B2B" },
    pes: { id: "nov_bota_alta", cor: "#6E482E" },
  },
  casual_camisa: {
    cima: { id: "nov_camisa_xadrez_folgada", cor: "#3D7BD6" },
    baixo: { id: "nov_calca_social", cor: "#2B2B2B" },
    pes: { id: "roupa_sapato_seguranca", cor: null },
  },
  bebe_body: {
    inteira: { id: "nov_macacao", cor: "#BFE3B4" },
  },
};

function personagemDe(morador: MoradorDaProva): Personagem {
  const bebe = morador.corpo.startsWith("bebe_");
  const cabelo = bebe ? { penteado: "cabelo", cor: "Castanho" } : CABELOS[morador.cabelo];
  const roupa = ROUPAS[morador.roupa];
  if (!cabelo || !roupa) {
    throw new Error(`elenco da prova: sem cabelo ou roupa definidos para ${morador.ref}`);
  }
  return PersonagemSchema.parse({
    id: morador.ref,
    nome: morador.nome,
    corpo: morador.corpo,
    pele: inteiroParaHex(morador.pele),
    cabelo,
    roupa,
    sim: { corpo: morador.corpo, pele: morador.pele, cabelo: morador.cabelo, roupa: morador.roupa },
  } satisfies PersonagemDeEntrada);
}

/** O recém-nascido não existe como corpo na simulação (a fase `colo` usa o bebê de colo). */
const RECEM: PersonagemDeEntrada = {
  id: "recem",
  nome: "Recém-nascido",
  corpo: "recem_f",
  pele: inteiroParaHex(13008984),
  cabelo: { penteado: "cabelo", cor: "Castanho" },
  recem: { cabelo: "baixinho", manta: "Creme", chupeta: true },
};

export const ELENCO_DA_PROVA: readonly Personagem[] = [
  ...MORADORES.map(personagemDe),
  PersonagemSchema.parse(RECEM),
];
