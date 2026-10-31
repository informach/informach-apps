import { celulasNaPose, chaveCelula, partesNaPose, verticesNaPose } from "./geometria";
import {
  type Celula,
  type Desafio,
  type DesafioMalha,
  ehMalha,
  type Montagem,
  type PecaMalha,
  type PoseMalha,
  type PosePlana,
  type PoseSolida,
} from "./tipos";

/** Gerador pseudoaleatório pequeno e determinístico (mulberry32). */
export function sorteador(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ordenar = (cs: Celula[]) => [...cs].sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);

/** A pose que leva a peça às células da solução (procura entre as orientações). */
export function poseDasCelulas(
  peca: PecaMalha,
  celulas: readonly Celula[],
  plano: boolean,
): PoseMalha {
  const alvo = ordenar([...celulas]);
  const primeira = alvo[0] as Celula;
  for (let o = 0; o < (plano ? 8 : 24); o += 1) {
    const giradas = ordenar(celulasNaPose(peca, { x: 0, y: 0, z: 0, o }, plano));
    const base = giradas[0] as Celula;
    const pose = {
      x: primeira[0] - base[0],
      y: primeira[1] - base[1],
      z: primeira[2] - base[2],
      o,
    };
    const postas = celulasNaPose(peca, pose, plano).map(chaveCelula).sort();
    const esperadas = alvo.map(chaveCelula).sort();
    if (postas.every((c, i) => c === esperadas[i])) return pose;
  }
  throw new Error(`A solução não é uma posição possível da peça ${peca.id}`);
}

export function solucaoComoMontagem(desafio: Desafio): Montagem {
  if (ehMalha(desafio)) {
    const plano = desafio.tipo === "malha-plano";
    return {
      tipo: "malha",
      poses: Object.fromEntries(
        desafio.pecas.map((peca) => [
          peca.id,
          poseDasCelulas(peca, desafio.solucao[peca.id] ?? [], plano),
        ]),
      ),
    };
  }
  if (desafio.tipo === "livre-plano") return { tipo: "livre-plano", poses: { ...desafio.solucao } };
  return { tipo: "livre-espaco", poses: { ...desafio.solucao } };
}

type Caixa = { x0: number; y0: number; x1: number; y1: number };
function caixaDe(pontos: readonly (readonly number[])[]): Caixa {
  return {
    x0: Math.min(...pontos.map((p) => p[0] as number)),
    y0: Math.min(...pontos.map((p) => p[1] as number)),
    x1: Math.max(...pontos.map((p) => p[0] as number)),
    y1: Math.max(...pontos.map((p) => p[1] as number)),
  };
}

/**
 * Prateleiras abaixo do alvo: cada peça ganha seu espaço, sem encostar em
 * outra, para que nada comece sobreposto.
 */
function prateleiras(
  caixas: Caixa[],
  larguraMaxima: number,
  inicioX: number,
  inicioY: number,
  folga: number,
) {
  const posicoes: { dx: number; dy: number }[] = [];
  let x = inicioX;
  let y = inicioY;
  let alturaDaLinha = 0;
  for (const c of caixas) {
    const largura = c.x1 - c.x0;
    const altura = c.y1 - c.y0;
    if (x > inicioX && x + largura > inicioX + larguraMaxima) {
      x = inicioX;
      y -= alturaDaLinha + folga;
      alturaDaLinha = 0;
    }
    // A prateleira cresce para baixo: o topo da peça encosta em y.
    posicoes.push({ dx: x - c.x0, dy: y - c.y1 });
    x += largura + folga;
    alturaDaLinha = Math.max(alturaDaLinha, altura);
  }
  return posicoes;
}

