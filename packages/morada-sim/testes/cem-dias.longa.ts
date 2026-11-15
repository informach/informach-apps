import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { gunzipSync, gzipSync } from "node:zlib";
import { expect, it } from "vitest";
import {
  type EstadoDoMundo,
  type Fato,
  listar,
  restaurar,
  ticksPorDia,
  verificarInvariantes,
} from "../src/index";
import { bairroComCasal, criarMundoDaProva, criarRoteiro, LIA, moradorDeNome } from "../src/testes";

/** A deriva não é registrada no diário; fatos recuperam os compromissos duráveis. */
function compromissos(estado: Readonly<EstadoDoMundo>) {
  return {
    familias: listar(estado.familias).map(({ id, fundo, loteId }) => ({ id, fundo, loteId })),
    moradores: listar(estado.moradores).map(({ id, familiaId, fase, origem, preferidoDe }) => ({
      id,
      familiaId,
      fase,
      origem,
      preferidoDe,
    })),
    casais: listar(estado.relacoes)
      .filter((relacao) => relacao.casal !== "nenhum" || relacao.parentesco !== null)
      .map(({ id, casal, parentesco }) => ({ id, casal, parentesco })),
    gravidezes: listar(estado.gravidezes),
    acessos: estado.acessos,
  };
}

it("vive cem dias com nascimento, envelhecimento e cem recuperações verificadas", () => {
  if (!globalThis.gc) throw new Error("A prova exige --expose-gc para medir heap após coleta");
  const inicio = performance.now();
  const mundo = criarMundoDaProva({ definicao: bairroComCasal(), conferirReplicacao: false });
  const roteiro = criarRoteiro(mundo, { conferirACada: 100 });
  const sessao = roteiro.entrar(LIA, "lia-longa");
  const marcos = moradorDeNome(mundo, "Marcos");
  const duda = moradorDeNome(mundo, "Duda");
  expect(roteiro.comandar(sessao, marcos.id, { t: "reservar" })).toMatchObject({ ok: true });
  expect(
    roteiro.comandar(sessao, marcos.id, { t: "propor", tipo: "bebe", alvoId: duda.id }),
  ).toMatchObject({ ok: true });
  roteiro.ate(() => listar(mundo.estado.gravidezes).length === 1, 2000, "começar a gravidez");
  expect(roteiro.comandar(sessao, marcos.id, { t: "liberar" })).toMatchObject({ ok: true });
  mundo.avancar(0);
  const gravidez = listar(mundo.estado.gravidezes)[0];
  if (!gravidez) throw new Error("A gravidez não começou");

  // O roteiro curto não acumula os milhões de mudanças da prova prolongada.
  roteiro.saida.fatos.length = 0;
  roteiro.saida.mudancas.length = 0;
  roteiro.saida.apresentacao.length = 0;
  const ticksDoDia = ticksPorDia(mundo.estado.relogio);
  const tickInicial = mundo.estado.relogio.tick;
  let fotografia = mundo.fotografar();
  const ids = new Set<string>();
  const fases = new Set<string>();
  let nascimentos = 0;
  const medidas: {
    dia: number;
    tick: number;
    fatos: number;
    fotografiaBytes: number;
    heapBytes: number;
  }[] = [];

  try {
    for (let dia = 1; dia <= 100; dia++) {
      const alvo = tickInicial + dia * ticksDoDia;
      const diario: Fato[] = [];
      const registrar = (fatos: readonly Fato[]) => {
        for (const fato of fatos) {
          expect(ids.has(fato.id), `fato repetido ${fato.id}`).toBe(false);
          ids.add(fato.id);
          if (fato.dados.tipo === "NascimentoRegistrado") nascimentos++;
        }
        diario.push(...fatos);
        expect(verificarInvariantes(mundo.estado, mundo.presenca)).toEqual([]);
      };
      while (mundo.estado.relogio.tick < alvo - 10) {
        // Colher em blocos limita a memória de alterações de apresentação.
        const passos = Math.min(1000, alvo - 10 - mundo.estado.relogio.tick);
        registrar(mundo.avancar(passos * 100).fatos);
      }
      const comprimida = gzipSync(JSON.stringify(mundo.fotografar()));
      const recuperado = restaurar(JSON.parse(gunzipSync(comprimida).toString("utf8")));
      expect(recuperado.hash(), `fotografia do dia ${dia}`).toBe(mundo.hash());
      recuperado.aplicar({ t: "sessao_entrou", sessaoId: sessao, perfilId: LIA });
      // Conferir também a continuação: caches e presença não vêm na fotografia.
      // A recuperação precisa continuar igual ao mundo que não foi interrompido.
      for (let passo = 0; passo < 10; passo++) {
        const saida = mundo.avancar(100);
        expect(recuperado.avancar(100).fatos).toEqual(saida.fatos);
        expect(recuperado.hash()).toBe(mundo.hash());
        registrar(saida.fatos);
      }
      const doDiario = restaurar(fotografia, diario);
      expect(compromissos(doDiario.estado), `diário do dia ${dia}`).toEqual(
        compromissos(mundo.estado),
      );
      fotografia = mundo.fotografar();
      const bebe = mundo.estado.moradores.porId[gravidez.bebeId];
      if (bebe) fases.add(bebe.fase);
      globalThis.gc();
      medidas.push({
        dia,
        tick: mundo.estado.relogio.tick,
        fatos: ids.size,
        fotografiaBytes: comprimida.length,
        heapBytes: process.memoryUsage().heapUsed,
      });
    }
    expect(mundo.estado.relogio.tick - tickInicial).toBe(100 * ticksDoDia);
    expect(nascimentos).toBe(1);
    expect(
      listar(mundo.estado.moradores).filter((m) => m.origem.gravidezId === gravidez.id),
    ).toHaveLength(1);
    for (const fase of ["pequeno", "crianca", "adolescente", "adulto", "idoso"])
      expect(fases).toContain(fase);
    // Orçamento da prova sintética, após aquecimento. Não é memória da aba nem capacidade do servidor.
    const aquecida = medidas[4];
    const ultima = medidas.at(-1);
    if (!aquecida || !ultima) throw new Error("Faltam medidas da prova");
    expect(ultima.heapBytes - aquecida.heapBytes).toBeLessThan(32 * 1024 * 1024);
  } finally {
    const relatorio = {
      dias: medidas.length,
      duracaoMs: Math.round(performance.now() - inicio),
      nascimentos,
      fases: [...fases],
      medidas,
    };
    if (process.env.MORADA_LONGA_RELATORIO)
      writeFileSync(process.env.MORADA_LONGA_RELATORIO, JSON.stringify(relatorio, null, 2));
    console.info(
      JSON.stringify({
        prova: "morada-cem-dias",
        ...relatorio,
        medidas: medidas.filter((m) => m.dia % 10 === 0),
      }),
    );
  }
});
