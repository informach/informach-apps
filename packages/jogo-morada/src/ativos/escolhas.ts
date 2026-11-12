import type {
  BibliotecaDoManifesto,
  ClipeDoManifesto,
  Manifesto,
  PersonagemDoManifesto,
} from "@informach/morada-arte/manifesto";
import type { PontoDaCena } from "../cena/espaco";
import type { DescricaoDoMorador, PoseDoMorador } from "./ativos";

/**
 * As escolhas dos ativos de arte, como contas puras sobre o manifesto: qual
 * pacote veste um morador, qual clipe toca em cada pose, quanto o corpo desce
 * para o clipe cair no assento ou no colchão. Sem three.js; os testes
 * conferem com manifestos de mentira.
 */

/** A partir daqui da gravidez (2º trimestre) vale a biblioteca de grávida, se houver. */
export const GRAVIDEZ_DA_BIBLIOTECA_DE_GRAVIDA = 1 / 3;

/**
 * O pacote que veste um morador, do mais parecido ao menos: a mesma aparência
 * da simulação (corpo, pele, cabelo e roupa), o mesmo corpo e a mesma roupa, o
 * mesmo corpo, a mesma faixa de idade e o mesmo sexo, a mesma faixa. `null`
 * quando nenhum pacote serve (a fase não tem corpo empacotado): o morador fica
 * procedural. Um pacote sem biblioteca de animação (o recém-nascido) serve:
 * ele fica na pose de descanso, deitado ou no colo.
 */
export function escolherPersonagem(
  manifesto: Manifesto,
  descricao: Pick<DescricaoDoMorador, "fase" | "aparencia">,
): PersonagemDoManifesto | null {
  const { fase, aparencia } = descricao;
  const pontos = (p: PersonagemDoManifesto): number => {
    if (p.faixa !== fase) return 0;
    const sim = p.sim;
    if (
      sim &&
      sim.corpo === aparencia.corpo &&
      sim.pele === aparencia.pele &&
      sim.cabelo === aparencia.cabelo &&
      sim.roupa === aparencia.roupa
    ) {
      return 5;
    }
    if (p.corpo === aparencia.corpo && sim?.roupa === aparencia.roupa) return 4;
    if (p.corpo === aparencia.corpo) return 3;
    if (p.sexo === aparencia.linha) return 2;
    return 1;
  };
  let melhor: PersonagemDoManifesto | null = null;
  let maiores = 0;
  for (const personagem of manifesto.personagens) {
    const p = pontos(personagem);
    if (p > maiores) {
      melhor = personagem;
      maiores = p;
    }
  }
  return melhor;
}

/** As bibliotecas de um personagem, na ordem em que um clipe é procurado para a gravidez dada. */
export function bibliotecasDaPose(personagem: PersonagemDoManifesto, gravidez: number): string[] {
  const base = personagem.biblioteca;
  const gravida = personagem.bibliotecaDeGravida;
  const ordem: string[] = [];
  if (gravida && gravidez > GRAVIDEZ_DA_BIBLIOTECA_DE_GRAVIDA) ordem.push(gravida);
  if (base) ordem.push(base);
  return ordem;
}

export type PoseParaClipe = Pick<
  PoseDoMorador,
  "postura" | "andando" | "agindo" | "animacao" | "carregando"
>;

/** As interações de cuidar de um bebê: as únicas que quem carrega toca no lugar do clipe de segurar. */
const CUIDADO = /^resident\.care\./;

/**
 * O nome do clipe que uma biblioteca toca nesta pose, ou `null` para a pose de
 * descanso. A interação em curso vem antes da postura; uma interação sem clipe
 * na biblioteca cai na postura.
 *
 * Quem carrega um bebê fica no clipe de segurar, andando ou não: o bebê segue
 * as mãos de quem carrega, e com os braços balançando ele balançaria junto.
 * Só um gesto de cuidado (embalar, dar de comer) toma o lugar.
 *
 * O bebê no colo fica na pose de descanso: quem o deita entre as mãos é o visual.
 */
