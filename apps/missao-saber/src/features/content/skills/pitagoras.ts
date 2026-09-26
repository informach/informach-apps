import { c, n, type SkillPack } from "../skill-factory";

/**
 * Teorema de Pitágoras: reconhecer o triângulo retângulo, calcular lados e
 * usar a relação para achar alturas, diagonais, distâncias e áreas.
 * Trilha OBMEP N2.
 */
export const pitagoras: SkillPack = {
  id: "pitagoras",
  name: "Pitágoras e distâncias",
  domain: "obmep",
  lab: "grid",
  missions: [
    {
      title: "O triângulo retângulo",
      objective: "Identificar catetos e hipotenusa e usar a relação a² + b² = c².",
      introduction:
        "No triângulo retângulo, os dois lados que formam o ângulo reto são os catetos, e o lado oposto a ele é a hipotenusa. A soma dos quadrados dos catetos é o quadrado da hipotenusa.",
      specs: [
        c(
          "nomear-lados",
          "Em um triângulo retângulo, a hipotenusa é:",
          "O lado oposto ao ângulo reto, sempre o maior",
          ["O lado mais curto", "Qualquer lado que encoste no ângulo reto"],
          "A hipotenusa fica de frente para o ângulo reto e é o maior lado.",
          {
            feedback: [
              "O maior ângulo fica de frente para o maior lado; o ângulo reto é o maior.",
              "Os lados que encostam no ângulo reto são os catetos.",
            ],
          },
        ),
        n(
          "calcular-hipotenusa",
          "Um triângulo retângulo tem catetos de 6 cm e 8 cm. Quanto mede a hipotenusa, em cm?",
          10,
          "6² + 8² = 36 + 64 = 100, e a raiz quadrada de 100 é 10.",
          { misreads: [{ value: 14, feedback: "Somou os catetos; a relação soma os quadrados." }] },
        ),
        c(
          "reconhecer-terno",
          "Qual trio de medidas forma um triângulo retângulo?",
          "5, 12 e 13",
          ["5, 12 e 17", "4, 5 e 6"],
          "5² + 12² = 25 + 144 = 169 = 13².",
          {
            feedback: [
              "5 + 12 = 17, mas Pitágoras soma os quadrados: 169 é diferente de 289.",
              "4² + 5² = 41, diferente de 6² = 36.",
            ],
          },
        ),
        n(
          "calcular-hipotenusa",
          "Os catetos de um triângulo retângulo medem 9 e 12. Quanto mede a hipotenusa?",
          15,
          "81 + 144 = 225, e a raiz quadrada de 225 é 15.",
          { misreads: [{ value: 21, feedback: "Somou os catetos em vez de somar os quadrados." }] },
        ),
        c(
          "nomear-lados",
          "Em um triângulo retângulo de catetos a e b e hipotenusa c, vale sempre:",
          "a² + b² = c²",
          ["a + b = c", "a² + c² = b²"],
          "O quadrado da hipotenusa é a soma dos quadrados dos catetos.",
          {
            feedback: [
              "A soma dos catetos é sempre maior que a hipotenusa; a relação é entre quadrados.",
              "Trocou a hipotenusa por um cateto: c é o maior lado e fica sozinho.",
            ],
          },
        ),
        n(
          "calcular-hipotenusa",
          "Um triângulo retângulo tem catetos 7 e 24. Qual é o seu perímetro?",
          56,
          "A hipotenusa é a raiz de 49 + 576 = 625, ou seja, 25; perímetro 7 + 24 + 25 = 56.",
          { misreads: [{ value: 31, feedback: "Somou só os catetos e esqueceu a hipotenusa." }] },
        ),
        c(
          "diagonal-do-quadrado",
          "Um quadrado tem lado 1. Sua diagonal mede:",
          "√2, aproximadamente 1,41",
          ["2", "1,5"],
          "1² + 1² = 2, então a diagonal é √2.",
          {
            feedback: [
              "2 é o quadrado da diagonal, não a diagonal.",
              "1,5 é um chute: 1,5² = 2,25, maior que 2.",
            ],
          },
        ),
        c(
          "reconhecer-terno",
          "Os lados de um triângulo medem 8, 15 e 17. O ângulo oposto ao lado 17 é:",
          "Reto, pois 8² + 15² = 17²",
          ["Agudo, pois 17 < 8 + 15", "Obtuso, pois 17 é o maior lado"],
          "64 + 225 = 289 = 17², então o triângulo é retângulo.",
          {
            feedback: [
              "17 < 8 + 15 só garante que o triângulo existe.",
              "Ser o maior lado não faz o ângulo ser obtuso; a comparação dos quadrados decide.",
            ],
          },
        ),
      ],
    },
    {
      title: "Achar um cateto",
      objective: "Calcular um cateto conhecendo a hipotenusa e o outro cateto.",
      introduction:
        "Quando o lado desconhecido é um cateto, o quadrado dele é a diferença entre o quadrado da hipotenusa e o quadrado do outro cateto. A hipotenusa nunca fica menor que um cateto.",
      specs: [
        n(
          "calcular-cateto",
          "A hipotenusa de um triângulo retângulo mede 13 e um cateto mede 5. Quanto mede o outro cateto?",
          12,
          "13² − 5² = 169 − 25 = 144, e a raiz de 144 é 12.",
          { misreads: [{ value: 8, feedback: "Subtraiu os lados sem elevar ao quadrado." }] },
        ),
        c(
          "escada-na-parede",
          "Uma escada de 10 m está apoiada em uma parede, com o pé a 6 m dela. A que altura a escada toca a parede?",
          "8 m",
          ["4 m", "11,7 m"],
          "10² − 6² = 100 − 36 = 64; a altura é 8 m.",
          {
            feedback: [
              "4 m subtrai 6 de 10 sem elevar ao quadrado.",
              "11,7 m somou os quadrados, como se a escada fosse um cateto.",
            ],
          },
        ),
        n(
          "calcular-cateto",
          "Um cabo de 25 m liga o topo de uma torre ao chão e está preso a 7 m da base. Qual é a altura da torre, em m?",
          24,
          "25² − 7² = 625 − 49 = 576, e a raiz de 576 é 24.",
          { misreads: [{ value: 18, feedback: "Subtraiu 7 de 25 sem usar os quadrados." }] },
        ),
        c(
          "area-do-retangulo-de-catetos",
          "Um triângulo retângulo tem hipotenusa 20 e um cateto 16. Sua área é:",
          96,
          [160, 120],
          "O outro cateto é a raiz de 400 − 256 = 144, ou seja, 12; área 16 × 12 ÷ 2 = 96.",
          {
            feedback: [
              "160 usa a hipotenusa 20 como se fosse cateto, junto com o 16.",
              "120 usa 20 × 12 ÷ 2, com a hipotenusa no lugar do cateto.",
            ],
          },
        ),
        n(
          "diagonal-do-retangulo",
          "Um retângulo tem diagonal de 26 cm e um lado de 24 cm. Qual é o seu perímetro, em cm?",
          68,
          "O outro lado é a raiz de 676 − 576 = 100, ou seja, 10; perímetro 2 × (24 + 10) = 68.",
          { misreads: [{ value: 100, feedback: "Usou a diagonal como se fosse um lado." }] },
        ),
        c(
          "losango-e-diagonais",
          "Uma pipa em forma de losango tem diagonais de 30 cm e 40 cm. Cada lado mede:",
          "25 cm",
          ["35 cm", "50 cm"],
          "As diagonais se cortam ao meio: metades 15 e 20; o lado é a raiz de 225 + 400 = 625, ou seja, 25 cm.",
          {
            feedback: [
              "35 cm é a média das diagonais.",
              "50 cm usa as diagonais inteiras, e não as metades.",
            ],
          },
        ),
        n(
          "calcular-cateto",
          "Uma rampa reta tem 13 m de comprimento e sobe 5 m. Qual é a distância horizontal que ela cobre, em m?",
          12,
          "13² − 5² = 169 − 25 = 144, e a raiz de 144 é 12.",
          { misreads: [{ value: 8, feedback: "Subtraiu 5 de 13 sem elevar ao quadrado." }] },
        ),
        c(
          "estimar-raiz",
          "Os catetos de um triângulo retângulo medem 1 e 2. A hipotenusa está entre:",
          "2 e 3, pois 2² < 5 < 3²",
          ["1 e 2", "3 e 4"],
          "A hipotenusa ao quadrado é 1 + 4 = 5, e 4 < 5 < 9.",
          {
            feedback: [
              "A hipotenusa é maior que o maior cateto, que é 2.",
              "3² = 9 já passa de 5.",
            ],
          },
        ),
      ],
    },
    {
      title: "Pitágoras nas figuras",
      objective: "Achar alturas e diagonais em triângulos, retângulos, losangos e trapézios.",
      introduction:
        "Procure o triângulo retângulo escondido na figura: uma altura, uma diagonal ou metade de uma diagonal costumam criá-lo. Desenhe antes de calcular.",
      specs: [
        n(
          "altura-do-isosceles",
          "Um triângulo isósceles tem lados 13, 13 e 10. Qual é a altura relativa à base de medida 10?",
          12,
          "A altura divide a base em 5 e 5: 13² − 5² = 144, então a altura é 12.",
          {
            misreads: [
              {
                value: 3,
                feedback:
                  "Subtraiu 10 de 13; a altura vem do triângulo retângulo com metade da base.",
              },
            ],
          },
        ),
        c(
          "diagonal-do-retangulo",
          "A diagonal de um retângulo de 9 cm por 12 cm mede:",
          "15 cm",
          ["21 cm", "10,5 cm"],
          "81 + 144 = 225, e a raiz de 225 é 15.",
          {
            feedback: ["21 cm soma os lados.", "10,5 cm é a média dos lados."],
          },
        ),
        n(
          "altura-do-equilatero",
          "Um triângulo equilátero tem lado 10. Qual é o quadrado da sua altura?",
          75,
          "A altura forma um triângulo retângulo com metade do lado: h² = 10² − 5² = 75.",
          {
            misreads: [
              {
                value: 25,
                feedback: "Elevou ao quadrado só a metade do lado; falta subtrair de 100.",
              },
            ],
          },
        ),
        c(
          "losango-e-diagonais",
          "Um losango tem lado 10 cm e uma das diagonais mede 12 cm. A outra diagonal mede:",
          "16 cm",
          ["8 cm", "14 cm"],
          "Metade da diagonal conhecida: 6; metade da outra: raiz de 100 − 36 = 8; a diagonal inteira mede 16 cm.",
          {
            feedback: [
              "8 cm é só a metade da diagonal.",
              "14 cm não confere: a metade seria 7, e 6² + 7² = 85, diferente de 10² = 100.",
            ],
          },
        ),
        n(
          "trapezio-retangulo",
          "Um trapézio retângulo tem bases 10 e 16 e o lado inclinado mede 10. Qual é a altura do trapézio?",
          8,
          "A diferença das bases é 6; a altura é a raiz de 100 − 36 = 64, ou seja, 8.",
          { misreads: [{ value: 6, feedback: "6 é a diferença das bases, não a altura." }] },
        ),
        c(
          "diagonal-do-cubo",
          "Um cubo tem aresta 3. A diagonal de uma face mede:",
          "√18, aproximadamente 4,24",
          ["6", "√27, aproximadamente 5,20"],
          "A diagonal da face é a raiz de 9 + 9 = 18.",
          {
            feedback: [
              "6 soma duas arestas.",
              "√27 é a diagonal do cubo, que atravessa o interior.",
            ],
          },
        ),
        n(
          "altura-do-isosceles",
          "Um triângulo isósceles tem base 30 e altura 8. Quanto mede cada um dos lados iguais?",
          17,
          "Metade da base é 15: 15² + 8² = 289, e a raiz de 289 é 17.",
          { misreads: [{ value: 23, feedback: "Somou metade da base com a altura." }] },
        ),
        c(
          "diagonal-do-retangulo",
          "Uma tela retangular mede 80 cm por 60 cm. A diagonal dela mede:",
          "100 cm",
          ["140 cm", "70 cm"],
          "6.400 + 3.600 = 10.000, e a raiz de 10.000 é 100.",
          {
            feedback: ["140 cm soma os lados.", "70 cm é a média dos lados."],
          },
        ),
      ],
    },
    {
      title: "Áreas com Pitágoras",
      objective: "Calcular áreas em que a altura precisa ser descoberta pelo teorema.",
      introduction:
        "Quase sempre falta uma altura. Ache o triângulo retângulo que a contém, calcule-a e só então use a fórmula da área.",
      specs: [
        n(
          "area-com-altura-descoberta",
          "Um triângulo tem lados 10, 10 e 12. Qual é a sua área?",
          48,
          "A altura sobre a base 12 é a raiz de 100 − 36 = 8; área 12 × 8 ÷ 2 = 48.",
          { misreads: [{ value: 60, feedback: "Usou o lado 10 como altura." }] },
        ),
        c(
          "area-do-trapezio",
          "Um trapézio isósceles tem bases 8 e 14 e lados iguais a 5. Sua área é:",
          44,
          [55, 35],
          "A diferença das bases é 6, metade 3; altura raiz de 25 − 9 = 4; área (8 + 14) × 4 ÷ 2 = 44.",
          {
            feedback: [
              "55 usa o lado 5 como altura.",
              "35 esquece de somar as bases: usou 14 × 5 ÷ 2.",
            ],
          },
        ),
        n(
          "area-com-altura-descoberta",
          "Um triângulo retângulo tem hipotenusa 17 e um cateto 8. Qual é a sua área?",
          60,
          "O outro cateto é a raiz de 289 − 64 = 225, ou seja, 15; área 8 × 15 ÷ 2 = 60.",
          { misreads: [{ value: 68, feedback: "Usou a hipotenusa como cateto: 17 × 8 ÷ 2." }] },
        ),
        c(
          "diagonal-do-quadrado",
          "Um quadrado tem diagonal de 10 cm. Sua área é:",
          "50 cm²",
          ["100 cm²", "25 cm²"],
          "Se o lado é L, 2L² = 100, então L² = 50 cm².",
          {
            feedback: [
              "100 cm² usa a diagonal como se fosse o lado.",
              "25 cm² usa metade da diagonal como lado.",
            ],
          },
        ),
        n(
          "losango-e-diagonais",
          "Um losango tem lado 13 e uma diagonal de 24. Qual é a sua área?",
          120,
          "Metade da outra diagonal: raiz de 169 − 144 = 5; diagonal 10; área 24 × 10 ÷ 2 = 120.",
          {
            misreads: [
              {
                value: 156,
                feedback: "Multiplicou o lado pela metade da diagonal, como em um retângulo.",
              },
            ],
          },
        ),
        c(
          "altura-do-equilatero",
          "Um triângulo equilátero de lado 2 tem área:",
          "√3, aproximadamente 1,73",
          ["2", "√3 ÷ 2, aproximadamente 0,87"],
          "A altura é a raiz de 4 − 1 = √3; área 2 × √3 ÷ 2 = √3.",
          {
            feedback: [
              "2 usa lado × lado ÷ 2, como se o triângulo fosse retângulo.",
              "√3 ÷ 2 é a altura de um triângulo equilátero de lado 1, não a área deste.",
            ],
          },
        ),
        n(
          "area-com-altura-descoberta",
          "Um paralelogramo tem base 20 e lado 13, e a projeção desse lado sobre a base mede 5. Qual é a sua área?",
          240,
          "A altura é a raiz de 169 − 25 = 144, ou seja, 12; área 20 × 12 = 240.",
          {
            misreads: [
              {
                value: 260,
                feedback: "Multiplicou a base pelo lado inclinado, e não pela altura.",
              },
            ],
          },
        ),
        c(
          "area-com-altura-descoberta",
          "Um triângulo tem lados 13, 14 e 15. A altura sobre o lado 14 o divide em segmentos de 5 e 9. A área do triângulo é:",
          84,
          [91, 105],
          "A altura é a raiz de 169 − 25 = 144, ou seja, 12; área 14 × 12 ÷ 2 = 84.",
          {
            feedback: ["91 usa o lado 13 como altura.", "105 usa o lado 15 como altura."],
          },
        ),
      ],
    },
    {
      title: "Pitágoras para argumentar",
      objective: "Classificar triângulos, medir distâncias e resolver problemas em várias etapas.",
      introduction:
        "A relação também funciona ao contrário: se a soma dos quadrados dos dois menores lados é o quadrado do maior, o ângulo é reto; se é menor, o ângulo é obtuso; se é maior, agudo.",
      estimatedMinutes: 18,
      specs: [
        c(
          "classificar-triangulo",
          "Um triângulo tem lados 7, 8 e 12. Ele é:",
          "Obtusângulo, pois 7² + 8² < 12²",
          ["Retângulo, pois 7 + 8 > 12", "Acutângulo, pois todos os lados são diferentes"],
          "49 + 64 = 113, menor que 144: o ângulo oposto ao 12 é obtuso.",
          {
            feedback: [
              "7 + 8 > 12 só garante que o triângulo existe.",
              "Lados diferentes dizem que ele é escaleno, não que os ângulos são agudos.",
            ],
          },
        ),
        n(
          "distancia-no-plano",
          "Qual é a distância entre os pontos (1, 2) e (7, 10) no plano cartesiano?",
          10,
          "As diferenças são 6 e 8: raiz de 36 + 64 = 10.",
          { misreads: [{ value: 14, feedback: "Somou as diferenças horizontal e vertical." }] },
        ),
        c(
          "diagonal-da-caixa",
          "Uma caixa mede 3 por 4 por 12. O maior segmento reto que cabe dentro dela mede:",
          13,
          [19, "12,6"],
          "Raiz de 9 + 16 + 144 = raiz de 169 = 13.",
          {
            feedback: [
              "19 soma as três arestas.",
              "12,6 usa só duas das arestas: raiz de 16 + 144.",
            ],
          },
        ),
        n(
          "cabos-e-postes",
          "Um poste de 12 m é sustentado por dois cabos presos no topo e no chão, a 5 m e a 9 m da base, em lados opostos. Qual é a soma dos comprimentos dos cabos, em m?",
          28,
          "Os cabos medem 13 e 15: raiz de 144 + 25 e raiz de 144 + 81. Soma 28 m.",
          {
            misreads: [
              {
                value: 26,
                feedback: "Usou 13 m para os dois cabos, mas o segundo está mais longe da base.",
              },
            ],
          },
        ),
        c(
          "canto-reto",
          "Para conferir se o canto de uma quadra é reto, um pedreiro marca 3 m em um lado e 4 m no outro e mede a distância entre as marcas. O canto é reto se a distância for:",
          "Exatamente 5 m",
          ["Exatamente 7 m", "Menor que 5 m"],
          "3² + 4² = 5²: o triângulo 3, 4, 5 é retângulo.",
          {
            feedback: [
              "7 m é a soma dos lados: nem formaria um triângulo.",
              "Menor que 5 m indica ângulo agudo, não reto.",
            ],
          },
        ),
        n(
          "distancia-no-plano",
          "Um barco navega 15 km para o norte e depois 20 km para o leste. A que distância, em km, ele está do ponto de partida?",
          25,
          "Raiz de 225 + 400 = raiz de 625 = 25 km.",
          {
            misreads: [
              { value: 35, feedback: "Somou os dois trechos; a distância em linha reta é menor." },
            ],
          },
        ),
        c(
          "altura-sobre-a-hipotenusa",
          "Em um triângulo retângulo, a altura relativa à hipotenusa a divide em segmentos de 4 e 9. A altura mede:",
          6,
          ["6,5", 13],
          "A altura ao quadrado é o produto dos segmentos: 4 × 9 = 36, então a altura é 6.",
          {
            feedback: ["6,5 é a média dos segmentos, não a altura.", "13 é a hipotenusa inteira."],
          },
        ),
        c(
          "reconhecer-terno",
          "Se os lados de um triângulo estão na razão 3 : 4 : 5, então ele é:",
          "Retângulo, seja qual for o tamanho",
          ["Retângulo só quando os lados medem 3, 4 e 5", "Um triângulo equilátero ampliado"],
          "(3k)² + (4k)² = 25k² = (5k)² para qualquer k.",
          {
            feedback: [
              "A relação vale para qualquer múltiplo, pois os quadrados crescem na mesma proporção.",
              "Lados diferentes nunca formam um triângulo equilátero.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize um método para achar uma medida com o teorema de Pitágoras.",
    labels: [
      "Localizar o ângulo reto e nomear catetos e hipotenusa",
      "Escrever a relação a² + b² = c² com as medidas conhecidas",
      "Isolar o quadrado da medida desconhecida e extrair a raiz",
      "Conferir se a hipotenusa ficou maior que os catetos",
    ],
    explanation:
      "Primeiro identificamos quem é quem no triângulo, depois escrevemos a relação; resolvemos e conferimos se as medidas fazem sentido.",
  },
  justification: {
    prompts: [
      "Explique por que a hipotenusa é sempre o maior lado de um triângulo retângulo, usando a relação de Pitágoras.",
      "Um colega diz que um triângulo de lados 6, 8 e 11 é retângulo porque 6 + 8 > 11. Explique o erro e classifique o triângulo.",
      "Mostre como usar o teorema de Pitágoras para calcular a área de um triângulo isósceles de lados 13, 13 e 10, explicando cada passo.",
    ],
    samples: [
      "Como c² = a² + b² e os quadrados são positivos, c² é maior que a² e maior que b². Se c² é maior que a², então c é maior que a; o mesmo vale para b. Logo a hipotenusa supera cada cateto.",
      "A desigualdade 6 + 8 > 11 só garante que o triângulo existe. Para saber se é retângulo, comparamos quadrados: 36 + 64 = 100, e 11² = 121. Como 100 < 121, o ângulo oposto ao lado 11 é obtuso: o triângulo é obtusângulo.",
      "A altura sobre a base 10 divide o triângulo em dois triângulos retângulos com hipotenusa 13 e cateto 5. A altura é a raiz de 169 − 25 = 144, ou seja, 12. A área é base × altura ÷ 2 = 10 × 12 ÷ 2 = 60.",
    ],
    focus: "a relação entre os quadrados dos lados do triângulo retângulo",
  },
  reserved: (seed, variant) => {
    const ternos: [number, number, number][] = [
      [3, 4, 5],
      [5, 12, 13],
      [8, 15, 17],
      [7, 24, 25],
      [20, 21, 29],
    ];
    const [a0, b0, c0] = ternos[seed % 5] ?? [3, 4, 5];
    const k = 1 + (seed % 3);
    const [a, b, hip] = [a0 * k, b0 * k, c0 * k];
    if (variant === 0)
      return c(
        "cerca-do-terceiro-lado",
        `Um terreno triangular tem um ângulo reto entre os lados de ${a} m e ${b} m. Quantos metros de cerca são necessários para fechar o terceiro lado?`,
        `${hip} m`,
        [`${a + b} m`, `${hip + k} m`],
        `${a}² + ${b}² = ${a * a + b * b} = ${hip}²; o terceiro lado mede ${hip} m.`,
        {
          feedback: [
            "Somou os dois lados; o terceiro lado é menor que essa soma.",
            "Não confere: o quadrado desse valor não é a soma dos quadrados dos outros dois.",
          ],
        },
      );
    if (variant === 1)
      return c(
        "pe-da-escada",
        `Uma escada de ${c0} m encosta em um muro a ${b0} m do chão. A que distância do muro está o pé da escada?`,
        `${a0} m`,
        [`${c0 - b0} m`, `${a0 + 1} m`],
        `${c0}² − ${b0}² = ${c0 * c0 - b0 * b0} = ${a0}²; o pé está a ${a0} m do muro.`,
        {
          feedback: [
            "Subtraiu os comprimentos sem elevar ao quadrado.",
            "Não confere: a soma dos quadrados dos catetos deve dar o quadrado da escada.",
          ],
        },
      );
    return c(
      "area-do-isosceles",
      `Um triângulo isósceles tem dois lados de ${hip} cm e base de ${2 * a} cm. Qual é a sua área?`,
      `${a * b} cm²`,
      [`${a * hip} cm²`, `${2 * a * b} cm²`],
      `A altura sobre a base é a raiz de ${hip}² − ${a}² = ${b * b}, ou seja, ${b}; área ${2 * a} × ${b} ÷ 2 = ${a * b} cm².`,
      {
        feedback: [
          "Usou o lado inclinado como altura.",
          "Esqueceu de dividir base × altura por 2.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "pitagoras",
    title: "O esquadro de barbante",
    prompt:
      "Com um barbante de 12 nós igualmente espaçados, monte um triângulo de lados 3, 4 e 5 e use-o para conferir se um canto da casa é reto. Depois investigue outros trios de números que dão ângulo reto.",
    lab: "grid",
    steps: [
      "Descreva como montou o triângulo e o que observou ao encaixá-lo em dois cantos diferentes.",
      "Explique, com a relação de Pitágoras, por que o triângulo 3, 4, 5 tem um ângulo reto.",
      "Encontre outro trio de números inteiros que também dá ângulo reto e um trio que não dá, mostrando as contas.",
    ],
    rubric: [
      "Montagem descrita e testada em dois cantos (0–2)",
      "Relação de Pitágoras usada corretamente na explicação (0–3)",
      "Um trio válido e um inválido com as contas (0–2)",
      "Registro claro, com desenho ou foto descrita (0–1)",
    ],
  },
  homeSupport: [
    "Diante de uma porta ou de um quadro retangular, pergunte como saber se ele está bem esquadrejado usando só uma fita métrica e as diagonais.",
    "Em um passeio, escolham dois pontos e conversem sobre a diferença entre o caminho pelas ruas e a distância em linha reta.",
  ],
};
