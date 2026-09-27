import { c, decimal, n, type SkillPack, sobrescrito } from "../skill-factory";

/**
 * Estruturas numéricas: divisibilidade e fatoração, mdc e mmc, congruências
 * e restos, dígitos e bases, e argumentos com números inteiros.
 * Trilha OBMEP N3.
 */
export const estruturasNumericas: SkillPack = {
  id: "estruturas-numericas",
  name: "Estruturas numéricas",
  domain: "obmep",
  lab: "groups",
  missions: [
    {
      title: "Fatorar para enxergar",
      objective:
        "Usar a fatoração em primos para contar divisores, reconhecer quadrados e resolver equações em inteiros.",
      introduction:
        "Todo inteiro maior que 1 se escreve de um único jeito como produto de primos. Essa escrita revela os divisores, diz se o número é quadrado perfeito e transforma perguntas sobre produtos em perguntas sobre expoentes.",
      specs: [
        n(
          "fatorar",
          "Quantos divisores positivos tem 360?",
          24,
          "360 = 2³ × 3² × 5; (3 + 1)(2 + 1)(1 + 1) = 24.",
          {
            misreads: [
              {
                value: 12,
                feedback: "12 = (3 + 1)(2 + 1) esquece o fator 5, que dobra a contagem.",
              },
            ],
          },
        ),
        c(
          "fatorar",
          "Qual é o menor inteiro positivo n tal que 12n é um quadrado perfeito?",
          "3",
          ["12", "6"],
          "12 = 2² × 3; falta um 3 para todos os expoentes ficarem pares.",
          {
            feedback: [
              "12 × 12 = 144 é quadrado, mas 3 já serve: 36.",
              "12 × 6 = 72 não é quadrado.",
            ],
          },
        ),
        n(
          "fatorar",
          "Quantos zeros há no final de 25! (fatorial de 25)?",
          6,
          "Cada zero vem de um par 2 × 5; há 25 ÷ 5 = 5 múltiplos de 5 e mais um 5 extra em 25: 6.",
          {
            misreads: [
              { value: 5, feedback: "Esqueceu que 25 = 5 × 5 contribui com dois fatores 5." },
            ],
          },
        ),
        c(
          "fatorar",
          "Se a e b são inteiros positivos com a × b = 36 e a < b, quantos pares (a, b) existem?",
          "4",
          ["9", "5"],
          "(1, 36), (2, 18), (3, 12), (4, 9): 4 pares; (6, 6) não tem a < b.",
          {
            feedback: [
              "9 é o número de divisores de 36, não de pares com a < b.",
              "5 incluiria (6, 6), mas a deve ser menor que b.",
            ],
          },
        ),
        n(
          "fatorar",
          "Qual é o menor inteiro positivo que tem exatamente 6 divisores positivos?",
          12,
          "6 = 6 ou 6 = 2 × 3: p⁵ ou p² × q; o menor é 2² × 3 = 12.",
          { misreads: [{ value: 32, feedback: "32 = 2⁵ tem 6 divisores, mas 12 é menor." }] },
        ),
        c(
          "fatorar",
          "Um número é quadrado perfeito se e somente se:",
          "Todos os expoentes na fatoração em primos são pares",
          ["Ele é par", "Ele termina em 0, 1, 4, 5, 6 ou 9"],
          "n = m² dobra os expoentes de m.",
          {
            feedback: [
              "8 é par e não é quadrado.",
              "Terminar nesses dígitos é necessário, mas 11 termina em 1 e não é quadrado.",
            ],
          },
        ),
        n(
          "fatorar",
          "Quantos divisores positivos de 72 são pares?",
          9,
          "72 = 2³ × 3²; divisores pares têm expoente de 2 entre 1 e 3: 3 × 3 = 9.",
          {
            misreads: [{ value: 12, feedback: "12 é o total de divisores; 3 deles são ímpares." }],
          },
        ),
        c(
          "fatorar",
          "O produto de dois inteiros consecutivos é sempre:",
          "Par",
          ["Ímpar", "Múltiplo de 4"],
          "Entre dois consecutivos um é par.",
          {
            feedback: [
              "Um dos fatores é par, então o produto é par.",
              "2 × 3 = 6 não é múltiplo de 4.",
            ],
          },
        ),
      ],
    },
    {
      title: "MDC e MMC",
      objective: "Calcular e interpretar mdc e mmc, e usar a relação mdc × mmc = a × b.",
      introduction:
        "O mdc é o maior divisor comum; o mmc é o menor múltiplo comum. Na fatoração, o mdc pega os menores expoentes e o mmc os maiores. Para dois números, mdc × mmc = a × b.",
      specs: [
        n(
          "mdc-mmc",
          "Qual é o mdc de 84 e 126?",
          42,
          "84 = 2² × 3 × 7; 126 = 2 × 3² × 7; mdc = 2 × 3 × 7 = 42.",
          {
            misreads: [
              {
                value: 21,
                feedback: "21 é um divisor comum, mas 42 também divide os dois e é maior.",
              },
            ],
          },
        ),
        c(
          "mdc-mmc",
          "O mmc de 12 e 18 é:",
          "36",
          ["216", "6"],
          "12 = 2² × 3; 18 = 2 × 3²; mmc = 2² × 3² = 36.",
          {
            feedback: [
              "216 é o produto; o mmc é menor porque os números têm fatores em comum.",
              "6 é o mdc.",
            ],
          },
        ),
        n(
          "mdc-mmc",
          "Dois números têm mdc 6 e mmc 180. Se um deles é 30, qual é o outro?",
          36,
          "a × b = mdc × mmc = 1.080; 1.080 ÷ 30 = 36.",
          {
            misreads: [
              { value: 150, feedback: "150 = 180 − 30 não usa a relação mdc × mmc = a × b." },
            ],
          },
        ),
        c(
          "mdc-mmc",
          "Dois ônibus saem juntos do terminal: um a cada 18 minutos e outro a cada 24. Depois de quantos minutos saem juntos de novo?",
          "72",
          ["42", "432"],
          "mmc(18, 24) = 72.",
          {
            feedback: ["42 é a soma, não um múltiplo comum.", "432 é o produto; o mmc é menor."],
          },
        ),
        n(
          "mdc-mmc",
          "Um terreno retangular de 84 m por 60 m será dividido em quadrados iguais, os maiores possíveis, sem sobra. Qual é o lado de cada quadrado, em metros?",
          12,
          "mdc(84, 60) = 12.",
          { misreads: [{ value: 6, feedback: "6 divide os dois, mas 12 também e é maior." }] },
        ),
        c(
          "mdc-mmc",
          "Se mdc(a, b) = 1, então mmc(a, b) é:",
          "a × b",
          ["a + b", "1"],
          "mdc × mmc = a × b, e mdc = 1.",
          {
            feedback: [
              "Soma não tem relação com o mmc.",
              "O mmc de dois números positivos é pelo menos o maior deles.",
            ],
          },
        ),
        n(
          "mdc-mmc",
          "Quantos inteiros de 1 a 100 são divisíveis por 4 ou por 6?",
          33,
          "Por 4: 25; por 6: 16; por 12 (ambos): 8. 25 + 16 − 8 = 33.",
          {
            misreads: [
              {
                value: 41,
                feedback: "41 soma sem descontar os múltiplos de 12, contados duas vezes.",
              },
            ],
          },
        ),
        c(
          "mdc-mmc",
          "O mdc de dois números consecutivos é sempre:",
          "1",
          ["2", "O menor deles"],
          "Um divisor comum de n e n + 1 divide a diferença, que é 1.",
          {
            feedback: ["Consecutivos nunca são ambos pares.", "n só dividiria n + 1 se n = 1."],
          },
        ),
      ],
    },
    {
      title: "Restos e congruências",
      objective:
        "Trabalhar com restos: potências, somas e produtos módulo m, e problemas de ciclo.",
      introduction:
        "Dois números são congruentes módulo m quando têm o mesmo resto na divisão por m. Restos se somam e se multiplicam: o resto de uma potência se acha olhando o ciclo dos restos.",
      specs: [
        n(
          "resto",
          "Qual é o resto de 2¹⁰⁰ na divisão por 7?",
          2,
          "2³ = 8 deixa resto 1; 100 = 3 × 33 + 1, então 2¹⁰⁰ ≡ 2.",
          {
            misreads: [
              {
                value: 4,
                feedback:
                  "4 seria 2², para expoente com resto 2 na divisão por 3; 100 tem resto 1.",
              },
            ],
          },
        ),
        c(
          "resto",
          "O último algarismo de 7²⁰²⁶ é:",
          "9",
          ["7", "1"],
          "Ciclo 7, 9, 3, 1 (período 4); 2026 = 4 × 506 + 2: segundo do ciclo, 9.",
          {
            feedback: [
              "7 é o primeiro do ciclo, para expoentes com resto 1 na divisão por 4.",
              "1 é para expoentes múltiplos de 4.",
            ],
          },
        ),
        n(
          "resto",
          "Qual é o resto de 1 + 2 + 3 + ... + 100 na divisão por 9?",
          1,
          "A soma é 5.050; 5.050 = 9 × 561 + 1.",
          {
            misreads: [
              { value: 0, feedback: "5.050 não é múltiplo de 9: a soma dos dígitos é 10." },
            ],
          },
        ),
        c(
          "resto",
          "Se n deixa resto 3 na divisão por 5, então n² deixa resto:",
          "4",
          ["9", "3"],
          "3² = 9, e 9 deixa resto 4 na divisão por 5.",
          {
            feedback: [
              "9 é maior que 5; o resto é 9 − 5 = 4.",
              "O resto do quadrado não é o resto original.",
            ],
          },
        ),
        n(
          "resto",
          "Um número deixa resto 2 na divisão por 3 e resto 3 na divisão por 5. Qual é o menor positivo com essa propriedade?",
          8,
          "Candidatos com resto 3 por 5: 3, 8, 13...; 8 deixa resto 2 por 3.",
          { misreads: [{ value: 23, feedback: "23 também serve, mas 8 é menor." }] },
        ),
        c(
          "resto",
          "Um quadrado perfeito nunca deixa, na divisão por 4, o resto:",
          "2 ou 3",
          ["0", "1"],
          "Pares ao quadrado são múltiplos de 4; ímpares ao quadrado deixam resto 1.",
          {
            feedback: ["4 = 2² deixa resto 0.", "9 = 3² deixa resto 1."],
          },
        ),
        n(
          "resto",
          "Hoje é segunda-feira. Que dia da semana será daqui a 1.000 dias? Responda o número de dias depois de uma segunda-feira (0 para segunda, 1 para terça, e assim por diante).",
          6,
          "1.000 = 7 × 142 + 6: seis dias depois da segunda, domingo.",
          { misreads: [{ value: 1000, feedback: "Reduza módulo 7: 1.000 = 7 × 142 + 6." }] },
        ),
        c(
          "resto",
          "A soma de três inteiros consecutivos é sempre:",
          "Múltiplo de 3",
          ["Múltiplo de 6", "Ímpar"],
          "(n − 1) + n + (n + 1) = 3n.",
          {
            feedback: [
              "1 + 2 + 3 = 6, mas 2 + 3 + 4 = 9 não é múltiplo de 6.",
              "2 + 3 + 4 = 9 é ímpar, mas 1 + 2 + 3 = 6 é par.",
            ],
          },
        ),
      ],
    },
    {
      title: "Dígitos e representações",
      objective:
        "Trabalhar com algarismos, critérios de divisibilidade, números escritos em outras bases e equações com dígitos.",
      introduction:
        "Um número de dois algarismos ab vale 10a + b. Critérios de divisibilidade vêm dessa escrita: por 3 e 9 pela soma dos dígitos, por 11 pela soma alternada. Outras bases usam a mesma ideia com outra potência.",
      specs: [
        n(
          "digitos",
          "Um número de dois algarismos é igual a 4 vezes a soma de seus algarismos. Se o algarismo das dezenas é 1, qual é o número?",
          12,
          "10 + b = 4(1 + b) dá 10 + b = 4 + 4b, b = 2.",
          {
            misreads: [{ value: 2, feedback: "2 é só o algarismo das unidades; o número é 12." }],
          },
        ),
        c(
          "digitos",
          "Qual dígito d faz 5d3 (um número de três algarismos) ser divisível por 9?",
          "1",
          ["8", "0"],
          "5 + d + 3 = 8 + d deve ser múltiplo de 9: d = 1.",
          {
            feedback: ["Com d = 8 a soma é 16, não múltiplo de 9.", "Com d = 0 a soma é 8."],
          },
        ),
        n("digitos", "O número 1011 na base 2 vale quanto na base 10?", 11, "8 + 0 + 2 + 1 = 11.", {
          misreads: [
            { value: 1011, feedback: "Na base 2 cada posição vale uma potência de 2: 8 + 2 + 1." },
          ],
        }),
        c(
          "digitos",
          "Trocando os algarismos de um número de dois dígitos, a diferença entre o número e o trocado é sempre múltiplo de:",
          "9",
          ["11", "10"],
          "(10a + b) − (10b + a) = 9(a − b).",
          {
            feedback: [
              "A soma dos dois é múltiplo de 11; a diferença é múltiplo de 9.",
              "A diferença é 9(a − b), não múltiplo de 10 em geral.",
            ],
          },
        ),
        n(
          "digitos",
          "Quantos números de três algarismos têm a soma dos algarismos igual a 3?",
          6,
          "Centena de 1 a 3: 102, 111, 120, 201, 210, 300.",
          {
            misreads: [
              {
                value: 10,
                feedback: "10 contaria números como 003 e 030, que não têm três algarismos.",
              },
            ],
          },
        ),
        c(
          "digitos",
          "O número 2.024 escrito na base 5 termina em:",
          "4",
          ["0", "2"],
          "O último dígito na base 5 é o resto por 5: 2.024 = 5 × 404 + 4.",
          {
            feedback: ["Terminaria em 0 se fosse múltiplo de 5.", "O resto de 2.024 por 5 é 4."],
          },
        ),
        n(
          "digitos",
          "Quantas vezes o algarismo 7 é escrito ao numerar as páginas de 1 a 100?",
          20,
          "Nas unidades: 7, 17, ..., 97 (10 vezes); nas dezenas: 70 a 79 (10 vezes).",
          {
            misreads: [
              { value: 19, feedback: "77 conta duas vezes: uma nas unidades e outra nas dezenas." },
            ],
          },
        ),
        c(
          "digitos",
          "Um número é divisível por 11 quando:",
          "A soma alternada dos dígitos (+ − + ...) é múltiplo de 11",
          ["A soma dos dígitos é múltiplo de 11", "Os dois últimos dígitos formam múltiplo de 11"],
          "10 ≡ −1 módulo 11, então os dígitos alternam sinal: a diferença entre a soma dos dígitos de posição ímpar e a dos de posição par deve ser múltiplo de 11.",
          {
            feedback: [
              "Soma dos dígitos serve para 3 e 9.",
              "Olhar os dois últimos dígitos serve para 4 e 25; 121 é divisível por 11 e termina em 21.",
            ],
          },
        ),
      ],
    },
    {
      title: "Provar com inteiros",
      objective:
        "Construir argumentos curtos sobre inteiros: paridade, contradição, casos e existência.",
      introduction:
        "Uma prova com inteiros costuma usar poucas ideias: paridade, restos, fatoração, o menor contraexemplo. O objetivo é fechar todos os casos ou mostrar que um caso impossível decorreria da suposição.",
      estimatedMinutes: 18,
      specs: [
        c(
          "provar",
          "Para provar que não existem inteiros a e b com 4a + 6b = 25, o argumento certo é:",
          "O lado esquerdo é sempre par e 25 é ímpar",
          ["Testar a = 1, 2, 3 e ver que não dá", "25 não é múltiplo de 4"],
          "4a + 6b = 2(2a + 3b) é par.",
          {
            feedback: [
              "Testar poucos valores não prova para todos os inteiros.",
              "25 não ser múltiplo de 4 não impede, sozinho, a soma com 6b.",
            ],
          },
        ),
        n(
          "provar",
          "Qual é o menor inteiro positivo que não pode ser escrito como soma de dois quadrados perfeitos (incluindo 0² = 0)?",
          3,
          "1 = 1 + 0, 2 = 1 + 1, mas 3 não é 0 + 3, 1 + 2 nem 2 + 1 com quadrados.",
          { misreads: [{ value: 7, feedback: "7 também não é, mas 3 é menor." }] },
        ),
        c(
          "provar",
          "Se p é um primo maior que 3, então p² − 1 é sempre divisível por:",
          "24",
          ["5", "p"],
          "p² − 1 = (p − 1)(p + 1): dois pares consecutivos dão fator 8, e um dos três consecutivos p − 1, p, p + 1 é múltiplo de 3 e não é p.",
          {
            feedback: [
              "7² − 1 = 48 não é múltiplo de 5.",
              "p não divide p² − 1, porque p² − 1 ≡ −1 módulo p.",
            ],
          },
        ),
        n(
          "provar",
          "Quantos inteiros positivos n menores que 50 fazem n² + n ser múltiplo de 5?",
          19,
          "n(n + 1) ≡ 0 módulo 5 exige n ≡ 0 ou n ≡ 4: em 1..49 há 9 múltiplos de 5 e 10 números com resto 4.",
          {
            misreads: [{ value: 9, feedback: "Só contou os múltiplos de 5; n ≡ 4 também serve." }],
          },
        ),
        c(
          "provar",
          "A afirmação 'todo primo é ímpar' é falsa porque:",
          "2 é primo e é par",
          ["9 é ímpar e não é primo", "1 é ímpar"],
          "Um único contraexemplo derruba um 'todo'.",
          {
            feedback: [
              "9 não contradiz a frase; ela fala de primos, não de ímpares.",
              "1 não é primo e não é contraexemplo.",
            ],
          },
        ),
        n(
          "provar",
          "A soma de cinco inteiros consecutivos é 2.025. Qual é o do meio?",
          405,
          "A soma de cinco consecutivos é 5 vezes o do meio: 2.025 ÷ 5 = 405.",
          { misreads: [{ value: 403, feedback: "403 é o primeiro dos cinco; o do meio é 405." }] },
        ),
        c(
          "provar",
          "Para mostrar que existe um inteiro positivo com exatamente 100 divisores, basta:",
          "Exibir um exemplo, como 2⁴ × 3⁴ × 5³, que tem 5 × 5 × 4 = 100 divisores",
          ["Mostrar que 100 é par", "Provar que todo número tem no máximo 100 divisores"],
          "Existência se prova com um exemplo correto.",
          {
            feedback: [
              "A paridade de 100 não constrói o número.",
              "Isso é falso e não é o que se pede.",
            ],
          },
        ),
        c(
          "provar",
          "Por que 'funciona para n = 1, 2, 3, 4 e 5' não prova uma afirmação sobre todos os inteiros positivos?",
          "Porque ela pode falhar em algum n maior que 5",
          [
            "Porque cinco casos são poucos; dez bastariam",
            "Porque só provas com álgebra valem em matemática",
          ],
          "Casos particulares não cobrem infinitos casos: n² + n + 41 é primo para n de 0 a 39 e falha em n = 40.",
          {
            feedback: [
              "Nenhuma quantidade finita de casos cobre todos os inteiros.",
              "Casos podem ser parte de uma prova, mas precisam ser exaustivos.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt:
      "Organize os passos para achar o resto de uma potência grande, como 3¹⁰⁰ na divisão por 7.",
    labels: [
      "Calcular os restos das primeiras potências até o ciclo se repetir",
      "Anotar o período do ciclo",
      "Dividir o expoente pelo período e olhar o resto",
      "Ler o resto da potência na posição correspondente do ciclo",
    ],
    explanation:
      "O ciclo dos restos transforma um expoente enorme numa posição pequena dentro do período.",
  },
  justification: {
    prompts: [
      "Explique por que 360 tem 24 divisores usando a fatoração em primos.",
      "Explique por que não existem inteiros a e b com 4a + 6b = 25.",
      "Explique por que a diferença entre um número de dois algarismos e o número com os algarismos trocados é sempre múltiplo de 9.",
    ],
    samples: [
      "360 = 2³ × 3² × 5. Um divisor escolhe um expoente para o 2 (0 a 3, quatro opções), um para o 3 (0 a 2, três opções) e um para o 5 (0 ou 1, duas opções). Cada escolha dá um divisor diferente, e toda combinação é permitida: 4 × 3 × 2 = 24.",
      "4a é par e 6b é par, então 4a + 6b = 2(2a + 3b) é par para quaisquer inteiros a e b. Como 25 é ímpar, a igualdade nunca acontece. Não é preciso testar valores: a paridade decide todos os casos de uma vez.",
      "O número com dezena a e unidade b vale 10a + b; o trocado vale 10b + a. A diferença é 10a + b − 10b − a = 9a − 9b = 9(a − b). Como a − b é inteiro, a diferença é múltiplo de 9. Exemplo: 72 − 27 = 45 = 9 × 5.",
    ],
    focus: "a estrutura que decide todos os casos",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const e2 = 1 + (seed % 4);
      const e3 = 1 + (seed % 3);
      const e5 = seed % 2;
      const numero = 2 ** e2 * 3 ** e3 * 5 ** e5;
      const divisores = (e2 + 1) * (e3 + 1) * (e5 + 1);
      return c(
        "contar-divisores",
        `Quantos divisores positivos tem o número ${decimal(numero)}?`,
        `${divisores}`,
        [`${e2 * e3 * (e5 === 0 ? 1 : e5) + 1}`, `${divisores * 2}`],
        `${decimal(numero)} = 2${e2 > 1 ? sobrescrito(e2) : ""} × 3${e3 > 1 ? sobrescrito(e3) : ""}${e5 ? " × 5" : ""}; (${e2} + 1)(${e3} + 1)${e5 ? "(1 + 1)" : ""} = ${divisores}.`,
        {
          feedback: [
            "Multiplicou os expoentes e somou 1 no fim; some 1 a cada expoente antes de multiplicar.",
            "Contou o dobro; cada divisor corresponde a uma única escolha de expoentes.",
          ],
        },
      );
    }
    if (variant === 1) {
      const base = [2, 3, 7][seed % 3] ?? 2;
      const modulo = base === 2 ? 7 : base === 3 ? 5 : 10;
      const periodo = base === 2 ? 3 : 4;
      const expoenteBase = 50 + (Math.floor(seed / 3) % 60);
      // 2¹⁰⁰ na divisão por 7 já é uma missão.
      const expoente = base === 2 && expoenteBase === 100 ? 101 : expoenteBase;
      const restoExp = expoente % periodo;
      const ciclo: number[] = [];
      let r = 1;
      for (let i = 0; i < periodo; i++) {
        r = (r * base) % modulo;
        ciclo.push(r);
      }
      const resposta = ciclo[(restoExp + periodo - 1) % periodo] ?? 1;
      const erradas = ciclo.filter((v) => v !== resposta);
      return c(
        "resto-de-potencia",
        `Qual é o resto de ${base} elevado a ${expoente} na divisão por ${modulo}?`,
        `${resposta}`,
        [`${erradas[0]}`, `${erradas[1] ?? (resposta + 1) % modulo}`],
        `Os restos de ${base}ⁿ por ${modulo} repetem com período ${periodo}: ${ciclo.join(", ")}. Como ${expoente} = ${periodo} × ${Math.floor(expoente / periodo)} + ${restoExp}, o resto é ${resposta}.`,
        {
          feedback: [
            "Errou a posição dentro do ciclo dos restos.",
            "Errou a posição dentro do ciclo dos restos.",
          ],
        },
      );
    }
    const a = 6 * (2 + (seed % 5));
    const bBase = 4 * (3 + (seed % 7));
    // Evita b igual a a e os pares 18 e 24 e 18 e 12, que já aparecem numa missão.
    const b = bBase === a || (a === 18 && (bBase === 24 || bBase === 12)) ? bBase + 4 : bBase;
    const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
    const mdc = gcd(a, b);
    const mmc = (a * b) / mdc;
    return c(
      "mmc-de-dois-periodos",
      `Dois faróis piscam juntos agora. Um pisca a cada ${a} segundos e o outro a cada ${b} segundos. Depois de quantos segundos piscam juntos de novo?`,
      decimal(mmc),
      [decimal(a * b), decimal(mdc)],
      `mmc(${a}, ${b}) = ${a} × ${b} ÷ mdc(${a}, ${b}) = ${decimal(a * b)} ÷ ${mdc} = ${decimal(mmc)}.`,
      {
        feedback: [
          "Esse é o produto; como os períodos têm fatores em comum, o mmc é menor.",
          "Esse é o mdc; a pergunta pede o menor múltiplo comum.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "estruturas-numericas",
    title: "O número que conta seus divisores",
    prompt:
      "Investigue os números de 1 a 60: quantos divisores cada um tem, quais têm quantidade ímpar de divisores e por quê, e qual é o menor número com 12 divisores. Escreva a justificativa de cada descoberta.",
    lab: "groups",
    steps: [
      "Monte a tabela do número de divisores de 1 a 60 usando a fatoração.",
      "Identifique os que têm quantidade ímpar de divisores e prove por que são exatamente esses.",
      "Encontre o menor número com 12 divisores e justifique que não há menor.",
    ],
    rubric: [
      "Tabela correta com a fatoração usada (0–3)",
      "Prova de que só quadrados perfeitos têm número ímpar de divisores (0–3)",
      "Menor número com 12 divisores com justificativa de minimalidade (0–3)",
      "Escrita clara e organizada (0–1)",
    ],
  },
  homeSupport: [
    "Perguntem quantos divisores tem o número da casa ou o ano em que estamos e comparem com a fatoração.",
    "Brinquem de adivinhar restos: escolham um número grande e descubram o resto por 9 pela soma dos dígitos.",
  ],
};
