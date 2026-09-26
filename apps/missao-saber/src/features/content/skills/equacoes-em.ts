import { c, n, type SkillPack, sobrescrito } from "../skill-factory";

/**
 * Equações no ensino médio: equações de 2º grau e redutíveis, sistemas,
 * equações com módulo e raízes, exponenciais e logaritmos simples, e
 * inequações. Trilha Canguru S.
 */
export const equacoesEm: SkillPack = {
  id: "equacoes-em",
  name: "Equações e inequações",
  domain: "canguru",
  lab: null,
  missions: [
    {
      title: "Segundo grau e além",
      objective: "Resolver equações de 2º grau e equações redutíveis a elas por substituição.",
      free: true,
      introduction:
        "Uma equação de 2º grau se resolve por fatoração, soma e produto ou pela fórmula com o discriminante Δ = b² − 4ac. Equações como x⁴ − 5x² + 4 = 0 viram de 2º grau com a troca y = x².",
      specs: [
        n(
          "segundo-grau",
          "Qual é a maior raiz de x² − 2x − 15 = 0?",
          5,
          "(x − 5)(x + 3) = 0: raízes 5 e −3.",
          {
            misreads: [
              {
                value: 3,
                feedback:
                  "Fatorou com os sinais trocados, (x + 5)(x − 3); o certo é (x − 5)(x + 3).",
              },
            ],
          },
        ),
        c(
          "segundo-grau",
          "Quantas raízes reais tem x⁴ − 5x² + 4 = 0?",
          "4",
          ["2", "1"],
          "y = x²: y² − 5y + 4 = 0 dá y = 1 ou 4; x = ±1 ou ±2.",
          {
            feedback: [
              "2 conta só os valores de y; cada y positivo dá dois x.",
              "Há quatro raízes: ±1 e ±2.",
            ],
          },
        ),
        n(
          "segundo-grau",
          "Para que valor de k a equação x² − 6x + k = 0 tem uma única raiz real (dupla)?",
          9,
          "Δ = 36 − 4k = 0 dá k = 9.",
          { misreads: [{ value: 36, feedback: "36 é b²; o discriminante é 36 − 4k." }] },
        ),
        c(
          "segundo-grau",
          "A equação 2x² + 3x + 5 = 0 tem:",
          "Nenhuma raiz real",
          ["Duas raízes reais distintas", "Uma raiz real dupla"],
          "Δ = 9 − 40 = −31 < 0: não há raiz real.",
          {
            feedback: ["Para duas raízes Δ deveria ser positivo.", "Raiz dupla exige Δ = 0."],
          },
        ),
        n(
          "segundo-grau",
          "Se x + 1/x = 3, qual é o valor de x² + 1/x²?",
          7,
          "(x + 1/x)² − 2 = 9 − 2 = 7.",
          {
            misreads: [
              { value: 9, feedback: "9 é o quadrado de 3; falta subtrair o termo cruzado 2." },
            ],
          },
        ),
        c(
          "segundo-grau",
          "A soma das raízes reais de (x² − 3x)² − 2(x² − 3x) − 8 = 0 é:",
          "6",
          ["3", "−2"],
          "y = x² − 3x: y = 4 ou y = −2. Cada equação x² − 3x − y = 0 tem soma 3 e ambas têm raízes reais: 3 + 3 = 6.",
          {
            feedback: [
              "3 é a soma para um só valor de y.",
              "−2 é um valor de y, não uma soma de raízes.",
            ],
          },
        ),
        n(
          "segundo-grau",
          "Um retângulo tem perímetro 26 e área 40. Qual é o seu lado maior?",
          8,
          "x + y = 13 e xy = 40: raízes de t² − 13t + 40 = 0, que são 5 e 8.",
          { misreads: [{ value: 5, feedback: "5 é o lado menor." }] },
        ),
        c(
          "segundo-grau",
          "Se r e s são raízes de x² − 4x + 1 = 0, então r/s + s/r vale:",
          "14",
          ["16", "4"],
          "(r² + s²)/(rs) = ((r + s)² − 2rs)/rs = (16 − 2)/1 = 14.",
          {
            feedback: ["16 esquece de subtrair 2rs.", "4 é a soma das raízes."],
          },
        ),
      ],
    },
    {
      title: "Sistemas",
      objective: "Resolver sistemas lineares e não lineares e interpretar o número de soluções.",
      free: true,
      introduction:
        "Sistemas se resolvem por substituição ou eliminação. Sistemas não lineares costumam virar uma equação de 2º grau depois da substituição. O número de soluções tem leitura geométrica: interseções de retas, parábolas e circunferências.",
      specs: [
        n(
          "sistemas",
          "No sistema 2x + 3y = 13 e x − y = −1, quanto vale x?",
          2,
          "x = y − 1; 2(y − 1) + 3y = 13 dá y = 3, x = 2.",
          { misreads: [{ value: 3, feedback: "3 é o valor de y." }] },
        ),
        c(
          "sistemas",
          "O sistema x + y = 5 e xy = 6 tem como soluções:",
          "(2, 3) e (3, 2)",
          ["Apenas (2, 3)", "(1, 6) e (6, 1)"],
          "x e y são raízes de t² − 5t + 6 = 0; a ordem gera dois pares.",
          {
            feedback: ["(3, 2) também satisfaz as duas equações.", "1 + 6 = 7, não 5."],
          },
        ),
        n(
          "sistemas",
          "Quantos pontos têm em comum a reta y = x + 1 e a circunferência x² + y² = 25?",
          2,
          "x² + (x + 1)² = 25 dá x² + x − 12 = 0, com Δ > 0: dois pontos, (3, 4) e (−4, −3).",
          {
            misreads: [
              {
                value: 1,
                feedback: "A reta cruza a circunferência em dois pontos, não tangencia.",
              },
            ],
          },
        ),
        c(
          "sistemas",
          "O sistema x + 2y = 3 e 2x + 4y = 7 tem:",
          "Nenhuma solução",
          ["Infinitas soluções", "Uma solução"],
          "A segunda equação dobrada da primeira daria 6, não 7: retas paralelas.",
          {
            feedback: ["Infinitas exigiria 2x + 4y = 6.", "Retas paralelas não se cruzam."],
          },
        ),
        n(
          "sistemas",
          "Três números somam 12; o segundo é o dobro do primeiro e o terceiro é o triplo do primeiro. Qual é o maior?",
          6,
          "a + 2a + 3a = 12 dá a = 2; o maior é 3a = 6.",
          { misreads: [{ value: 2, feedback: "2 é o primeiro número." }] },
        ),
        c(
          "sistemas",
          "Para que valor de k o sistema x + y = 2 e kx + 2y = 4 tem infinitas soluções?",
          "k = 2",
          ["k = 4", "k = 0"],
          "Com k = 2 a segunda é o dobro da primeira.",
          {
            feedback: [
              "Com k = 4 as retas se cruzam num ponto.",
              "Com k = 0 a segunda dá y = 2 e há uma solução.",
            ],
          },
        ),
        n(
          "sistemas",
          "Se x² − y² = 21 e x − y = 3, quanto vale x?",
          5,
          "x + y = 7 e x − y = 3: x = 5, y = 2.",
          { misreads: [{ value: 7, feedback: "7 é x + y." }] },
        ),
        c(
          "sistemas",
          "A parábola y = x² e a reta y = 2x − 1:",
          "São tangentes no ponto (1, 1)",
          ["Se cruzam em dois pontos", "Não se encontram"],
          "x² − 2x + 1 = 0 tem raiz dupla x = 1.",
          {
            feedback: ["Δ = 0 indica um único ponto de contato.", "Há o ponto (1, 1)."],
          },
        ),
      ],
    },
    {
      title: "Módulos e raízes",
      objective: "Resolver equações com módulo e com radicais, conferindo soluções estranhas.",
      introduction:
        "Para b ≥ 0, |x − a| = b significa que x está a distância b de a. Em equações com raiz quadrada, elevar ao quadrado pode criar soluções falsas: toda resposta precisa ser conferida na equação original.",
      specs: [
        n(
          "modulo-raiz",
          "Qual é a soma das soluções de |x − 3| = 5?",
          6,
          "x = 8 ou x = −2; soma 6.",
          { misreads: [{ value: 8, feedback: "8 é uma das soluções; a outra é −2." }] },
        ),
        c(
          "modulo-raiz",
          "A equação √(x + 6) = x tem como solução:",
          "Apenas x = 3",
          ["x = 3 e x = −2", "Apenas x = −2"],
          "Elevando: x + 6 = x², x = 3 ou −2; mas √4 = 2 ≠ −2, então −2 é falsa.",
          {
            feedback: [
              "−2 não satisfaz a original: a raiz não pode ser negativa.",
              "−2 é a solução falsa.",
            ],
          },
        ),
        n("modulo-raiz", "Quantas soluções reais tem |x| = −4?", 0, "Módulo nunca é negativo.", {
          misreads: [{ value: 2, feedback: "|x| = 4 teria duas; com −4 não há nenhuma." }],
        }),
        c(
          "modulo-raiz",
          "O conjunto das soluções de |2x − 1| < 5 é:",
          "−2 < x < 3",
          ["x < 3", "x > −2"],
          "−5 < 2x − 1 < 5 dá −4 < 2x < 6.",
          {
            feedback: ["Falta a restrição inferior.", "Falta a restrição superior."],
          },
        ),
        n(
          "modulo-raiz",
          "Resolva √(2x + 1) = 5.",
          12,
          "2x + 1 = 25 dá x = 12; conferindo, √25 = 5.",
          { misreads: [{ value: 2, feedback: "Elevou só o lado esquerdo; 2x + 1 = 25." }] },
        ),
        c(
          "modulo-raiz",
          "|x − 1| + |x − 5| tem valor mínimo:",
          "4, para qualquer x entre 1 e 5",
          ["0, em x = 3, o ponto médio", "6, o valor em x = 0"],
          "É a soma das distâncias de x a 1 e a 5; entre eles vale sempre 4.",
          {
            feedback: [
              "Em x = 3 as distâncias valem 2 e 2, somando 4; as duas não se anulam ao mesmo tempo, porque x não pode estar em 1 e em 5.",
              "6 é o valor em x = 0, mas não é o menor: em x = 3, por exemplo, a soma vale 2 + 2 = 4.",
            ],
          },
        ),
        n(
          "modulo-raiz",
          "Resolva x − √x − 6 = 0.",
          9,
          "t = √x: t² − t − 6 = 0, t = 3 (t = −2 é descartado); x = 9.",
          { misreads: [{ value: 3, feedback: "3 é √x; x = 9." }] },
        ),
        c(
          "modulo-raiz",
          "Por que é obrigatório conferir as soluções depois de elevar uma equação ao quadrado?",
          "Porque isso pode criar soluções que a original não tem",
          [
            "Porque elevar ao quadrado muda as raízes verdadeiras",
            "Não é obrigatório, se as contas estiverem certas",
          ],
          "a² = b² vale também quando a = −b, então elevar ao quadrado pode introduzir soluções que não satisfazem a original. A operação não é reversível.",
          {
            feedback: [
              "As raízes verdadeiras continuam valendo depois de elevar; o problema são as novas, que surgem de a = −b.",
              "Mesmo com contas perfeitas, elevar ao quadrado pode criar soluções estranhas, como em √(x + 6) = x, que ganha x = −2.",
            ],
          },
        ),
      ],
    },
    {
      title: "Exponenciais e logaritmos",
      objective:
        "Resolver equações exponenciais e logarítmicas simples e usar propriedades dos logaritmos.",
      introduction:
        "Quando os dois lados são potências da mesma base positiva e diferente de 1, iguala-se os expoentes: 2ˣ = 32 dá x = 5. O logaritmo é o expoente: log₂ 32 = 5. Propriedades, para a e b positivos: log(ab) = log a + log b, log(aⁿ) = n log a.",
      specs: [
        n("exp-log", "Resolva 3ˣ⁺¹ = 81.", 3, "81 = 3⁴, então x + 1 = 4.", {
          misreads: [{ value: 4, feedback: "4 é x + 1; x = 3." }],
        }),
        c("exp-log", "log₂ 64 vale:", "6", ["32", "8"], "2⁶ = 64.", {
          feedback: ["32 é 64 ÷ 2.", "8 é √64."],
        }),
        n(
          "exp-log",
          "Resolva 4ˣ = 8. Responda com uma casa decimal.",
          1.5,
          "2²ˣ = 2³ dá x = 3/2.",
          {
            misreads: [
              { value: 2, feedback: "4² = 16, não 8; escreva as duas bases como potências de 2." },
            ],
          },
        ),
        c(
          "exp-log",
          "log 2 ≈ 0,301. Então log 8 vale aproximadamente:",
          "0,903",
          ["2,408", "0,602"],
          "log 8 = 3 log 2.",
          {
            feedback: ["2,408 multiplica por 8 em vez de 3.", "0,602 é log 4."],
          },
        ),
        n(
          "exp-log",
          "Uma cultura dobra a cada 3 horas. Quantas horas leva para ficar 32 vezes maior?",
          15,
          "32 = 2⁵: 5 dobras × 3 horas.",
          { misreads: [{ value: 96, feedback: "96 = 32 × 3; o fator 32 são 5 dobras." }] },
        ),
        c(
          "exp-log",
          "A equação log₃(x − 1) = 2 tem solução:",
          "x = 10",
          ["x = 7", "x = 9"],
          "x − 1 = 3² = 9.",
          {
            feedback: ["7 usaria x − 1 = 6.", "9 é x − 1."],
          },
        ),
        n("exp-log", "Se 2ᵃ = 5, quanto vale 2^(2a)?", 25, "(2ᵃ)² = 25.", {
          misreads: [
            {
              value: 10,
              feedback: "10 dobraria o resultado; o expoente dobrado eleva ao quadrado.",
            },
          ],
        }),
        c(
          "exp-log",
          "Qual igualdade não vale para todos a e b positivos?",
          "log(a + b) = log a + log b",
          ["log(ab) = log a + log b, para a, b > 0", "log(a²) = 2 log a, para a > 0"],
          "O logaritmo transforma produto em soma, não soma em soma.",
          {
            feedback: ["Essa é uma propriedade verdadeira.", "Essa é verdadeira para a positivo."],
          },
        ),
      ],
    },
    {
      title: "Inequações e decisões",
      objective:
        "Resolver inequações de 1º e 2º grau, produto e quociente, e usá-las em problemas.",
      introduction:
        "Inequações pedem o conjunto onde a expressão é positiva, negativa ou nula. Para 2º grau e produtos, estuda-se o sinal em cada intervalo entre as raízes. Multiplicar por negativo inverte o sentido.",
      estimatedMinutes: 18,
      specs: [
        c(
          "inequacoes",
          "O conjunto das soluções de x² − 5x + 6 < 0 é:",
          "2 < x < 3",
          ["x < 2 ou x > 3", "x < 6"],
          "Parábola para cima, negativa entre as raízes 2 e 3.",
          {
            feedback: ["Fora das raízes a expressão é positiva.", "6 não é raiz."],
          },
        ),
        n(
          "inequacoes",
          "Quantos inteiros satisfazem x² < 20?",
          9,
          "|x| ≤ 4: de −4 a 4, 9 inteiros.",
          {
            misreads: [
              { value: 4, feedback: "4 conta só os positivos; há também os negativos e o zero." },
            ],
          },
        ),
        c(
          "inequacoes",
          "A solução de −2x + 6 > 0 é:",
          "x < 3",
          ["x > 3", "x > −3"],
          "−2x > −6; dividindo por −2 o sentido inverte.",
          {
            feedback: [
              "Dividir por negativo inverte o sentido.",
              "Dividiu por 2 em vez de −2: o 3 fica positivo e o sentido também inverte.",
            ],
          },
        ),
        n(
          "inequacoes",
          "Um plano de celular custa R$ 40 por mês mais R$ 0,20 por minuto. Com orçamento de R$ 70, qual é o máximo de minutos por mês?",
          150,
          "40 + 0,2m ≤ 70 dá m ≤ 150.",
          {
            misreads: [{ value: 350, feedback: "350 divide 70 por 0,2 sem tirar a mensalidade." }],
          },
        ),
        c(
          "inequacoes",
          "O conjunto das soluções de (x − 1)/(x + 2) ≥ 0 é:",
          "x < −2 ou x ≥ 1",
          ["x ≤ −2 ou x ≥ 1", "−2 < x ≤ 1"],
          "O quociente é positivo com sinais iguais ou zero com numerador nulo (x = 1); x = −2 anula o denominador e é excluído.",
          {
            feedback: [
              "x = −2 zera o denominador e não pode entrar.",
              "O quociente é negativo em −2 < x < 1; só x = 1, onde ele vale 0, entra.",
            ],
          },
        ),
        n("inequacoes", "Qual é o maior inteiro que satisfaz 3x − 7 < 2x + 5?", 11, "x < 12.", {
          misreads: [{ value: 12, feedback: "A desigualdade é estrita: x < 12." }],
        }),
        c(
          "inequacoes",
          "Para que valores de m a parábola y = x² + 2x + m fica sempre acima do eixo x?",
          "m > 1",
          ["m < 1", "m > 0"],
          "Δ = 4 − 4m < 0 dá m > 1.",
          {
            feedback: ["m < 1 dá raízes reais.", "Com m entre 0 e 1 ainda há raízes."],
          },
        ),
        c(
          "inequacoes",
          "Ao multiplicar os dois lados de uma inequação por uma expressão cujo sinal não se conhece, o que deve ser feito?",
          "Separar os casos: fator positivo e fator negativo",
          [
            "Nada; o sentido da desigualdade se mantém",
            "Sempre inverter o sentido da desigualdade",
          ],
          "O sinal do fator decide: se for positivo, o sentido se mantém; se for negativo, inverte. Como ele é desconhecido, cada caso é resolvido à parte.",
          {
            feedback: [
              "Se o fator for negativo, o sentido inverte.",
              "Se o fator for positivo, o sentido se mantém.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize os passos para resolver uma equação com raiz quadrada, como √(x + 6) = x.",
    labels: [
      "Isolar a raiz de um lado da equação",
      "Elevar os dois lados ao quadrado",
      "Resolver a equação obtida",
      "Conferir cada solução na equação original e descartar as falsas",
    ],
    explanation:
      "Elevar ao quadrado pode criar soluções falsas; só a conferência na original decide.",
  },
  justification: {
    prompts: [
      "Explique por que √(x + 6) = x tem só a solução 3, embora a equação elevada ao quadrado tenha duas.",
      "Explique por que x⁴ − 5x² + 4 = 0 tem quatro raízes reais.",
      "Explique por que ao dividir −2x > −6 por −2 o sentido da desigualdade inverte.",
    ],
    samples: [
      "Elevando ao quadrado, x + 6 = x², que dá x = 3 ou x = −2. Mas a raiz quadrada nunca é negativa, então o lado direito, x, precisa ser maior ou igual a zero. Conferindo: √9 = 3, certo; √4 = 2, que não é −2. A solução −2 apareceu porque (−2)² = 2², e a elevação não distingue os sinais.",
      "Trocando y = x², a equação vira y² − 5y + 4 = 0, com raízes y = 1 e y = 4. Como os dois valores são positivos, cada um dá dois valores de x: x² = 1 dá ±1 e x² = 4 dá ±2. São quatro raízes reais.",
      "Multiplicar por um número negativo inverte a ordem da reta: 2 < 3, mas −2 > −3. Dividir por −2 é multiplicar por −1/2, então −2x > −6 vira x < 3. Um teste confirma: x = 0 satisfaz −2x > −6 (0 > −6) e também x < 3.",
    ],
    focus: "conferir as soluções",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const r1 = 1 + (seed % 6);
      const r2 = r1 + 1 + (seed % 5);
      const soma = r1 + r2;
      const produto = r1 * r2;
      return c(
        "maior-raiz",
        `Qual é a maior raiz da equação x² − ${soma}x + ${produto} = 0?`,
        `${r2}`,
        [`${r1}`, `${soma}`],
        `Duas raízes com soma ${soma} e produto ${produto}: ${r1} e ${r2}.`,
        {
          feedback: ["Essa é a menor raiz.", "Essa é a soma das raízes, não uma raiz."],
        },
      );
    }
    if (variant === 1) {
      const base = [2, 3, 5][seed % 3] ?? 2;
      const expoente = 2 + (seed % 4);
      const desloc = 1 + (seed % 3);
      const valor = base ** expoente;
      return c(
        "equacao-exponencial",
        `Resolva ${base} elevado a (x + ${desloc}) igual a ${valor}.`,
        String(expoente - desloc).replace("-", "−"),
        [`${expoente}`, `${expoente + desloc}`],
        `${valor} = ${base}${sobrescrito(expoente)}, então x + ${desloc} = ${expoente} e x = ${String(expoente - desloc).replace("-", "−")}.`,
        {
          feedback: [
            "Esse é o expoente inteiro; falta subtrair o deslocamento.",
            "Somou o deslocamento em vez de subtrair.",
          ],
        },
      );
    }
    const centro = 1 + (seed % 7);
    // Centro 3 e raio 5 já são uma missão.
    const raio = centro === 3 && centro + 1 + (seed % 4) === 5 ? 6 : centro + 1 + (seed % 4);
    return c(
      "soma-das-solucoes-modulo",
      `Qual é a soma das soluções da equação |x − ${centro}| = ${raio}?`,
      `${2 * centro}`,
      [`${centro + raio}`, `${2 * raio}`],
      `x = ${centro} + ${raio} ou x = ${centro} − ${raio}; a soma é ${2 * centro}.`,
      {
        feedback: [
          "Essa é só uma das soluções.",
          "Somou as distâncias; a soma das soluções é o dobro do centro.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "equacoes-em",
    title: "Quando a conta engana",
    prompt:
      "Monte três equações (uma com raiz quadrada, uma com módulo e uma de 2º grau com parâmetro) em que um descuido leva a uma resposta errada. Resolva cada uma, mostre onde o descuido apareceria e como a conferência o evita.",
    lab: null,
    steps: [
      "Escreva as três equações e resolva cada uma com todos os passos.",
      "Mostre a resposta errada que um descuido produziria e o passo onde ele aconteceria.",
      "Confira as soluções na equação original e explique por que a conferência resolve.",
    ],
    rubric: [
      "Três equações resolvidas corretamente (0–3)",
      "Descuido plausível identificado em cada uma (0–3)",
      "Conferência na original feita e explicada (0–3)",
      "Clareza da escrita (0–1)",
    ],
  },
  homeSupport: [
    "Proponham um problema de orçamento com mensalidade e custo por uso e montem juntos a inequação do limite de gasto.",
    "Conversem sobre por que conferir a resposta na pergunta original é diferente de conferir a conta.",
  ],
};
