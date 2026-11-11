import { corpoDaFase } from "../conteudo";
import { necessidadesIniciais } from "../dominio/estado";
import type { FamiliaId, MoradorId } from "../dominio/ids";
import { relacaoId } from "../dominio/ids";
import { listar, obter } from "../dominio/tabela";
import {
  type EstadoDoMundo,
  FASES,
  type Familia,
  type Fase,
  type Gravidez,
  type Morador,
  type Presenca,
  type Relacao,
} from "../dominio/tipos";
import { ondeEsta } from "../espaco/posicoes";
import { sorteioAte } from "../nucleo/sorteio";
import { apresentar, type Contexto, emitir, novaMemoria, tocar } from "./contexto";
import { darSensacao, MS_POR_DIA } from "./efeitos";

/**
 * O relógio de vida. Idade e gravidez não andam pelo relógio do mundo: andam
 * pelo relógio de cada família, e ele só anda quando a política de avanço
 * deixa. É um mecanismo só para as três políticas:
 *
 * - vida em suspenso: a família de quem está fora não envelhece nem tem bebê;
 * - avanço limitado: anda até um teto de dias de jogo por dia real;
 * - bairro em sincronia: anda sempre.
 *
 * O que é irreversível (nascer, mudar de fase) só acontece com alguém da
 * família presente, a não ser em sincronia.
 */

const NOMES_F = ["Bia", "Lara", "Maya", "Luna", "Íris", "Cora", "Alice", "Helena"];
const NOMES_M = ["Téo", "Gael", "Davi", "Noah", "Ravi", "Tom", "Caio", "Benício"];

/** Fator do envelhecimento, em metades: 2 é o ritmo normal. */
const RITMO: Record<EstadoDoMundo["regras"]["envelhecimento"], number> = {
  desligado: 0,
  lento: 1,
  normal: 2,
  rapido: 4,
};

/** Há alguém conectado, ou voltando, com acesso à família. */
export function familiaPresente(
  estado: EstadoDoMundo,
  presenca: Presenca,
  familiaId: FamiliaId,
): boolean {
  return presenca.sessoes.some((sessao) =>
    estado.acessos.some(
      (acesso) => acesso.familiaId === familiaId && acesso.perfilId === sessao.perfilId,
    ),
  );
}

/** Quanto do relógio de vida esta família anda neste tick. */
function avancoDeVida(ctx: Contexto, familia: Familia, presente: boolean): number {
  const { regras, relogio, avancoDoDia } = ctx.estado;
  if (presente || regras.politicaDeAvanco === "sincronia") return relogio.msDeJogoPorTick;
  if (regras.politicaDeAvanco === "suspenso") return 0;
  // Avanço limitado: um teto de dias de jogo por dia real, por família ausente.
  const teto = regras.diasDeJogoPorDiaReal * MS_POR_DIA;
  const gasto = avancoDoDia.gastoMs[familia.id] ?? 0;
  const avanco = Math.min(relogio.msDeJogoPorTick, Math.max(0, teto - gasto));
  if (avanco > 0) avancoDoDia.gastoMs[familia.id] = gasto + avanco;
  return avanco;
}

function proximaFase(fase: Fase): Fase | null {
  return FASES[FASES.indexOf(fase) + 1] ?? null;
}

function mudarDeFase(ctx: Contexto, morador: Morador, para: Fase): void {
  const loteId = ondeEsta(ctx.estado, morador, ctx.estado.relogio.tick)?.loteId ?? null;
  const de = morador.fase;
  emitir(ctx, `fase:${morador.id}:${para}`, morador.familiaId, {
    tipo: "FaseMudou",
    moradorId: morador.id,
    de,
    para,
    corpo: corpoDaFase(morador.aparencia.linha, para),
    memoriaId: novaMemoria(ctx),
  });
  apresentar(ctx, { t: "cresceu", loteId, moradorId: morador.id, fase: para });
}

function relacaoDeParentesco(
  genitorId: MoradorId,
  filhoId: MoradorId,
  parentesco: Relacao["parentesco"],
): Relacao {
  const [a, b] = genitorId < filhoId ? [genitorId, filhoId] : [filhoId, genitorId];
  return {
    id: relacaoId(genitorId, filhoId),
    a,
    b,
    versao: 1,
    eixos: { amizade: 500_000, romance: 0, confianca: 600_000 },
    casal: "nenhum",
    parentesco,
    marcos: [],
  };
}

