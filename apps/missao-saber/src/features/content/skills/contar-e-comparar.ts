import { c, n, type SkillPack } from "../skill-factory";

/**
 * Contar e comparar: contar até 100, dezenas e unidades, mais e menos,
 * juntar e separar, e comparar quantidades. Trilha Mirim 1.
 */
export const contarEComparar: SkillPack = {
  id: "contar-e-comparar",
  name: "Contar e comparar",
  domain: "mirim",
  lab: null,
  missions: [
    {
      title: "Quantos são?",
      objective: "Contar objetos com cuidado, em grupos de dez, e ler números até 100.",
      introduction:
        "Para contar muitas coisas, junte de 10 em 10. Cada grupo de 10 é uma dezena. As que sobram são as unidades. 3 dezenas e 4 unidades são 34.",
      free: true,
      specs: [
        n(
          "dezenas",
          "Lia tem 4 pacotes com 10 figurinhas e mais 3 figurinhas soltas. Quantas figurinhas ela tem?",
          43,
          "4 dezenas e 3 unidades: 43.",
          {
            misreads: [{ value: 7, feedback: "Somou 4 com 3, mas cada pacote tem 10 figurinhas." }],
          },
        ),
        c(
          "dezenas",
          "O número 52 tem quantas dezenas?",
          "5",
          ["2", "52"],
          "52 é 5 dezenas e 2 unidades.",
          {
            feedback: ["2 são as unidades.", "52 é o número inteiro, não as dezenas."],
          },
        ),
        n("dezenas", "Quantas unidades há em 6 dezenas?", 60, "Cada dezena tem 10: 6 × 10 = 60.", {
          misreads: [{ value: 6, feedback: "6 são as dezenas; cada dezena tem 10 unidades." }],
        }),
        c(
          "dezenas",
          "Qual número tem 7 dezenas e 0 unidades?",
          "70",
          ["7", "17"],
          "7 dezenas são 70.",
          {
            feedback: ["7 seria 7 unidades.", "17 é 1 dezena e 7 unidades."],
          },
        ),
        n(
          "dezenas",
          "Na sala há 2 caixas com 10 lápis e mais 8 lápis na mesa. Quantos lápis há ao todo?",
          28,
          "2 dezenas e 8 unidades: 28.",
          { misreads: [{ value: 10, feedback: "Somou 2 com 8; cada caixa tem 10 lápis." }] },
        ),
        c(
          "dezenas",
          "Qual é o número que vem logo depois de 39?",
          "40",
          ["30", "310"],
          "Depois de 39 fecha uma dezena: 40.",
          {
            feedback: [
              "30 vem antes de 39.",
              "310 junta o 3 com o 10; mas 10 unidades viram mais 1 dezena: 40.",
            ],
          },
        ),
        n("dezenas", "Qual é o número que vem logo antes de 60?", 59, "59 e depois 60.", {
          misreads: [{ value: 61, feedback: "61 vem depois de 60, não antes." }],
        }),
        c(
          "dezenas",
          "Para contar 35 bolinhas sem errar, o jeito mais fácil é:",
          "Fazer montinhos de 10 e contar as soltas",
          ["Contar de 2 em 2 sem separar", "Contar bem rápido de 1 em 1"],
          "3 montinhos de 10 e mais 5 soltas.",
          {
            feedback: [
              "Contar de 2 em 2 ajuda, mas sem montinhos é fácil perder a conta.",
              "Contar rápido de 1 em 1 é fácil de errar.",
            ],
          },
        ),
      ],
    },
    {
      title: "Mais ou menos?",
      objective: "Comparar números e quantidades e dizer quantos a mais ou a menos.",
      introduction:
        "Para comparar dois números, olhe primeiro as dezenas: 41 tem mais dezenas que 38, então 41 é maior. Para saber quantos a mais, conte do menor até o maior.",
      free: true,
      specs: [
        c(
          "comparar",
          "Qual número é maior: 47 ou 74?",
          "74",
          ["47", "São iguais"],
          "74 tem 7 dezenas; 47 tem 4.",
          {
            feedback: ["47 tem menos dezenas.", "Têm os mesmos algarismos em lugares diferentes."],
          },
        ),
        n(
          "comparar",
          "Ana tem 12 balas e Beto tem 9. Quantas balas Ana tem a mais?",
          3,
          "Do 9 até o 12 faltam 3.",
          { misreads: [{ value: 21, feedback: "21 soma as balas; a pergunta é quantas a mais." }] },
        ),
        c(
          "comparar",
          "Em qual grupo há menos crianças: 15 no pátio ou 51 na quadra?",
          "No pátio, com 15",
          ["Na quadra, com 51", "Nos dois é igual"],
          "15 tem 1 dezena; 51 tem 5.",
          {
            feedback: ["51 é o grupo maior.", "15 e 51 são números diferentes."],
          },
        ),
        n(
          "comparar",
          "Caio leu 20 páginas e Duda leu 26. Quantas páginas Duda leu a mais que Caio?",
          6,
          "26 − 20 = 6.",
          { misreads: [{ value: 46, feedback: "46 soma as páginas; a pergunta é a diferença." }] },
        ),
        c(
          "comparar",
          "Qual lista está em ordem do menor para o maior?",
          "8, 18, 28, 80",
          ["80, 28, 18, 8", "8, 28, 18, 80"],
          "Cada número é maior que o anterior.",
          {
            feedback: ["Essa está do maior para o menor.", "28 é maior que 18, então vem depois."],
          },
        ),
        n(
          "comparar",
          "Uma cesta tem 30 laranjas e outra tem 5 a menos. Quantas laranjas tem a segunda cesta?",
          25,
          "30 − 5 = 25.",
          { misreads: [{ value: 35, feedback: "5 a menos é tirar, não juntar." }] },
        ),
        c("comparar", "Qual número está entre 49 e 51?", "50", ["48", "52"], "49, 50, 51.", {
          feedback: ["48 vem antes de 49.", "52 vem depois de 51."],
        }),
        n(
          "comparar",
          "Mia tem 8 adesivos. Quantos faltam para ela ter 15?",
          7,
          "De 8 até 15 faltam 7.",
          { misreads: [{ value: 23, feedback: "23 soma 8 com 15; a pergunta é quanto falta." }] },
        ),
      ],
    },
    {
      title: "Juntar e separar",
      objective: "Resolver problemas de juntar, acrescentar, tirar e separar com números até 100.",
      introduction:
        "Juntar e acrescentar aumentam: usamos a conta de mais. Tirar, perder e dar diminuem: usamos a conta de menos. Pense no que aconteceu com as coisas antes de escolher a conta.",
      specs: [
        n(
          "juntar-separar",
          "Numa árvore havia 14 passarinhos. Chegaram mais 6. Quantos passarinhos ficaram na árvore?",
          20,
          "14 + 6 = 20.",
          {
            misreads: [{ value: 8, feedback: "Chegar mais passarinhos aumenta; é conta de mais." }],
          },
        ),
        c(
          "juntar-separar",
          "Léo tinha 25 bolinhas e deu 10 para o irmão. Com quantas ficou?",
          "15",
          ["35", "10"],
          "Deu, então diminuiu: 25 − 10 = 15.",
          {
            feedback: ["Dar faz ficar com menos.", "10 foi o que ele deu."],
          },
        ),
        n(
          "juntar-separar",
          "Numa festa havia 18 balões vermelhos e 12 azuis. Quantos balões havia ao todo?",
          30,
          "18 + 12 = 30.",
          { misreads: [{ value: 6, feedback: "Ao todo é juntar os dois grupos." }] },
        ),
        c(
          "juntar-separar",
          "Um ônibus tinha 30 pessoas. Desceram 8 no ponto. Quantas continuaram no ônibus?",
          "22",
          ["38", "8"],
          "30 − 8 = 22.",
          {
            feedback: ["Descer do ônibus diminui.", "8 foi quem desceu."],
          },
        ),
        n(
          "juntar-separar",
          "Bia tinha algumas figurinhas. Ganhou 5 e ficou com 17. Quantas ela tinha antes?",
          12,
          "17 − 5 = 12.",
          {
            misreads: [
              { value: 22, feedback: "Somou; se ela ganhou 5 e ficou com 17, antes tinha menos." },
            ],
          },
        ),
        c(
          "juntar-separar",
          "Seu Zé tinha 40 bananas na banca. Vendeu 12 de manhã e 10 à tarde. Quantas sobraram?",
          "18",
          ["28", "62"],
          "40 − 12 − 10 = 18.",
          {
            feedback: ["28 tira só as da manhã.", "62 juntou tudo em vez de tirar."],
          },
        ),
        n(
          "juntar-separar",
          "Um pote tem 50 biscoitos. Comeram alguns e sobraram 32. Quantos foram comidos?",
          18,
          "50 − 32 = 18.",
          { misreads: [{ value: 82, feedback: "Comer diminui; a conta é 50 − 32." }] },
        ),
        c(
          "juntar-separar",
          "'Dudu tinha 20 carrinhos e ganhou 7. Com quantos ele ficou?' Qual conta resolve?",
          "20 + 7",
          ["20 − 7", "7 − 20"],
          "Ganhar aumenta a quantidade.",
          {
            feedback: [
              "Ganhar não diminui.",
              "Inverteu a ordem; não dá para tirar 20 de 7, e ganhar aumenta.",
            ],
          },
        ),
      ],
    },
    {
      title: "Dobro, metade e grupos",
      objective: "Entender dobro, metade e grupos iguais com números pequenos.",
      introduction:
        "O dobro é duas vezes a quantidade: o dobro de 6 é 12. A metade é dividir em duas partes iguais: a metade de 10 é 5. Grupos iguais podem ser contados de 2 em 2, de 5 em 5 ou de 10 em 10.",
      specs: [
        n("dobro-metade", "Qual é o dobro de 8?", 16, "8 + 8 = 16.", {
          misreads: [{ value: 4, feedback: "4 é a metade de 8; o dobro é 8 + 8." }],
        }),
        c(
          "dobro-metade",
          "Qual é a metade de 20?",
          "10",
          ["40", "2"],
          "20 dividido em duas partes iguais: 10 e 10.",
          {
            feedback: ["40 é o dobro de 20.", "2 é o número de partes."],
          },
        ),
        n(
          "dobro-metade",
          "Três crianças ganharam 5 balas cada uma. Quantas balas foram ao todo?",
          15,
          "5 + 5 + 5 = 15.",
          { misreads: [{ value: 8, feedback: "Somou 3 com 5; são 3 grupos de 5." }] },
        ),
        c(
          "dobro-metade",
          "João tem 14 anos e sua irmã tem metade da idade dele. Quantos anos ela tem?",
          "7",
          ["28", "12"],
          "14 dividido por 2 é 7.",
          {
            feedback: ["28 é o dobro.", "12 tiraria só 2 anos."],
          },
        ),
        n(
          "dobro-metade",
          "Uma bicicleta tem 2 rodas. Quantas rodas têm 6 bicicletas?",
          12,
          "2, 4, 6, 8, 10, 12.",
          {
            misreads: [
              { value: 8, feedback: "Somou 6 com 2; cada uma das 6 bicicletas tem 2 rodas." },
            ],
          },
        ),
        c(
          "dobro-metade",
          "Vovó colocou 12 laranjas em 2 cestas, com a mesma quantidade em cada uma. Quantas laranjas ficaram em cada cesta?",
          "6",
          ["24", "10"],
          "Metade de 12 é 6.",
          {
            feedback: ["24 é o dobro de 12.", "10 e 2 não são partes iguais."],
          },
        ),
        n("dobro-metade", "Quantos dedos há em 4 mãos? Conte de 5 em 5.", 20, "5, 10, 15, 20.", {
          misreads: [{ value: 9, feedback: "Somou 4 com 5; cada mão tem 5 dedos." }],
        }),
        c(
          "dobro-metade",
          "Se o dobro de um número é 18, o número é:",
          "9",
          ["36", "16"],
          "9 + 9 = 18.",
          {
            feedback: [
              "36 é o dobro de 18.",
              "16 tirou 2 de 18; o número que somado com ele mesmo dá 18 é 9.",
            ],
          },
        ),
      ],
    },
    {
      title: "Pensar antes de contar",
      objective: "Escolher a conta certa e conferir se a resposta faz sentido.",
      introduction:
        "Antes de fazer a conta, pense se a quantidade vai aumentar ou diminuir. Depois de resolver, confira se a resposta faz sentido com a história.",
      estimatedMinutes: 15,
      specs: [
        n(
          "pensar",
          "Numa fila há 9 crianças. A Rita é a quarta, contando da frente. Quantas crianças estão atrás dela?",
          5,
          "3 na frente, Rita e 5 atrás: 3 + 1 + 5 = 9.",
          { misreads: [{ value: 6, feedback: "Contou a Rita junto com as de trás." }] },
        ),
        c(
          "pensar",
          "Um menino disse que tinha 10 balas, comeu 3 e ficou com 13. O que está errado?",
          "Ele deveria ficar com 7",
          ["Ele deveria ficar com 10", "Ele deveria ficar com 3"],
          "Comer diminui: 10 − 3 = 7, e não 13.",
          {
            feedback: [
              "10 é o que ele tinha antes de comer.",
              "3 é o que ele comeu, não o que sobrou.",
            ],
          },
        ),
        n(
          "pensar",
          "Uma escada tem 10 degraus. Pedro já subiu 6. Quantos faltam para chegar ao topo?",
          4,
          "10 − 6 = 4.",
          { misreads: [{ value: 16, feedback: "Faltam degraus; a conta é de menos." }] },
        ),
        c(
          "pensar",
          "Na sala há 12 meninas e 10 meninos. Quantas crianças há na sala?",
          "22",
          ["2", "12"],
          "12 + 10 = 22.",
          {
            feedback: ["2 é a diferença, não o total.", "12 são só as meninas."],
          },
        ),
        n(
          "pensar",
          "Uma caixa tem 6 ovos. Quantos ovos há em 3 caixas iguais?",
          18,
          "6 + 6 + 6 = 18.",
          { misreads: [{ value: 9, feedback: "Somou 6 com 3; são 3 caixas de 6." }] },
        ),
        c(
          "pensar",
          "Qual resposta faz sentido para 'quantos anos tem a avó da Júlia'?",
          "68",
          ["6", "680"],
          "Avós costumam ter entre 50 e 90 anos.",
          {
            feedback: ["6 anos é idade de criança.", "Ninguém tem 680 anos."],
          },
        ),
        n(
          "pensar",
          "Tomás tinha 30 reais. Gastou 12 no lanche e 8 no gibi. Quanto sobrou?",
          10,
          "30 − 12 − 8 = 10.",
          {
            misreads: [{ value: 18, feedback: "18 tira só o lanche; ele também comprou o gibi." }],
          },
        ),
        c(
          "pensar",
          "Depois de fazer uma conta, conferir a resposta serve para:",
          "Ver se ela combina com a história",
          ["Descobrir a resposta sem fazer a conta", "Deixar a conta mais rápida"],
          "Uma resposta que não combina com a história mostra que algo deu errado.",
          {
            feedback: [
              "Conferir vem depois da conta; não a substitui.",
              "Conferir leva um pouco mais de tempo, mas evita erros.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Coloque em ordem os passos para resolver um problema de conta.",
    labels: [
      "Ler o problema com calma",
      "Pensar se a quantidade aumenta ou diminui",
      "Fazer a conta",
      "Conferir se a resposta combina com a história",
    ],
    explanation: "Primeiro entender, depois escolher a conta, fazer e conferir.",
  },
  justification: {
    prompts: [
      "Léo tinha 25 bolinhas e deu 10 para o irmão. Explique por que essa é uma conta de menos.",
      "Explique por que a metade de 40 é 20.",
      "Explique por que 'comeu 3 e ficou com 13' está errado, se ele tinha 10.",
    ],
    samples: [
      "Quando o Léo dá bolinhas, elas saem da mão dele e vão para o irmão. Então ele fica com menos do que tinha. Se tinha 25 e deu 10, desenho 25 bolinhas e risco 10: sobram 15.",
      "Metade é repartir em duas partes iguais. 40 são 4 dezenas. Ponho 2 dezenas em cada parte, e cada parte fica com 20. Confiro: 20 + 20 = 40. Então a metade de 40 é 20.",
      "Comer faz as balas sumirem, então ele tem que ficar com menos de 10. Se comeu 3, fica com 10 − 3 = 7. Ficar com 13 seria ganhar balas, não comer.",
    ],
    focus: "a escolha da conta",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const dezenas = 2 + (seed % 7);
      // De 2 a 9 soltas (sem o singular) e nunca iguais às dezenas.
      const soltas =
        2 + (seed % 8) === dezenas ? (dezenas === 9 ? 2 : dezenas + 1) : 2 + (seed % 8);
      // 4 pacotes e 3 soltas e 2 caixas e 8 soltos já são contas da missão 1.
      const unidades =
        (dezenas === 4 && soltas === 3) || (dezenas === 2 && soltas === 8) ? soltas - 1 : soltas;
      return c(
        "pacotes-e-soltas",
        `Rui tem ${dezenas} pacotes com 10 figurinhas e mais ${unidades} figurinhas soltas. Quantas figurinhas ele tem?`,
        `${dezenas * 10 + unidades}`,
        [`${dezenas + unidades}`, `${unidades * 10 + dezenas}`],
        `${dezenas} dezenas e ${unidades} unidades: ${dezenas * 10 + unidades}.`,
        {
          feedback: [
            "Somou pacotes e soltas, mas cada pacote tem 10 figurinhas.",
            "Trocou as dezenas com as unidades.",
          ],
        },
      );
    }
    if (variant === 1) {
      const menor = 5 + (seed % 12);
      const diferencaBase = 2 + (Math.floor(seed / 12) % 7);
      // 12 e 9, 15 e 8 e 10 e 6 já são contas das missões 2 e 5.
      const repetida = [
        [9, 3],
        [8, 7],
        [6, 4],
      ].some(([m, d]) => m === menor && d === diferencaBase);
      const diferenca = repetida ? diferencaBase + 1 : diferencaBase;
      const maior = menor + diferenca;
      return c(
        "quantos-a-mais",
        `Nina tem ${maior} adesivos e Téo tem ${menor}. Quantos adesivos Nina tem a mais?`,
        `${diferenca}`,
        [`${maior + menor}`, `${diferenca + 1}`],
        `Do ${menor} até o ${maior} faltam ${diferenca}: ${maior} − ${menor} = ${diferenca}.`,
        {
          feedback: [
            "Somou os adesivos; a pergunta é quantos a mais.",
            "Contou um a mais: confira contando do menor até o maior.",
          ],
        },
      );
    }
    const tirou = 3 + (Math.floor(seed / 5) % 9);
    const inicioBase = 20 + (seed % 25);
    // Quando o início é o dobro do que saiu, o resto coincidiria com a errada;
    // 25 menos 10, 30 menos 8 e 30 menos 5 já são contas das missões 2 e 3.
    const repetida =
      (inicioBase === 25 && tirou === 10) || (inicioBase === 30 && (tirou === 8 || tirou === 5));
    const inicio = inicioBase === 2 * tirou || repetida ? inicioBase + 1 : inicioBase;
    return c(
      "quanto-sobrou",
      `Numa caixa havia ${inicio} lápis. A professora tirou ${tirou}. Quantos lápis ficaram na caixa?`,
      `${inicio - tirou}`,
      [`${inicio + tirou}`, `${tirou}`],
      `Tirar diminui: ${inicio} − ${tirou} = ${inicio - tirou}.`,
      {
        feedback: [
          "Tirar lápis diminui; é conta de menos.",
          "Esses são os lápis que saíram, não os que ficaram.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "contar-e-comparar",
    title: "A coleção em dezenas",
    prompt:
      "Escolha uma coleção da casa com mais de 20 coisas (botões, tampinhas, lápis). Faça montinhos de 10, escreva o número e compare com a coleção de alguém da família.",
    lab: null,
    steps: [
      "Separe a coleção em montinhos de 10 e conte os que sobram.",
      "Escreva quantas dezenas e unidades há e o número total.",
      "Compare com outra coleção: qual tem mais, e quantos a mais?",
    ],
    rubric: [
      "Montinhos de 10 feitos e contados (0–2)",
      "Número escrito com dezenas e unidades (0–3)",
      "Comparação com quantos a mais (0–2)",
      "Explicação oral ou por desenho (0–1)",
    ],
  },
  homeSupport: [
    "No supermercado, peçam para a criança contar as frutas de 10 em 10 e dizer quantas dezenas há.",
    "Brinquem de 'quem tem mais': cada um pega um punhado de feijões, conta e descobre quantos a mais.",
  ],
};
