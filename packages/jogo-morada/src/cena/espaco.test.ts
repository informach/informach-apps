import {
  CELULA,
  doLocal,
  frenteDoGiro,
  listar,
  type Objeto,
  obter,
  type PontoMm,
  vagaDoPonto,
} from "@informach/morada-sim";
import { doCatalogo } from "@informach/morada-sim/conteudo";
import { criarMundoDaProva, criarRoteiro, LIA, moradorDeNome } from "@informach/morada-sim/testes";
import { describe, expect, it } from "vitest";
import { estadoDoEspelho } from "../espelho/estado";
import {
  centroDaCelula,
  daCena,
  giroDaDirecao,
  giroParaCena,
  menorVolta,
  paraCena,
} from "./espaco";
import { CORTE_DAS_PAREDES_MM, PE_DIREITO_MM, pecasDaParede } from "./planta";
import { alturaDoPiso, gravidezDe, situacaoDoMorador } from "./situacao";

/** Gira um ponto do referencial da peça em torno do Y da cena, como o three.js faz. */
function girarNoY(x: number, z: number, radianos: number): [number, number] {
  return [
    x * Math.cos(radianos) + z * Math.sin(radianos),
    -x * Math.sin(radianos) + z * Math.cos(radianos),
  ];
}

describe("da planta à cena", () => {
  it("é uma rotação, não um espelho: x fica, a altura vira Y e a frente (−Y) vira +Z", () => {
    expect(paraCena(1000, 0, 0)).toEqual([1, 0, -0]);
    expect(paraCena(0, -2000, 0)).toEqual([0, 0, 2]);
    expect(paraCena(0, 0, 3000)).toEqual([0, 3, -0]);
    // Determinante +1: a casa não sai espelhada.
    const [ex, ey, ez] = [paraCena(1, 0, 0), paraCena(0, 1, 0), paraCena(0, 0, 1)];
    const det =
      ex[0] * (ey[1] * ez[2] - ey[2] * ez[1]) -
      ex[1] * (ey[0] * ez[2] - ey[2] * ez[0]) +
      ex[2] * (ey[0] * ez[1] - ey[1] * ez[0]);
    expect(det / 1e-9).toBeCloseTo(1, 6);
    const [x, , z] = paraCena(1234, -5678, 0);
    const [px, py] = daCena(x, z);
    expect(px).toBeCloseTo(1234, 6);
    expect(py).toBeCloseTo(-5678, 6);
  });

  it("o giro da simulação é o mesmo ângulo em torno do Y da cena, com a frente em +Z e a lateral em +X", () => {
    for (const giro of [0, 90, 180, 270]) {
      for (const local of [
        [0, 1000],
        [700, 0],
        [-350, 425],
      ] as const) {
        // Na simulação: (lateral, frente) da peça levado ao lote.
        const [px, py] = doLocal([0, 0], giro, local);
        const esperado = paraCena(px, py, 0);
        // Na cena: lateral em X, frente em +Z, girado em torno de Y.
        const [x, z] = girarNoY(local[0] / 1000, local[1] / 1000, giroParaCena(giro));
        expect(x).toBeCloseTo(esperado[0], 9);
        expect(z).toBeCloseTo(esperado[2], 9);
      }
      const [fx, fy] = frenteDoGiro(giro);
      expect(menorVolta(giroDaDirecao(fx, fy), giro)).toBeCloseTo(0, 9);
    }
  });

  it("a porta da frente da casa da prova fica do lado da rua, na frente da entrada do lote", () => {
    const mundo = criarMundoDaProva();
    const lote = listar(mundo.estado.lotes)[0];
    const imovel = lote?.imovelId ? obter(mundo.estado.imoveis, lote.imovelId) : undefined;
    const andar = imovel?.andares[0];
    if (!lote || !andar) throw new Error("sem casa");
    const porta = andar.aberturas.find((a) => a.tipo === "porta" && a.externa);
    if (!porta) throw new Error("sem porta");
    // Na cena, a porta e a entrada estão em Z maior que o meio da casa: do lado da câmera.
    const meio = andar.contorno.reduce((soma, p) => soma + p[1], 0) / andar.contorno.length;
    const zDoMeio = paraCena(0, lote.origem[1] + meio)[2];
    const zDaPorta = paraCena(0, lote.origem[1] + porta.centro[1])[2];
    const zDaEntrada = paraCena(0, lote.origem[1] + lote.entrada[1])[2];
    expect(zDaPorta).toBeGreaterThan(zDoMeio);
    expect(zDaEntrada).toBeGreaterThan(zDaPorta);
    // A cozinha fica à direita de quem olha a casa de frente: X maior.
    const cozinha = andar.comodos.find((c) => c.tipo === "cozinha")?.ret[0];
    const sala = andar.comodos.find((c) => c.tipo === "sala")?.ret[0];
    if (!cozinha || !sala) throw new Error("sem cômodos");
    expect(paraCena(cozinha[0], 0)[0]).toBeGreaterThan(paraCena(sala[0], 0)[0]);
  });

  it("um clique no chão vai para o centro da célula de navegação", () => {
    expect(centroDaCelula([6010, 3249])).toEqual([6125, 3125]);
    expect(centroDaCelula([0, 0])).toEqual([CELULA / 2, CELULA / 2]);
    const mundo = criarMundoDaProva();
    const lote = listar(mundo.estado.lotes)[0];
    if (!lote) throw new Error("sem lote");
    // O centro de uma célula livre é um destino que o servidor aceita.
    const destino: PontoMm = centroDaCelula([lote.entrada[0] + 40, lote.entrada[1] + 900]);
    expect(mundo.navegador(lote.id).livre(destino)).toBe(true);
  });
});

