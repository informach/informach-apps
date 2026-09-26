import { c, decimal, n, type SkillPack, sobrescrito, subscrito } from "../skill-factory";

/**
 * Recorrências e sequências: progressões aritméticas e geométricas,
 * relações de recorrência, termos distantes sem listar, somas e
 * comportamento no longo prazo. Trilhas OBMEP N3 e Canguru J.
 */
export const recorrencias: SkillPack = {
  id: "recorrencias",
  name: "Sequências e recorrências",
  domain: "common",
  lab: "bars",
  missions: [
    {
      title: "Progressões aritméticas",
      objective: "Reconhecer PA, achar o termo geral e um termo distante.",
      introduction:
        "Numa progressão aritmética cada termo é o anterior mais uma razão fixa r. O termo geral é aₙ = a₁ + (n − 1)r: para chegar ao n-ésimo termo dão-se n − 1 saltos.",
      specs: [
        n("pa", "Na PA 7, 11, 15, 19, ..., qual é o 20º termo?", 83, "a₂₀ = 7 + 19 × 4 = 83.", {
          misreads: [{ value: 87, feedback: "87 usa 20 saltos; do 1º ao 20º termo há 19 saltos." }],
        }),
        c(
          "pa",
          "Uma PA tem a₃ = 10 e a₇ = 22. A razão é:",
          "3",
          ["4", "12"],
          "De a₃ a a₇ são 4 saltos: (22 − 10) ÷ 4 = 3.",
          {
            feedback: [
              "4 é o número de saltos, não a razão.",
              "12 é a diferença total entre a₇ e a₃.",
            ],
          },
        ),
        n(
          "pa",
          "Na PA 100, 94, 88, ..., qual é a posição do termo igual a 40?",
          11,
          "40 = 100 − 6(n − 1) dá n − 1 = 10, n = 11.",
          { misreads: [{ value: 10, feedback: "10 é o número de saltos; a posição é 11." }] },
        ),
        c(
          "pa",
          "Se x, 2x + 1 e 4x − 3 estão em PA, então x vale:",
          "5",
          ["4", "2"],
          "2(2x + 1) = x + 4x − 3 dá 4x + 2 = 5x − 3, x = 5. Conferindo: 5, 11, 17.",
          {
            feedback: [
              "Com x = 4: 4, 9, 13, e as diferenças 5 e 4 são diferentes.",
              "Com x = 2: 2, 5, 5, não é PA.",
            ],
          },
        ),
        n(
          "pa",
          "Quantos múltiplos de 7 existem entre 100 e 500?",
          57,
          "Primeiro 105, último 497: (497 − 105) ÷ 7 + 1 = 57.",
          {
            misreads: [
              {
                value: 56,
                feedback: "Esqueceu de somar 1 depois de dividir a diferença pela razão.",
              },
            ],
          },
        ),
        c(
          "pa",
          "O termo médio de uma PA de 3 termos com soma 45 é:",
          "15",
          ["45", "22,5"],
          "Numa PA de 3 termos, a soma é 3 vezes o termo do meio.",
          {
            feedback: ["45 é a soma.", "22,5 seria a metade da soma, não um terço."],
          },
        ),
        n(
          "pa",
          "Uma escada tem degraus de alturas em PA: o 1º está a 18 cm do chão e o 10º a 180 cm. A que altura está o 4º degrau, em centímetros?",
          72,
          "Razão (180 − 18) ÷ 9 = 18; a₄ = 18 + 3 × 18 = 72.",
          { misreads: [{ value: 90, feedback: "90 seria o 5º degrau." }] },
        ),
        c(
          "pa",
          "Numa PA com a₁ = 2 e r = 5, o primeiro termo maior que 100 é:",
          "102",
          ["100", "107"],
          "2 + 5(n − 1) > 100 dá n − 1 > 19,6, n = 21: a₂₁ = 102.",
          {
            feedback: [
              "100 não é termo: (100 − 2) não é múltiplo de 5.",
              "107 é o segundo termo acima de 100.",
            ],
          },
        ),
      ],
    },
    {
      title: "Somas de progressões",
      objective: "Somar termos de uma PA e reconhecer somas por emparelhamento.",
      introduction:
        "A soma de uma PA é o número de termos vezes a média do primeiro com o último: Sₙ = n(a₁ + aₙ)/2. É o truque de emparelhar o primeiro com o último, o segundo com o penúltimo, e assim por diante.",
      specs: [
        n("soma-pa", "Qual é a soma 1 + 2 + 3 + ... + 100?", 5050, "100 × (1 + 100) ÷ 2 = 5.050.", {
          misreads: [{ value: 10100, feedback: "Esqueceu de dividir por 2 depois de emparelhar." }],
        }),
        c(
          "soma-pa",
          "A soma dos 20 primeiros termos da PA 3, 7, 11, ... é:",
          "820",
          ["800", "1.640"],
          "a₂₀ = 3 + 19 × 4 = 79; S = 20 × (3 + 79) ÷ 2 = 820.",
          {
            feedback: ["800 usa a₂₀ = 77, mas 3 + 19 × 4 = 79.", "1.640 não dividiu por 2."],
          },
        ),
        n(
          "soma-pa",
          "Qual é a soma dos números ímpares de 1 a 99?",
          2500,
          "São 50 termos com média 50: 50 × 50 = 2.500.",
          {
            misreads: [
              { value: 4950, feedback: "4.950 seria a soma de todos os inteiros de 1 a 99." },
            ],
          },
        ),
        c(
          "soma-pa",
          "Um teatro tem 15 fileiras: a primeira tem 12 cadeiras e cada fileira seguinte tem 2 a mais. Quantas cadeiras há?",
          "390",
          ["360", "420"],
          "Última fileira: 12 + 14 × 2 = 40; soma 15 × (12 + 40) ÷ 2 = 390.",
          {
            feedback: [
              "360 usa última fileira 36, mas são 14 saltos de 2 a partir de 12.",
              "420 usa última fileira 44.",
            ],
          },
        ),
        n(
          "soma-pa",
          "A soma dos n primeiros termos da PA 5, 8, 11, ... é 258. Quanto vale n?",
          12,
          "a₁₂ = 5 + 11 × 3 = 38 e 12 × (5 + 38) ÷ 2 = 258.",
          {
            misreads: [{ value: 13, feedback: "Com 13 termos a soma é 13 × (5 + 41) ÷ 2 = 299." }],
          },
        ),
        c(
          "soma-pa",
          "Se a soma dos 10 primeiros termos de uma PA é 155 e a₁ = 2, então a₁₀ vale:",
          "29",
          ["31", "15,5"],
          "155 = 10 × (2 + a₁₀) ÷ 2 dá 2 + a₁₀ = 31, a₁₀ = 29.",
          {
            feedback: ["31 é a soma a₁ + a₁₀; subtraia a₁ = 2.", "15,5 é a média dos termos."],
          },
        ),
        n(
          "soma-pa",
          "Quantos termos da PA 1, 4, 7, ... são necessários para a soma passar de 100 pela primeira vez?",
          9,
          "S₈ = 8 × (1 + 22) ÷ 2 = 92; S₉ = 9 × (1 + 25) ÷ 2 = 117.",
          { misreads: [{ value: 8, feedback: "Com 8 termos a soma é 92, ainda abaixo de 100." }] },
        ),
        c(
          "soma-pa",
          "A soma de uma PA de 7 termos é 84. O termo do meio (a₄) é:",
          "12",
          ["84", "21"],
          "Soma = número de termos × termo médio: 84 ÷ 7 = 12.",
          {
            feedback: ["84 é a soma.", "21 = 84 ÷ 4 não usa o número de termos."],
          },
        ),
      ],
    },
    {
      title: "Progressões geométricas",
      objective: "Reconhecer PG, achar o termo geral, somar termos e comparar crescimentos.",
      introduction:
        "Numa progressão geométrica cada termo é o anterior vezes uma razão q. O termo geral é aₙ = a₁·qⁿ⁻¹ e a soma dos n primeiros termos é a₁(qⁿ − 1)/(q − 1), para q ≠ 1. Com termos positivos e razão q > 1, PGs acabam crescendo muito mais rápido que qualquer PA.",
      specs: [
        n("pg", "Na PG 3, 6, 12, 24, ..., qual é o 8º termo?", 384, "3 × 2⁷ = 384.", {
          misreads: [
            { value: 768, feedback: "768 usa 2⁸; do 1º ao 8º termo há 7 multiplicações." },
          ],
        }),
        c(
          "pg",
          "Uma PG tem a₁ = 2 e a₄ = 54. A razão é:",
          "3",
          ["18", "27"],
          "2q³ = 54 dá q³ = 27, q = 3.",
          {
            feedback: ["18 é a₄ ÷ 3, não a razão.", "27 é q³."],
          },
        ),
        n(
          "pg",
          "Qual é a soma 1 + 2 + 4 + 8 + ... + 512?",
          1023,
          "10 termos: (2¹⁰ − 1) ÷ (2 − 1) = 1.023.",
          { misreads: [{ value: 1024, feedback: "1.024 é 2¹⁰; a soma de 1 até 2⁹ é 2¹⁰ − 1." }] },
        ),
        c(
          "pg",
          "Uma cultura de bactérias dobra a cada hora. Se começa com 100, quando passa de 10.000?",
          "Depois de 7 horas",
          ["Depois de 100 horas", "Depois de 5 horas"],
          "100 × 2⁷ = 12.800 > 10.000, e 100 × 2⁶ = 6.400 não passa.",
          {
            feedback: [
              "Crescimento geométrico é muito mais rápido que isso.",
              "Em 5 horas são 3.200.",
            ],
          },
        ),
        n(
          "pg",
          "Uma bola cai de 81 metros e a cada quique sobe 1/3 da altura anterior. Qual é a altura do 3º quique, em metros?",
          3,
          "81 × (1/3)³ = 3.",
          { misreads: [{ value: 9, feedback: "9 é a altura do 2º quique." }] },
        ),
        c(
          "pg",
          "Se x, 6, 18 estão em PG, então x vale:",
          "2",
          ["3", "−6"],
          "A razão é 3, então x = 6 ÷ 3 = 2.",
          {
            feedback: [
              "3 é a razão, não o termo anterior.",
              "−6 daria razão −1 de −6 para 6, mas de 6 para 18 é 3.",
            ],
          },
        ),
        n(
          "pg",
          "Um investimento rende 10% ao ano. Depois de quantos anos completos o valor inicial pelo menos dobra?",
          8,
          "1,1⁷ ≈ 1,95 e 1,1⁸ ≈ 2,14: 8 anos.",
          {
            misreads: [
              {
                value: 10,
                feedback:
                  "10 anos seria se o rendimento fosse simples; com juros compostos dobra antes.",
              },
            ],
          },
        ),
        c(
          "pg",
          "Em uma PG de termos positivos, o termo do meio de três consecutivos é sempre:",
          "A raiz quadrada do produto dos vizinhos",
          ["A média aritmética dos vizinhos", "A soma dos vizinhos dividida por q"],
          "b² = a·c em qualquer PG.",
          {
            feedback: ["Média aritmética é para PA.", "Isso não é uma relação válida em PG."],
          },
        ),
      ],
    },
    {
      title: "Relações de recorrência",
      objective:
        "Ler uma regra que depende dos termos anteriores, calcular termos e reconhecer padrões.",
      introduction:
        "Uma recorrência define cada termo a partir dos anteriores, como aₙ = aₙ₋₁ + aₙ₋₂. Para termos próximos, calcula-se passo a passo; para termos distantes, procura-se um padrão ou uma fórmula fechada.",
      specs: [
        n(
          "recorrencia",
          "A sequência tem a₁ = 1, a₂ = 1 e aₙ = aₙ₋₁ + aₙ₋₂. Qual é a₁₀?",
          55,
          "1, 1, 2, 3, 5, 8, 13, 21, 34, 55.",
          { misreads: [{ value: 89, feedback: "89 é a₁₁." }] },
        ),
        c(
          "recorrencia",
          "Se a₁ = 3 e aₙ = 2aₙ₋₁ − 1, então a₄ vale:",
          "17",
          ["15", "33"],
          "3, 5, 9, 17.",
          {
            feedback: ["15 não segue a regra: 2 × 9 − 1 = 17.", "33 é a₅."],
          },
        ),
        n(
          "recorrencia",
          "A sequência tem a₁ = 5 e aₙ = aₙ₋₁ + n. Qual é a₆?",
          25,
          "5, 7, 10, 14, 19, 25.",
          {
            misreads: [
              { value: 30, feedback: "30 somaria 5 a cada passo; o acréscimo cresce com n." },
            ],
          },
        ),
        c(
          "recorrencia",
          "Uma sequência satisfaz aₙ = aₙ₋₁ + 4 com a₁ = 3. Sua fórmula fechada é:",
          "aₙ = 4n − 1",
          ["aₙ = 4n + 3", "aₙ = 3n + 4"],
          "É uma PA com a₁ = 3 e r = 4: aₙ = 3 + 4(n − 1) = 4n − 1.",
          {
            feedback: ["4n + 3 daria a₁ = 7.", "3n + 4 daria razão 3."],
          },
        ),
        n(
          "recorrencia",
          "A sequência tem a₁ = 2 e aₙ = aₙ₋₁², para n ≥ 2. Qual é a₄?",
          256,
          "2, 4, 16, 256.",
          { misreads: [{ value: 16, feedback: "16 é a₃." }] },
        ),
        c(
          "recorrencia",
          "Numa sequência com aₙ = aₙ₋₁ × (−1), começando em a₁ = 7, o termo a₁₀₀ é:",
          "−7",
          ["7", "0"],
          "Os termos alternam 7, −7, 7, −7; os de posição par são −7.",
          {
            feedback: ["7 aparece nas posições ímpares.", "A sequência nunca zera."],
          },
        ),
        n(
          "recorrencia",
          "Uma sequência tem a₁ = 1 e aₙ = aₙ₋₁ + (2n − 1). Qual é a₁₀?",
          100,
          "Somar os ímpares dá quadrados: aₙ = n², a₁₀ = 100.",
          { misreads: [{ value: 19, feedback: "19 é só o último acréscimo (2 × 10 − 1)." }] },
        ),
        c(
          "recorrencia",
          "O número de maneiras de subir n degraus dando passos de 1 ou 2 degraus satisfaz:",
          "Mₙ = Mₙ₋₁ + Mₙ₋₂",
          ["Mₙ = 2Mₙ₋₁", "Mₙ = Mₙ₋₁ + 1"],
          "O último passo foi de 1 (vindo de n − 1) ou de 2 (vindo de n − 2).",
          {
            feedback: [
              "Dobrar contaria sequências de passos que não terminam certo.",
              "Somar 1 não dá o crescimento real: 1, 2, 3, 5, 8.",
            ],
          },
        ),
      ],
    },
    {
      title: "Sequências para decidir",
      objective: "Modelar situações com sequências, comparar crescimentos e prever com cuidado.",
      introduction:
        "Muitas situações são PA (acréscimo fixo) ou PG (fator fixo). Reconhecer qual é decide a previsão: uma PG de termos positivos e razão maior que 1 sempre acaba ultrapassando uma PA. E toda previsão vale enquanto a regra valer.",
      estimatedMinutes: 18,
      specs: [
        c(
          "modelar",
          "Um salário sobe R$ 100 por ano; outro sobe 5% ao ano. Os dois começam em R$ 2.000. Depois de muitos anos:",
          "O que sobe 5% será maior, porque cresce como PG",
          [
            "O que sobe R$ 100 será sempre maior, porque 100 é mais que 5% de 2.000",
            "Os dois ficam sempre iguais",
          ],
          "5% de 2.000 é 100 no primeiro ano; depois o percentual incide sobre valores maiores.",
          {
            feedback: [
              "No começo empatam, mas o percentual cresce sobre uma base maior.",
              "As regras são diferentes; os valores se separam.",
            ],
          },
        ),
        n(
          "modelar",
          "Uma pessoa guarda R$ 50 no 1º mês, R$ 60 no 2º, R$ 70 no 3º, e assim por diante. Quanto terá guardado depois de 12 meses, em reais?",
          1260,
          "PA com a₁ = 50, a₁₂ = 160: 12 × (50 + 160) ÷ 2 = 1.260.",
          { misreads: [{ value: 600, feedback: "600 seria 50 por mês, sem o aumento." }] },
        ),
        c(
          "modelar",
          "Uma folha de papel de 0,1 mm é dobrada ao meio 20 vezes. A espessura fica em torno de:",
          "100 metros",
          ["2 milímetros", "1 metro"],
          "0,1 mm × 2²⁰ ≈ 0,1 × 1.000.000 mm = 100 m.",
          {
            feedback: [
              "2 mm seria 20 folhas; dobrar multiplica, não soma.",
              "1 metro seria cerca de 13 dobras.",
            ],
          },
        ),
        n(
          "modelar",
          "Um lago tem uma planta que dobra de área a cada dia e cobre o lago inteiro no dia 30. Em que dia ela cobria metade do lago?",
          29,
          "Se dobra por dia, um dia antes de cobrir tudo cobria metade.",
          {
            misreads: [
              {
                value: 15,
                feedback:
                  "15 seria se o crescimento fosse linear; dobrar significa metade no dia anterior.",
              },
            ],
          },
        ),
        c(
          "modelar",
          "A PA 1, 4, 7, ... e a PG 1, 2, 4, ... têm o mesmo primeiro termo. Qual é o primeiro n em que a PG ultrapassa a PA?",
          "n = 5",
          ["n = 3", "n = 10"],
          "PA: 1, 4, 7, 10, 13. PG: 1, 2, 4, 8, 16. Em n = 5, 16 > 13.",
          {
            feedback: ["Em n = 3, 4 < 7.", "Em n = 5 já ultrapassa."],
          },
        ),
        n(
          "modelar",
          "Um carro perde 20% do valor por ano. Comprado por R$ 50.000, quanto vale depois de 3 anos, em reais?",
          25600,
          "50.000 × 0,8³ = 25.600.",
          {
            misreads: [
              {
                value: 20000,
                feedback:
                  "20.000 tira 20% do valor inicial três vezes; a perda incide sobre o valor atual.",
              },
            ],
          },
        ),
        c(
          "modelar",
          "Uma sequência começa 2, 4, 8. Sem mais informação, o próximo termo:",
          "Não está determinado: pode ser 16, 14 ou outro",
          [
            "É com certeza 16, pois a razão é 2",
            "É com certeza 14, pois as diferenças crescem de 2",
          ],
          "Regras diferentes coincidem nos primeiros termos: 16 (PG de razão 2), 14 (diferenças 2, 4, 6) ou outro valor. Três termos não determinam a regra.",
          {
            feedback: [
              "16 é a leitura mais comum, como PG de razão 2, mas não a única.",
              "14, com diferenças 2, 4, 6, também é possível, mas não é a única.",
            ],
          },
        ),
        c(
          "modelar",
          "Por que uma previsão baseada em PG deve ser usada com cautela para prazos longos?",
          "Porque, na prática, o crescimento encontra limites",
          [
            "Porque toda PG acaba diminuindo com o tempo",
            "Porque a fórmula do termo geral acumula erro com n",
          ],
          "Na vida real o crescimento encontra limites, e a regra de multiplicar deixa de valer: populações, dinheiro e epidemias saturam ou mudam de regime.",
          {
            feedback: [
              "PGs com q > 1 crescem; o problema é o modelo, não a fórmula.",
              "A fórmula é exata para todo n; quem muda é a realidade.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize os passos para somar os n primeiros termos de uma PA.",
    labels: [
      "Identificar o primeiro termo e a razão",
      "Calcular o último termo com aₙ = a₁ + (n − 1)r",
      "Somar o primeiro com o último e multiplicar por n",
      "Dividir por 2",
    ],
    explanation:
      "Escrevendo a soma duas vezes, uma de trás para frente, obtêm-se n pares de soma a₁ + aₙ; como cada termo entrou duas vezes, divide-se por 2.",
  },
  justification: {
    prompts: [
      "Explique por que o 20º termo de uma PA usa 19 saltos e não 20.",
      "Explique por que uma quantia que sobe 5% ao ano acaba superando uma que sobe um valor fixo, mesmo que comecem iguais.",
      "Explique por que 2, 4, 8 não determina sozinho o próximo termo.",
    ],
    samples: [
      "O primeiro termo já está na posição 1 sem nenhum salto. Para ir da posição 1 até a posição 20 dou 19 passos, um entre cada par de termos vizinhos. Por isso a₂₀ = a₁ + 19r. Usar 20 saltos me levaria ao 21º termo.",
      "O aumento de 5% incide sobre o valor do ano anterior, que cresce a cada ano. Então o acréscimo em reais aumenta: 100, 105, 110,25... O outro salário soma sempre os mesmos 100. Em algum momento o acréscimo percentual passa de 100 e, daí em diante, a diferença só aumenta.",
      "Existem regras diferentes que começam com 2, 4, 8. Dobrar dá 16. Somar diferenças crescentes 2, 4, 6 dá 14. Com três termos não dá para separar essas regras; precisaríamos de mais termos ou de a regra ser dada.",
    ],
    focus: "a escolha entre acréscimo fixo e fator fixo",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const a1 = 2 + (seed % 9);
      const r = 3 + (seed % 6);
      const n = 12 + (Math.floor(seed / 9) % 9);
      const an = a1 + (n - 1) * r;
      return c(
        "termo-geral-pa",
        `Uma progressão aritmética começa em ${a1} e tem razão ${r}. Qual é o ${n}º termo?`,
        decimal(an),
        [decimal(an + r), decimal(an - r)],
        `a${subscrito(n)} = ${a1} + ${n - 1} × ${r} = ${decimal(an)}.`,
        {
          feedback: [
            `Usou ${n} saltos, mas do 1º ao ${n}º termo há ${n - 1}.`,
            `Esse é o ${n - 1}º termo.`,
          ],
        },
      );
    }
    if (variant === 1) {
      const a1 = 3 + (seed % 7);
      const r = 2 + (seed % 5);
      const n = 10 + (seed % 11);
      const an = a1 + (n - 1) * r;
      const soma = (n * (a1 + an)) / 2;
      return c(
        "soma-de-pa",
        `Qual é a soma dos ${n} primeiros termos da progressão aritmética ${a1}, ${a1 + r}, ${a1 + 2 * r}, ...?`,
        decimal(soma),
        [decimal(soma * 2), decimal(n * an)],
        `O último termo é ${a1} + ${n - 1} × ${r} = ${an}; a soma é ${n} × (${a1} + ${an}) ÷ 2 = ${decimal(soma)}.`,
        {
          feedback: [
            "Esqueceu de dividir por 2 depois de emparelhar.",
            "Multiplicou o último termo pelo número de termos, mas os termos anteriores são menores.",
          ],
        },
      );
    }
    const a1 = [2, 3, 5][seed % 3] ?? 2;
    const q = 2 + (seed % 2);
    const n = 5 + (Math.floor(seed / 6) % 4);
    const an = a1 * q ** (n - 1);
    return c(
      "termo-geral-pg",
      `Uma progressão geométrica começa em ${a1} e tem razão ${q}. Qual é o ${n}º termo?`,
      decimal(an),
      [decimal(an * q), decimal(a1 + (n - 1) * q)],
      `a${subscrito(n)} = ${a1} × ${q}${sobrescrito(n - 1)} = ${decimal(an)}.`,
      {
        feedback: [
          `Multiplicou ${n} vezes, mas do 1º ao ${n}º termo há ${n - 1} multiplicações.`,
          "Tratou a progressão como aritmética, somando a razão em vez de multiplicar.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "recorrencias",
    title: "Duas regras, um gráfico",
    prompt:
      "Escolha uma situação real com acréscimo fixo (uma poupança mensal) e outra com fator fixo (juros compostos ou uma população que cresce por porcentagem). Modele as duas como sequências, calcule dez termos de cada e mostre num gráfico quando uma ultrapassa a outra.",
    lab: "bars",
    steps: [
      "Escreva o termo geral de cada sequência a partir dos dados escolhidos.",
      "Calcule os dez primeiros termos e monte o gráfico das duas no mesmo eixo.",
      "Identifique o ponto de ultrapassagem e discuta até onde o modelo geométrico é realista.",
    ],
    rubric: [
      "Termos gerais corretos para as duas situações (0–3)",
      "Dez termos e gráfico coerentes (0–3)",
      "Ponto de ultrapassagem identificado (0–2)",
      "Discussão dos limites do modelo (0–2)",
    ],
  },
  homeSupport: [
    "Comparem juntos uma poupança de valor fixo por mês com um rendimento percentual e discutam quando uma passa a outra.",
    "Ao ouvir 'dobra a cada X anos' no noticiário, perguntem quanto seria depois de dez vezes esse prazo e se faz sentido.",
  ],
};
