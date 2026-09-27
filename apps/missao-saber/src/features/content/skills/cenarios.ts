import { c, n, type SkillPack } from "../skill-factory";

/**
 * Cenários: análises financeiras com informação incompleta, premissas,
 * sensibilidade a mudanças, comparação de alternativas e conclusões
 * responsáveis. Trilha OLITEF N3.
 */
export const cenarios: SkillPack = {
  id: "cenarios",
  name: "Análise de cenários",
  domain: "olitef",
  lab: "bars",
  missions: [
    {
      title: "O que se sabe e o que se supõe",
      objective:
        "Separar dados de premissas numa situação financeira e reconhecer informação que falta.",
      introduction:
        "Toda análise mistura dados (o que se sabe) com premissas (o que se supõe). Um bom analista escreve as premissas com clareza e identifica que informação faltou, porque é ali que a conclusão pode falhar.",
      specs: [
        c(
          "premissas",
          "Numa análise de 'guardar R$ 200 por mês por 5 anos a 0,8% ao mês', o que é premissa?",
          "Que a taxa de 0,8% ao mês se mantém pelos 5 anos",
          ["Que o total guardado sem juros será de R$ 12.000", "Que serão feitos 60 depósitos"],
          "A taxa futura é suposta; 60 depósitos e R$ 12.000 sem juros são contas feitas com os dados.",
          {
            feedback: [
              "200 × 60 = 12.000 é uma conta com os dados, não uma suposição.",
              "12 depósitos por ano durante 5 anos é um fato de calendário.",
            ],
          },
        ),
        n(
          "premissas",
          "Na mesma análise, quantos depósitos serão feitos ao todo?",
          60,
          "12 × 5 = 60.",
          { misreads: [{ value: 5, feedback: "5 é o número de anos; os depósitos são mensais." }] },
        ),
        c(
          "premissas",
          "Uma pessoa quer saber quanto um financiamento realmente vai custar. Qual informação é indispensável e costuma aparecer só em letra miúda nos anúncios?",
          "O custo efetivo total, com tarifas e seguros",
          [
            "A taxa de juros nominal, ao mês e ao ano",
            "O valor da parcela, que mostra se cabe no mês",
          ],
          "O custo efetivo total inclui todas as taxas, tarifas e seguros; a taxa anunciada pode deixar de fora tarifas, impostos e seguros.",
          {
            feedback: [
              "A taxa nominal não inclui tarifas, impostos e seguros cobrados junto.",
              "A parcela mostra se cabe no orçamento, mas não o total, que depende do número de parcelas e dos encargos.",
            ],
          },
        ),
        n(
          "premissas",
          "Um financiamento anuncia parcela de R$ 450 por 24 meses. Qual é o total pago, em reais?",
          10800,
          "450 × 24 = 10.800.",
          { misreads: [{ value: 474, feedback: "474 soma 450 com 24 em vez de multiplicar." }] },
        ),
        c(
          "premissas",
          "Uma análise supõe 'renda de R$ 3.000 por mês pelos próximos 3 anos'. O maior risco dessa premissa é:",
          "A renda mudar por desemprego, doença ou mudança de trabalho",
          [
            "A inflação reduzir um pouco o poder de compra da renda",
            "A renda aumentar com um reajuste anual",
          ],
          "Perder a renda muda tudo; os outros efeitos são pequenos, ou até favoráveis, perto disso.",
          {
            feedback: [
              "A inflação pesa, mas perder a renda de uma vez é um risco muito maior.",
              "Um reajuste melhora o cenário; o risco que pesa é perder a renda.",
            ],
          },
        ),
        n(
          "premissas",
          "Uma família gasta R$ 2.800 por mês e recebe R$ 3.200. Se a renda cair 10%, qual passa a ser a sobra mensal, em reais?",
          80,
          "3.200 × 0,9 = 2.880; 2.880 − 2.800 = 80.",
          { misreads: [{ value: 400, feedback: "400 é a sobra atual, antes da queda de renda." }] },
        ),
        c(
          "premissas",
          "Numa análise, escrever as premissas explicitamente serve para:",
          "Deixar claro quando a conclusão vale e permitir testar outras",
          [
            "Garantir que a conclusão vai se confirmar",
            "Mostrar que a análise usou fórmulas avançadas",
          ],
          "Premissas explícitas tornam a análise conferível: quem lê sabe em que condições a conclusão vale e pode testar outras.",
          {
            feedback: [
              "Escrever premissas não garante que elas aconteçam.",
              "O objetivo é clareza, não sofisticação.",
            ],
          },
        ),
        n(
          "premissas",
          "Uma meta de R$ 9.000 será atingida guardando R$ 300 por mês, sem rendimento. Em quantos meses?",
          30,
          "9.000 ÷ 300 = 30.",
          { misreads: [{ value: 3, feedback: "3 dividiria por 3.000; o depósito mensal é 300." }] },
        ),
      ],
    },
    {
      title: "E se mudar?",
      objective: "Medir como o resultado muda quando uma premissa muda (análise de sensibilidade).",
      introduction:
        "Análise de sensibilidade responde 'e se?': e se a taxa for outra, e se a renda cair, e se o prazo aumentar. Mudar uma premissa de cada vez mostra quais pesam mais na conclusão.",
      specs: [
        n(
          "sensibilidade",
          "Uma meta de R$ 12.000 em 24 meses exige guardar R$ 500 por mês. Se o prazo aumentar para 30 meses, quanto por mês, em reais?",
          400,
          "12.000 ÷ 30 = 400.",
          {
            misreads: [
              {
                value: 625,
                feedback:
                  "Aumentou a parcela na mesma proporção do prazo; prazo maior reduz a parcela.",
              },
            ],
          },
        ),
        c(
          "sensibilidade",
          "Um financiamento de R$ 20.000 em 1 parcela após 1 ano custa R$ 22.000 a 10% ao ano. A 15% ao ano, custaria:",
          "R$ 23.000",
          ["R$ 23.100", "R$ 30.000"],
          "20.000 × 1,15 = 23.000.",
          {
            feedback: [
              "23.100 aplica os 5 pontos a mais sobre os 22.000; a taxa incide sobre os 20.000.",
              "30.000 multiplica por 1,5.",
            ],
          },
        ),
        n(
          "sensibilidade",
          "No item anterior, quantos reais a mais custa o financiamento quando a taxa sobe de 10% para 15%?",
          1000,
          "23.000 − 22.000 = 1.000.",
          {
            misreads: [
              { value: 5, feedback: "5 é a diferença de taxa em pontos; em reais, 5% de 20.000." },
            ],
          },
        ),
        c(
          "sensibilidade",
          "Numa análise de guardar dinheiro por 30 anos, qual premissa costuma pesar mais no resultado final?",
          "A taxa de rendimento suposta para os 30 anos",
          [
            "O valor do primeiro depósito, que rende mais tempo",
            "O dia do mês em que cada depósito é feito",
          ],
          "Os juros compostos amplificam pequenas diferenças: em 30 anos, 1 ponto de taxa muda muito o total.",
          {
            feedback: [
              "O primeiro depósito rende por mais tempo, mas é só 1 de 360; a taxa age sobre todos.",
              "O dia do depósito quase não muda o total.",
            ],
          },
        ),
        n(
          "sensibilidade",
          "R$ 1.000 a 6% ao ano por 12 anos viram cerca de R$ 2.012. A 8% ao ano, viram cerca de quanto? Arredonde para o inteiro, usando 1,08¹² ≈ 2,518.",
          2518,
          "1.000 × 2,518 = 2.518.",
          { misreads: [{ value: 2012, feedback: "2.012 é o resultado a 6%." }] },
        ),
        c(
          "sensibilidade",
          "Para descobrir qual premissa mais influencia uma conclusão, o método é:",
          "Mudar uma premissa de cada vez, mantendo as outras, e ver o quanto o resultado muda",
          [
            "Mudar todas as premissas para o pior caso ao mesmo tempo",
            "Comparar o resultado com o de outra pessoa",
          ],
          "Isolar cada efeito mostra seu peso.",
          {
            feedback: [
              "Mudando tudo junto não se sabe qual mudança causou o efeito.",
              "Outra pessoa tem outras premissas; a comparação não isola nenhuma.",
            ],
          },
        ),
        n(
          "sensibilidade",
          "Numa loja, cada produto vendido deixa R$ 8 de margem (preço menos custo do produto), e o custo fixo é de R$ 2.400 por mês. Quantos produtos precisa vender para empatar?",
          300,
          "2.400 ÷ 8 = 300.",
          { misreads: [{ value: 3000, feedback: "3.000 divide por 0,8 em vez de por 8." }] },
        ),
        c(
          "sensibilidade",
          "No item anterior, se a margem por produto cair para R$ 6, o ponto de empate:",
          "Sobe para 400 produtos",
          ["Cai para 225 produtos", "Continua em 300 produtos"],
          "2.400 ÷ 6 = 400.",
          {
            feedback: [
              "225 = 300 × 6 ÷ 8 usa a proporção ao contrário; margem menor exige vender mais.",
              "O empate depende da margem por unidade.",
            ],
          },
        ),
      ],
    },
    {
      title: "Três cenários",
      objective:
        "Construir cenários pessimista, base e otimista e calcular o resultado em cada um.",
      introduction:
        "Em vez de apostar num único número, montam-se três cenários: pessimista, base e otimista. O intervalo entre eles mostra o que pode acontecer e ajuda a planejar para o pior sem desistir do provável.",
      specs: [
        n(
          "tres-cenarios",
          "Uma pequena empresa espera vender 1.000 unidades a R$ 20. No cenário pessimista vende 20% menos. Qual é a receita pessimista, em reais?",
          16000,
          "800 × 20 = 16.000.",
          { misreads: [{ value: 20000, feedback: "20.000 é a receita do cenário base." }] },
        ),
        c(
          "tres-cenarios",
          "No mesmo exemplo, o cenário otimista tem 15% mais vendas, com o mesmo preço. A receita otimista é:",
          "R$ 23.000",
          ["R$ 20.300", "R$ 3.000"],
          "1.150 × 20 = 23.000.",
          {
            feedback: [
              "20.300 soma 15 unidades, não 15%.",
              "3.000 é só o acréscimo de receita, 150 × 20.",
            ],
          },
        ),
        n(
          "tres-cenarios",
          "Uma família monta cenários para as despesas do próximo ano: R$ 36.000 (otimista), R$ 40.000 (base), R$ 46.000 (pessimista). Qual é a diferença entre o pessimista e o otimista, em reais?",
          10000,
          "46.000 − 36.000 = 10.000.",
          { misreads: [{ value: 6000, feedback: "6.000 compara o pessimista com o base." }] },
        ),
        c(
          "tres-cenarios",
          "Por que planejar a reserva de emergência pelo cenário pessimista?",
          "Porque ela existe para quando as coisas saem pior",
          [
            "Porque o cenário pessimista é o mais provável",
            "Porque o cenário base costuma ser otimista demais",
          ],
          "A reserva cobre imprevistos: existe justamente para os momentos em que as coisas saem pior do que o esperado.",
          {
            feedback: [
              "Nem sempre é o mais provável, mas é o caso para o qual a reserva serve.",
              "O cenário base pode estar certo; a reserva serve para quando não está.",
            ],
          },
        ),
        n(
          "tres-cenarios",
          "Cenários com probabilidades: 20% de lucro R$ 2.000, 60% de lucro R$ 5.000 e 20% de lucro R$ 7.000. Qual é o lucro esperado, em reais?",
          4800,
          "0,2 × 2.000 + 0,6 × 5.000 + 0,2 × 7.000 = 400 + 3.000 + 1.400 = 4.800.",
          {
            misreads: [
              { value: 4666.67, feedback: "4.666,67 é a média simples, sem as probabilidades." },
            ],
          },
        ),
        c(
          "tres-cenarios",
          "Um bom cenário pessimista é aquele que:",
          "É ruim, mas plausível, com premissas que podem de fato acontecer",
          ["Supõe o pior absoluto, por mais improvável que seja", "É igual ao cenário base"],
          "Cenários úteis são plausíveis.",
          {
            feedback: [
              "Um cenário catastrófico e improvável não ajuda a planejar.",
              "Seria inútil como cenário alternativo.",
            ],
          },
        ),
        n(
          "tres-cenarios",
          "Uma viagem custa R$ 5.000 no cenário base. Se o câmbio subir, o custo aumenta 12%. Qual é o custo nesse cenário, em reais?",
          5600,
          "5.000 × 1,12 = 5.600.",
          { misreads: [{ value: 5012, feedback: "Somou 12 reais em vez de 12%." }] },
        ),
        c(
          "tres-cenarios",
          "Ao apresentar três cenários a quem vai decidir, o mais útil é:",
          "Mostrar o resultado e as condições de cada cenário",
          [
            "Mostrar só o cenário base, que é o mais provável",
            "Mostrar só a média dos três, para simplificar",
          ],
          "Quem decide precisa ver o intervalo e o que teria de acontecer para cada cenário se realizar.",
          {
            feedback: [
              "Sem o pessimista, quem decide não vê o risco.",
              "A média esconde a dispersão.",
            ],
          },
        ),
      ],
    },
    {
      title: "Comparar alternativas",
      objective: "Comparar alternativas financeiras com vários critérios e cenários.",
      introduction:
        "Alternativas raramente vencem em tudo. Uma pode ter custo menor e mais risco; outra, custo maior e mais flexibilidade. Comparar em vários cenários e critérios mostra onde cada uma é melhor.",
      specs: [
        n(
          "alternativas",
          "Alugar custa R$ 1.500 por mês. Comprar exige entrada de R$ 60.000 e parcela de R$ 1.800. Em 12 meses, quanto se desembolsa a mais comprando, sem contar a entrada, em reais?",
          3600,
          "(1.800 − 1.500) × 12 = 3.600.",
          {
            misreads: [{ value: 300, feedback: "300 é a diferença por mês; em 12 meses é 3.600." }],
          },
        ),
        c(
          "alternativas",
          "Na comparação entre alugar e comprar, um fator que a conta de parcelas não mostra é:",
          "A facilidade de mudar de casa ou de cidade",
          [
            "A diferença entre a parcela e o aluguel",
            "O total pago em parcelas ao longo de um ano",
          ],
          "Critérios não financeiros também contam, como a flexibilidade de mudar com facilidade.",
          {
            feedback: [
              "A diferença entre parcela e aluguel sai direto da conta.",
              "O total em parcelas é só multiplicar; ele já está na conta.",
            ],
          },
        ),
        n(
          "alternativas",
          "Um carro próprio custa R$ 1.200 por mês (parcela, seguro, combustível). Aplicativo de transporte custaria R$ 40 por dia útil, 22 dias por mês. Quanto se economiza por mês com o aplicativo, em reais?",
          320,
          "40 × 22 = 880; 1.200 − 880 = 320.",
          { misreads: [{ value: 880, feedback: "880 é o custo do aplicativo, não a economia." }] },
        ),
        c(
          "alternativas",
          "No item anterior, suponha que a pessoa passe a precisar de transporte também nos fins de semana (mais 8 dias a R$ 40 de aplicativo) e que o custo do carro continue R$ 1.200. A comparação:",
          "Empata: os dois custam R$ 1.200",
          ["O aplicativo continua R$ 320 mais barato", "O aplicativo fica R$ 320 mais caro"],
          "40 × 30 = 1.200, o mesmo custo do carro.",
          {
            feedback: [
              "A economia de 320 era para 22 dias.",
              "Com 30 dias o aplicativo custa exatamente 1.200.",
            ],
          },
        ),
        n(
          "alternativas",
          "Curso A: R$ 4.800 e aumento esperado de salário de R$ 300 por mês. Curso B: R$ 2.400 e aumento de R$ 200. Em quantos meses o curso A se paga?",
          16,
          "4.800 ÷ 300 = 16.",
          { misreads: [{ value: 12, feedback: "12 meses é o tempo do curso B (2.400 ÷ 200)." }] },
        ),
        c(
          "alternativas",
          "No item anterior, depois de 24 meses, qual curso deu mais retorno líquido (aumento acumulado menos custo)?",
          "Empatam",
          ["O curso A", "O curso B"],
          "A: 300 × 24 − 4.800 = 2.400. B: 200 × 24 − 2.400 = 2.400.",
          {
            feedback: [
              "O aumento de A é maior, mas o custo também: empata em 24 meses.",
              "B é mais barato, mas tem aumento menor: empata em 24 meses.",
            ],
          },
        ),
        n(
          "alternativas",
          "Ainda nos cursos, em qual mês o retorno acumulado do curso A passa a ser maior que o do B?",
          25,
          "A − B = 100m − 2.400 > 0 quando m > 24: a partir do 25º mês.",
          {
            misreads: [
              { value: 24, feedback: "No 24º mês eles empatam; A passa a ganhar depois." },
            ],
          },
        ),
        c(
          "alternativas",
          "Qual é a limitação principal da comparação dos cursos?",
          "Supor que o aumento de salário esperado vai de fato acontecer e durar",
          [
            "Não considerar o custo de oportunidade do dinheiro pago no curso",
            "Comparar cursos com preços diferentes",
          ],
          "O aumento é a premissa mais incerta e a que mais pesa.",
          {
            feedback: [
              "O custo de oportunidade existe, mas pesa menos que a incerteza do aumento.",
              "Comparar preços diferentes é justamente o objetivo.",
            ],
          },
        ),
      ],
    },
    {
      title: "Concluir com responsabilidade",
      objective:
        "Escrever conclusões que ligam cálculo, premissas e limites, sem prometer nem recomendar para outros.",
      introduction:
        "A conclusão de uma análise diz o que os números mostram sob as premissas adotadas, onde ela deixa de valer e o que ainda depende de escolhas pessoais. Ela informa quem decide; não decide por ninguém.",
      estimatedMinutes: 18,
      specs: [
        c(
          "concluir",
          "Qual conclusão é responsável?",
          "'Com renda estável e 1% ao mês, a meta leva 30 meses; se o depósito cair 10%, cerca de 33'",
          [
            "'Com certeza a meta será atingida em 30 meses, como calculado'",
            "'Todos deveriam guardar desse jeito para chegar lá em 30 meses'",
          ],
          "Liga o resultado às premissas (renda estável, taxa de 1% ao mês) e mostra a sensibilidade: com depósito 10% menor, o prazo sobe para cerca de 33 meses.",
          {
            feedback: [
              "Esconde que o prazo depende de premissas, como renda estável e taxa de 1% ao mês.",
              "Recomenda para todos sem conhecer a situação de ninguém.",
            ],
          },
        ),
        n(
          "concluir",
          "Uma análise diz: 'o investimento A rende R$ 1.200 a mais que B em 5 anos, supondo taxas constantes'. Por ano, em média, quantos reais a mais?",
          240,
          "1.200 ÷ 5 = 240.",
          { misreads: [{ value: 6000, feedback: "6.000 multiplica em vez de dividir." }] },
        ),
        c(
          "concluir",
          "Uma análise concluiu que parcelar custa R$ 480 a mais. Uma pessoa sem reserva, com a geladeira quebrada, decide parcelar. Essa decisão:",
          "Pode ser razoável, pois a necessidade é real",
          [
            "É errada, porque parcelar custa R$ 480 a mais",
            "Contradiz a análise, que mostrou o custo maior",
          ],
          "O custo extra é conhecido e a necessidade é real: a análise informa o custo; a decisão pesa a situação.",
          {
            feedback: [
              "O custo extra de R$ 480 pode valer a pena numa necessidade real.",
              "A análise mostrou o custo, não proibiu a escolha.",
            ],
          },
        ),
        n(
          "concluir",
          "Numa análise, o cenário pessimista dá prejuízo de R$ 2.000 e o otimista dá lucro de R$ 6.000. Qual é a amplitude do intervalo de resultados, em reais?",
          8000,
          "6.000 − (−2.000) = 8.000.",
          {
            misreads: [
              {
                value: 4000,
                feedback: "4.000 subtrai 2.000 de 6.000, esquecendo que o pessimista é prejuízo.",
              },
            ],
          },
        ),
        c(
          "concluir",
          "O que uma análise financeira bem feita precisa ter?",
          "Dados e premissas, cálculo, limites e conclusão",
          [
            "Dados, cálculo e a indicação do melhor produto para quem lê",
            "Cálculo e conclusão, sem premissas para não confundir",
          ],
          "Cada parte sustenta a seguinte.",
          {
            feedback: [
              "Indicar o melhor produto para qualquer pessoa ignora a situação de cada um.",
              "Sem premissas não se sabe quando a conclusão vale.",
            ],
          },
        ),
        n(
          "concluir",
          "Uma pessoa quer uma reserva de 6 meses de despesas de R$ 2.500 e já tem R$ 6.000. Guardando R$ 750 por mês, em quantos meses completa a reserva?",
          12,
          "Meta 15.000; faltam 9.000; 9.000 ÷ 750 = 12.",
          {
            misreads: [
              {
                value: 20,
                feedback: "20 divide a meta inteira, sem descontar os 6.000 que já tem.",
              },
            ],
          },
        ),
        c(
          "concluir",
          "Uma análise responsável sobre investimentos para um trabalho escolar deve evitar:",
          "Indicar um produto como 'o melhor' para todos",
          [
            "Comparar os rendimentos líquidos, não os brutos",
            "Mostrar o cenário pessimista junto com os outros",
          ],
          "Recomendações pessoais dependem de cada situação.",
          {
            feedback: [
              "Comparar rendimentos líquidos é parte essencial da análise.",
              "O pessimista mostra o risco e ajuda quem decide.",
            ],
          },
        ),
        c(
          "concluir",
          "Por que é importante dizer o que a análise não considerou?",
          "Porque quem decide precisa saber quais riscos e fatores ficaram de fora",
          [
            "Porque assim a análise fica completa, mesmo sem calcular esses fatores",
            "Porque isso substitui a análise de sensibilidade",
          ],
          "O que ficou de fora pode mudar a decisão.",
          {
            feedback: [
              "Dizer o que faltou não a torna completa; só avisa do limite.",
              "A sensibilidade mede premissas usadas; o que ficou de fora é outra coisa.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize os passos de uma análise de sensibilidade.",
    labels: [
      "Fazer o cálculo com as premissas do cenário base",
      "Escolher uma premissa e alterá-la, mantendo as outras",
      "Refazer o cálculo e medir quanto o resultado mudou",
      "Repetir com outras premissas e apontar a que mais pesa",
    ],
    explanation:
      "Sem o cenário base não há referência; mudar uma premissa de cada vez isola o efeito de cada uma.",
  },
  justification: {
    prompts: [
      "Explique a diferença entre um dado e uma premissa, com um exemplo de uma análise de poupança.",
      "Explique por que planejar só pelo cenário otimista é arriscado, com um exemplo numérico.",
      "Escreva uma conclusão responsável para: 'o curso A custa R$ 4.800 e aumenta o salário em R$ 300 por mês'.",
    ],
    samples: [
      "Dado é algo conhecido, como 'guardo R$ 200 por mês' ou 'um ano tem 12 meses'. Premissa é uma suposição sobre o futuro, como 'a taxa será de 0,8% ao mês pelos próximos 5 anos'. Os dados não mudam; as premissas podem falhar. Por isso a conclusão precisa dizer em quais premissas se apoia.",
      "Se uma empresa planeja vender 1.150 unidades a R$ 20 (otimista) e gasta pensando nisso, mas vende 800 (pessimista), a receita cai de R$ 23.000 para R$ 16.000. Se os gastos foram feitos contando com os R$ 23.000, faltam R$ 7.000. Planejar pelo pessimista plausível protege; o otimista serve para saber até onde se pode ir.",
      "Supondo que o aumento de R$ 300 por mês aconteça logo após o curso e se mantenha, o curso se paga em 16 meses e, a partir daí, gera ganho. Se o aumento demorar ou for menor, o prazo cresce: com R$ 200 por mês, seriam 24 meses. A decisão depende da confiança nesse aumento e de a pessoa ter como pagar o curso sem se endividar.",
    ],
    focus: "premissas e limites da conclusão",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const receita = 1000 * (4 + (seed % 8));
      const gasto = receita - 100 * (3 + (seed % 5));
      const queda = [10, 20][Math.floor(seed / 8) % 2] ?? 10;
      const novaReceita = (receita * (100 - queda)) / 100;
      const sobra = novaReceita - gasto;
      const real = (v: number) => Math.abs(v).toLocaleString("pt-BR");
      const texto = (v: number) =>
        v < 0
          ? `Falta de R$ ${real(v)}`
          : v === 0
            ? "Nem sobra nem falta"
            : `Sobra de R$ ${real(v)}`;
      return c(
        "sobra-com-queda-de-renda",
        `Uma família recebe R$ ${real(receita)} por mês e gasta R$ ${real(gasto)}. Num cenário em que a renda cai ${queda}%, qual é o resultado mensal?`,
        texto(sobra),
        [texto(receita - gasto), texto(((receita - gasto) * (100 - queda)) / 100)],
        `Nova renda: ${real(receita)} × ${(1 - queda / 100).toString().replace(".", ",")} = ${real(novaReceita)}; menos ${real(gasto)}: ${sobra < 0 ? "−" : ""}${real(sobra)}.`,
        {
          feedback: [
            "Esse é o resultado atual, antes da queda de renda.",
            "Aplicou a queda sobre a sobra, não sobre a renda.",
          ],
        },
      );
    }
    if (variant === 1) {
      const fixo = 100 * (12 + (seed % 25));
      const margem = 3 + (seed % 6);
      const nova = margem - 1;
      const empate = Math.ceil(fixo / margem);
      const novoEmpate = Math.ceil(fixo / nova);
      return c(
        "empate-com-margem-menor",
        `Uma loja tem custo fixo de R$ ${fixo.toLocaleString("pt-BR")} por mês e cada produto deixa R$ ${margem} de margem. Se a margem cair para R$ ${nova}, quantos produtos, no mínimo, ela precisa vender para não ter prejuízo?`,
        novoEmpate.toLocaleString("pt-BR"),
        [empate.toLocaleString("pt-BR"), (novoEmpate - 1).toLocaleString("pt-BR")],
        `${fixo.toLocaleString("pt-BR")} ÷ ${nova} = ${(fixo / nova).toLocaleString("pt-BR", { minimumFractionDigits: Number.isInteger(fixo / nova) ? 0 : 2, maximumFractionDigits: 2 })}; o mínimo inteiro é ${novoEmpate.toLocaleString("pt-BR")}.`,
        {
          feedback: [
            "Esse é o empate com o lucro antigo; com lucro menor por unidade, é preciso vender mais.",
            fixo % nova === 0
              ? "Com um produto a menos, a margem não cobre o custo fixo."
              : "Esse número ainda deixa prejuízo; arredonde para cima.",
          ],
        },
      );
    }
    const probs = [20, 30][seed % 2] ?? 20;
    const meio = 100 - 2 * probs;
    const baixo = 1000 * (1 + (seed % 3));
    const base = baixo + 1000 * (2 + (Math.floor(seed / 3) % 3));
    // Distâncias diferentes abaixo e acima do cenário base: o esperado nunca coincide com a média simples.
    const alto = base + 500 + 1000 * (1 + (Math.floor(seed / 9) % 3));
    const esperado = (probs * baixo + meio * base + probs * alto) / 100;
    const simples = (baixo + base + alto) / 3;
    const fmt = (v: number) =>
      v.toLocaleString("pt-BR", {
        minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
        maximumFractionDigits: 2,
      });
    return c(
      "valor-esperado-de-cenarios",
      `Três cenários de lucro: ${probs}% de chance de R$ ${fmt(baixo)}, ${meio}% de chance de R$ ${fmt(base)} e ${probs}% de chance de R$ ${fmt(alto)}. Qual é o lucro esperado?`,
      `R$ ${fmt(esperado)}`,
      [
        simples === esperado ? `R$ ${fmt(base)}` : `R$ ${fmt(simples)}`,
        `R$ ${fmt(baixo + base + alto)}`,
      ],
      `${probs}% × ${fmt(baixo)} + ${meio}% × ${fmt(base)} + ${probs}% × ${fmt(alto)} = ${fmt(esperado)}.`,
      {
        feedback: [
          simples === esperado
            ? "Esse é só o cenário base, sem ponderar os outros."
            : "Essa é a média simples, sem as probabilidades.",
          "Somou os três cenários em vez de ponderar pelas chances.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "cenarios",
    title: "O plano com três futuros",
    prompt:
      "Escolha um plano financeiro da família ou seu (uma viagem, um curso, uma troca de celular). Monte três cenários plausíveis, calcule o resultado de cada um, faça uma análise de sensibilidade de uma premissa e escreva uma conclusão responsável.",
    lab: "bars",
    steps: [
      "Descreva o plano e escreva os dados e as premissas separadamente.",
      "Calcule os cenários pessimista, base e otimista e varie uma premissa para medir a sensibilidade.",
      "Escreva a conclusão ligando resultados, premissas e limites, sem recomendar para outras pessoas.",
    ],
    rubric: [
      "Dados e premissas separados com clareza (0–2)",
      "Três cenários plausíveis calculados corretamente (0–3)",
      "Análise de sensibilidade de uma premissa (0–2)",
      "Conclusão responsável com limites declarados (0–3)",
    ],
  },
  homeSupport: [
    "Antes de uma compra grande, montem juntos três cenários de orçamento para os meses seguintes: tudo bem, apertado e muito apertado.",
    "Quando um plano da família depender de algo incerto, conversem sobre o que acontece se essa coisa não se confirmar.",
  ],
};