describe("peças de parede", () => {
  const mundo = criarMundoDaProva();
  const andar = listar(mundo.estado.imoveis)[0]?.andares[0];
  if (!andar) throw new Error("sem andar");
  const parede = (id: string) => {
    const achada = andar.paredes.find((p) => p.id === id);
    if (!achada) throw new Error(`sem parede ${id}`);
    return achada;
  };

  it("a parede da frente tem duas janelas e a porta: vão inteiro na porta, peitoril e verga nas janelas", () => {
    const pecas = pecasDaParede(parede("p1"), andar.aberturas, PE_DIREITO_MM, null);
    // p1 vai de x=−5500 a 2500 (8 m). Janela 1,2 m em −3500, porta 0,9 m em −1500, janela em 1500.
    const resumo = pecas.map((p) => [p.de, p.ate, p.z0, p.z1]);
    expect(resumo).toEqual([
      [0, 1400, 0, 3000],
      [1400, 2600, 0, 900],
      [1400, 2600, 2000, 3000],
      [2600, 3550, 0, 3000],
      [3550, 4450, 2100, 3000],
      [4450, 6400, 0, 3000],
      [6400, 7600, 0, 900],
      [6400, 7600, 2000, 3000],
      [7600, 8000, 0, 3000],
    ]);
    // No vão da porta não há peça abaixo da verga: é por ali que se passa.
    expect(pecas.some((p) => p.de < 4450 && p.ate > 3550 && p.z0 < 2100)).toBe(false);
  });

  it("com as paredes baixas tudo é cortado a um metro e as vergas somem", () => {
    const pecas = pecasDaParede(parede("p1"), andar.aberturas, PE_DIREITO_MM, CORTE_DAS_PAREDES_MM);
    expect(pecas.map((p) => [p.de, p.ate, p.z0, p.z1])).toEqual([
      [0, 1400, 0, 1000],
      [1400, 2600, 0, 900],
      [2600, 3550, 0, 1000],
      [4450, 6400, 0, 1000],
      [6400, 7600, 0, 900],
      [7600, 8000, 0, 1000],
    ]);
  });

  it("o vão de cada porta é o mesmo que a navegação abre", () => {
    const lote = listar(mundo.estado.lotes)[0];
    if (!lote) throw new Error("sem lote");
    const navegador = mundo.navegador(lote.id);
    // Do lado de fora da porta da frente até logo depois dela, dentro da sala, há caminho.
    const rota = navegador.rota([6125, 3875], [6125, 5125]);
    expect(rota).not.toBeNull();
    for (const p of andar.paredes) {
      const comprimento = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
      const pecas = pecasDaParede(p, andar.aberturas, PE_DIREITO_MM, null);
      const portas = andar.aberturas.filter((a) => a.parede === p.id && a.tipo === "porta");
      // As peças que tocam o chão, somadas aos vãos das portas, cobrem a parede inteira.
      const noChao = pecas
        .filter((peca) => peca.z0 === 0)
        .reduce((s, peca) => s + peca.ate - peca.de, 0);
      const vaos = portas.reduce((s, a) => s + Math.floor(a.largura / 2) * 2, 0);
      expect(noChao + vaos).toBeCloseTo(comprimento, 6);
    }
  });
});

