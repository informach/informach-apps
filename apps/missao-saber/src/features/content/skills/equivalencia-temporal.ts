import { c, n, type SkillPack } from "../skill-factory";

/**
 * Equivalência temporal: valor presente e futuro, comparar fluxos em datas
 * diferentes, parcelas, antecipação e desconto, e decisões de compra e
 * crédito. Trilha OLITEF N3.
 */
export const equivalenciaTemporal: SkillPack = {
  id: "equivalencia-temporal",
  name: "Dinheiro em datas diferentes",
  domain: "olitef",
  lab: "bars",
  missions: [
    {
      title: "Valor hoje, valor depois",
      objective: "Levar valores para o futuro e trazer para o presente com uma taxa de juros.",
      introduction:
        "R$ 100 hoje e R$ 100 daqui a um ano não valem o mesmo: hoje eles podem render. Levar ao futuro é multiplicar por (1 + i)ⁿ; trazer ao presente é dividir. Só se comparam valores na mesma data.",
      specs: [
        n(
          "presente-futuro",
          "Com taxa de 10% ao ano, quanto valem daqui a 2 anos R$ 5.000 aplicados hoje, em reais?",
          6050,
          "5.000 × 1,1² = 6.050.",
          {
            misreads: [
              {
                value: 6000,
                feedback: "6.000 soma 10% duas vezes sobre 5.000; no segundo ano a base é 5.500.",
              },
            ],
          },
        ),
        c(
          "presente-futuro",
          "Com taxa de 10% ao ano, R$ 11.000 daqui a um ano valem hoje:",
          "R$ 10.000",
          ["R$ 9.900", "R$ 12.100"],
          "11.000 ÷ 1,1 = 10.000.",
          {
            feedback: [
              "9.900 tira 10% de 11.000, mas trazer ao presente é dividir por 1,1.",
              "12.100 leva ainda mais para o futuro.",
            ],
          },
        ),
        n(
          "presente-futuro",
          "Quanto é preciso aplicar hoje, a 5% ao ano, para ter R$ 4.410 daqui a 2 anos, em reais?",
          4000,
          "4.410 ÷ 1,05² = 4.410 ÷ 1,1025 = 4.000.",
          {
            misreads: [
              {
                value: 3969,
                feedback: "3.969 tira 10% de 4.410; o certo é dividir por 1,05 duas vezes.",
              },
            ],
          },
        ),
        c(
          "presente-futuro",
          "Para comparar R$ 1.000 hoje com R$ 1.080 daqui a um ano, o primeiro passo é:",
          "Escolher uma taxa e levar os dois valores à mesma data",
          [
            "Comparar 1.000 com 1.080 diretamente, sem taxa",
            "Dividir a diferença de R$ 80 pelos 12 meses",
          ],
          "A conclusão depende da taxa: com 8% ao ano são equivalentes.",
          {
            feedback: [
              "Valores em datas diferentes não se comparam diretamente: R$ 1.000 hoje podem render até lá.",
              "Repartir a diferença pelos meses não leva nenhum dos dois valores para a mesma data.",
            ],
          },
        ),
        n(
          "presente-futuro",
          "Com taxa de 2% ao mês, quanto valem hoje R$ 1.040,40 que serão recebidos daqui a 2 meses, em reais?",
          1000,
          "1.040,40 ÷ 1,02² = 1.040,40 ÷ 1,0404 = 1.000.",
          {
            misreads: [
              { value: 1000.4, feedback: "Subtraiu 40 reais em vez de dividir pelo fator 1,0404." },
            ],
          },
        ),
        c(
          "presente-futuro",
          "Quanto maior a taxa de juros, o valor presente de uma quantia a receber no futuro:",
          "Fica menor",
          ["Fica maior", "Não muda"],
          "Divide-se por um fator maior.",
          {
            feedback: ["Uma taxa maior desconta mais.", "O valor presente depende da taxa."],
          },
        ),
        n(
          "presente-futuro",
          "Com taxa de 20% ao ano, qual valor daqui a 1 ano equivale a R$ 2.500 hoje, em reais?",
          3000,
          "2.500 × 1,2 = 3.000.",
          {
            misreads: [
              {
                value: 2083.33,
                feedback: "2.083,33 traz para o presente; a pergunta pede o valor futuro.",
              },
            ],
          },
        ),
        c(
          "presente-futuro",
          "Uma pessoa prefere receber R$ 500 hoje a R$ 520 daqui a um mês. Isso é coerente se:",
          "Ela consegue mais de 4% ao mês ou precisa do dinheiro já",
          [
            "Ela consegue qualquer rendimento acima de zero",
            "A inflação do mês for positiva, mesmo que baixa",
          ],
          "520/500 = 1,04: com rendimento acima de 4% ao mês, hoje vale mais. A urgência também pode justificar a escolha.",
          {
            feedback: [
              "Com rendimento de 1% ao mês, os R$ 500 viram só R$ 505, menos que os R$ 520; é preciso passar de 4%.",
              "Uma inflação baixa, como 0,5% ao mês, fica longe de cobrir a diferença de 4% entre 500 e 520.",
            ],
          },
        ),
      ],
    },
    {
      version: 2,
      title: "Parcelas e à vista",
      objective:
        "Comparar compras à vista e parceladas trazendo as parcelas para a data da compra.",
      introduction:
        "Parcelas futuras valem menos do que o mesmo número de reais hoje. Para saber se o parcelamento tem juros embutidos, traz-se cada parcela para a data da compra e compara-se com o preço à vista.",
      specs: [
        n(
          "parcelas",
          "Um produto custa R$ 1.000 à vista ou 2 parcelas de R$ 550, a primeira em um mês e a segunda em dois meses. Qual é o total pago no parcelado, em reais?",
          1100,
          "2 × 550 = 1.100.",
          { misreads: [{ value: 550, feedback: "550 é só uma parcela." }] },
        ),
        c(
          "parcelas",
          "Uma compra é paga em duas parcelas de R$ 550, uma daqui a 1 mês e outra daqui a 2 meses. Com taxa de 5% ao mês, o valor presente das duas parcelas é cerca de:",
          "R$ 1.022,68",
          ["R$ 1.100", "R$ 1.047,62"],
          "550/1,05 + 550/1,05² ≈ 523,81 + 498,87 = 1.022,68. Cada parcela é trazida para hoje pelo seu próprio prazo.",
          {
            feedback: [
              "1.100 soma as parcelas sem trazê-las para hoje.",
              "1.047,62 desconta as duas parcelas por um mês só; a segunda vence em dois meses.",
            ],
          },
        ),
        n(
          "parcelas",
          "Uma loja oferece 3 parcelas 'sem juros' de R$ 200 (a primeira hoje) ou 6% de desconto à vista sobre R$ 600. Qual é o preço à vista, em reais?",
          564,
          "600 × 0,94 = 564.",
          { misreads: [{ value: 594, feedback: "594 tira 6 reais, não 6%." }] },
        ),
        c(
          "parcelas",
          "Se um produto tem o mesmo preço à vista e parcelado, sem desconto, para quem pode pagar à vista e aplicar o dinheiro com rendimento:",
          "Parcelar é melhor, pois o dinheiro rende até cada parcela",
          [
            "Pagar à vista é melhor, pois evita ficar com dívida",
            "Tanto faz, pois o total pago é o mesmo nas duas",
          ],
          "Sem juros de verdade, adiar o pagamento permite que o dinheiro renda enquanto as parcelas não vencem.",
          {
            feedback: [
              "Sem desconto à vista, pagar antes só abre mão do rendimento; essa dívida não tem custo.",
              "O total é o mesmo, mas em datas diferentes: o dinheiro guardado rende até cada vencimento.",
            ],
          },
        ),
        n(
          "parcelas",
          "Uma TV custa R$ 2.000 à vista ou 10 parcelas de R$ 230. Quantos por cento a mais se paga no total parcelando?",
          15,
          "10 × 230 = 2.300; 2.300 ÷ 2.000 = 1,15.",
          {
            misreads: [
              {
                value: 300,
                feedback: "300 é a diferença em reais; em porcentagem, compare com 2.000.",
              },
            ],
          },
        ),
        c(
          "parcelas",
          "Duas parcelas iguais de R$ 525, com vencimentos em 1 e 2 meses, a 5% ao mês, equivalem hoje a cerca de:",
          "R$ 976,19",
          ["R$ 1.050", "R$ 1.000"],
          "525/1,05 + 525/1,1025 = 500 + 476,19.",
          {
            feedback: [
              "1.050 soma sem descontar.",
              "Só a primeira parcela vale exatamente 500 hoje.",
            ],
          },
        ),
        n(
          "parcelas",
          "Um celular custa R$ 1.200 à vista ou R$ 1.260 em uma única parcela daqui a um mês. Qual é a taxa de juros embutida, em porcentagem?",
          5,
          "1.260 ÷ 1.200 = 1,05.",
          { misreads: [{ value: 60, feedback: "60 é a diferença em reais." }] },
        ),
        c(
          "parcelas",
          "O que o anúncio 'parcelado sem juros' pode esconder?",
          "Que o preço inclui juros, e à vista poderia ter desconto",
          [
            "Nada; sem juros quer dizer sem nenhum custo",
            "Que as parcelas vão aumentando a cada mês",
          ],
          "Se existe desconto à vista, o parcelado tem um custo: os juros estão embutidos no preço parcelado.",
          {
            feedback: [
              "O custo pode estar no preço, não numa taxa declarada.",
              "As parcelas anunciadas costumam ser fixas; o custo escondido está no preço, não em reajustes.",
            ],
          },
        ),
      ],
    },
    {
      title: "Antecipar e atrasar",
      objective: "Calcular descontos por antecipação e encargos por atraso.",
      introduction:
        "Pagar antes do vencimento pode dar desconto; pagar depois gera multa e juros de mora. Antecipar uma dívida é trazê-la ao presente; atrasar é levá-la ao futuro com uma taxa, em geral, alta.",
      specs: [
        n(
          "antecipar",
          "Uma conta de R$ 400 tem multa de 2% e juros de 1% ao mês por atraso. Paga com 1 mês de atraso, quanto custa, em reais?",
          412,
          "400 + 2% (8) + 1% (4) = 412.",
          { misreads: [{ value: 404, feedback: "404 esquece a multa de 2%." }] },
        ),
        c(
          "antecipar",
          "Uma dívida de R$ 1.100 vence em 1 mês. Com taxa de 10% ao mês, o valor justo para quitá-la hoje é:",
          "R$ 1.000",
          ["R$ 990", "R$ 1.100"],
          "1.100 ÷ 1,1 = 1.000.",
          {
            feedback: [
              "990 tira 10% de 1.100; o justo é dividir pelo fator.",
              "Pagar 1.100 hoje ignora a antecipação.",
            ],
          },
        ),
        n(
          "antecipar",
          "Um boleto de R$ 800 dá 3% de desconto se pago até 5 dias antes do vencimento. Quanto se paga com o desconto, em reais?",
          776,
          "800 × 0,97 = 776.",
          { misreads: [{ value: 797, feedback: "797 tira 3 reais, não 3%." }] },
        ),
        c(
          "antecipar",
          "Uma dívida de cartão cobra 12% ao mês com juros compostos. Supondo que ela continue a essa taxa, R$ 1.000 não pagos por 3 meses viram cerca de:",
          "R$ 1.405",
          ["R$ 1.360", "R$ 1.036"],
          "1.000 × 1,12³ ≈ 1.404,93.",
          {
            feedback: ["1.360 soma os juros sem capitalizar.", "1.036 usa 1,2% ao mês."],
          },
        ),
        n(
          "antecipar",
          "Um financiamento cobra 2% ao mês. Antecipar uma parcela de R$ 510 que vence daqui a 1 mês deveria custar quanto hoje, em reais?",
          500,
          "510 ÷ 1,02 = 500.",
          {
            misreads: [
              { value: 499.8, feedback: "499,80 tira 2% de 510; o certo é dividir por 1,02." },
            ],
          },
        ),
        c(
          "antecipar",
          "Por que a dívida do rotativo do cartão cresce tão rápido?",
          "Porque a taxa mensal é alta e os juros são compostos",
          [
            "Porque a multa por atraso é cobrada todo mês",
            "Porque a taxa é alta, mas os juros são simples",
          ],
          "Os juros compostos incidem sobre os juros dos meses anteriores, e taxas mensais de dois dígitos acumulam muito em poucos meses.",
          {
            feedback: [
              "A multa é cobrada uma vez; o que faz a dívida crescer mês a mês é o juro composto.",
              "Com juros simples ela cresceria sempre o mesmo valor; no rotativo, os juros de um mês rendem juros no seguinte.",
            ],
          },
        ),
        n(
          "antecipar",
          "A 10% ao mês, em quantos meses inteiros uma dívida parada passa a ser mais que o dobro da original?",
          8,
          "1,1⁷ ≈ 1,95 e 1,1⁸ ≈ 2,14.",
          {
            misreads: [
              {
                value: 10,
                feedback:
                  "10 = 100 ÷ 10 é quando ela chegaria exatamente ao dobro com juros simples; com compostos passa do dobro já no 8º mês.",
              },
            ],
          },
        ),
        c(
          "antecipar",
          "Uma pessoa tem R$ 1.000 aplicados a 1% ao mês e uma dívida de R$ 1.000 a 8% ao mês. Pelas contas, o mais vantajoso é:",
          "Usar a aplicação para quitar a dívida",
          [
            "Manter as duas, porque os valores se equilibram",
            "Pagar só os juros da dívida com o rendimento",
          ],
          "Cada mês a dívida custa 80 e a aplicação rende 10: a dívida custa muito mais do que a aplicação rende.",
          {
            feedback: [
              "Os valores são iguais, mas as taxas não: mantendo as duas, perde-se 80 − 10 = 70 por mês.",
              "O rendimento de 10 por mês não cobre os 80 de juros, e a dívida continua cara.",
            ],
          },
        ),
      ],
    },
    {
      version: 2,
      title: "Fluxos de pagamentos",
      objective: "Comparar sequências de pagamentos ou recebimentos em datas diferentes.",
      introduction:
        "Um fluxo é uma lista de valores em datas. Para comparar dois fluxos, leva-se cada valor para uma mesma data com a mesma taxa e soma-se. O fluxo com maior valor presente, para quem recebe, é o melhor.",
      specs: [
        n(
          "fluxos",
          "Receber R$ 1.000 hoje e R$ 1.000 daqui a um ano, com taxa de 10% ao ano, vale quanto hoje, em reais? Arredonde para os centavos.",
          1909.09,
          "1.000 + 1.000/1,1 = 1.000 + 909,09.",
          {
            misreads: [
              { value: 2000, feedback: "2.000 soma sem trazer o segundo valor para hoje." },
            ],
          },
        ),
        c(
          "fluxos",
          "Com taxa de 10% ao ano, o que vale mais hoje: A = R$ 2.200 daqui a 1 ano ou B = R$ 2.420 daqui a 2 anos?",
          "Valem o mesmo, R$ 2.000 hoje",
          ["A, porque chega um ano antes", "B, porque 2.420 é o maior valor"],
          "2.200/1,1 = 2.000 e 2.420/1,21 = 2.000: ambos equivalem a R$ 2.000 hoje.",
          {
            feedback: [
              "Chegar antes conta, mas B compensa com um valor maior: os dois valem R$ 2.000 hoje.",
              "Um valor maior mais tarde pode equivaler ao mesmo hoje: 2.420/1,21 = 2.000.",
            ],
          },
        ),
        n(
          "fluxos",
          "Um prêmio pode ser recebido como R$ 30.000 hoje ou 3 parcelas anuais de R$ 11.000, a primeira hoje. Com taxa de 10% ao ano, qual é o valor presente das parcelas, em reais? Arredonde para os centavos.",
          30090.91,
          "11.000 + 11.000/1,1 + 11.000/1,21 = 11.000 + 10.000 + 9.090,91.",
          {
            misreads: [
              { value: 33000, feedback: "33.000 soma sem descontar as parcelas futuras." },
            ],
          },
        ),
        c(
          "fluxos",
          "Um prêmio pode ser recebido como R$ 30.000 hoje ou três parcelas anuais de R$ 11.000, a primeira hoje e as outras daqui a 1 e 2 anos. Qual opção é ligeiramente melhor para quem recebe, com taxa de 10% ao ano?",
          "As parcelas, que valem cerca de R$ 30.091 hoje",
          [
            "Os R$ 30.000, porque são recebidos de uma vez",
            "Empatam, pois a taxa anula os R$ 3.000 a mais",
          ],
          "30.090,91 > 30.000.",
          {
            feedback: [
              "Receber de uma vez não basta: com 10% ao ano, as parcelas valem R$ 30.090,91 hoje, um pouco mais.",
              "Descontar as parcelas futuras tira cerca de R$ 2.909, não os R$ 3.000 inteiros; sobra uma diferença de uns 91 reais.",
            ],
          },
        ),
        n(
          "fluxos",
          "Um investimento pede R$ 10.000 hoje e devolve R$ 12.100 daqui a 2 anos. Qual é a taxa anual de retorno, em porcentagem?",
          10,
          "12.100/10.000 = 1,21 = 1,1².",
          { misreads: [{ value: 21, feedback: "21% é o retorno nos 2 anos juntos." }] },
        ),
        c(
          "fluxos",
          "Ao aumentar a taxa usada para trazer fluxos ao presente, os fluxos com recebimentos mais distantes:",
          "Perdem proporcionalmente mais valor presente",
          [
            "Perdem a mesma proporção que os próximos",
            "Ganham valor presente, pois rendem por mais tempo",
          ],
          "O desconto cresce com o prazo: cada valor é dividido por (1 + i)ⁿ, e um n maior amplia o efeito da alta da taxa. Os recebimentos distantes perdem proporcionalmente mais que os próximos.",
          {
            feedback: [
              "O prazo está no expoente do fator de desconto, então a mesma alta de taxa pesa mais nos valores distantes.",
              "Render por mais tempo vale para quem aplica hoje; trazer ao presente com taxa maior reduz o valor.",
            ],
          },
        ),
        n(
          "fluxos",
          "Um aluguel de R$ 1.000 por mês é pago no início de cada mês. Com taxa de 1% ao mês, qual é o valor presente de 3 meses de aluguel, em reais? Arredonde para os centavos.",
          2970.4,
          "1.000 + 1.000/1,01 + 1.000/1,0201 ≈ 1.000 + 990,10 + 980,30 = 2.970,40.",
          { misreads: [{ value: 3000, feedback: "3.000 soma sem descontar os meses futuros." }] },
        ),
        c(
          "fluxos",
          "Para quem paga, entre dois fluxos de pagamento, o melhor é o que tem:",
          "Menor valor presente",
          ["Maior valor presente", "Maior número de parcelas"],
          "Pagar menos em valor de hoje.",
          {
            feedback: [
              "Maior valor presente é melhor para quem recebe.",
              "Mais parcelas não significa menor custo.",
            ],
          },
        ),
      ],
    },
    {
      version: 2,
      title: "Decidir no tempo",
      objective:
        "Analisar decisões de compra, crédito e poupança com equivalência de valores, declarando premissas.",
      introduction:
        "Decisões reais misturam contas e circunstâncias: a taxa que a pessoa consegue, o risco de não conseguir pagar, a urgência. A equivalência temporal dá o número; a decisão pesa esse número com o resto.",
      estimatedMinutes: 18,
      specs: [
        c(
          "decidir",
          "Uma geladeira custa R$ 3.000 à vista ou 12 × R$ 290. A pessoa não tem o dinheiro agora e a geladeira atual quebrou. Uma análise responsável considera:",
          "O custo extra, a urgência e se as parcelas cabem no orçamento",
          [
            "Só a diferença entre o total parcelado e o preço à vista",
            "Só o valor da parcela, que deve ser o menor possível",
          ],
          "O número importa, mas a capacidade de pagar sem comprometer o essencial e a urgência também.",
          {
            feedback: [
              "O custo extra é só uma parte: ignora a urgência e se as parcelas cabem no mês.",
              "Parcela menor em mais meses pode custar muito mais no total.",
            ],
          },
        ),
        n(
          "decidir",
          "Uma geladeira custa R$ 3.000 à vista ou 12 parcelas de R$ 290. Quanto se paga a mais no total parcelando, em reais?",
          480,
          "12 × 290 = 3.480; 3.480 − 3.000 = 480.",
          { misreads: [{ value: 3480, feedback: "3.480 é o total, não a diferença." }] },
        ),
        c(
          "decidir",
          "Esperar 6 meses guardando dinheiro para comprar à vista, em vez de parcelar, faz sentido quando:",
          "O produto não é urgente e a economia compensa a espera",
          [
            "Sempre, porque pagar à vista sai sempre mais barato",
            "Nunca, porque é melhor ter o produto logo",
          ],
          "A decisão depende da urgência e do custo: esperar vale quando o desconto à vista ou os juros evitados compensam ficar sem o produto.",
          {
            feedback: [
              "Nem sempre à vista sai mais barato, e parcelar pode ser razoável em emergências.",
              "Ter logo tem valor, mas também tem custo; se o produto não é urgente, a espera pode compensar.",
            ],
          },
        ),
        n(
          "decidir",
          "Uma pessoa guarda R$ 500 por mês, sem rendimento, para comprar à vista um produto de R$ 3.000. Em quantos meses junta o valor?",
          6,
          "3.000 ÷ 500 = 6.",
          { misreads: [{ value: 5, feedback: "Em 5 meses junta 2.500." }] },
        ),
        c(
          "decidir",
          "Um empréstimo consignado cobra 2% ao mês e o rotativo do cartão, 12% ao mês. Para quitar uma dívida de cartão, trocar pelo consignado:",
          "Reduz muito o custo, se as parcelas couberem no orçamento",
          [
            "Não muda o custo, pois a dívida continua a mesma",
            "Aumenta o custo, pois são dois empréstimos em vez de um",
          ],
          "2% ao mês é muito menos que 12%. Trocar uma dívida cara por uma barata é uma estratégia comum, desde que as parcelas caibam no orçamento e não se volte a usar o rotativo.",
          {
            feedback: [
              "O valor devido é o mesmo, mas a taxa muda: a 2% ao mês em vez de 12%, os juros caem muito.",
              "O consignado quita o cartão, então continua havendo uma dívida só, e mais barata.",
            ],
          },
        ),
        n(
          "decidir",
          "Uma dívida de R$ 2.000 no rotativo a 12% ao mês é trocada por um empréstimo a 2% ao mês. Quantos reais de juros se economizam no primeiro mês?",
          200,
          "12% de 2.000 = 240; 2% = 40; diferença 200.",
          {
            misreads: [
              {
                value: 240,
                feedback: "240 são os juros do rotativo; a economia é a diferença para 40.",
              },
            ],
          },
        ),
        c(
          "decidir",
          "Uma pessoa recebe R$ 1.000 de bônus hoje. Qual é a pergunta mais importante antes de decidir o que fazer?",
          "Se há dívidas caras ou falta reserva de emergência",
          ["Qual aplicação rendeu mais no último ano", "Qual compra adiada dá para fazer agora"],
          "Quitar dívidas caras costuma ser o melhor 'rendimento' disponível, e a reserva protege contra imprevistos.",
          {
            feedback: [
              "Rendimento passado não garante o futuro, e aplicar antes de quitar dívidas caras costuma sair caro.",
              "Gastar pode até ser a escolha final, mas antes vale ver se há dívidas caras ou falta reserva.",
            ],
          },
        ),
        c(
          "decidir",
          "Por que a mesma compra parcelada pode ser razoável para uma pessoa e ruim para outra?",
          "Porque cada uma tem taxa, urgência e orçamento diferentes",
          [
            "Porque a matemática muda de pessoa para pessoa",
            "Não pode; parcelar é sempre igual para todos",
          ],
          "O preço é o mesmo; a taxa de aplicação, a urgência e a folga no orçamento mudam a avaliação.",
          {
            feedback: [
              "As contas são as mesmas; o que muda são as condições.",
              "As condições de cada pessoa mudam a avaliação.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize os passos para decidir se um parcelamento tem juros embutidos.",
    labels: [
      "Anotar o preço à vista e as parcelas com suas datas",
      "Escolher a taxa de aplicação no mesmo período das parcelas anotadas",
      "Trazer cada parcela para a data da compra e somar",
      "Comparar a soma com o preço à vista",
    ],
    explanation:
      "Sem a taxa não se traz nada ao presente; a comparação só vale com os valores na mesma data.",
  },
  justification: {
    prompts: [
      "Explique por que R$ 1.000 hoje valem mais que R$ 1.000 daqui a um ano, mesmo sem inflação.",
      "Explique como descobrir se um parcelamento 'sem juros' tem juros embutidos.",
      "Explique por que quitar uma dívida a 8% ao mês com dinheiro aplicado a 1% ao mês é vantajoso.",
    ],
    samples: [
      "Com R$ 1.000 hoje, posso aplicar e ter mais que R$ 1.000 daqui a um ano. Com taxa de 10% ao ano, seriam R$ 1.100. Por isso, receber R$ 1.000 só daqui a um ano equivale a receber cerca de R$ 909 hoje. O tempo tem valor porque o dinheiro pode render.",
      "Comparo o preço à vista com a soma e as datas das parcelas. A taxa embutida é aquela que iguala o valor presente das parcelas ao preço à vista. Se o total parcelado for maior, há juros embutidos. Se os totais forem iguais, a taxa embutida é zero: sem rendimento do dinheiro guardado, os custos são iguais; com rendimento líquido positivo, manter o saldo aplicado até cada vencimento favorece parcelar, pagando sempre em dia. O nome 'sem juros' não dispensa essa comparação.",
      "A cada mês a dívida cresce 8%, ou R$ 80 para cada R$ 1.000, e a aplicação rende 1%, ou R$ 10. Mantendo as duas, perco R$ 70 por mês. Quitando a dívida com a aplicação, deixo de ganhar 10 e deixo de pagar 80. É como render 8% ao mês sem risco, em vez de 1%.",
    ],
    focus: "levar os valores para a mesma data",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const taxa = [5, 10, 20][seed % 3] ?? 10;
      const presente = 1000 * (2 + (Math.floor(seed / 3) % 7));
      const futuro = (presente * (100 + taxa)) / 100;
      const real = (v: number) =>
        Number.isInteger(v)
          ? v.toLocaleString("pt-BR")
          : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return c(
        "trazer-ao-presente",
        `Com taxa de ${taxa}% ao ano, quanto valem hoje R$ ${real(futuro)} que só serão recebidos daqui a um ano?`,
        `R$ ${real(presente)}`,
        [`R$ ${real(futuro - (futuro * taxa) / 100)}`, `R$ ${real((futuro * (100 + taxa)) / 100)}`],
        `${real(futuro)} ÷ ${(1 + taxa / 100).toString().replace(".", ",")} = ${real(presente)}.`,
        {
          feedback: [
            "Tirou a porcentagem do valor futuro; trazer ao presente é dividir pelo fator.",
            "Levou ainda mais para o futuro em vez de trazer para hoje.",
          ],
        },
      );
    }
    if (variant === 1) {
      const parcelas = [3, 4, 5, 6][seed % 4] ?? 4;
      // Preço à vista múltiplo do número de parcelas: a parcela sai exata.
      const vista = 100 * parcelas * (2 + (seed % 5));
      const acrescimo = 5 * (1 + (Math.floor(seed / 4) % 4));
      const total = (vista * (100 + acrescimo)) / 100;
      const parcela = total / parcelas;
      const real = (v: number) =>
        Number.isInteger(v)
          ? v.toLocaleString("pt-BR")
          : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return c(
        "acrescimo-do-parcelado",
        `Um produto custa R$ ${real(vista)} à vista ou ${parcelas} parcelas de R$ ${real(parcela)}. Quantos por cento a mais se paga no total parcelando?`,
        `${acrescimo}%`,
        [
          `${acrescimo * parcelas}%`,
          `${((acrescimo / (100 + acrescimo)) * 100).toFixed(2).replace(".", ",")}%`,
        ],
        `${parcelas} × ${real(parcela)} = ${real(total)}; ${real(total)} ÷ ${real(vista)} = ${(1 + acrescimo / 100).toString().replace(".", ",")}.`,
        {
          feedback: [
            "Multiplicou o acréscimo pelo número de parcelas.",
            "Comparou a diferença com o total parcelado; a base é o preço à vista.",
          ],
        },
      );
    }
    const divida = 500 * (2 + (seed % 7));
    const taxa = 8 + 2 * (seed % 3);
    const meses = 2 + (Math.floor(seed / 3) % 2);
    const final = divida * (1 + taxa / 100) ** meses;
    const simples = divida * (1 + (taxa * meses) / 100);
    const real = (v: number) =>
      v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return c(
      "divida-parada",
      `Uma dívida de R$ ${divida.toLocaleString("pt-BR")} fica parada, supondo juros compostos de ${taxa}% ao mês. Quanto ela vale depois de ${meses} meses?`,
      `R$ ${real(final)}`,
      [`R$ ${real(simples)}`, `R$ ${real(divida * (1 + taxa / 100))}`],
      `${divida.toLocaleString("pt-BR")} × ${(1 + taxa / 100).toString().replace(".", ",")} elevado a ${meses} ≈ ${real(final)}.`,
      {
        feedback: [
          "Somou os juros sem capitalizar; a dívida cobra juros sobre juros.",
          "Esse é o valor depois de um mês só.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "equivalencia-temporal",
    title: "O anúncio sem juros",
    prompt:
      "Encontre três anúncios de parcelamento 'sem juros' ou com desconto à vista. Para cada um, calcule a taxa embutida, compare com uma taxa de aplicação realista e diga para quem o parcelamento compensa.",
    lab: "bars",
    steps: [
      "Registre preço à vista, número e valor das parcelas e datas de cada anúncio.",
      "Calcule o total a mais e a taxa mensal embutida de cada um.",
      "Compare com uma taxa de aplicação e escreva para que tipo de pessoa cada opção compensa.",
    ],
    rubric: [
      "Dados dos três anúncios registrados (0–2)",
      "Taxas embutidas calculadas corretamente (0–4)",
      "Comparação com taxa de aplicação declarada (0–2)",
      "Conclusão que considera circunstâncias, sem recomendação pessoal (0–2)",
    ],
  },
  homeSupport: [
    "Quando uma conta chegar com desconto por pagamento antecipado, calculem juntos quanto rende esse desconto em porcentagem ao mês.",
    "Conversem sobre por que dívidas com juros altos, como as de cartão, costumam ser priorizadas, fazendo a conta de três meses a 12% ao mês.",
  ],
};
