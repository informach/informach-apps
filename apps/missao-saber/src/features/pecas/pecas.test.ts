import { describe, expect, it } from "vitest";
import { desafios, faixaDoAno } from "./catalogo";
import {
  area,
  celulasNaPose,
  espelharPlano,
  girarPlano,
  giros3,
  orientacaoPlana,
  partesNaPose,
  pecasSeSobrepoem,
} from "./geometria";
import { montagemInicial, solucaoComoMontagem } from "./montagem";
import { faixas, type Montagem } from "./tipos";
import { verificar } from "./verificar";

/** Valor presente, ou o teste falha dizendo o que faltou. */
function deve<T>(valor: T | undefined | null, oQue: string): T {
  if (valor === undefined || valor === null) throw new Error(`Faltou ${oQue}`);
  return valor;
}

describe("catálogo de desafios de peças", () => {
  it("tem ids únicos e peças com ids únicos", () => {
    expect(new Set(desafios.map((d) => d.id)).size).toBe(desafios.length);
    for (const d of desafios) expect(new Set(d.pecas.map((p) => p.id)).size).toBe(d.pecas.length);
  });

  it("oferece pelo menos três desafios por faixa, para o sorteio de até três por criança", () => {
    for (const faixa of faixas)
      expect(desafios.filter((d) => d.faixa === faixa).length).toBeGreaterThanOrEqual(3);
  });

  it("deixa ao menos um desafio aberto sem assinatura", () => {
    expect(desafios.some((d) => d.gratuito)).toBe(true);
  });

  it.each(desafios.map((d) => [d.id, d] as const))(
    "%s: a solução de referência fecha",
    (_, desafio) => {
      const solucao = solucaoComoMontagem(desafio);
      expect(verificar(desafio, solucao)).toEqual({
        montado: true,
        encaixadas: desafio.pecas.length,
      });
    },
  );

  it.each(desafios.map((d) => [d.id, d] as const))(
    "%s: a montagem inicial não está pronta",
    (_, desafio) => {
      const inicial = montagemInicial(desafio, 7);
      expect(Object.keys(inicial.poses).sort()).toEqual(desafio.pecas.map((p) => p.id).sort());
      expect(verificar(desafio, inicial).montado).toBe(false);
    },
  );

  it("a área das peças é a área do alvo nos desafios de cobrir", () => {
    for (const d of desafios) {
      if (d.tipo !== "livre-plano" || d.modo !== "cobrir") continue;
      const pecas = d.pecas.reduce(
        (s, p) => s + p.partes.reduce((t, parte) => t + area(parte), 0),
        0,
      );
      const alvo = d.alvo.reduce((s, parte) => s + area(parte), 0);
      expect(pecas).toBeCloseTo(alvo, 6);
    }
  });

  it("nas peças planas livres, a montagem inicial não começa com peças sobrepostas", () => {
    for (const d of desafios) {
      if (d.tipo !== "livre-plano") continue;
      const inicial = montagemInicial(d, 3);
      if (inicial.tipo !== "livre-plano") throw new Error("tipo");
      const formas = d.pecas.map((p) => partesNaPose(p, deve(inicial.poses[p.id], p.id)));
      for (let i = 0; i < formas.length; i += 1)
        for (let j = i + 1; j < formas.length; j += 1)
          expect(pecasSeSobrepoem(deve(formas[i], "forma"), deve(formas[j], "forma"))).toBe(false);
    }
  });
});

describe("verificação recusa montagens quase certas", () => {
  it.each(desafios.map((d) => [d.id, d] as const))("%s: uma peça deslocada", (_, desafio) => {
    const solucao = solucaoComoMontagem(desafio);
    const primeira = deve(desafio.pecas[0], "peça").id;
    let errada: Montagem;
    if (solucao.tipo === "malha") {
      const pose = deve(solucao.poses[primeira], primeira);
      errada = {
        tipo: "malha",
        poses: { ...solucao.poses, [primeira]: { ...pose, x: pose.x + 1 } },
      };
    } else if (solucao.tipo === "livre-plano") {
      const pose = deve(solucao.poses[primeira], primeira);
      errada = {
        tipo: "livre-plano",
        poses: { ...solucao.poses, [primeira]: { ...pose, x: pose.x + 0.3 } },
      };
    } else {
      const pose = deve(solucao.poses[primeira], primeira);
      errada = {
        tipo: "livre-espaco",
        poses: { ...solucao.poses, [primeira]: { ...pose, z: pose.z + 0.5 } },
      };
    }
    expect(verificar(desafio, errada).montado).toBe(false);
  });

  it("recusa uma peça faltando e o tipo de montagem trocado", () => {
    const desafio = deve(
      desafios.find((d) => d.id === "tangram"),
      "tangram",
    );
    const solucao = solucaoComoMontagem(desafio);
    if (solucao.tipo !== "livre-plano") throw new Error("tipo");
    const { quadrado: _, ...semQuadrado } = solucao.poses;
    expect(verificar(desafio, { tipo: "livre-plano", poses: semQuadrado }).montado).toBe(false);
    expect(verificar(desafio, { tipo: "malha", poses: {} }).montado).toBe(false);
  });

  it("recusa giro fora do passo e espelho onde a peça não vira", () => {
    const caixa = deve(
      desafios.find((d) => d.id === "quatro-ts-na-caixa"),
      "caixa",
    );
    const solucao = solucaoComoMontagem(caixa);
    if (solucao.tipo !== "livre-plano") throw new Error("tipo");
    const pose = deve(solucao.poses["t-1"], "t-1");
    expect(
      verificar(caixa, {
        tipo: "livre-plano",
        poses: { ...solucao.poses, "t-1": { ...pose, angulo: 19 } },
      }).montado,
    ).toBe(false);
    expect(
      verificar(caixa, {
        tipo: "livre-plano",
        poses: { ...solucao.poses, "t-1": { ...pose, espelho: true } },
      }).montado,
    ).toBe(false);
  });
});

