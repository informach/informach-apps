import { describe, expect, it } from "vitest";
import type { EstadoDoMundo, Fato, Fotografia, Mundo } from "../src/index";
import {
  listar,
  PERMISSOES_DE_QUEM_DIVIDE,
  reduzirFato,
  restaurar,
  ticksPorDia,
} from "../src/index";
import {
  BRUNO,
  bairroComCasal,
  criarMundoDaProva,
  criarRoteiro,
  LIA,
  moradorDeNome,
} from "../src/testes";

/** O que é crítico: o que só muda por fato e precisa voltar exatamente. */
function critico(estado: Readonly<EstadoDoMundo>) {
  return {
    familias: listar(estado.familias).map((f) => ({ id: f.id, fundo: f.fundo, loteId: f.loteId })),
    moradores: listar(estado.moradores).map((m) => ({
      id: m.id,
      familiaId: m.familiaId,
      fase: m.fase,
      corpo: m.aparencia.corpo,
      preferidoDe: m.preferidoDe ?? null,
      origem: m.origem,
    })),
    // Só os vínculos que carregam casal ou parentesco: a amizade do dia a dia
    // é deriva, e volta como estava na fotografia.
    casais: listar(estado.relacoes)
      .filter((r) => r.casal !== "nenhum" || r.parentesco !== null)
      .map((r) => ({ id: r.id, casal: r.casal, parentesco: r.parentesco }))
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
    gravidezes: listar(estado.gravidezes),
    pedidos: listar(estado.pedidos),
    acessos: estado.acessos,
    memorias: estado.memorias,
  };
}

type Ponto = { foto: Fotografia; fatos: number };

/**
 * Uma história com fatos de vários tipos: acesso concedido, preferido,
 * gravidez, nascimento e duas mudanças de fase. Tira uma fotografia a cada
 * tanto, lembrando quantos fatos o diário tinha naquele instante.
 */
function historia() {
  const mundo = criarMundoDaProva({ definicao: bairroComCasal(), conferirReplicacao: false });
  const roteiro = criarRoteiro(mundo, { conferirACada: 200 });
  const pontos: Ponto[] = [];
  const fotografar = () =>
    pontos.push({
      // A fotografia viaja como texto, como no armazenamento.
      foto: JSON.parse(JSON.stringify(mundo.fotografar())) as Fotografia,
      fatos: roteiro.saida.fatos.length,
    });

  fotografar();
  const sessao = roteiro.entrar(LIA);
  const familia = listar(mundo.estado.familias)[0];
  if (!familia) throw new Error("sem família");
  mundo.aplicar({
    t: "conceder_acesso",
    perfilId: BRUNO,
    familiaId: familia.id,
    permissoes: [...PERMISSOES_DE_QUEM_DIVIDE],
  });
  const marcos = moradorDeNome(mundo, "Marcos");
  const duda = moradorDeNome(mundo, "Duda");
  roteiro.comandar(sessao, marcos.id, { t: "reservar" });
  roteiro.comandar(sessao, marcos.id, { t: "definir_preferido", valor: true });
  fotografar();
  expect(
    roteiro.comandar(sessao, marcos.id, { t: "propor", tipo: "bebe", alvoId: duda.id }),
  ).toMatchObject({
    ok: true,
  });
  roteiro.ate(() => listar(mundo.estado.gravidezes).length === 1, 2000, "a gravidez começar");
  fotografar();

  const dia = ticksPorDia(mundo.estado.relogio);
  const gravidez = listar(mundo.estado.gravidezes)[0];
  if (!gravidez) throw new Error("sem gravidez");
  // Uma fotografia pouco antes do parto e outras ao longo da vida do bebê.
  roteiro.ate(() => familia.vidaMs >= gravidez.previstaVidaMs - 60_000, dia + 100, "chegar a hora");
  fotografar();
  roteiro.ate(() => gravidez.estado === "concluida", 200, "nascer");
  fotografar();
  for (let i = 0; i < 5; i++) {
    roteiro.andar(Math.floor(dia / 2));
    fotografar();
  }
  return { mundo, roteiro, pontos, gravidez };
}

// A história é longa: roda uma vez e serve aos dois grupos de testes.
const HISTORIA = historia();

