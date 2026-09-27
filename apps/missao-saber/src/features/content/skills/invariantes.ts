import { c, n, type SkillPack } from "../skill-factory";

/**
 * Invariantes: o que não muda enquanto tudo muda. Paridade, somas e
 * colorações que provam impossibilidades, além de argumentos por
 * extremos e por contagem dupla. Trilha OBMEP N2.
 */
export const invariantes: SkillPack = {
  id: "invariantes",
  name: "Invariantes e argumentos",
  domain: "obmep",
  lab: "groups",
  missions: [
    {
      title: "O que não muda",
      objective: "Reconhecer uma quantidade que se mantém ao longo de um processo.",
      introduction:
        "Em muitos jogos e processos alguma coisa não muda: a soma, a paridade, o número de peças de uma cor. Achar essa quantidade é o primeiro passo para prever o fim.",
      specs: [
        c(
          "soma-invariante",
          "Em uma lousa estão os números de 1 a 10. A cada passo, apagam-se dois números a e b e escreve-se a + b. O que não muda a cada passo?",
          "A soma de todos os números na lousa",
          ["A quantidade de números na lousa", "O maior número na lousa"],
          "Trocar a e b por a + b mantém a soma total, que é sempre 55.",
          {
            feedback: [
              "A quantidade diminui 1 a cada passo.",
              "O maior número pode crescer quando a soma dos dois apagados supera o maior atual.",
            ],
          },
        ),
        n(
          "soma-invariante",
          "Na lousa estão os números de 1 a 10. A cada passo, dois números são apagados e substituídos pela soma deles, até restar um só. Qual é o número que resta?",
          55,
          "A soma nunca muda: de 1 a 10 ela vale 55.",
          {
            misreads: [
              { value: 10, feedback: "O último número não é o maior inicial; é a soma de todos." },
            ],
          },
        ),
        c(
          "paridade-invariante",
          "Em uma mesa há 7 copos virados para cima. A cada jogada, você vira exatamente 2 copos. É possível deixar todos virados para baixo?",
          "Não: o número de copos para baixo é sempre par",
          [
            "Sim: em 4 jogadas dá para virar 8 copos, mais que 7",
            "Sim, desde que o número de jogadas seja ímpar",
          ],
          "Começa com 0 copos para baixo (par); virar 2 muda esse número em −2, 0 ou +2, então ele continua par. Nunca chega a 7, que é ímpar.",
          {
            feedback: [
              "Virar 8 vezes não basta: com 8 viradas em 7 copos, algum copo é virado mais de uma vez, e o número de copos para baixo continua par, nunca 7.",
              "Nenhuma quantidade de jogadas resolve: cada jogada muda os copos para baixo em −2, 0 ou +2, e esse número segue par.",
            ],
          },
        ),
        n(
          "paridade-invariante",
          "Um saco tem 20 bolas brancas e 15 pretas. Retiram-se duas bolas de cada vez: se forem da mesma cor, coloca-se uma branca de volta; se forem de cores diferentes, coloca-se uma preta de volta. Quantas bolas pretas há quando resta uma só bola?",
          1,
          "A quantidade de pretas só muda de 2 em 2 (quando saem duas pretas) ou não muda; começando ímpar (15), continua ímpar. A última bola é preta.",
          {
            misreads: [
              {
                value: 0,
                feedback:
                  "Zero pretas seria par, e a quantidade de pretas nunca troca de paridade.",
              },
            ],
          },
        ),
        c(
          "soma-invariante",
          "Um tabuleiro tem casas numeradas, e uma peça avança sempre 3 casas por vez, começando na casa 1. Em qual casa ela nunca vai parar?",
          "Casa 20",
          ["Casa 19", "Casa 22"],
          "A posição é 1 + 3k, que deixa resto 1 na divisão por 3: 19 e 22 servem, 20 não.",
          {
            feedback: [
              "19 = 1 + 3 × 6: a peça passa por ela.",
              "22 = 1 + 3 × 7: a peça passa por ela.",
            ],
          },
        ),
        n(
          "diferenca-invariante",
          "Duas pilhas têm 8 e 5 fichas. A cada jogada, tira-se uma ficha de cada pilha. Quantas fichas restam na pilha maior quando a menor acaba?",
          3,
          "A diferença entre as pilhas, 3, nunca muda; quando a menor chega a 0, a maior tem 3.",
          {
            misreads: [
              { value: 5, feedback: "5 é o tamanho inicial da pilha menor, não a diferença." },
            ],
          },
        ),
        c(
          "paridade-invariante",
          "Uma lâmpada começa apagada. Um interruptor é acionado 2.025 vezes. Ao final, a lâmpada está:",
          "Acesa, porque 2.025 é ímpar",
          ["Apagada, porque 2.025 é múltiplo de 5", "Não dá para saber sem contar um a um"],
          "Cada par de acionamentos devolve o estado inicial; sobra um acionamento. Um número ímpar de acionamentos inverte o estado inicial.",
          {
            feedback: [
              "Ser múltiplo de 5 não importa; o que decide é a paridade.",
              "Dá para saber pela paridade: ímpar inverte, par mantém.",
            ],
          },
        ),
        c(
          "soma-invariante",
          "Em um círculo estão escritos os números 1, 2, 3, 4, 5 e 6. A cada passo, escolhem-se dois vizinhos e soma-se 1 a cada um deles. É possível deixar todos iguais?",
          "Não: a soma continua ímpar, e seis iguais somam um par",
          [
            "Sim: basta somar sempre nos dois vizinhos menores",
            "Sim, desde que se comece pelo par formado por 1 e 6",
          ],
          "A soma inicial é 21, ímpar; cada passo soma 2 ao total e preserva a paridade ímpar; seis iguais somam 6k, par.",
          {
            feedback: [
              "Escolher os menores não muda o fato de a soma subir 2 a cada passo: ela começa em 21 e continua ímpar, e seis números iguais somam um par.",
              "A ordem das escolhas não altera o argumento: qualquer passo soma 2 ao total, que segue ímpar, e seis números iguais somam um par.",
            ],
          },
        ),
      ],
    },
    {
      title: "Colorir para provar",
      objective: "Usar colorações e paridade de casas para mostrar que uma cobertura é impossível.",
      introduction:
        "Pintar o tabuleiro como um xadrez transforma uma pergunta sobre peças em uma pergunta sobre contagem: se cada peça cobre uma casa de cada cor, o número de casas de cada cor precisa bater.",
      specs: [
        c(
          "coloracao-xadrez",
          "Um tabuleiro 8 × 8 perdeu duas casas de cantos opostos. É possível cobri-lo com 31 dominós de 1 × 2?",
          "Não: os dois cantos retirados têm a mesma cor",
          ["Sim, porque 62 casas = 31 × 2", "Sim, se os dominós forem colocados na vertical"],
          "Os cantos opostos têm a mesma cor, então restam 32 casas de uma cor e 30 da outra. Cada dominó cobre uma casa de cada cor, e 31 dominós cobririam 31 de cada.",
          {
            feedback: [
              "A contagem de casas bate, mas a contagem por cor não.",
              "A orientação não muda o fato de cada dominó cobrir cores diferentes.",
            ],
          },
        ),
        n(
          "coloracao-xadrez",
          "Em um tabuleiro 5 × 5 pintado como um xadrez, com as casas dos cantos pretas, quantas casas são pretas?",
          13,
          "25 casas alternando cores começando por preta: 13 pretas e 12 brancas.",
          {
            misreads: [
              {
                value: 12,
                feedback:
                  "12 é o número de brancas; como 25 é ímpar, a cor dos cantos aparece uma vez a mais.",
              },
            ],
          },
        ),
        c(
          "coloracao-xadrez",
          "É possível cobrir um tabuleiro 5 × 5 com dominós de 1 × 2?",
          "Não: 25 é ímpar e cada dominó cobre 2 casas",
          ["Sim, com 12 dominós, deixando uma casa livre", "Sim, com 13 dominós"],
          "Cobrir exige cobrir todas as casas; 25 não é múltiplo de 2.",
          {
            feedback: [
              "Deixar uma casa descoberta não é cobrir o tabuleiro.",
              "13 dominós cobrem 26 casas, mais que o tabuleiro tem.",
            ],
          },
        ),
        n(
          "coloracao-xadrez",
          "Um cavalo de xadrez sai de uma casa branca e dá 7 saltos. Em quantas casas brancas ele pode estar no fim? Responda 0 se não puder estar em nenhuma.",
          0,
          "Cada salto do cavalo troca a cor da casa; depois de 7 saltos (ímpar), ele está em uma casa preta.",
          {
            misreads: [
              {
                value: 7,
                feedback:
                  "O número de saltos não é o número de casas possíveis; a cor final é forçada.",
              },
            ],
          },
        ),
        c(
          "coloracao-por-linhas",
          "Um retângulo 6 × 6 será coberto com peças em forma de L, de 3 casas. Cada peça cobre casas de quantas cores diferentes em uma pintura de xadrez?",
          "Sempre 2 cores",
          ["Depende de onde a peça é colocada", "Sempre 1 cor"],
          "Três casas em L têm duas de uma cor e uma da outra em qualquer posição.",
          {
            feedback: [
              "Em qualquer posição, o L tem duas casas de uma cor e uma da outra; a posição não muda isso.",
              "Casas vizinhas têm cores diferentes, então uma peça de 3 casas nunca é monocromática.",
            ],
          },
        ),
        n(
          "coloracao-xadrez",
          "Um tabuleiro 4 × 4 perdeu uma casa de canto e a casa vizinha a esse canto pela diagonal. Quantos dominós são necessários para cobrir o resto, se for possível? Responda 0 se for impossível.",
          0,
          "Casas ligadas pela diagonal têm a mesma cor; sobram 8 casas de uma cor e 6 da outra, e dominós cobrem uma de cada.",
          {
            misreads: [
              { value: 7, feedback: "7 dominós cobririam 7 casas de cada cor, mas restam 8 e 6." },
            ],
          },
        ),
        c(
          "coloracao-xadrez",
          "Um tabuleiro 3 × 3 perdeu uma casa. Para que dominós de 1 × 2 possam cobrir as 8 casas restantes, a casa perdida deve ser:",
          "Um canto ou o centro",
          ["Qualquer casa, já que sobram 8", "Só o centro"],
          "Pintando como xadrez com cantos pretos há 5 pretas, os quatro cantos e o centro, e 4 brancas. Dominós cobrem uma de cada cor, então só sobram 4 e 4 se a casa retirada for preta. Retirando um canto ou o centro, a cobertura existe.",
          {
            feedback: [
              "Sobrar um número par de casas não basta: retirar a casa do meio de uma borda, que é branca, deixa 5 pretas e 3 brancas, e cada dominó cobre uma de cada cor.",
              "Retirar um canto também funciona; o que importa é a cor da casa.",
            ],
          },
        ),
        c(
          "coloracao-xadrez",
          "Em um tabuleiro 7 × 7 pintado como xadrez com cantos pretos, um dominó sempre cobre:",
          "Uma casa preta e uma branca",
          ["Duas casas pretas", "Duas casas da mesma cor, dependendo da posição"],
          "Casas lado a lado têm cores diferentes.",
          {
            feedback: [
              "Casas vizinhas nunca são da mesma cor no xadrez.",
              "A posição não importa: vizinhas sempre alternam.",
            ],
          },
        ),
      ],
    },
    {
      title: "Casos extremos",
      objective: "Argumentar olhando para o maior, o menor, o primeiro ou o último.",
      introduction:
        "Quando não dá para testar tudo, olhe para um extremo: o maior número, a pessoa mais velha, a primeira jogada. O extremo obedece a uma restrição que resolve o problema.",
      specs: [
        c(
          "extremo",
          "Dez pessoas têm idades diferentes. Escolhendo quaisquer duas, a diferença de idades é pelo menos 2 anos. A diferença entre a mais velha e a mais nova é, no mínimo:",
          "18 anos",
          ["20 anos", "10 anos"],
          "Ordenando as idades, há 9 saltos de pelo menos 2 anos: 9 × 2 = 18.",
          {
            feedback: [
              "20 seria com 10 saltos, mas 10 pessoas em ordem têm 9 intervalos.",
              "10 usa 1 ano por salto, e o mínimo é 2.",
            ],
          },
        ),
        n(
          "extremo",
          "Em uma fila, cada pessoa é mais baixa que a da frente, exceto a primeira. Se a primeira tem 1,80 m e cada diferença é de pelo menos 2 cm, quantas pessoas, no máximo, cabem na fila com altura mínima de 1,50 m?",
          16,
          "De 180 a 150 há 30 cm; com saltos de 2 cm cabem 15 saltos, ou seja, 16 pessoas.",
          {
            misreads: [
              { value: 15, feedback: "15 é o número de saltos; as pessoas são uma a mais." },
            ],
          },
        ),
        c(
          "extremo",
          "Em uma festa com várias pessoas, é possível que cada uma conheça um número diferente de outras pessoas presentes?",
          "Não: haveria quem conhece todos e quem não conhece ninguém",
          [
            "Sim, com 3 pessoas conhecendo 0, 1 e 2 outras",
            "Sim, desde que ninguém conheça todas as outras",
          ],
          "Com n pessoas, os números de conhecidos vão de 0 a n − 1; para serem todos diferentes precisariam aparecer 0 e n − 1, mas quem conhece todos é conhecido por quem não conhece ninguém.",
          {
            feedback: [
              "Com 3 pessoas os números seriam 0, 1 e 2: quem conhece 2 conhece a que conhece 0, contradição.",
              "Sem alguém que conheça todos, sobram os valores de 0 a n − 2: n pessoas para n − 1 valores, dois coincidem.",
            ],
          },
        ),
        n(
          "extremo",
          "Em um grupo de 6 pessoas, a soma das idades é 90 anos. Qual é a maior idade que a pessoa mais nova pode ter?",
          15,
          "Se a mais nova tivesse mais de 15, todas teriam mais de 15 e a soma passaria de 90; 15 é possível com todas iguais.",
          { misreads: [{ value: 90, feedback: "90 é a soma, não uma idade possível." }] },
        ),
        c(
          "extremo",
          "Em um torneio com 5 times em que cada time joga contra os outros uma vez, é possível que todos os times tenham números diferentes de vitórias, sem empates?",
          "Sim: 4, 3, 2, 1 e 0 vitórias, somando os 10 jogos",
          [
            "Não, porque 5 times não podem ter 5 resultados diferentes",
            "Não, porque o campeão precisa perder ao menos um jogo",
          ],
          "Há 10 jogos; 4 + 3 + 2 + 1 + 0 = 10, e a ordem 'cada time vence os de baixo' realiza isso.",
          {
            feedback: [
              "As vitórias podem ir de 0 a 4, cinco valores diferentes.",
              "O campeão pode vencer os 4 jogos.",
            ],
          },
        ),
        n(
          "extremo",
          "Um número de 3 algarismos tem soma dos algarismos 24. Qual é o menor número assim?",
          699,
          "Para ser o menor, a centena deve ser a menor possível: com 6 na centena, sobra 18 para dois algarismos, só 9 e 9.",
          {
            misreads: [
              { value: 996, feedback: "996 é o maior número com essa soma, não o menor." },
            ],
          },
        ),
        c(
          "extremo",
          "Cinco pontos são colocados em um quadrado de lado 2. Qual é o menor valor d para o qual sempre existem dois dos pontos a uma distância de no máximo d?",
          "√2",
          ["2", "1"],
          "Em 4 quadrados de lado 1, algum recebe 2 pontos (5 > 4), e dois pontos em um quadrado de lado 1 distam no máximo √2; os quatro cantos e o centro mostram que não dá para garantir menos.",
          {
            feedback: [
              "Com d = 2 sempre existe o par, mas 2 não é o menor valor: dividindo em quatro quadradinhos de lado 1, dois pontos caem no mesmo e distam no máximo √2, que é menor que 2.",
              "Com d = 1 o par pode não existir: os quatro cantos e o centro distam pelo menos √2 uns dos outros.",
            ],
          },
        ),
        c(
          "extremo",
          "Em uma turma, cada estudante tem pelo menos um amigo na turma, e amizade é recíproca. Podemos afirmar que:",
          "Existem dois estudantes com o mesmo número de amigos",
          ["Todos têm o mesmo número de amigos", "Alguém é amigo de todos"],
          "Com n estudantes, os números de amigos vão de 1 a n − 1: n valores em n − 1 possibilidades, então dois coincidem.",
          {
            feedback: [
              "Só se garante uma coincidência, não igualdade geral.",
              "Ninguém precisa ser amigo de todos.",
            ],
          },
        ),
      ],
    },
    {
      title: "Contar de dois jeitos",
      objective: "Obter igualdades contando a mesma coisa por dois caminhos.",
      introduction:
        "Se você conta as mesmas coisas por linhas e por colunas, os totais são iguais. Essa igualdade costuma revelar um número que parecia escondido.",
      specs: [
        n(
          "contagem-dupla",
          "Em uma turma, cada um dos 20 estudantes participa de exatamente 3 clubes, e cada clube tem exatamente 5 estudantes. Quantos clubes existem?",
          12,
          "Contando pares (estudante, clube): 20 × 3 = 60 = 5 × clubes, então há 12 clubes.",
          {
            misreads: [
              {
                value: 4,
                feedback: "Dividiu 20 por 5 e esqueceu que cada estudante está em 3 clubes.",
              },
            ],
          },
        ),
        c(
          "contagem-dupla",
          "Em um poliedro, cada face é um triângulo e há 20 faces. Quantas arestas ele tem?",
          30,
          [60, 20],
          "Cada face tem 3 arestas e cada aresta pertence a 2 faces: 20 × 3 ÷ 2 = 30.",
          {
            feedback: [
              "60 conta cada aresta duas vezes.",
              "20 é o número de faces, não de arestas.",
            ],
          },
        ),
        n(
          "contagem-dupla",
          "Em um encontro, cada pessoa apertou a mão de exatamente 4 outras. Se houve 30 apertos de mão, quantas pessoas estavam no encontro?",
          15,
          "Cada aperto envolve 2 pessoas: pessoas × 4 = 2 × 30, então 15 pessoas.",
          {
            misreads: [
              {
                value: 7.5,
                feedback: "Dividiu 30 por 4 sem lembrar que cada aperto conta para duas pessoas.",
              },
            ],
          },
        ),
        c(
          "contagem-dupla",
          "Em um grupo, o número de pessoas que apertaram a mão de um número ímpar de pessoas é sempre:",
          "Par",
          ["Ímpar", "Igual ao número de apertos"],
          "A soma de todos os números de apertos por pessoa é o dobro do total de apertos, portanto par; uma soma par tem um número par de parcelas ímpares.",
          {
            feedback: [
              "Se fosse ímpar, a soma total seria ímpar, mas ela é o dobro do número de apertos.",
              "O número de apertos não coincide com a quantidade dessas pessoas.",
            ],
          },
        ),
        n(
          "contagem-dupla",
          "Em uma tabela 6 × 8 preenchida com 0 e 1, cada linha tem exatamente quatro 1s. Quantos 1s há na tabela?",
          24,
          "6 linhas × 4 = 24; contando por colunas daria o mesmo total.",
          {
            misreads: [
              { value: 32, feedback: "Usou 8 linhas; a tabela tem 6 linhas e 8 colunas." },
            ],
          },
        ),
        c(
          "contagem-dupla",
          "Um cubo tem 8 vértices e de cada vértice saem 3 arestas. O número de arestas do cubo é:",
          12,
          [24, 8],
          "8 × 3 = 24 conta cada aresta pelas duas pontas: 24 ÷ 2 = 12.",
          {
            feedback: ["24 conta cada aresta duas vezes.", "8 é o número de vértices."],
          },
        ),
        n(
          "contagem-dupla",
          "Em um campeonato de futebol com 12 times, cada time jogou 11 partidas. Quantas partidas foram disputadas?",
          66,
          "12 × 11 conta cada partida duas vezes: 132 ÷ 2 = 66.",
          { misreads: [{ value: 132, feedback: "Cada partida tem dois times; contou em dobro." }] },
        ),
        c(
          "contagem-dupla",
          "Em uma escola, cada professor dá aula para 4 turmas e cada turma tem 6 professores. Se há 18 turmas, o número de professores é:",
          27,
          [12, 72],
          "Pares (professor, turma): professores × 4 = 18 × 6 = 108, então 27 professores.",
          {
            feedback: [
              "12 divide 72 por 6 sem montar a igualdade certa.",
              "72 é 18 × 4, misturando os dados.",
            ],
          },
        ),
      ],
    },
    {
      title: "Invariantes para provar",
      objective: "Montar um argumento completo de impossibilidade ou de existência.",
      introduction:
        "Um argumento bem escrito nomeia o invariante, mostra que ele não muda em cada passo e compara o início com o fim. Sem o terceiro passo, a prova não termina.",
      estimatedMinutes: 18,
      specs: [
        c(
          "argumento-completo",
          "Na lousa estão escritos 10 sinais de mais e 15 sinais de menos. A cada passo, apagam-se dois sinais: iguais viram um mais, diferentes viram um menos. Qual sinal resta no fim?",
          "Menos, porque os sinais de menos seguem em número ímpar",
          [
            "Mais, porque há mais operações que geram mais",
            "Depende da ordem em que os pares são escolhidos",
          ],
          "Dois menos viram um mais (menos diminui 2); dois mais viram um mais (menos não muda); um de cada vira menos (menos não muda). O número de sinais de menos nunca muda de paridade: começa em 15, ímpar, e termina em 1.",
          {
            feedback: [
              "A quantidade de operações não decide; a paridade dos sinais de menos é o invariante.",
              "A ordem não importa: o invariante vale em qualquer sequência.",
            ],
          },
        ),
        n(
          "argumento-completo",
          "Em uma ilha há 13 camaleões vermelhos, 15 verdes e 17 azuis. Quando dois de cores diferentes se encontram, ambos mudam para a terceira cor. Se todos ficarem da mesma cor, quantos camaleões haverá ao todo? Responda 0 se isso for impossível.",
          0,
          "Um encontro muda as três quantidades em −1, −1 e +2, então as diferenças entre elas não mudam na divisão por 3. Para duas cores acabarem com 0, a diferença entre elas precisaria ser múltiplo de 3, e nenhum par entre 13, 15 e 17 tem: as diferenças são 2, 2 e 4. Impossível.",
          {
            misreads: [
              {
                value: 45,
                feedback: "45 é o total de camaleões, mas a situação final é impossível.",
              },
            ],
          },
        ),
        c(
          "argumento-completo",
          "Um número escrito com os algarismos 1, 2, 3, 4, 5 e 6 em alguma ordem é somado com o número escrito com os mesmos algarismos em outra ordem. A soma pode ser 999.999?",
          "Não: a soma dos dois deixa resto 6 na divisão por 9",
          [
            "Sim, por exemplo 123.456 + 876.543",
            "Sim: basta cada coluna somar 9, como 3 + 6 e 4 + 5",
          ],
          "Cada número tem soma dos algarismos 21, resto 3 por 9; a soma dos dois tem resto 6, e 999.999 tem resto 0, porque é múltiplo de 9.",
          {
            feedback: [
              "876.543 usa os algarismos 8 e 7, que não estão entre 1 e 6.",
              "3 + 6 e 4 + 5 dão 9, mas o 1 precisaria de um 8 e o 2 de um 7. E qualquer ordem dos algarismos de 1 a 6 dá resto 3 na divisão por 9, então a soma nunca é múltiplo de 9.",
            ],
          },
        ),
        n(
          "argumento-completo",
          "Uma rã pula sobre pontos numerados de 1 a 100 em linha, sempre para um ponto a 2 ou 4 casas de distância. Começando no 1, quantos dos pontos pares ela consegue visitar?",
          0,
          "Pular 2 ou 4 casas não muda a paridade do número do ponto; começando em 1, ela só visita ímpares.",
          {
            misreads: [
              {
                value: 50,
                feedback: "Os 50 pontos pares ficam todos fora do alcance, pela paridade.",
              },
            ],
          },
        ),
        c(
          "argumento-completo",
          "Qual afirmação é uma prova correta de que um tabuleiro 5 × 5 não pode ser percorrido por um cavalo passando por todas as casas e voltando ao início?",
          "Cada salto troca a cor, e o ciclo teria 25 casas, número ímpar",
          [
            "Do canto, o cavalo tem só 2 saltos possíveis",
            "No 5 × 5, o cavalo não consegue alcançar todas as casas",
          ],
          "Cada salto troca a cor; um passeio fechado alterna cores, então precisa de número par de casas, e 25 é ímpar.",
          {
            feedback: [
              "É verdade que o canto tem só 2 saltos, mas isso apenas obriga o passeio a usar os dois; não prova que ele é impossível.",
              "O cavalo alcança todas as casas do 5 × 5; o que impede o passeio fechado é a paridade das cores.",
            ],
          },
        ),
        n(
          "argumento-completo",
          "Escrevem-se os números de 1 a 2.025 em uma lousa. A cada passo, apagam-se dois e escreve-se a diferença positiva entre eles. Qual é a paridade do último número? Responda 0 para par e 1 para ímpar.",
          1,
          "Trocar a e b por a − b não muda a paridade da soma total. A soma inicial é 2.025 × 2.026 ÷ 2 = 2.025 × 1.013, que é ímpar; o último número é ímpar.",
          {
            misreads: [
              { value: 0, feedback: "A soma inicial é ímpar, e a paridade da soma é invariante." },
            ],
          },
        ),
        c(
          "argumento-completo",
          "Em uma pilha de 21 palitos, dois jogadores alternam retirando 1, 2 ou 3 palitos, e vence quem tira o último. Para garantir a vitória, um jogador deve sempre deixar para o adversário uma quantidade que seja múltiplo de:",
          4,
          [3, 5],
          "Se o adversário recebe um múltiplo de 4 e tira k palitos, você tira 4 − k e devolve outro múltiplo de 4; no fim ele recebe 4 e você tira o último.",
          {
            feedback: [
              "Com múltiplos de 3, o adversário tira 3 e devolve um múltiplo de 3 a você.",
              "5 não fecha: se ele tira 1, você precisaria tirar 4, o que não é permitido.",
            ],
          },
        ),
        c(
          "argumento-completo",
          "Cinco amigos têm, juntos, 47 figurinhas. Podemos garantir que:",
          "Algum deles tem pelo menos 10 figurinhas",
          ["Algum deles tem exatamente 10 figurinhas", "Todos têm pelo menos 9 figurinhas"],
          "Se todos tivessem no máximo 9, o total seria no máximo 45 < 47.",
          {
            feedback: [
              "A garantia é de pelo menos 10, não de exatamente 10.",
              "Alguém pode ter 0 figurinhas e outro 47.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize um argumento de impossibilidade por invariante.",
    labels: [
      "Identificar uma quantidade que pode servir de invariante",
      "Mostrar que cada passo permitido não altera essa quantidade",
      "Calcular o invariante no início e no estado final desejado",
      "Concluir que os dois valores são diferentes, logo o final é impossível",
    ],
    explanation:
      "Escolhemos o invariante, provamos que ele se mantém a cada passo e comparamos início e fim: valores diferentes encerram a prova.",
  },
  justification: {
    prompts: [
      "Explique por que não é possível cobrir com dominós um tabuleiro 8 × 8 sem dois cantos opostos, usando a pintura de xadrez.",
      "Um colega diz que, em um grupo de pessoas, o número de apertos de mão pode ser qualquer inteiro se cada pessoa apertar a mão de 3 outras. Explique o que está errado e qual condição precisa valer.",
      "Mostre que a soma dos números de 1 a 2.025 é ímpar e explique por que isso decide a paridade do número final no jogo de apagar dois e escrever a diferença.",
    ],
    samples: [
      "Pintando como xadrez, os dois cantos opostos têm a mesma cor, digamos preta. Restam 30 pretas e 32 brancas. Cada dominó cobre exatamente uma preta e uma branca, então 31 dominós cobririam 31 pretas, mas só há 30. Logo a cobertura é impossível.",
      "Contando os apertos por pessoa, a soma é 3 vezes o número de pessoas. Mas essa soma também é o dobro do número de apertos, porque cada aperto conta para duas pessoas. Então 3n é par, o que exige n par: com 5 pessoas, por exemplo, é impossível cada uma apertar a mão de exatamente 3.",
      "A soma é 2.025 × 2.026 ÷ 2 = 2.025 × 1.013, produto de dois ímpares, portanto ímpar. Trocar dois números pela diferença muda a soma em 2 vezes o menor deles, um número par, então a paridade da soma nunca muda. O último número tem a mesma paridade da soma inicial: ímpar.",
    ],
    focus: "a quantidade que se mantém em cada passo do processo",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const inicio = 1 + (seed % 11);
      const fim = inicio + 4 + (seed % 7);
      const soma = ((inicio + fim) * (fim - inicio + 1)) / 2;
      return c(
        "soma-que-sobra",
        `Estão na lousa os inteiros de ${inicio} a ${fim}. Repetidamente, apagam-se dois deles e escreve-se a soma dos dois. Que número fica na lousa no final?`,
        soma,
        [fim, soma - inicio],
        `A soma total não muda a cada passo; de ${inicio} a ${fim} ela vale ${soma}.`,
        {
          feedback: [
            "O maior número inicial não é o que sobra; sobra a soma de todos.",
            "Esqueceu de incluir o primeiro número na soma.",
          ],
        },
      );
    }
    if (variant === 1) {
      const lado = 3 + 2 * (seed % 4);
      const pretas = (lado * lado + 1) / 2;
      return c(
        "casas-pretas",
        `Um tabuleiro ${lado} × ${lado} é pintado como um xadrez, com as casas dos cantos pretas. Quantas casas pretas ele tem?`,
        pretas,
        [pretas - 1, lado * lado],
        `${lado} × ${lado} = ${lado * lado} casas; como o total é ímpar e as cores alternam, a cor dos cantos aparece uma vez a mais: ${pretas} pretas e ${pretas - 1} brancas.`,
        {
          feedback: [
            "Essa é a quantidade de casas brancas.",
            "Esse é o total de casas, somando as duas cores.",
          ],
        },
      );
    }
    const graus = 3 + (seed % 2);
    const pessoas = 2 * (4 + (seed % 9));
    const apertos = (pessoas * graus) / 2;
    return c(
      "apertos-contados-duas-vezes",
      `Em um grupo de ${pessoas} pessoas, cada uma cumprimentou exatamente ${graus} das outras. Quantos cumprimentos aconteceram?`,
      apertos,
      [pessoas * graus, pessoas],
      `Somando por pessoa, ${pessoas} × ${graus} = ${pessoas * graus}, mas cada cumprimento foi contado duas vezes: ${apertos}.`,
      {
        feedback: [
          "Contou cada cumprimento duas vezes, uma para cada pessoa.",
          "Cada pessoa cumprimentou mais de uma; o total não é o número de pessoas.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "invariantes",
    title: "O jogo que sempre termina igual",
    prompt:
      "Invente um jogo com fichas de duas cores e uma regra de troca, jogue várias vezes e descubra o que nunca muda. Depois use isso para prever o final antes de jogar.",
    lab: "groups",
    steps: [
      "Descreva a regra e registre o estado inicial e final de três partidas.",
      "Encontre uma quantidade que não mudou em nenhuma partida e explique por que a regra a preserva.",
      "Preveja o final de uma quarta partida antes de jogar e confira; se errar, refine o invariante.",
    ],
    rubric: [
      "Regra clara e três partidas registradas (0–2)",
      "Invariante identificado com justificativa para cada tipo de jogada (0–3)",
      "Previsão feita antes da partida e conferida (0–2)",
      "Registro que outra pessoa consegue reproduzir (0–1)",
    ],
  },
  homeSupport: [
    "Com moedas viradas na mesa, combinem uma regra de virar duas por vez e perguntem se dá para chegar em todas com a mesma face, antes de tentar.",
    "Ao guardar louça ou brinquedos em pares, perguntem o que acontece quando sobra um e por que a sobra não some trocando a ordem de guardar.",
  ],
};