describe("situação de um morador", () => {
  const semApoio = () => 0;

  it("em pé no lote, dentro e fora da casa", () => {
    const mundo = criarMundoDaProva();
    const lia = moradorDeNome(mundo, "Lia");
    const fora = situacaoDoMorador(mundo.estado, lia, 0, semApoio);
    expect(fora).toMatchObject({ postura: "em_pe", andando: false, altura: 0, noColoDe: null });
    const lote = listar(mundo.estado.lotes)[0];
    if (!lote) throw new Error("sem lote");
    // No meio da sala, o piso é o da fundação.
    expect(alturaDoPiso(mundo.estado, lote.id, [4000, 6000])).toBe(450);
    expect(alturaDoPiso(mundo.estado, lote.id, [6000, 2500])).toBe(0);
  });

  it("andando, olha para onde vai e fica entre as posições inteiras da simulação", () => {
    const mundo = criarMundoDaProva();
    const roteiro = criarRoteiro(mundo);
    const sessao = roteiro.entrar(LIA);
    const lia = moradorDeNome(mundo, "Lia");
    roteiro.comandar(sessao, lia.id, { t: "reservar" });
    expect(
      roteiro.comandar(sessao, lia.id, { t: "ir_para", pos: [6125, 5125], andar: 0 }),
    ).toMatchObject({ ok: true });
    roteiro.ate(() => lia.movimento !== null, 10, "a caminhada");
    const tick = mundo.estado.relogio.tick + 6;
    const situacao = situacaoDoMorador(mundo.estado, lia, tick + 0.5, semApoio);
    expect(situacao).toMatchObject({ andando: true, postura: "em_pe" });
    // O destino está em y maior: a frente aponta para +Y da planta, que é giro 180.
    expect(Math.abs(menorVolta(situacao?.frente ?? 0, 180))).toBeLessThan(60);
  });

  it("sentado ou deitado, fica na vaga do ponto, na altura que os ativos dizem", () => {
    const mundo = criarMundoDaProva();
    const roteiro = criarRoteiro(mundo);
    const sessao = roteiro.entrar(LIA);
    const nina = moradorDeNome(mundo, "Nina");
    const cama = listar(mundo.estado.objetos).find(
      (objeto) => doCatalogo(objeto.catalogo)?.comportamento === "beliche",
    );
    if (!cama) throw new Error("sem beliche");
    roteiro.comandar(sessao, nina.id, { t: "reservar" });
    roteiro.comandar(sessao, nina.id, {
      t: "interagir",
      interacao: "dormir",
      alvo: { t: "objeto", objetoId: cama.id },
    });
    roteiro.ate(() => nina.local.t === "objeto", 900, "a cama");
    const apoio = (objeto: Objeto, ponto: string) => (objeto.id === cama.id && ponto ? 500 : 0);
    const estado = estadoDoEspelho(mundo.visao(LIA), mundo.estado.relogio.tick);
    const doEspelho = obter(estado.moradores, nina.id);
    if (!doEspelho || nina.local.t !== "objeto") throw new Error("a Nina não deitou");
    const situacao = situacaoDoMorador(estado, doEspelho, mundo.estado.relogio.tick, apoio);
    const vaga = vagaDoPonto(cama, nina.local.ponto);
    expect(situacao).toMatchObject({
      postura: "deitado",
      pos: vaga?.pos,
      frente: cama.giro,
      altura: cama.pos[2] + 500,
      agindo: true,
      animacao: "resident.sleep.bed",
    });
  });

  it("quem está fora dos lotes não é desenhado, e ninguém está grávido no começo", () => {
    const mundo = criarMundoDaProva();
    const duda = moradorDeNome(mundo, "Duda");
    expect(situacaoDoMorador(mundo.estado, duda, 0, semApoio)).toBeNull();
    expect(gravidezDe(mundo.estado, moradorDeNome(mundo, "Lia").id)).toBe(0);
  });
});