/** Peças espalhadas fora do alvo, com giros sorteados, para começar a montar. */
export function montagemInicial(desafio: Desafio, semente: number): Montagem {
  const sorte = sorteador(semente);
  // Fisher-Yates com o gerador semeado: o mesmo resultado no navegador e no
  // servidor. Um comparador aleatório no sort depende do algoritmo do motor.
  const embaralhar = <T>(lista: readonly T[]) => {
    const copia = [...lista];
    for (let i = copia.length - 1; i > 0; i -= 1) {
      const j = Math.floor(sorte() * (i + 1));
      [copia[i], copia[j]] = [copia[j] as T, copia[i] as T];
    }
    return copia;
  };
  if (ehMalha(desafio)) {
    const plano = desafio.tipo === "malha-plano";
    const embaralhadas = embaralhar(desafio.pecas);
    const alvo = caixaDe(desafio.alvo);
    const largura = Math.max(alvo.x1 - alvo.x0 + 1, plano ? 10 : 8);
    const giradas = embaralhadas.map((peca) => {
      const o = Math.floor(sorte() * 4);
      const celulas = celulasNaPose(peca, { x: 0, y: 0, z: 0, o }, plano);
      const zMin = Math.min(...celulas.map((c) => c[2]));
      const c = caixaDe(celulas);
      return { peca, o, zMin, caixa: { x0: c.x0, y0: c.y0, x1: c.x1 + 1, y1: c.y1 + 1 } };
    });
    const posicoes = prateleiras(
      giradas.map((g) => g.caixa),
      largura,
      alvo.x0,
      alvo.y0 - 1,
      1,
    );
    return {
      tipo: "malha",
      poses: Object.fromEntries(
        giradas.map((g, i) => [
          g.peca.id,
          {
            x: Math.round(posicoes[i]?.dx ?? 0),
            y: Math.round(posicoes[i]?.dy ?? 0),
            z: 0 - g.zMin,
            o: g.o,
          } satisfies PoseMalha,
        ]),
      ),
    };
  }
  if (desafio.tipo === "livre-plano") {
    const alvo = caixaDe(desafio.alvo.flat());
    const largura = Math.max(alvo.x1 - alvo.x0, 6);
    const giradas = embaralhar(desafio.pecas).map((peca) => {
      const passos = Math.max(1, Math.round(90 / desafio.giro));
      const angulo = Math.floor(sorte() * 4) * passos * desafio.giro;
      const pose: PosePlana = { x: 0, y: 0, angulo: angulo % 360, espelho: false };
      return { peca, pose, caixa: caixaDe(partesNaPose(peca, pose).flat()) };
    });
    const posicoes = prateleiras(
      giradas.map((g) => g.caixa),
      largura,
      alvo.x0,
      alvo.y0 - 0.8,
      0.5,
    );
    return {
      tipo: "livre-plano",
      poses: Object.fromEntries(
        giradas.map((g, i) => [
          g.peca.id,
          {
            ...g.pose,
            x: Math.round((posicoes[i]?.dx ?? 0) * 100) / 100,
            y: Math.round((posicoes[i]?.dy ?? 0) * 100) / 100,
          },
        ]),
      ),
    };
  }
  // Sólidos: lado a lado na frente do alvo, apoiados na mesa.
  const alvo = desafio.alvo;
  const mesa = Math.min(...alvo.map((v) => v[2]));
  const frente = Math.min(...alvo.map((v) => v[1])) - 2.5;
  return {
    tipo: "livre-espaco",
    poses: Object.fromEntries(
      embaralhar(desafio.pecas).map((peca, i) => {
        const base: PoseSolida = { x: 0, y: 0, z: 0, o: 0 };
        const zMin = Math.min(...verticesNaPose(peca, base).map((v) => v[2]));
        return [peca.id, { x: -1.5 + i * 3, y: frente, z: mesa - zMin, o: 0 } satisfies PoseSolida];
      }),
    ),
  };
}

/** Malha: quantas células o alvo tem, para o texto "x de y". */
export function tamanhoDoAlvo(desafio: DesafioMalha) {
  return desafio.alvo.length;
}
