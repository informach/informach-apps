import { c, n, type SkillPack } from "../skill-factory";

/**
 * Contagem inicial: contar com organização, agrupar e repartir, contar
 * maneiras de combinar, contar o que a figura esconde e escolher a conta
 * certa em situações do dia a dia. Trilhas Canguru P e Mirim 2.
 */
export const contagemInicial: SkillPack = {
  id: "contagem-inicial",
  name: "Contar com organização",
  domain: "common",
  lab: null,
  missions: [
    {
      title: "Contar sem esquecer e sem repetir",
      objective: "Contar objetos com uma ordem e contar de 2 em 2, de 5 em 5 e de 10 em 10.",
      free: true,
      introduction:
        "Para não errar a contagem, escolha uma ordem e siga sempre ela. Contar em grupos de 2, 5 ou 10 é mais rápido do que contar de 1 em 1.",
      specs: [
        n(
          "contar-em-grupos",
          "Em uma caixa há 6 pares de meias. Quantas meias há na caixa?",
          12,
          "Cada par tem 2 meias: 2, 4, 6, 8, 10, 12.",
          { misreads: [{ value: 6, feedback: "6 é o número de pares; cada par tem 2 meias." }] },
        ),
        c(
          "contar-em-grupos",
          "Lia contou os dedos de 4 mãos. Qual é a forma mais rápida de saber o total?",
          "Contar de 5 em 5: 5, 10, 15, 20",
          ["Contar de 1 em 1 até 4", "Contar de 2 em 2 até 8"],
          "Cada mão tem 5 dedos; 4 mãos dão 20 dedos.",
          {
            feedback: [
              "Contar até 4 conta as mãos, não os dedos.",
              "Contar de 2 em 2 até 8 daria 8 dedos, mas cada mão tem 5.",
            ],
          },
        ),
        n(
          "contar-em-grupos",
          "Em uma estante há 3 prateleiras com 10 livros em cada uma. Quantos livros há na estante?",
          30,
          "10, 20, 30: três grupos de 10.",
          { misreads: [{ value: 13, feedback: "Somou 3 com 10; são 3 grupos de 10 livros." }] },
        ),
        c(
          "contar-organizado",
          "Pedro quer contar as cadeiras de uma sala sem se perder. O que ele deve fazer?",
          "Contar fileira por fileira, sempre na mesma ordem",
          [
            "Contar as cadeiras que estão mais perto primeiro",
            "Contar bem rápido para não esquecer",
          ],
          "Uma ordem fixa evita pular ou repetir cadeiras.",
          {
            feedback: [
              "Começar pelas mais perto mistura as fileiras e alguma cadeira pode ficar de fora.",
              "Contar rápido sem ordem é o jeito mais fácil de errar.",
            ],
          },
        ),
        n(
          "contar-em-grupos",
          "Um triciclo tem 3 rodas. Quantas rodas têm 5 triciclos?",
          15,
          "3, 6, 9, 12, 15.",
          { misreads: [{ value: 8, feedback: "Somou 3 com 5; são 5 grupos de 3 rodas." }] },
        ),
        c(
          "contar-em-grupos",
          "Ana contou as pernas de 4 cachorros e chegou a 16. Como ela pode conferir?",
          "Contar de 4 em 4: 4, 8, 12, 16",
          ["Contar os cachorros de novo: 1, 2, 3, 4", "Contar de 2 em 2: 2, 4, 6, 8"],
          "Cada cachorro tem 4 pernas; 4 grupos de 4 são 16.",
          {
            feedback: [
              "Contar os cachorros confere quantos animais há, não quantas pernas.",
              "2, 4, 6, 8 são as pernas de 4 pessoas; cachorro tem 4 pernas, então os grupos são de 4.",
            ],
          },
        ),
        n(
          "contar-organizado",
          "Em uma fila há 8 crianças. Entre cada duas crianças vizinhas há um espaço. Quantos espaços há na fila?",
          7,
          "8 crianças formam 7 espaços entre vizinhas: sempre um a menos.",
          {
            misreads: [
              {
                value: 8,
                feedback: "Os espaços ficam entre as crianças; são um a menos do que elas.",
              },
            ],
          },
        ),
        c(
          "contar-em-grupos",
          "Em uma caixa há 2 dúzias de ovos. Quantos ovos são?",
          "24",
          ["12", "20"],
          "Uma dúzia são 12; duas dúzias são 12 + 12 = 24.",
          {
            feedback: ["12 é uma dúzia só.", "Uma dúzia tem 12, não 10."],
          },
        ),
      ],
    },
    {
      title: "Grupos e sobras",
      objective:
        "Repartir uma quantidade em grupos iguais e descobrir quantos grupos se formam e o que sobra.",
      free: true,
      introduction:
        "Repartir é fazer grupos do mesmo tamanho. Às vezes sobra alguma coisa que não completa um grupo. A sobra é sempre menor que o tamanho do grupo.",
      specs: [
        n(
          "repartir",
          "Bia tem 17 figurinhas e quer colar 5 em cada página. Quantas páginas ela completa?",
          3,
          "5, 10, 15: três páginas completas, e sobram 2 figurinhas.",
          {
            misreads: [
              {
                value: 4,
                feedback: "A quarta página ficaria com só 2 figurinhas; ela não fica completa.",
              },
            ],
          },
        ),
        c(
          "repartir",
          "Em uma turma de 23 alunos, a professora forma grupos de 4. Quantos alunos ficam sem grupo completo?",
          "3",
          ["5", "0"],
          "5 grupos de 4 usam 20 alunos; sobram 3.",
          {
            feedback: [
              "5 é o número de grupos completos, não a sobra.",
              "23 não é múltiplo de 4, então sobram alunos.",
            ],
          },
        ),
        n(
          "repartir",
          "Uma caixa tem 30 lápis. Quantos estojos de 6 lápis podem ser feitos?",
          5,
          "6, 12, 18, 24, 30: cinco estojos, sem sobra.",
          {
            misreads: [
              {
                value: 24,
                feedback: "24 é o que sobra ao tirar um estojo; a pergunta pede quantos estojos.",
              },
            ],
          },
        ),
        c(
          "repartir",
          "Ao repartir bolinhas em saquinhos de 7, a sobra pode ser no máximo:",
          "6",
          ["7", "8"],
          "Se sobrassem 7, daria para encher mais um saquinho.",
          {
            feedback: [
              "Com 7 sobrando, fecha-se mais um saquinho.",
              "A sobra nunca chega ao tamanho do grupo.",
            ],
          },
        ),
        n(
          "repartir",
          "Léo tem 26 balas e faz saquinhos de 8. Quantas balas sobram?",
          2,
          "3 saquinhos usam 24 balas; 26 − 24 = 2.",
          {
            misreads: [
              {
                value: 3,
                feedback: "3 é o número de saquinhos; a pergunta pede as balas que sobram.",
              },
            ],
          },
        ),
        c(
          "repartir",
          "Marina tem 20 flores para 4 vasos iguais. Quantas flores vão em cada vaso?",
          "5",
          ["4", "16"],
          "20 repartidas em 4 grupos iguais: 5 em cada.",
          {
            feedback: ["4 é o número de vasos.", "16 seria tirar 4 flores das 20, não repartir."],
          },
        ),
        n(
          "repartir",
          "Um ônibus leva 9 crianças por viagem. Quantas viagens são necessárias para levar 40 crianças?",
          5,
          "4 viagens levam 36; as 4 que faltam precisam de uma quinta viagem.",
          {
            misreads: [
              {
                value: 4,
                feedback:
                  "4 viagens levam só 36 crianças; faltam 4, que precisam de mais uma viagem.",
              },
            ],
          },
        ),
        c(
          "repartir",
          "João repartiu 18 bolinhas em grupos de 3 e depois em grupos de 6. Em qual caso formou mais grupos?",
          "Com grupos de 3, porque grupos menores dão mais grupos",
          ["Com grupos de 6, porque 6 é maior que 3", "Deu o mesmo número de grupos"],
          "Grupos de 3: 6 grupos. Grupos de 6: 3 grupos.",
          {
            feedback: [
              "Grupo maior gasta mais bolinhas, então formam-se menos grupos.",
              "6 grupos e 3 grupos são diferentes.",
            ],
          },
        ),
      ],
    },
    {
      title: "De quantas maneiras?",
      objective: "Contar combinações simples com uma lista ou uma tabela.",
      introduction:
        "Para saber de quantas maneiras dá para combinar duas escolhas, junte cada opção de uma com todas as opções da outra. Uma tabela ajuda a não esquecer nenhuma.",
      specs: [
        n(
          "combinar",
          "Rui tem 2 camisetas (azul e verde) e 3 bermudas (preta, cinza e branca). De quantas maneiras ele pode se vestir?",
          6,
          "Cada camiseta combina com as 3 bermudas: 3 + 3 = 6.",
          {
            misreads: [
              { value: 5, feedback: "Somou 2 com 3; cada camiseta combina com cada bermuda." },
            ],
          },
        ),
        c(
          "combinar",
          "Uma lanchonete tem 3 sabores de suco e 2 tipos de pão. Quantos lanches diferentes de suco com pão dá para montar?",
          "6",
          ["5", "3"],
          "3 sucos × 2 pães = 6 lanches.",
          {
            feedback: [
              "5 soma os sabores com os pães; é preciso combinar.",
              "3 é só o número de sucos.",
            ],
          },
        ),
        n(
          "combinar",
          "Com as cores vermelho, azul e amarelo, quantas bandeiras de duas listras de cores diferentes dá para fazer? A ordem das listras importa.",
          6,
          "Para a primeira listra há 3 cores; para a segunda sobram 2: 3 × 2 = 6.",
          {
            misreads: [
              {
                value: 9,
                feedback: "9 contaria listras da mesma cor; as duas devem ser diferentes.",
              },
            ],
          },
        ),
        c(
          "combinar",
          "Três amigos, Ana, Bia e Caio, vão apertar as mãos uma vez cada dupla. Quantos apertos de mão acontecem?",
          "3",
          ["6", "2"],
          "Ana e Bia, Ana e Caio, Bia e Caio: 3 duplas.",
          {
            feedback: [
              "6 conta cada aperto duas vezes; Ana com Bia é o mesmo aperto que Bia com Ana.",
              "Faltou uma dupla: são 3 duplas diferentes.",
            ],
          },
        ),
        n(
          "combinar",
          "Um cofre abre com uma letra (A ou B) seguida de um número (1, 2, 3 ou 4). Quantas senhas diferentes existem?",
          8,
          "Cada letra combina com 4 números: 4 + 4 = 8.",
          {
            misreads: [
              { value: 6, feedback: "Somou 2 com 4; cada letra combina com cada número." },
            ],
          },
        ),
        c(
          "combinar",
          "Para contar todas as duplas de sorvete com 4 sabores, sem repetir sabor e sem importar a ordem, o melhor jeito é:",
          "Fixar um sabor por vez e listar com quem ele combina",
          ["Contar os 4 sabores, um de cada vez", "Multiplicar 4 por 4 e achar 16 duplas"],
          "Fixando um sabor de cada vez, sem repetir duplas já contadas, o 1º sabor combina com os outros 3, o 2º com 2 novos e o 3º com 1 novo: 3 + 2 + 1 = 6 duplas.",
          {
            feedback: [
              "Contar os sabores dá 4, mas a pergunta é sobre duplas de sabores.",
              "4 × 4 conta duplas repetidas, como uva com limão e limão com uva, e duplas do mesmo sabor.",
            ],
          },
        ),
        n(
          "combinar",
          "Em um jogo, cada jogador escolhe um animal (gato, cão ou peixe) e uma cor (azul ou rosa). Quantas escolhas diferentes existem?",
          6,
          "3 animais × 2 cores = 6.",
          {
            misreads: [{ value: 5, feedback: "Somou 3 com 2; cada animal combina com cada cor." }],
          },
        ),
        c(
          "combinar",
          "Com os algarismos 1, 2 e 3, sem repetir, quantos números de dois algarismos dá para formar?",
          "6",
          ["9", "3"],
          "12, 13, 21, 23, 31, 32.",
          {
            feedback: [
              "9 inclui 11, 22 e 33, que repetem algarismo.",
              "Faltaram números: para cada primeiro algarismo há 2 opções.",
            ],
          },
        ),
      ],
    },
    {
      title: "Contar o que a figura esconde",
      objective:
        "Contar peças, faces e partes de figuras descritas, inclusive as que não aparecem de frente.",
      introduction:
        "Algumas coisas não aparecem à primeira vista: o lado de trás de uma pilha, os quadrados maiores dentro de uma malha, as faces que ficam escondidas. Contar por partes ajuda a não esquecer nada.",
      specs: [
        n(
          "figuras",
          "Um quadrado grande foi dividido em 4 quadradinhos iguais, como uma janela. Quantos quadrados há na figura ao todo, contando o grande?",
          5,
          "4 quadradinhos mais o quadrado grande: 5.",
          {
            misreads: [
              { value: 4, feedback: "Faltou contar o quadrado grande, que também é um quadrado." },
            ],
          },
        ),
        c(
          "figuras",
          "Um dado tem 6 faces. Quando ele está sobre a mesa, quantas faces dá para ver no máximo de uma vez?",
          "3",
          ["6", "5"],
          "Olhando de um canto vemos a de cima e duas de lado; as outras ficam escondidas.",
          {
            feedback: [
              "As faces de baixo e de trás não aparecem.",
              "Além da de baixo, ficam escondidas a de trás e um dos lados: só 3 aparecem.",
            ],
          },
        ),
        n(
          "figuras",
          "Uma pilha tem 3 cubos embaixo, 2 no meio e 1 em cima. Quantos cubos há na pilha?",
          6,
          "3 + 2 + 1 = 6.",
          {
            misreads: [
              { value: 3, feedback: "3 é só a camada de baixo; a pilha tem três camadas." },
            ],
          },
        ),
        c(
          "figuras",
          "Um cubo de madeira é pintado de vermelho por fora. Quantas faces pintadas ele tem?",
          "6",
          ["4", "8"],
          "Um cubo tem 6 faces: cima, baixo e 4 lados.",
          {
            feedback: [
              "4 são só os lados; faltam cima e baixo.",
              "8 é o número de cantos, não de faces.",
            ],
          },
        ),
        n(
          "figuras",
          "Um triângulo e um quadrado foram desenhados lado a lado, sem se encostar. Quantos lados há ao todo nas duas figuras?",
          7,
          "3 lados do triângulo mais 4 do quadrado: 7.",
          {
            misreads: [
              { value: 2, feedback: "2 é o número de figuras; a pergunta pede os lados." },
            ],
          },
        ),
        c(
          "figuras",
          "Uma fileira de 4 quadrados iguais foi montada com palitos, cada quadrado colado no vizinho. Quantos palitos foram usados?",
          "13",
          ["16", "12"],
          "O primeiro quadrado usa 4 palitos; cada quadrado seguinte usa só 3, porque divide um lado: 4 + 3 + 3 + 3 = 13.",
          {
            feedback: [
              "16 conta os lados compartilhados duas vezes.",
              "12 esquece que o primeiro quadrado precisa de 4 palitos.",
            ],
          },
        ),
        n(
          "figuras",
          "Em uma malha de 3 por 3 quadradinhos, quantos quadrados de 2 por 2 dá para encontrar?",
          4,
          "Um quadrado 2 por 2 pode começar em 2 colunas e 2 linhas: 2 × 2 = 4.",
          { misreads: [{ value: 9, feedback: "9 é o número de quadradinhos de 1 por 1." }] },
        ),
        c(
          "figuras",
          "Uma torre tem 10 cubos empilhados um sobre o outro. Quantas faces de cubo ficam escondidas por estarem encostadas em outro cubo?",
          "18",
          ["10", "20"],
          "Entre dois cubos vizinhos ficam 2 faces encostadas. Há 9 encontros: 9 × 2 = 18.",
          {
            feedback: [
              "10 é o número de cubos; cada encontro esconde 2 faces.",
              "20 contaria 10 encontros, mas 10 cubos têm 9 encontros.",
            ],
          },
        ),
      ],
    },
    {
      title: "Contar para decidir",
      objective: "Escolher a contagem certa em situações do dia a dia e explicar o resultado.",
      introduction:
        "Em um problema de verdade, primeiro é preciso decidir o que contar: pessoas, grupos, espaços, maneiras. Depois vem a conta. Conferir com um desenho evita erro.",
      estimatedMinutes: 18,
      specs: [
        n(
          "decidir",
          "Ao longo de uma rua de 40 metros serão plantadas árvores de 10 em 10 metros, com uma árvore em cada ponta. Quantas árvores serão plantadas?",
          5,
          "Nas posições 0, 10, 20, 30 e 40 metros: 5 árvores.",
          {
            misreads: [
              {
                value: 4,
                feedback: "4 é o número de espaços; com árvore nas duas pontas, são 5 árvores.",
              },
            ],
          },
        ),
        c(
          "decidir",
          "Um livro tem páginas numeradas de 1 a 12. Quantos algarismos foram escritos ao todo?",
          "15",
          ["12", "24"],
          "As páginas 1 a 9 usam 1 algarismo cada (9); as páginas 10, 11 e 12 usam 2 cada (6): 9 + 6 = 15.",
          {
            feedback: [
              "12 é o número de páginas; as páginas 10, 11 e 12 têm dois algarismos.",
              "24 daria dois algarismos para todas as páginas, mas de 1 a 9 é só um.",
            ],
          },
        ),
        n(
          "decidir",
          "Em um auditório há 6 fileiras com 8 cadeiras cada. 40 pessoas sentaram. Quantas cadeiras ficaram vazias?",
          8,
          "6 × 8 = 48 cadeiras; 48 − 40 = 8 vazias.",
          {
            misreads: [
              { value: 48, feedback: "48 é o total de cadeiras; a pergunta pede as vazias." },
            ],
          },
        ),
        c(
          "decidir",
          "Numa festa, cada criança ganha 2 balões. Havia 30 balões e sobraram 4. Quantas crianças havia?",
          "13",
          ["15", "26"],
          "Foram usados 30 − 4 = 26 balões; 26 balões são 13 pares.",
          {
            feedback: [
              "15 seria se todos os 30 balões fossem usados.",
              "26 é o número de balões usados, não de crianças.",
            ],
          },
        ),
        n(
          "decidir",
          "Uma escada tem 12 degraus. Duda sobe de 2 em 2 degraus. Quantos passos ela dá para chegar ao topo?",
          6,
          "12 ÷ 2 = 6 passos.",
          {
            misreads: [
              { value: 12, feedback: "12 é o número de degraus; cada passo vence 2 degraus." },
            ],
          },
        ),
        c(
          "decidir",
          "Um mês começou numa segunda-feira e tem 30 dias. Quantas segundas-feiras ele tem?",
          "5",
          ["4", "6"],
          "Segundas nos dias 1, 8, 15, 22 e 29: 5 segundas.",
          {
            feedback: [
              "Esqueceu a segunda do dia 29.",
              "A sexta segunda seria o dia 36, que não existe.",
            ],
          },
        ),
        n(
          "decidir",
          "Numa corrida, Téo chegou em 4º lugar e havia 5 pessoas atrás dele. Quantas pessoas correram?",
          9,
          "3 pessoas na frente, Téo e 5 atrás: 3 + 1 + 5 = 9.",
          { misreads: [{ value: 8, feedback: "Esqueceu de contar o próprio Téo." }] },
        ),
        c(
          "decidir",
          "Quando um problema pede 'quantas maneiras' em vez de 'quantos objetos', o que muda na contagem?",
          "Cada combinação de escolhas conta uma vez",
          ["Nada muda; é só contar os objetos", "É preciso sempre somar as opções"],
          "Maneiras se contam combinando escolhas, não contando coisas soltas; uma tabela ou lista ajuda a não esquecer nenhuma combinação.",
          {
            feedback: [
              "Contar objetos e contar combinações são perguntas diferentes.",
              "Somar as opções só vale quando se escolhe uma coisa ou outra, não uma e outra.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Coloque em ordem os passos para contar uma coleção grande sem errar.",
    labels: [
      "Decidir o que vai ser contado",
      "Escolher uma ordem para percorrer tudo",
      "Contar em grupos iguais, como de 5 em 5 ou de 10 em 10",
      "Conferir se nada foi pulado nem repetido",
    ],
    explanation:
      "Primeiro se sabe o que contar, depois como percorrer; os grupos aceleram a conta e a conferência fecha o trabalho.",
  },
  justification: {
    prompts: [
      "Explique por que 8 crianças em fila formam só 7 espaços entre elas. Pode usar um desenho com bolinhas e traços.",
      "Um colega diz que 2 camisetas e 3 bermudas dão 5 roupas. Mostre com uma lista por que são 6.",
      "Explique como você tem certeza de que contou todas as duplas possíveis entre 4 amigos.",
    ],
    samples: [
      "Se eu desenho 8 bolinhas em fila e ponho um traço entre cada duas vizinhas, o primeiro traço fica entre a 1ª e a 2ª e o último entre a 7ª e a 8ª. São 7 traços. O espaço sempre precisa de duas crianças, uma de cada lado, então dá um a menos.",
      "Com a camiseta azul dá para usar a bermuda preta, a cinza ou a branca: 3 roupas. Com a verde, mais 3. Ao todo 3 + 3 = 6. Somar 2 com 3 conta as peças, não as roupas montadas.",
      "Chamo os amigos de A, B, C e D. A faz dupla com B, C e D. B já foi com A, então sobram C e D. C já foi com A e B, sobra D. D já foi com todos. São 3 + 2 + 1 = 6 duplas e nenhuma repetida, porque cada vez eu só combino com quem ainda não apareceu.",
    ],
    focus: "a organização da contagem",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const grupo = 3 + (seed % 5);
      const grupos = 3 + (seed % 7);
      const sobra = 1 + (seed % (grupo - 1));
      const total = grupo * grupos + sobra;
      return c(
        "grupos-e-sobra",
        `Nino tem ${total} bolinhas de gude e faz saquinhos com ${grupo} bolinhas em cada um. Quantos saquinhos completos ele faz e quantas bolinhas sobram?`,
        `${grupos} saquinhos e ${sobra === 1 ? "sobra" : "sobram"} ${sobra}`,
        [`${grupos + 1} saquinhos e não sobra nenhuma`, `${grupos} saquinhos e sobram ${grupo}`],
        `${grupos} × ${grupo} = ${grupo * grupos}; ${total} − ${grupo * grupos} = ${sobra}.`,
        {
          feedback: [
            "Contou um saquinho a mais: ele não fica completo.",
            "Se sobrasse esse tanto, daria para encher mais um saquinho.",
          ],
        },
      );
    }
    if (variant === 1) {
      const a = 2 + (seed % 3);
      const b = 3 + (seed % 4);
      return c(
        "combinar-duas-escolhas",
        `Duda tem ${a} camisetas e ${b} bermudas, todas diferentes. De quantas maneiras ela pode escolher uma camiseta e uma bermuda?`,
        `${a * b}`,
        [`${a + b}`, `${a * b + b}`],
        `Cada um dos ${a} combina com os ${b}: ${a} × ${b} = ${a * b}.`,
        {
          feedback: [
            "Somou as quantidades; cada peça de um tipo combina com cada peça do outro.",
            "Contou um grupo a mais de combinações.",
          ],
        },
      );
    }
    const espacos = 4 + (seed % 9);
    const passo = 5 * (1 + (seed % 3));
    const comprimento = espacos * passo;
    return c(
      "postes-com-pontas",
      `Ao longo de um muro de ${comprimento} metros serão colocados postes de ${passo} em ${passo} metros, com um poste em cada ponta. Quantos postes serão colocados?`,
      `${espacos + 1}`,
      [`${espacos}`, `${espacos + 2}`],
      `${comprimento} ÷ ${passo} = ${espacos} espaços; com poste nas duas pontas, são ${espacos + 1} postes.`,
      {
        feedback: [
          "Esse é o número de espaços; há um poste a mais que espaços.",
          "Contou uma ponta a mais.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "contagem-inicial",
    title: "A contagem da casa",
    prompt:
      "Escolha uma coleção da sua casa com mais de 30 coisas (livros, talheres, peças de um jogo). Conte de um jeito organizado, registre como contou e confira de outro jeito.",
    lab: null,
    steps: [
      "Escolha a coleção e decida a ordem em que vai contar.",
      "Conte em grupos (de 5 ou de 10) e anote o total.",
      "Confira contando de outro jeito e explique se os dois resultados bateram.",
    ],
    rubric: [
      "Coleção e ordem de contagem descritas (0–2)",
      "Contagem em grupos registrada com o total (0–3)",
      "Conferência feita de outro jeito e comparada (0–2)",
      "Explicação clara do que faria diferente (0–1)",
    ],
  },
  homeSupport: [
    "Ao guardar compras ou brinquedos, peçam para a criança contar de 2 em 2 ou de 5 em 5 e depois conferir de 1 em 1.",
    "Perguntem quantas maneiras há de montar um lanche com duas escolhas da geladeira e montem juntos a lista.",
  ],
};
