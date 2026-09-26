import { c, n, decimal as real, type SkillPack } from "../skill-factory";

/**
 * Orçamento para 8º/9º: receitas e despesas, custos fixos e variáveis,
 * restrições, escolhas com o mesmo dinheiro (custo de oportunidade),
 * reserva de emergência e metas com prazo. Trilha OLITEF N2.
 */
export const orcamentoN2: SkillPack = {
  id: "orcamento-n2",
  name: "Orçamento e escolhas",
  domain: "olitef",
  lab: "bars",
  missions: [
    {
      title: "Entradas, saídas e o que sobra",
      objective: "Montar um orçamento simples e calcular o saldo.",
      introduction:
        "Orçamento é uma lista honesta: tudo o que entra, tudo o que sai e o que sobra ou falta. Comece pelo que é fixo e só depois pelo que varia.",
      specs: [
        n(
          "saldo",
          "Uma família recebe R$ 4.200 por mês e gasta R$ 1.500 de aluguel, R$ 1.100 de alimentação, R$ 600 de transporte e R$ 700 em outras despesas. Quanto sobra no mês, em reais?",
          300,
          "4.200 − (1.500 + 1.100 + 600 + 700) = 4.200 − 3.900 = 300.",
          { misreads: [{ value: 1000, feedback: "Esqueceu as outras despesas de 700." }] },
        ),
        c(
          "fixo-e-variavel",
          "Qual destas despesas é fixa, ou seja, tem o mesmo valor todo mês?",
          "Mensalidade da escola",
          ["Conta de luz", "Lanches na rua"],
          "A mensalidade é combinada em contrato; luz e lanches variam com o uso.",
          {
            feedback: [
              "A conta de luz muda conforme o consumo.",
              "Lanches dependem de quantas vezes se compra.",
            ],
          },
        ),
        n(
          "saldo",
          "Um jovem recebe R$ 120 de mesada e ganha R$ 80 ajudando em uma loja. Gasta R$ 90 com transporte e R$ 60 com lazer. Qual é o saldo do mês, em reais?",
          50,
          "Entradas: 200; saídas: 150; saldo 50.",
          { misreads: [{ value: -30, feedback: "Esqueceu os 80 reais ganhos na loja." }] },
        ),
        c(
          "saldo",
          "Se as despesas de uma família somam R$ 3.950 e a renda é R$ 3.800, o orçamento está:",
          "Com déficit de R$ 150",
          ["Com sobra de R$ 150", "Equilibrado"],
          "Sai mais do que entra: 3.800 − 3.950 = −150.",
          {
            feedback: [
              "Sobra exigiria renda maior que as despesas.",
              "Equilibrado seria renda igual às despesas.",
            ],
          },
        ),
        n(
          "porcentagem-do-orcamento",
          "Em uma renda de R$ 5.000, a moradia custa R$ 1.750. Que porcentagem da renda vai para moradia?",
          35,
          "1.750 ÷ 5.000 = 0,35 = 35%.",
          { misreads: [{ value: 17.5, feedback: "Dividiu por 10.000 em vez de por 5.000." }] },
        ),
        c(
          "fixo-e-variavel",
          "Uma família quer reduzir gastos rapidamente. Onde o corte costuma ter efeito mais rápido?",
          "Nas despesas variáveis, como delivery e lazer, que dependem de decisões de cada dia",
          ["No aluguel, que é a maior despesa", "Nas mensalidades já contratadas para o ano"],
          "Despesas fixas exigem renegociar contratos; as variáveis mudam na hora.",
          {
            feedback: [
              "Mudar de casa ou renegociar aluguel leva tempo.",
              "Mensalidades contratadas não caem no mês seguinte.",
            ],
          },
        ),
        n(
          "saldo",
          "Uma família economiza R$ 250 por mês. Em quantos meses junta R$ 3.000?",
          12,
          "3.000 ÷ 250 = 12 meses.",
          { misreads: [{ value: 10, feedback: "10 meses juntam 2.500." }] },
        ),
        c(
          "porcentagem-do-orcamento",
          "Uma regra comum sugere até 30% da renda para moradia. Com renda de R$ 3.600, o aluguel deveria ficar em no máximo:",
          "R$ 1.080",
          ["R$ 1.200", "R$ 108"],
          "30% de 3.600 = 1.080.",
          {
            feedback: ["R$ 1.200 é um terço, cerca de 33%.", "R$ 108 é 3%, não 30%."],
          },
        ),
      ],
    },
    {
      title: "O mesmo dinheiro, dois caminhos",
      objective: "Comparar alternativas e reconhecer o que se deixa de lado em cada escolha.",
      introduction:
        "Cada real gasto em uma coisa é um real que não vai para outra. Escolher bem é saber o que se deixa de lado, não só o que se ganha.",
      specs: [
        c(
          "custo-de-oportunidade",
          "Com R$ 60, um estudante pode comprar um jogo ou guardar para um passeio de R$ 180 daqui a três meses. Se compra o jogo, o que ele deixa de lado?",
          "Um terço do passeio, que agora exige mais tempo ou mais dinheiro",
          ["Nada, porque o dinheiro era dele", "O passeio inteiro"],
          "Os 60 reais eram um terço dos 180; o passeio não some, mas fica mais distante.",
          {
            feedback: [
              "Ser dono do dinheiro não elimina a escolha entre os dois usos.",
              "Ele deixou de lado uma parte do passeio, não o passeio todo.",
            ],
          },
        ),
        n(
          "custo-de-oportunidade",
          "Um lanche na rua custa R$ 18 e um lanche de casa custa R$ 6. Quem troca o lanche de rua pelo de casa 20 vezes por mês economiza quanto, em reais?",
          240,
          "(18 − 6) × 20 = 240.",
          {
            misreads: [
              { value: 360, feedback: "360 é o gasto total com lanche de rua, não a economia." },
            ],
          },
        ),
        c(
          "comparar-alternativas",
          "Duas opções de transporte para a escola: ônibus a R$ 5 por dia, 22 dias por mês, ou passe mensal de R$ 95. A opção mais barata é:",
          "O passe: R$ 95 contra R$ 110",
          ["O ônibus diário, porque R$ 5 é pouco", "As duas custam o mesmo"],
          "5 × 22 = 110, mais que 95.",
          {
            feedback: ["R$ 5 por dia somam R$ 110 no mês.", "110 e 95 são diferentes."],
          },
        ),
        n(
          "comparar-alternativas",
          "Uma assinatura custa R$ 30 por mês ou R$ 300 por ano. Quem paga o plano anual economiza quanto em um ano, em reais?",
          60,
          "12 × 30 = 360; 360 − 300 = 60.",
          {
            misreads: [
              { value: 30, feedback: "30 é uma mensalidade; a economia é sobre 12 meses." },
            ],
          },
        ),
        c(
          "custo-de-oportunidade",
          "Uma família guarda R$ 200 por mês para uma viagem. Se decidir gastar R$ 600 em um fim de semana agora, a viagem:",
          "Atrasa três meses, ou exige guardar mais por mês",
          ["Não muda, porque os R$ 200 mensais continuam", "É cancelada"],
          "600 ÷ 200 = 3 meses de poupança gastos de outra forma.",
          {
            feedback: [
              "Os 600 gastos eram três meses de poupança da viagem.",
              "A viagem não precisa ser cancelada; ela fica mais distante.",
            ],
          },
        ),
        n(
          "comparar-alternativas",
          "Uma família compara um carro que gasta R$ 480 de combustível por mês com o transporte por aplicativo, que custaria R$ 620. O carro também tem R$ 250 mensais de seguro e manutenção. Qual é a diferença mensal, em reais, entre a opção mais cara e a mais barata?",
          110,
          "Carro: 480 + 250 = 730; aplicativo: 620; diferença 110.",
          {
            misreads: [
              {
                value: 140,
                feedback:
                  "140 compara só combustível com aplicativo e esquece seguro e manutenção.",
              },
            ],
          },
        ),
        c(
          "custo-de-oportunidade",
          "Um estudante tem 2 horas livres por dia e pode estudar para uma bolsa ou trabalhar por R$ 15 a hora. Se estudar, o custo de oportunidade diário é:",
          "R$ 30 que deixaria de ganhar",
          ["Zero, porque estudar é grátis", "R$ 15"],
          "2 horas × 15 = 30 reais não recebidos.",
          {
            feedback: [
              "Estudar não custa dinheiro, mas custa o que se deixaria de ganhar no mesmo tempo.",
              "R$ 15 é uma hora só; são duas.",
            ],
          },
        ),
        c(
          "comparar-alternativas",
          "Para escolher entre dois planos de internet, o que importa comparar?",
          "Custo total no período do contrato, incluindo taxas de instalação e de cancelamento",
          ["Só a mensalidade anunciada", "Só a velocidade"],
          "Taxas e prazos mudam o custo real; velocidade importa, mas não decide o custo.",
          {
            feedback: [
              "Uma mensalidade menor com taxa de instalação alta pode custar mais.",
              "Velocidade é um critério de qualidade, não de custo.",
            ],
          },
        ),
      ],
    },
    {
      title: "Restrições e prioridades",
      objective: "Resolver problemas de orçamento com limite e ordem de prioridade.",
      introduction:
        "Com um teto de gastos, nem tudo cabe. Liste as opções, marque o que é essencial e veja o que ainda cabe no que sobra.",
      specs: [
        n(
          "restricao-de-orcamento",
          "Uma festa tem orçamento de R$ 800. O salão custa R$ 350 e o bolo R$ 120. Quanto sobra para o restante, em reais?",
          330,
          "800 − 350 − 120 = 330.",
          { misreads: [{ value: 450, feedback: "Esqueceu o bolo." }] },
        ),
        c(
          "restricao-de-orcamento",
          "Com R$ 50, um estudante quer comprar um caderno de R$ 18, uma caneta de R$ 6, um livro de R$ 32 e um estojo de R$ 15. Levando primeiro o essencial (caderno e caneta), o que mais cabe?",
          "Só o estojo",
          ["O livro", "O livro e o estojo"],
          "18 + 6 = 24; sobram 26: o livro (32) não cabe, o estojo (15) cabe.",
          {
            feedback: [
              "O livro custa 32, mais que os 26 restantes.",
              "Livro e estojo somam 47, mais que 26.",
            ],
          },
        ),
        n(
          "restricao-de-orcamento",
          "Uma escola tem R$ 2.400 para comprar livros de R$ 45 cada. Quantos livros consegue comprar?",
          53,
          "2.400 ÷ 45 = 53,3; cabem 53 livros, e sobram R$ 15.",
          {
            misreads: [{ value: 54, feedback: "54 livros custariam 2.430, mais que o orçamento." }],
          },
        ),
        c(
          "prioridade",
          "Em um mês apertado, uma família precisa escolher o que pagar primeiro. A ordem mais prudente é:",
          "Contas com corte ou juros altos (luz, água, cartão), depois despesas essenciais, depois lazer",
          ["Lazer primeiro, porque é o que mais atrasa", "Todas em partes iguais"],
          "Atrasar cartão ou luz gera juros e corte; lazer pode esperar.",
          {
            feedback: [
              "Lazer não gera juros nem corte de serviço.",
              "Pagar tudo em parte deixa juros correndo em todas.",
            ],
          },
        ),
        n(
          "restricao-de-orcamento",
          "Um jovem tem R$ 90 por mês para lazer. Cinema custa R$ 25 e um jogo online custa R$ 40 por mês. Se assina o jogo, quantas vezes pode ir ao cinema no mês?",
          2,
          "90 − 40 = 50; 50 ÷ 25 = 2 vezes.",
          { misreads: [{ value: 3, feedback: "3 idas custariam 75, mais que os 50 restantes." }] },
        ),
        c(
          "restricao-de-orcamento",
          "Uma viagem custa R$ 1.500. A família tem R$ 900 e consegue guardar R$ 150 por mês. Ela consegue viajar sem dívida daqui a:",
          "4 meses",
          ["6 meses", "10 meses"],
          "Faltam 600; 600 ÷ 150 = 4 meses.",
          {
            feedback: [
              "6 meses juntariam 900, mais que os 600 que faltam.",
              "10 meses seria guardar os 1.500 do zero.",
            ],
          },
        ),
        n(
          "restricao-de-orcamento",
          "Uma cantina vende suco a R$ 4 e salgado a R$ 6. Com R$ 30, qual é o maior número de itens que dá para comprar levando ao menos um de cada?",
          7,
          "Um salgado (6) e o resto em sucos: 24 ÷ 4 = 6 sucos; total 7 itens.",
          { misreads: [{ value: 5, feedback: "5 seria comprar só salgados." }] },
        ),
        c(
          "prioridade",
          "Uma família recebe R$ 500 inesperados e tem uma dívida de R$ 400 a 10% ao mês. O uso mais vantajoso é:",
          "Quitar a dívida e guardar os R$ 100 restantes",
          [
            "Guardar tudo na poupança, que rende 0,5% ao mês",
            "Gastar em lazer, porque foi inesperado",
          ],
          "A dívida custa 40 reais por mês; a poupança renderia 2,50.",
          {
            feedback: [
              "A poupança rende muito menos do que a dívida custa.",
              "Enquanto isso a dívida cresce 40 reais por mês.",
            ],
          },
        ),
      ],
    },
    {
      title: "Metas com prazo",
      objective: "Planejar quanto guardar por mês para uma meta e ajustar quando algo muda.",
      introduction:
        "Uma meta tem valor e prazo. Dividir um pelo outro dá o esforço mensal; quando o plano muda, refaça a conta em vez de desistir.",
      specs: [
        n(
          "meta",
          "Uma família quer R$ 6.000 para uma reforma em 15 meses. Quanto precisa guardar por mês, em reais?",
          400,
          "6.000 ÷ 15 = 400.",
          { misreads: [{ value: 500, feedback: "500 por mês juntaria 6.000 em 12 meses." }] },
        ),
        c(
          "meta",
          "Um estudante guarda R$ 80 por mês para um violão de R$ 720. Depois de 4 meses, o preço sobe para R$ 800. Quantos meses a mais ele vai precisar?",
          1,
          [2, 4],
          "Sem a alta: 9 meses. Com 800: 10 meses. Um mês a mais.",
          {
            feedback: [
              "Os 80 reais de aumento são exatamente uma mensalidade.",
              "4 meses seria se o preço subisse 320.",
            ],
          },
        ),
        n(
          "meta",
          "Uma meta de R$ 2.400 em 8 meses exigia R$ 300 por mês. Nos dois primeiros meses só foi possível guardar R$ 150 em cada. Quanto por mês nos 6 meses restantes, em reais?",
          350,
          "Guardados 300; faltam 2.100 em 6 meses: 350.",
          { misreads: [{ value: 300, feedback: "Manter 300 deixaria 300 faltando no fim." }] },
        ),
        c(
          "reserva-de-emergencia",
          "Uma família gasta R$ 3.000 por mês. Uma reserva de emergência de três meses de gastos é:",
          "R$ 9.000",
          ["R$ 3.000", "R$ 900"],
          "3 × 3.000 = 9.000.",
          {
            feedback: ["R$ 3.000 cobre um mês só.", "R$ 900 são 30% de um mês."],
          },
        ),
        n(
          "reserva-de-emergencia",
          "Uma família quer uma reserva de R$ 9.000 e já tem R$ 3.600. Guardando R$ 450 por mês, em quantos meses completa?",
          12,
          "Faltam 5.400; 5.400 ÷ 450 = 12 meses.",
          { misreads: [{ value: 20, feedback: "20 meses seria guardar os 9.000 do zero." }] },
        ),
        c(
          "meta",
          "Um jovem tem duas metas: fone de R$ 240 e curso de R$ 600. Guarda R$ 120 por mês. Se comprar o fone primeiro, o curso vem em:",
          "7 meses, contando desde o início",
          ["5 meses", "2 meses"],
          "Fone: 2 meses; curso: mais 5 meses; total 7 desde o início.",
          {
            feedback: [
              "5 meses é só o tempo do curso, sem contar os 2 do fone.",
              "2 meses é o tempo do fone.",
            ],
          },
        ),
        n(
          "meta",
          "Uma família guarda R$ 300 por mês. Um imprevisto de R$ 900 é pago com a poupança. Quantos meses de poupança foram consumidos?",
          3,
          "900 ÷ 300 = 3 meses.",
          {
            misreads: [{ value: 900, feedback: "900 é o valor em reais; a pergunta pede meses." }],
          },
        ),
        c(
          "reserva-de-emergencia",
          "A principal função de uma reserva de emergência é:",
          "Cobrir imprevistos sem precisar de empréstimo com juros altos",
          ["Render mais que outros investimentos", "Pagar as férias da família"],
          "A reserva compra tempo em uma emergência e evita dívida cara.",
          {
            feedback: [
              "Reserva precisa estar disponível, mesmo rendendo pouco.",
              "Férias são meta planejada, não emergência.",
            ],
          },
        ),
      ],
    },
    {
      title: "Orçamento para decidir",
      objective: "Analisar um orçamento completo e propor ajustes com justificativa.",
      introduction:
        "Um bom ajuste diz o que muda, quanto rende e o que se perde com isso. Trabalhe com os números da própria família e não com médias.",
      estimatedMinutes: 18,
      specs: [
        n(
          "analise-de-orcamento",
          "Renda R$ 4.000: moradia R$ 1.400, alimentação R$ 1.000, transporte R$ 500, educação R$ 400, lazer R$ 450, outros R$ 350. Quanto falta ou sobra? Responda com sinal negativo se faltar.",
          -100,
          "Despesas: 4.100; renda 4.000; faltam 100.",
          { misreads: [{ value: 100, feedback: "Sai mais do que entra: o saldo é negativo." }] },
        ),
        c(
          "analise-de-orcamento",
          "No orçamento anterior, o ajuste mais realista para fechar o mês sem dívida é:",
          "Reduzir lazer e outros em cerca de R$ 100 no total",
          ["Cortar a educação", "Parar de pagar a moradia por um mês"],
          "Lazer e outros são variáveis e somam 800; 100 a menos fecha a conta.",
          {
            feedback: [
              "Educação é investimento com efeito de longo prazo; há despesas variáveis para ajustar antes.",
              "Atrasar moradia gera multa e risco de perder a casa.",
            ],
          },
        ),
        n(
          "analise-de-orcamento",
          "Uma família gasta R$ 320 por mês em delivery. Se reduzir para R$ 120 e guardar a diferença, quanto junta em um ano, em reais?",
          2400,
          "(320 − 120) × 12 = 2.400.",
          { misreads: [{ value: 200, feedback: "200 é a economia de um mês só." }] },
        ),
        c(
          "analise-de-orcamento",
          "A renda de uma família caiu 10%, de R$ 5.000 para R$ 4.500, e as despesas eram R$ 4.800. Para voltar ao equilíbrio, as despesas precisam cair, no mínimo:",
          "R$ 300, cerca de 6,25%",
          ["10%", "R$ 500"],
          "4.800 − 4.500 = 300; 300 ÷ 4.800 é cerca de 6,25%.",
          {
            feedback: [
              "10% das despesas seriam 480, mais do que o necessário.",
              "R$ 500 é a queda da renda, não o corte necessário, porque havia sobra de 200.",
            ],
          },
        ),
        n(
          "analise-de-orcamento",
          "Uma família quer que o lazer represente 10% da renda de R$ 4.800. Hoje gasta R$ 720 em lazer. Quanto precisa reduzir, em reais?",
          240,
          "10% de 4.800 = 480; 720 − 480 = 240.",
          { misreads: [{ value: 480, feedback: "480 é o valor-alvo, não a redução." }] },
        ),
        c(
          "analise-de-orcamento",
          "Ao receber um aumento de R$ 400, a decisão que mais fortalece o orçamento é:",
          "Destinar parte a reserva e metas antes de ampliar gastos fixos",
          ["Assumir uma nova parcela de R$ 400", "Aumentar todas as despesas em 10%"],
          "Gastos fixos novos comprometem o aumento inteiro; reserva e metas dão margem.",
          {
            feedback: [
              "Uma parcela igual ao aumento deixa o orçamento tão apertado quanto antes.",
              "Aumentar tudo dilui o ganho sem criar margem.",
            ],
          },
        ),
        n(
          "analise-de-orcamento",
          "Um casal divide as despesas de R$ 3.600 proporcionalmente às rendas, de R$ 4.000 e R$ 2.000. Quanto paga quem ganha R$ 4.000, em reais?",
          2400,
          "A renda total é 6.000; quem ganha 4.000 paga 2/3 de 3.600 = 2.400.",
          {
            misreads: [{ value: 1800, feedback: "1.800 divide ao meio, sem proporção às rendas." }],
          },
        ),
        c(
          "analise-de-orcamento",
          "Uma afirmação verdadeira sobre orçamento familiar é:",
          "Registrar gastos pequenos e frequentes costuma revelar onde o dinheiro escapa",
          ["Só despesas grandes importam", "Quem ganha pouco não precisa de orçamento"],
          "Gastos pequenos repetidos somam muito no mês; o orçamento é mais útil justamente quando a renda é apertada.",
          {
            feedback: [
              "Gastos pequenos repetidos somam valores altos.",
              "Com renda apertada cada real importa mais, não menos.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize um método para montar o orçamento de um mês.",
    labels: [
      "Listar todas as entradas de dinheiro do mês",
      "Listar as despesas fixas e estimar as variáveis",
      "Calcular o saldo e separar reserva e metas",
      "Acompanhar os gastos durante o mês e ajustar o que sair do previsto",
    ],
    explanation:
      "Entradas primeiro, depois saídas fixas e variáveis; o saldo define reserva e metas, e o acompanhamento corrige o plano no meio do caminho.",
  },
  justification: {
    prompts: [
      "Explique o que é custo de oportunidade usando uma escolha real que você fez com o seu dinheiro ou o seu tempo.",
      "Um colega diz que reserva de emergência é desperdício porque rende pouco. Explique para que ela serve e por que render pouco não é o ponto.",
      "Mostre como ajustar uma meta de R$ 1.800 em 6 meses quando, no terceiro mês, só foi possível guardar metade do planejado, e justifique a nova conta.",
    ],
    samples: [
      "Custo de oportunidade é o melhor uso que deixei de lado ao escolher outro. Quando gastei R$ 40 em um jogo, deixei de lado guardar R$ 40 para o fone de R$ 200 que eu queria: o fone ficou um mês mais distante. O jogo não custou só R$ 40, custou também esse mês.",
      "A reserva serve para pagar um imprevisto sem pegar empréstimo com juros altos. Se um conserto de R$ 600 aparece e não há reserva, a família pode parcelar no cartão a 10% ao mês e pagar bem mais. A reserva rende pouco porque precisa estar disponível na hora; o ganho dela é a dívida que ela evita.",
      "O plano era R$ 300 por mês. Nos dois primeiros meses foram guardados 600; no terceiro, só 150, somando 750. Faltam 1.050 para os três meses restantes: 350 por mês. A conta refaz o prazo com o que falta, em vez de repetir o valor antigo e chegar ao fim com 150 a menos.",
    ],
    focus: "a relação entre entradas, saídas e o que se deixa de lado em cada escolha",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const renda = 100 * (30 + (seed % 21));
      const moradia = 100 * (10 + (seed % 7));
      const alimentacao = 100 * (8 + (seed % 5));
      const transporte = 50 * (6 + (seed % 7));
      const outras = 50 * (4 + (seed % 9));
      const saldo = renda - moradia - alimentacao - transporte - outras;
      const texto = (v: number) =>
        v === 0
          ? "Fecha em zero, nem sobra nem falta"
          : `${v < 0 ? "Faltam" : "Sobram"} R$ ${real(Math.abs(v))}`;
      return c(
        "saldo-do-mes",
        `Uma família recebe R$ ${real(renda)} por mês e gasta R$ ${real(moradia)} de moradia, R$ ${real(alimentacao)} de alimentação, R$ ${real(transporte)} de transporte e R$ ${real(outras)} em outras despesas. Qual é o saldo do mês?`,
        texto(saldo),
        [texto(saldo + outras), texto(saldo + outras + transporte)],
        `${real(renda)} − (${real(moradia)} + ${real(alimentacao)} + ${real(transporte)} + ${real(outras)}) = ${real(saldo).replace("-", "−")}.`,
        {
          feedback: [
            "Esqueceu as outras despesas na soma.",
            "Esqueceu o transporte e as outras despesas na soma.",
          ],
        },
      );
    }
    if (variant === 1) {
      const diaria = 3 + (seed % 5);
      const dias = 18 + (seed % 7);
      const passe = diaria * dias - 5 * (2 + (seed % 6));
      return c(
        "diaria-ou-passe",
        `Ir de ônibus custa R$ ${diaria} por dia, em ${dias} dias no mês; o passe mensal custa R$ ${passe}. Quanto economiza no mês quem escolhe a opção mais barata?`,
        `R$ ${diaria * dias - passe}, com o passe`,
        [`R$ ${diaria * dias - passe}, com o ônibus diário`, `R$ ${diaria}, com o passe`],
        `${diaria} × ${dias} = ${diaria * dias}, mais que ${passe}; a diferença é ${diaria * dias - passe}.`,
        {
          feedback: [
            "O valor da economia está certo, mas a opção mais barata é o passe.",
            "A economia é a diferença entre os totais do mês, não uma diária.",
          ],
        },
      );
    }
    const meta = 100 * (12 + (seed % 25));
    const meses = 4 + (seed % 9);
    const guardado = 100 * (1 + (seed % 4));
    const porMes = (meta - guardado) / meses;
    const inteiro = Number.isInteger(porMes);
    const alvo = inteiro ? porMes : Math.ceil(porMes);
    return c(
      "quanto-por-mes",
      `Uma família quer juntar R$ ${real(meta)} em ${meses} meses e já tem R$ ${real(guardado)} guardados. Quanto precisa guardar por mês, no mínimo, em valor inteiro de reais?`,
      `R$ ${real(alvo)}`,
      [`R$ ${real(Math.ceil(meta / meses))}`, `R$ ${real(Math.ceil((meta + guardado) / meses))}`],
      `Faltam ${real(meta - guardado)}; ${real(meta - guardado)} ÷ ${meses} = ${inteiro ? real(porMes) : `${porMes.toFixed(1).replace(".", ",")}, então ${real(alvo)}`}.`,
      {
        feedback: [
          "Dividiu a meta inteira, sem descontar o que já está guardado.",
          "Somou o que já está guardado à meta em vez de descontar.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "orcamento-n2",
    title: "Um mês da casa em números",
    prompt:
      "Com ajuda da família, registre as entradas e saídas de um mês da casa, separe fixas e variáveis e proponha um ajuste que libere dinheiro para uma meta, mostrando o que se perde com ele.",
    lab: "bars",
    steps: [
      "Monte a tabela do mês com entradas, despesas fixas e variáveis e o saldo.",
      "Escolha um ajuste possível, calcule quanto ele libera por mês e em quanto tempo alcança a meta.",
      "Descreva o custo de oportunidade do ajuste: o que a família deixa de fazer e se vale a pena.",
    ],
    rubric: [
      "Tabela completa com saldo correto (0–3)",
      "Ajuste com cálculo do que libera e do prazo da meta (0–2)",
      "Custo de oportunidade explicado com honestidade (0–2)",
      "Registro que a família consegue usar de verdade (0–1)",
    ],
  },
  homeSupport: [
    "Ao decidir uma compra em família, perguntem em voz alta o que deixaria de ser feito com o mesmo dinheiro.",
    "Escolham juntos um gasto pequeno e repetido, contem quanto ele soma no mês e decidam se vale o que custa.",
  ],
};
