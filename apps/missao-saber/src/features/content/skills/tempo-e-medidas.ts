import { c, n, type SkillPack } from "../skill-factory";

/**
 * Tempo e medidas: ler horas e calcular durações, dias e semanas no
 * calendário, comprimentos e comparações, massa e capacidade, e escolher
 * a medida certa em problemas do dia a dia. Trilhas Canguru P e Mirim 2.
 */
export const tempoEMedidas: SkillPack = {
  id: "tempo-e-medidas",
  name: "Tempo e medidas",
  domain: "common",
  lab: "bars",
  missions: [
    {
      title: "Horas e minutos",
      objective: "Ler horas, calcular quanto tempo passou e a que horas algo termina.",
      introduction:
        "Uma hora tem 60 minutos e meia hora tem 30. Para saber quanto tempo passou, conte de um horário até o outro, passando pelas horas cheias.",
      specs: [
        n(
          "duracao",
          "A aula começa às 8 horas e termina às 9 horas e 30 minutos. Quantos minutos dura a aula?",
          90,
          "Das 8 às 9 são 60 minutos; mais 30: 90 minutos.",
          {
            misreads: [
              {
                value: 130,
                feedback: "Juntou 1 hora e 30 minutos como 130; uma hora tem 60 minutos.",
              },
            ],
          },
        ),
        c(
          "duracao",
          "O filme começa às 15 horas e dura 1 hora e 45 minutos. A que horas termina?",
          "16 horas e 45 minutos",
          ["16 horas e 15 minutos", "17 horas e 45 minutos"],
          "15 h + 1 h = 16 h; mais 45 minutos: 16 h 45.",
          {
            feedback: [
              "Somou 15 minutos em vez de 45.",
              "Somou 2 horas e 45 minutos; a duração é 1 hora e 45.",
            ],
          },
        ),
        n(
          "duracao",
          "Lia saiu de casa às 7 horas e 40 minutos e chegou à escola às 8 horas e 10 minutos. Quantos minutos durou o caminho?",
          30,
          "De 7 h 40 até 8 h são 20 minutos; até 8 h 10, mais 10: 30 minutos.",
          {
            misreads: [
              {
                value: 70,
                feedback:
                  "70 subtraiu 40 de 110 como se a hora tivesse 100 minutos; passe pelas 8 horas.",
              },
            ],
          },
        ),
        c(
          "duracao",
          "Meia hora depois das 11 horas e 45 minutos são:",
          "12 horas e 15 minutos",
          ["12 horas e 5 minutos", "12 horas e 45 minutos"],
          "11 h 45 + 15 min = 12 h; mais 15 min: 12 h 15.",
          {
            feedback: [
              "12 h 05 seria somar 20 minutos; meia hora são 30.",
              "Somou uma hora inteira em vez de meia.",
            ],
          },
        ),
        n(
          "duracao",
          "Um bolo entra no forno às 16 horas e 20 minutos e precisa de 50 minutos. A que horas ele sai? Responda só os minutos do horário de saída.",
          10,
          "16 h 20 + 40 min = 17 h; mais 10 min: 17 h 10. Os minutos são 10.",
          {
            misreads: [
              { value: 70, feedback: "70 minutos passam de uma hora; o bolo sai às 17 h 10." },
            ],
          },
        ),
        c(
          "duracao",
          "Um relógio de ponteiros marca 3 horas. Quando o ponteiro grande der meia volta, que horas serão?",
          "3 horas e 30 minutos",
          ["3 horas e 6 minutos", "6 horas"],
          "Meia volta do ponteiro grande são 30 minutos.",
          {
            feedback: [
              "Meia volta do ponteiro grande são 30 minutos, não 6.",
              "Só o ponteiro pequeno indo do 3 ao 6 daria 6 horas, e isso leva 3 horas.",
            ],
          },
        ),
        n(
          "duracao",
          "Uma partida tem dois tempos de 45 minutos e um intervalo de 15 minutos. Quantos minutos dura tudo?",
          105,
          "45 + 45 + 15 = 105 minutos, ou 1 hora e 45 minutos.",
          { misreads: [{ value: 90, feedback: "90 esquece o intervalo." }] },
        ),
        c(
          "duracao",
          "São 10 horas e 50 minutos. Daqui a 25 minutos serão:",
          "11 horas e 15 minutos",
          ["11 horas e 5 minutos", "11 horas e 25 minutos"],
          "10 h 50 + 10 min = 11 h; mais 15 min: 11 h 15.",
          {
            feedback: [
              "11 h 05 seria somar 15 minutos, não 25.",
              "Somou 25 depois das 11 horas, mas 10 dos 25 minutos foram usados para chegar às 11.",
            ],
          },
        ),
      ],
    },
    {
      title: "Dias, semanas e meses",
      objective: "Contar dias entre datas, usar semanas de 7 dias e ler um calendário.",
      introduction:
        "Uma semana tem 7 dias. No calendário, os dias de uma mesma coluna são o mesmo dia da semana, sempre 7 a mais. Contar dias entre duas datas pede atenção para incluir ou não as pontas.",
      specs: [
        n(
          "calendario",
          "Hoje é dia 5. A festa é no dia 19 do mesmo mês. Quantos dias faltam?",
          14,
          "19 − 5 = 14 dias: duas semanas.",
          {
            misreads: [
              { value: 15, feedback: "15 contaria o dia de hoje também; faltam 14 dias." },
            ],
          },
        ),
        c(
          "calendario",
          "O dia 3 de um mês caiu numa quarta-feira. Em que dia da semana cai o dia 17?",
          "Quarta-feira",
          ["Quinta-feira", "Terça-feira"],
          "17 − 3 = 14, duas semanas exatas: mesmo dia da semana.",
          {
            feedback: ["Quinta seria o dia 18.", "Terça seria o dia 16."],
          },
        ),
        n(
          "calendario",
          "Um curso tem aulas às segundas e quartas durante 6 semanas. Quantas aulas são ao todo?",
          12,
          "2 aulas por semana × 6 semanas = 12.",
          {
            misreads: [
              { value: 8, feedback: "Somou 2 com 6; são 2 aulas em cada uma das 6 semanas." },
            ],
          },
        ),
        c(
          "calendario",
          "Se hoje é sexta-feira, que dia da semana foi há 9 dias?",
          "Quarta-feira",
          ["Quinta-feira", "Sábado"],
          "Há 7 dias foi sexta; há 9 dias foram 2 dias antes: quarta.",
          {
            feedback: ["Quinta foi há 8 dias.", "Sábado foi há 6 dias."],
          },
        ),
        n(
          "calendario",
          "Um mês tem 31 dias e começa numa terça-feira. Em que dia do mês cai a última terça-feira?",
          29,
          "Terças nos dias 1, 8, 15, 22 e 29; a próxima seria 36.",
          {
            misreads: [
              { value: 31, feedback: "O dia 31 é uma quinta-feira; a última terça é o dia 29." },
            ],
          },
        ),
        c(
          "calendario",
          "Ana ficou doente de 12 a 15 de março, incluindo os dois dias. Quantos dias ela ficou doente?",
          "4",
          ["3", "5"],
          "12, 13, 14 e 15: 4 dias.",
          {
            feedback: ["15 − 12 = 3 não conta o primeiro dia.", "5 contaria um dia a mais."],
          },
        ),
        n(
          "calendario",
          "Faltam 3 semanas e 4 dias para as férias. Quantos dias faltam?",
          25,
          "3 × 7 = 21; 21 + 4 = 25.",
          { misreads: [{ value: 7, feedback: "Somou 3 com 4; cada semana tem 7 dias." }] },
        ),
        c(
          "calendario",
          "Um mês tem 30 dias. Quantas semanas completas ele tem, e quantos dias sobram?",
          "4 semanas e sobram 2 dias",
          ["4 semanas e sobram 4 dias", "5 semanas exatas"],
          "4 × 7 = 28; 30 − 28 = 2.",
          {
            feedback: ["30 − 28 = 2, não 4.", "5 semanas seriam 35 dias."],
          },
        ),
      ],
    },
    {
      title: "Comprimentos",
      objective: "Medir e comparar comprimentos com centímetros e metros e somar pedaços.",
      introduction:
        "Um metro tem 100 centímetros. Para comparar comprimentos, as medidas precisam estar na mesma unidade. Pedaços em fila se somam; o que se dobra se divide.",
      specs: [
        n(
          "comprimento",
          "Uma fita tem 2 metros. Cortam-se 60 centímetros. Quantos centímetros sobram?",
          140,
          "2 metros = 200 centímetros; 200 − 60 = 140.",
          {
            misreads: [
              {
                value: 58,
                feedback:
                  "Subtraiu como se 2 metros fossem 2 centímetros; 2 metros são 200 centímetros.",
              },
            ],
          },
        ),
        c(
          "comprimento",
          "Qual é o mais comprido: um lápis de 15 centímetros, um barbante de meio metro ou um clipe de 3 centímetros?",
          "O barbante: meio metro são 50 centímetros",
          ["O lápis, porque 15 é o maior número", "O clipe"],
          "Meio metro = 50 centímetros, mais que 15 e que 3.",
          {
            feedback: [
              "Compare na mesma unidade: meio metro são 50 centímetros, mais que 15.",
              "3 centímetros é o menor dos três.",
            ],
          },
        ),
        n(
          "comprimento",
          "Três tábuas de 40 centímetros são colocadas em fila, uma encostada na outra. Qual é o comprimento total, em centímetros?",
          120,
          "3 × 40 = 120.",
          { misreads: [{ value: 43, feedback: "Somou 3 com 40; são três tábuas de 40." }] },
        ),
        c(
          "comprimento",
          "Uma corda de 6 metros é cortada em pedaços de 1 metro e meio. Quantos pedaços saem?",
          "4",
          ["3", "6"],
          "1,5 + 1,5 + 1,5 + 1,5 = 6.",
          {
            feedback: [
              "3 pedaços de 1 metro e meio dão 4 metros e meio.",
              "6 seria com pedaços de 1 metro.",
            ],
          },
        ),
        n(
          "comprimento",
          "Uma formiga anda 25 centímetros, para, e anda mais 35 centímetros na mesma direção. Quantos centímetros faltam para completar 1 metro?",
          40,
          "25 + 35 = 60; 100 − 60 = 40.",
          { misreads: [{ value: 60, feedback: "60 é o que já andou; faltam 40 para 100." }] },
        ),
        c(
          "comprimento",
          "Um lápis mede 12 centímetros e uma borracha 4 centímetros. Quantas borrachas em fila têm o comprimento do lápis?",
          "3",
          ["4", "8"],
          "4 + 4 + 4 = 12.",
          {
            feedback: [
              "4 borrachas dariam 16 centímetros.",
              "8 é a diferença entre 12 e 4, não a quantidade.",
            ],
          },
        ),
        n(
          "comprimento",
          "Um caminho tem 1 quilômetro. Um menino já andou 400 metros. Quantos metros faltam?",
          600,
          "1 quilômetro = 1.000 metros; 1.000 − 400 = 600.",
          { misreads: [{ value: 399, feedback: "Um quilômetro são 1.000 metros, não 1 metro." }] },
        ),
        c(
          "comprimento",
          "Para medir o comprimento de uma sala, a melhor unidade é:",
          "Metro",
          ["Centímetro", "Quilômetro"],
          "A sala tem alguns metros; centímetros dariam números enormes e quilômetros, números minúsculos.",
          {
            feedback: [
              "Centímetro serve para coisas pequenas, como um lápis.",
              "Quilômetro serve para distâncias entre lugares.",
            ],
          },
        ),
      ],
    },
    {
      title: "Peso e capacidade",
      objective: "Comparar massas e capacidades, usar quilos, gramas, litros e mililitros.",
      introduction:
        "Um quilo tem 1.000 gramas e um litro tem 1.000 mililitros. Meio quilo são 500 gramas; meio litro são 500 mililitros. Comparar exige a mesma unidade.",
      specs: [
        n(
          "massa",
          "Um pacote de arroz tem 1 quilo e um de feijão tem 500 gramas. Quantos gramas pesam os dois juntos?",
          1500,
          "1.000 + 500 = 1.500 gramas.",
          { misreads: [{ value: 501, feedback: "1 quilo são 1.000 gramas, não 1 grama." }] },
        ),
        c(
          "capacidade",
          "Uma jarra tem 2 litros. Quantos copos de 250 mililitros ela enche?",
          "8",
          ["4", "2"],
          "2 litros = 2.000 mililitros; 2.000 ÷ 250 = 8.",
          {
            feedback: ["4 copos seriam 1 litro.", "2 é o número de litros, não de copos."],
          },
        ),
        n(
          "massa",
          "Uma caixa vazia pesa 300 gramas. Dentro dela há 4 latas de 200 gramas. Quanto pesa a caixa cheia, em gramas?",
          1100,
          "4 × 200 = 800; 800 + 300 = 1.100 gramas.",
          {
            misreads: [
              { value: 800, feedback: "800 é só o peso das latas; a caixa vazia pesa 300." },
            ],
          },
        ),
        c(
          "massa",
          "O que pesa mais: 1 quilo de algodão ou 1 quilo de pregos?",
          "Pesam o mesmo",
          ["Os pregos", "O algodão"],
          "1 quilo é 1 quilo; o algodão só ocupa mais espaço.",
          {
            feedback: [
              "Os pregos são pesados para o tamanho deles, mas a quantidade é a mesma: 1 quilo.",
              "O algodão é maior em tamanho, não em peso.",
            ],
          },
        ),
        n(
          "capacidade",
          "Uma garrafa de 1 litro e meio é dividida igualmente em 3 copos. Quantos mililitros vão em cada copo?",
          500,
          "1.500 ÷ 3 = 500 mililitros.",
          { misreads: [{ value: 5, feedback: "1 litro e meio são 1.500 mililitros, não 15." }] },
        ),
        c(
          "massa",
          "Uma balança de dois pratos está equilibrada com uma melancia de um lado e, do outro, dois pesos de 2 quilos e um de 500 gramas. Quanto pesa a melancia?",
          "4 quilos e meio",
          ["4 quilos", "2 quilos e meio"],
          "2 + 2 = 4 quilos; mais 500 gramas: 4 quilos e meio.",
          {
            feedback: ["Esqueceu os 500 gramas.", "Contou só um peso de 2 quilos."],
          },
        ),
        n(
          "capacidade",
          "Um balde de 10 litros é enchido com uma caneca de 500 mililitros. Quantas canecas são necessárias?",
          20,
          "10 litros = 10.000 mililitros; 10.000 ÷ 500 = 20.",
          { misreads: [{ value: 2, feedback: "2 canecas dão só 1 litro." }] },
        ),
        c(
          "capacidade",
          "Qual recipiente cabe mais água: um copo de 300 mililitros, uma garrafa de meio litro ou uma xícara de 200 mililitros?",
          "A garrafa, com 500 mililitros",
          ["O copo, porque 300 é o maior número", "A xícara"],
          "Meio litro = 500 mililitros, mais que 300 e que 200.",
          {
            feedback: [
              "Meio litro são 500 mililitros, mais que 300.",
              "200 mililitros é o menor dos três.",
            ],
          },
        ),
      ],
    },
    {
      title: "Medir para resolver",
      objective:
        "Escolher a unidade e a conta certas em problemas com tempo, comprimento, peso e capacidade.",
      introduction:
        "Um problema de medida pede três decisões: que grandeza é (tempo, comprimento, peso, capacidade), que unidade usar e que conta fazer. Uma estimativa antes da conta ajuda a perceber erros.",
      estimatedMinutes: 18,
      specs: [
        n(
          "resolver",
          "Uma receita pede 250 gramas de farinha. O pacote tem 1 quilo. Quantas receitas dá para fazer com o pacote?",
          4,
          "1.000 ÷ 250 = 4.",
          {
            misreads: [
              {
                value: 250,
                feedback: "250 é a quantidade por receita; o pacote tem 1.000 gramas.",
              },
            ],
          },
        ),
        c(
          "resolver",
          "Um ônibus passa a cada 20 minutos. O primeiro passa às 6 horas. Quantos ônibus passam até as 8 horas, contando o das 6 e o das 8?",
          "7",
          ["6", "8"],
          "Das 6 às 8 são 120 minutos, 6 intervalos de 20: 6 + 1 = 7 ônibus.",
          {
            feedback: [
              "6 é o número de intervalos; há um ônibus a mais que intervalos.",
              "8 contaria um ônibus depois das 8 horas.",
            ],
          },
        ),
        n(
          "resolver",
          "Uma piscina infantil recebe 30 litros por minuto. Quantos minutos leva para colocar 600 litros?",
          20,
          "600 ÷ 30 = 20 minutos.",
          {
            misreads: [
              { value: 570, feedback: "Subtraiu; a pergunta é quantos grupos de 30 cabem em 600." },
            ],
          },
        ),
        c(
          "resolver",
          "Um cachorro pesa 12 quilos e um gato pesa 4 quilos. Quantas vezes o cachorro é mais pesado que o gato?",
          "3 vezes",
          ["8 vezes", "16 vezes"],
          "12 ÷ 4 = 3.",
          {
            feedback: ["8 é a diferença em quilos, não quantas vezes.", "16 é a soma dos pesos."],
          },
        ),
        n(
          "resolver",
          "Uma corrida começa às 9 horas. Bia terminou 1 hora e 20 minutos depois; Caio terminou às 10 horas e 5 minutos. Quantos minutos antes de Bia Caio terminou?",
          15,
          "Bia terminou às 10 h 20; Caio às 10 h 05: 15 minutos antes.",
          {
            misreads: [
              {
                value: 5,
                feedback: "5 são os minutos do horário de Caio; a diferença para 10 h 20 é 15.",
              },
            ],
          },
        ),
        c(
          "resolver",
          "Uma estimativa: quanto pesa uma maçã comum?",
          "Cerca de 150 gramas",
          ["Cerca de 15 gramas", "Cerca de 1 quilo e meio"],
          "Seis ou sete maçãs dão um quilo; cada uma tem em torno de 150 gramas.",
          {
            feedback: [
              "15 gramas é o peso de uma colher de açúcar.",
              "1 quilo e meio é o peso de uma melancia pequena.",
            ],
          },
        ),
        n(
          "resolver",
          "Uma fita de 3 metros será cortada em pedaços de 50 centímetros para laços. Quantos laços saem?",
          6,
          "300 ÷ 50 = 6.",
          { misreads: [{ value: 60, feedback: "3 metros são 300 centímetros, e 300 ÷ 50 = 6." }] },
        ),
        c(
          "resolver",
          "Um menino disse que sua sala de aula tem 8 centímetros de comprimento. O que está errado?",
          "A unidade: uma sala tem cerca de 8 metros; 8 centímetros é o tamanho de um dedo",
          [
            "Nada; salas pequenas têm 8 centímetros",
            "O número: deveria ser 800 centímetros de largura, não de comprimento",
          ],
          "Estimar antes de medir evita trocar metro por centímetro.",
          {
            feedback: [
              "8 centímetros não cabe nem uma cadeira.",
              "800 centímetros é o mesmo que 8 metros; o erro é a unidade, não a direção.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Coloque em ordem os passos para calcular a que horas algo termina.",
    labels: [
      "Anotar o horário de início",
      "Somar os minutos até completar a hora seguinte",
      "Somar o tempo que ainda falta depois da hora cheia",
      "Conferir se os minutos ficaram abaixo de 60",
    ],
    explanation:
      "Passar pela hora cheia evita errar com minutos acima de 60; a conferência pega o erro de 11 h 75.",
  },
  justification: {
    prompts: [
      "Explique como descobrir quanto tempo passou das 7 h 40 até as 8 h 10, sem usar '110 − 40'.",
      "Por que 1 quilo de algodão pesa o mesmo que 1 quilo de pregos? Explique com suas palavras.",
      "Um mês de 30 dias começa numa segunda. Explique como descobrir quantas segundas ele tem.",
    ],
    samples: [
      "Das 7 h 40 até as 8 h em ponto faltam 20 minutos, porque 40 + 20 = 60. Das 8 h até as 8 h 10 são mais 10 minutos. Então 20 + 10 = 30 minutos. Fazer 110 − 40 trata a hora como se tivesse 100 minutos, e ela tem 60.",
      "Quilo é uma medida de peso, e 1 quilo é sempre 1 quilo. O algodão é fofo e ocupa um saco enorme; os pregos ficam num saquinho. Muda o tamanho, não o peso. Na balança os dois ficam equilibrados.",
      "As segundas ficam de 7 em 7 dias: 1, 8, 15, 22, 29. A próxima seria 36, e o mês só vai até 30. Então são 5 segundas. Dá para conferir: 4 semanas são 28 dias e sobram os dias 29 e 30, que são segunda e terça.",
    ],
    focus: "a unidade e a passagem pela hora cheia",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const horaInicio = 7 + (seed % 9);
      const minutoInicio = 5 * (5 + (seed % 7));
      const duracao = 5 * (8 + (seed % 9));
      const totalMinutos = minutoInicio + duracao;
      const horas = Math.floor(totalMinutos / 60);
      const horaFim = horaInicio + horas;
      const minutoFim = totalMinutos % 60;
      const dois = (v: number) => String(v).padStart(2, "0");
      const horaErrada = `${dois(horaFim + 1)}h${dois(minutoFim)}`;
      const outraErrada = `${dois(horaFim)}h${dois((minutoFim + 10) % 60)}`;
      return c(
        "hora-de-termino",
        `Uma atividade começa às ${dois(horaInicio)}h${dois(minutoInicio)} e dura ${duracao} minutos. A que horas ela termina?`,
        `${dois(horaFim)}h${dois(minutoFim)}`,
        [horaErrada, outraErrada],
        `${minutoInicio} + ${duracao} = ${totalMinutos} minutos, ou seja, ${horas} hora${horas > 1 ? "s" : ""}${minutoFim > 0 ? ` e ${minutoFim} minutos` : ""} depois das ${horaInicio} horas: ${dois(horaFim)}h${dois(minutoFim)}.`,
        {
          feedback: [
            "Somou uma hora a mais.",
            "Errou os minutos por 10; refaça a soma passando pela hora cheia.",
          ],
        },
      );
    }
    if (variant === 1) {
      const metros = 2 + (seed % 5);
      const pedaco = [20, 25, 50][seed % 3] ?? 25;
      const pedacos = (metros * 100) / pedaco;
      return c(
        "pedacos-de-fita",
        `Uma fita de ${metros} metros é cortada em pedaços de ${pedaco} centímetros. Quantos pedaços saem?`,
        `${pedacos}`,
        [`${pedacos * 10}`, `${metros}`],
        `${metros} metros = ${metros * 100} centímetros; ${metros * 100} ÷ ${pedaco} = ${pedacos}.`,
        {
          feedback: [
            "Tratou cada metro como 1.000 centímetros; um metro tem 100.",
            "Esse é o número de metros, não de pedaços.",
          ],
        },
      );
    }
    const litros = 2 + (seed % 4);
    const copo = [200, 250, 500][seed % 3] ?? 250;
    const copos = (litros * 1000) / copo;
    return c(
      "copos-na-jarra",
      `Uma jarra tem ${litros} litros. Quantos copos de ${copo} mililitros ela enche?`,
      `${copos}`,
      [`${copos - litros}`, `${copos * 10}`],
      `${litros} litros = ${litros * 1000} mililitros; ${litros * 1000} ÷ ${copo} = ${copos}.`,
      {
        feedback: [
          "Não confere: divida os mililitros da jarra pelos mililitros do copo.",
          "Tratou cada litro como 10.000 mililitros; um litro tem 1.000.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "tempo-e-medidas",
    title: "Um dia medido",
    prompt:
      "Registre um dia seu com medidas: a que horas cada coisa começou e terminou, quanto durou, e meça três objetos da casa com régua ou fita métrica, escolhendo a unidade certa.",
    lab: "bars",
    steps: [
      "Anote horários de início e fim de pelo menos quatro atividades e calcule a duração de cada uma.",
      "Meça três objetos e escreva a medida com a unidade certa (centímetros ou metros).",
      "Some as durações e diga quanto do dia elas ocuparam.",
    ],
    rubric: [
      "Horários e durações calculadas passando pela hora cheia (0–3)",
      "Três medidas com unidade adequada (0–2)",
      "Soma das durações correta (0–2)",
      "Registro organizado e legível (0–1)",
    ],
  },
  homeSupport: [
    "Na cozinha, peçam para a criança calcular a que horas o forno deve ser desligado e conferir no relógio.",
    "Ao comprar frutas ou bebidas, comparem pesos e volumes nas embalagens: qual pesa mais, qual cabe mais.",
  ],
};