describe("recuperação pelo diário", () => {
  const { mundo, roteiro, pontos, gravidez } = HISTORIA;
  const fatos = roteiro.saida.fatos;

  it("a história tem fatos de todos os tipos que importam", () => {
    const tipos = new Set(fatos.map((fato) => fato.dados.tipo));
    for (const tipo of [
      "AcessoConcedido",
      "PreferidoDefinido",
      "GravidezIniciada",
      "NascimentoRegistrado",
      "FaseMudou",
    ]) {
      expect(tipos, tipo).toContain(tipo);
    }
    expect(new Set(fatos.map((fato) => fato.id)).size).toBe(fatos.length);
  });

  it("de qualquer fotografia, os fatos seguintes levam ao mesmo estado crítico", () => {
    const esperado = critico(mundo.estado);
    expect(pontos.length).toBeGreaterThanOrEqual(8);
    for (const ponto of pontos) {
      const voltou = restaurar(ponto.foto, fatos.slice(ponto.fatos));
      expect(critico(voltou.estado), `fotografia do tick ${ponto.foto.tick}`).toEqual(esperado);
    }
  });

  it("o relógio volta no último instante conhecido e nunca anda para trás", () => {
    for (const ponto of pontos) {
      const depois = fatos.slice(ponto.fatos);
      const voltou = restaurar(ponto.foto, depois);
      const ultimo = Math.max(ponto.foto.tick, ...depois.map((fato) => fato.tick));
      expect(voltou.estado.relogio.tick).toBe(ultimo);
    }
  });

  it("aplicar um fato de novo não muda nada", () => {
    const ponto = pontos[0] as Ponto;
    const umaVez = restaurar(ponto.foto, fatos);
    const duasVezes = restaurar(ponto.foto, [...fatos, ...fatos]);
    expect(critico(duasVezes.estado)).toEqual(critico(umaVez.estado));

    const estado = structuredClone(mundo.estado) as EstadoDoMundo;
    const antes = critico(estado);
    for (const fato of fatos) reduzirFato(estado, fato);
    expect(critico(estado)).toEqual(antes);
  });

  it("um id gerado depois da volta nunca repete um que veio do diário", () => {
    const voltou = restaurar((pontos[0] as Ponto).foto, fatos);
    const ids = new Set(listar(voltou.estado.moradores).map((m) => m.id));
    expect(ids).toContain(gravidez.bebeId);
    const contador = voltou.estado.contadores.mor ?? 0;
    expect(contador).toBeGreaterThanOrEqual(Number(gravidez.bebeId.split("_")[1]));
  });
});

describe("o parto acontece uma vez só", () => {
  const { roteiro, pontos, gravidez } = HISTORIA;
  const fatos = roteiro.saida.fatos;
  const indiceDoParto = fatos.findIndex((fato) => fato.id === `nasc:${gravidez.id}`);
  // A fotografia tirada pouco antes do parto.
  const antesDoParto = pontos.filter((ponto) => ponto.fatos <= indiceDoParto).at(-1) as Ponto;

  const bebes = (mundo: Mundo) =>
    listar(mundo.estado.moradores).filter((m) => m.origem.gravidezId === gravidez.id);

  /** Volta o mundo, alguém da família entra e o tempo segue. */
  function seguir(voltou: Mundo, ticks: number): Fato[] {
    const saida: Fato[] = [];
    voltou.aplicar({ t: "sessao_entrou", sessaoId: "depois-da-queda", perfilId: LIA });
    for (let i = 0; i < ticks; i++) saida.push(...voltou.avancar(100).fatos);
    return saida;
  }

  it("existe uma fotografia de antes do parto para a prova", () => {
    expect(indiceDoParto).toBeGreaterThan(0);
    expect(antesDoParto.fatos).toBeLessThanOrEqual(indiceDoParto);
    expect(bebes(restaurar(antesDoParto.foto))).toHaveLength(0);
  });

  it("queda antes de o fato chegar ao diário: o bebê nasce depois, uma vez, com o mesmo id", () => {
    const voltou = restaurar(antesDoParto.foto, fatos.slice(antesDoParto.fatos, indiceDoParto));
    expect(bebes(voltou)).toHaveLength(0);
    const novos = seguir(voltou, 400);
    const partos = novos.filter((fato) => fato.dados.tipo === "NascimentoRegistrado");
    expect(partos.map((fato) => fato.id)).toEqual([`nasc:${gravidez.id}`]);
    expect(bebes(voltou).map((m) => m.id)).toEqual([gravidez.bebeId]);
  });

  it("queda depois de o fato chegar ao diário: o bebê já existe e não nasce de novo", () => {
    const voltou = restaurar(antesDoParto.foto, fatos.slice(antesDoParto.fatos, indiceDoParto + 1));
    expect(bebes(voltou).map((m) => m.id)).toEqual([gravidez.bebeId]);
    const novos = seguir(voltou, 400);
    expect(novos.filter((fato) => fato.dados.tipo === "NascimentoRegistrado")).toEqual([]);
    expect(bebes(voltou)).toHaveLength(1);
    expect(listar(voltou.estado.gravidezes)[0]?.estado).toBe("concluida");
  });

  it("o mesmo fato de nascimento duas vezes no diário ainda dá um bebê", () => {
    const parto = fatos[indiceDoParto] as Fato;
    const voltou = restaurar(antesDoParto.foto, [
      ...fatos.slice(antesDoParto.fatos, indiceDoParto + 1),
      parto,
    ]);
    expect(bebes(voltou)).toHaveLength(1);
  });

  it("sem ninguém da família presente depois da queda, o parto espera", () => {
    const voltou = restaurar(antesDoParto.foto, fatos.slice(antesDoParto.fatos, indiceDoParto));
    for (let i = 0; i < 400; i++) voltou.avancar(100);
    expect(bebes(voltou)).toHaveLength(0);
    seguir(voltou, 20);
    expect(bebes(voltou)).toHaveLength(1);
  });
});
