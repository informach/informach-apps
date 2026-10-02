import { c, n, type SkillPack } from "../skill-factory";

/**
 * Geometria analítica: distância e ponto médio, equação da reta e
 * paralelismo/perpendicularidade, áreas por coordenadas, circunferência,
 * e lugares geométricos em problemas. Trilha Canguru J.
 */
export const coordenadasEm: SkillPack = {
  id: "coordenadas-em",
  name: "Geometria analítica",
  domain: "canguru",
  lab: "grid",
  missions: [
    {
      title: "Distâncias e pontos médios",
      objective:
        "Calcular distância entre pontos, ponto médio e usar essas fórmulas para classificar figuras.",
      introduction:
        "A distância entre (x₁, y₁) e (x₂, y₂) é √((x₂ − x₁)² + (y₂ − y₁)²), o Pitágoras da malha. O ponto médio é a média das coordenadas. Com isso se reconhecem triângulos isósceles, retângulos e losangos.",
      specs: [
        n(
          "distancia",
          "Qual é a distância entre os pontos (1, 2) e (7, 10)?",
          10,
          "√(6² + 8²) = √100 = 10.",
          {
            misreads: [
              { value: 14, feedback: "14 soma as diferenças; a distância usa Pitágoras." },
            ],
          },
        ),
        c(
          "distancia",
          "O ponto médio do segmento de (−3, 4) a (5, −2) é:",
          "(1, 1)",
          ["(2, 2)", "(4, 3)"],
          "((−3 + 5)/2, (4 − 2)/2) = (1, 1).",
          {
            feedback: [
              "(2, 2) somou as coordenadas mas não dividiu por 2.",
              "(4, 3) é metade da distância em cada eixo, não o ponto médio.",
            ],
          },
        ),
        n(
          "distancia",
          "O triângulo de vértices (0, 0), (4, 0) e (2, 3) é isósceles. Qual é o comprimento de cada um dos lados iguais? Arredonde para uma casa decimal.",
          3.6,
          "√(2² + 3²) = √13 ≈ 3,6 para os dois lados que chegam a (2, 3).",
          { misreads: [{ value: 4, feedback: "4 é a base, o lado diferente." }] },
        ),
        c(
          "distancia",
          "Os pontos A(0, 0), B(4, 0), C(4, 3) formam um triângulo:",
          "Retângulo em B",
          ["Isósceles, com AB = AC", "Retângulo em A"],
          "AB é horizontal e BC é vertical: ângulo reto em B. A hipotenusa AC mede 5.",
          {
            feedback: [
              "AB mede 4 e AC mede 5, pois é a hipotenusa; os lados são 3, 4 e 5, todos diferentes.",
              "Em A se encontram AB, horizontal, e AC, inclinado; o ângulo reto está em B, onde os lados são horizontal e vertical.",
            ],
          },
        ),
        n(
          "distancia",
          "Um ponto P(x, 0) está no eixo x e equidista de A(1, 3) e B(5, 1). Qual é o valor de x?",
          2,
          "(x − 1)² + 9 = (x − 5)² + 1 dá −2x + 10 = −10x + 26, x = 2.",
          {
            misreads: [
              {
                value: 3,
                feedback:
                  "3 é a média das abscissas, mas as ordenadas diferentes deslocam o ponto.",
              },
            ],
          },
        ),
        c(
          "distancia",
          "Se M(2, 5) é o ponto médio de AB e A = (−1, 3), então B é:",
          "(5, 7)",
          ["(0,5; 4)", "(3, 2)"],
          "B = 2M − A = (4 + 1, 10 − 3).",
          {
            feedback: [
              "(0,5; 4) é o ponto médio de A e M.",
              "(3, 2) é M − A, um deslocamento, não o ponto.",
            ],
          },
        ),
        n(
          "distancia",
          "Qual é o perímetro do quadrilátero de vértices (0, 0), (3, 0), (3, 4) e (0, 4)?",
          14,
          "É um retângulo 3 por 4: 2 × (3 + 4) = 14.",
          { misreads: [{ value: 12, feedback: "12 é a área." }] },
        ),
        c(
          "distancia",
          "Os pontos (0, 0), (2, 1), (4, 2) são:",
          "Colineares, todos na reta y = x/2",
          ["Vértices de um triângulo isósceles", "Vértices de um triângulo retângulo"],
          "As inclinações entre pares são iguais (1/2): os três estão na reta y = x/2. Pelas distâncias também se vê: a de (0, 0) a (4, 2) é a soma das outras duas.",
          {
            feedback: [
              "(2, 1) está à mesma distância dos outros dois, mas porque é o ponto médio: os três estão alinhados e não formam triângulo.",
              "Não há triângulo: a inclinação de (0, 0) a (2, 1) e a de (2, 1) a (4, 2) são iguais a 1/2, então os pontos estão alinhados.",
            ],
          },
        ),
      ],
    },
    {
      version: 2,
      title: "Retas no plano",
      objective:
        "Escrever a equação da reta, reconhecer inclinação e intercepto, e decidir paralelismo e perpendicularidade.",
      introduction:
        "Uma reta y = mx + b tem inclinação m (variação de y por unidade de x) e intercepto b. Duas retas não verticais são paralelas quando têm o mesmo m, e perpendiculares quando o produto das inclinações é −1. Retas verticais têm equação x = c, são paralelas entre si e perpendiculares às horizontais.",
      specs: [
        n(
          "reta",
          "Qual é a inclinação da reta que passa por (1, 3) e (4, 12)?",
          3,
          "(12 − 3)/(4 − 1) = 3.",
          { misreads: [{ value: 9, feedback: "9 é a variação de y; divida pela variação de x." }] },
        ),
        c(
          "reta",
          "A equação da reta que passa por (2, 1) com inclinação −2 é:",
          "y = −2x + 5",
          ["y = −2x + 1", "y = 2x − 3"],
          "1 = −2 × 2 + b dá b = 5.",
          {
            feedback: [
              "Com b = 1 a reta passa por (0, 1), não por (2, 1).",
              "A inclinação deve ser −2.",
            ],
          },
        ),
        n(
          "reta",
          "A reta perpendicular a y = 3x + 1 tem que inclinação? Arredonde para duas casas decimais e inclua o sinal.",
          -0.33,
          "O produto das inclinações é −1: −1/3 ≈ −0,33.",
          {
            misreads: [
              { value: -3, feedback: "−3 é o oposto, não o oposto do inverso." },
              {
                value: 0.33,
                feedback: "O sinal: a perpendicular a uma reta crescente é decrescente.",
              },
            ],
          },
        ),
        c(
          "reta",
          "As retas 2x + 3y = 6 e 4x + 6y = 5 são:",
          "Paralelas e distintas",
          ["Coincidentes", "Perpendiculares"],
          "Mesma inclinação (−2/3), interceptos diferentes.",
          {
            feedback: [
              "Multiplicando a primeira por 2 dá 4x + 6y = 12, não 5.",
              "Inclinações iguais, não de produto −1.",
            ],
          },
        ),
        n(
          "reta",
          "Em que valor de x a reta y = 2x − 8 cruza o eixo x?",
          4,
          "0 = 2x − 8 dá x = 4.",
          {
            misreads: [{ value: -8, feedback: "−8 é o intercepto no eixo y." }],
          },
        ),
        c(
          "reta",
          "A mediatriz do segmento de (0, 0) a (4, 2) é a reta:",
          "y = −2x + 5",
          ["y = x/2", "y = −2x"],
          "Passa pelo ponto médio (2, 1) com inclinação −1/(1/2) = −2.",
          {
            feedback: [
              "y = x/2 é a própria reta do segmento.",
              "y = −2x não passa pelo ponto médio (2, 1).",
            ],
          },
        ),
        n(
          "reta",
          "Qual é a distância do ponto (3, 4) à reta y = 0 (eixo x)?",
          4,
          "A distância ao eixo x é o valor absoluto de y.",
          { misreads: [{ value: 5, feedback: "5 é a distância à origem, não ao eixo." }] },
        ),
        c(
          "reta",
          "A reta que passa por (2, 5) e (2, −1) é:",
          "Vertical: x = 2",
          ["Horizontal: y = 2", "y = 2x + 1"],
          "Mesma abscissa: inclinação indefinida.",
          {
            feedback: ["Horizontal teria a mesma ordenada.", "Essa reta não passa por (2, −1)."],
          },
        ),
      ],
    },
    {
      version: 2,
      title: "Interseções e sistemas",
      objective:
        "Achar interseções de retas, resolver sistemas geometricamente e interpretar soluções.",
      introduction:
        "Cruzar duas retas é resolver um sistema de duas equações. Uma solução: retas concorrentes. Nenhuma: paralelas. Infinitas: coincidentes. Problemas de 'encontro' e 'empate' são interseções.",
      specs: [
        n(
          "intersecao",
          "As retas y = x + 1 e y = 3x − 5 se cruzam em que valor de x?",
          3,
          "x + 1 = 3x − 5 dá x = 3.",
          { misreads: [{ value: 4, feedback: "4 é o valor de y no cruzamento." }] },
        ),
        c(
          "intersecao",
          "O sistema y = 2x + 1 e 2y = 4x + 2 tem:",
          "Infinitas soluções",
          ["Uma única solução", "Nenhuma solução"],
          "A segunda equação é o dobro da primeira: as duas descrevem a mesma reta, e todo ponto dela é solução.",
          {
            feedback: [
              "Uma única solução seria de retas com inclinações diferentes; aqui as duas têm inclinação 2 e o mesmo intercepto, então coincidem.",
              "Nenhuma solução seria de paralelas distintas; dividindo a segunda equação por 2 sai y = 2x + 1, a mesma reta.",
            ],
          },
        ),
        n(
          "intersecao",
          "Um ciclista parte de x = 0 a 20 km/h e outro, ao mesmo tempo, de x = 30 km a 10 km/h, ambos no sentido positivo. Depois de quantas horas o primeiro alcança o segundo?",
          3,
          "20t = 30 + 10t dá t = 3.",
          {
            misreads: [
              {
                value: 1.5,
                feedback: "1,5 divide 30 por 20 e esquece que o segundo também se move.",
              },
            ],
          },
        ),
        c(
          "intersecao",
          "As retas x + y = 5 e x − y = 1 se cruzam em:",
          "(3, 2)",
          ["(2, 3)", "(4, 1)"],
          "Somando: 2x = 6, x = 3; y = 2.",
          {
            feedback: [
              "(2, 3) satisfaz a primeira, mas 2 − 3 = −1.",
              "(4, 1) satisfaz a primeira, mas 4 − 1 = 3.",
            ],
          },
        ),
        n(
          "intersecao",
          "Para que valor de k as retas y = kx + 2 e y = 3x − 1 são paralelas?",
          3,
          "Mesma inclinação.",
          { misreads: [{ value: -3, feedback: "−3 daria retas concorrentes." }] },
        ),
        c(
          "intersecao",
          "O triângulo formado pelas retas y = 0, x = 0 e x + y = 6 tem área:",
          "18",
          ["36", "12"],
          "Catetos 6 e 6: 6 × 6 ÷ 2 = 18.",
          {
            feedback: ["36 esquece de dividir por 2.", "12 não corresponde a catetos 6 e 6."],
          },
        ),
        n(
          "intersecao",
          "A reta y = mx passa pelo ponto de interseção de y = x + 2 e y = −x + 6. Quanto vale m?",
          2,
          "Interseção (2, 4); 4 = 2m dá m = 2.",
          { misreads: [{ value: 4, feedback: "4 é a ordenada da interseção; m = 4/2." }] },
        ),
        c(
          "intersecao",
          "Duas retas com inclinações 2 e 2 e interceptos 3 e 7:",
          "Nunca se cruzam",
          ["Se cruzam em x = 2", "Se cruzam em x = 5"],
          "Paralelas distintas.",
          {
            feedback: ["2x + 3 = 2x + 7 não tem solução.", "Nenhum x resolve."],
          },
        ),
      ],
    },
    {
      version: 2,
      title: "Áreas e circunferências",
      objective:
        "Calcular áreas de polígonos por coordenadas e trabalhar com a equação da circunferência.",
      introduction:
        "A área de um triângulo por coordenadas é metade do valor absoluto do determinante, ou base × altura quando um lado é paralelo a um eixo. A circunferência de centro (a, b) e raio r é (x − a)² + (y − b)² = r².",
      specs: [
        n(
          "area-circ",
          "Qual é a área do triângulo de vértices (0, 0), (5, 0) e (2, 4)?",
          10,
          "Base 5 no eixo x, altura 4: 10.",
          { misreads: [{ value: 20, feedback: "Esqueceu de dividir por 2." }] },
        ),
        c(
          "area-circ",
          "A circunferência de centro (2, −1) e raio 3 tem equação:",
          "(x − 2)² + (y + 1)² = 9",
          ["(x + 2)² + (y − 1)² = 9", "(x − 2)² + (y + 1)² = 3"],
          "Os sinais invertem e o raio aparece ao quadrado.",
          {
            feedback: [
              "Os sinais estão trocados: o centro seria (−2, 1).",
              "O lado direito é r² = 9.",
            ],
          },
        ),
        n(
          "area-circ",
          "Qual é o raio da circunferência x² + y² − 4x + 6y − 3 = 0?",
          4,
          "Completando quadrados: (x − 2)² + (y + 3)² = 3 + 4 + 9 = 16.",
          { misreads: [{ value: 16, feedback: "16 é r²." }] },
        ),
        c(
          "area-circ",
          "O ponto (3, 4) em relação à circunferência x² + y² = 25 está:",
          "Sobre ela",
          ["Dentro", "Fora"],
          "9 + 16 = 25.",
          {
            feedback: ["Dentro exigiria soma menor que 25.", "Fora exigiria soma maior que 25."],
          },
        ),
        n(
          "area-circ",
          "Qual é a área do triângulo de vértices (1, 1), (4, 1) e (4, 5)?",
          6,
          "Catetos 3 e 4: 6.",
          { misreads: [{ value: 12, feedback: "12 é o produto dos catetos; a área é a metade." }] },
        ),
        c(
          "area-circ",
          "A reta y = 5 em relação à circunferência x² + y² = 25 é:",
          "Tangente, no ponto (0, 5)",
          ["Secante, em (−5, 5) e (5, 5)", "Exterior, sem pontos comuns"],
          "A distância do centro à reta é 5, igual ao raio. Substituindo y = 5, sobra x² = 0: um único ponto comum.",
          {
            feedback: [
              "Substituindo y = 5: x² + 25 = 25, logo x = 0, e há um só ponto comum. Os pontos (±5, 5) ficam fora da circunferência.",
              "A distância do centro à reta é 5, igual ao raio: a reta toca a circunferência em (0, 5).",
            ],
          },
        ),
        n(
          "area-circ",
          "Qual é a área do quadrilátero de vértices (0, 0), (4, 0), (4, 3) e (0, 5)?",
          16,
          "Trapézio com bases 3 e 5 (verticais) e altura 4: (3 + 5) × 4 ÷ 2 = 16.",
          {
            misreads: [
              {
                value: 20,
                feedback: "20 seria um retângulo 4 por 5, mas o lado direito tem altura 3.",
              },
            ],
          },
        ),
        c(
          "area-circ",
          "Quantos pontos têm em comum as circunferências x² + y² = 4 e (x − 6)² + y² = 4?",
          "Nenhum, pois 6 > 2 + 2",
          ["Um, o ponto (3, 0)", "Dois, pois 6 < 4 + 4"],
          "Os centros são (0, 0) e (6, 0), a distância 6, e os raios medem 2. Como 6 > 2 + 2, as circunferências são exteriores.",
          {
            feedback: [
              "(3, 0) é o ponto médio entre os centros, mas fica a 3 de cada um, e os raios medem 2; não está em nenhuma das duas.",
              "4 é o quadrado do raio: os raios medem 2, e 6 > 2 + 2, então as circunferências não se encontram.",
            ],
          },
        ),
      ],
    },
    {
      title: "Coordenadas para resolver",
      objective:
        "Escolher um sistema de coordenadas conveniente para provar propriedades e resolver problemas.",
      introduction:
        "Colocar eixos numa figura transforma geometria em conta. A escolha dos eixos importa: origem num vértice, um lado sobre um eixo, coordenadas com letras para provar o caso geral.",
      estimatedMinutes: 18,
      specs: [
        c(
          "resolver",
          "Para provar que as diagonais de um retângulo têm o mesmo comprimento, coloca-se o retângulo com vértices (0, 0), (a, 0), (a, b), (0, b). As diagonais medem:",
          "√(a² + b²) ambas",
          ["a + b e a − b", "a e b"],
          "De (0, 0) a (a, b) e de (a, 0) a (0, b).",
          {
            feedback: ["As diagonais não são somas de lados.", "a e b são os lados."],
          },
        ),
        n(
          "resolver",
          "Um quadrado tem vértices (0, 0), (4, 0), (4, 4), (0, 4). Qual é a distância do centro ao vértice (4, 4)? Arredonde para duas casas decimais.",
          2.83,
          "Centro (2, 2): √(2² + 2²) = √8 ≈ 2,83.",
          {
            misreads: [
              {
                value: 4,
                feedback: "4 é o lado do quadrado; do centro ao vértice é metade da diagonal, √8.",
              },
            ],
          },
        ),
        c(
          "resolver",
          "Os pontos médios dos lados de qualquer quadrilátero formam:",
          "Um paralelogramo",
          ["Um retângulo sempre", "Um quadrado sempre"],
          "O segmento que liga os pontos médios de dois lados consecutivos é paralelo à diagonal que fecha o triângulo com eles; os lados opostos da figura ficam paralelos à mesma diagonal.",
          {
            feedback: [
              "Só é retângulo quando as diagonais são perpendiculares.",
              "Só é quadrado em casos especiais.",
            ],
          },
        ),
        n(
          "resolver",
          "As medianas de um triângulo se encontram no baricentro. Para o triângulo (0, 0), (6, 0), (0, 9), qual é a abscissa do baricentro?",
          2,
          "Média das abscissas: (0 + 6 + 0)/3 = 2.",
          {
            misreads: [
              {
                value: 3,
                feedback: "3 é a média de 0 e 6, mas o baricentro usa os três vértices.",
              },
            ],
          },
        ),
        c(
          "resolver",
          "Para achar o ponto da reta y = x mais próximo de (4, 0), o método por coordenadas é:",
          "Cruzar a perpendicular por (4, 0) com y = x: (2, 2)",
          [
            "Subir na vertical de (4, 0) até y = x: (4, 4)",
            "Tomar o ponto em que a reta começa: (0, 0)",
          ],
          "O pé da perpendicular é o ponto mais próximo. A perpendicular a y = x por (4, 0) é y = −x + 4, que cruza y = x em (2, 2).",
          {
            feedback: [
              "A vertical não é perpendicular a y = x; (4, 4) está a distância 4, e (2, 2) está a √8 ≈ 2,83.",
              "A reta não começa em (0, 0): ela segue nos dois sentidos. A origem está a distância 4, mais longe que (2, 2), a √8 ≈ 2,83.",
            ],
          },
        ),
        n(
          "resolver",
          "Um losango tem diagonais sobre os eixos, com vértices (±5, 0) e (0, ±3). Qual é a sua área?",
          30,
          "Diagonais 10 e 6: 10 × 6 ÷ 2 = 30.",
          {
            misreads: [{ value: 60, feedback: "60 é o produto das diagonais; a área é a metade." }],
          },
        ),
        c(
          "resolver",
          "O lugar geométrico dos pontos equidistantes de A(0, 0) e B(6, 0) é:",
          "A reta x = 3",
          ["A circunferência de diâmetro AB", "A reta y = 3"],
          "A mediatriz de AB, vertical pelo ponto médio.",
          {
            feedback: [
              "A circunferência de diâmetro AB é o lugar dos pontos que veem AB sob ângulo reto.",
              "y = 3 não é equidistante de A e B em geral.",
            ],
          },
        ),
        c(
          "resolver",
          "Ao provar uma propriedade geral com coordenadas, por que usar letras (a, b) em vez de números?",
          "Porque números provam só um caso, e letras, todos",
          [
            "Porque as contas com letras ficam mais curtas",
            "Não faz diferença, se o exemplo for bem escolhido",
          ],
          "Números verificam um caso; letras cobrem todas as figuras da família. O caso geral exige parâmetros.",
          {
            feedback: [
              "Com letras as contas costumam ficar mais longas, não mais curtas; o ganho é que o resultado vale para todas as figuras da família.",
              "Um exemplo, por melhor que seja, verifica um caso só; é isso que separa exemplo de prova.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize os passos para achar a equação da mediatriz de um segmento.",
    labels: [
      "Ler os extremos distintos A e B e calcular o ponto médio M",
      "Verificar se AB é horizontal, vertical ou oblíquo",
      "Determinar a direção perpendicular: vertical, horizontal ou de inclinação −1/m, respectivamente",
      "Escrever a reta perpendicular que passa por M",
    ],
    explanation:
      "A mediatriz passa pelo ponto médio e é perpendicular ao segmento. Se AB for horizontal, ela é vertical; se AB for vertical, ela é horizontal. Só no caso oblíquo usamos a inclinação −1/m.",
  },
  justification: {
    prompts: [
      "Explique por que a fórmula da distância é o teorema de Pitágoras.",
      "Explique por que duas retas perpendiculares não verticais têm inclinações com produto −1, usando um exemplo com inclinação 2. O que muda se uma delas for horizontal?",
      "Explique como provar com coordenadas que as diagonais de um paralelogramo se cortam ao meio.",
    ],
    samples: [
      "Dois pontos (x₁, y₁) e (x₂, y₂) formam com o ponto (x₂, y₁) um triângulo retângulo: um cateto horizontal de comprimento |x₂ − x₁| e um vertical de |y₂ − y₁|. A distância entre os pontos é a hipotenusa, então vale √((x₂ − x₁)² + (y₂ − y₁)²).",
      "Uma reta de inclinação 2 sobe 2 para cada 1 que anda: vetor (1, 2). Girar esse vetor um quarto de volta dá (−2, 1), de inclinação −1/2. O produto 2 × (−1/2) = −1. Para m diferente de zero, girar (1, m) dá (−m, 1), de inclinação −1/m. Se m = 0, a reta é horizontal e sua perpendicular é vertical, cuja inclinação não é definida; nesse caso não se usa o produto −1.",
      "Coloque o paralelogramo com vértices (0, 0), (a, 0), (b, c) e (a + b, c). O ponto médio da diagonal de (0, 0) a (a + b, c) é ((a + b)/2, c/2). O ponto médio da outra, de (a, 0) a (b, c), é ((a + b)/2, c/2). São o mesmo ponto, então as diagonais se cortam ao meio, para qualquer paralelogramo.",
    ],
    focus: "as relações entre coordenadas: distância, inclinação e ponto médio",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const ternas: [number, number, number][] = [
        [3, 4, 5],
        [6, 8, 10],
        [5, 12, 13],
        [8, 15, 17],
        [9, 12, 15],
      ];
      const [dx, dy, d] = ternas[seed % 5] ?? [3, 4, 5];
      const x0 = -4 + (seed % 9);
      // A(1, 2) a B(7, 10) já é uma missão.
      const y0 = dx === 6 && x0 === 1 && -3 + (seed % 7) === 2 ? 3 : -3 + (seed % 7);
      const f = (v: number) => String(v).replace("-", "−");
      return c(
        "distancia-entre-pontos",
        `No plano cartesiano, um segmento liga A(${f(x0)}, ${f(y0)}) a B(${f(x0 + dx)}, ${f(y0 + dy)}). Qual é o comprimento de AB?`,
        `${d}`,
        [`${dx + dy}`, `${d * d}`],
        `As diferenças são ${dx} e ${dy}: √(${dx}² + ${dy}²) = √${d * d} = ${d}.`,
        {
          feedback: [
            "Somou as diferenças; a distância usa Pitágoras.",
            "Esse é o quadrado da distância.",
          ],
        },
      );
    }
    if (variant === 1) {
      const m = -3 + (seed % 7 === 3 ? 4 : seed % 7);
      const x1 = 1 + (seed % 4);
      // Inclinação −2 pelo ponto (2, 1) já é uma missão.
      const y1 = m === -2 && x1 === 2 && -2 + (seed % 6) === 1 ? 2 : -2 + (seed % 6);
      const b = y1 - m * x1;
      const f = (v: number) => String(v).replace("-", "−");
      const termo = (coef: number, v: string) =>
        coef === 0 ? "" : coef === 1 ? v : coef === -1 ? `−${v}` : `${f(coef)}${v}`;
      const eq = (mm: number, bb: number) =>
        `y = ${termo(mm, "x")}${bb === 0 ? "" : bb > 0 ? ` + ${bb}` : ` − ${-bb}`}`;
      return c(
        "reta-por-ponto-e-inclinacao",
        `Qual é a equação da reta de inclinação ${f(m)} que passa pelo ponto (${x1}, ${f(y1)})?`,
        eq(m, b),
        [eq(m, y1), eq(-m, y1 + m * x1)],
        `${f(y1)} = ${f(m)} × ${x1} + b dá b = ${f(b)}.`,
        {
          feedback: [
            "Usou a ordenada do ponto como intercepto, mas o intercepto é o valor em x = 0.",
            "Trocou o sinal da inclinação.",
          ],
        },
      );
    }
    const a = 1 + (seed % 6);
    const bb = 1 + (seed % 4);
    const r = 3 + (seed % 5);
    return c(
      "raio-da-circunferencia",
      `Qual é o raio da circunferência (x − ${a})² + (y − ${bb})² = ${r * r}?`,
      `${r}`,
      [`${r * r}`, `${2 * r}`],
      `A equação é (x − a)² + (y − b)² = r² com centro (${a}, ${bb}) e r² = ${r * r}, então r = ${r}.`,
      {
        feedback: ["Esse é r², não r.", "Esse é o diâmetro, 2r."],
      },
    );
  },
  deepChallenge: {
    skillId: "coordenadas-em",
    title: "O mapa vira conta",
    prompt:
      "Coloque um sistema de coordenadas sobre a planta de um cômodo ou de um bairro (use um mapa impresso ou desenhado em escala). Calcule distâncias reais, ache o ponto equidistante de três lugares e verifique no mapa.",
    lab: "grid",
    steps: [
      "Defina origem, eixos e escala e registre as coordenadas de pelo menos quatro pontos.",
      "Calcule duas distâncias e o ponto equidistante de três dos pontos (circuncentro) pelas mediatrizes.",
      "Confira as respostas medindo no mapa e discuta as diferenças.",
    ],
    rubric: [
      "Sistema de coordenadas e escala bem definidos (0–2)",
      "Distâncias calculadas corretamente (0–2)",
      "Circuncentro encontrado com as mediatrizes escritas (0–4)",
      "Conferência e discussão do erro (0–2)",
    ],
  },
  homeSupport: [
    "Num aplicativo de mapas, comparem a distância em linha reta entre dois lugares com a distância pelas ruas e conversem sobre Pitágoras.",
    "Perguntem onde ficaria um ponto de encontro à mesma distância de três casas de amigos e como descobrir isso com régua.",
  ],
};
