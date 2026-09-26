import { c, n, type SkillPack } from "../skill-factory";

/**
 * Formas e posições: reconhecer figuras planas e sólidos, lados e cantos,
 * posições (em cima, embaixo, esquerda, direita, entre) e caminhos simples.
 * Trilha Mirim 1.
 */
export const formasEPosicoes: SkillPack = {
  id: "formas-e-posicoes",
  name: "Formas e posições",
  domain: "mirim",
  lab: "grid",
  missions: [
    {
      title: "Lados e cantos",
      objective: "Reconhecer triângulo, quadrado, retângulo e círculo pelos lados e cantos.",
      introduction:
        "Para reconhecer uma figura, conte os lados e os cantos. O triângulo tem 3 lados e 3 cantos. O retângulo tem 4 lados e 4 cantos retos, como o canto de uma folha; no quadrado, os 4 lados são iguais. O círculo é redondo e não tem lados retos nem cantos.",
      specs: [
        n("figuras", "Quantos lados tem um triângulo?", 3, "Tri quer dizer três: 3 lados.", {
          misreads: [{ value: 4, feedback: "4 lados tem o quadrado." }],
        }),
        c(
          "figuras",
          "Qual figura não tem nenhum canto?",
          "O círculo",
          ["O quadrado", "O triângulo"],
          "O círculo é todo redondo.",
          {
            feedback: ["O quadrado tem 4 cantos.", "O triângulo tem 3 cantos."],
          },
        ),
        n("figuras", "Quantos cantos têm juntos um quadrado e um triângulo?", 7, "4 + 3 = 7.", {
          misreads: [
            { value: 2, feedback: "2 é o número de figuras; a pergunta é sobre os cantos." },
          ],
        }),
        c(
          "figuras",
          "Uma figura tem 4 lados e 4 cantos retos: dois lados compridos e dois curtos. Ela é:",
          "Um retângulo",
          ["Um quadrado", "Um triângulo"],
          "Lados compridos e curtos, com 4 cantos retos: é um retângulo.",
          {
            feedback: ["No quadrado todos os lados são iguais.", "O triângulo tem 3 lados."],
          },
        ),
        n(
          "figuras",
          "Um desenho tem 2 quadrados e 1 triângulo, todos separados. Quantos lados há ao todo?",
          11,
          "4 + 4 + 3 = 11.",
          { misreads: [{ value: 3, feedback: "3 é o número de figuras." }] },
        ),
        c(
          "figuras",
          "Qual objeto tem a forma de um círculo?",
          "Uma moeda vista de frente",
          ["Uma porta vista de frente", "Uma fatia de pizza vista de cima"],
          "A moeda é redonda.",
          {
            feedback: ["A porta parece um retângulo.", "A fatia parece um triângulo."],
          },
        ),
        n(
          "figuras",
          "Um quadrado grande foi cortado ao meio, de um lado ao outro, formando dois retângulos. Quantos cantos têm os dois retângulos juntos?",
          8,
          "Cada retângulo tem 4 cantos: 4 + 4 = 8.",
          { misreads: [{ value: 4, feedback: "4 cantos tem um retângulo só; são dois." }] },
        ),
        c(
          "figuras",
          "Todo quadrado também é um retângulo?",
          "Sim, é um retângulo com os 4 lados iguais",
          [
            "Não, o retângulo precisa ter lados diferentes",
            "Não, porque o quadrado tem mais cantos",
          ],
          "O quadrado tem 4 lados e 4 cantos retos, como o retângulo; só que com os lados iguais.",
          {
            feedback: [
              "O retângulo só precisa ter 4 cantos retos, e o quadrado tem.",
              "Os dois têm 4 cantos.",
            ],
          },
        ),
      ],
    },
    {
      title: "Sólidos à nossa volta",
      objective:
        "Reconhecer cubo, bola (esfera), cilindro, cone e caixa pelas faces e pelo que rola.",
      introduction:
        "O dado é um cubo, a bola é uma esfera, a lata é um cilindro e o chapéu de festa é um cone. Esses sólidos ocupam espaço. Os que têm partes redondas podem rolar; os que só têm partes planas não rolam.",
      specs: [
        c(
          "solidos",
          "Qual objeto tem a forma de um cubo?",
          "Um dado",
          ["Uma bola", "Uma lata de milho"],
          "O dado tem 6 faces quadradas iguais.",
          {
            feedback: ["A bola é uma esfera.", "A lata é um cilindro."],
          },
        ),
        n(
          "solidos",
          "Quantas faces tem um cubo?",
          6,
          "Em cima, embaixo, frente, trás e dois lados: 6.",
          { misreads: [{ value: 4, feedback: "Esqueceu as faces de cima e de baixo." }] },
        ),
        c(
          "solidos",
          "Qual destes sólidos rola em qualquer direção?",
          "A bola",
          ["O dado", "A caixa de sapato"],
          "A esfera é redonda por todos os lados.",
          {
            feedback: [
              "O dado tem faces planas: tomba de face em face, não rola liso como a bola.",
              "A caixa também tem faces planas.",
            ],
          },
        ),
        c(
          "solidos",
          "Um chapéu de festa tem a forma de:",
          "Um cone",
          ["Um cubo", "Um cilindro"],
          "O cone tem uma ponta e a base redonda.",
          {
            feedback: ["O cubo tem 6 faces quadradas.", "O cilindro não tem ponta."],
          },
        ),
        n(
          "solidos",
          "Uma lata de milho fechada tem uma tampa plana e redonda em cima. Quantas partes planas e redondas ela tem ao todo?",
          2,
          "A tampa de cima e o fundo.",
          { misreads: [{ value: 1, feedback: "Esqueceu o fundo da lata." }] },
        ),
        c(
          "solidos",
          "Uma caixa de sapato, olhada bem de cima, parece:",
          "Um retângulo",
          ["Um círculo", "Um triângulo"],
          "A tampa da caixa é retangular.",
          {
            feedback: ["Não tem partes redondas.", "Não tem três lados."],
          },
        ),
        n(
          "solidos",
          "Quantas faces têm 2 dados juntos?",
          12,
          "Cada dado tem 6 faces: 6 + 6 = 12.",
          { misreads: [{ value: 6, feedback: "6 são as faces de um dado só." }] },
        ),
        c(
          "solidos",
          "Qual sólido pode rolar, mas também pode ficar parado em pé?",
          "Uma lata (cilindro)",
          ["Uma bola (esfera)", "Um dado (cubo)"],
          "Deitado, rola; em pé, fica parado.",
          {
            feedback: [
              "A bola rola de qualquer jeito e não fica parada em pé.",
              "O dado tem faces planas e só tomba de face em face.",
            ],
          },
        ),
      ],
    },
    {
      title: "Onde está?",
      objective: "Usar em cima, embaixo, à esquerda, à direita, entre, na frente e atrás.",
      introduction:
        "Para dizer onde uma coisa está, usamos palavras como em cima, embaixo, à esquerda, à direita, entre, na frente e atrás. A esquerda e a direita dependem de para onde a gente está olhando.",
      specs: [
        c(
          "posicao",
          "Numa estante, o livro azul está em cima do verde, e o verde está em cima do vermelho. Qual livro está no meio?",
          "O verde",
          ["O azul", "O vermelho"],
          "Azul em cima, verde no meio, vermelho embaixo.",
          {
            feedback: ["O azul está em cima de todos.", "O vermelho está embaixo de todos."],
          },
        ),
        n(
          "posicao",
          "Numa fila, Lua é a terceira contando da frente. Quantas crianças estão na frente dela?",
          2,
          "A primeira e a segunda.",
          { misreads: [{ value: 3, feedback: "3 é a posição da Lua; na frente dela há 2." }] },
        ),
        c(
          "posicao",
          "Da esquerda para a direita estão: gato, cachorro, coelho e pato. Quem está entre o cachorro e o pato?",
          "O coelho",
          ["O gato", "O pato"],
          "Gato, cachorro, coelho, pato: entre o cachorro e o pato está o coelho.",
          {
            feedback: [
              "O gato está na ponta esquerda, fora do trecho.",
              "O pato é um dos limites, não o que está entre.",
            ],
          },
        ),
        c(
          "posicao",
          "Você está de frente para um amigo. Ele estica o braço direito para o lado. Para você, esse braço está:",
          "Do seu lado esquerdo",
          ["Do seu lado direito", "Bem na sua frente"],
          "De frente, os lados ficam trocados.",
          {
            feedback: [
              "Se vocês estivessem lado a lado, olhando para o mesmo lado, seria a direita.",
              "O braço está esticado para o lado, não para a frente.",
            ],
          },
        ),
        n(
          "posicao",
          "Numa fila de 7 crianças, Beto está no meio. Quantas crianças estão atrás dele?",
          3,
          "3 na frente, Beto e 3 atrás.",
          { misreads: [{ value: 4, feedback: "Contou o Beto junto com as de trás." }] },
        ),
        c(
          "posicao",
          "O gato está debaixo da mesa. A bola está em cima da mesa. Então:",
          "A bola está acima do gato",
          ["O gato está acima da bola", "Os dois estão no mesmo lugar"],
          "A mesa fica entre eles.",
          {
            feedback: ["O gato está embaixo.", "Um está em cima e o outro embaixo."],
          },
        ),
        n(
          "posicao",
          "Num prédio, os andares vão do 1º ao 8º. Rita mora no 5º. Quantos andares há acima do dela?",
          3,
          "6º, 7º e 8º.",
          {
            misreads: [
              {
                value: 4,
                feedback: "Contou o andar da Rita junto; acima dela ficam o 6º, o 7º e o 8º.",
              },
            ],
          },
        ),
        c(
          "posicao",
          "Ana está atrás de Bia, e Bia está atrás de Caio. Quem está na frente de todos?",
          "Caio",
          ["Ana", "Bia"],
          "Caio, depois Bia, depois Ana.",
          {
            feedback: ["Ana está atrás de todos.", "Bia está no meio."],
          },
        ),
      ],
    },
    {
      title: "Caminhos na malha",
      objective:
        "Seguir e dar instruções de caminho com passos para cima, baixo, esquerda e direita.",
      introduction:
        "Numa malha de quadradinhos, um caminho é uma lista de passos: 2 para a direita, 1 para cima. Conte os passos com o dedo para não se perder.",
      specs: [
        c(
          "caminho",
          "Um robô anda 2 passos para a direita e depois 2 para a esquerda. Onde ele para?",
          "No mesmo lugar onde começou",
          ["2 passos à direita", "4 passos à esquerda"],
          "Os passos para a esquerda desfazem os da direita.",
          {
            feedback: ["Ele voltou os 2 passos.", "Ele andou só 2 para a esquerda."],
          },
        ),
        n(
          "caminho",
          "Um coelho anda 3 casas para cima e depois 2 casas para cima. Quantas casas para cima ele andou ao todo?",
          5,
          "3 + 2 = 5.",
          { misreads: [{ value: 1, feedback: "Os dois caminhos são para cima; somam." }] },
        ),
        c(
          "caminho",
          "Para ir de uma casa até a casa que fica 3 à direita e 1 acima, o caminho é:",
          "3 passos para a direita e 1 para cima",
          ["1 passo para a direita e 3 para cima", "3 passos para a esquerda e 1 para cima"],
          "Direita 3, cima 1.",
          {
            feedback: ["Trocou as quantidades.", "O destino está à direita, não à esquerda."],
          },
        ),
        n(
          "caminho",
          "Uma formiga anda 4 casas para a direita, depois 1 para a esquerda. A quantas casas à direita do começo ela está?",
          3,
          "4 − 1 = 3.",
          { misreads: [{ value: 5, feedback: "Andar para a esquerda volta; é conta de menos." }] },
        ),
        c(
          "caminho",
          "Uma malha tem 3 linhas e 3 colunas de quadradinhos. Quantos quadradinhos ela tem?",
          "9",
          ["6", "3"],
          "3 linhas de 3: 9.",
          {
            feedback: ["Somou 3 com 3; cada linha tem 3 quadradinhos.", "3 é só uma linha."],
          },
        ),
        n(
          "caminho",
          "Uma formiga anda pelas linhas de uma malha de 2 por 2 quadradinhos, do canto de baixo à esquerda até o canto de cima à direita. Cada passo é um lado de quadradinho, e ela só vai para a direita ou para cima. Quantos passos ela dá?",
          4,
          "2 passos para a direita e 2 para cima.",
          {
            misreads: [
              { value: 2, feedback: "É preciso andar 2 para a direita e também 2 para cima." },
            ],
          },
        ),
        c(
          "caminho",
          "Duas formigas saem do mesmo lugar. Uma anda 1 para cima e 2 para a direita. A outra anda 2 para a direita e 1 para cima. Onde elas param?",
          "No mesmo lugar",
          ["Uma do lado da outra", "Longe uma da outra"],
          "São os mesmos passos, em outra ordem.",
          {
            feedback: ["Os passos são iguais.", "Nenhuma andou mais que a outra."],
          },
        ),
        c(
          "caminho",
          "Para explicar um caminho a um amigo, o mais importante é dizer:",
          "Quantos passos dar e para que lado",
          ["Só o lugar de chegada", "Só para que lado ir"],
          "Quantidade e direção formam o caminho.",
          {
            feedback: [
              "Sem os passos e os lados, o amigo não sabe como chegar.",
              "Sem quantos passos, o amigo não sabe onde parar.",
            ],
          },
        ),
      ],
    },
    {
      title: "Montar e ver",
      objective: "Montar figuras com peças e imaginar o que aparece de cada lado.",
      introduction:
        "Com peças podemos montar figuras novas. Dois triângulos iguais, como os de um quadrado cortado de um canto ao outro, formam um quadrado; quatro quadradinhos formam um quadrado maior. Olhando de cima ou de lado, as coisas parecem diferentes.",
      estimatedMinutes: 15,
      specs: [
        n(
          "montar",
          "Quantos quadradinhos iguais formam um quadrado de 2 quadradinhos de lado?",
          4,
          "2 fileiras de 2: 4.",
          { misreads: [{ value: 2, feedback: "2 é o lado; o quadrado tem 2 fileiras de 2." }] },
        ),
        c(
          "montar",
          "Dois triângulos iguais, juntos pelo lado maior, podem formar:",
          "Um quadrado",
          ["Um triângulo maior", "Um círculo"],
          "Cortar um quadrado de um canto ao outro dá dois triângulos iguais; juntos de novo, formam o quadrado.",
          {
            feedback: [
              "Juntando pelo lado maior aparecem 4 cantos, não 3.",
              "Triângulos têm lados retos; não formam figuras redondas.",
            ],
          },
        ),
        n(
          "montar",
          "Uma torre tem 4 cubos empilhados. Olhando de cima, quantos quadrados você vê?",
          1,
          "De cima só aparece o cubo do topo.",
          { misreads: [{ value: 4, feedback: "4 quadrados aparecem de frente, não de cima." }] },
        ),
        c(
          "montar",
          "Um copo, olhado bem de cima, parece:",
          "Um círculo",
          ["Um quadrado", "Um triângulo"],
          "A boca do copo é redonda.",
          {
            feedback: ["O copo não tem cantos.", "O copo não tem lados retos."],
          },
        ),
        n(
          "montar",
          "Com 6 palitos iguais, quantos triângulos separados dá para fazer?",
          2,
          "Cada triângulo usa 3 palitos: 6 ÷ 3 = 2.",
          { misreads: [{ value: 3, feedback: "3 é quantos palitos cada triângulo usa." }] },
        ),
        c(
          "montar",
          "Três cubos estão lado a lado, da esquerda para a direita. Olhando de frente, você vê:",
          "3 quadrados lado a lado",
          ["1 quadrado", "3 círculos"],
          "Cada cubo mostra uma face quadrada.",
          {
            feedback: ["De frente aparecem os três.", "Cubos não têm faces redondas."],
          },
        ),
        n(
          "montar",
          "Com 8 palitos iguais, quantos quadrados separados dá para fazer?",
          2,
          "Cada quadrado usa 4 palitos: 8 ÷ 4 = 2.",
          { misreads: [{ value: 4, feedback: "4 é quantos palitos cada quadrado usa." }] },
        ),
        c(
          "montar",
          "Dobrei uma folha ao meio e fiz um furo que atravessa as duas partes. Quando abro a folha, quantos furos aparecem?",
          "2",
          ["1", "4"],
          "O furo passou pelas duas partes da folha.",
          {
            feedback: ["As duas partes foram furadas.", "4 seria com duas dobras."],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Coloque em ordem os passos para achar um brinquedo escondido com pistas de posição.",
    labels: [
      "Ler a primeira pista",
      "Achar o lugar que a primeira pista indica",
      "Ler a próxima pista e ajustar o lugar",
      "Conferir se o lugar achado combina com todas as pistas",
    ],
    explanation:
      "Cada pista ajuda a achar o lugar; no fim, conferir mostra que nenhuma pista ficou de fora.",
  },
  justification: {
    prompts: [
      "Explique por que, de frente para um amigo, o braço direito dele fica do seu lado esquerdo.",
      "Explique por que duas formigas que dão os mesmos passos, em ordens diferentes, param no mesmo lugar.",
      "Explique por que, olhando uma torre de cubos de cima, só aparece um quadrado.",
    ],
    samples: [
      "Quando fico de frente para o meu amigo, ele está virado para o lado contrário do meu. Por isso o lado direito dele fica do meu lado esquerdo.",
      "Uma formiga anda 1 para cima e 2 para a direita; a outra anda 2 para a direita e 1 para cima. As duas andaram, no total, 2 para a direita e 1 para cima. A ordem muda o caminho, mas não o lugar de chegada.",
      "De cima eu só vejo o topo do cubo que está em cima de todos. Os outros cubos ficam escondidos embaixo dele. Por isso aparece só um quadrado.",
    ],
    focus: "posição e ponto de vista",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const quadrados = 2 + (seed % 3);
      const triangulos = 2 + (Math.floor(seed / 3) % 3);
      const lados = 4 * quadrados + 3 * triangulos;
      return c(
        "lados-das-figuras",
        `Um desenho tem ${quadrados} quadrados e ${triangulos} triângulos, todos separados. Quantos lados há ao todo?`,
        `${lados}`,
        [`${quadrados + triangulos}`, `${4 * (quadrados + triangulos)}`],
        `${quadrados} × 4 + ${triangulos} × 3 = ${lados}.`,
        {
          feedback: [
            "Esse é o número de figuras, não de lados.",
            "Contou 4 lados também para os triângulos, que têm 3.",
          ],
        },
      );
    }
    if (variant === 1) {
      const direita = 4 + (seed % 4);
      const esquerda = 2 + (Math.floor(seed / 4) % (direita - 2));
      const final = direita - esquerda;
      return c(
        "direita-e-esquerda",
        `Uma formiga anda ${direita} casas para a direita e depois ${esquerda} casas para a esquerda. A quantas casas à direita do começo ela está?`,
        `${final}`,
        [`${direita + esquerda}`, `${direita}`],
        `Andar para a esquerda volta: ${direita} − ${esquerda} = ${final}.`,
        {
          feedback: [
            "Somou; andar para a esquerda faz voltar.",
            "Esqueceu os passos para a esquerda.",
          ],
        },
      );
    }
    const palitos = [3, 4][seed % 2] ?? 3;
    // De 5 a 8 figuras, nenhuma alternativa coincide com a resposta.
    const figuras = 5 + (Math.floor(seed / 2) % 4);
    const total = palitos * figuras;
    return c(
      "palitos-e-figuras",
      `Cada figura usa ${palitos} palitos. Com ${total} palitos iguais, quantas figuras separadas dá para fazer?`,
      `${figuras}`,
      [`${palitos}`, `${total - palitos}`],
      `${total} ÷ ${palitos} = ${figuras}.`,
      {
        feedback: [
          "Esse é o número de palitos de cada figura.",
          "Tirou os palitos de uma figura só, em vez de dividir.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "formas-e-posicoes",
    title: "Caça às formas",
    prompt:
      "Procure pela casa 5 objetos com formas diferentes (círculo, quadrado, retângulo, triângulo, cubo, cilindro). Desenhe cada um e escreva quantos lados ou faces ele tem.",
    lab: "grid",
    steps: [
      "Encontre 5 objetos com formas diferentes e diga o nome da forma.",
      "Desenhe cada objeto visto de frente e de cima.",
      "Conte os lados ou as faces e escreva ao lado do desenho.",
    ],
    rubric: [
      "Cinco objetos com formas nomeadas corretamente (0–3)",
      "Desenhos de frente e de cima (0–2)",
      "Lados ou faces contados corretamente (0–2)",
      "Explicação oral para um adulto (0–1)",
    ],
  },
  homeSupport: [
    "Brinquem de 'onde está': escondam um brinquedo e deem pistas com em cima, embaixo, à esquerda e à direita.",
    "Na cozinha, olhem copos, pratos e caixas de cima e de lado e perguntem que forma aparece.",
  ],
};
