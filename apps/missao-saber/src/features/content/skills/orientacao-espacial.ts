import { c, n, type SkillPack } from "../skill-factory";

/**
 * Orientação espacial: esquerda e direita, mover-se em uma malha, giros e
 * voltas, pontos de vista e mapas simples com instruções.
 * Trilhas Canguru P e Mirim 2.
 */
export const orientacaoEspacial: SkillPack = {
  id: "orientacao-espacial",
  name: "Localizar e mover",
  domain: "common",
  lab: "grid",
  missions: [
    {
      title: "Onde está?",
      objective: "Descrever posições com esquerda, direita, em cima, embaixo, entre e ao lado.",
      introduction:
        "Para dizer onde algo está, usamos palavras de posição: à esquerda, à direita, em cima, embaixo, entre. A posição depende de quem olha e de onde está o objeto.",
      specs: [
        c(
          "posicao",
          "Em uma prateleira, da esquerda para a direita, estão: urso, boneca, carrinho, bola. O que está entre a boneca e a bola?",
          "O carrinho",
          ["O urso", "A boneca"],
          "A ordem é urso, boneca, carrinho, bola; entre boneca e bola está o carrinho.",
          {
            feedback: [
              "O urso está na ponta esquerda.",
              "A boneca é um dos limites, não o que está entre.",
            ],
          },
        ),
        n(
          "posicao",
          "Numa fila de 9 crianças, Tomás é o 4º da esquerda para a direita. Qual é a posição dele contando da direita para a esquerda?",
          6,
          "À direita de Tomás há 5 crianças; ele é o 6º pela direita. Conferindo: 4 + 6 = 9 + 1.",
          {
            misreads: [
              {
                value: 5,
                feedback: "5 é quantas crianças estão à direita dele; ele mesmo é o 6º.",
              },
            ],
          },
        ),
        c(
          "posicao",
          "Ana está de frente para Bruno. Ana levanta a mão direita. Do ponto de vista de Bruno, a mão levantada está:",
          "À esquerda dele",
          ["À direita dele", "Não dá para saber"],
          "Quando duas pessoas estão de frente, a direita de uma fica do lado da esquerda da outra.",
          {
            feedback: [
              "Se estivessem lado a lado, seria a direita; de frente, os lados trocam.",
              "Dá para saber: de frente, os lados se invertem.",
            ],
          },
        ),
        c(
          "posicao",
          "Em um armário com 3 prateleiras, os pratos estão em cima dos copos e as panelas estão embaixo dos copos. Em que prateleira estão os copos?",
          "Na do meio",
          ["Na de cima", "Na de baixo"],
          "Pratos em cima, copos no meio, panelas embaixo.",
          {
            feedback: ["Em cima estão os pratos.", "Embaixo estão as panelas."],
          },
        ),
        n(
          "posicao",
          "Em uma estante com 5 andares, contados de baixo para cima, os jogos estão no 2º andar. Quantos andares há acima dos jogos?",
          3,
          "Acima do 2º andar estão o 3º, o 4º e o 5º: 3 andares.",
          { misreads: [{ value: 2, feedback: "2 é o andar dos jogos; acima dele há 3." }] },
        ),
        c(
          "posicao",
          "Luca olha para uma casa: a porta fica no meio, a janela azul à esquerda da porta e a janela verde à direita. Quem está dentro da casa, olhando para fora pela porta, vê a janela azul:",
          "À sua direita",
          ["À sua esquerda", "Atrás de si"],
          "De dentro, olhando para fora, a pessoa está virada ao contrário de Luca, então os lados trocam.",
          {
            feedback: [
              "À esquerda é como Luca vê, de fora.",
              "As janelas ficam na mesma parede da porta, não atrás.",
            ],
          },
        ),
        n(
          "posicao",
          "Em uma fila de 12 pessoas, Sara é a 5ª e Davi é o 9º, contando do mesmo lado. Quantas pessoas há entre os dois?",
          3,
          "Entre a 5ª e a 9ª estão a 6ª, a 7ª e a 8ª: 3 pessoas.",
          { misreads: [{ value: 4, feedback: "9 − 5 = 4 conta o Davi; entre os dois há 3." }] },
        ),
        c(
          "posicao",
          "Numa mesa redonda com 6 lugares, Bia está de frente para Caio. Quantas pessoas há entre eles, de cada lado?",
          "2 de cada lado",
          ["3 de cada lado", "1 de cada lado"],
          "Tirando Bia e Caio, sobram 4 lugares, 2 de cada lado.",
          {
            feedback: ["3 de cada lado daria 8 lugares.", "1 de cada lado daria 4 lugares."],
          },
        ),
      ],
    },
    {
      title: "Passos na malha",
      objective:
        "Seguir e escrever caminhos em uma malha quadriculada usando passos para os lados, para cima e para baixo.",
      introduction:
        "Numa malha, cada casa tem uma coluna (letra) e uma linha (número). Um caminho é uma lista de passos: 2 para a direita, 1 para cima. Contar os passos com cuidado leva à casa certa.",
      specs: [
        c(
          "malha",
          "Um robô está na casa B2 de uma malha. Ele anda 3 casas para a direita e 1 para cima. Onde ele para? As colunas vão de A a F e as linhas de 1 a 5, de baixo para cima.",
          "E3",
          ["E1", "C5"],
          "B, C, D, E: três à direita chega em E; 2 + 1 = 3.",
          {
            feedback: [
              "Para cima o número da linha aumenta: de 2 vai para 3.",
              "3 à direita muda a letra em 3, de B para E.",
            ],
          },
        ),
        n(
          "malha",
          "Numa malha, para ir da casa A1 até a casa D4 andando só para a direita e para cima, quantos passos são dados no total?",
          6,
          "De A a D são 3 passos para a direita; de 1 a 4 são 3 para cima: 6 passos.",
          {
            misreads: [
              { value: 3, feedback: "3 é só uma das direções; a outra também tem 3 passos." },
            ],
          },
        ),
        c(
          "malha",
          "Um caminho é: 2 para cima, 3 para a direita, 2 para baixo. Ao final, em relação ao ponto de partida, o robô está:",
          "3 casas à direita, na mesma linha",
          ["3 casas à direita e 2 acima", "Na mesma casa"],
          "Os 2 para cima e os 2 para baixo se cancelam; sobram 3 para a direita.",
          {
            feedback: [
              "Os 2 para baixo desfazem os 2 para cima.",
              "Os 3 para a direita não foram desfeitos.",
            ],
          },
        ),
        n(
          "malha",
          "Um jogador anda 4 casas para a direita, depois 6 para a esquerda. Quantas casas ele está do ponto de partida?",
          2,
          "4 para a direita e 6 para a esquerda: termina 2 casas à esquerda de onde começou.",
          {
            misreads: [
              {
                value: 10,
                feedback: "10 é o total andado; a pergunta é a distância até o ponto de partida.",
              },
            ],
          },
        ),
        c(
          "malha",
          "Duas formigas saem da mesma casa. Uma anda 2 para cima e 2 para a direita. A outra anda 2 para a direita e 2 para cima. Onde elas param?",
          "Na mesma casa",
          ["Em casas vizinhas", "A 4 casas uma da outra"],
          "A ordem dos passos não muda a casa final quando os passos são os mesmos.",
          {
            feedback: [
              "Os passos são iguais, só trocaram de ordem.",
              "Nenhuma andou mais que a outra em nenhuma direção.",
            ],
          },
        ),
        n(
          "malha",
          "Uma malha tem 5 colunas e 4 linhas. Quantas casas ela tem ao todo?",
          20,
          "5 × 4 = 20 casas.",
          {
            misreads: [
              { value: 9, feedback: "Somou colunas e linhas; cada uma das 4 linhas tem 5 casas." },
            ],
          },
        ),
        c(
          "malha",
          "Para ir da casa C1 até a casa C5 sem sair da coluna C, o robô deve andar:",
          "4 casas para cima",
          ["5 casas para cima", "4 casas para a direita"],
          "De 1 até 5 são 4 passos, todos na mesma coluna.",
          {
            feedback: [
              "De 1 a 5 são 4 passos, não 5.",
              "Para a direita mudaria a coluna, e ele deve ficar em C.",
            ],
          },
        ),
        c(
          "malha",
          "Qual sequência de passos leva da casa A1 à casa B3?",
          "1 para a direita e 2 para cima",
          ["2 para a direita e 1 para cima", "1 para a direita e 3 para cima"],
          "De A para B é 1 coluna; de 1 para 3 são 2 linhas.",
          {
            feedback: [
              "2 para a direita chegaria na coluna C.",
              "3 para cima chegaria na linha 4.",
            ],
          },
        ),
      ],
    },
    {
      title: "Giros e voltas",
      objective:
        "Reconhecer giros de um quarto, meia volta e volta inteira e o que muda na direção.",
      introduction:
        "Um giro muda para onde se olha. Um quarto de volta para a direita, olhando para o norte, faz olhar para o leste. Meia volta faz olhar para trás. Uma volta inteira volta ao começo.",
      specs: [
        c(
          "giro",
          "Uma menina olha para o norte e dá meia volta. Para onde ela olha agora?",
          "Sul",
          ["Leste", "Norte"],
          "Meia volta é olhar para o lado contrário: do norte para o sul.",
          {
            feedback: [
              "Leste seria um quarto de volta para a direita.",
              "Norte seria uma volta inteira.",
            ],
          },
        ),
        n(
          "giro",
          "Um ponteiro faz 3 quartos de volta. Quantos quartos de volta faltam para completar uma volta inteira?",
          1,
          "Uma volta tem 4 quartos; 4 − 3 = 1.",
          { misreads: [{ value: 3, feedback: "3 é o que já foi girado; falta 1 quarto." }] },
        ),
        c(
          "giro",
          "Um robô olha para o leste e gira um quarto de volta para a esquerda. Para onde ele olha?",
          "Norte",
          ["Sul", "Oeste"],
          "Olhando para o leste, a esquerda é o norte.",
          {
            feedback: ["Sul é um quarto de volta para a direita.", "Oeste seria meia volta."],
          },
        ),
        c(
          "giro",
          "Uma seta aponta para cima. Depois de dar 2 quartos de volta para a direita, ela aponta para:",
          "Baixo",
          ["Direita", "Cima"],
          "2 quartos de volta é meia volta: de cima para baixo.",
          {
            feedback: ["Direita é depois de 1 quarto de volta.", "Cima seria depois de 4 quartos."],
          },
        ),
        n(
          "giro",
          "Uma dançarina gira 6 quartos de volta para a direita. Depois de tirar as voltas inteiras, quantos quartos de volta sobram?",
          2,
          "4 quartos fazem 1 volta; sobram 2 quartos, ou seja, meia volta.",
          {
            misreads: [
              {
                value: 6,
                feedback: "6 quartos são mais que uma volta; tire os 4 da volta inteira.",
              },
            ],
          },
        ),
        c(
          "giro",
          "Um carrinho olha para o norte, gira um quarto para a direita, depois mais um quarto para a direita e por fim um quarto para a esquerda. Para onde ele olha?",
          "Leste",
          ["Sul", "Oeste"],
          "Norte, leste, sul, e o quarto para a esquerda volta para o leste.",
          {
            feedback: [
              "Sul é antes do último giro.",
              "Oeste seria mais um quarto para a direita, não para a esquerda.",
            ],
          },
        ),
        c(
          "giro",
          "A letra L é girada meia volta. Como ela fica?",
          "De cabeça para baixo: o pé fica em cima, apontando para a esquerda, e a perna desce dele",
          ["Exatamente igual", "Deitada, como um traço"],
          "Meia volta vira a figura de cabeça para baixo e troca os lados.",
          {
            feedback: [
              "Só figuras simétricas por meia volta ficam iguais, como o S ou o N.",
              "Girar não muda a forma, só a posição.",
            ],
          },
        ),
        n(
          "giro",
          "Um ponteiro de relógio vai do 12 até o 3. Quantos quartos de volta ele deu?",
          1,
          "Do 12 ao 3 é um quarto do mostrador: 1 quarto de volta.",
          {
            misreads: [
              {
                value: 3,
                feedback: "3 é o número no mostrador; do 12 ao 3 é um quarto do caminho.",
              },
            ],
          },
        ),
      ],
    },
    {
      title: "De que lado se vê",
      objective:
        "Imaginar como um objeto ou uma cena aparece vista de outro lugar: de cima, de frente, de lado, no espelho.",
      introduction:
        "A mesma coisa parece diferente de lugares diferentes. Vista de cima, uma pilha mostra só o topo; no espelho, esquerda e direita trocam de lugar.",
      specs: [
        c(
          "vista",
          "Uma torre tem 3 cubos empilhados. Vista de cima, quantos quadrados aparecem?",
          "1",
          ["3", "0"],
          "De cima só se vê o cubo do topo: um quadrado.",
          {
            feedback: [
              "3 quadrados aparecem de frente, não de cima.",
              "O cubo de cima sempre aparece.",
            ],
          },
        ),
        n(
          "vista",
          "Sobre uma mesa há uma fileira de 4 cubos e, em cima do primeiro, mais 1 cubo. Vista de frente, quantos quadrados aparecem?",
          5,
          "4 na fileira de baixo e 1 em cima do primeiro: 5.",
          {
            misreads: [
              { value: 4, feedback: "Faltou o cubo de cima, que também aparece de frente." },
            ],
          },
        ),
        c(
          "vista",
          "A palavra 'PATO' escrita num papel é vista num espelho. O que acontece?",
          "As letras aparecem invertidas e a ordem parece de trás para frente",
          ["Fica igual", "As letras ficam de cabeça para baixo"],
          "O espelho troca esquerda e direita.",
          {
            feedback: [
              "Só palavras como OVO, com letras simétricas e lidas igual nos dois sentidos, parecem iguais.",
              "De cabeça para baixo seria um giro, não um espelho.",
            ],
          },
        ),
        c(
          "vista",
          "Um copo está à direita de um prato quando olhamos de frente para a mesa. Quem olha a mesa do lado oposto vê o copo:",
          "À esquerda do prato",
          ["À direita do prato", "Atrás do prato"],
          "Do lado oposto, esquerda e direita trocam.",
          {
            feedback: [
              "À direita é a visão de quem está de frente.",
              "O copo continua ao lado do prato, só o lado troca.",
            ],
          },
        ),
        n(
          "vista",
          "Uma construção de cubos, vista de cima, mostra 2 quadrados. Vista de frente, mostra 3 quadrados empilhados numa coluna e 1 ao lado. Qual é o menor número de cubos dessa construção?",
          4,
          "Uma coluna de 3 cubos e um cubo ao lado: 4 cubos, e de cima aparecem só 2 quadrados.",
          {
            misreads: [
              {
                value: 6,
                feedback:
                  "6 seria duas colunas de 3; a vista de frente mostra só 1 cubo na segunda coluna.",
              },
            ],
          },
        ),
        c(
          "vista",
          "Um dado está sobre a mesa com o 1 virado para cima. Sabendo que as faces opostas somam 7, qual número está virado para a mesa?",
          "6",
          ["1", "5"],
          "1 + 6 = 7: a face de baixo é o 6.",
          {
            feedback: ["O 1 está em cima; a face de baixo é a oposta.", "5 é oposta ao 2."],
          },
        ),
        c(
          "vista",
          "Uma seta desenhada numa folha aponta para a direita. Se virarmos a folha de cabeça para baixo (meia volta), a seta aponta para:",
          "A esquerda",
          ["A direita", "Cima"],
          "Meia volta inverte a direção da seta.",
          {
            feedback: ["Virar a folha muda a direção.", "Para cima seria um quarto de volta."],
          },
        ),
        n(
          "vista",
          "Um cubo grande é feito de 8 cubinhos, 2 em cada direção. Quantos cubinhos aparecem quando se olha o cubo grande de cima?",
          4,
          "De cima aparece a camada de cima: 2 × 2 = 4 cubinhos.",
          { misreads: [{ value: 8, feedback: "A camada de baixo fica escondida sob a de cima." }] },
        ),
      ],
    },
    {
      title: "Mapas e instruções",
      objective: "Ler um mapa simples, seguir e criar instruções para chegar a um lugar.",
      introduction:
        "Um mapa é a cena vista de cima. Para dar um caminho, dizemos quantos quarteirões andar e para que lado virar. Quem segue as instruções precisa saber para onde está olhando.",
      estimatedMinutes: 18,
      specs: [
        c(
          "mapa",
          "Num bairro de ruas retas, a escola fica 2 quarteirões ao norte e 3 a leste da casa de Iris. Se ela anda primeiro os 3 quarteirões a leste, para onde deve virar depois?",
          "Para a esquerda, que é o norte para quem olha o leste",
          ["Para a direita", "Voltar"],
          "Olhando para o leste, o norte fica à esquerda.",
          {
            feedback: [
              "À direita de quem olha o leste está o sul.",
              "Voltar levaria de novo para casa.",
            ],
          },
        ),
        n(
          "mapa",
          "Da casa de Iris até a escola são 2 quarteirões ao norte e 3 a leste. Quantos quarteirões ela anda no mínimo, sem atalhos, seguindo as ruas?",
          5,
          "2 + 3 = 5 quarteirões, em qualquer ordem.",
          {
            misreads: [
              {
                value: 6,
                feedback: "6 seria multiplicar; ela soma os quarteirões de cada direção.",
              },
            ],
          },
        ),
        c(
          "mapa",
          "Num mapa, o parque está ao norte da praça e a padaria ao sul da praça. Quem sai do parque e vai até a padaria passa:",
          "Pela praça, andando para o sul",
          ["Pela praça, andando para o norte", "Sem passar pela praça"],
          "Parque ao norte, praça no meio, padaria ao sul.",
          {
            feedback: ["Norte seria o sentido contrário.", "A praça fica exatamente no caminho."],
          },
        ),
        n(
          "mapa",
          "Instruções: ande 4 quarteirões ao norte, 2 a leste, 1 ao sul e 2 a oeste. Ao final, quantos quarteirões ao norte do início você está?",
          3,
          "4 ao norte e 1 ao sul deixam 3 ao norte; os 2 a leste e 2 a oeste se cancelam.",
          {
            misreads: [
              {
                value: 9,
                feedback: "9 é o total andado; a pergunta é a posição final em relação ao início.",
              },
            ],
          },
        ),
        c(
          "mapa",
          "Um tesouro fica 3 passos ao sul de uma árvore. Um menino está 3 passos ao norte da árvore. Quantos passos ele anda até o tesouro, em linha reta?",
          "6 passos para o sul",
          ["3 passos para o sul", "6 passos para o norte"],
          "3 passos até a árvore e mais 3 até o tesouro: 6 para o sul.",
          {
            feedback: ["3 passos só chegam à árvore.", "O tesouro está ao sul, não ao norte."],
          },
        ),
        c(
          "mapa",
          "Rui dá estas instruções: 'saia da porta, vire à direita e ande até a segunda rua'. Se a pessoa estiver de costas para a casa, vira para o lado errado. O que falta nas instruções?",
          "Dizer para onde a pessoa deve estar olhando ao começar",
          ["Dizer o nome da casa", "Nada; a instrução está completa"],
          "Esquerda e direita dependem de para onde se olha.",
          {
            feedback: [
              "O nome não muda o lado para o qual se vira.",
              "Sem a direção inicial, 'direita' pode ser qualquer lado.",
            ],
          },
        ),
        n(
          "mapa",
          "Num mapa quadriculado, cada quadrado representa 100 metros. A biblioteca está a 4 quadrados da escola, em linha reta pelas ruas. Quantos metros são?",
          400,
          "4 × 100 = 400 metros.",
          { misreads: [{ value: 4, feedback: "4 são quadrados; cada quadrado vale 100 metros." }] },
        ),
        c(
          "mapa",
          "Duas pessoas descrevem o mesmo caminho: uma diz 'vire à esquerda na padaria' e a outra 'vire para o norte na padaria'. Qual instrução funciona para qualquer pessoa, venha de onde vier?",
          "A que usa o norte, porque não depende de para onde a pessoa está olhando",
          ["A que usa esquerda, porque é mais fácil", "As duas funcionam igual sempre"],
          "Os pontos cardeais não mudam com a direção de quem anda.",
          {
            feedback: [
              "Esquerda muda de lado conforme a direção de quem chega.",
              "A da esquerda só funciona para quem chega pelo mesmo lado.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Coloque em ordem os passos para explicar a alguém como chegar a um lugar.",
    labels: [
      "Dizer onde a pessoa começa e para onde está olhando",
      "Dizer quanto andar no primeiro trecho",
      "Dizer para que lado virar em cada esquina e quanto andar depois",
      "Dizer como reconhecer que chegou",
    ],
    explanation:
      "Sem o começo e a direção inicial, as viradas ficam sem sentido; a chegada fecha a instrução.",
  },
  justification: {
    prompts: [
      "Explique por que a mão direita de quem está de frente para você fica do seu lado esquerdo.",
      "Um robô anda 2 para cima, 3 para a direita e 2 para baixo. Explique onde ele termina em relação ao começo.",
      "Explique por que 'vire à direita' pode dar errado e 'vire para o norte' não.",
    ],
    samples: [
      "Quando eu fico de frente para alguém, é como se a pessoa estivesse virada ao contrário de mim. O lado direito dela aponta para o meu lado esquerdo, como num espelho. Se ficássemos lado a lado, olhando para o mesmo lugar, as direitas coincidiriam.",
      "Os 2 para cima e os 2 para baixo se desfazem: ele sobe e depois desce a mesma quantidade. Sobram só os 3 para a direita. Então ele termina 3 casas à direita do começo, na mesma linha.",
      "Direita depende de para onde a pessoa está olhando. Quem chega pela outra rua vira para o lado contrário. O norte é sempre o mesmo lugar, não importa de onde a pessoa vem, então a instrução com norte funciona para todo mundo.",
    ],
    focus: "a posição de quem olha",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const direita = 2 + (seed % 5);
      const cima = 1 + (seed % 4);
      const colunas = "ABCDEFGH";
      const colunaInicial = 0;
      const linhaInicial = 1 + (seed % 3);
      const destino = `${colunas[colunaInicial + direita]}${linhaInicial + cima}`;
      const erroLinha = `${colunas[colunaInicial + direita]}${linhaInicial + cima + 1}`;
      const erroColuna = `${colunas[colunaInicial + direita - 1]}${linhaInicial + cima}`;
      return c(
        "destino-na-malha",
        `Um robô está na casa ${colunas[colunaInicial]}${linhaInicial} de uma malha com colunas de A a H e linhas de 1 a 8, de baixo para cima. Ele anda ${direita} casas para a direita e ${cima} para cima. Em que casa ele para?`,
        destino,
        [erroLinha, erroColuna],
        `${direita} colunas depois de ${colunas[colunaInicial]} é ${colunas[colunaInicial + direita]}; ${linhaInicial} + ${cima} = ${linhaInicial + cima}.`,
        {
          feedback: ["Subiu uma linha a mais.", "Contou uma coluna a menos para a direita."],
        },
      );
    }
    if (variant === 1) {
      const direcoes = ["norte", "leste", "sul", "oeste"];
      const quartos = [2, 3, 5, 6, 7][seed % 5] ?? 2;
      const final = quartos % 4;
      const contrario = (4 - final) % 4;
      // Meia volta chega ao mesmo lugar pelos dois lados; as erradas são então os dois lados.
      const erradas = final === 2 ? [1, 3] : [contrario, 2];
      return c(
        "giro-e-direcao",
        `Uma menina olha para o norte e gira ${quartos} quartos de volta para a direita, um depois do outro. Para onde ela olha no final?`,
        direcoes[final] ?? "norte",
        [direcoes[erradas[0] ?? 0] ?? "sul", direcoes[erradas[1] ?? 0] ?? "leste"],
        quartos < 4
          ? `${quartos} quartos de volta para a direita, a partir do norte: ${quartos === 2 ? "meia volta" : "três quartos de volta"}, chega-se ao ${direcoes[final]}.`
          : `Cada 4 quartos de volta é uma volta inteira. ${quartos} quartos deixam ${final} quarto${final > 1 ? "s" : ""} além da volta completa: do norte, girando para a direita, chega-se ao ${direcoes[final]}.`,
        {
          feedback: [
            "Girou para o lado errado ou errou a quantidade de quartos.",
            "Confira quantos quartos de volta sobram depois de tirar as voltas inteiras.",
          ],
        },
      );
    }
    const norte = 2 + (seed % 5);
    const leste = 1 + (seed % 4);
    const sul = 1 + (seed % Math.min(norte - 1, 3));
    const restante = norte - sul;
    return c(
      "posicao-final-no-mapa",
      `Instruções: ande ${norte} quarteirões ao norte, ${leste} a leste, ${sul} ao sul e ${leste} a oeste. Ao final, onde você está em relação ao início?`,
      `${restante} quarteir${restante === 1 ? "ão" : "ões"} ao norte`,
      [
        `${norte + sul} quarteirões ao norte`,
        `${restante} quarteir${restante === 1 ? "ão" : "ões"} ao norte e ${leste} a leste`,
      ],
      `${norte} ao norte e ${sul} ao sul deixam ${restante} ao norte; ${leste} a leste e ${leste} a oeste se cancelam.`,
      {
        feedback: [
          "Somou o sul ao norte; andar ao sul desfaz parte do norte.",
          "Os quarteirões a leste e a oeste são iguais e se cancelam.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "orientacao-espacial",
    title: "O mapa do meu caminho",
    prompt:
      "Desenhe um mapa simples de um caminho que você faz sempre (da porta até a escola, até a padaria ou até o quarto de alguém). Escreva as instruções para outra pessoa e teste se ela chega.",
    lab: "grid",
    steps: [
      "Desenhe o mapa visto de cima, com os lugares importantes.",
      "Escreva as instruções com direção inicial, quantidades e viradas.",
      "Peça a alguém para seguir as instruções e anote o que precisou mudar.",
    ],
    rubric: [
      "Mapa visto de cima com os lugares principais (0–2)",
      "Instruções com direção inicial, quantidades e viradas (0–3)",
      "Teste com outra pessoa e ajustes registrados (0–2)",
      "Explicação do que confundiu e por quê (0–1)",
    ],
  },
  homeSupport: [
    "No caminho de casa, peçam para a criança dizer para que lado vão virar antes de cada esquina e conferir depois.",
    "Brinquem de 'robô': um dá instruções de passos e giros, o outro executa; depois troquem os papéis.",
  ],
};
