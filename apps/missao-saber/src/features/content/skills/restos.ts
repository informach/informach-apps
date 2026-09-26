import { c, n, type SkillPack } from "../skill-factory";

/**
 * Restos e divisibilidade: o resto como informação, critérios de
 * divisibilidade, ciclos que se repetem e argumentos com múltiplos.
 * Trilha OBMEP N2.
 */
export const restos: SkillPack = {
  id: "restos",
  name: "Restos e divisibilidade",
  domain: "obmep",
  lab: "groups",
  missions: [
    {
      title: "O que o resto conta",
      objective: "Interpretar quociente e resto em situações de agrupamento.",
      introduction:
        "Dividir é agrupar: o quociente diz quantos grupos completos cabem e o resto diz o que sobra. O resto é sempre menor que o divisor.",
      specs: [
        n(
          "quociente-e-resto",
          "Uma escola vai levar 250 estudantes em ônibus de 42 lugares. Quantos ônibus são necessários para que todos viajem sentados?",
          6,
          "250 ÷ 42 dá quociente 5 e resto 40; os 40 que sobram precisam de mais um ônibus: 6.",
          {
            misreads: [
              {
                value: 5,
                feedback: "Considerou só os ônibus completos e deixou 40 estudantes de fora.",
              },
            ],
          },
        ),
        c(
          "quociente-e-resto",
          "Ao dividir 100 por 7, o quociente é 14 e o resto é 2. Isso significa que:",
          "100 = 7 × 14 + 2",
          ["100 = 14 × 2 + 7", "100 ÷ 14 = 7 exatamente"],
          "Dividendo = divisor × quociente + resto, com resto menor que o divisor.",
          {
            feedback: [
              "Trocou os papéis de divisor e resto: 14 × 2 + 7 = 35.",
              "100 ÷ 14 não é exato: sobra 2.",
            ],
          },
        ),
        n(
          "quociente-e-resto",
          "Em uma fábrica, 1.000 parafusos são embalados em caixas de 24. Quantos parafusos sobram fora das caixas completas?",
          16,
          "1.000 = 24 × 41 + 16; sobram 16.",
          {
            misreads: [{ value: 41, feedback: "41 é o número de caixas completas, não a sobra." }],
          },
        ),
        c(
          "resto-menor-que-divisor",
          "Um número dividido por 9 deixa resto r. Qual valor de r é impossível?",
          9,
          [0, 8],
          "O resto vai de 0 a 8; se sobrassem 9, caberia mais um grupo de 9.",
          {
            feedback: [
              "Resto 0 acontece quando a divisão é exata.",
              "Resto 8 é o maior possível na divisão por 9.",
            ],
          },
        ),
        n(
          "quociente-e-resto",
          "Hoje é quarta-feira e queremos saber o dia da semana daqui a 30 dias. Quantos dias sobram depois de retirar as semanas completas?",
          2,
          "30 = 7 × 4 + 2: passam 4 semanas e sobram 2 dias, então será sexta-feira.",
          {
            misreads: [
              {
                value: 4,
                feedback: "4 é o número de semanas completas; o dia da semana depende do resto.",
              },
            ],
          },
        ),
        c(
          "ciclos",
          "As luzes de uma árvore repetem o ciclo vermelho, verde, azul, amarelo. Qual é a cor da 50ª luz?",
          "Verde",
          ["Vermelho", "Amarelo"],
          "50 = 4 × 12 + 2: a 50ª luz é a 2ª do ciclo, verde.",
          {
            feedback: [
              "Vermelho seria a 49ª, a primeira do ciclo seguinte.",
              "Amarelo é a 4ª de cada ciclo, ou seja, as posições múltiplas de 4, como a 48ª e a 52ª.",
            ],
          },
        ),
        n(
          "quociente-e-resto",
          "Um número dividido por 8 dá quociente 15 e resto 7. Que número é esse?",
          127,
          "8 × 15 + 7 = 127.",
          { misreads: [{ value: 120, feedback: "Esqueceu de somar o resto." }] },
        ),
        c(
          "quociente-e-resto",
          "Distribuindo 85 balas igualmente entre 6 crianças, cada uma recebe:",
          "14 balas, e sobra 1",
          ["14 balas, e sobram 6", "15 balas, e não sobra nada"],
          "85 = 6 × 14 + 1.",
          {
            feedback: [
              "Se sobrassem 6, daria para dar mais uma bala a cada criança.",
              "6 × 15 = 90, mais do que as 85 balas.",
            ],
          },
        ),
      ],
    },
    {
      title: "Critérios que economizam contas",
      objective: "Aplicar critérios de divisibilidade por 2, 3, 4, 5, 6, 8, 9 e 10.",
      introduction:
        "Os critérios olham para algarismos finais ou para a soma dos algarismos. Saber por que funcionam evita decorar: 10 é múltiplo de 2 e de 5, e 9 divide 10 − 1.",
      specs: [
        c(
          "criterio-por-soma",
          "Qual número é divisível por 3?",
          "4.512",
          ["4.513", "2.023"],
          "A soma dos algarismos de 4.512 é 12, múltiplo de 3.",
          {
            feedback: [
              "4 + 5 + 1 + 3 = 13, que não é múltiplo de 3.",
              "2 + 0 + 2 + 3 = 7, que não é múltiplo de 3.",
            ],
          },
        ),
        n(
          "criterio-por-soma",
          "Qual é o menor algarismo que colocado no lugar de ? torna 7?4 divisível por 9?",
          7,
          "7 + ? + 4 precisa ser múltiplo de 9; 11 + 7 = 18.",
          { misreads: [{ value: 2, feedback: "Com 2 a soma é 13, que não é múltiplo de 9." }] },
        ),
        c(
          "criterio-por-final",
          "Um número termina em 0. Podemos garantir que ele é divisível por:",
          "2, 5 e 10",
          ["2, 4 e 8", "3, 5 e 10"],
          "Terminar em 0 garante divisão por 10 e, portanto, por 2 e por 5.",
          {
            feedback: [
              "Divisibilidade por 4 e por 8 depende dos dois e três últimos algarismos, não só do zero final.",
              "Divisibilidade por 3 depende da soma dos algarismos.",
            ],
          },
        ),
        n(
          "criterio-por-final",
          "Quantos números de 1 a 100 são divisíveis por 4?",
          25,
          "Os múltiplos de 4 até 100 são 4, 8, ..., 100: são 100 ÷ 4 = 25.",
          { misreads: [{ value: 24, feedback: "Esqueceu que 100 também é múltiplo de 4." }] },
        ),
        c(
          "criterio-combinado",
          "Um número é divisível por 6 quando:",
          "É par e a soma dos algarismos é múltiplo de 3",
          ["Termina em 6", "A soma dos algarismos é múltiplo de 6"],
          "6 = 2 × 3, e 2 e 3 não têm fator comum, então precisa dos dois critérios.",
          {
            feedback: [
              "16 termina em 6 e não é divisível por 6.",
              "A soma dos algarismos decide a divisão por 3 e por 9, não por 6: 33 tem soma 6 e é ímpar.",
            ],
          },
        ),
        n(
          "criterio-por-final",
          "Qual é o maior número de três algarismos divisível por 8?",
          992,
          "1.000 = 8 × 125, então 1.000 − 8 = 992 é o maior abaixo de mil.",
          { misreads: [{ value: 998, feedback: "998 ÷ 8 dá 124 com resto 6." }] },
        ),
        c(
          "criterio-por-soma",
          "O número 2.3?5 é divisível por 9 para exatamente um algarismo no lugar de ?. Qual?",
          8,
          [1, 4],
          "2 + 3 + ? + 5 = 10 + ?; para dar 18, ? = 8.",
          {
            feedback: ["Com 1 a soma é 11.", "Com 4 a soma é 14."],
          },
        ),
        c(
          "criterio-combinado",
          "Um número é divisível por 4 e por 6. Ele é necessariamente divisível por:",
          12,
          [24, 10],
          "O menor múltiplo comum de 4 e 6 é 12; 12 é divisível por 4 e por 6 e não por 24.",
          {
            feedback: [
              "12 é divisível por 4 e por 6, mas não por 24.",
              "12 não é divisível por 10.",
            ],
          },
        ),
      ],
    },
    {
      title: "Restos que se somam e se multiplicam",
      objective: "Operar com restos: soma, produto e potências módulo um divisor.",
      introduction:
        "O resto de uma soma é o resto da soma dos restos; o mesmo vale para o produto. Isso permite achar o resto de números enormes sem calculá-los.",
      specs: [
        n(
          "resto-da-soma",
          "Um número deixa resto 5 na divisão por 7 e outro deixa resto 4. Qual é o resto da soma dos dois na divisão por 7?",
          2,
          "5 + 4 = 9, e 9 deixa resto 2 na divisão por 7.",
          {
            misreads: [
              { value: 9, feedback: "9 é maior que 7; ainda dá para tirar mais um grupo de 7." },
            ],
          },
        ),
        c(
          "resto-do-produto",
          "Qual é o resto de 25 × 31 na divisão por 6?",
          1,
          [2, 0],
          "25 deixa resto 1 e 31 deixa resto 1; 1 × 1 = 1.",
          {
            feedback: [
              "2 é o resto da soma 25 + 31 = 56 na divisão por 6, não do produto.",
              "O produto de dois números que não são múltiplos de 6 pode ser múltiplo de 6, mas aqui 775 = 6 × 129 + 1.",
            ],
          },
        ),
        n(
          "resto-de-potencia",
          "Qual é o resto de 2¹⁰ na divisão por 3?",
          1,
          "2 deixa resto 2, 2² = 4 deixa resto 1; potências pares de 2 deixam resto 1.",
          { misreads: [{ value: 2, feedback: "Resto 2 aparece nas potências ímpares de 2." }] },
        ),
        c(
          "algarismo-final",
          "Qual é o algarismo das unidades de 7²⁰²⁶?",
          9,
          [7, 1],
          "As unidades de 7ⁿ repetem 7, 9, 3, 1; 2026 = 4 × 506 + 2, então é o 2º do ciclo: 9.",
          {
            feedback: [
              "7 é o 1º do ciclo, expoentes que deixam resto 1 na divisão por 4.",
              "1 aparece quando o expoente é múltiplo de 4.",
            ],
          },
        ),
        n(
          "resto-da-soma",
          "Qual é o resto da soma 1 + 2 + 3 + ... + 100 na divisão por 9?",
          1,
          "A soma é 5.050 = 9 × 561 + 1.",
          {
            misreads: [
              { value: 0, feedback: "5.050 não é múltiplo de 9: a soma dos algarismos é 10." },
            ],
          },
        ),
        c(
          "resto-do-produto",
          "O produto de três números consecutivos é sempre divisível por:",
          6,
          [4, 9],
          "Entre três consecutivos há um múltiplo de 2 e um múltiplo de 3.",
          {
            feedback: [
              "1 × 2 × 3 = 6 não é divisível por 4.",
              "1 × 2 × 3 = 6 não é divisível por 9.",
            ],
          },
        ),
        n(
          "resto-de-potencia",
          "Qual é o resto de 10¹⁰⁰ na divisão por 9?",
          1,
          "10 deixa resto 1 na divisão por 9, então toda potência de 10 também deixa resto 1.",
          { misreads: [{ value: 0, feedback: "10 não é múltiplo de 9, e nem suas potências." }] },
        ),
        c(
          "resto-da-soma",
          "Se n deixa resto 3 na divisão por 5, então 2n + 1 deixa resto:",
          2,
          [7, 1],
          "2 × 3 + 1 = 7, e 7 deixa resto 2 na divisão por 5.",
          {
            feedback: [
              "7 é maior que 5: ainda cabe um grupo de 5.",
              "Esqueceu o +1 ou dobrou errado: 2 × 3 = 6 deixa resto 1, e com o +1 fica 2.",
            ],
          },
        ),
      ],
    },
    {
      title: "Problemas que só o resto resolve",
      objective: "Modelar situações com múltiplos e restos e encontrar todos os valores possíveis.",
      introduction:
        "Muitos problemas dizem 'sobra' ou 'de tantos em tantos'. Escreva o número como divisor × quociente + resto e procure o que satisfaz todas as condições.",
      specs: [
        n(
          "condicoes-de-resto",
          "Um número entre 40 e 60 deixa resto 2 na divisão por 7 e resto 1 na divisão por 5. Que número é esse?",
          51,
          "Resto 2 por 7: 44, 51, 58; resto 1 por 5: só 51.",
          { misreads: [{ value: 44, feedback: "44 deixa resto 4 na divisão por 5." }] },
        ),
        c(
          "condicoes-de-resto",
          "Quantos números de 1 a 60 deixam resto 3 na divisão por 8?",
          8,
          [7, 6],
          "São 3, 11, 19, 27, 35, 43, 51 e 59: oito números.",
          {
            feedback: [
              "Esqueceu o 3, que é 8 × 0 + 3.",
              "Contou só os que ficam entre dois múltiplos de 8, esquecendo as pontas.",
            ],
          },
        ),
        n(
          "condicoes-de-resto",
          "Uma coleção de figurinhas pode ser arrumada em pilhas de 4, de 6 ou de 9 sem sobrar nenhuma. Qual é o menor número possível de figurinhas?",
          36,
          "O menor múltiplo comum de 4, 6 e 9 é 36.",
          {
            misreads: [
              {
                value: 216,
                feedback: "216 é o produto dos três; o menor múltiplo comum é bem menor.",
              },
            ],
          },
        ),
        c(
          "condicoes-de-resto",
          "Ana conta suas moedas de 3 em 3 e sobra 1; de 4 em 4 também sobra 1. Ela tem entre 20 e 30 moedas. Quantas?",
          25,
          [21, 28],
          "Número que deixa resto 1 por 3 e por 4: um a mais que um múltiplo de 12; entre 20 e 30, é 25.",
          {
            feedback: ["21 é múltiplo de 3: sobraria 0, não 1.", "28 é múltiplo de 4: sobraria 0."],
          },
        ),
        n(
          "condicoes-de-resto",
          "Um relógio marca 9 horas. Que horas marcará daqui a 100 horas? Responda só o número no mostrador de 12 horas.",
          1,
          "100 = 12 × 8 + 4; 9 + 4 = 13, e 13 no mostrador é 1 hora.",
          { misreads: [{ value: 13, feedback: "O mostrador volta ao 1 depois do 12." }] },
        ),
        c(
          "condicoes-de-resto",
          "Em uma fila, as pessoas são numeradas de 1 em diante e recebem um brinde as de número múltiplo de 6 e as de número múltiplo de 10. Entre 1 e 60, quantas recebem brinde?",
          14,
          [16, 12],
          "Múltiplos de 6: 10; de 10: 6; múltiplos de 30 contados duas vezes: 2. Total 10 + 6 − 2 = 14.",
          {
            feedback: [
              "16 soma sem descontar 30 e 60, que são múltiplos dos dois.",
              "12 desconta demais: só 30 e 60 são múltiplos de 6 e de 10.",
            ],
          },
        ),
        n(
          "condicoes-de-resto",
          "Um número de dois algarismos deixa resto 5 quando dividido por 6 e por 7 ao mesmo tempo. Qual é o maior número assim?",
          89,
          "Múltiplo comum de 6 e 7 mais 5: 42 + 5 = 47 ou 84 + 5 = 89.",
          {
            misreads: [
              {
                value: 47,
                feedback: "47 também serve, mas o pedido é o maior de dois algarismos.",
              },
            ],
          },
        ),
        c(
          "condicoes-de-resto",
          "Qual é o menor número que, dividido por 5, deixa resto 4 e, dividido por 4, deixa resto 3?",
          19,
          [9, 24],
          "Um a menos que um múltiplo comum de 5 e 4: 20 − 1 = 19.",
          {
            feedback: ["9 deixa resto 1 na divisão por 4.", "24 é múltiplo de 4: resto 0."],
          },
        ),
      ],
    },
    {
      title: "Restos para provar",
      objective:
        "Usar paridade e restos para justificar que algo é impossível ou sempre verdadeiro.",
      introduction:
        "Um resto que nunca muda é uma prova: se um processo preserva o resto e o alvo tem outro resto, o alvo é inatingível. Escreva a condição antes de concluir.",
      estimatedMinutes: 18,
      specs: [
        c(
          "argumento-por-resto",
          "É possível escrever 2.026 como soma de três números ímpares?",
          "Não, porque a soma de três ímpares é ímpar",
          ["Sim: 1.000 + 1.000 + 26", "Sim, desde que os três sejam diferentes"],
          "Ímpar + ímpar é par, e par + ímpar é ímpar; três ímpares somam um ímpar, e 2.026 é par.",
          {
            feedback: ["1.000 e 26 são pares.", "Serem diferentes não muda a paridade da soma."],
          },
        ),
        n(
          "argumento-por-resto",
          "Qual é o resto de 123.456.789 na divisão por 9?",
          0,
          "A soma dos algarismos é 45, múltiplo de 9; então o número é múltiplo de 9.",
          {
            misreads: [
              {
                value: 9,
                feedback: "O resto nunca é igual ao divisor: múltiplo de 9 deixa resto 0.",
              },
            ],
          },
        ),
        c(
          "argumento-por-resto",
          "Um quadrado perfeito, dividido por 4, pode deixar resto:",
          "0 ou 1",
          ["0, 1, 2 ou 3", "Só 0"],
          "(2k)² = 4k² deixa resto 0; (2k + 1)² = 4k² + 4k + 1 deixa resto 1.",
          {
            feedback: [
              "Nenhum quadrado deixa resto 2 ou 3 na divisão por 4.",
              "9 é quadrado e deixa resto 1.",
            ],
          },
        ),
        n(
          "argumento-por-resto",
          "Um tabuleiro tem 25 casas, e cada movimento troca a cor de exatamente duas casas. Começando com todas brancas, qual é o menor número de casas brancas que pode restar? Responda o número.",
          1,
          "Cada movimento muda a paridade de duas casas ao mesmo tempo, então o número de casas pretas é sempre par; 25 casas pretas é impossível, e 24 é possível.",
          {
            misreads: [
              {
                value: 0,
                feedback:
                  "Zero brancas seria 25 pretas, um número ímpar, impossível com trocas de duas em duas.",
              },
            ],
          },
        ),
        c(
          "argumento-por-resto",
          "A soma de 10 números inteiros consecutivos é sempre:",
          "Ímpar",
          ["Par", "Múltiplo de 10"],
          "Entre 10 consecutivos há 5 ímpares; a soma de 5 ímpares é ímpar e a de 5 pares é par: total ímpar.",
          {
            feedback: ["1 + 2 + ... + 10 = 55, ímpar.", "55 não é múltiplo de 10."],
          },
        ),
        n(
          "argumento-por-resto",
          "Qual é o menor número positivo que deve ser somado a 1.234 para obter um múltiplo de 7?",
          5,
          "1.234 = 7 × 176 + 2; faltam 7 − 2 = 5, e 1.239 = 7 × 177.",
          {
            misreads: [
              {
                value: 2,
                feedback: "2 é o resto; para completar o múltiplo seguinte, some 7 − 2.",
              },
            ],
          },
        ),
        c(
          "argumento-por-resto",
          "Se n é um inteiro qualquer, n² + n é sempre:",
          "Par",
          ["Ímpar", "Múltiplo de 4"],
          "n² + n = n(n + 1), produto de dois consecutivos: um deles é par.",
          {
            feedback: ["Com n = 1: 1 + 1 = 2, par.", "Com n = 1: 2 não é múltiplo de 4."],
          },
        ),
        c(
          "argumento-por-resto",
          "A diferença entre um número de dois algarismos e o número obtido trocando seus algarismos de lugar é sempre divisível por:",
          9,
          [11, 10],
          "(10a + b) − (10b + a) = 9a − 9b = 9(a − b).",
          {
            feedback: [
              "11 divide a soma dos dois números, 11(a + b), não a diferença.",
              "10 não: 21 − 12 = 9, que não é múltiplo de 10.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize um método para descobrir o resto de um número grande em uma divisão.",
    labels: [
      "Escrever o número como soma ou produto de partes mais simples",
      "Achar o resto de cada parte na divisão pedida",
      "Combinar os restos com a mesma operação e reduzir o resultado",
      "Conferir que o resto final é menor que o divisor",
    ],
    explanation:
      "Decompomos o número, trabalhamos com os restos das partes e reduzimos no final, conferindo que o resto ficou menor que o divisor.",
  },
  justification: {
    prompts: [
      "Explique por que o resto de uma divisão nunca pode ser maior ou igual ao divisor, com um exemplo.",
      "Um colega afirma que 4.752 não é divisível por 3 porque termina em 2. Explique o erro e mostre como decidir.",
      "Mostre por que a soma de dois números ímpares é sempre par, sem testar exemplos, e conclua algo sobre a soma de quatro ímpares.",
    ],
    samples: [
      "Se sobrasse uma quantidade maior ou igual ao divisor, ainda caberia pelo menos mais um grupo do tamanho do divisor, e o quociente aumentaria. Por exemplo, dizer que 20 dividido por 6 dá 2 com resto 8 está errado: dos 8 que sobram ainda sai um grupo de 6, e a resposta certa é 3 com resto 2.",
      "O algarismo final decide a divisibilidade por 2, 5 e 10, não por 3. Para o 3, somamos os algarismos: 4 + 7 + 5 + 2 = 18, múltiplo de 3, então 4.752 é divisível por 3 (4.752 = 3 × 1.584).",
      "Um ímpar é 2a + 1 e outro é 2b + 1. A soma é 2a + 2b + 2 = 2(a + b + 1), que é o dobro de um inteiro, portanto par. Somando dois pares desses, quatro ímpares também dão par.",
    ],
    focus: "a relação dividendo = divisor × quociente + resto",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const divisor = 6 + (seed % 5);
      const quociente = 12 + (seed % 11);
      const resto = 1 + (seed % (divisor - 1));
      const numero = divisor * quociente + resto;
      const faltam = divisor - resto;
      return c(
        "agrupar-e-sobrar",
        `Uma gráfica agrupa ${numero} folhetos em pacotes de ${divisor}. Quantos folhetos ficam fora dos pacotes completos?`,
        resto,
        [quociente, faltam === resto ? resto + 1 : faltam],
        `${numero} = ${divisor} × ${quociente} + ${resto}; sobram ${resto}.`,
        {
          feedback: [
            "Esse é o número de pacotes completos, não a sobra.",
            `Confira: ${divisor} × ${quociente} = ${divisor * quociente}, e ${numero} − ${divisor * quociente} = ${resto}.`,
          ],
        },
      );
    }
    if (variant === 1) {
      const ciclo = 3 + (seed % 4);
      const posicao = 20 + (seed % 61);
      const dentro = posicao % ciclo;
      const respostaIndice = dentro === 0 ? ciclo : dentro;
      return c(
        "posicao-no-ciclo",
        `Contas de um colar repetem um padrão de ${ciclo} cores, sempre na mesma ordem. A conta de número ${posicao} tem a mesma cor de qual conta do primeiro padrão?`,
        `A ${respostaIndice}ª`,
        [`A ${(respostaIndice % ciclo) + 1}ª`, `A ${((respostaIndice + ciclo - 2) % ciclo) + 1}ª`],
        `${posicao} = ${ciclo} × ${Math.floor(posicao / ciclo)} + ${dentro}; ${dentro === 0 ? `resto 0 significa a última do padrão, a ${ciclo}ª` : `o resto ${dentro} indica a ${dentro}ª cor`}.`,
        {
          feedback: [
            "Essa é a cor seguinte no padrão, não a da posição pedida.",
            "Essa é a cor anterior no padrão, não a da posição pedida.",
          ],
        },
      );
    }
    const modulo = 5 + (seed % 5);
    const restoA = 1 + (seed % (modulo - 1));
    const restoB = 1 + ((seed + 3) % (modulo - 1));
    const resposta = (restoA + restoB) % modulo;
    return c(
      "resto-da-soma-reservado",
      `Um número deixa resto ${restoA} na divisão por ${modulo}, e outro deixa resto ${restoB}. Qual é o resto da soma dos dois nessa mesma divisão?`,
      resposta,
      [
        restoA + restoB === resposta ? resposta + 1 : restoA + restoB,
        (resposta + modulo - 1) % modulo,
      ],
      `${restoA} + ${restoB} = ${restoA + restoB}, e ${restoA + restoB} deixa resto ${resposta} na divisão por ${modulo}.`,
      {
        feedback: [
          "Somou os restos e esqueceu de reduzir quando a soma passa do divisor, ou errou a soma.",
          "Não confere com a soma dos restos reduzida pelo divisor.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "restos",
    title: "O calendário que se repete",
    prompt:
      "Descubra em que dia da semana cai o seu aniversário nos próximos cinco anos, sem olhar um calendário, usando apenas restos na divisão por 7 e o cuidado com anos bissextos.",
    lab: "groups",
    steps: [
      "Anote o dia da semana do seu próximo aniversário e explique por que um ano comum desloca o dia da semana em 1 e um bissexto em 2.",
      "Calcule os cinco anos seguintes usando restos, registrando cada passo.",
      "Confira com um calendário só no final e explique qualquer diferença encontrada.",
    ],
    rubric: [
      "Regra dos deslocamentos justificada com 365 = 7 × 52 + 1 (0–2)",
      "Cinco anos calculados com os restos certos, incluindo bissextos (0–3)",
      "Conferência e explicação das diferenças (0–2)",
      "Registro organizado passo a passo (0–1)",
    ],
  },
  homeSupport: [
    "Ao dividir uma sobremesa, um pacote de figurinhas ou moedas entre as pessoas da casa, pergunte quanto sobra antes de contar e como saber sem distribuir.",
    "Combinem um jogo de adivinhar o dia da semana de uma data próxima só contando de 7 em 7, e conversem sobre por que funciona.",
  ],
};
