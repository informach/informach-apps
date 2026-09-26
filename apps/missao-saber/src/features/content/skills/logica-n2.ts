import { c, n, type SkillPack } from "../skill-factory";

/**
 * Lógica para o 9º ano: verdade e mentira, tabelas de possibilidades,
 * negação de afirmações com "todo" e "algum", dedução em cadeia e
 * interpretação de procedimentos. Trilha Canguru C.
 */
export const logicaN2: SkillPack = {
  id: "logica-n2",
  name: "Lógica e dedução",
  domain: "canguru",
  lab: null,
  missions: [
    {
      title: "Verdade, mentira e contradição",
      objective: "Testar hipóteses em frases de verdade e mentira até sobrar uma consistente.",
      introduction:
        "Quando alguém pode mentir, suponha uma hipótese e siga as consequências: se aparecer uma contradição, a hipótese cai. A resposta é a hipótese que sobrevive.",
      specs: [
        c(
          "verdade-e-mentira",
          "Em uma ilha, cavaleiros sempre falam a verdade e escudeiros sempre mentem. Alguém diz: 'Eu sou escudeiro'. O que podemos concluir?",
          "Ninguém da ilha pode dizer isso: um cavaleiro mentiria e um escudeiro diria a verdade",
          ["Ele é escudeiro", "Ele é cavaleiro"],
          "Se fosse cavaleiro, a frase seria falsa; se fosse escudeiro, seria verdadeira. As duas hipóteses caem.",
          {
            feedback: [
              "Um escudeiro que diz 'sou escudeiro' estaria falando a verdade, o que ele nunca faz.",
              "Um cavaleiro que diz 'sou escudeiro' estaria mentindo, o que ele nunca faz.",
            ],
          },
        ),
        c(
          "verdade-e-mentira",
          "Ana diz: 'Bia mente'. Bia diz: 'Ana e eu dizemos a verdade'. Quem diz a verdade?",
          "Só Ana",
          ["Só Bia", "As duas"],
          "Se Bia dissesse a verdade, Ana também diria, mas Ana afirma que Bia mente: contradição. Então Bia mente e Ana acerta.",
          {
            feedback: [
              "Se só Bia dissesse a verdade, a frase dela exigiria que Ana também dissesse.",
              "Se as duas dissessem a verdade, a frase de Ana seria falsa.",
            ],
          },
        ),
        c(
          "verdade-e-mentira",
          "Três caixas têm etiquetas: A: 'o prêmio está aqui'; B: 'o prêmio não está aqui'; C: 'o prêmio não está em A'. Exatamente uma etiqueta é verdadeira. Onde está o prêmio?",
          "Em B",
          ["Em A", "Em C"],
          "Prêmio em B: A falsa, B falsa, C verdadeira: uma só. Em A: A e B verdadeiras. Em C: B e C verdadeiras.",
          {
            feedback: [
              "Com o prêmio em A, as etiquetas A e B seriam verdadeiras.",
              "Com o prêmio em C, as etiquetas B e C seriam verdadeiras.",
            ],
          },
        ),
        n(
          "verdade-e-mentira",
          "Cinco pessoas estão em fila e cada uma, exceto a última, diz: 'a pessoa atrás de mim mente'. A primeira diz a verdade. Quantas das cinco pessoas mentem?",
          2,
          "A 1ª diz a verdade, então a 2ª mente; a frase da 2ª é falsa, então a 3ª diz a verdade; logo a 4ª mente e a 5ª diz a verdade. Mentem a 2ª e a 4ª.",
          {
            misreads: [
              {
                value: 3,
                feedback: "A 4ª mente, então a frase dela é falsa e a 5ª diz a verdade.",
              },
            ],
          },
        ),
        c(
          "verdade-e-mentira",
          "Um detetive tem três suspeitos e sabe que exatamente um deles mente. Léo diz: 'Foi Max'. Max diz: 'Não fui eu'. Nina diz: 'Foi Léo'. Quem é o culpado?",
          "Léo",
          ["Max", "Nina"],
          "Léo e Max se contradizem, então o único mentiroso está entre eles e Nina fala a verdade: o culpado é Léo. Confere: Léo mente, Max e Nina falam a verdade.",
          {
            feedback: [
              "Se fosse Max, Max e Nina estariam mentindo: dois mentirosos.",
              "Se fosse Nina, Léo e Nina estariam mentindo: dois mentirosos.",
            ],
          },
        ),
        c(
          "negacao",
          "A negação de 'todos os alunos entregaram o trabalho' é:",
          "Pelo menos um aluno não entregou o trabalho",
          ["Nenhum aluno entregou o trabalho", "Todos os alunos não entregaram o trabalho"],
          "Para 'todos' ser falso, basta um caso contrário.",
          {
            feedback: [
              "'Nenhum' é mais forte que a negação; basta um que não entregou.",
              "Essa frase diz o mesmo que 'nenhum entregou'.",
            ],
          },
        ),
        c(
          "negacao",
          "A negação de 'algum número da lista é par' é:",
          "Todos os números da lista são ímpares",
          ["Algum número da lista é ímpar", "Nenhum número da lista é ímpar"],
          "Negar 'existe um par' é dizer que nenhum é par, ou seja, todos são ímpares.",
          {
            feedback: [
              "As duas frases podem ser verdadeiras ao mesmo tempo.",
              "'Nenhum é ímpar' significa 'todos são pares', o oposto do pedido.",
            ],
          },
        ),
        c(
          "negacao",
          "Se a frase 'se chove, então a rua molha' é verdadeira, o que podemos garantir?",
          "Se a rua está seca, então não choveu",
          ["Se a rua está molhada, então choveu", "Se não chove, então a rua fica seca"],
          "A contrapositiva 'rua seca, logo não choveu' é equivalente à frase original.",
          {
            feedback: [
              "A rua pode molhar por outro motivo, como um caminhão-pipa.",
              "Sem chuva a rua ainda pode molhar; a frase não fala do caso sem chuva.",
            ],
          },
        ),
      ],
    },
    {
      title: "Tabelas de possibilidades",
      objective: "Organizar pistas em uma tabela e eliminar até restar uma configuração.",
      introduction:
        "Quando há várias pessoas e várias características, uma tabela com X e V evita esquecer pistas. Cada pista elimina casas; a última casa livre de cada linha é a resposta.",
      specs: [
        c(
          "tabela-logica",
          "Três amigos, Caio, Duda e Eli, têm um cachorro, um gato e um peixe, um animal cada. Caio não tem o gato, Duda tem o peixe. Quem tem o gato?",
          "Eli",
          ["Caio", "Duda"],
          "Duda tem o peixe; Caio não tem o gato, então tem o cachorro; sobra o gato para Eli.",
          {
            feedback: ["A pista diz que Caio não tem o gato.", "Duda tem o peixe."],
          },
        ),
        c(
          "tabela-logica",
          "Quatro cartas têm uma letra de um lado e um número do outro. Sobre a mesa, elas mostram A, 7, B e 4. A regra é: 'se uma carta tem vogal de um lado, tem número par do outro'. Quais cartas precisam ser viradas para testar a regra?",
          "A e 7",
          ["A e 4", "A, 4 e 7"],
          "A pode quebrar a regra se tiver ímpar atrás; 7 pode quebrar se tiver vogal atrás. O 4 e o B não quebram a regra de jeito nenhum.",
          {
            feedback: [
              "O 4 pode ter consoante atrás sem violar a regra, que só fala de vogais.",
              "O 4 não precisa ser virado.",
            ],
          },
        ),
        c(
          "tabela-logica",
          "Em uma corrida, Ana chegou antes de Bia, Bia não foi a última, e Caio chegou depois de Dani. Se são quatro corredores, quem chegou por último?",
          "Caio",
          ["Bia", "Dani"],
          "Bia não é a última e Ana está antes dela; Caio está depois de Dani. Só Caio pode ser o último.",
          {
            feedback: [
              "A pista diz que Bia não foi a última.",
              "Dani chegou antes de Caio, então não é a última.",
            ],
          },
        ),
        n(
          "tabela-logica",
          "Em uma estante, quatro livros de cores diferentes estão lado a lado. O azul está entre o verde e o amarelo; o vermelho está na ponta direita; o verde não está ao lado do vermelho. Em que posição, contando da esquerda, está o verde?",
          1,
          "Vermelho na 4ª; o verde não pode ser o 3º (ao lado do vermelho); o azul está entre verde e amarelo, então a ordem é verde, azul, amarelo, vermelho: verde na 1ª.",
          {
            misreads: [
              { value: 3, feedback: "Na 3ª posição o verde ficaria ao lado do vermelho." },
            ],
          },
        ),
        c(
          "tabela-logica",
          "Três moedas parecem iguais, mas uma é mais leve. Com uma balança de dois pratos, o menor número de pesagens para achá-la com certeza é:",
          1,
          [2, 3],
          "Pese duas moedas: se equilibrar, a leve é a terceira; se não, é a que subiu.",
          {
            feedback: [
              "Uma pesagem bem escolhida já resolve os três casos.",
              "Três pesagens seriam desnecessárias.",
            ],
          },
        ),
        c(
          "tabela-logica",
          "Com 9 moedas iguais e uma delas mais leve, quantas pesagens em balança de pratos bastam para achá-la com certeza?",
          2,
          [3, 4],
          "Divida em três grupos de 3: uma pesagem indica o grupo da leve; dentro dele, outra pesagem indica a moeda.",
          {
            feedback: [
              "Cada pesagem separa em três casos; duas pesagens cobrem 9 possibilidades.",
              "Quatro pesagens são mais que o necessário.",
            ],
          },
        ),
        c(
          "tabela-logica",
          "Cinco pessoas sentam em uma mesa redonda. Ana está imediatamente à esquerda de Bia e imediatamente à direita de Caio. Quem está imediatamente à direita de Ana?",
          "Bia",
          ["Caio", "Não dá para saber"],
          "'Ana à esquerda de Bia' significa que Bia está à direita de Ana; 'à direita de Caio' põe Caio à esquerda de Ana.",
          {
            feedback: [
              "Caio está à esquerda de Ana.",
              "As duas pistas determinam os vizinhos de Ana.",
            ],
          },
        ),
        n(
          "tabela-logica",
          "Em um torneio de 4 jogadores, cada um jogou contra os outros uma vez, sem empates. Ana venceu 3 partidas e Bia venceu 2. Quantas partidas Caio e Dani venceram juntos?",
          1,
          "São 6 partidas; 3 + 2 = 5 vitórias já contadas; sobra 1 para Caio e Dani juntos.",
          { misreads: [{ value: 2, feedback: "O total de vitórias é 6, uma por partida." }] },
        ),
      ],
    },
    {
      title: "Dedução em cadeia",
      objective: "Encadear implicações e usar o que é impossível para achar o que é certo.",
      introduction:
        "Uma pista leva a outra. Escreva o que cada afirmação obriga, ligue as consequências e observe quando duas conclusões não podem valer juntas.",
      specs: [
        c(
          "encadear-implicacoes",
          "Se todo triângulo equilátero é isósceles e todo isósceles tem dois ângulos iguais, então:",
          "Todo triângulo equilátero tem dois ângulos iguais",
          [
            "Todo triângulo isósceles é equilátero",
            "Todo triângulo com dois ângulos iguais é equilátero",
          ],
          "Encadeando: equilátero implica isósceles, que implica dois ângulos iguais.",
          {
            feedback: [
              "A implicação não vale ao contrário: há isósceles que não são equiláteros.",
              "Dois ângulos iguais só garantem isósceles.",
            ],
          },
        ),
        c(
          "encadear-implicacoes",
          "Sabe-se que: se Pedro estuda, passa; Pedro não passou. Então:",
          "Pedro não estudou",
          ["Pedro estudou, mas a prova era difícil", "Não dá para concluir nada"],
          "Se tivesse estudado, teria passado; como não passou, não estudou.",
          {
            feedback: [
              "A frase garante que estudar leva a passar; não passar exclui ter estudado.",
              "A contrapositiva permite concluir.",
            ],
          },
        ),
        n(
          "encadear-implicacoes",
          "Em uma gaveta há meias pretas e brancas misturadas, 10 de cada cor. No escuro, quantas meias, no mínimo, é preciso pegar para garantir um par da mesma cor?",
          3,
          "Duas meias podem ser de cores diferentes; a terceira repete alguma cor.",
          {
            misreads: [
              { value: 11, feedback: "11 garantiria uma meia de cada cor, não um par igual." },
            ],
          },
        ),
        c(
          "encadear-implicacoes",
          "Todos os alunos de uma turma que jogam xadrez também jogam damas. João joga damas. Podemos concluir que:",
          "Nada sobre João jogar xadrez",
          ["João joga xadrez", "João não joga xadrez"],
          "A regra só diz que xadrez implica damas; damas não implica xadrez.",
          {
            feedback: [
              "Jogar damas é consequência, não causa, de jogar xadrez.",
              "Nada impede João de jogar os dois.",
            ],
          },
        ),
        n(
          "encadear-implicacoes",
          "Em um grupo, quem gosta de rock gosta de música ao vivo, e quem gosta de música ao vivo vai a shows. 12 pessoas gostam de rock e 20 vão a shows. Quantas pessoas, no mínimo, gostam de música ao vivo?",
          12,
          "Todas que gostam de rock gostam de música ao vivo, então são pelo menos 12; podem ser mais, até 20.",
          { misreads: [{ value: 20, feedback: "20 é o máximo possível, não o mínimo." }] },
        ),
        c(
          "encadear-implicacoes",
          "Se a afirmação 'todo múltiplo de 4 é par' é verdadeira, qual das frases também é verdadeira?",
          "Se um número é ímpar, então não é múltiplo de 4",
          ["Se um número é par, então é múltiplo de 4", "Todo número par é múltiplo de 4"],
          "É a contrapositiva: não par implica não múltiplo de 4.",
          {
            feedback: ["6 é par e não é múltiplo de 4.", "Mesma frase, mesma falha: 6."],
          },
        ),
        n(
          "encadear-implicacoes",
          "Cinco amigos têm idades diferentes, entre 10 e 14 anos. Bia é mais velha que Caio e mais nova que Ana. Dani é a mais nova. Se Eli tem 12 anos, quantos anos tem Bia?",
          13,
          "Dani tem 10. Ana > Bia > Caio, com Eli em 12; as idades 11, 13 e 14 vão para Caio, Bia e Ana nessa ordem: Bia tem 13.",
          {
            misreads: [
              { value: 12, feedback: "12 é a idade de Eli; as idades são todas diferentes." },
            ],
          },
        ),
        c(
          "encadear-implicacoes",
          "Uma afirmação verdadeira sobre inteiros é 'se n é múltiplo de 6, então n é múltiplo de 3'. Um contraexemplo para a afirmação inversa 'se n é múltiplo de 3, então n é múltiplo de 6' é:",
          9,
          [12, 5],
          "9 é múltiplo de 3 e não é múltiplo de 6.",
          {
            feedback: [
              "12 é múltiplo de 3 e de 6, então não contradiz a inversa.",
              "5 não é múltiplo de 3; um contraexemplo precisa satisfazer a hipótese.",
            ],
          },
        ),
      ],
    },
    {
      title: "Interpretar procedimentos",
      objective: "Seguir e prever regras, sequências de instruções e máquinas de números.",
      introduction:
        "Um procedimento é uma lista de passos. Execute-o em um caso pequeno, registre cada estado e procure o que se repete; depois generalize.",
      specs: [
        n(
          "maquina-de-numeros",
          "Uma máquina dobra o número que entra e depois subtrai 3. Se sai 21, que número entrou?",
          12,
          "Desfazendo ao contrário: 21 + 3 = 24; 24 ÷ 2 = 12.",
          {
            misreads: [
              {
                value: 9,
                feedback:
                  "Subtraiu 3 em vez de somar: desfazer 'subtrair 3' é somar 3, e (21 + 3) ÷ 2 = 12.",
              },
            ],
          },
        ),
        c(
          "maquina-de-numeros",
          "A regra é: se o número é par, divida por 2; se é ímpar, multiplique por 3 e some 1. Partindo de 6, depois de 4 passos chegamos a:",
          16,
          [5, 8],
          "6 é par: 3; 3 é ímpar: 10; 10 é par: 5; 5 é ímpar: 16.",
          {
            feedback: [
              "5 é o resultado depois de 3 passos.",
              "8 é o resultado depois de 5 passos (16 ÷ 2), não de 4.",
            ],
          },
        ),
        n(
          "maquina-de-numeros",
          "Comece com 1. A cada passo, multiplique por 2 e some 1. Qual é o número depois de 5 passos?",
          63,
          "1 → 3 → 7 → 15 → 31 → 63.",
          { misreads: [{ value: 31, feedback: "31 é o resultado depois de 4 passos." }] },
        ),
        c(
          "maquina-de-numeros",
          "Um procedimento diz: 'escreva o número; some seus algarismos; repita até sobrar um algarismo'. Começando em 9.876, o resultado final é:",
          3,
          [30, 12],
          "9 + 8 + 7 + 6 = 30; 3 + 0 = 3.",
          {
            feedback: [
              "30 tem dois algarismos; o procedimento continua.",
              "12 não aparece nesse caminho.",
            ],
          },
        ),
        n(
          "maquina-de-numeros",
          "Uma sequência começa com 5 e cada termo é o anterior menos 4. Qual é o primeiro termo negativo?",
          -3,
          "5, 1, −3: o terceiro termo é o primeiro negativo.",
          { misreads: [{ value: -4, feedback: "−4 não aparece: 1 − 4 = −3." }] },
        ),
        c(
          "maquina-de-numeros",
          "Um robô repete: 'ande 3 passos, vire à direita'. Depois de quantas repetições ele volta ao ponto de partida pela primeira vez?",
          4,
          [3, 6],
          "Quatro viradas à direita completam uma volta; o caminho é um quadrado de lado 3.",
          {
            feedback: [
              "Com 3 repetições ele ainda está em um vértice do quadrado.",
              "Com 4 já fechou o quadrado.",
            ],
          },
        ),
        n(
          "maquina-de-numeros",
          "A regra 'troque o número pela soma do dobro dele com 1' é aplicada três vezes a um número x, e o resultado é 39. Qual é x?",
          4,
          "Desfazendo três vezes: (39 − 1) ÷ 2 = 19; (19 − 1) ÷ 2 = 9; (9 − 1) ÷ 2 = 4.",
          { misreads: [{ value: 19, feedback: "19 é o valor depois de desfazer só um passo." }] },
        ),
        c(
          "maquina-de-numeros",
          "Um relógio quebrado adianta 2 minutos a cada hora. Acertado ao meio-dia, que horas ele marca quando o correto são 18 h?",
          "18 h 12 min",
          ["18 h 02 min", "17 h 48 min"],
          "Em 6 horas adianta 6 × 2 = 12 minutos.",
          {
            feedback: [
              "2 minutos é o adiantamento de uma hora só.",
              "Um relógio adiantado marca mais, não menos.",
            ],
          },
        ),
      ],
    },
    {
      title: "Lógica para argumentar",
      objective: "Construir e avaliar argumentos com afirmações quantificadas e contraexemplos.",
      introduction:
        "Para provar que 'todo' é verdadeiro é preciso um argumento geral; para provar que é falso basta um contraexemplo. Não confunda 'não vale sempre' com 'nunca vale'.",
      estimatedMinutes: 18,
      specs: [
        c(
          "contraexemplo",
          "Qual valor mostra que a afirmação 'todo número primo é ímpar' é falsa?",
          2,
          [9, 1],
          "2 é primo e é par.",
          {
            feedback: ["9 não é primo, então não testa a afirmação.", "1 não é primo."],
          },
        ),
        c(
          "contraexemplo",
          "Para mostrar que 'se um quadrilátero tem os quatro lados iguais, então é um quadrado' é falsa, basta apresentar:",
          "Um losango com ângulos de 60° e 120°",
          ["Um retângulo que não é quadrado", "Um quadrado de lado 5"],
          "O losango tem lados iguais e não é quadrado: satisfaz a hipótese e falha na conclusão.",
          {
            feedback: [
              "O retângulo não tem os quatro lados iguais; não satisfaz a hipótese.",
              "O quadrado confirma a afirmação, não a refuta.",
            ],
          },
        ),
        c(
          "quantificadores",
          "Em uma turma, 'nenhum aluno tirou nota abaixo de 6'. Isso é o mesmo que:",
          "Todos os alunos tiraram nota maior ou igual a 6",
          ["Algum aluno tirou nota 6", "Todos os alunos tiraram nota acima de 6"],
          "'Nenhum abaixo de 6' equivale a 'todos com pelo menos 6'.",
          {
            feedback: [
              "Ninguém precisa ter tirado exatamente 6.",
              "'Acima de 6' exclui o próprio 6, que a frase original permite.",
            ],
          },
        ),
        n(
          "contraexemplo",
          "Um estudante afirma que n² + n + 41 é primo para todo inteiro positivo n. Qual é o menor valor de n que mostra que ele está errado?",
          40,
          "Para n = 40: 40² + 40 + 41 = 1.681 = 41²; para n de 1 a 39 o valor é primo.",
          {
            misreads: [
              { value: 41, feedback: "41 também dá composto (41 × 43), mas 40 falha antes." },
            ],
          },
        ),
        c(
          "quantificadores",
          "A frase 'existe um número que é maior que todos os outros' é:",
          "Falsa, porque para qualquer número existe um maior",
          ["Verdadeira, e esse número é infinito", "Verdadeira para os números de 1 a 100"],
          "Dado qualquer número, ele mais 1 é maior; não há maior de todos.",
          {
            feedback: [
              "Infinito não é um número da lista.",
              "A frase fala de todos os números, não de uma lista limitada.",
            ],
          },
        ),
        c(
          "encadear-implicacoes",
          "Dizem que 'todo número divisível por 9 é divisível por 3'. Qual afirmação NÃO decorre dela?",
          "Todo número divisível por 3 é divisível por 9",
          [
            "Nenhum número que não é divisível por 3 é divisível por 9",
            "Se 27 é divisível por 9, então é divisível por 3",
          ],
          "A inversa não decorre: 6 é divisível por 3 e não por 9.",
          {
            feedback: [
              "Essa é a contrapositiva, que decorre da afirmação.",
              "Esse é um caso particular da afirmação.",
            ],
          },
        ),
        n(
          "contraexemplo",
          "Alguém afirma que a soma de dois números primos é sempre par. Qual é o menor primo que serve como uma das parcelas de um contraexemplo?",
          2,
          "2 + 3 = 5 é ímpar; o 2 é o único primo par, e todo contraexemplo usa o 2.",
          {
            misreads: [
              {
                value: 3,
                feedback: "3 + qualquer primo ímpar dá par; o contraexemplo precisa do 2.",
              },
            ],
          },
        ),
        c(
          "quantificadores",
          "'Todo retângulo é um paralelogramo' e 'alguns paralelogramos não são retângulos'. Juntas, essas frases dizem que:",
          "Os retângulos são uma parte dos paralelogramos, mas não todos",
          ["Retângulos e paralelogramos são a mesma coisa", "Nenhum paralelogramo é retângulo"],
          "A primeira frase inclui os retângulos nos paralelogramos; a segunda mostra que a inclusão não é total.",
          {
            feedback: [
              "A segunda frase impede a igualdade.",
              "A primeira frase garante que retângulos são paralelogramos.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize um método para resolver um problema de verdade e mentira.",
    labels: [
      "Listar quem fala e o que cada um afirma",
      "Supor uma hipótese sobre quem diz a verdade",
      "Seguir as consequências da hipótese em cada frase",
      "Descartar a hipótese que gera contradição e conferir a que sobra",
    ],
    explanation:
      "Anotamos as falas, testamos uma hipótese, seguimos as consequências e ficamos com a única hipótese sem contradição.",
  },
  justification: {
    prompts: [
      "Explique por que um único contraexemplo derruba uma afirmação com 'todo', mas um único exemplo não prova essa afirmação.",
      "Um colega conclui que 'se está molhado, então choveu' a partir de 'se chove, então molha'. Explique o erro com um exemplo do dia a dia.",
      "Mostre como resolver 'Ana diz que Bia mente; Bia diz que Caio mente; Caio diz que Ana e Bia mentem' testando hipóteses.",
    ],
    samples: [
      "'Todo' promete algo para todos os casos; um caso que falha já quebra a promessa. Já um exemplo que funciona não garante os demais: 'todo número ímpar é primo' tem o exemplo 3, mas o 9 mostra que a afirmação é falsa. Para provar 'todo' é preciso um argumento que valha para qualquer caso.",
      "A frase original só diz que a chuva molha; não diz que só a chuva molha. Uma calçada lavada com mangueira fica molhada sem chuva. O que se pode concluir é a contrapositiva: se não está molhado, então não choveu.",
      "Suponha que Ana diz a verdade: então Bia mente, logo Caio diz a verdade; mas Caio diz que Ana mente, contradição. Então Ana mente, ou seja, Bia diz a verdade; logo Caio mente, e de fato sua frase 'Ana e Bia mentem' é falsa porque Bia não mente. Resposta: só Bia diz a verdade.",
    ],
    focus: "a distinção entre uma implicação e a sua inversa",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const dobro = 2 + (seed % 2);
      const soma = 1 + (seed % 7);
      const entrada = 3 + (seed % 11);
      const saida = dobro * entrada + soma;
      return c(
        "desfazer-a-maquina",
        `Uma máquina multiplica o número que entra por ${dobro} e depois soma ${soma}. Se o número que saiu foi ${saida}, qual foi o número que entrou?`,
        entrada,
        [entrada + 1, entrada + 2],
        `Desfazendo ao contrário: ${saida} − ${soma} = ${saida - soma}; ${saida - soma} ÷ ${dobro} = ${entrada}.`,
        {
          feedback: [
            `Confira: ${dobro} × ${entrada + 1} + ${soma} = ${dobro * (entrada + 1) + soma}, e não ${saida}.`,
            `Confira: ${dobro} × ${entrada + 2} + ${soma} = ${dobro * (entrada + 2) + soma}, e não ${saida}.`,
          ],
        },
      );
    }
    if (variant === 1) {
      const pretas = 4 + (seed % 9);
      const brancas = 3 + (seed % 7);
      const cores = 2 + (seed % 2);
      const total = cores === 2 ? pretas + brancas : pretas + brancas + 5;
      return c(
        "garantir-um-par",
        `Uma gaveta tem meias de ${cores} cores, todas misturadas, ${total} meias no total. No escuro, quantas meias é preciso pegar, no mínimo, para garantir duas da mesma cor?`,
        cores + 1,
        [cores, total],
        `Com ${cores} meias todas podem ser de cores diferentes; a ${cores + 1}ª meia repete alguma cor.`,
        {
          feedback: [
            "Com esse número as meias ainda podem ser todas de cores diferentes.",
            "Não é preciso pegar todas: o pior caso é uma meia de cada cor mais uma.",
          ],
        },
      );
    }
    const passos = 3 + (seed % 3);
    const inicio = 2 + (seed % 9);
    let valor = inicio;
    const sequencia = [inicio];
    for (let i = 0; i < passos; i++) {
      valor = valor * 2 - 1;
      sequencia.push(valor);
    }
    return c(
      "seguir-a-regra",
      `Uma sequência começa em ${inicio} e cada termo seguinte é o dobro do anterior menos 1. Qual é o termo obtido depois de ${passos} passos?`,
      valor,
      [sequencia[passos - 1] ?? inicio, valor + 1],
      `${sequencia.join(" → ")}.`,
      {
        feedback: [
          `Esse é o termo depois de ${passos - 1} passos; falta um.`,
          "Não confere: cada passo é dobrar e depois tirar 1.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "logica-n2",
    title: "O enigma que só tem uma saída",
    prompt:
      "Crie um enigma de verdade e mentira com três personagens em que exista exatamente uma solução, e prove que ela é única testando todas as hipóteses.",
    lab: null,
    steps: [
      "Escreva as três falas e registre a solução que você tem em mente.",
      "Liste todas as combinações de quem diz a verdade e quem mente e mostre qual delas sobrevive.",
      "Troque uma fala e mostre como o enigma passa a ter duas soluções ou nenhuma.",
    ],
    rubric: [
      "Enigma escrito com três falas e solução declarada (0–2)",
      "Todas as oito hipóteses testadas, com a única que sobrevive (0–3)",
      "Variação analisada mostrando como a unicidade se perde (0–2)",
      "Texto que outra pessoa consegue resolver sem ajuda (0–1)",
    ],
  },
  homeSupport: [
    "Em uma conversa, quando alguém disser 'sempre' ou 'nunca', perguntem juntos se existe um exemplo que contraria, e conversem sobre por que um exemplo basta.",
    "Brinquem de 'um mente, um fala a verdade': cada um faz uma afirmação sobre um objeto escondido e o outro deduz onde ele está antes de olhar.",
  ],
};
