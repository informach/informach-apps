import { antiHorario, area, girar3, giros3, giroX } from "../geometria";
import type {
  Celula,
  Desafio,
  DesafioLivrePlano,
  DesafioMalha,
  Faixa,
  PecaMalha,
  PecaPlana,
  Ponto,
  PosePlana,
  Vetor3,
} from "../tipos";
import { pentominos, solucoesMalha } from "./solucoes-malha";

/** Cores da marca, na ordem em que as peças as recebem. */
const cores = [
  "#17B26A",
  "#8B5CF6",
  "#FFB020",
  "#FF8A5B",
  "#3BA9F5",
  "#C7F05C",
  "#0D844C",
  "#6D28D9",
  "#C2410C",
  "#0B6FB8",
  "#B97800",
  "#7FA62A",
];
const cor = (i: number) => cores[i % cores.length] as string;

const retangulo = (largura: number, altura: number): Celula[] =>
  Array.from(
    { length: largura * altura },
    (_, i) => [i % largura, Math.floor(i / largura), 0] as const,
  );
const caixa = (a: number, b: number, c: number): Celula[] =>
  Array.from(
    { length: a * b * c },
    (_, i) => [i % a, Math.floor(i / a) % b, Math.floor(i / (a * b))] as const,
  );
const cruz = (lado: number, braco: number): Celula[] => {
  const inicio = (lado - braco) / 2;
  const dentro = (v: number) => v >= inicio && v < inicio + braco;
  return retangulo(lado, lado).filter(([x, y]) => dentro(x) || dentro(y));
};

function pentominosDe(letras: string): PecaMalha[] {
  return [...letras].map((letra, i) => ({
    id: letra,
    nome: `Peça ${letra}`,
    cor: cor(i),
    celulas: pentominos[letra] as readonly Celula[],
  }));
}
function malha(
  base: Omit<DesafioMalha, "solucao" | "tipo"> & { tipo?: DesafioMalha["tipo"] },
  solucao: string,
): DesafioMalha {
  const encontrada = solucoesMalha[solucao];
  if (!encontrada) throw new Error(`Solução ${solucao} ausente`);
  return { tipo: "malha-plano", ...base, solucao: encontrada };
}

/**
 * Recebe as partes de uma peça já na posição da solução e devolve a peça
 * centrada no próprio centro de área (para girar no lugar) e a pose da solução.
 */
function plana(
  id: string,
  nome: string,
  indice: number,
  partes: Ponto[][],
): { peca: PecaPlana; pose: PosePlana } {
  let soma = 0;
  let cx = 0;
  let cy = 0;
  for (const parte of partes) {
    const a = area(parte);
    const px = parte.reduce((s, p) => s + p[0], 0) / parte.length;
    const py = parte.reduce((s, p) => s + p[1], 0) / parte.length;
    soma += a;
    cx += px * a;
    cy += py * a;
  }
  cx /= soma;
  cy /= soma;
  const arredondar = (v: number) => Math.round(v * 1e6) / 1e6;
  return {
    peca: {
      id,
      nome,
      cor: cor(indice),
      partes: partes.map((parte) =>
        antiHorario(parte.map((p) => [arredondar(p[0] - cx), arredondar(p[1] - cy)] as const)),
      ),
    },
    pose: { x: arredondar(cx), y: arredondar(cy), angulo: 0, espelho: false },
  };
}
function livrePlano(
  base: Omit<DesafioLivrePlano, "tipo" | "pecas" | "solucao">,
  pecas: { peca: PecaPlana; pose: PosePlana }[],
): DesafioLivrePlano {
  return {
    tipo: "livre-plano",
    ...base,
    pecas: pecas.map((p) => p.peca),
    solucao: Object.fromEntries(pecas.map((p) => [p.peca.id, p.pose])),
  };
}

