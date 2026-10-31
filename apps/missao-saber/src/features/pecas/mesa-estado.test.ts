import { describe, expect, it } from "vitest";
import { desafios, encontrarDesafio } from "./catalogo";
import { partesNaPose, pecasSeSobrepoem } from "./geometria";
import { type EstadoMesa, estadoInicial, mesa } from "./mesa-estado";
import { montagemInicial, solucaoComoMontagem } from "./montagem";
import { teclasAteASolucao } from "./plano";
import { type Desafio, ehMalha, type Montagem } from "./tipos";
import { verificar } from "./verificar";

function desafio(id: string): Desafio {
  const d = encontrarDesafio(id);
  if (!d) throw new Error(id);
  return d;
}
function poses<T extends Montagem["tipo"]>(estado: EstadoMesa, tipo: T) {
  if (estado.montagem.tipo !== tipo) throw new Error(tipo);
  return estado.montagem.poses as Extract<Montagem, { tipo: T }>["poses"];
}

describe("mesa", () => {
  it.each(desafios.filter(ehMalha).map((d) => [d.id, d] as const))(
    "%s: os controles levam da montagem inicial à solução",
    (_, d) => {
      if (!ehMalha(d)) throw new Error("tipo");
      const { final } = teclasAteASolucao(d, montagemInicial(d, 11));
      expect(verificar(d, final).montado).toBe(true);
    },
  );

  it("girar no plano mantém a peça no lugar e quatro giros voltam ao começo", () => {
    const d = desafio("katamino-5x3");
    const inicio = estadoInicial(montagemInicial(d, 1));
    let estado = mesa(d, inicio, { tipo: "selecionar", id: "P" });
    for (let i = 0; i < 4; i += 1) estado = mesa(d, estado, { tipo: "girar", sentido: 1 });
    expect(estado.montagem).toEqual(inicio.montagem);
    expect(estado.movimentos).toBe(4);
  });

  it("no espaço, a peça nunca atravessa a mesa", () => {
    const d = desafio("soma");
    let estado = mesa(d, estadoInicial(montagemInicial(d, 2)), { tipo: "selecionar", id: "A" });
    for (const eixo of ["x", "y", "x", "y"] as const) {
      estado = mesa(d, estado, { tipo: "girarEixo", eixo });
      estado = mesa(d, estado, { tipo: "mover", dx: 0, dy: 0, dz: -3 });
      expect(poses(estado, "malha").A?.z).toBeGreaterThanOrEqual(0);
    }
  });

  it("peças planas param no contato: uma não atravessa a outra", () => {
    const d = desafio("tangram");
    if (d.tipo !== "livre-plano") throw new Error("tipo");
    const solucao = solucaoComoMontagem(d);
    if (solucao.tipo !== "livre-plano") throw new Error("tipo");
    const quadradoNaSolucao = solucao.poses.quadrado;
    if (!quadradoNaSolucao) throw new Error("quadrado");
    // Tira o quadrado do lugar e tenta empurrá-lo por cima do triângulo grande.
    let estado = estadoInicial({
      tipo: "livre-plano",
      poses: { ...solucao.poses, quadrado: { ...quadradoNaSolucao, x: 8, y: 2 } },
    });
    estado = mesa(d, estado, { tipo: "arrastar", id: "quadrado", x: 1, y: 0.7 });
    const depois = poses(estado, "livre-plano");
    const quadrado = d.pecas.find((p) => p.id === "quadrado");
    if (!quadrado || !depois.quadrado) throw new Error("quadrado");
    for (const outra of d.pecas.filter((p) => p.id !== "quadrado")) {
      const pose = depois[outra.id];
      if (!pose) throw new Error(outra.id);
      expect(
        pecasSeSobrepoem(partesNaPose(quadrado, depois.quadrado), partesNaPose(outra, pose)),
      ).toBe(false);
    }
    expect(depois.quadrado.x).toBeGreaterThan(3.9);
  });

  it("o ímã encosta um vértice que ficou perto", () => {
    const d = desafio("tangram");
    const solucao = solucaoComoMontagem(d);
    if (solucao.tipo !== "livre-plano" || !solucao.poses.quadrado) throw new Error("tipo");
    const quase = {
      ...solucao.poses,
      quadrado: { ...solucao.poses.quadrado, x: solucao.poses.quadrado.x + 0.06 },
    };
    const estado = mesa(d, estadoInicial({ tipo: "livre-plano", poses: quase }), {
      tipo: "soltar",
      id: "quadrado",
    });
    expect(verificar(d, estado.montagem).montado).toBe(true);
  });

  it("na caixa dos 4 Ts, girar de 3 em 3 graus chega aos 18° da solução", () => {
    const d = desafio("quatro-ts-na-caixa");
    let estado = mesa(d, estadoInicial(montagemInicial(d, 5)), { tipo: "selecionar", id: "t-1" });
    const inicial = poses(estado, "livre-plano")["t-1"]?.angulo ?? 0;
    for (let i = 0; i < 6; i += 1) estado = mesa(d, estado, { tipo: "girar", sentido: 1 });
    expect(poses(estado, "livre-plano")["t-1"]?.angulo).toBe((inicial + 18) % 360);
  });

  it("a pirâmide: virar a segunda metade e descer até a outra encaixa", () => {
    const d = desafio("piramide-de-duas");
    const solucao = solucaoComoMontagem(d);
    if (solucao.tipo !== "livre-espaco") throw new Error("tipo");
    let estado = estadoInicial({
      tipo: "livre-espaco",
      poses: { ...solucao.poses, "metade-2": { x: 0, y: 0, z: 0, o: 0 } },
    });
    expect(verificar(d, estado.montagem).montado).toBe(false);
    estado = mesa(d, estado, { tipo: "selecionar", id: "metade-2" });
    estado = mesa(d, estado, { tipo: "girarEixo", eixo: "x" });
    estado = mesa(d, estado, { tipo: "girarEixo", eixo: "x" });
    // Ao virar, a mesa empurra a peça para cima; descer de volta encaixa.
    const subiu = poses(estado, "livre-espaco")["metade-2"]?.z ?? 0;
    for (let i = 0; i < Math.round(subiu / 0.5); i += 1)
      estado = mesa(d, estado, { tipo: "mover", dx: 0, dy: 0, dz: -1 });
    expect(verificar(d, estado.montagem).montado).toBe(true);
  });
});