describe("4 Ts na caixa", () => {
  /**
   * Alinhados aos lados, os Ts empurrados para um canto têm arestas em
   * coordenadas inteiras; então basta procurar na malha de lado 5 (o maior
   * inteiro que cabe em 5,8) para saber que nenhum arranjo reto cabe.
   */
  it("não cabem alinhados aos lados da caixa", () => {
    const desafio = deve(
      desafios.find((d) => d.id === "quatro-ts-na-caixa"),
      "caixa",
    );
    if (desafio.tipo !== "livre-plano") throw new Error("tipo");
    const lado = Math.floor(deve(desafio.alvo[0]?.[2], "canto da caixa")[0]);
    type Casa = [number, number];
    const t: Casa[] = [
      [0, 3],
      [1, 3],
      [2, 3],
      [1, 0],
      [1, 1],
      [1, 2],
    ];
    const formas = [0, 1, 2, 3].map((k) => {
      let cs = t;
      for (let i = 0; i < k; i += 1) cs = cs.map(([x, y]): Casa => [-y, x]);
      const mx = Math.min(...cs.map(([x]) => x));
      const my = Math.min(...cs.map(([, y]) => y));
      return cs.map(([x, y]): Casa => [x - mx, y - my]);
    });
    const ocupado = new Set<string>();
    const cabe = (forma: Casa[], dx: number, dy: number) =>
      forma.every(
        ([x, y]) => x + dx < lado && y + dy < lado && !ocupado.has(`${x + dx},${y + dy}`),
      );
    const procurar = (n: number, inicio: number): boolean => {
      if (n === 4) return true;
      for (let pos = inicio; pos < lado * lado; pos += 1)
        for (const forma of formas) {
          const dx = pos % lado;
          const dy = Math.floor(pos / lado);
          if (!cabe(forma, dx, dy)) continue;
          for (const [x, y] of forma) ocupado.add(`${x + dx},${y + dy}`);
          if (procurar(n + 1, pos + 1)) return true;
          for (const [x, y] of forma) ocupado.delete(`${x + dx},${y + dy}`);
        }
      return false;
    };
    expect(lado).toBe(5);
    expect(procurar(0, 0)).toBe(false);
  });
});

describe("orientações", () => {
  it("o cubo tem 24 giros distintos, todos de determinante 1", () => {
    expect(new Set(giros3.map((m) => JSON.stringify(m))).size).toBe(24);
    for (const m of giros3) {
      const [a, b, c] = m;
      const det =
        a[0] * (b[1] * c[2] - b[2] * c[1]) -
        a[1] * (b[0] * c[2] - b[2] * c[0]) +
        a[2] * (b[0] * c[1] - b[1] * c[0]);
      expect(det).toBe(1);
    }
  });

  it("girar e virar no plano batem com as matrizes", () => {
    const peca = {
      id: "L",
      nome: "L",
      cor: "#000",
      celulas: [
        [0, 0, 0],
        [0, 1, 0],
        [0, 2, 0],
        [1, 2, 0],
      ] as const,
    };
    const pose = (o: number) =>
      celulasNaPose(peca, { x: 0, y: 0, z: 0, o }, true).map(String).sort();
    for (let o = 0; o < 8; o += 1) {
      const girada = celulasNaPose(peca, { x: 0, y: 0, z: 0, o }, true).map(([x, y]) => [-y, x, 0]);
      expect(pose(girarPlano(o))).toEqual(girada.map(String).sort());
      const virada = celulasNaPose(peca, { x: 0, y: 0, z: 0, o }, true).map(([x, y]) => [-x, y, 0]);
      expect(pose(espelharPlano(o))).toEqual(virada.map(String).sort());
    }
    expect(orientacaoPlana(0)).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
  });

  it("cada ano escolar cai numa faixa", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 12].map(faixaDoAno)).toEqual([
      "a",
      "a",
      "a",
      "b",
      "b",
      "c",
      "c",
      "d",
      "d",
    ]);
  });
});
