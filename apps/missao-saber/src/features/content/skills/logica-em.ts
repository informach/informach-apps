import { c, n, type SkillPack } from "../skill-factory";

/**
 * Lógica no ensino médio: proposições e conectivos, tabelas-verdade,
 * quantificadores e negação, problemas de verdade e mentira, e deduções em
 * várias etapas. Trilha Canguru S.
 */
export const logicaEm: SkillPack = {
  id: "logica-em",
  name: "Lógica e dedução",
  domain: "canguru",
  lab: "groups",
  missions: [
    {
      title: "Conectivos e valores",
      objective: "Calcular o valor lógico de proposições compostas com e, ou, não e se-então.",
      introduction:
        "'A e B' só é verdadeira quando as duas são. 'A ou B' só é falsa quando as duas são falsas. 'Se A, então B' só é falsa quando A é verdadeira e B é falsa. 'Não A' troca o valor.",
      specs: [
        c(
          "conectivos",
          "Sabendo que A é verdadeira e B é falsa, a proposição 'A e B' é:",
          "Falsa",
          ["Verdadeira", "Depende do contexto"],
          "'E' exige as duas verdadeiras.",
          {
            feedback: [
              "Uma parte falsa já torna a conjunção falsa.",
              "O valor é determinado pelos valores de A e B.",
            ],
          },
        ),
        c(
          "conectivos",
          "Com A falsa e B falsa, 'se A, então B' é:",
          "Verdadeira",
          ["Falsa", "Indeterminada"],
          "A implicação só é falsa com hipótese verdadeira e conclusão falsa.",
          {
            feedback: [
              "Hipótese falsa torna a implicação verdadeira.",
              "A tabela-verdade define o valor em todos os casos.",
            ],
          },
        ),
        n(
          "conectivos",
          "Numa tabela-verdade com as proposições A, B e C, quantas linhas há?",
          8,
          "Cada proposição tem 2 valores: 2 × 2 × 2 = 8.",
          {
            misreads: [
              { value: 6, feedback: "6 soma 2 três vezes; as combinações se multiplicam." },
            ],
          },
        ),
        c(
          "conectivos",
          "A negação de 'A e B' é equivalente a:",
          "'Não A ou não B'",
          ["'Não A e não B'", "'A ou B'"],
          "Lei de De Morgan.",
          {
            feedback: [
              "Basta uma das duas ser falsa para 'A e B' ser falsa.",
              "'A ou B' não nega nada.",
            ],
          },
        ),
        n(
          "conectivos",
          "Na tabela-verdade de 'A ou B', em quantas das 4 linhas a proposição é verdadeira?",
          3,
          "Só é falsa quando as duas são falsas.",
          {
            misreads: [
              {
                value: 2,
                feedback:
                  "2 seria o 'ou exclusivo'; o 'ou' inclusivo também vale quando as duas são verdadeiras.",
              },
            ],
          },
        ),
        c(
          "conectivos",
          "'Se chover, levo guarda-chuva' é equivalente a:",
          "'Não chove ou levo guarda-chuva'",
          ["'Chove e levo guarda-chuva'", "'Se levo guarda-chuva, chove'"],
          "A → B equivale a (não A) ou B.",
          {
            feedback: [
              "A conjunção afirma que chove, o que a frase não diz.",
              "Essa é a recíproca.",
            ],
          },
        ),
        n(
          "conectivos",
          "Na tabela-verdade de 'se A, então B', em quantas das 4 linhas a proposição é falsa?",
          1,
          "Só quando A é verdadeira e B é falsa.",
          {
            misreads: [
              {
                value: 2,
                feedback:
                  "Hipótese falsa sempre torna a implicação verdadeira; só uma linha é falsa.",
              },
            ],
          },
        ),
        c(
          "conectivos",
          "'A ou não A' é:",
          "Sempre verdadeira (uma tautologia)",
          ["Sempre falsa", "Verdadeira só quando A é verdadeira"],
          "Uma das duas partes é sempre verdadeira.",
          {
            feedback: [
              "'A e não A' é que é sempre falsa.",
              "Quando A é falsa, 'não A' é verdadeira.",
            ],
          },
        ),
      ],
    },
    {
      title: "Todos, algum, nenhum",
      objective: "Negar frases com quantificadores e reconhecer conclusões válidas.",
      introduction:
        "A negação de 'todos são' é 'algum não é'; a de 'algum é' é 'nenhum é'. Uma conclusão é válida quando não há caso em que as premissas sejam verdadeiras e a conclusão falsa.",
      specs: [
        c(
          "quantificadores",
          "A negação de 'todos os alunos passaram' é:",
          "Algum aluno não passou",
          ["Nenhum aluno passou", "Não existe aluno que passou"],
          "Para desmentir 'todos', basta um que não passou.",
          {
            feedback: [
              "'Nenhum' é muito mais forte que a negação.",
              "Isso também é o mesmo que 'nenhum passou'.",
            ],
          },
        ),
        c(
          "quantificadores",
          "A negação de 'existe um número par primo' é:",
          "Nenhum número par é primo",
          ["Existe um número par que não é primo", "Todo número primo é par"],
          "Negar 'existe' é afirmar que não existe nenhum.",
          {
            feedback: [
              "Isso não contradiz a frase original.",
              "Essa frase nem é a negação; ela até implicaria que existe primo par.",
            ],
          },
        ),
        c(
          "quantificadores",
          "Todos os gatos são mamíferos. Alguns mamíferos voam. Logo:",
          "Não se pode concluir nada sobre gatos voarem",
          ["Alguns gatos voam", "Nenhum gato voa"],
          "Os mamíferos que voam podem não ser gatos.",
          {
            feedback: [
              "Os mamíferos que voam podem ser só morcegos.",
              "As premissas não garantem isso: nada impede que algum gato esteja entre os mamíferos que voam.",
            ],
          },
        ),
        n(
          "quantificadores",
          "Numa turma de 30 alunos, 18 jogam futebol e 20 jogam vôlei. No mínimo quantos jogam os dois?",
          8,
          "18 + 20 − 30 = 8.",
          { misreads: [{ value: 18, feedback: "18 é o máximo possível, não o mínimo." }] },
        ),
        c(
          "quantificadores",
          "'Nenhum peixe anda' é equivalente a:",
          "Não existe peixe que anda",
          ["Algum peixe não anda", "Algum peixe anda"],
          "'Nenhum é' equivale a 'todo não é'.",
          {
            feedback: ["Isso é mais fraco que 'nenhum'.", "Isso é a negação da frase."],
          },
        ),
        c(
          "quantificadores",
          "Todo quadrado é losango. Todo losango é paralelogramo. Logo:",
          "Todo quadrado é paralelogramo",
          ["Todo paralelogramo é quadrado", "Algum losango não é paralelogramo"],
          "Inclusões encadeadas.",
          {
            feedback: ["A inclusão vai no outro sentido.", "Contradiz a segunda premissa."],
          },
        ),
        n(
          "quantificadores",
          "Numa pesquisa, 70% gostam de café e 60% gostam de chá. No mínimo, que porcentagem gosta dos dois?",
          30,
          "70 + 60 − 100 = 30.",
          {
            misreads: [
              {
                value: 60,
                feedback: "60% é o máximo, se todos que gostam de chá gostarem de café.",
              },
            ],
          },
        ),
        c(
          "quantificadores",
          "Para mostrar que 'todo número ímpar maior que 1 é primo' é falsa, basta:",
          "Mostrar um ímpar maior que 1 que não é primo, como 9",
          ["Mostrar um primo ímpar, como 7", "Mostrar que 2 é primo"],
          "Um contraexemplo derruba o 'todo'.",
          {
            feedback: [
              "Um exemplo favorável não prova nem refuta.",
              "2 é par; não fala sobre ímpares.",
            ],
          },
        ),
      ],
    },
    {
      title: "Quem diz a verdade?",
      objective:
        "Resolver problemas de verdadeiros e mentirosos testando hipóteses e buscando contradições.",
      introduction:
        "Em ilhas de cavaleiros (que sempre dizem a verdade) e patifes (que sempre mentem), cada frase vira uma restrição. Suponha que alguém é cavaleiro e veja se surge contradição; se surgir, ele é patife.",
      specs: [
        c(
          "verdade-mentira",
          "A diz: 'eu sou patife'. O que se conclui?",
          "Nenhum habitante da ilha pode dizer isso",
          ["A é patife", "A é cavaleiro"],
          "Um cavaleiro não mentiria dizendo que é patife; um patife não diria a verdade.",
          {
            feedback: [
              "Se fosse patife, a frase seria verdadeira, e patifes mentem.",
              "Se fosse cavaleiro, a frase seria falsa.",
            ],
          },
        ),
        c(
          "verdade-mentira",
          "A diz: 'B é patife'. B diz: 'nós dois somos cavaleiros'. Então:",
          "A é cavaleiro e B é patife",
          ["Os dois são cavaleiros", "Os dois são patifes"],
          "Se B fosse cavaleiro, A também seria, mas A diz que B é patife: contradição. Logo B é patife, e A disse a verdade.",
          {
            feedback: [
              "Se os dois fossem cavaleiros, A teria mentido sobre B.",
              "Se A fosse patife, B seria cavaleiro, e a frase de B tornaria A cavaleiro.",
            ],
          },
        ),
        c(
          "verdade-mentira",
          "Exatamente uma de quatro pessoas quebrou um vaso, e só uma delas diz a verdade. Ana: 'foi a Bia'. Bia: 'foi o Dudu'. Caio: 'não fui eu'. Dudu: 'a Bia mentiu'. Quem quebrou o vaso?",
          "Caio",
          ["Bia", "Dudu"],
          "Bia e Dudu se contradizem, então um deles diz a verdade; como só há uma verdade, Ana e Caio mentem. Caio mentir ao dizer 'não fui eu' significa que foi ele.",
          {
            feedback: [
              "Se fosse a Bia, Ana, Caio e Dudu diriam a verdade: três verdades.",
              "Se fosse o Dudu, Bia diria a verdade e Caio também: duas verdades.",
            ],
          },
        ),
        c(
          "verdade-mentira",
          "Três amigos: um sempre mente, dois sempre dizem a verdade. Ana: 'Bia mente'. Bia: 'Caio mente'. Caio: 'Ana diz a verdade'. Quem mente?",
          "Bia",
          ["Ana", "Caio"],
          "Se Bia mente, Ana diz a verdade, Caio diz a verdade e confirma Ana: consistente. As outras hipóteses geram dois mentirosos.",
          {
            feedback: [
              "Se Ana mentisse, Bia diria a verdade e Caio mentiria: dois mentirosos.",
              "Se Caio mentisse, Ana mentiria também: dois mentirosos.",
            ],
          },
        ),
        n(
          "verdade-mentira",
          "Numa sala há 10 pessoas, cada uma cavaleiro ou patife. Cada uma diz: 'todas as outras nove são patifes'. Quantos patifes há?",
          9,
          "Dois cavaleiros não podem existir, porque cada um chamaria o outro de patife. Sem nenhum cavaleiro, a frase de cada patife seria verdadeira. Então há exatamente um cavaleiro, e os outros 9 são patifes.",
          {
            misreads: [
              {
                value: 10,
                feedback: "Com 10 patifes, a frase de cada um seria verdadeira, e patifes mentem.",
              },
            ],
          },
        ),
        c(
          "verdade-mentira",
          "Há duas portas, e só uma leva à saída; cada uma tem um guarda. Um guarda sempre diz a verdade e o outro sempre mente, mas não se sabe quem é quem. Qual pergunta, feita a qualquer um deles, revela a porta certa?",
          "'Qual porta o outro guarda diria que é a saída?' e escolher a oposta",
          ["'Qual é a saída?'", "'Você mente?'"],
          "Os dois apontam a porta errada: o verdadeiro relata a mentira do outro; o mentiroso mente sobre a verdade.",
          {
            feedback: [
              "O mentiroso apontaria a errada, e não se sabe quem é quem.",
              "Os dois respondem 'não'.",
            ],
          },
        ),
        n(
          "verdade-mentira",
          "Numa ilha, A diz: 'exatamente um de nós três é patife'. B diz: 'exatamente dois de nós três são patifes'. C diz: 'nós três somos patifes'. Quantos patifes há?",
          2,
          "As três frases se excluem, então no máximo uma é verdadeira e há pelo menos 2 patifes. Três patifes tornariam a frase de C verdadeira. Logo há 2 patifes: B é o cavaleiro.",
          {
            misreads: [{ value: 3, feedback: "Com três patifes, a frase de C seria verdadeira." }],
          },
        ),
        c(
          "verdade-mentira",
          "Numa ilha, A diz: 'se eu sou cavaleiro, então B é cavaleiro'. O que se conclui?",
          "A e B são cavaleiros",
          ["A é patife", "B é patife e A é cavaleiro"],
          "Se A fosse patife, a implicação seria verdadeira (hipótese falsa), e patifes não dizem verdades. Logo A é cavaleiro e a implicação é verdadeira: B é cavaleiro.",
          {
            feedback: [
              "Um patife não pode dizer uma implicação verdadeira, e com A patife ela seria verdadeira.",
              "Com A cavaleiro, a frase dele obriga B a ser cavaleiro.",
            ],
          },
        ),
      ],
    },
    {
      title: "Deduzir em etapas",
      objective: "Organizar informações em tabelas de dupla entrada e deduzir por eliminação.",
      introduction:
        "Problemas de dedução com várias pessoas e atributos se resolvem com uma tabela: marque o que é certo, elimine o impossível e use cada nova certeza para eliminar mais. Quando travar, teste uma hipótese.",
      specs: [
        c(
          "deducao",
          "Três amigos, Ana, Bruno e Caio, têm um gato, um cão e um peixe, um animal cada. Ana não tem o gato. Bruno tem o peixe. Quem tem o gato?",
          "Caio",
          ["Ana", "Bruno"],
          "Bruno tem o peixe; Ana não tem o gato; sobra Caio.",
          {
            feedback: ["O enunciado diz que Ana não tem o gato.", "Bruno tem o peixe."],
          },
        ),
        n(
          "deducao",
          "Quatro pessoas sentam em fila. Ana não está nas pontas. Bia está à direita de Ana, imediatamente. Caio está numa ponta. Dudu não está ao lado de Caio. Em que posição (1 a 4, da esquerda para a direita) está Ana?",
          2,
          "Se Ana estivesse em 3, Bia ficaria em 4, Caio em 1 e Dudu em 2, ao lado de Caio: proibido. Então Ana está em 2 e Bia em 3; Caio e Dudu ocupam as pontas, sem ficar lado a lado.",
          { misreads: [{ value: 3, feedback: "Com Ana em 3, Dudu acaba ao lado de Caio." }] },
        ),
        c(
          "deducao",
          "Numa corrida, Ana chegou antes de Bia, Caio chegou depois de Dudu, e Bia chegou antes de Dudu. Quem chegou por último?",
          "Caio",
          ["Dudu", "Bia"],
          "Ana < Bia < Dudu < Caio.",
          {
            feedback: ["Caio chegou depois de Dudu.", "Bia chegou antes de Dudu."],
          },
        ),
        n(
          "deducao",
          "Cinco caixas numeradas de 1 a 5 têm pesos diferentes. A 3 é mais pesada que a 1 e a 5; a 2 é mais leve que a 1; a 4 é a mais pesada de todas. Quantas caixas são com certeza mais leves que a 3?",
          3,
          "1 e 5 são mais leves que a 3, e a 2 é mais leve que a 1: 1, 2 e 5.",
          {
            misreads: [
              { value: 2, feedback: "Esqueceu a 2, que é mais leve que a 1 e portanto que a 3." },
            ],
          },
        ),
        c(
          "deducao",
          "Três caixas têm rótulos 'bolas', 'cubos' e 'misturado', todos errados. Tirando um objeto de qual caixa se descobre o conteúdo de todas?",
          "Da caixa rotulada 'misturado'",
          ["Da caixa rotulada 'bolas'", "Não há como descobrir com um só objeto"],
          "Como o rótulo está errado, ela tem só bolas ou só cubos; o objeto revela qual, e as outras duas se deduzem.",
          {
            feedback: [
              "Um objeto dela não distingue 'só cubos' de 'misturado'.",
              "Com a caixa certa, um objeto basta.",
            ],
          },
        ),
        n(
          "deducao",
          "Numa família, a soma das idades de pai e filho é 50. Daqui a 5 anos o pai terá o triplo da idade do filho. Quantos anos tem o filho hoje?",
          10,
          "p + f = 50 e p + 5 = 3(f + 5): 50 − f + 5 = 3f + 15, f = 10.",
          { misreads: [{ value: 15, feedback: "15 é a idade do filho daqui a 5 anos." }] },
        ),
        c(
          "deducao",
          "Numa estante, o livro vermelho está à esquerda do azul, o verde está à direita do azul e o amarelo está entre o vermelho e o azul. Qual é a ordem da esquerda para a direita?",
          "Vermelho, amarelo, azul, verde",
          ["Amarelo, vermelho, azul, verde", "Vermelho, azul, amarelo, verde"],
          "Vermelho antes do azul, amarelo entre eles, verde depois do azul.",
          {
            feedback: [
              "O amarelo fica entre o vermelho e o azul.",
              "O amarelo precisa estar antes do azul.",
            ],
          },
        ),
        c(
          "deducao",
          "Numa tabela de dedução, quando nenhuma casa pode mais ser decidida só por eliminação, o próximo passo é:",
          "Testar uma hipótese e ver se leva a contradição",
          ["Chutar a resposta", "Recomeçar do zero"],
          "Uma hipótese que gera contradição é descartada, e isso libera novas eliminações.",
          {
            feedback: ["Chutar não garante a resposta.", "O trabalho feito continua válido."],
          },
        ),
      ],
    },
    {
      title: "Argumentos válidos",
      objective: "Distinguir argumentos válidos de falácias comuns e construir deduções corretas.",
      introduction:
        "Um argumento é válido quando a conclusão decorre das premissas, sejam elas verdadeiras ou não. Falácias comuns: afirmar o consequente, negar o antecedente, generalizar a partir de poucos casos.",
      estimatedMinutes: 18,
      specs: [
        c(
          "validade",
          "'Se estudo, passo. Passei. Logo, estudei.' Esse argumento:",
          "É inválido: afirma o consequente",
          ["É válido", "É inválido: nega o antecedente"],
          "Passar pode ter outra causa.",
          {
            feedback: [
              "A conclusão não decorre das premissas.",
              "Negar o antecedente seria 'não estudei, logo não passei'.",
            ],
          },
        ),
        c(
          "validade",
          "'Se estudo, passo. Não passei. Logo, não estudei.' Esse argumento:",
          "É válido (contrapositiva)",
          ["É inválido: afirma o consequente", "É inválido: generaliza"],
          "De A → B e não B segue não A.",
          {
            feedback: ["Não afirma o consequente; nega-o.", "Não há generalização aqui."],
          },
        ),
        c(
          "validade",
          "'Todo pássaro voa. O pinguim é um pássaro. Logo, o pinguim voa.' Esse argumento é:",
          "Válido, mas com uma premissa falsa",
          ["Inválido", "Válido e com conclusão verdadeira"],
          "A forma é correta; o problema é a premissa 'todo pássaro voa'.",
          {
            feedback: [
              "A conclusão decorre das premissas; é a forma válida.",
              "A conclusão é falsa (pinguins não voam); num argumento válido isso só acontece porque alguma premissa é falsa.",
            ],
          },
        ),
        n(
          "validade",
          "Das quatro formas 'de A → B e A, concluir B', 'de A → B e B, concluir A', 'de A → B e não A, concluir não B' e 'de A → B e não B, concluir não A', quantas são válidas?",
          2,
          "Válidas: a primeira (modus ponens) e a última (modus tollens).",
          {
            misreads: [
              { value: 4, feedback: "Afirmar o consequente e negar o antecedente são falácias." },
            ],
          },
        ),
        c(
          "validade",
          "'Três pessoas que conheço de São Paulo torcem pelo mesmo time; logo, todo paulistano torce por esse time.' A falha é:",
          "Generalização a partir de poucos casos",
          ["Negação do antecedente", "Nenhuma; é válido"],
          "Três casos não representam milhões.",
          {
            feedback: [
              "Não há implicação sendo negada.",
              "A conclusão não decorre de três exemplos.",
            ],
          },
        ),
        c(
          "validade",
          "Das premissas 'A ou B' e 'não A', conclui-se:",
          "B",
          ["Não B", "Nada"],
          "Silogismo disjuntivo: se uma das duas é verdadeira e não é A, é B.",
          {
            feedback: ["Não B contradiria 'A ou B' com não A.", "A conclusão B é forçada."],
          },
        ),
        n(
          "validade",
          "Numa lista, 'se A então B', 'se B então C' e 'A' são verdadeiras. Das proposições B, C, não C e não A, quantas são com certeza verdadeiras?",
          2,
          "A dá B, B dá C: B e C verdadeiras; não C e não A são falsas.",
          { misreads: [{ value: 1, feedback: "De B segue C também: são duas." }] },
        ),
        c(
          "validade",
          "Por que um argumento válido pode ter conclusão falsa?",
          "Porque validade diz respeito à forma: se alguma premissa for falsa, a conclusão pode ser falsa mesmo com raciocínio correto",
          [
            "Não pode; válido implica conclusão verdadeira",
            "Porque a lógica não se aplica à vida real",
          ],
          "Válido com premissas verdadeiras garante conclusão verdadeira; com premissa falsa, não.",
          {
            feedback: [
              "O exemplo do pinguim mostra que pode.",
              "A lógica se aplica, desde que as premissas sejam verdadeiras.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize os passos para resolver um problema de cavaleiros e patifes.",
    labels: [
      "Escrever cada frase como uma condição sobre quem é o quê",
      "Supor que um dos personagens é cavaleiro",
      "Deduzir as consequências para os outros",
      "Descartar a hipótese se surgir contradição e testar a oposta",
    ],
    explanation:
      "Cada frase é uma restrição; uma hipótese testada até a contradição reduz as possibilidades pela metade.",
  },
  justification: {
    prompts: [
      "Explique por que ninguém numa ilha de cavaleiros e patifes pode dizer 'eu sou patife'.",
      "Explique a diferença entre um argumento válido e um argumento com conclusão verdadeira, usando: 'todo pássaro voa; o pinguim é um pássaro; logo, o pinguim voa'.",
      "Explique por que 'se estudo, passo; passei; logo estudei' é um raciocínio falho.",
    ],
    samples: [
      "Se quem fala fosse cavaleiro, estaria dizendo algo falso ao se chamar de patife, e cavaleiros não mentem. Se fosse patife, a frase 'eu sou patife' seria verdadeira, e patifes não dizem verdades. As duas possibilidades levam a contradição, então essa frase não pode ser dita por ninguém da ilha.",
      "'Todo pássaro voa; o pinguim é pássaro; logo o pinguim voa' tem forma válida: se as premissas fossem verdadeiras, a conclusão seria obrigatória. Mas a premissa 'todo pássaro voa' é falsa, e é isso que permite a conclusão falsa: num argumento válido, premissas verdadeiras garantiriam conclusão verdadeira. Validade é sobre a ligação entre premissas e conclusão, não sobre a verdade de cada frase.",
      "A regra diz que estudar leva a passar, mas não diz que passar só acontece estudando. Alguém pode ter passado por sorte ou por já saber o conteúdo. Concluir 'estudei' a partir de 'passei' é afirmar o consequente, uma falácia: a implicação não funciona de trás para frente.",
    ],
    focus: "a forma do argumento",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const total = 20 + 5 * (seed % 7);
      const a = Math.floor(total * 0.5) + (seed % 5);
      // 30 alunos com 18 e 20 já é uma missão.
      const b =
        Math.floor(total * 0.6) +
        (seed % 3) +
        (total === 30 && a === 18 && Math.floor(total * 0.6) + (seed % 3) === 20 ? 1 : 0);
      const minimo = Math.max(0, a + b - total);
      return c(
        "minimo-na-intersecao",
        `Numa turma de ${total} alunos, ${a} gostam de matemática e ${b} gostam de música. No mínimo, quantos gostam das duas?`,
        `${minimo}`,
        [`${Math.min(a, b)}`, `${a + b}`],
        `${a} + ${b} − ${total} = ${minimo}: é o que sobra quando se espalham ao máximo os dois grupos.`,
        {
          feedback: [
            "Esse é o máximo possível de alunos nos dois grupos, não o mínimo.",
            "Somou os grupos sem descontar o total da turma.",
          ],
        },
      );
    }
    if (variant === 1) {
      // Com 4 proposições, 2⁴ e 4² coincidem; 3 já é uma missão.
      const n = [5, 6, 7, 8][seed % 4] ?? 5;
      const linhas = 2 ** n;
      return c(
        "linhas-da-tabela-verdade",
        `Uma tabela-verdade com ${n} proposições simples tem quantas linhas?`,
        `${linhas}`,
        [`${2 * n}`, `${n * n}`],
        `Cada proposição tem 2 valores: 2 multiplicado ${n} vezes dá ${linhas}.`,
        {
          feedback: [
            "Somou 2 para cada proposição; as combinações se multiplicam.",
            "Elevou o número de proposições ao quadrado; o certo é 2 elevado a esse número.",
          ],
        },
      );
    }
    const frente = 4 + (seed % 9);
    const tras = 3 + (Math.floor(seed / 9) % 8);
    const total = frente + tras - 1;
    return c(
      "pessoas-na-fila",
      `Numa fila, Ana é a ${frente}ª pessoa contando da frente e a ${tras}ª contando de trás. Quantas pessoas há na fila?`,
      `${total}`,
      [`${total + 1}`, `${total - 1}`],
      `${frente} + ${tras} conta a Ana duas vezes: ${frente} + ${tras} − 1 = ${total}.`,
      {
        feedback: [
          "Contou a Ana duas vezes, uma em cada contagem.",
          "Descontou uma pessoa a mais: só a Ana aparece nas duas contagens.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "logica-em",
    title: "Falácias da semana",
    prompt:
      "Durante uma semana, recolha três argumentos de propagandas, notícias ou conversas. Para cada um, escreva premissas e conclusão, diga se o argumento é válido e, se não for, qual falácia aparece.",
    lab: "groups",
    steps: [
      "Registre os três argumentos com a fonte e reescreva cada um como premissas e conclusão.",
      "Classifique cada um como válido ou inválido e nomeie a falácia quando houver.",
      "Proponha uma versão válida de pelo menos um deles, dizendo que premissa seria necessária.",
    ],
    rubric: [
      "Três argumentos reescritos com premissas e conclusão (0–3)",
      "Classificação correta e falácia nomeada (0–3)",
      "Versão válida com a premissa que falta (0–3)",
      "Clareza e fontes registradas (0–1)",
    ],
  },
  homeSupport: [
    "Quando ouvirem 'todo mundo faz isso', conversem sobre o que seria preciso para a frase ser verdadeira e qual exemplo a derrubaria.",
    "Proponham um enigma de verdadeiros e mentirosos no jantar e resolvam juntos testando hipóteses.",
  ],
};