/** Recorte de um convexo pelo semiplano n·p ≤ c (Sutherland-Hodgman). */
function recortar(poly: Ponto[], n: Ponto, c: number): Ponto[] {
  const dentro = (p: Ponto) => n[0] * p[0] + n[1] * p[1] <= c + 1e-12;
  const saida: Ponto[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i] as Ponto;
    const b = poly[(i + 1) % poly.length] as Ponto;
    if (dentro(a)) saida.push(a);
    if (dentro(a) !== dentro(b)) {
      const fa = n[0] * a[0] + n[1] * a[1] - c;
      const fb = n[0] * b[0] + n[1] * b[1] - c;
      const t = fa / (fa - fb);
      saida.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return saida;
}
const quadrado = (x: number, y: number, lado: number): Ponto[] => [
  [x, y],
  [x + lado, y],
  [x + lado, y + lado],
  [x, y + lado],
];

/* ---------- Tangram: o quadrado 4 × 4 ---------- */
const tangram = livrePlano(
  {
    id: "tangram",
    nome: "Tangram",
    conhecidoComo: "Tangram",
    faixa: "a",
    objetivo: "Junte as sete peças para formar um quadrado.",
    estrategia:
      "Comece pelos dois triângulos grandes: eles formam metade do quadrado. O resto se encaixa no outro triângulo.",
    gratuito: true,
    modo: "cobrir",
    alvo: [quadrado(0, 0, 4)],
    giro: 45,
    espelho: true,
  },
  [
    plana("grande-1", "Triângulo grande", 0, [
      [
        [0, 0],
        [4, 0],
        [2, 2],
      ],
    ]),
    plana("grande-2", "Outro triângulo grande", 1, [
      [
        [0, 0],
        [2, 2],
        [0, 4],
      ],
    ]),
    plana("medio", "Triângulo médio", 2, [
      [
        [4, 2],
        [4, 4],
        [2, 4],
      ],
    ]),
    plana("pequeno-1", "Triângulo pequeno", 3, [
      [
        [4, 0],
        [4, 2],
        [3, 1],
      ],
    ]),
    plana("pequeno-2", "Outro triângulo pequeno", 4, [
      [
        [2, 2],
        [3, 3],
        [1, 3],
      ],
    ]),
    plana("quadrado", "Quadrado", 5, [
      [
        [2, 2],
        [3, 1],
        [4, 2],
        [3, 3],
      ],
    ]),
    plana("paralelogramo", "Paralelogramo", 6, [
      [
        [0, 4],
        [1, 3],
        [3, 3],
        [2, 4],
      ],
    ]),
  ],
);

/* ---------- T de quatro peças, com cortes de 45° ---------- */
const tDeQuatro = livrePlano(
  {
    id: "t-de-quatro",
    nome: "O T de quatro peças",
    conhecidoComo: "Quebra-cabeça do T (versão do Missão Saber)",
    faixa: "c",
    objetivo: "Forme a letra T com as quatro peças.",
    estrategia:
      "A peça com o recorte não fecha o buraco do T. Ela fica inclinada no cruzamento, e o recorte vira a quina.",
    gratuito: false,
    modo: "cobrir",
    alvo: [
      [
        [0, 3],
        [3, 3],
        [3, 4],
        [0, 4],
      ],
      [
        [1, 0],
        [2, 0],
        [2, 3],
        [1, 3],
      ],
    ],
    giro: 45,
    espelho: true,
  },
  [
    plana("trapezio-1", "Trapézio", 0, [
      [
        [0, 3],
        [1, 3],
        [2, 4],
        [0, 4],
      ],
    ]),
    plana("trapezio-2", "Outro trapézio", 1, [
      [
        [1, 0],
        [2, 0],
        [2, 2],
        [1, 1],
      ],
    ]),
    plana("triangulo", "Triângulo", 2, [
      [
        [2, 4],
        [3, 3],
        [3, 4],
      ],
    ]),
    plana("recortada", "Peça com recorte", 3, [
      [
        [1, 1],
        [2, 2],
        [2, 3],
        [1, 3],
      ],
      [
        [1, 3],
        [3, 3],
        [2, 4],
      ],
    ]),
  ],
);

/* ---------- Cruz grega em quatro peças iguais ---------- */
const cruzGrega = (() => {
  const quadrados = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].map(([x, y]) => quadrado((x as number) - 0.5, (y as number) - 0.5, 1));
  // Dois cortes perpendiculares pelo centro, com inclinação 1/2: quatro peças iguais.
  const d1: Ponto = [2, 1];
  const d2: Ponto = [-1, 2];
  const quadrantes: [number, number][] = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ];
  const pecas = quadrantes.map(([s1, s2], i) => {
    const partes = quadrados
      .map((q) =>
        recortar(recortar(q, [-s1 * d1[0], -s1 * d1[1]], 0), [-s2 * d2[0], -s2 * d2[1]], 0),
      )
      .filter((parte) => parte.length >= 3 && area(parte) > 1e-9);
    return plana(`parte-${i + 1}`, `Peça ${i + 1}`, i, partes);
  });
  return livrePlano(
    {
      id: "cruz-grega",
      nome: "A cruz de quatro peças iguais",
      conhecidoComo: "Dissecção da cruz grega",
      faixa: "d",
      objetivo: "Junte as quatro peças iguais para formar a cruz.",
      estrategia:
        "Todas as peças têm uma quina reta que vai para o centro. Os cortes inclinados se continuam de uma peça para a outra.",
      gratuito: false,
      modo: "cobrir",
      alvo: quadrados,
      giro: 90,
      espelho: false,
    },
    pecas,
  );
})();

