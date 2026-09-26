import { c, n, type SkillPack } from "../skill-factory";

/**
 * Caminhos e escolhas: contar caminhos em mapas simples, achar o caminho
 * mais curto, escolher com regras (sem repetir, sem passar por um lugar),
 * labirintos descritos e a lógica de tentar e voltar. Trilha Canguru P.
 */
export const caminhos: SkillPack = {
  id: "caminhos",
  name: "Caminhos e escolhas",
  domain: "canguru",
  lab: null,
  missions: [
    {
      title: "Quantos caminhos?",
      objective: "Contar caminhos diferentes entre dois lugares quando há poucas escolhas.",
      introduction:
        "Quando há mais de um jeito de ir de um lugar a outro, cada escolha em cada trecho conta. Se do ponto A ao B há 2 caminhos e do B ao C há 3, de A a C passando por B há 2 × 3 = 6 caminhos.",
      specs: [
        n(
          "contar-caminhos",
          "De casa até a praça há 2 ruas. Da praça até a escola há 3 ruas. Quantos caminhos diferentes há de casa até a escola passando pela praça?",
          6,
          "Para cada uma das 2 ruas até a praça há 3 opções depois: 2 × 3 = 6.",
          {
            misreads: [
              {
                value: 5,
                feedback: "Somou 2 com 3; cada rua de ida combina com cada rua de continuação.",
              },
            ],
          },
        ),
        c(
          "contar-caminhos",
          "Um parque tem 2 portões de entrada e 3 de saída, todos diferentes. De quantas maneiras dá para entrar por um e sair por outro?",
          "6",
          ["5", "3"],
          "2 entradas × 3 saídas = 6.",
          {
            feedback: [
              "5 soma 2 com 3; cada entrada combina com cada saída.",
              "3 é só o número de portões de saída.",
            ],
          },
        ),
        n(
          "contar-caminhos",
          "Numa malha, para ir de um canto ao canto oposto de um quadrado de 2 por 2 casas andando só para a direita e para cima, quantos caminhos diferentes existem?",
          6,
          "São 4 passos, 2 para a direita e 2 para cima, em qualquer ordem: DDCC, DCDC, DCCD, CDDC, CDCD, CCDD.",
          {
            misreads: [
              { value: 4, feedback: "4 é o número de passos; contando as ordens diferentes dá 6." },
            ],
          },
        ),
        c(
          "contar-caminhos",
          "Para ir de A a B há 3 estradas; de B a C há só 1. Quantos caminhos de A a C passando por B?",
          "3",
          ["4", "1"],
          "3 × 1 = 3.",
          {
            feedback: [
              "4 soma; a única estrada de B a C não multiplica as opções.",
              "1 é só o trecho final; antes há 3 escolhas.",
            ],
          },
        ),
        n(
          "contar-caminhos",
          "Um caracol quer ir de uma folha até uma flor. Pode passar pela pedra (2 caminhos até ela e 2 dela até a flor) ou pelo galho (1 caminho até ele e 3 dele até a flor). Quantos caminhos ao todo?",
          7,
          "Pela pedra: 2 × 2 = 4; pelo galho: 1 × 3 = 3; ao todo 4 + 3 = 7.",
          {
            misreads: [
              {
                value: 8,
                feedback:
                  "8 soma os quatro números; primeiro multiplique cada caminho (2 × 2 = 4 e 1 × 3 = 3) e só depois some: 7.",
              },
            ],
          },
        ),
        c(
          "contar-caminhos",
          "Numa malha de 1 por 3 casas (uma linha de 3), quantos caminhos há do canto esquerdo de baixo ao canto direito de cima, andando só para a direita e para cima?",
          "4",
          ["3", "6"],
          "São 3 passos para a direita e 1 para cima; o passo para cima pode ser o 1º, 2º, 3º ou 4º: 4 caminhos.",
          {
            feedback: [
              "3 é o número de passos para a direita; há 4 posições para o passo para cima.",
              "6 é para a malha 2 por 2.",
            ],
          },
        ),
        n(
          "contar-caminhos",
          "Numa casa de brinquedo, a sala tem 2 portas para o corredor e o corredor tem 3 portas para o jardim. De quantas maneiras dá para ir da sala ao jardim?",
          6,
          "2 × 3 = 6.",
          {
            misreads: [
              { value: 5, feedback: "Somou; os trechos vêm um depois do outro e se multiplicam." },
            ],
          },
        ),
        c(
          "contar-caminhos",
          "Quando dois trechos se seguem (primeiro um, depois o outro), os caminhos se multiplicam. Quando são dois jeitos diferentes de fazer a viagem inteira, eles se:",
          "Somam",
          ["Multiplicam também", "Dividem"],
          "Ou vai por um jeito, ou por outro: soma. Um trecho depois do outro: multiplica.",
          {
            feedback: [
              "Multiplicar é para trechos em sequência.",
              "Dividir não aparece na contagem de caminhos.",
            ],
          },
        ),
      ],
    },
    {
      title: "O caminho mais curto",
      objective: "Comparar caminhos e escolher o mais curto somando os trechos.",
      introduction:
        "Para achar o caminho mais curto, some os trechos de cada caminho possível e compare. Um caminho com mais curvas pode ser mais curto se os trechos forem pequenos.",
      specs: [
        n(
          "mais-curto",
          "De casa à padaria há dois caminhos: pela rua A são 300 metros e depois 200; pela rua B são 150 metros, 150 e 250. Quantos metros tem o caminho mais curto?",
          500,
          "A: 300 + 200 = 500. B: 150 + 150 + 250 = 550. O mais curto tem 500.",
          { misreads: [{ value: 550, feedback: "550 é o caminho B, o mais comprido." }] },
        ),
        c(
          "mais-curto",
          "Numa malha, para ir da casa A1 até a casa C3 andando só para a direita e para cima, todos os caminhos têm:",
          "O mesmo comprimento: 4 passos",
          ["Comprimentos diferentes", "Sempre 6 passos"],
          "Qualquer caminho usa 2 passos para a direita e 2 para cima: 4 passos.",
          {
            feedback: [
              "Sem voltar, a quantidade de passos não muda.",
              "6 passos seria para uma malha maior.",
            ],
          },
        ),
        n(
          "mais-curto",
          "Um entregador precisa ir da loja à casa 1 (400 metros) e depois à casa 2, que fica a 300 metros da casa 1 e a 600 metros da loja. Quantos metros ele anda indo à casa 1 primeiro?",
          700,
          "400 + 300 = 700.",
          {
            misreads: [
              {
                value: 1000,
                feedback: "1.000 soma 400 com 600, mas da casa 1 até a casa 2 são só 300.",
              },
            ],
          },
        ),
        c(
          "mais-curto",
          "Entre um caminho reto de 500 metros e um caminho com duas curvas, formado por 3 trechos de 200 metros cada um, qual é mais curto?",
          "O reto, com 500 metros, contra 600 do outro",
          ["O das curvas, porque cada trecho é menor", "Empatam"],
          "3 × 200 = 600 > 500.",
          {
            feedback: [
              "Trechos menores, mas em maior quantidade: 600 no total.",
              "500 e 600 são diferentes.",
            ],
          },
        ),
        n(
          "mais-curto",
          "Numa cidade de ruas quadriculadas, o hospital fica 3 quarteirões ao norte e 4 a leste da escola. Qual é o menor número de quarteirões para ir da escola ao hospital pelas ruas?",
          7,
          "3 + 4 = 7, em qualquer ordem, sem voltar.",
          {
            misreads: [
              {
                value: 12,
                feedback: "12 multiplica; andar 3 para o norte e 4 para o leste soma 7.",
              },
            ],
          },
        ),
        c(
          "mais-curto",
          "Ir de A a C passando por B custa 4 + 5 = 9 passos. Há uma estrada direta de A a C com 10 passos. Qual é o caminho mais curto?",
          "Passando por B, com 9 passos",
          ["A estrada direta, porque é reta", "Empatam"],
          "9 < 10: reto não quer dizer mais curto.",
          {
            feedback: ["A direta tem 10 passos, mais que 9.", "9 e 10 são diferentes."],
          },
        ),
        n(
          "mais-curto",
          "Uma abelha visita 3 flores em linha: a 1ª a 2 metros da colmeia, a 2ª a 5 metros e a 3ª a 9 metros, todas na mesma direção. Quantos metros ela voa da colmeia até a 3ª flor passando pelas outras?",
          9,
          "Como estão em linha e na mesma direção, o total é a distância até a última: 9 metros.",
          {
            misreads: [
              {
                value: 16,
                feedback:
                  "16 soma as três distâncias desde a colmeia, mas ela não volta à colmeia entre as flores.",
              },
            ],
          },
        ),
        c(
          "mais-curto",
          "Para escolher o caminho mais curto entre vários, o método mais seguro é:",
          "Somar os trechos de cada caminho e comparar os totais",
          ["Escolher o que tem menos curvas", "Escolher o que parece menor no desenho"],
          "Só o total de cada caminho decide.",
          {
            feedback: [
              "Menos curvas não garante menos metros.",
              "O desenho pode enganar; a soma não.",
            ],
          },
        ),
      ],
    },
    {
      title: "Caminhos com regras",
      objective:
        "Contar ou escolher caminhos que obedecem a uma regra: não repetir lugar, não passar por um ponto, passar por outro.",
      introduction:
        "Às vezes o caminho tem regras: não pode passar por um lugar, ou precisa passar por outro. Aí contamos só os caminhos que obedecem, e uma lista organizada ajuda.",
      specs: [
        n(
          "regras",
          "Numa malha de 2 por 2 casas há 6 caminhos do canto inferior esquerdo ao superior direito andando só para a direita e para cima. Quantos deles passam pelo centro da malha?",
          4,
          "Até o centro há 2 caminhos (DC e CD) e do centro ao fim há 2: 2 × 2 = 4.",
          {
            misreads: [
              {
                value: 6,
                feedback: "6 é o total; os caminhos DDCC e CCDD não passam pelo centro.",
              },
            ],
          },
        ),
        c(
          "regras",
          "Na mesma malha de 2 por 2, quantos caminhos NÃO passam pelo centro?",
          "2",
          ["4", "6"],
          "6 no total menos 4 que passam pelo centro: 2 (DDCC e CCDD).",
          {
            feedback: ["4 é o número que passa pelo centro.", "6 é o total, com e sem centro."],
          },
        ),
        n(
          "regras",
          "De casa até a escola há 3 caminhos, mas um deles passa por uma rua fechada. Quantos caminhos estão disponíveis?",
          2,
          "3 − 1 = 2.",
          { misreads: [{ value: 3, feedback: "A rua fechada elimina um caminho." }] },
        ),
        c(
          "regras",
          "Numa cidade, de A a B há 2 ruas e de B a C há 3 ruas. Uma das ruas de B a C está em obras. Quantos caminhos de A a C passando por B continuam abertos?",
          "4",
          ["6", "5"],
          "2 × (3 − 1) = 4.",
          {
            feedback: [
              "6 era o total antes das obras.",
              "5 tira só 1 caminho, mas a rua fechada atrapalha os 2 caminhos que chegam a ela.",
            ],
          },
        ),
        n(
          "regras",
          "Um carteiro precisa passar pela casa 2 obrigatoriamente. Do correio até a casa 2 há 3 caminhos e da casa 2 até o fim da rota há 2. Quantas rotas ele pode fazer?",
          6,
          "3 × 2 = 6.",
          { misreads: [{ value: 5, feedback: "Somou; os trechos vêm um depois do outro." }] },
        ),
        c(
          "regras",
          "Numa malha de 1 por 2 casas (uma linha de 2), os caminhos do canto inferior esquerdo ao superior direito andando só para a direita e para cima são 3. Se o cantinho de cima da esquerda (onde o caminho CDD vira) for proibido, quantos sobram?",
          "2",
          ["3", "1"],
          "Os caminhos são CDD, DCD e DDC; só CDD passa pelo cantinho proibido. Sobram 2.",
          {
            feedback: ["3 é sem a proibição.", "Só um caminho é eliminado."],
          },
        ),
        n(
          "regras",
          "Um passeio deve visitar as praças A, B e C, uma vez cada, em qualquer ordem, começando em A. Quantas ordens diferentes são possíveis?",
          2,
          "Começando em A: A-B-C ou A-C-B.",
          {
            misreads: [
              {
                value: 6,
                feedback: "6 seria sem fixar o começo; começando em A, sobram 2 ordens.",
              },
            ],
          },
        ),
        c(
          "regras",
          "Para contar caminhos que passam por um ponto obrigatório, o jeito certo é:",
          "Contar os caminhos até o ponto e os do ponto ao fim, e multiplicar",
          [
            "Contar os caminhos até o ponto e os do ponto ao fim, e somar",
            "Contar todos os caminhos, passando ou não pelo ponto",
          ],
          "Trechos em sequência se multiplicam: cada caminho até o ponto pode continuar por qualquer caminho do ponto até o fim.",
          {
            feedback: [
              "Os dois trechos vêm um depois do outro, então cada caminho da primeira parte combina com cada caminho da segunda: é multiplicação, não soma.",
              "Assim entram também os caminhos que não passam pelo ponto obrigatório.",
            ],
          },
        ),
      ],
    },
    {
      title: "Labirintos e becos",
      objective:
        "Resolver labirintos descritos em palavras e usar a estratégia de voltar quando o caminho fecha.",
      introduction:
        "Num labirinto, alguns caminhos terminam em beco. A estratégia é tentar, e, se fechar, voltar até a última bifurcação (o lugar onde o caminho se divide) e tentar outra saída. Marcar por onde já passou evita rodar em círculos.",
      specs: [
        c(
          "labirinto",
          "Num labirinto, na primeira bifurcação a esquerda leva a um beco e a direita segue. Na segunda bifurcação, a esquerda leva à saída. Qual sequência de escolhas sai do labirinto?",
          "Direita, depois esquerda",
          ["Esquerda, depois direita", "Direita, depois direita"],
          "Primeiro direita (a esquerda é beco), depois esquerda (é a saída).",
          {
            feedback: [
              "Esquerda na primeira é beco.",
              "Na segunda bifurcação a saída é à esquerda.",
            ],
          },
        ),
        n(
          "labirinto",
          "Num labirinto, a primeira bifurcação tem 2 saídas; cada saída leva a outra bifurcação com 2 saídas, e cada uma dessas leva a mais uma bifurcação com 2 saídas. Só um dos caminhos leva ao fim. Quantos caminhos diferentes existem para tentar?",
          8,
          "2 × 2 × 2 = 8 caminhos; no pior caso, o certo é o último tentado.",
          {
            misreads: [
              { value: 6, feedback: "Somou 2 três vezes; cada bifurcação dobra os caminhos." },
            ],
          },
        ),
        c(
          "labirinto",
          "Ao chegar a um beco sem saída, o melhor a fazer é:",
          "Voltar à última bifurcação e tentar outra saída",
          [
            "Tentar de novo o mesmo caminho, com mais cuidado",
            "Voltar até o começo e tentar tudo de novo",
          ],
          "Voltar só até a última escolha economiza caminho e evita repetir. Marcar a saída que já foi tentada ajuda a não entrar nela outra vez.",
          {
            feedback: [
              "Um beco continua sendo beco: repetir o mesmo caminho leva ao mesmo lugar.",
              "Voltar ao começo repete trechos que já se sabe que funcionam.",
            ],
          },
        ),
        n(
          "labirinto",
          "Num labirinto, Bia entra, anda 5 passos, encontra um beco e volta os 5 passos. Depois anda 8 passos até a saída. Quantos passos ela deu ao todo?",
          18,
          "5 + 5 + 8 = 18.",
          { misreads: [{ value: 13, feedback: "Esqueceu os 5 passos de volta do beco." }] },
        ),
        c(
          "labirinto",
          "Duas crianças resolvem o mesmo labirinto. Uma marca com giz os caminhos que deram em beco; a outra não marca. Quem tem menos chance de repetir um beco?",
          "A que marca, porque reconhece o caminho já tentado",
          ["A que não marca, porque anda mais rápido", "As duas têm a mesma chance"],
          "A marcação guarda a informação do que já falhou.",
          {
            feedback: [
              "Andar rápido não evita entrar no mesmo beco de novo.",
              "Sem marcar, é fácil esquecer qual saída já foi tentada.",
            ],
          },
        ),
        n(
          "labirinto",
          "Um labirinto em forma de árvore tem 1 bifurcação com 3 saídas; cada saída leva a outra bifurcação com 2 saídas. Quantos finais diferentes o labirinto tem?",
          6,
          "3 × 2 = 6 finais.",
          { misreads: [{ value: 5, feedback: "Somou 3 com 2; cada uma das 3 saídas abre em 2." }] },
        ),
        c(
          "labirinto",
          "Numa descrição: 'siga em frente, na primeira bifurcação vá à direita, na segunda à esquerda, na terceira à direita'. Quantas decisões a pessoa toma?",
          "3",
          ["4", "2"],
          "Três bifurcações, três decisões; 'siga em frente' não é escolha.",
          {
            feedback: ["'Siga em frente' não tem alternativa.", "São três bifurcações descritas."],
          },
        ),
        c(
          "labirinto",
          "Por que marcar o caminho evita andar em círculos num labirinto com voltas?",
          "Porque a marca mostra por onde já se passou",
          ["Porque a marca mostra onde fica a saída", "Porque a marca deixa o caminho mais curto"],
          "Ao rever a marca, a pessoa sabe que já passou ali e escolhe outra saída. A marca transforma memória em informação visível.",
          {
            feedback: [
              "A marca não mostra a saída; ela só mostra os lugares por onde a pessoa já andou.",
              "O labirinto continua do mesmo tamanho; a marca só evita que a pessoa repita trechos.",
            ],
          },
        ),
      ],
    },
    {
      title: "Escolher o caminho",
      objective:
        "Decidir o melhor caminho quando há mais de um critério: distância, tempo, regras.",
      introduction:
        "O melhor caminho depende do que se quer: o mais curto, o mais rápido, o que passa por um lugar. Antes de escolher, é preciso saber o critério; depois, comparar só o que importa.",
      estimatedMinutes: 18,
      specs: [
        c(
          "escolher",
          "Dois caminhos até a escola: o A tem 600 metros e leva 10 minutos; o B tem 500 metros, mas tem um semáforo que faz levar 12 minutos. Qual é o mais rápido?",
          "O A, com 10 minutos",
          ["O B, porque é mais curto", "Empatam"],
          "Mais curto não é o mesmo que mais rápido: 10 < 12.",
          {
            feedback: [
              "O critério pedido é tempo, e o B leva mais.",
              "10 e 12 minutos são diferentes.",
            ],
          },
        ),
        n(
          "escolher",
          "Um passeio pode ir da casa ao parque (400 metros) e do parque à sorveteria (300 metros), ou da casa direto à sorveteria (500 metros). Quantos metros a mais anda quem passa pelo parque?",
          200,
          "400 + 300 = 700; 700 − 500 = 200.",
          {
            misreads: [
              {
                value: 700,
                feedback: "700 é o caminho pelo parque; a pergunta pede a diferença para 500.",
              },
            ],
          },
        ),
        c(
          "escolher",
          "Se a regra é 'passar pela padaria', e o caminho pela padaria é mais comprido, qual caminho escolher?",
          "O que passa pela padaria",
          ["O mais curto, sempre", "Tanto faz, os dois servem"],
          "A regra vem antes da distância: primeiro se obedece à regra; depois, entre os que obedecem, escolhe-se o melhor.",
          {
            feedback: [
              "Ser mais curto não adianta se o caminho não cumpre a regra.",
              "O caminho mais curto não passa pela padaria, então não serve.",
            ],
          },
        ),
        n(
          "escolher",
          "Três caminhos até a praia medem 1.200, 900 e 1.500 metros. O de 900 está fechado. Quantos metros tem o mais curto disponível?",
          1200,
          "Sem o de 900, o menor é 1.200.",
          { misreads: [{ value: 900, feedback: "O de 900 está fechado." }] },
        ),
        c(
          "escolher",
          "Um mapa mostra dois caminhos até o cinema: um por 4 quarteirões planos e outro por 3 quarteirões de ladeira. Para quem vai de bicicleta e quer menos esforço, o critério importante é:",
          "A subida, não só a quantidade de quarteirões",
          ["Só a quantidade de quarteirões", "O caminho que parece mais reto no mapa"],
          "O critério muda a escolha: 3 quarteirões de subida podem cansar mais que 4 planos.",
          {
            feedback: [
              "Só contar quarteirões ignora o esforço da ladeira.",
              "Parecer reto no desenho não diz nada sobre o esforço; o que cansa é a ladeira, e ela pode estar justamente no caminho mais reto.",
            ],
          },
        ),
        n(
          "escolher",
          "Uma entrega sai da loja, passa por 3 pontos e volta à loja. Da loja ao 1º ponto são 2 quilômetros; do 1º ao 2º e do 2º ao 3º é 1 quilômetro cada; do 3º de volta à loja são 2 quilômetros. Quantos quilômetros tem a rota?",
          6,
          "Loja ao 1º ponto (2), do 1º ao 2º (1), do 2º ao 3º (1), do 3º de volta à loja (2): 6.",
          {
            misreads: [
              {
                value: 12,
                feedback:
                  "12 iria e voltaria à loja a cada ponto; a rota mais curta visita os pontos em linha.",
              },
            ],
          },
        ),
        c(
          "escolher",
          "Duda quer o caminho mais curto e Rui quer o caminho que passa pela loja de doces. Eles vão juntos. O que devem fazer?",
          "Entre os caminhos pela loja, pegar o mais curto",
          ["Cada um vai pelo caminho que prefere", "Ir pelo mais curto e esquecer a loja"],
          "Combinar critérios: primeiro ficar só com os caminhos que passam pela loja, como Rui quer, e entre eles escolher o mais curto, como Duda quer.",
          {
            feedback: [
              "Eles vão juntos; precisam de um caminho só.",
              "Isso ignora o critério de Rui.",
            ],
          },
        ),
        c(
          "escolher",
          "Antes de escolher um caminho, a primeira pergunta deve ser:",
          "O que eu quero: mais curto, mais rápido ou outro?",
          ["Qual caminho parece mais bonito?", "Qual caminho tem menos curvas no mapa?"],
          "O critério define a comparação: o mais curto, o mais rápido ou o que passa por algum lugar.",
          {
            feedback: [
              "Beleza pode ser um critério, mas só se for o que se quer.",
              "Menos curvas não quer dizer mais curto nem mais rápido; primeiro é preciso saber o que se quer.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt:
      "Coloque em ordem os passos para contar os caminhos entre dois lugares passando por um ponto do meio.",
    labels: [
      "Contar os caminhos do começo até o ponto do meio",
      "Contar os caminhos do ponto do meio até o fim",
      "Multiplicar as duas contagens",
      "Conferir listando alguns caminhos",
    ],
    explanation:
      "Trechos em sequência se multiplicam; a lista de conferência pega caminhos esquecidos ou repetidos.",
  },
  justification: {
    prompts: [
      "Explique por que de casa à escola, com 2 ruas até a praça e 3 ruas depois, há 6 caminhos e não 5.",
      "Explique por que todos os caminhos numa malha, andando só para a direita e para cima, têm o mesmo número de passos.",
      "Explique por que voltar até a última bifurcação é melhor do que voltar ao começo num labirinto.",
    ],
    samples: [
      "Se eu vou pela rua 1 até a praça, depois posso seguir por 3 ruas: são 3 caminhos. Se eu vou pela rua 2, mais 3 caminhos. 3 + 3 = 6. Somar 2 com 3 dá 5, mas isso contaria as ruas, não os caminhos inteiros.",
      "Para chegar ao canto de cima à direita, preciso andar certo número de casas para a direita e certo número para cima. Sem voltar, não dá para pular nenhuma nem repetir. Só muda a ordem dos passos, não a quantidade. Numa malha 2 por 2 são sempre 2 para a direita e 2 para cima: 4 passos.",
      "Os trechos antes da última bifurcação já funcionaram, senão eu não teria chegado ali. Voltar ao começo repete tudo isso à toa. Voltando só até a última escolha, eu troco só a parte que deu errado.",
    ],
    focus: "a combinação de escolhas em sequência",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const a = 2 + (seed % 3);
      const b = 3 + (seed % 4);
      const meio = "praça";
      return c(
        "caminhos-por-um-ponto",
        `De casa até a ${meio} há ${a} ruas diferentes. Da ${meio} até a biblioteca há ${b} ruas diferentes. Quantos caminhos diferentes há de casa até a biblioteca passando pela ${meio}?`,
        `${a * b}`,
        [`${a + b}`, `${a * b + a}`],
        `Cada uma das ${a} ruas combina com as ${b} seguintes: ${a} × ${b} = ${a * b}.`,
        {
          feedback: [
            "Somou as ruas; cada rua de ida combina com cada rua de continuação.",
            "Contou um grupo de caminhos a mais.",
          ],
        },
      );
    }
    if (variant === 1) {
      const norte = 2 + (seed % 4);
      const leste = 3 + (seed % 5);
      return c(
        "menor-numero-de-quarteiroes",
        `Numa cidade de ruas quadriculadas, a escola fica ${norte} quarteirões ao norte e ${leste} a leste da casa de Téo. Qual é o menor número de quarteirões que ele anda pelas ruas para chegar à escola?`,
        `${norte + leste}`,
        [`${norte * leste}`, `${Math.max(norte, leste)}`],
        `${norte} para o norte e ${leste} para o leste, em qualquer ordem, sem voltar: ${norte + leste}.`,
        {
          feedback: [
            "Multiplicou; os quarteirões de cada direção se somam.",
            "Contou só uma das direções; ele precisa andar as duas.",
          ],
        },
      );
    }
    const ida = 3 + (seed % 6);
    const volta = ida;
    const final = 5 + (seed % 7);
    return c(
      "passos-com-beco",
      `Num labirinto, Nara sai de uma bifurcação, anda ${ida} passos, encontra um beco e volta os mesmos ${volta} passos até a bifurcação de onde saiu. Depois anda ${final} passos até a saída. Quantos passos ela deu ao todo?`,
      `${ida + volta + final}`,
      [`${ida + final}`, `${ida + volta + final + ida}`],
      `${ida} + ${volta} + ${final} = ${ida + volta + final}.`,
      {
        feedback: ["Esqueceu os passos de volta do beco.", "Contou a ida ao beco duas vezes."],
      },
    );
  },
  deepChallenge: {
    skillId: "caminhos",
    title: "Todos os caminhos do quarteirão",
    prompt:
      "Desenhe um mapa quadriculado pequeno (2 por 3 casas) entre a sua casa e um lugar que você gosta. Liste todos os caminhos andando só para a direita e para cima, sem repetir, e depois conte quantos passam por um ponto que você escolher.",
    lab: null,
    steps: [
      "Desenhe a malha e marque o começo e o fim.",
      "Liste os caminhos com letras (D para direita, C para cima) até ter certeza de que não falta nenhum.",
      "Escolha um ponto no meio e conte quantos caminhos passam por ele, conferindo com a multiplicação dos trechos.",
    ],
    rubric: [
      "Malha desenhada com começo e fim (0–1)",
      "Todos os 10 caminhos listados sem repetição (0–3)",
      "Contagem pelo ponto do meio feita e conferida pela multiplicação (0–3)",
      "Explicação de como teve certeza de que a lista estava completa (0–1)",
    ],
  },
  homeSupport: [
    "No caminho para algum lugar, perguntem quantos jeitos diferentes existem de chegar e testem um jeito novo na volta.",
    "Montem um labirinto com fita no chão ou desenhado e brinquem de resolver marcando os becos.",
  ],
};
