import { c, n, type SkillPack } from "../skill-factory";

/**
 * Composição de figuras: montar e desmontar figuras com peças, contorno de
 * figuras montadas com quadrados, dobrar e cortar, cobrir uma região com
 * peças iguais e reconhecer o que muda e o que não muda ao mover peças.
 * Trilhas Canguru P e Mirim 2.
 */
export const composicaoDeFiguras: SkillPack = {
  id: "composicao-de-figuras",
  name: "Montar figuras",
  domain: "common",
  lab: "grid",
  missions: [
    {
      title: "Peças que formam figuras",
      objective: "Montar figuras conhecidas com peças e contar quantas peças são necessárias.",
      introduction:
        "Figuras podem ser montadas com peças menores, como um quebra-cabeça. Dois triângulos iguais podem formar um quadrado; quatro quadradinhos formam um quadrado maior.",
      specs: [
        n(
          "montar",
          "Quantos quadradinhos iguais são necessários para montar um quadrado com 3 quadradinhos de lado?",
          9,
          "3 fileiras de 3: 3 × 3 = 9.",
          {
            misreads: [
              {
                value: 6,
                feedback: "6 seria 2 fileiras de 3; um quadrado de lado 3 tem 3 fileiras.",
              },
            ],
          },
        ),
        c(
          "montar",
          "Um quadrado de papel é cortado ao meio pela diagonal. Que figuras aparecem?",
          "Dois triângulos iguais",
          ["Dois retângulos iguais", "Dois quadrados menores"],
          "O corte de canto a canto forma dois triângulos do mesmo tamanho.",
          {
            feedback: [
              "Retângulos aparecem com um corte reto de um lado ao lado oposto.",
              "Quadrados menores aparecem com dois cortes, um em cada direção.",
            ],
          },
        ),
        n(
          "montar",
          "Com 2 triângulos iguais forma-se 1 quadrado. Quantos triângulos iguais são necessários para formar 5 quadrados iguais a esse?",
          10,
          "5 quadrados × 2 triângulos = 10.",
          {
            misreads: [
              { value: 7, feedback: "Somou 5 com 2; cada quadrado precisa de 2 triângulos." },
            ],
          },
        ),
        c(
          "montar",
          "Um retângulo tem 2 quadradinhos de altura e 4 de comprimento. Quantos quadradinhos ele tem?",
          "8",
          ["6", "16"],
          "2 fileiras de 4: 8 quadradinhos.",
          {
            feedback: ["6 soma 2 com 4; são 2 fileiras de 4.", "16 seria um quadrado de 4 por 4."],
          },
        ),
        n(
          "montar",
          "Uma peça em forma de L é feita com 3 quadradinhos. Quantas peças em L são necessárias para cobrir um retângulo de 3 por 4, com 12 quadradinhos, sem sobrar nem faltar?",
          4,
          "12 ÷ 3 = 4 peças.",
          { misreads: [{ value: 3, feedback: "3 é o tamanho de cada peça; 12 ÷ 3 dá 4 peças." }] },
        ),
        c(
          "montar",
          "Duas peças iguais em forma de L, cada uma com 3 quadradinhos, podem ser encaixadas para formar:",
          "Um retângulo de 2 por 3",
          ["Um quadrado de 2 por 2", "Um quadrado de 3 por 3"],
          "Dois L de 3 quadradinhos somam 6 quadradinhos e encaixam num retângulo de 2 por 3.",
          {
            feedback: [
              "Um quadrado de 2 por 2 tem só 4 quadradinhos, e as peças somam 6.",
              "Um quadrado de 3 por 3 tem 9 quadradinhos.",
            ],
          },
        ),
        n(
          "montar",
          "Um quadrado grande é montado com 4 quadrados médios. Cada quadrado médio é montado com 4 quadradinhos. Quantos quadradinhos tem o quadrado grande?",
          16,
          "4 × 4 = 16.",
          {
            misreads: [
              { value: 8, feedback: "Somou 4 com 4; cada um dos 4 médios tem 4 quadradinhos." },
            ],
          },
        ),
        c(
          "montar",
          "Para formar um hexágono com triângulos iguais, encostando todos num ponto central, são necessários:",
          "6 triângulos",
          ["4 triângulos", "8 triângulos"],
          "O hexágono tem 6 lados; um triângulo para cada lado, todos com um vértice no centro.",
          {
            feedback: [
              "4 triângulos em volta de um ponto formam um quadrado.",
              "8 triângulos formariam uma figura de 8 lados.",
            ],
          },
        ),
      ],
    },
    {
      title: "O contorno da figura",
      objective:
        "Contar o contorno de figuras montadas com quadradinhos e ver que juntar peças esconde lados.",
      introduction:
        "O contorno é a linha que dá a volta na figura. Quando dois quadradinhos se encostam, os lados encostados somem do contorno. Por isso figuras com a mesma quantidade de peças podem ter contornos diferentes.",
      specs: [
        n(
          "contorno",
          "Um quadradinho tem 4 lados de 1 centímetro. Dois quadradinhos encostados lado a lado formam um retângulo. Qual é o contorno desse retângulo, em centímetros?",
          6,
          "8 lados ao todo, menos os 2 lados encostados: 6.",
          {
            misreads: [
              {
                value: 8,
                feedback: "Os 2 lados encostados ficam dentro da figura e não contam no contorno.",
              },
            ],
          },
        ),
        c(
          "contorno",
          "Três quadradinhos de lado 1 em fila formam um retângulo. Qual é o seu contorno?",
          "8",
          ["12", "6"],
          "12 lados ao todo, menos 4 lados encostados (2 encontros × 2): 8.",
          {
            feedback: [
              "12 conta os lados escondidos entre os quadradinhos.",
              "6 é o contorno de 2 quadradinhos.",
            ],
          },
        ),
        n(
          "contorno",
          "Quatro quadradinhos de lado 1 formam um quadrado de 2 por 2. Qual é o contorno desse quadrado?",
          8,
          "Cada lado do quadrado grande mede 2: 4 × 2 = 8.",
          {
            misreads: [
              {
                value: 16,
                feedback: "16 conta todos os lados dos quadradinhos, inclusive os de dentro.",
              },
            ],
          },
        ),
        c(
          "contorno",
          "Quatro quadradinhos de lado 1 podem formar um quadrado de 2 por 2 ou uma fila de 4. Qual figura tem o contorno maior?",
          "A fila de 4, com contorno 10",
          ["O quadrado de 2 por 2, com contorno 8", "As duas têm o mesmo contorno"],
          "Na fila há 3 encontros (6 lados escondidos): 16 − 6 = 10. No quadrado há 4 encontros: 16 − 8 = 8.",
          {
            feedback: [
              "O quadrado tem mais lados escondidos, então o contorno é menor.",
              "Mesma quantidade de peças não garante o mesmo contorno.",
            ],
          },
        ),
        n(
          "contorno",
          "Uma figura em forma de L é feita com 3 quadradinhos de lado 1. Qual é o seu contorno?",
          8,
          "12 lados menos 4 escondidos em 2 encontros: 8.",
          {
            misreads: [
              { value: 12, feedback: "Faltou tirar os lados encostados entre os quadradinhos." },
            ],
          },
        ),
        c(
          "contorno",
          "Ao encostar um quadradinho a mais numa figura, encostando por um único lado, o contorno:",
          "Aumenta 2",
          ["Aumenta 4", "Não muda"],
          "O novo quadradinho traz 4 lados, mas 1 dele e 1 da figura ficam escondidos: 4 − 2 = 2.",
          {
            feedback: [
              "4 seria se nenhum lado ficasse escondido.",
              "O novo quadradinho traz 3 lados novos e esconde 1 antigo.",
            ],
          },
        ),
        n(
          "contorno",
          "Um retângulo de 2 por 5 quadradinhos de lado 1 é montado. Qual é o contorno?",
          14,
          "2 + 5 + 2 + 5 = 14.",
          { misreads: [{ value: 10, feedback: "10 é o número de quadradinhos, não o contorno." }] },
        ),
        c(
          "contorno",
          "Duas figuras têm 6 quadradinhos cada. Uma é um retângulo de 2 por 3 e a outra é uma fila de 6. Os contornos são:",
          "10 e 14",
          ["10 e 10", "12 e 14"],
          "Retângulo 2 por 3: 2 + 3 + 2 + 3 = 10. Fila de 6: 1 + 6 + 1 + 6 = 14.",
          {
            feedback: [
              "A fila é mais comprida e mostra mais lados.",
              "O retângulo de 2 por 3 tem contorno 10.",
            ],
          },
        ),
      ],
    },
    {
      title: "Dobrar, cortar e abrir",
      version: 2,
      objective:
        "Prever o que acontece ao dobrar um papel, cortar e abrir, e reconhecer partes iguais.",
      introduction:
        "Quando um papel é dobrado e furado longe das dobras e das bordas, o furo aparece em cada camada. Depois de uma dobra ao meio, aparecem dois furos separados, um de cada lado da dobra. Um recorte na própria dobra pode abrir um único buraco ao desdobrar.",
      specs: [
        c(
          "dobrar",
          "Uma folha é dobrada ao meio uma vez. Quantas camadas de papel ficam sobrepostas?",
          "2",
          ["1", "4"],
          "Uma dobra ao meio junta duas metades.",
          {
            feedback: ["Antes de dobrar havia 1 camada.", "4 camadas aparecem com duas dobras."],
          },
        ),
        n(
          "dobrar",
          "Uma folha é dobrada ao meio duas vezes. Um furo pequeno, sem tocar nas dobras nem nas bordas, atravessa todas as camadas. Quantos furos separados aparecem ao abrir a folha?",
          4,
          "Duas dobras dão 4 camadas; o furo atravessa as 4.",
          { misreads: [{ value: 2, feedback: "2 furos seriam com uma dobra só." }] },
        ),
        c(
          "dobrar",
          "Uma folha é dobrada ao meio e um pedaço é cortado bem no meio da dobra. Ao abrir, o buraco fica:",
          "Bem no meio da folha",
          ["Em um dos cantos da folha", "Só em uma das metades"],
          "O meio da dobra é o meio da folha aberta; o corte abre ali um buraco com os dois lados iguais.",
          {
            feedback: [
              "O pedaço cortado estava na dobra, que é o meio da folha aberta, não num canto.",
              "O corte atravessou as duas camadas juntas, então o buraco pega as duas metades.",
            ],
          },
        ),
        n(
          "dobrar",
          "Uma tira de papel é dobrada ao meio 3 vezes. Quantas partes iguais aparecem ao abrir, contando as marcas das dobras?",
          8,
          "Cada dobra dobra o número de partes: 2, 4, 8.",
          {
            misreads: [
              { value: 6, feedback: "6 soma 2 três vezes, mas cada dobra dobra a quantidade." },
            ],
          },
        ),
        c(
          "dobrar",
          "Um quadrado de papel é dobrado ao meio de modo que as duas metades fiquem exatamente uma sobre a outra. De quantos jeitos diferentes dá para fazer isso?",
          "4: dois pelo meio dos lados e dois na diagonal",
          ["3: dois pelo meio dos lados e um na diagonal", "2: só pelo meio dos lados"],
          "O quadrado tem 4 linhas de simetria: duas dobras pelo meio dos lados e duas pelas diagonais.",
          {
            feedback: [
              "As duas diagonais funcionam, cada uma ligando dois cantos opostos.",
              "As diagonais também juntam as metades certinhas.",
            ],
          },
        ),
        n(
          "dobrar",
          "Um retângulo de papel tem 8 centímetros de comprimento. Ele é dobrado ao meio de modo que o comprimento fique pela metade, e depois é dobrado de novo do mesmo jeito. Quantos centímetros de comprimento tem o papel dobrado?",
          2,
          "8 → 4 → 2.",
          {
            misreads: [{ value: 4, feedback: "4 é depois da primeira dobra; houve uma segunda." }],
          },
        ),
        c(
          "dobrar",
          "Uma folha é dobrada ao meio e recorta-se meio coração na dobra. Ao abrir, aparece:",
          "Um coração inteiro",
          ["Dois meios corações separados", "Meio coração"],
          "Ao abrir, aparece um coração inteiro, com os dois lados iguais: a dobra vira o eixo de simetria do coração.",
          {
            feedback: [
              "As duas metades estão ligadas pela dobra.",
              "Cada camada recebeu o corte; ao abrir, as metades se juntam.",
            ],
          },
        ),
        c(
          "dobrar",
          "Um quadrado de papel é dobrado ao meio pela diagonal. Que figura aparece?",
          "Um triângulo",
          ["Um retângulo", "Um quadrado menor"],
          "A dobra pela diagonal junta dois triângulos iguais em um só: aparece um triângulo com dois lados iguais.",
          {
            feedback: [
              "Um retângulo aparece dobrando pelo meio de um lado.",
              "Um quadrado menor aparece com duas dobras pelo meio dos lados.",
            ],
          },
        ),
      ],
    },
    {
      title: "Cobrir sem deixar buracos",
      version: 2,
      objective: "Cobrir uma região com peças iguais e decidir se dá certo, contando quadradinhos.",
      introduction:
        "Cobrir uma região é encaixar peças sem sobrepor e sem deixar buracos. Contar os quadradinhos da região e os de cada peça já diz se a conta fecha; depois é preciso ver se o encaixe é possível.",
      specs: [
        n(
          "cobrir",
          "Um tabuleiro de 4 por 6 quadradinhos será coberto com peças de 2 quadradinhos (dominós). Quantas peças são necessárias?",
          12,
          "4 × 6 = 24 quadradinhos; 24 ÷ 2 = 12 peças.",
          { misreads: [{ value: 24, feedback: "24 são os quadradinhos; cada peça cobre 2." }] },
        ),
        c(
          "cobrir",
          "Um tabuleiro de 3 por 3 pode ser coberto só com dominós de 2 quadradinhos?",
          "Não, porque 9 é ímpar",
          ["Sim, com 4 dominós", "Sim, com 5 dominós"],
          "Cada dominó cobre 2 quadradinhos, e 9 quadradinhos não se dividem em pares.",
          {
            feedback: [
              "4 dominós cobrem só 8 quadradinhos, e sobra 1 sem cobrir.",
              "5 dominós cobrem 10 quadradinhos, mais do que 9.",
            ],
          },
        ),
        n(
          "cobrir",
          "Um retângulo de 6 por 4 será coberto com quadrados de 2 por 2. Quantos quadrados cabem?",
          6,
          "3 quadrados na largura e 2 na altura: 3 × 2 = 6.",
          {
            misreads: [
              {
                value: 12,
                feedback: "12 seria com peças de 2 quadradinhos; cada quadrado 2 por 2 tem 4.",
              },
            ],
          },
        ),
        c(
          "cobrir",
          "Um piso de 5 por 5 será coberto com quadrados de 2 por 2. O que acontece?",
          "Sobra um pedaço sem cobrir",
          ["Cabe certinho, com 6 peças", "Cabe certinho, com 7 peças"],
          "25 não é múltiplo de 4, então sobram quadradinhos: no máximo 4 peças cabem e ficam 9 quadradinhos sem cobrir.",
          {
            feedback: [
              "6 peças cobririam 24, mas o formato 5 por 5 nem deixa encaixar 6.",
              "7 peças cobririam 28, mais que 25.",
            ],
          },
        ),
        n(
          "cobrir",
          "Uma mesa retangular de 60 por 40 centímetros será coberta com azulejos quadrados de 20 centímetros de lado. Quantos azulejos são necessários?",
          6,
          "3 azulejos no comprimento e 2 na largura: 3 × 2 = 6.",
          { misreads: [{ value: 5, feedback: "Somou 3 com 2; são 2 fileiras de 3 azulejos." }] },
        ),
        c(
          "cobrir",
          "Para cobrir um retângulo de 2 por 6 com peças em L de 3 quadradinhos, a conta 12 ÷ 3 = 4 fecha. Isso garante que dá para cobrir?",
          "Sozinha não garante, mas aqui as peças encaixam",
          ["Sim, a conta fechar sempre garante", "Não; peças em L nunca cobrem retângulos"],
          "A conta é necessária, mas é preciso ver se as peças encaixam. Neste caso encaixam: dois pares de L formam dois retângulos 2 por 3.",
          {
            feedback: [
              "Há regiões em que a conta fecha e o encaixe não existe.",
              "Duas peças em L formam um retângulo 2 por 3, então cobrem o 2 por 6.",
            ],
          },
        ),
        n(
          "cobrir",
          "Uma parede de 8 por 3 quadradinhos será coberta com tiras de 1 por 3. Quantas tiras são necessárias?",
          8,
          "24 quadradinhos ÷ 3 = 8 tiras, uma em cada coluna, em pé.",
          { misreads: [{ value: 24, feedback: "24 são os quadradinhos; cada tira cobre 3." }] },
        ),
        c(
          "cobrir",
          "Ao cobrir um tabuleiro com dominós, uma peça foi colocada e depois não sobrou lugar para as outras. O que deve ser feito?",
          "Voltar e tentar outra posição para a peça",
          ["Deixar um buraco e seguir com as outras", "Desistir: o tabuleiro não pode ser coberto"],
          "A conta fechar não quer dizer que qualquer arrumação funciona. A ordem e a posição das peças importam; o problema pode ter solução com outra arrumação.",
          {
            feedback: [
              "Cobrir é não deixar buracos; um buraco quer dizer que essa arrumação não deu certo.",
              "Uma tentativa que falha não prova que não dá.",
            ],
          },
        ),
      ],
    },
    {
      title: "Mover sem mudar",
      version: 2,
      objective:
        "Reconhecer quando uma figura é a mesma peça girada ou virada e quando é uma peça diferente.",
      introduction:
        "Girar ou virar uma peça não muda a peça: ela continua com os mesmos quadradinhos e o mesmo contorno. Duas figuras que parecem diferentes podem ser a mesma peça em outra posição.",
      estimatedMinutes: 18,
      specs: [
        c(
          "mover",
          "Uma peça em forma de L é girada meia volta. O que muda?",
          "Só a posição da peça",
          ["O contorno fica maior", "A peça ganha um quadradinho"],
          "Girar não acrescenta nem tira nada da peça: a quantidade de quadradinhos e o contorno continuam iguais.",
          {
            feedback: [
              "Girar não estica nem encolhe a peça; o contorno continua do mesmo tamanho.",
              "Girar não muda a quantidade de quadradinhos.",
            ],
          },
        ),
        n(
          "mover",
          "Com 4 quadradinhos formando uma peça só, cada um encostado em outro por um lado inteiro, quantas peças diferentes dá para montar, contando como iguais as que são uma só peça girada ou virada?",
          5,
          "Fila, quadrado, L, T e S: 5 peças (os tetraminós).",
          {
            misreads: [
              {
                value: 7,
                feedback:
                  "7 contaria L e S espelhados como peças diferentes; virar não muda a peça.",
              },
            ],
          },
        ),
        c(
          "mover",
          "Duas figuras de 3 quadradinhos: uma é uma fila deitada e a outra uma fila em pé. Elas são:",
          "A mesma peça, uma girada um quarto de volta",
          ["Peças diferentes, porque uma é mais alta", "A mesma peça, uma girada meia volta"],
          "Girar a fila deitada um quarto de volta dá a fila em pé.",
          {
            feedback: [
              "Têm a mesma forma e o mesmo tamanho; só a posição muda.",
              "Meia volta deixa a fila deitada de novo; para ficar em pé, basta um quarto de volta.",
            ],
          },
        ),
        n(
          "mover",
          "Um retângulo de 2 por 3 é cortado em dois pedaços e os pedaços são reorganizados sem sobrepor. Quantos quadradinhos tem a nova figura?",
          6,
          "Mover pedaços não muda a quantidade de quadradinhos: 6.",
          {
            misreads: [
              {
                value: 12,
                feedback: "Cortar e mover não dobra a figura; os quadradinhos são os mesmos 6.",
              },
            ],
          },
        ),
        c(
          "mover",
          "Um triângulo é cortado de um canto de um quadrado e colado no lado oposto, encaixando direitinho. A nova figura tem:",
          "A mesma quantidade de papel, mas outro formato",
          [
            "Mais papel, porque ficou mais comprida",
            "A mesma quantidade de papel e o mesmo formato",
          ],
          "Mover um pedaço não cria nem tira papel, mas muda o formato da figura.",
          {
            feedback: [
              "A figura pode parecer maior por ficar mais comprida, mas nenhum papel foi acrescentado.",
              "O pedaço mudou de lugar, então o formato mudou; só a quantidade de papel ficou igual.",
            ],
          },
        ),
        n(
          "mover",
          "Com 3 quadradinhos formando uma peça só, cada um encostado em outro por um lado inteiro, quantas peças diferentes existem, contando giros e viradas como a mesma peça?",
          2,
          "A fila de 3 e o L: 2 peças.",
          {
            misreads: [
              {
                value: 4,
                feedback:
                  "4 contaria a fila em pé e deitada e dois L virados como peças diferentes.",
              },
            ],
          },
        ),
        c(
          "mover",
          "Uma peça em L de 4 quadradinhos é virada como num espelho. A peça virada e a original:",
          "São a mesma peça, mas só girando não encaixam",
          ["São peças diferentes, porque uma foi virada", "Encaixam uma sobre a outra só girando"],
          "Se a peça pode ser levantada e virada, é a mesma peça. Mas virar é diferente de girar: no papel, sem levantar, um L espelhado não se obtém só com giros.",
          {
            feedback: [
              "Se a peça pode ser levantada e virada, é a mesma.",
              "Girar no papel não transforma um L no seu espelho; é preciso levantar e virar a peça.",
            ],
          },
        ),
        c(
          "mover",
          "Por que contar os quadradinhos e o contorno ajuda a decidir se duas figuras são a mesma peça?",
          "Porque girar e virar não mudam esses números",
          [
            "Porque os números sempre mudam ao girar",
            "Porque números iguais garantem a mesma peça",
          ],
          "Se os números forem diferentes, as peças são diferentes. Números iguais não garantem que são a mesma peça, mas números diferentes garantem que não são.",
          {
            feedback: [
              "Girar e virar mantêm quadradinhos e contorno.",
              "Números iguais não bastam: a fila de 3 e o L de 3 têm 3 quadradinhos e contorno 8, e são peças diferentes.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    constraints: [
      [0, 2],
      [1, 2],
      [2, 3],
    ],
    prompt:
      "Coloque em ordem os passos para decidir se uma região pode ser coberta com peças iguais.",
    labels: [
      "Contar os quadradinhos da região",
      "Contar os quadradinhos de uma peça",
      "Dividir para ver se a conta fecha sem sobra",
      "Tentar o encaixe das peças de verdade",
    ],
    explanation: "A divisão diz se é possível em número; o encaixe diz se é possível de fato.",
  },
  justification: {
    prompts: [
      "Explique por que 4 quadradinhos em fila têm contorno maior que 4 quadradinhos em quadrado.",
      "Uma folha dobrada ao meio duas vezes recebe um furo pequeno que atravessa todas as camadas sem tocar nas dobras nem nas bordas. Explique quantos furos separados aparecem ao abrir e por quê.",
      "Explique por que um tabuleiro de 3 por 3 não pode ser coberto só com dominós.",
    ],
    samples: [
      "Cada quadradinho tem 4 lados, então 4 quadradinhos têm 16 lados. Na fila há 3 encontros entre vizinhos, e cada encontro esconde 2 lados: 16 − 6 = 10. No quadrado 2 por 2 há 4 encontros: 16 − 8 = 8. Mais encontros, menos contorno.",
      "Cada dobra ao meio dobra as camadas: 1, 2, 4. O furo atravessa as 4 camadas longe das dobras e das bordas, então, ao abrir, aparecem 4 furos separados, um em cada parte da folha.",
      "O tabuleiro tem 9 quadradinhos. Cada dominó cobre exatamente 2, então qualquer quantidade de dominós cobre um número par de quadradinhos. Como 9 é ímpar, não dá para cobrir tudo: se encaixarmos 4 dominós, sobra 1 quadradinho; outras arrumações podem deixar mais quadradinhos descobertos.",
    ],
    focus: "o que muda e o que não muda ao juntar ou mover peças",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const largura = 2 + (seed % 3);
      const comprimento = largura + 1 + (seed % 5);
      const contorno = 2 * (largura + comprimento);
      const area = largura * comprimento;
      return c(
        "contorno-do-retangulo",
        `Um retângulo é montado com quadradinhos de lado 1 centímetro: ${largura} quadradinhos de altura e ${comprimento} de comprimento. Qual é o contorno do retângulo, em centímetros?`,
        `${contorno}`,
        [`${largura + comprimento}`, `${4 * area}`],
        `${largura} + ${comprimento} + ${largura} + ${comprimento} = ${contorno}.`,
        {
          feedback: [
            "Somou só um lado de cada tipo, mas o contorno dá a volta inteira: dois de cada.",
            "Contou todos os lados de todos os quadradinhos, inclusive os escondidos.",
          ],
        },
      );
    }
    if (variant === 1) {
      const linhas = 2 * (1 + (seed % 3));
      const colunas = 3 + (seed % 7);
      const total = linhas * colunas;
      const pecas = total / 2;
      return c(
        "dominos-no-tabuleiro",
        `Um tabuleiro de ${linhas} por ${colunas} quadradinhos será coberto com dominós de 2 quadradinhos cada. Quantos dominós são necessários?`,
        `${pecas}`,
        [`${total}`, `${pecas + 2}`],
        `${linhas} × ${colunas} = ${total} quadradinhos; ${total} ÷ 2 = ${pecas}.`,
        {
          feedback: [
            "Esse é o número de quadradinhos; cada dominó cobre 2.",
            "Não confere: divida o total de quadradinhos por 2.",
          ],
        },
      );
    }
    const dobras = 2 + (seed % 3);
    const camadas = 2 ** dobras;
    return c(
      "furos-na-folha-dobrada",
      `Uma folha é dobrada ao meio ${dobras} vezes seguidas. Um furo pequeno, sem tocar nas dobras nem nas bordas, atravessa todas as camadas. Quantos furos separados aparecem ao abrir a folha?`,
      `${camadas}`,
      [`${camadas - 1}`, `${camadas * 2}`],
      `Cada dobra ao meio dobra as camadas; com ${dobras} dobras são ${camadas} camadas. O furo atravessa todas sem tocar nas dobras nem nas bordas, por isso os ${camadas} furos ficam separados ao abrir.`,
      {
        feedback: [
          "Contou uma camada a menos: o furo atravessa todas as camadas.",
          "Contou uma dobra a mais.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "composicao-de-figuras",
    title: "Peças de papel quadriculado",
    prompt:
      "Recorte peças de 4 quadradinhos em papel quadriculado, todas as formas diferentes que conseguir. Descubra quais têm o maior e o menor contorno e tente montar um retângulo com algumas delas.",
    lab: "grid",
    steps: [
      "Recorte as peças de 4 quadradinhos e confira se alguma é outra girada ou virada.",
      "Conte o contorno de cada peça e organize do menor ao maior.",
      "Tente cobrir um retângulo de 4 por 5 usando as cinco peças, uma de cada forma, e anote o que acontece. Depois pinte o retângulo como um tabuleiro de xadrez, com 10 casas escuras e 10 claras, e conte quantas casas de cada cor cada peça cobre: isso explica o que você viu.",
    ],
    rubric: [
      "As 5 peças diferentes encontradas, sem repetição por giro (0–2)",
      "Contornos contados corretamente (0–3)",
      "Tentativa de cobertura registrada e explicada com as cores do tabuleiro (0–2)",
      "Explicação de por que o quadrado 2 por 2 tem o menor contorno (0–1)",
    ],
  },
  homeSupport: [
    "Com peças de um jogo de montar ou papel recortado, montem juntos figuras diferentes com o mesmo número de peças e comparem os contornos.",
    "Dobrem uma folha e façam um recorte antes de abrir: peçam à criança para prever o que vai aparecer.",
  ],
};
