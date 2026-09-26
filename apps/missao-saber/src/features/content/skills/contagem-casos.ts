import { c, n, type SkillPack } from "../skill-factory";

/**
 * Contagem por casos: princípio multiplicativo, separação em casos,
 * arranjos, combinações e argumentos de contagem. Compartilhada por
 * OBMEP N2 e Canguru C.
 */
export const contagemCasos: SkillPack = {
  id: "contagem-casos",
  name: "Contagem por casos",
  domain: "common",
  lab: "groups",
  missions: [
    {
      title: "Multiplicar possibilidades",
      objective: "Usar o princípio multiplicativo em escolhas sucessivas.",
      introduction:
        "Quando uma escolha é feita em etapas independentes, o total é o produto das opções de cada etapa. A pergunta certa é: quantas opções sobram em cada etapa?",
      specs: [
        n(
          "principio-multiplicativo",
          "Um lanche tem 3 opções de pão e 4 de recheio. Quantos lanches diferentes podem ser montados com um pão e um recheio?",
          12,
          "3 × 4 = 12.",
          {
            misreads: [
              { value: 7, feedback: "Somou as opções; escolhas sucessivas se multiplicam." },
            ],
          },
        ),
        c(
          "principio-multiplicativo",
          "Quantas senhas de 3 algarismos podem ser formadas usando só os algarismos 1, 2 e 3, podendo repetir?",
          27,
          [6, 9],
          "3 × 3 × 3 = 27.",
          {
            feedback: ["6 é a contagem sem repetição: 3 × 2 × 1.", "9 conta só duas posições."],
          },
        ),
        n(
          "permutacao-simples",
          "De quantas maneiras 4 amigos podem sentar em 4 cadeiras em fila?",
          24,
          "4 × 3 × 2 × 1 = 24.",
          {
            misreads: [
              { value: 16, feedback: "4 × 4 permitiria a mesma pessoa em duas cadeiras." },
            ],
          },
        ),
        c(
          "algarismos-distintos",
          "Quantos números de 2 algarismos distintos podem ser formados com 1, 2, 3, 4 e 5?",
          20,
          [25, 10],
          "5 opções para a dezena e 4 para a unidade: 5 × 4 = 20.",
          {
            feedback: [
              "25 permite repetir o algarismo.",
              "10 é o número de pares sem ordem; aqui 12 e 21 são números diferentes.",
            ],
          },
        ),
        n(
          "principio-multiplicativo",
          "Uma bandeira tem 3 faixas horizontais que devem ter cores diferentes, escolhidas entre 5 cores. Quantas bandeiras são possíveis?",
          60,
          "5 × 4 × 3 = 60.",
          {
            misreads: [
              {
                value: 125,
                feedback:
                  "5 × 5 × 5 permitiria repetir cores; as três faixas precisam ser diferentes.",
              },
            ],
          },
        ),
        c(
          "principio-multiplicativo",
          "Um restaurante oferece 4 entradas, 6 pratos e 3 sobremesas. Quem escolhe uma opção de cada tipo tem quantas refeições possíveis?",
          72,
          [13, 24],
          "4 × 6 × 3 = 72.",
          {
            feedback: ["13 soma as opções em vez de multiplicar.", "24 esquece as sobremesas."],
          },
        ),
        n(
          "contagem-com-restricao",
          "Quantos números de três algarismos são pares e começam com 7?",
          50,
          "Centena fixa 7; dezena qualquer (10 opções); unidade par (0, 2, 4, 6, 8: 5 opções): 1 × 10 × 5 = 50.",
          { misreads: [{ value: 45, feedback: "Excluiu o zero da dezena, mas 702 e 708 valem." }] },
        ),
        c(
          "principio-multiplicativo",
          "Quantas placas com 2 letras (de um alfabeto de 26) seguidas de 2 algarismos existem, com repetição permitida?",
          "67.600",
          ["6.760", "776"],
          "26 × 26 × 10 × 10 = 67.600.",
          {
            feedback: [
              "6.760 usa só um algarismo.",
              "776 soma as combinações de letras (676) com as de algarismos (100) em vez de multiplicar.",
            ],
          },
        ),
      ],
    },
    {
      title: "Separar em casos",
      objective: "Contar dividindo em casos que não se misturam e usando o complementar.",
      introduction:
        "Quando as possibilidades não seguem um padrão único, separe em casos que não têm sobreposição e some. Às vezes é mais fácil contar o que não serve e tirar do total.",
      specs: [
        n(
          "casos-com-sobreposicao",
          "Quantos números de 1 a 100 têm o algarismo 7?",
          19,
          "Com 7 nas unidades: 10 números; com 7 nas dezenas: 10; o 77 está nos dois grupos: 10 + 10 − 1 = 19.",
          { misreads: [{ value: 20, feedback: "Contou o 77 duas vezes." }] },
        ),
        c(
          "listar-casos",
          "Quantos números de dois algarismos têm a soma dos algarismos igual a 9?",
          9,
          [10, 8],
          "18, 27, 36, 45, 54, 63, 72, 81 e 90: nove números; 09 tem um algarismo só.",
          {
            feedback: ["10 conta o 09, que não tem dois algarismos.", "8 esquece o 90."],
          },
        ),
        n(
          "listar-casos",
          "De quantas maneiras é possível pagar exatamente R$ 10 usando apenas notas de R$ 2 e de R$ 5?",
          2,
          "Cinco notas de 2, ou duas notas de 5. Com uma nota de 5 sobram 5 reais, que não se pagam com notas de 2.",
          { misreads: [{ value: 3, feedback: "Uma nota de 5 mais notas de 2 nunca dá 10." }] },
        ),
        c(
          "listar-casos",
          "Quantos triângulos diferentes com lados de medidas inteiras têm perímetro 9?",
          3,
          [4, 2],
          "(1, 4, 4), (2, 3, 4) e (3, 3, 3). O trio (2, 2, 5) não fecha, pois 2 + 2 < 5.",
          {
            feedback: [
              "4 conta (2, 2, 5), que não forma triângulo.",
              "2 esquece um dos três casos válidos.",
            ],
          },
        ),
        n(
          "casos-com-sobreposicao",
          "Quantos números de 1 a 50 são múltiplos de 3 ou de 5?",
          23,
          "Múltiplos de 3: 16; de 5: 10; de 15 (contados duas vezes): 3. Total 16 + 10 − 3 = 23.",
          { misreads: [{ value: 26, feedback: "Somou sem descontar os múltiplos de 15." }] },
        ),
        c(
          "casos-com-sobreposicao",
          "Em uma sala há 30 alunos: 18 gostam de futebol, 15 de vôlei e 8 gostam dos dois. Quantos não gostam de nenhum dos dois?",
          5,
          [3, 13],
          "Gostam de pelo menos um: 18 + 15 − 8 = 25; sobram 30 − 25 = 5.",
          {
            feedback: [
              "3 vem de 33 − 30, mas 33 conta duas vezes quem gosta dos dois.",
              "13 desconta os 8 duas vezes.",
            ],
          },
        ),
        n(
          "listar-casos",
          "Quantos quadrados, de qualquer tamanho, podem ser vistos em um tabuleiro 3 × 3?",
          14,
          "9 quadrados de lado 1, 4 de lado 2 e 1 de lado 3: 14.",
          { misreads: [{ value: 9, feedback: "Contou só os quadradinhos de lado 1." }] },
        ),
        c(
          "listar-casos",
          "Quantos números inteiros de 10 a 99 têm os dois algarismos iguais?",
          9,
          [10, 90],
          "11, 22, ..., 99: nove números.",
          {
            feedback: [
              "10 conta o 00, que não está entre 10 e 99.",
              "90 é o total de números de dois algarismos.",
            ],
          },
        ),
      ],
    },
    {
      title: "Arranjos e ordem",
      objective: "Contar filas e anagramas, com e sem restrições.",
      introduction:
        "Quando a ordem importa, cada posição é uma etapa. Com restrição, comece pela posição mais limitada; com elementos que precisam ficar juntos, trate-os como um bloco.",
      specs: [
        n(
          "permutacao-simples",
          "De quantas maneiras 5 livros diferentes podem ser colocados em fila em uma prateleira?",
          120,
          "5 × 4 × 3 × 2 × 1 = 120.",
          { misreads: [{ value: 25, feedback: "5 × 5 repetiria livros em posições diferentes." }] },
        ),
        c(
          "arranjo",
          "De quantas maneiras podem ser definidos o 1º, o 2º e o 3º lugares em uma corrida com 6 participantes?",
          120,
          [216, 20],
          "6 × 5 × 4 = 120.",
          {
            feedback: [
              "216 permitiria a mesma pessoa em dois lugares.",
              "20 ignora a ordem dos lugares.",
            ],
          },
        ),
        n(
          "anagramas",
          "Quantos anagramas tem a palavra LIVRO?",
          120,
          "5 letras diferentes: 5 × 4 × 3 × 2 × 1 = 120.",
          { misreads: [{ value: 25, feedback: "5 × 5 não é o número de ordens de 5 letras." }] },
        ),
        c(
          "anagramas",
          "Quantos anagramas da palavra BOLA começam com vogal?",
          12,
          [24, 6],
          "Primeira letra O ou A (2 opções) e as outras 3 em qualquer ordem (6): 2 × 6 = 12.",
          {
            feedback: [
              "24 é o total de anagramas, sem a restrição.",
              "6 fixa uma única vogal na frente.",
            ],
          },
        ),
        n(
          "bloco-junto",
          "De quantas maneiras 4 pessoas podem sentar em fila se Ana e Beto querem ficar lado a lado?",
          12,
          "Junte Ana e Beto em um bloco: 3 blocos em 6 ordens, e o bloco tem 2 ordens internas: 6 × 2 = 12.",
          {
            misreads: [
              {
                value: 6,
                feedback: "Esqueceu que Ana e Beto podem trocar de lugar dentro do bloco.",
              },
            ],
          },
        ),
        c(
          "algarismos-distintos",
          "Quantos números de 3 algarismos distintos podem ser formados com 0, 1, 2, 3 e 4?",
          48,
          [60, 100],
          "Centena: 4 opções (não pode ser 0); dezena: 4 restantes; unidade: 3. 4 × 4 × 3 = 48.",
          {
            feedback: [
              "60 permite começar com 0, o que não dá um número de 3 algarismos.",
              "100 é 4 × 5 × 5: permite repetir algarismos.",
            ],
          },
        ),
        n(
          "anagramas",
          "Quantos anagramas tem a palavra ARARA?",
          10,
          "5 letras, com A repetido 3 vezes e R 2 vezes: 120 ÷ (6 × 2) = 10.",
          {
            misreads: [{ value: 120, feedback: "Tratou letras iguais como se fossem diferentes." }],
          },
        ),
        c(
          "bloco-junto",
          "De quantas maneiras 3 casais podem sentar em 6 cadeiras em fila de modo que cada casal fique junto?",
          48,
          [720, 6],
          "3 blocos em 6 ordens; cada bloco tem 2 ordens internas: 6 × 2 × 2 × 2 = 48.",
          {
            feedback: ["720 é sem nenhuma restrição.", "6 esquece as trocas dentro de cada casal."],
          },
        ),
      ],
    },
    {
      title: "Escolher sem ordem",
      objective: "Contar escolhas em que a ordem não importa.",
      introduction:
        "Quando a ordem não importa, contar como se importasse repete cada grupo várias vezes. Divida pelo número de ordens de cada grupo, ou pense em pares: n × (n − 1) ÷ 2.",
      specs: [
        n(
          "pares-sem-ordem",
          "Em uma reunião com 8 pessoas, cada uma cumprimenta todas as outras exatamente uma vez. Quantos cumprimentos acontecem?",
          28,
          "8 × 7 ÷ 2 = 28: cada cumprimento envolve duas pessoas e não pode ser contado duas vezes.",
          {
            misreads: [
              { value: 56, feedback: "Contou cada cumprimento duas vezes, uma para cada pessoa." },
            ],
          },
        ),
        c(
          "pares-sem-ordem",
          "De quantas maneiras podemos escolher 2 frutas diferentes entre 5 tipos?",
          10,
          [20, 25],
          "5 × 4 ÷ 2 = 10.",
          {
            feedback: [
              "20 conta a ordem da escolha.",
              "25 permite repetir a fruta e conta a ordem.",
            ],
          },
        ),
        n(
          "pares-sem-ordem",
          "Quantas diagonais tem um hexágono?",
          9,
          "De cada um dos 6 vértices saem 3 diagonais, e cada diagonal é contada duas vezes: 6 × 3 ÷ 2 = 9.",
          { misreads: [{ value: 18, feedback: "Contou cada diagonal pelas duas pontas." }] },
        ),
        c(
          "combinacao-de-tres",
          "Uma comissão de 3 alunos será escolhida entre 6. Quantas comissões diferentes são possíveis?",
          20,
          [120, 18],
          "6 × 5 × 4 conta cada comissão 6 vezes (as ordens de 3 pessoas): 120 ÷ 6 = 20.",
          {
            feedback: [
              "120 conta a ordem em que os alunos são escolhidos.",
              "18 é 6 × 3, sem relação com a escolha.",
            ],
          },
        ),
        n(
          "pares-sem-ordem",
          "Quantos segmentos podem ser traçados ligando dois a dois 7 pontos, sem três deles alinhados?",
          21,
          "7 × 6 ÷ 2 = 21.",
          { misreads: [{ value: 42, feedback: "Contou cada segmento pelas duas pontas." }] },
        ),
        c(
          "pares-sem-ordem",
          "Quantos subconjuntos com exatamente 2 elementos tem o conjunto {a, b, c, d}?",
          6,
          [8, 12],
          "4 × 3 ÷ 2 = 6: {a,b}, {a,c}, {a,d}, {b,c}, {b,d}, {c,d}.",
          {
            feedback: [
              "8 é 2 × 4, sem relação com pares.",
              "12 conta os pares em ordem, como (a, b) e (b, a).",
            ],
          },
        ),
        n(
          "pares-sem-ordem",
          "Em um campeonato, cada time joga uma vez contra cada um dos outros. Com 10 times, quantos jogos há?",
          45,
          "10 × 9 ÷ 2 = 45.",
          {
            misreads: [
              { value: 90, feedback: "Contou ida e volta, mas cada dupla joga só uma vez." },
            ],
          },
        ),
        c(
          "pares-sem-ordem",
          "Uma pizzaria oferece 6 sabores. Quantas pizzas de dois sabores diferentes podem ser pedidas?",
          15,
          [30, 36],
          "6 × 5 ÷ 2 = 15.",
          {
            feedback: [
              "30 conta a ordem dos sabores, mas meio a meio é a mesma pizza.",
              "36 permite repetir o sabor e conta a ordem.",
            ],
          },
        ),
      ],
    },
    {
      title: "Contagem para argumentar",
      objective: "Combinar princípios de contagem em problemas de várias etapas.",
      introduction:
        "Nos problemas maiores, decida primeiro se a ordem importa, depois se há casos ou restrições. Confira sempre em um exemplo pequeno que dá para listar à mão.",
      estimatedMinutes: 18,
      specs: [
        c(
          "caminhos-na-malha",
          "Em uma malha quadriculada, para ir de um ponto A a um ponto B andando só para a direita ou para cima, são necessários 3 passos para a direita e 2 para cima. Quantos caminhos diferentes existem?",
          10,
          [6, 5],
          "Basta escolher em quais 2 dos 5 passos vamos para cima: 5 × 4 ÷ 2 = 10.",
          {
            feedback: [
              "6 é 3 × 2, sem relação com a escolha das posições dos passos.",
              "5 é o número de passos, não de caminhos.",
            ],
          },
        ),
        n(
          "complementar",
          "Quantos números de 1 a 1.000 não são divisíveis nem por 2 nem por 5?",
          400,
          "Divisíveis por 2: 500; por 5: 200; por 10 (contados duas vezes): 100. Divisíveis por 2 ou 5: 600; restam 400.",
          {
            misreads: [
              {
                value: 300,
                feedback: "Subtraiu 700 sem descontar os múltiplos de 10 contados duas vezes.",
              },
            ],
          },
        ),
        c(
          "principio-multiplicativo",
          "Quantos números de 4 algarismos têm todos os algarismos ímpares?",
          625,
          [500, "3.125"],
          "5 opções (1, 3, 5, 7, 9) para cada uma das 4 posições: 5⁴ = 625.",
          {
            feedback: [
              "500 usa 5 × 100, misturando contagens.",
              "3.125 é 5⁵, com uma posição a mais.",
            ],
          },
        ),
        n(
          "mesa-redonda",
          "Em quantas ordens diferentes 6 pessoas podem sentar em torno de uma mesa redonda, considerando iguais as ordens que só giram a mesa?",
          120,
          "Fixe uma pessoa como referência; as outras 5 se organizam de 5 × 4 × 3 × 2 × 1 = 120 maneiras.",
          {
            misreads: [
              {
                value: 720,
                feedback: "720 conta como diferentes as ordens que são só giros da mesa.",
              },
            ],
          },
        ),
        c(
          "pares-sem-ordem",
          "Quantos números de dois algarismos têm o algarismo das dezenas maior que o das unidades?",
          45,
          [50, 36],
          "Escolha 2 algarismos diferentes de 0 a 9: 45 pares; só uma ordem põe o maior na dezena, e o maior nunca é 0.",
          {
            feedback: [
              "50 é metade de 100, mas algarismos iguais não contam e o 0 não pode ser dezena.",
              "36 exclui os pares com 0, mas 10, 20, ..., 90 valem.",
            ],
          },
        ),
        n(
          "casos-com-sobreposicao",
          "Uma urna tem bolas numeradas de 1 a 20. De quantas maneiras é possível retirar duas bolas cuja soma dos números seja par?",
          90,
          "Duas pares: 10 × 9 ÷ 2 = 45; duas ímpares: 45. Total 90.",
          {
            misreads: [
              { value: 190, feedback: "190 é o total de pares de bolas, sem a condição." },
            ],
          },
        ),
        c(
          "divisores",
          "Quantos divisores positivos tem o número 72?",
          12,
          [8, 9],
          "72 = 2³ × 3²; (3 + 1) × (2 + 1) = 12.",
          {
            feedback: [
              "8 esquece divisores como 18, 24 e 36.",
              "9 é o número de divisores de 36, não de 72.",
            ],
          },
        ),
        c(
          "objetos-identicos",
          "De quantas maneiras podemos distribuir 3 bolas idênticas em 2 caixas diferentes?",
          4,
          [8, 6],
          "A primeira caixa pode receber 0, 1, 2 ou 3 bolas, e a segunda fica com o resto: 4 maneiras.",
          {
            feedback: [
              "8 seria com bolas diferentes: 2 × 2 × 2.",
              "6 é 3 × 2, sem significado aqui.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize um método para contar possibilidades sem esquecer nem repetir.",
    labels: [
      "Entender o que é uma possibilidade e se a ordem importa",
      "Dividir em etapas sucessivas ou em casos que não se misturam",
      "Multiplicar as etapas e somar os casos",
      "Conferir com um caso pequeno listado à mão",
    ],
    explanation:
      "Primeiro definimos o que conta como possibilidade, depois estruturamos em etapas ou casos; multiplicamos e somamos e conferimos com uma lista pequena.",
  },
  justification: {
    prompts: [
      "Explique por que o número de maneiras de escolher 2 pessoas entre 5 é 10 e não 20, usando a ideia de ordem.",
      "Um colega diz que há 100 números de dois algarismos diferentes porque 10 × 10 = 100. Explique o erro e dê a contagem correta.",
      "Mostre por que contar os múltiplos de 3 ou de 5 exige descontar os múltiplos de 15, usando os números de 1 a 30.",
    ],
    samples: [
      "Escolhendo em ordem há 5 × 4 = 20 possibilidades, mas a dupla Ana e Beto é a mesma que Beto e Ana. Cada dupla aparece 2 vezes na contagem ordenada, então o número de duplas é 20 ÷ 2 = 10.",
      "10 × 10 permite o 0 na dezena (como 07, que não tem dois algarismos) e permite repetir o algarismo (como 33). Dezena: 9 opções (1 a 9); unidade: 9 opções, qualquer algarismo diferente da dezena. Total 9 × 9 = 81.",
      "De 1 a 30 há 10 múltiplos de 3 e 6 múltiplos de 5, mas 15 e 30 aparecem nas duas listas. Somando 10 + 6 = 16 contamos esses dois números duas vezes; o correto é 16 − 2 = 14.",
    ],
    focus: "a distinção entre escolhas com ordem e sem ordem",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const paes = 2 + (seed % 4);
      const recheios = 3 + (seed % 5);
      const molhos = 2 + (seed % 3);
      const answer = paes * recheios * molhos;
      const soma = paes + recheios + molhos;
      const semMolho = paes * recheios;
      return c(
        "cardapio-em-etapas",
        `Uma lanchonete tem ${paes} tipos de pão, ${recheios} de recheio e ${molhos} de molho. Quantos lanches com um item de cada tipo podem ser montados?`,
        answer,
        [soma === semMolho ? paes * (recheios + molhos) : soma, semMolho],
        `${paes} × ${recheios} × ${molhos} = ${answer}.`,
        {
          feedback: [
            "Somou ou misturou as opções em vez de multiplicar as três etapas.",
            "Esqueceu a etapa do molho.",
          ],
        },
      );
    }
    if (variant === 1) {
      const jogadores = 5 + (seed % 13);
      const answer = (jogadores * (jogadores - 1)) / 2;
      return c(
        "torneio-todos-contra-todos",
        `Em um torneio com ${jogadores} jogadores, cada um joga exatamente uma partida contra cada um dos outros. Quantas partidas acontecem?`,
        answer,
        [jogadores * (jogadores - 1), jogadores],
        `Cada partida é um par de jogadores: ${jogadores} × ${jogadores - 1} ÷ 2 = ${answer}.`,
        {
          feedback: [
            "Contou cada partida duas vezes, uma para cada jogador.",
            "Cada jogador joga várias partidas, não uma só.",
          ],
        },
      );
    }
    const maior = 4 + (seed % 6);
    const answer = maior * (maior - 1) * (maior - 2);
    return c(
      "tres-algarismos-distintos",
      `Quantos números de 3 algarismos distintos podem ser formados usando apenas os algarismos de 1 a ${maior}?`,
      answer,
      [maior * maior * maior, maior * (maior - 1)],
      `${maior} × ${maior - 1} × ${maior - 2} = ${answer}.`,
      {
        feedback: [
          "Permitiu repetir algarismos.",
          "Parou na segunda posição; o número tem três algarismos.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "contagem-casos",
    title: "Quantas roupas diferentes eu tenho?",
    prompt:
      "Conte quantas combinações de roupa você consegue montar com o que tem no armário, primeiro sem regras e depois com uma regra sua, como 'nunca duas estampas juntas'. Compare os dois números e explique a diferença.",
    lab: "groups",
    steps: [
      "Liste as peças por tipo e calcule o total de combinações sem restrição, mostrando a multiplicação.",
      "Escolha uma regra, conte as combinações que ela proíbe e as que sobram, por casos.",
      "Confira um caso pequeno listando à mão e explique por que a contagem por casos deu certo.",
    ],
    rubric: [
      "Total sem restrição com o princípio multiplicativo (0–2)",
      "Casos da regra separados sem sobreposição e somados (0–3)",
      "Conferência à mão em um caso pequeno (0–2)",
      "Registro que outra pessoa consegue seguir (0–1)",
    ],
  },
  homeSupport: [
    "Ao montar um lanche ou escolher uma roupa, perguntem quantas combinações diferentes seriam possíveis e como ter certeza de não esquecer nenhuma.",
    "Em uma mesa com várias pessoas, perguntem quantos cumprimentos acontecem se todos se cumprimentam uma vez, e testem com quatro pessoas antes de generalizar.",
  ],
};