/* ---------- 4 Ts na caixa: só cabem inclinados ---------- */
/**
 * Inspirado no "Jogo dos 4 Ts" de MDF (base de 10 × 10 cm). As medidas são
 * nossas: T com barra 3 × 1 e haste 1 × 3 numa base de lado 5,8. Alinhados aos
 * lados, os quatro Ts precisariam de lado 6 (busca exaustiva em
 * desafios.md); em cata-vento inclinado 18°, cabem com folga de 0,02.
 */
const LADO_DA_CAIXA = 5.8;
const quatroTsNaCaixa = (() => {
  const t: Ponto[][] = [
    [
      [-1.5, 0.5],
      [1.5, 0.5],
      [1.5, 1.5],
      [-1.5, 1.5],
    ],
    [
      [-0.5, -2.5],
      [0.5, -2.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ],
  ];
  const poses: PosePlana[] = [
    { x: 4.501, y: 2.894, angulo: 18, espelho: false },
    { x: 2.906, y: 4.501, angulo: 108, espelho: false },
    { x: 1.299, y: 2.906, angulo: 198, espelho: false },
    { x: 2.894, y: 1.299, angulo: 288, espelho: false },
  ];
  return livrePlano(
    {
      id: "quatro-ts-na-caixa",
      nome: "4 Ts na caixa",
      conhecidoComo: "Jogo dos 4 Ts",
      faixa: "d",
      objetivo: "Guarde os quatro Ts dentro da caixa, sem nada para fora.",
      estrategia:
        "Retos, eles não cabem. Inclinados, cada T abraça a haste do vizinho e os quatro giram em volta do centro, como um cata-vento.",
      gratuito: false,
      modo: "caber",
      alvo: [quadrado(0, 0, LADO_DA_CAIXA)],
      giro: 3,
      espelho: false,
    },
    poses.map((pose, i) => ({
      peca: {
        id: `t-${i + 1}`,
        nome: `T ${i + 1}`,
        cor: cor(i),
        partes: t.map((parte) => antiHorario(parte)),
      },
      pose,
    })),
  );
})();

/* ---------- Pirâmide de duas peças ---------- */
/** Metade de um tetraedro regular inscrito no cubo [-1, 1]³, cortado em z = 0 (z para cima). */
const metade: Vetor3[] = [
  [1, 1, 1],
  [-1, -1, 1],
  [1, 0, 0],
  [0, 1, 0],
  [-1, 0, 0],
  [0, -1, 0],
];
const meiaVolta = girar3(girar3(0, giroX), giroX);
const piramide: Desafio = {
  tipo: "livre-espaco",
  id: "piramide-de-duas",
  nome: "Pirâmide de duas peças",
  conhecidoComo: "Quebra-cabeça da pirâmide de 2 peças",
  faixa: "b",
  objetivo: "Junte as duas metades iguais para formar uma pirâmide de faces triangulares.",
  estrategia:
    "As faces quadradas se encostam, mas uma das peças precisa ficar de cabeça para baixo e girada um quarto de volta.",
  gratuito: false,
  pecas: [
    { id: "metade-1", nome: "Metade de cima", cor: cor(0), vertices: metade },
    { id: "metade-2", nome: "Outra metade", cor: cor(1), vertices: metade },
  ],
  alvo: [
    [1, 1, 1],
    [-1, -1, 1],
    [1, -1, -1],
    [-1, 1, -1],
  ],
  solucao: {
    "metade-1": { x: 0, y: 0, z: 0, o: 0 },
    "metade-2": { x: 0, y: 0, z: 0, o: meiaVolta },
  },
};
if (giros3.length !== 24 || meiaVolta < 0) throw new Error("Giros do cubo inválidos");

/* ---------- Malha ---------- */
const tetromino: Celula[] = [
  [0, 0, 0],
  [1, 0, 0],
  [2, 0, 0],
  [1, 1, 0],
];
const triCubo: Celula[] = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
];
const somaPecas: [string, string, Celula[]][] = [
  ["V", "Peça V", triCubo],
  [
    "L",
    "Peça L",
    [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [0, 1, 0],
    ],
  ],
  [
    "T",
    "Peça T",
    [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [1, 1, 0],
    ],
  ],
  [
    "Z",
    "Peça Z",
    [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [2, 1, 0],
    ],
  ],
  ["A", "Peça A", [...triCubo, [1, 0, 1]]],
  ["B", "Peça B", [...triCubo, [0, 1, 1]]],
  ["P", "Peça P", [...triCubo, [0, 0, 1]]],
];