export function clipeNaBiblioteca(
  biblioteca: BibliotecaDoManifesto,
  pose: PoseParaClipe,
): string | null {
  const postura = (nome: string): string | null => biblioteca.posturas[nome] ?? null;
  const interacao =
    pose.agindo && pose.animacao ? (biblioteca.interacoes[pose.animacao]?.clipe ?? null) : null;
  if (pose.postura === "no_colo") return null;
  if (pose.carregando) {
    if (interacao && pose.animacao && CUIDADO.test(pose.animacao)) return interacao;
    return postura("carregando");
  }
  if (pose.andando) return postura("andando");
  if (interacao) return interacao;
  if (pose.postura === "sentado") return postura("sentado");
  if (pose.postura === "deitado") return postura("deitado");
  return postura("parado");
}

/**
 * O clipe desta pose, procurado nas bibliotecas na ordem dada: a de grávida
 * não tem o clipe de segurar o bebê, e a de adulto tem (o esqueleto é o mesmo).
 * `null` quando nenhuma tem: fica a pose de descanso.
 */
export function escolherClipe(
  bibliotecas: readonly BibliotecaDoManifesto[],
  pose: PoseParaClipe,
): { biblioteca: BibliotecaDoManifesto; clipe: ClipeDoManifesto } | null {
  for (const biblioteca of bibliotecas) {
    const nome = clipeNaBiblioteca(biblioteca, pose);
    const clipe = nome ? biblioteca.clipes.find((c) => c.nome === nome) : undefined;
    if (clipe) return { biblioteca, clipe };
  }
  return null;
}

function numero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

/**
 * Quanto deslocar o corpo para o clipe cair no apoio da cena, no referencial
 * da raiz (metros, Y para cima). A cena põe a raiz em cima do assento ou do
 * colchão; o clipe foi feito com o chão na origem e o apoio na altura e no
 * ponto que `apoio` diz (coordenadas do Blender: x, y no chão, altura em z).
 * O corpo desce essa altura e anda o contrário do ponto, para o apoio do clipe
 * coincidir com a raiz.
 *
 * Só desce quem está sentado ou deitado: de pé, a raiz já está no chão.
 */
export function ajusteDoApoio(
  clipe: ClipeDoManifesto | null,
  postura: PoseDoMorador["postura"],
): PontoDaCena {
  const apoio = clipe?.apoio;
  if (!apoio || (postura !== "sentado" && postura !== "deitado")) return [0, 0, 0];
  const tipo = apoio.tipo;
  if (tipo === "assento" || tipo === "cama") {
    const altura = numero(apoio.altura) ?? 0;
    const x = numero(apoio.x) ?? 0;
    const y = numero(apoio.y) ?? 0;
    // Blender (x, y, z) → cena (x, z, −y): o apoio está em (x, altura, −y).
    return [-x, -altura, y];
  }
  // Um móvel inteiro (o sofá da TV, o vaso): o clipe só diz a altura do assento.
  const assento = numero(apoio.assento);
  if (tipo === "movel" && assento !== null && postura === "sentado") return [0, -assento, 0];
  return [0, 0, 0];
}

/** A expressão de quem dorme; as outras poses usam a primeira do pacote (o rosto neutro). */
export function expressaoDaPose(
  personagem: PersonagemDoManifesto,
  pose: Pick<PoseDoMorador, "postura" | "agindo" | "animacao">,
): string {
  const neutra = personagem.expressoes[0]?.nome ?? "neutro";
  const dormindo = pose.agindo && pose.animacao !== null && /(^|\.)sleep(\.|$)/.test(pose.animacao);
  if (dormindo && personagem.expressoes.some((e) => e.nome === "dormindo")) return "dormindo";
  return neutra;
}

/**
 * Os pesos das formas de gravidez para quanto dela passou (0 a 1): cada
 * estágio é uma forma inteira, e uma cede lugar à seguinte.
 */
export function pesosDaGravidez(formas: readonly string[], gravidez: number): number[] {
  const s = Math.min(Math.max(gravidez, 0), 1) * formas.length;
  return formas.map((_, k) => Math.max(0, 1 - Math.abs(s - (k + 1))));
}

/** Os arquivos que um personagem precisa para aparecer: o dele e o da biblioteca de animação. */
export function arquivosDoPersonagem(
  manifesto: Manifesto,
  personagem: PersonagemDoManifesto,
): string[] {
  const biblioteca = manifesto.bibliotecas.find((b) => b.id === personagem.biblioteca);
  return biblioteca ? [personagem.arquivo, biblioteca.arquivo] : [personagem.arquivo];
}