/** O bebê como nasce: aparência herdada dos pais por uma semente reproduzível. */
function criarBebe(estado: EstadoDoMundo, gravidez: Gravidez, gestante: Morador): Morador {
  const semente = gravidez.sementeDoBebe;
  const outro = gravidez.outroGenitorId
    ? obter(estado.moradores, gravidez.outroGenitorId)
    : undefined;
  const linha = sorteioAte(2, semente, "linha", gravidez.id, 0) === 0 ? "f" : "m";
  const nomes = linha === "f" ? NOMES_F : NOMES_M;
  const dePele = outro && sorteioAte(2, semente, "pele", gravidez.id, 0) === 1 ? outro : gestante;
  const deCabelo =
    outro && sorteioAte(2, semente, "cabelo", gravidez.id, 0) === 1 ? outro : gestante;
  return {
    id: gravidez.bebeId,
    mundoId: estado.id,
    familiaId: gravidez.familiaId,
    versao: 1,
    nome: nomes[sorteioAte(nomes.length, semente, "nome", gravidez.id, 0)] as string,
    fase: "colo",
    idadeNaFaseMs: 0,
    origem: { gravidezId: gravidez.id },
    aparencia: {
      linha,
      corpo: corpoDaFase(linha, "colo"),
      pele: dePele.aparencia.pele,
      cabelo: deCabelo.aparencia.cabelo,
      roupa: "bebe_body",
      semente,
    },
    // Nasce no colo de quem gestou.
    local: { t: "colo", de: gestante.id },
    movimento: null,
    necessidades: necessidadesIniciais("colo", 750_000),
    sensacoes: [],
    tracos: [],
    habilidades: {},
    relacoes: [],
    fila: [],
    acaoAtual: null,
    carteira: 0,
  };
}

function nascer(ctx: Contexto, gravidez: Gravidez): void {
  const estado = ctx.estado;
  const gestante = obter(estado.moradores, gravidez.gestanteId);
  if (!gestante) return;
  const bebe = criarBebe(estado, gravidez, gestante);

  const relacoes: Relacao[] = [
    relacaoDeParentesco(gestante.id, bebe.id, { tipo: "genitor", de: gestante.id }),
  ];
  if (gravidez.outroGenitorId && obter(estado.moradores, gravidez.outroGenitorId)) {
    relacoes.push(
      relacaoDeParentesco(gravidez.outroGenitorId, bebe.id, {
        tipo: "genitor",
        de: gravidez.outroGenitorId,
      }),
    );
  }
  // Irmãos: os outros filhos de quem gestou.
  for (const relacao of listar(estado.relacoes)) {
    if (relacao.parentesco?.tipo !== "genitor" || relacao.parentesco.de !== gestante.id) continue;
    const irmao = relacao.a === gestante.id ? relacao.b : relacao.a;
    relacoes.push(relacaoDeParentesco(irmao, bebe.id, { tipo: "irmaos" }));
  }

  // O id do fato vem da gravidez: este nascimento só existe uma vez.
  emitir(ctx, `nasc:${gravidez.id}`, gravidez.familiaId, {
    tipo: "NascimentoRegistrado",
    gravidezId: gravidez.id,
    bebe,
    relacoes,
    memoriaId: novaMemoria(ctx),
  });
  const loteId = ondeEsta(estado, gestante, estado.relogio.tick)?.loteId ?? null;
  apresentar(ctx, { t: "nasceu", loteId, bebeId: bebe.id, gestanteId: gestante.id });
  darSensacao(ctx, gestante, "bebe_nasceu", 24 * 60);
  tocar(ctx, "moradores", gestante.id);
}

/** Um passo do relógio de vida: idade, fases e gravidez de cada família. */
export function passoDaVida(ctx: Contexto): void {
  const estado = ctx.estado;
  const ritmo = RITMO[estado.regras.envelhecimento];

  for (const familia of listar(estado.familias)) {
    const presente = familiaPresente(estado, ctx.presenca, familia.id);
    const avanco = avancoDeVida(ctx, familia, presente);
    if (avanco <= 0) continue;
    familia.vidaMs += avanco;
    const irreversivel = presente || estado.regras.politicaDeAvanco === "sincronia";

    for (const morador of listar(estado.moradores)) {
      if (morador.familiaId !== familia.id) continue;
      morador.idadeNaFaseMs += Math.floor((avanco * ritmo) / 2);
      const dias = estado.regras.diasPorFase[morador.fase];
      const proxima = proximaFase(morador.fase);
      if (
        irreversivel &&
        dias !== null &&
        proxima !== null &&
        morador.idadeNaFaseMs >= dias * MS_POR_DIA
      ) {
        mudarDeFase(ctx, morador, proxima);
      }
    }

    // O bebê só nasce com alguém da família presente, em qualquer política.
    if (!presente) continue;
    for (const gravidez of listar(estado.gravidezes)) {
      if (
        gravidez.familiaId === familia.id &&
        gravidez.estado === "em_curso" &&
        familia.vidaMs >= gravidez.previstaVidaMs
      ) {
        nascer(ctx, gravidez);
      }
    }
  }
}

/** Quanto da gravidez já passou, de 0 a 1_000_000, para o corpo de quem gesta. */
export function progressoDaGravidez(estado: EstadoDoMundo, gravidez: Gravidez): number {
  const familia = obter(estado.familias, gravidez.familiaId);
  const total = gravidez.previstaVidaMs - gravidez.inicioVidaMs;
  if (!familia || total <= 0) return 0;
  const passado = Math.min(total, Math.max(0, familia.vidaMs - gravidez.inicioVidaMs));
  return Math.floor((passado * 1_000_000) / total);
}