const emMalha: DesafioMalha[] = [
  malha(
    {
      id: "katamino-5x3",
      nome: "Retângulo 5 × 3",
      conhecidoComo: "Katamino",
      faixa: "a",
      objetivo: "Feche o retângulo com as três peças.",
      estrategia: "Comece pelos cantos: a peça que só cabe num canto decide o resto.",
      gratuito: true,
      pecas: pentominosDe("PFU"),
      alvo: retangulo(5, 3),
    },
    "katamino-5x3",
  ),
  malha(
    {
      id: "cubo-2",
      tipo: "malha-espaco",
      nome: "Cubo 2 × 2 × 2",
      conhecidoComo: "Cubo de cubinhos",
      faixa: "a",
      objetivo: "Monte um cubo com as três peças.",
      estrategia: "Monte primeiro a camada de baixo inteira. A de cima mostra o que falta.",
      gratuito: true,
      pecas: [
        { id: "v1", nome: "Cantoneira", cor: cor(0), celulas: triCubo },
        { id: "v2", nome: "Outra cantoneira", cor: cor(1), celulas: triCubo },
        {
          id: "d",
          nome: "Dupla",
          cor: cor(2),
          celulas: [
            [0, 0, 0],
            [1, 0, 0],
          ],
        },
      ],
      alvo: caixa(2, 2, 2),
    },
    "cubo-2",
  ),
  malha(
    {
      id: "katamino-5x4",
      nome: "Retângulo 5 × 4",
      conhecidoComo: "Katamino",
      faixa: "b",
      objetivo: "Feche o retângulo com as quatro peças.",
      estrategia: "A peça comprida quase sempre vai na borda. Teste-a de pé e deitada.",
      gratuito: false,
      pecas: pentominosDe("LNUP"),
      alvo: retangulo(5, 4),
    },
    "katamino-5x4",
  ),
  malha(
    {
      id: "quatro-ts-quadrado",
      nome: "4 Ts no quadrado",
      conhecidoComo: "Quadrado de tetraminós T",
      faixa: "b",
      objetivo: "Encaixe as quatro peças em T para formar o quadrado, sem sobrar espaço.",
      estrategia:
        "Cada T ocupa um canto e empurra o vizinho. Girando um quarto de volta de peça para peça, eles se fecham.",
      gratuito: false,
      pecas: [0, 1, 2, 3].map((i) => ({
        id: `t${i}`,
        nome: `T ${i + 1}`,
        cor: cor(i),
        celulas: tetromino,
      })),
      alvo: retangulo(4, 4),
    },
    "quatro-ts-quadrado",
  ),
  malha(
    {
      id: "soma",
      tipo: "malha-espaco",
      nome: "Cubo Soma",
      conhecidoComo: "Cubo Soma, de Piet Hein",
      faixa: "b",
      objetivo: "Monte o cubo 3 × 3 × 3 com as sete peças.",
      estrategia:
        "A peça V é a mais fácil de encaixar no fim. Use as peças em pé (A, B e P) primeiro, nos cantos.",
      gratuito: false,
      pecas: somaPecas.map(([id, nome, celulas], i) => ({ id, nome, cor: cor(i), celulas })),
      alvo: caixa(3, 3, 3),
    },
    "soma",
  ),
  malha(
    {
      id: "katamino-5x6",
      nome: "Retângulo 5 × 6",
      conhecidoComo: "Katamino",
      faixa: "c",
      objetivo: "Feche o retângulo com as seis peças.",
      estrategia:
        "Conte as casas que sobram num canto: se não forem cinco, aquela peça não vai ali.",
      gratuito: false,
      pecas: pentominosDe("LNPTUY"),
      alvo: retangulo(5, 6),
    },
    "katamino-5x6",
  ),
  malha(
    {
      id: "cruz-de-pentominos",
      nome: "A cruz de nove peças",
      conhecidoComo: "Cruz de pentominós",
      faixa: "c",
      objetivo: "Forme a cruz com as nove peças diferentes.",
      estrategia:
        "As pontas dos braços são estreitas: só algumas peças cabem nelas. Comece por elas.",
      gratuito: false,
      pecas: pentominosDe("FILNPTUVY"),
      alvo: cruz(9, 3),
    },
    "cruz-grande",
  ),
  malha(
    {
      id: "pentominos-8x8",
      nome: "Tabuleiro 8 × 8 com furo",
      conhecidoComo: "Pentominós no tabuleiro de xadrez",
      faixa: "c",
      objetivo: "Cubra o tabuleiro com as doze peças, deixando vazio só o quadrado do meio.",
      estrategia:
        "A peça X, em forma de cruz, tem poucos lugares possíveis. Decida onde ela vai antes.",
      gratuito: false,
      pecas: pentominosDe("FILNPTUVWXYZ"),
      alvo: retangulo(8, 8).filter(([x, y]) => !(x >= 3 && x < 5 && y >= 3 && y < 5)),
    },
    "pentominos-8x8",
  ),
  malha(
    {
      id: "slothouber",
      tipo: "malha-espaco",
      nome: "Cubo dos três cubinhos",
      conhecidoComo: "Quebra-cabeça de Slothouber-Graatsma",
      faixa: "c",
      objetivo: "Monte o cubo 3 × 3 × 3 com seis blocos e três cubinhos soltos.",
      estrategia:
        "Os três cubinhos ficam numa diagonal do cubo, um em cada camada. Os blocos giram em volta deles.",
      gratuito: false,
      pecas: [
        ...[0, 1, 2, 3, 4, 5].map((i) => ({
          id: `b${i}`,
          nome: `Bloco ${i + 1}`,
          cor: cor(i),
          celulas: [
            [0, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
            [0, 1, 1],
          ] as Celula[],
        })),
        ...[0, 1, 2].map((i) => ({
          id: `c${i}`,
          nome: `Cubinho ${i + 1}`,
          cor: cor(6 + i),
          celulas: [[0, 0, 0]] as Celula[],
        })),
      ],
      alvo: caixa(3, 3, 3),
    },
    "slothouber",
  ),
  malha(
    {
      id: "pentominos-6x10",
      nome: "Retângulo 6 × 10",
      conhecidoComo: "Pentominós",
      faixa: "d",
      objetivo: "Cubra o retângulo com as doze peças, sem sobrar nenhuma casa.",
      estrategia:
        "Evite deixar buracos isolados: um espaço com menos de cinco casas nunca vai ser preenchido.",
      gratuito: false,
      pecas: pentominosDe("FILNPTUVWXYZ"),
      alvo: retangulo(10, 6),
    },
    "pentominos-6x10",
  ),
];

export const desafios: readonly Desafio[] = [
  ...emMalha,
  tangram,
  piramide,
  tDeQuatro,
  cruzGrega,
  quatroTsNaCaixa,
];

const ordemFaixa: Record<Faixa, number> = { a: 0, b: 1, c: 2, d: 3 };
export const desafiosPorFaixa = [...desafios].sort(
  (a, b) => ordemFaixa[a.faixa] - ordemFaixa[b.faixa] || a.nome.localeCompare(b.nome, "pt-BR"),
);
export function encontrarDesafio(id: string) {
  return desafios.find((d) => d.id === id);
}
export const rotuloFaixa: Record<Faixa, string> = {
  a: "2º e 3º ano",
  b: "4º e 5º ano",
  c: "6º e 7º ano",
  d: "8º ano em diante",
};
/** Faixa de desafios do ano escolar (1º ano fica com a primeira faixa). */
export function faixaDoAno(ano: number): Faixa {
  if (ano <= 3) return "a";
  if (ano <= 5) return "b";
  if (ano <= 7) return "c";
  return "d";
}
export { ordemFaixa };
