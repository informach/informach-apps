import { c, n, type SkillPack } from "../skill-factory";

/**
 * Medir e comparar: comprimento com unidades não padronizadas e com
 * centímetros, mais pesado e mais leve, cabe mais e cabe menos, horas
 * cheias e meias horas, dias da semana e dinheiro. Trilha Mirim 1.
 */
export const medirEComparar: SkillPack = {
  id: "medir-e-comparar",
  name: "Medir e comparar",
  domain: "mirim",
  lab: null,
  missions: [
    {
      title: "Maior, menor, mais comprido",
      objective: "Comparar comprimentos e medir com palmos, clipes e centímetros.",
      introduction:
        "Para medir, usamos algo que se repete: palmos, clipes ou centímetros da régua. Quanto mais vezes cabe, mais comprido é o objeto. Para comparar, use sempre a mesma unidade.",
      specs: [
        n(
          "comprimento",
          "Um lápis mede 5 clipes e uma caneta mede 7 clipes iguais. Quantos clipes a caneta tem a mais?",
          2,
          "7 − 5 = 2.",
          { misreads: [{ value: 12, feedback: "12 soma os dois; a pergunta é quantos a mais." }] },
        ),
        c(
          "comprimento",
          "Ana mediu a mesa com o palmo e deu 8 palmos. O pai mediu e deu 5 palmos. Por que deu diferente?",
          "O palmo do pai é maior, então cabe menos vezes",
          ["A mesa mudou de tamanho", "O pai contou errado com certeza"],
          "Unidades de tamanhos diferentes dão números diferentes.",
          {
            feedback: ["A mesa é a mesma.", "Os dois podem ter contado certo."],
          },
        ),
        n(
          "comprimento",
          "Uma fita tem 30 centímetros. Cortaram 12 centímetros. Quantos centímetros sobraram?",
          18,
          "30 − 12 = 18.",
          { misreads: [{ value: 42, feedback: "Cortar tira um pedaço; a conta é de menos." }] },
        ),
        c(
          "comprimento",
          "Qual é mais comprida: uma corda de 1 metro ou uma de 80 centímetros?",
          "A de 1 metro, porque 1 metro são 100 centímetros",
          ["A de 80 centímetros, porque 80 é maior que 1", "São iguais"],
          "100 centímetros é mais que 80.",
          {
            feedback: [
              "Compare na mesma unidade: 1 metro é 100 centímetros.",
              "100 e 80 são diferentes.",
            ],
          },
        ),
        n(
          "comprimento",
          "Três tijolos iguais de 20 centímetros foram colocados em fila. Qual é o comprimento da fila, em centímetros?",
          60,
          "20 + 20 + 20 = 60.",
          { misreads: [{ value: 23, feedback: "Somou 3 com 20; são três tijolos de 20." }] },
        ),
        c(
          "comprimento",
          "Para medir o comprimento de uma borracha, o melhor é usar:",
          "Centímetros",
          ["Metros", "Quilômetros"],
          "A borracha é pequena.",
          {
            feedback: [
              "O metro é grande demais para uma borracha.",
              "Quilômetro é para distâncias entre cidades.",
            ],
          },
        ),
        n(
          "comprimento",
          "Bia tem 120 centímetros de altura e Caio tem 115. Quantos centímetros Bia é mais alta?",
          5,
          "120 − 115 = 5.",
          {
            misreads: [{ value: 235, feedback: "235 soma as alturas; a pergunta é a diferença." }],
          },
        ),
        c(
          "comprimento",
          "Ao medir com a régua, onde se coloca a ponta do objeto?",
          "No zero da régua",
          ["No número 1", "Em qualquer lugar"],
          "Começar do zero dá a medida certa.",
          {
            feedback: [
              "Começar no 1 dá 1 centímetro a mais.",
              "Começar em qualquer lugar atrapalha a leitura.",
            ],
          },
        ),
      ],
    },
    {
      title: "Pesado e leve, cheio e vazio",
      objective: "Comparar massas e capacidades com balança de pratos e recipientes.",
      introduction:
        "Na balança de pratos, o lado mais pesado desce. Para saber o que cabe mais, enchemos um recipiente e despejamos no outro. Uma caixa de leite tem 1 litro.",
      specs: [
        c(
          "massa-capacidade",
          "Numa balança, o prato com a melancia desceu e o prato com a maçã subiu. Qual é mais pesada?",
          "A melancia",
          ["A maçã", "As duas pesam igual"],
          "O lado mais pesado desce.",
          {
            feedback: [
              "O lado da maçã subiu: ela é mais leve.",
              "Se pesassem igual, os pratos ficariam na mesma altura.",
            ],
          },
        ),
        n(
          "massa-capacidade",
          "Uma balança fica equilibrada com 1 livro de um lado e 3 cadernos iguais do outro. Quantos cadernos pesam o mesmo que 2 livros iguais a esse?",
          6,
          "Cada livro vale 3 cadernos: 3 + 3 = 6.",
          { misreads: [{ value: 5, feedback: "Somou 2 com 3; cada livro vale 3 cadernos." }] },
        ),
        c(
          "massa-capacidade",
          "Uma jarra enche 4 copos. Uma garrafa enche 6 copos iguais. Qual cabe mais?",
          "A garrafa",
          ["A jarra", "Cabem igual"],
          "6 copos é mais que 4.",
          {
            feedback: ["A jarra enche menos copos.", "4 e 6 são diferentes."],
          },
        ),
        n(
          "massa-capacidade",
          "Uma caixa de suco tem 1 litro. Quantas caixas iguais são necessárias para ter 5 litros?",
          5,
          "Cada caixa tem 1 litro.",
          {
            misreads: [
              { value: 1, feedback: "1 caixa tem só 1 litro; para 5 litros são 5 caixas." },
            ],
          },
        ),
        c(
          "massa-capacidade",
          "O que pesa mais: um quilo de algodão ou um quilo de pedras?",
          "Pesam o mesmo: um quilo",
          ["As pedras", "O algodão"],
          "Um quilo é um quilo; o algodão só ocupa mais espaço.",
          {
            feedback: [
              "As pedras parecem mais pesadas, mas a quantidade é a mesma.",
              "O algodão ocupa mais espaço, mas pesa o mesmo.",
            ],
          },
        ),
        n(
          "massa-capacidade",
          "Um balde enche com 8 canecas de água. Já foram colocadas 5 canecas. Quantas faltam?",
          3,
          "8 − 5 = 3.",
          { misreads: [{ value: 13, feedback: "Faltar é conta de menos." }] },
        ),
        c(
          "massa-capacidade",
          "Para saber se um pote cabe mais que outro, o jeito certo é:",
          "Encher um e despejar no outro",
          ["Ver qual pote é mais alto", "Ver qual pote é mais largo"],
          "Se transbordar, o primeiro cabe mais; se sobrar espaço, cabe menos.",
          {
            feedback: [
              "Um pote alto pode ser fino e caber menos.",
              "Um pote largo pode ser baixo e caber menos.",
            ],
          },
        ),
        n(
          "massa-capacidade",
          "Numa balança, 2 maçãs iguais pesam o mesmo que 1 laranja e 1 maçã. Quantas maçãs pesam o mesmo que 1 laranja?",
          1,
          "Tirando 1 maçã de cada lado, sobra 1 maçã contra 1 laranja.",
          {
            misreads: [
              {
                value: 2,
                feedback: "Uma das maçãs está nos dois lados; tirando-a, sobra 1 contra 1.",
              },
            ],
          },
        ),
      ],
    },
    {
      title: "Horas e dias",
      objective: "Ler horas cheias e meias horas e usar dias da semana e meses.",
      introduction:
        "Uma hora tem 60 minutos e meia hora tem 30. A semana tem 7 dias: domingo, segunda, terça, quarta, quinta, sexta e sábado. O ano tem 12 meses.",
      specs: [
        c(
          "tempo",
          "A aula começa às 8 horas e dura 1 hora. A que horas termina?",
          "Às 9 horas",
          ["Às 8 horas e meia", "Às 10 horas"],
          "8 + 1 = 9.",
          {
            feedback: ["Meia hora é só a metade.", "10 horas seriam 2 horas depois."],
          },
        ),
        n("tempo", "Quantos dias tem uma semana?", 7, "Domingo a sábado.", {
          misreads: [{ value: 5, feedback: "5 são os dias de aula; a semana inteira tem 7." }],
        }),
        c(
          "tempo",
          "Hoje é quarta-feira. Que dia será amanhã?",
          "Quinta-feira",
          ["Terça-feira", "Sexta-feira"],
          "Depois da quarta vem a quinta.",
          {
            feedback: ["Terça foi ontem.", "Sexta será depois de amanhã."],
          },
        ),
        n(
          "tempo",
          "Quantos minutos tem meia hora?",
          30,
          "Uma hora tem 60 minutos; a metade é 30.",
          { misreads: [{ value: 60, feedback: "60 minutos é uma hora inteira." }] },
        ),
        c(
          "tempo",
          "O filme começou às 3 horas e terminou às 5 horas. Quanto tempo durou?",
          "2 horas",
          ["3 horas", "8 horas"],
          "De 3 até 5 são 2 horas.",
          {
            feedback: ["3 é a hora do começo.", "8 soma 3 com 5."],
          },
        ),
        n(
          "tempo",
          "Faltam 2 semanas para o aniversário da Lia. Quantos dias faltam?",
          14,
          "7 + 7 = 14.",
          { misreads: [{ value: 2, feedback: "2 são as semanas; cada semana tem 7 dias." }] },
        ),
        c(
          "tempo",
          "Qual mês vem depois de dezembro?",
          "Janeiro",
          ["Novembro", "Fevereiro"],
          "Dezembro é o último mês do ano; depois começa outro ano, em janeiro.",
          {
            feedback: ["Novembro vem antes de dezembro.", "Fevereiro vem depois de janeiro."],
          },
        ),
        c(
          "tempo",
          "O recreio começa às 10 horas e dura meia hora. A que horas termina?",
          "Às 10 e meia",
          ["Às 11 horas", "Às 10 e 15"],
          "Meia hora são 30 minutos: 10 horas e 30 minutos.",
          {
            feedback: [
              "11 horas seria 1 hora inteira depois.",
              "10 e 15 seria só 15 minutos depois.",
            ],
          },
        ),
      ],
    },
    {
      title: "Dinheiro de brincadeira",
      objective: "Somar moedas e notas, comparar preços e dar troco simples.",
      introduction:
        "Moedas e notas têm valores diferentes: duas moedas de 1 real valem o mesmo que uma nota de 2 reais. Para saber o troco, conte do preço até o valor que foi pago.",
      specs: [
        n(
          "dinheiro",
          "Pedro tem 2 notas de 5 reais e 3 moedas de 1 real. Quantos reais ele tem?",
          13,
          "5 + 5 + 1 + 1 + 1 = 13.",
          { misreads: [{ value: 5, feedback: "5 é o número de notas e moedas, não o valor." }] },
        ),
        c(
          "dinheiro",
          "Um sorvete custa 4 reais. Lia paga com uma nota de 10 reais. Qual é o troco?",
          "6 reais",
          ["14 reais", "4 reais"],
          "De 4 até 10 faltam 6.",
          {
            feedback: ["14 soma o preço com a nota.", "4 é o preço, não o troco."],
          },
        ),
        n(
          "dinheiro",
          "Um caderno custa 8 reais e um lápis custa 2 reais. Quanto custam juntos, em reais?",
          10,
          "8 + 2 = 10.",
          { misreads: [{ value: 6, feedback: "Juntos é somar os preços." }] },
        ),
        c(
          "dinheiro",
          "Quantas moedas de 1 real valem o mesmo que uma nota de 5 reais?",
          "5",
          ["1", "10"],
          "5 moedas de 1 somam 5 reais.",
          {
            feedback: ["Uma moeda de 1 real vale só 1 real.", "10 moedas somariam 10 reais."],
          },
        ),
        n(
          "dinheiro",
          "Rui tinha 20 reais e gastou 7. Quantos reais sobraram?",
          13,
          "20 − 7 = 13.",
          { misreads: [{ value: 27, feedback: "Gastar diminui o dinheiro." }] },
        ),
        c(
          "dinheiro",
          "Com 10 reais, dá para comprar um livro de 6 reais e um gibi de 5 reais?",
          "Não, falta 1 real",
          ["Sim, e sobra 1 real", "Sim, fica certinho"],
          "6 + 5 = 11, mais que 10.",
          {
            feedback: [
              "6 + 5 = 11, e 11 é mais que 10.",
              "Certinho seria se custassem 10 juntos; custam 11.",
            ],
          },
        ),
        n(
          "dinheiro",
          "Uma bala custa 1 real. Quantas balas dá para comprar com 2 notas de 2 reais?",
          4,
          "2 + 2 = 4 reais; 4 balas.",
          { misreads: [{ value: 2, feedback: "2 são as notas; cada nota vale 2 reais." }] },
        ),
        c(
          "dinheiro",
          "Qual compra é mais barata: um brinquedo de 15 reais ou um de 12 reais?",
          "O de 12 reais",
          ["O de 15 reais", "Custam igual"],
          "12 é menos que 15.",
          {
            feedback: ["15 custa mais.", "12 e 15 são diferentes."],
          },
        ),
      ],
    },
    {
      title: "Qual medida usar?",
      objective: "Escolher a medida certa e resolver problemas do dia a dia.",
      introduction:
        "Antes de responder, pense no que está sendo medido: comprimento, peso, quanto cabe, tempo ou dinheiro. Depois escolha a conta e confira se a resposta faz sentido.",
      estimatedMinutes: 15,
      specs: [
        c(
          "resolver",
          "Qual é uma altura que faz sentido para uma criança de 8 anos?",
          "125 centímetros",
          ["12 centímetros", "1.250 centímetros"],
          "Crianças de 8 anos costumam ter pouco mais de 1 metro.",
          {
            feedback: [
              "12 centímetros é o tamanho de um lápis.",
              "Isso seria mais alto que um prédio de 3 andares.",
            ],
          },
        ),
        n(
          "resolver",
          "Uma corda de 20 metros foi cortada em 4 pedaços iguais. Quantos metros tem cada pedaço?",
          5,
          "20 dividido em 4 partes iguais: 5.",
          { misreads: [{ value: 16, feedback: "Tirar 4 não é dividir em 4 partes." }] },
        ),
        c(
          "resolver",
          "Para saber quanto tempo falta para o almoço, precisamos olhar:",
          "O relógio",
          ["A régua", "A balança"],
          "Tempo se mede com relógio.",
          {
            feedback: ["A régua mede comprimento.", "A balança mede peso."],
          },
        ),
        n(
          "resolver",
          "Um pacote de arroz pesa 5 quilos. Quantos quilos pesam 3 pacotes?",
          15,
          "5 + 5 + 5 = 15.",
          { misreads: [{ value: 8, feedback: "Somou 3 com 5; são 3 pacotes de 5 quilos." }] },
        ),
        c(
          "resolver",
          "Um garoto disse que uma garrafa grande de água tem 100 litros. Quantos litros tem, mais ou menos, uma garrafa grande?",
          "Perto de 2 litros",
          ["Perto de 100 litros", "Perto de 20 litros"],
          "Uma garrafa grande tem perto de 1 ou 2 litros; 100 litros encheriam uma banheira pequena.",
          {
            feedback: [
              "100 litros enchem uma banheira pequena, não uma garrafa.",
              "20 litros é um galão grande, daqueles de bebedouro.",
            ],
          },
        ),
        n(
          "resolver",
          "A mãe comprou 3 frutas de 2 reais cada e pagou com uma nota de 10. Quanto recebeu de troco, em reais?",
          4,
          "3 × 2 = 6; 10 − 6 = 4.",
          { misreads: [{ value: 8, feedback: "8 é o troco de uma fruta só." }] },
        ),
        c(
          "resolver",
          "Qual unidade usar para medir quanto de água cabe num balde?",
          "Litros",
          ["Quilos", "Horas"],
          "Litros medem quanto cabe.",
          {
            feedback: ["Quilos medem peso.", "Horas medem tempo."],
          },
        ),
        c(
          "resolver",
          "Por que é bom estimar antes de medir?",
          "Para perceber se a medida saiu muito errada",
          ["Para não precisar medir depois", "Para a medida sair mais exata"],
          "Estimar antes ajuda a conferir a medida depois.",
          {
            feedback: [
              "Estimar não dá o valor exato; ainda é preciso medir.",
              "A estimativa é aproximada; quem dá o valor exato é a medida.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Coloque em ordem os passos para descobrir a que horas termina uma atividade.",
    labels: [
      "Ver a que horas a atividade começa",
      "Ver quanto tempo ela dura",
      "Somar a duração à hora do começo",
      "Conferir no relógio se a resposta faz sentido",
    ],
    explanation:
      "Primeiro a hora do começo, depois quanto dura, depois a conta e, no fim, conferir.",
  },
  justification: {
    prompts: [
      "Explique como descobrir que horas serão meia hora depois das 3 horas.",
      "Explique como descobrir o troco de um sorvete de 4 reais pago com 10.",
      "Explique como descobrir o troco de quem comprou 4 pães de 2 reais cada e pagou com uma nota de 10.",
    ],
    samples: [
      "Meia hora são 30 minutos. Às 3 horas o ponteiro grande está no 12. Depois de meia hora ele chega no 6. Então serão 3 e meia.",
      "Conto do 4 até o 10: 5, 6, 7, 8, 9, 10. São 6 números, então o troco é 6 reais. Também dá para fazer 10 − 4 = 6.",
      "4 pães de 2 reais custam 2 + 2 + 2 + 2 = 8 reais. Conto do 8 até o 10: 9, 10. Faltam 2. O troco é 2 reais.",
    ],
    focus: "a unidade e a conta certas",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      // O troco nunca coincide com o preço (5 de 10 ficaria de fora).
      const precoBase = [2, 3, 4, 6, 7, 8][seed % 6] ?? 2;
      const nota = [10, 20][Math.floor(seed / 6) % 2] ?? 10;
      // 4 com nota de 10 (o sorvete) e 7 de 20 (o gasto do Rui) já são contas da missão 4.
      const preco =
        (precoBase === 4 && nota === 10) || (precoBase === 7 && nota === 20)
          ? precoBase - 1
          : precoBase;
      return c(
        "troco",
        `Um brinquedo custa ${preco} reais. Nina paga com uma nota de ${nota} reais. Qual é o troco?`,
        `${nota - preco} reais`,
        [`${nota + preco} reais`, `${preco} reais`],
        `De ${preco} até ${nota} faltam ${nota - preco}.`,
        {
          feedback: [
            "Somou o preço com a nota; o troco é o que sobra.",
            "Esse é o preço, não o troco.",
          ],
        },
      );
    }
    if (variant === 1) {
      const tamanhoBase = 5 * (2 + (seed % 5));
      const quantos = 2 + (Math.floor(seed / 5) % 3);
      // 3 tijolos de 20 centímetros já é a conta da missão 1.
      const tamanho = quantos === 3 && tamanhoBase === 20 ? 25 : tamanhoBase;
      return c(
        "comprimento-em-fila",
        `${quantos} tijolos iguais de ${tamanho} centímetros foram colocados em fila. Qual é o comprimento da fila?`,
        `${tamanho * quantos} centímetros`,
        [`${tamanho + quantos} centímetros`, `${tamanho} centímetros`],
        `${tamanho} × ${quantos} = ${tamanho * quantos}.`,
        {
          feedback: [
            "Somou o número de tijolos com o tamanho; são vários tijolos iguais.",
            "Esse é o tamanho de um tijolo só.",
          ],
        },
      );
    }
    // 2 semanas já é a conta da missão 3.
    const semanas = 3 + (seed % 2);
    const dias = semanas * 7;
    return c(
      "semanas-em-dias",
      `Faltam ${semanas} semanas para as férias. Quantos dias faltam?`,
      `${dias}`,
      [`${semanas + 7}`, `${semanas}`],
      `Cada semana tem 7 dias: ${semanas} × 7 = ${dias}.`,
      {
        feedback: [
          "Somou em vez de repetir 7 dias para cada semana.",
          "Esse é o número de semanas.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "medir-e-comparar",
    title: "Medir a casa",
    prompt:
      "Escolha 4 objetos da casa e meça cada um de dois jeitos: com o seu palmo e com a régua ou fita. Compare os números e explique por que são diferentes.",
    lab: null,
    steps: [
      "Escolha 4 objetos e estime o tamanho de cada um antes de medir.",
      "Meça com o palmo e com a régua e anote os dois números.",
      "Compare com a estimativa e explique as diferenças.",
    ],
    rubric: [
      "Estimativas anotadas antes de medir (0–2)",
      "Medidas com palmo e régua registradas (0–3)",
      "Comparação e explicação das diferenças (0–2)",
      "Unidades escritas corretamente (0–1)",
    ],
  },
  homeSupport: [
    "Na cozinha, comparem pesos segurando dois objetos, um em cada mão, e depois confiram numa balança.",
    "Brinquem de mercadinho com moedas de verdade ou de papel e deixem a criança calcular o troco.",
  ],
};
