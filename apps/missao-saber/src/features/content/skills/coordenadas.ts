import { c, n, type SkillPack } from "../skill-factory";

/**
 * Plano cartesiano: localizar pontos, ler deslocamentos, calcular distâncias
 * e áreas de figuras com vértices na malha, e reconhecer simetrias e
 * translações por coordenadas. Trilha Canguru C.
 */
export const coordenadas: SkillPack = {
  id: "coordenadas",
  name: "Plano cartesiano",
  domain: "canguru",
  lab: "grid",
  missions: [
    {
      title: "Endereço de um ponto",
      objective: "Localizar pontos por coordenadas e reconhecer os quadrantes.",
      introduction:
        "Um ponto tem dois números: primeiro quanto anda na horizontal (x), depois quanto sobe ou desce (y). A ordem importa: (2, 5) e (5, 2) são lugares diferentes.",
      specs: [
        c(
          "ler-coordenadas",
          "Partindo da origem, andamos 3 unidades para a direita e 4 para baixo. As coordenadas do ponto de chegada são:",
          "(3, −4)",
          ["(−4, 3)", "(3, 4)"],
          "Direita aumenta x; para baixo, y fica negativo: (3, −4).",
          {
            feedback: ["Trocou a ordem: x vem primeiro.", "Para baixo o y é negativo."],
          },
        ),
        n(
          "ler-coordenadas",
          "O ponto (−5, 2) está a quantas unidades do eixo y?",
          5,
          "A distância até o eixo y é o valor absoluto de x: 5.",
          { misreads: [{ value: 2, feedback: "2 é a distância até o eixo x." }] },
        ),
        c(
          "quadrantes",
          "Em que quadrante está o ponto (−3, −7)?",
          "Terceiro",
          ["Segundo", "Quarto"],
          "x negativo e y negativo: terceiro quadrante.",
          {
            feedback: ["No segundo quadrante, y é positivo.", "No quarto quadrante, x é positivo."],
          },
        ),
        n(
          "ler-coordenadas",
          "Um ponto está no eixo x, a 6 unidades à esquerda da origem. Qual é a sua coordenada y?",
          0,
          "Todo ponto do eixo x tem y = 0; o ponto é (−6, 0).",
          { misreads: [{ value: -6, feedback: "−6 é a coordenada x, não a y." }] },
        ),
        c(
          "quadrantes",
          "Um ponto tem x positivo e y negativo. Ele está:",
          "No quarto quadrante",
          ["No primeiro quadrante", "No segundo quadrante"],
          "Direita e abaixo da origem: quarto quadrante.",
          {
            feedback: [
              "No primeiro quadrante os dois são positivos.",
              "No segundo quadrante, x é negativo e y positivo.",
            ],
          },
        ),
        n(
          "deslocamento",
          "Saindo de (2, 3) e chegando em (2, 11), quantas unidades o ponto subiu?",
          8,
          "O x não mudou; y foi de 3 a 11: 11 − 3 = 8.",
          { misreads: [{ value: 14, feedback: "Somou as coordenadas y em vez de subtrair." }] },
        ),
        c(
          "ler-coordenadas",
          "Os pontos (4, 1), (4, 5) e (4, 9) estão:",
          "Em uma mesma reta vertical",
          ["Em uma mesma reta horizontal", "Em uma diagonal"],
          "Os três têm x = 4: alinhados na vertical.",
          {
            feedback: [
              "Reta horizontal exigiria o mesmo y.",
              "Na diagonal, x e y mudariam juntos.",
            ],
          },
        ),
        c(
          "ponto-medio",
          "O ponto médio do segmento que liga (2, 4) a (8, 10) é:",
          "(5, 7)",
          ["(6, 6)", "(10, 14)"],
          "Média das coordenadas: ((2 + 8) ÷ 2, (4 + 10) ÷ 2) = (5, 7).",
          {
            feedback: [
              "(6, 6) usa as diferenças, não as médias.",
              "(10, 14) soma sem dividir por 2.",
            ],
          },
        ),
      ],
    },
    {
      title: "Andar pela malha",
      objective: "Calcular deslocamentos, distâncias horizontais e verticais e caminhos na malha.",
      introduction:
        "Entre dois pontos, a diferença dos x diz quanto andar na horizontal e a diferença dos y, na vertical. Caminhos pela malha somam essas duas distâncias.",
      specs: [
        n(
          "deslocamento",
          "Para ir de (−3, 2) a (5, 2) andando pela malha, quantas unidades são percorridas?",
          8,
          "Mesmo y; em x, de −3 a 5 são 8 unidades.",
          { misreads: [{ value: 2, feedback: "Subtraiu 5 − 3 esquecendo o sinal do −3." }] },
        ),
        c(
          "deslocamento",
          "Um robô sai de (1, 1), anda 4 para a direita, 3 para cima e 6 para a esquerda. Onde ele para?",
          "(−1, 4)",
          ["(11, 4)", "(−1, −2)"],
          "x: 1 + 4 − 6 = −1; y: 1 + 3 = 4.",
          {
            feedback: [
              "(11, 4) somou os 6 em vez de subtrair (esquerda diminui x).",
              "(−1, −2) desceu 3 em vez de subir.",
            ],
          },
        ),
        n(
          "caminho-na-malha",
          "Andando só pelas linhas da malha, qual é o menor comprimento de um caminho de (0, 0) a (4, 3)?",
          7,
          "4 na horizontal e 3 na vertical, em qualquer ordem: 7.",
          {
            misreads: [
              { value: 5, feedback: "5 é a distância em linha reta, mas o caminho segue a malha." },
            ],
          },
        ),
        c(
          "deslocamento",
          "A translação que leva (2, 5) para (7, 3) leva (0, 0) para:",
          "(5, −2)",
          ["(−5, 2)", "(9, 8)"],
          "O deslocamento é (+5, −2), aplicado a qualquer ponto.",
          {
            feedback: [
              "(−5, 2) é o deslocamento contrário.",
              "(9, 8) soma os dois pontos, o que não é uma translação.",
            ],
          },
        ),
        n(
          "deslocamento",
          "Um quadrado tem vértices (1, 1), (5, 1), (5, 5) e (1, 5). Qual é o seu perímetro?",
          16,
          "Cada lado mede 4: 4 × 4 = 16.",
          { misreads: [{ value: 20, feedback: "Usou lado 5, mas de 1 a 5 são 4 unidades." }] },
        ),
        c(
          "caminho-na-malha",
          "Quantos caminhos de comprimento mínimo pela malha existem de (0, 0) a (2, 2)?",
          6,
          [4, 8],
          "São 4 passos, 2 para a direita e 2 para cima; escolher quais 2 são para cima: 6 caminhos.",
          {
            feedback: [
              "4 é o comprimento do caminho, não o número de caminhos.",
              "8 conta caminhos que não têm comprimento mínimo.",
            ],
          },
        ),
        n(
          "deslocamento",
          "O ponto (a, 7) está a 10 unidades do ponto (3, 7), à direita dele. Qual é o valor de a?",
          13,
          "Mesmo y; a = 3 + 10 = 13.",
          { misreads: [{ value: -7, feedback: "−7 está a 10 unidades, mas à esquerda." }] },
        ),
        c(
          "deslocamento",
          "Um retângulo tem vértices (−2, 1), (4, 1) e (4, 4). O quarto vértice é:",
          "(−2, 4)",
          ["(−2, −4)", "(4, −2)"],
          "O lado oposto ao que vai de (−2, 1) a (4, 1) fica em y = 4, começando em x = −2.",
          {
            feedback: [
              "(−2, −4) desce em vez de subir até y = 4.",
              "(4, −2) repete x = 4 e não fecha o retângulo.",
            ],
          },
        ),
      ],
    },
    {
      title: "Distâncias e áreas na malha",
      objective: "Calcular distâncias entre pontos e áreas de figuras com vértices na malha.",
      introduction:
        "A distância em linha reta entre dois pontos vem de um triângulo retângulo com catetos nas diferenças de x e de y. Para áreas, recorte a figura em retângulos e triângulos ou complete um retângulo em volta dela.",
      specs: [
        n(
          "distancia",
          "Qual é a distância entre os pontos (1, 1) e (4, 5)?",
          5,
          "Diferenças 3 e 4: raiz de 9 + 16 = 5.",
          {
            misreads: [
              {
                value: 7,
                feedback: "Somou as diferenças; a distância em linha reta usa Pitágoras.",
              },
            ],
          },
        ),
        c(
          "area-na-malha",
          "Um triângulo tem vértices (0, 0), (6, 0) e (0, 4). Sua área é:",
          12,
          [24, 10],
          "Base 6 sobre o eixo x e altura 4: 6 × 4 ÷ 2 = 12.",
          {
            feedback: ["24 esquece de dividir por 2.", "10 soma base e altura."],
          },
        ),
        n(
          "distancia",
          "A distância entre (−2, 3) e (4, 11) é:",
          10,
          "Diferenças 6 e 8: raiz de 36 + 64 = 10.",
          { misreads: [{ value: 14, feedback: "Somou as diferenças 6 e 8." }] },
        ),
        c(
          "area-na-malha",
          "O retângulo de vértices (1, 2), (7, 2), (7, 6) e (1, 6) tem área:",
          24,
          [20, 42],
          "Lados 6 e 4: 6 × 4 = 24.",
          {
            feedback: ["20 é o perímetro.", "42 multiplicou as coordenadas 7 e 6 do vértice."],
          },
        ),
        n(
          "area-na-malha",
          "Um triângulo tem vértices (0, 0), (4, 0) e (2, 5). Qual é a sua área?",
          10,
          "Base 4 sobre o eixo x e altura 5 (o y do terceiro vértice): 4 × 5 ÷ 2 = 10.",
          { misreads: [{ value: 20, feedback: "Esqueceu de dividir base × altura por 2." }] },
        ),
        c(
          "area-na-malha",
          "Para calcular a área do triângulo de vértices (0, 0), (5, 1) e (2, 4), uma estratégia correta é:",
          "Tirar do retângulo 5 × 4 os três triângulos em volta",
          [
            "Multiplicar 5 por 4 e dividir por 2",
            "Somar as áreas dos três triângulos em volta dele",
          ],
          "Desenhe o retângulo 5 × 4 em volta: ele tem área 20; os três triângulos retângulos de fora têm áreas 2,5, 4,5 e 4; sobra 20 − 11 = 9.",
          {
            feedback: [
              "5 × 4 ÷ 2 = 10 seria a área se a base e a altura fossem 5 e 4, mas o triângulo é inclinado.",
              "Os três triângulos ficam fora do triângulo pedido: somados dão 11, a parte do retângulo que sobra. É preciso tirá-los dos 20 do retângulo.",
            ],
          },
        ),
        n(
          "distancia",
          "Um círculo tem centro (2, 3) e passa pelo ponto (5, 7). Qual é o seu raio?",
          5,
          "O raio é a distância do centro ao ponto: diferenças 3 e 4, raiz de 25 = 5.",
          {
            misreads: [
              { value: 12, feedback: "Multiplicou as diferenças 3 e 4 em vez de usar Pitágoras." },
            ],
          },
        ),
        c(
          "area-na-malha",
          "Um paralelogramo tem vértices (0, 0), (5, 0), (7, 3) e (2, 3). Sua área é:",
          15,
          [21, "7,5"],
          "Base 5 (de 0 a 5 no eixo x) e altura 3 (o y do lado de cima): 5 × 3 = 15.",
          {
            feedback: [
              "21 usa 7 como base, mas a base é 5.",
              "7,5 divide por 2 como se fosse um triângulo.",
            ],
          },
        ),
      ],
    },
    {
      title: "Simetria e reflexão por coordenadas",
      objective: "Refletir pontos nos eixos e na origem e reconhecer figuras simétricas.",
      introduction:
        "Refletir no eixo x troca o sinal de y; refletir no eixo y troca o sinal de x; refletir na origem troca os dois. Girar 90° em torno da origem troca as coordenadas e um sinal.",
      specs: [
        c(
          "reflexao",
          "O simétrico do ponto (3, −2) em relação ao eixo x é:",
          "(3, 2)",
          ["(−3, −2)", "(−3, 2)"],
          "A reflexão no eixo x mantém x e troca o sinal de y.",
          {
            feedback: ["(−3, −2) é a reflexão no eixo y.", "(−3, 2) é a reflexão na origem."],
          },
        ),
        n(
          "reflexao",
          "O simétrico de (−4, 6) em relação ao eixo y tem que coordenada x?",
          4,
          "A reflexão no eixo y troca o sinal de x: (4, 6).",
          {
            misreads: [
              { value: -6, feedback: "−6 seria trocar o sinal de y, a reflexão no eixo x." },
            ],
          },
        ),
        c(
          "reflexao",
          "Refletindo o ponto (5, 1) na origem, obtemos:",
          "(−5, −1)",
          ["(1, 5)", "(−1, −5)"],
          "A reflexão na origem troca os dois sinais.",
          {
            feedback: [
              "(1, 5) troca as coordenadas, o que é uma reflexão na reta y = x.",
              "(−1, −5) troca coordenadas e sinais ao mesmo tempo.",
            ],
          },
        ),
        n(
          "reflexao",
          "Um triângulo tem vértices (1, 2), (4, 2) e (4, 6). Refletido no eixo y, a soma das coordenadas x dos novos vértices é:",
          -9,
          "Os x viram −1, −4 e −4: soma −9.",
          {
            misreads: [
              { value: 9, feedback: "Esqueceu de trocar o sinal dos x na reflexão no eixo y." },
            ],
          },
        ),
        c(
          "rotacao",
          "Girando o ponto (2, 0) em 90° no sentido anti-horário em torno da origem, ele vai para:",
          "(0, 2)",
          ["(0, −2)", "(−2, 0)"],
          "Um quarto de volta anti-horário leva o eixo x positivo ao eixo y positivo.",
          {
            feedback: ["(0, −2) é o giro de 90° no sentido horário.", "(−2, 0) é o giro de 180°."],
          },
        ),
        n(
          "reflexao",
          "O ponto (a, 3) é o simétrico de (7, 3) em relação à reta vertical x = 2. Qual é o valor de a?",
          -3,
          "7 está 5 unidades à direita de x = 2; o simétrico fica 5 à esquerda: 2 − 5 = −3.",
          {
            misreads: [
              { value: -7, feedback: "−7 seria a reflexão no eixo y, não na reta x = 2." },
            ],
          },
        ),
        c(
          "reflexao",
          "Qual figura tem o eixo y como eixo de simetria?",
          "O triângulo de vértices (−3, 0), (3, 0) e (0, 4)",
          [
            "O triângulo de vértices (0, 0), (4, 0) e (0, 3)",
            "O quadrado de vértices (1, 1), (5, 1), (5, 5) e (1, 5)",
          ],
          "Trocando o sinal de x, (−3, 0) e (3, 0) trocam de lugar e (0, 4) fica parado: a figura coincide consigo mesma.",
          {
            feedback: [
              "Refletindo no eixo y, (4, 0) iria para (−4, 0), que não é vértice.",
              "O quadrado está todo à direita do eixo y; seu reflexo fica à esquerda.",
            ],
          },
        ),
        c(
          "rotacao",
          "Girando (3, 4) em 180° em torno da origem, obtemos:",
          "(−3, −4)",
          ["(4, 3)", "(−4, 3)"],
          "Meia-volta troca os dois sinais.",
          {
            feedback: [
              "(4, 3) troca as coordenadas, o que não é um giro de 180°.",
              "(−4, 3) é o giro de 90° anti-horário.",
            ],
          },
        ),
      ],
    },
    {
      title: "Coordenadas para argumentar",
      objective:
        "Resolver problemas de várias etapas combinando distâncias, áreas e transformações.",
      introduction:
        "Coordenadas transformam geometria em conta: alinhamento vira diferença constante, distância vira Pitágoras e área vira recorte. Faça um esboço antes de calcular.",
      estimatedMinutes: 18,
      specs: [
        c(
          "alinhamento",
          "Os pontos (1, 2), (3, 6) e (5, 10) estão alinhados?",
          "Sim: x sobe 2 e y sobe 4 a cada passo",
          [
            "Não, porque as coordenadas são todas diferentes",
            "Sim, porque todos têm y maior que x",
          ],
          "De um ponto para o outro, x aumenta 2 e y aumenta 4, sempre na mesma proporção: a inclinação entre pares consecutivos é 4 ÷ 2 = 2 nos dois trechos; a reta é y = 2x.",
          {
            feedback: [
              "Coordenadas diferentes não impedem alinhamento.",
              "Ter y maior que x não garante estar na mesma reta.",
            ],
          },
        ),
        n(
          "distancia",
          "Um triângulo tem vértices (0, 0), (6, 0) e (6, 8). Qual é o seu perímetro?",
          24,
          "Lados 6, 8 e a hipotenusa 10: 6 + 8 + 10 = 24.",
          { misreads: [{ value: 14, feedback: "Somou só os catetos e esqueceu a hipotenusa." }] },
        ),
        c(
          "area-na-malha",
          "Um quadrado tem dois vértices consecutivos em (1, 1) e (4, 5). Sua área é:",
          25,
          [12, 16],
          "O lado é a distância entre os vértices: raiz de 9 + 16 = 5; área 25.",
          {
            feedback: ["12 multiplica as diferenças 3 e 4.", "16 usa a diferença 4 como lado."],
          },
        ),
        n(
          "ponto-medio",
          "O ponto (5, 8) é o ponto médio do segmento que começa em (2, 3). Qual é a soma das coordenadas da outra extremidade?",
          21,
          "A outra extremidade é (8, 13), pois 5 = (2 + x) ÷ 2 e 8 = (3 + y) ÷ 2; soma 21.",
          { misreads: [{ value: 13, feedback: "13 é só a coordenada y da extremidade." }] },
        ),
        c(
          "reflexao",
          "Refletindo o triângulo de vértices (1, 1), (4, 1) e (1, 5) no eixo x e depois no eixo y, o vértice (4, 1) termina em:",
          "(−4, −1)",
          ["(4, −1)", "(−4, 1)"],
          "Primeira reflexão: (4, −1); segunda: (−4, −1). Duas reflexões nos eixos equivalem a um giro de 180°.",
          {
            feedback: [
              "(4, −1) é só a primeira reflexão.",
              "(−4, 1) seria só a reflexão no eixo y.",
            ],
          },
        ),
        n(
          "area-na-malha",
          "Um losango tem vértices (0, 3), (4, 0), (0, −3) e (−4, 0). Qual é a sua área?",
          24,
          "As diagonais medem 8 (no eixo x) e 6 (no eixo y): 8 × 6 ÷ 2 = 24.",
          {
            misreads: [
              { value: 48, feedback: "Esqueceu de dividir o produto das diagonais por 2." },
            ],
          },
        ),
        c(
          "distancia",
          "Qual ponto está mais perto da origem?",
          "(3, 4)",
          ["(0, 6)", "(5, 5)"],
          "Distâncias: 5, 6 e raiz de 50 (cerca de 7,1).",
          {
            feedback: [
              "(0, 6) está a 6 unidades, mais longe que 5.",
              "(5, 5) está a raiz de 50, cerca de 7,1.",
            ],
          },
        ),
        c(
          "alinhamento",
          "Para que os pontos (0, 1), (2, 5) e (k, 9) estejam alinhados, k deve ser:",
          4,
          [3, 6],
          "De (0, 1) a (2, 5), x sobe 2 quando y sobe 4; para y subir mais 4, x sobe mais 2: k = 4.",
          {
            feedback: [
              "Com k = 3, o segundo trecho teria inclinação 4, diferente de 2.",
              "Com k = 6, a inclinação do segundo trecho seria 1.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize um método para calcular a distância entre dois pontos do plano.",
    labels: [
      "Anotar as coordenadas dos dois pontos na ordem (x, y)",
      "Calcular as diferenças em x e em y",
      "Somar os quadrados das diferenças e extrair a raiz",
      "Conferir com um esboço se a distância é maior que cada diferença",
    ],
    explanation:
      "Coordenadas primeiro, diferenças depois; Pitágoras dá a distância, e o esboço confirma o resultado.",
  },
  justification: {
    prompts: [
      "Explique por que a reflexão de um ponto no eixo x troca o sinal de y e mantém x, usando um desenho descrito em palavras.",
      "Um colega diz que a distância entre (1, 1) e (4, 5) é 7 porque 3 + 4 = 7. Explique o erro e dê a distância correta.",
      "Mostre como decidir se três pontos estão alinhados usando só as coordenadas, com um exemplo em que estão e um em que não estão.",
    ],
    samples: [
      "O eixo x é como um espelho horizontal. Um ponto a 3 unidades acima dele tem seu reflexo a 3 unidades abaixo, na mesma posição horizontal. Por isso x não muda e y troca de sinal: (2, 3) vai para (2, −3).",
      "3 e 4 são os catetos de um triângulo retângulo cuja hipotenusa é o segmento entre os pontos. A distância é a hipotenusa, raiz de 9 + 16 = 5, e não a soma dos catetos, que seria o caminho pela malha.",
      "Três pontos estão alinhados quando a variação de y dividida pela variação de x é a mesma entre qualquer par. (1, 2), (3, 6) e (5, 10): 4 ÷ 2 = 2 nos dois trechos, alinhados. (1, 2), (3, 6) e (5, 9): 4 ÷ 2 = 2 e 3 ÷ 2 = 1,5, não alinhados.",
    ],
    focus: "a leitura das coordenadas como deslocamentos horizontal e vertical",
  },
  reserved: (seed, variant) => {
    /* Coordenadas negativas com o sinal de menos tipográfico, como nos itens fixos. */
    const f = (value: number) => String(value).replace("-", "−");
    if (variant === 0) {
      const x0 = -6 + (seed % 13);
      const y0 = -4 + (seed % 9);
      const dx = 3 + (seed % 5);
      const dy = 2 + (seed % 7);
      return c(
        "chegada-apos-deslocamento",
        `Um ponto parte de (${f(x0)}, ${f(y0)}), anda ${dx} unidades para a direita e depois ${dy} unidades para baixo. Onde ele para?`,
        `(${f(x0 + dx)}, ${f(y0 - dy)})`,
        [`(${f(x0 + dx)}, ${f(y0 + dy)})`, `(${f(x0 - dx)}, ${f(y0 - dy)})`],
        `x: ${f(x0)} + ${dx} = ${f(x0 + dx)}; y: ${f(y0)} − ${dy} = ${f(y0 - dy)}.`,
        {
          feedback: [
            "Subiu em vez de descer: para baixo o y diminui.",
            "Andou para a esquerda em vez de para a direita.",
          ],
        },
      );
    }
    if (variant === 1) {
      const ternos: [number, number, number][] = [
        [3, 4, 5],
        [6, 8, 10],
        [5, 12, 13],
        [9, 12, 15],
        [8, 15, 17],
      ];
      const [a, b, d] = ternos[seed % 5] ?? [3, 4, 5];
      const x0 = -3 + (seed % 7);
      const y0 = -2 + (seed % 5);
      return c(
        "distancia-entre-pontos",
        `Qual é a distância entre os pontos (${f(x0)}, ${f(y0)}) e (${f(x0 + a)}, ${f(y0 + b)})?`,
        d,
        [a + b, d + 1],
        `As diferenças são ${a} e ${b}: raiz de ${a * a} + ${b * b} = ${d}.`,
        {
          feedback: [
            "Somou as diferenças; a distância em linha reta usa Pitágoras.",
            "Não confere: o quadrado desse valor não é a soma dos quadrados das diferenças.",
          ],
        },
      );
    }
    const base = 3 + (seed % 6);
    const altura = 2 * (1 + (Math.floor(seed / 6) % 3));
    const x0 = -2 + (seed % 5);
    const area = (base * altura) / 2;
    return c(
      "area-de-triangulo-na-malha",
      `Um triângulo tem vértices (${f(x0)}, 0), (${f(x0 + base)}, 0) e (${f(x0 + 1)}, ${altura}). Qual é a sua área, em unidades de área?`,
      area,
      [base * altura, area + 1],
      `A base sobre o eixo x mede ${base} e a altura é ${altura}: ${base} × ${altura} ÷ 2 = ${area}.`,
      {
        feedback: [
          "Esqueceu de dividir base × altura por 2.",
          "Não confere: base × altura ÷ 2 dá outro valor.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "coordenadas",
    title: "O mapa do tesouro em coordenadas",
    prompt:
      "Desenhe uma malha sobre a planta de um cômodo ou do quintal, marque três objetos com coordenadas e escreva pistas só com deslocamentos e distâncias para alguém encontrar um 'tesouro'. Depois teste com outra pessoa.",
    lab: "grid",
    steps: [
      "Defina a origem e a unidade e registre as coordenadas dos três objetos.",
      "Escreva pistas que usem deslocamento (direita, cima) e ao menos uma distância em linha reta calculada por Pitágoras.",
      "Peça a alguém que siga as pistas; registre onde errou e o que na pista causou o erro.",
    ],
    rubric: [
      "Origem, unidade e coordenadas registradas com clareza (0–2)",
      "Pistas com deslocamentos corretos e uma distância bem calculada (0–3)",
      "Teste com outra pessoa e análise dos erros (0–2)",
      "Mapa que outra pessoa consegue reproduzir (0–1)",
    ],
  },
  homeSupport: [
    "Em um mapa de papel ou na planta de um prédio, escolham duas salas e conversem sobre como descrever o caminho só com 'direita, esquerda, quantos passos'.",
    "Numa mesa quadriculada ou piso de ladrilhos, combinem uma origem e peçam para dizer as coordenadas de um objeto e a distância em linha reta até outro.",
  ],
};
