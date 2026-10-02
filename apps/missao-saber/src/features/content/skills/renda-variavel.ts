import { c, n, type SkillPack } from "../skill-factory";

/**
 * Renda variável: participação em empresas, variação de preços e retorno
 * total, oscilação e risco, diversificação e leitura crítica de
 * rentabilidade passada. Trilha OLITEF N3. Empresas e números são fictícios.
 */
export const rendaVariavel: SkillPack = {
  id: "renda-variavel",
  name: "Renda variável",
  domain: "olitef",
  lab: "bars",
  missions: [
    {
      title: "Ser sócio de uma empresa",
      objective:
        "Entender ações como participação em empresas e calcular variação de preço e retorno.",
      introduction:
        "Quem compra uma ação vira sócio de uma pequena parte da empresa. O preço sobe e desce conforme as expectativas sobre ela, e a empresa pode distribuir parte do lucro. Não há rendimento combinado: o resultado só é conhecido depois.",
      specs: [
        n(
          "variacao",
          "Uma ação foi comprada a R$ 40 e vendida a R$ 46. Qual foi a variação percentual?",
          15,
          "6 ÷ 40 = 0,15.",
          {
            misreads: [
              { value: 6, feedback: "6 é a variação em reais; em porcentagem, compare com 40." },
            ],
          },
        ),
        c(
          "variacao",
          "Comprar uma ação significa:",
          "Tornar-se sócio de uma pequena parte da empresa",
          [
            "Emprestar dinheiro à empresa com juros combinados",
            "Garantir uma parte fixa do lucro da empresa todo ano",
          ],
          "Quem compra uma ação vira sócio e participa dos resultados, bons ou ruins. Emprestar com juros combinados é renda fixa.",
          {
            feedback: [
              "Isso descreve um título de dívida, não uma ação.",
              "Ação não garante lucro fixo: a empresa pode ter prejuízo ou não distribuir nada.",
            ],
          },
        ),
        n(
          "variacao",
          "Uma pessoa comprou 50 ações a R$ 20 cada. O preço caiu para R$ 17. Qual é a perda em reais, se ela vender agora? Responda o valor positivo da perda.",
          150,
          "50 × 3 = 150.",
          { misreads: [{ value: 3, feedback: "3 é a perda por ação; são 50 ações." }] },
        ),
        c(
          "variacao",
          "Uma ação cai 20% num mês e sobe 20% no mês seguinte. Em relação ao início, ela está:",
          "4% abaixo",
          ["No mesmo preço", "4% acima"],
          "0,8 × 1,2 = 0,96.",
          {
            feedback: [
              "Porcentagens de alta e queda não se anulam.",
              "A alta incide sobre um valor menor.",
            ],
          },
        ),
        n(
          "variacao",
          "Uma ação que caiu 50% precisa subir quantos por cento para voltar ao preço inicial?",
          100,
          "De 50 para 100 é dobrar: alta de 100%.",
          {
            misreads: [
              {
                value: 50,
                feedback: "Subir 50% a partir da metade leva só a 75% do valor inicial.",
              },
            ],
          },
        ),
        c(
          "variacao",
          "Uma empresa distribui R$ 2 por ação como parte do lucro. Para quem tem 300 ações, isso é:",
          "R$ 600",
          ["R$ 150", "R$ 302"],
          "300 × 2 = 600.",
          {
            feedback: ["150 divide em vez de multiplicar.", "302 soma em vez de multiplicar."],
          },
        ),
        n(
          "variacao",
          "Uma ação custava R$ 25 e passou a R$ 30, e a empresa pagou R$ 1 de dividendo por ação no período. Qual foi o retorno total, em porcentagem?",
          24,
          "(5 + 1) ÷ 25 = 0,24.",
          {
            misreads: [
              {
                value: 20,
                feedback: "20% considera só a alta do preço; o retorno total inclui o dividendo.",
              },
            ],
          },
        ),
        c(
          "variacao",
          "Por que o preço de uma ação muda todos os dias?",
          "Porque compradores e vendedores mudam as expectativas sobre a empresa",
          [
            "Porque a empresa decide o preço todo dia",
            "Porque o preço acompanha só o lucro do último mês",
          ],
          "O preço resulta de ofertas de compra e venda.",
          {
            feedback: [
              "A empresa não fixa o preço de negociação.",
              "O lucro recente pesa, mas o preço reflete expectativas sobre o futuro.",
            ],
          },
        ),
      ],
    },
    {
      title: "Oscilação e risco",
      objective:
        "Relacionar oscilação de preços com risco, prazo e a diferença entre perda realizada e não realizada.",
      introduction:
        "Renda variável oscila: há anos bons e ruins. Quanto mais longo o prazo, mais chances de atravessar quedas, mas nada garante recuperação. Uma queda só vira perda realizada quando se vende; e dinheiro que pode ser necessário logo não combina com oscilação.",
      specs: [
        c(
          "oscilacao",
          "Um investimento teve retornos anuais de +30%, −20%, +25%, −10%. Comparado a um que rendeu 6% todo ano, ele é:",
          "Mais arriscado, porque seus resultados variam muito de ano para ano",
          ["Menos arriscado, porque teve anos com mais retorno", "Igualmente arriscado"],
          "Risco é a incerteza do resultado.",
          {
            feedback: [
              "Retornos altos em alguns anos vêm junto com quedas em outros.",
              "Um oscila muito e o outro não.",
            ],
          },
        ),
        n(
          "oscilacao",
          "Com retornos de +30%, −20%, +25% e −10% em quatro anos, quanto vale ao final um investimento de R$ 1.000, em reais?",
          1170,
          "1.000 × 1,3 × 0,8 × 1,25 × 0,9 = 1.170.",
          {
            misreads: [
              { value: 1250, feedback: "1.250 soma as taxas (25%); os fatores se multiplicam." },
            ],
          },
        ),
        c(
          "oscilacao",
          "Uma pessoa comprou ações por R$ 5.000 e hoje elas valem R$ 4.200, mas ela não vendeu. É correto dizer que:",
          "Há uma perda de R$ 800 ainda não realizada",
          ["Ela já perdeu R$ 800 de forma definitiva", "Não há perda, porque ela ainda não vendeu"],
          "Só a venda realiza o resultado; enquanto isso, a perda de R$ 800 pode aumentar, diminuir ou virar ganho, conforme o preço.",
          {
            feedback: [
              "A perda só se torna definitiva na venda; até lá o preço pode subir ou cair.",
              "Não vender não apaga a queda: hoje as ações valem R$ 800 a menos do que custaram.",
            ],
          },
        ),
        n(
          "oscilacao",
          "Uma carteira de R$ 10.000 cai 30% numa crise. Quanto ela passa a valer, em reais?",
          7000,
          "10.000 × 0,7 = 7.000.",
          { misreads: [{ value: 3000, feedback: "3.000 é a perda, não o valor restante." }] },
        ),
        c(
          "oscilacao",
          "Dinheiro que será usado para pagar uma cirurgia marcada para daqui a 3 meses deve estar:",
          "Numa aplicação de baixo risco e alta liquidez",
          [
            "Em ações de empresas grandes, que oscilam menos",
            "Metade em ações, para tentar ganhar um pouco mais",
          ],
          "Uma queda na hora errada comprometeria o pagamento; renda variável não combina com um prazo tão curto.",
          {
            feedback: [
              "Mesmo ações de empresas grandes podem cair bastante em 3 meses, bem na hora do pagamento.",
              "Mesmo metade em ações expõe um pagamento essencial ao risco de queda.",
            ],
          },
        ),
        n(
          "oscilacao",
          "Um índice de ações subiu de 100.000 para 115.000 pontos em um ano. Qual foi a variação, em porcentagem?",
          15,
          "15.000 ÷ 100.000 = 0,15.",
          { misreads: [{ value: 15000, feedback: "15.000 é a variação em pontos." }] },
        ),
        c(
          "oscilacao",
          "Por que prazos longos costumam ser recomendados para renda variável?",
          "Porque há mais tempo para atravessar quedas temporárias",
          [
            "Porque no longo prazo a recuperação é garantida",
            "Porque o imposto sobre ações zera no longo prazo",
          ],
          "O prazo dá mais tempo para atravessar quedas temporárias, mas não há garantia de recuperação: ele ajuda, sem eliminar o risco.",
          {
            feedback: [
              "Ações podem cair também no longo prazo; o prazo aumenta as chances, mas não garante nada.",
              "O argumento é sobre oscilação, não imposto; esperar mais não zera o imposto sobre ações.",
            ],
          },
        ),
        n(
          "oscilacao",
          "Um investimento caiu 25%. Quantos por cento precisa subir para voltar ao valor inicial? Arredonde para o inteiro mais próximo.",
          33,
          "De 75 para 100: 100 ÷ 75 ≈ 1,333.",
          {
            misreads: [
              {
                value: 25,
                feedback: "Subir 25% a partir de 75 leva a 93,75, ainda abaixo de 100.",
              },
            ],
          },
        ),
      ],
    },
    {
      title: "Não depender de uma só empresa",
      objective:
        "Calcular o resultado de carteiras e entender como a diversificação reduz o impacto de uma perda.",
      introduction:
        "Diversificar é distribuir o dinheiro entre ativos que não sobem e caem juntos. O resultado da carteira é a média dos resultados, ponderada pelo peso de cada parte. Diversificar reduz o estrago de um tropeço, mas não elimina quedas gerais do mercado.",
      specs: [
        n(
          "carteira",
          "Uma carteira tem 50% na empresa A, que subiu 20%, e 50% na empresa B, que caiu 10%. Qual foi o resultado da carteira, em porcentagem?",
          5,
          "0,5 × 20 + 0,5 × (−10) = 5.",
          { misreads: [{ value: 10, feedback: "10 soma as variações sem os pesos de 50%." }] },
        ),
        c(
          "carteira",
          "Uma pessoa tem todo o dinheiro numa única empresa, que quebra. Se tivesse dividido igualmente entre 10 empresas e só essa quebrasse, a perda seria de:",
          "10% da carteira",
          ["100% da carteira", "1% da carteira"],
          "Um décimo do dinheiro estava nela.",
          {
            feedback: [
              "Com a divisão, só a parte dessa empresa se perde.",
              "Cada empresa tinha 10%, não 1%.",
            ],
          },
        ),
        n(
          "carteira",
          "Uma carteira de R$ 20.000 tem R$ 15.000 em renda fixa, que rendeu 10%, e R$ 5.000 em ações, que caíram 20%. Qual foi o resultado total, em reais?",
          500,
          "1.500 − 1.000 = 500.",
          {
            misreads: [
              {
                value: 1500,
                feedback: "1.500 considera só a renda fixa; as ações perderam 1.000.",
              },
            ],
          },
        ),
        c(
          "carteira",
          "Diversificar entre 5 empresas do mesmo setor, que dependem dos mesmos fatores, protege:",
          "Pouco, porque elas tendem a subir e cair juntas",
          ["Totalmente, porque são 5 empresas", "Mais do que diversificar entre setores"],
          "O que protege é a diferença de comportamento.",
          {
            feedback: [
              "O número não basta se todas reagem ao mesmo problema.",
              "Setores diferentes costumam oscilar de formas diferentes.",
            ],
          },
        ),
        n(
          "carteira",
          "Uma carteira tem 70% em renda fixa e 30% em ações. Num ano, a renda fixa rendeu 10% e as ações caíram 10%. Qual foi o resultado, em porcentagem?",
          4,
          "0,7 × 10 + 0,3 × (−10) = 7 − 3 = 4.",
          {
            misreads: [
              { value: 0, feedback: "Os pesos são diferentes: a parte que rendeu 10% é maior." },
            ],
          },
        ),
        c(
          "carteira",
          "Numa crise que derruba o mercado inteiro, uma carteira diversificada só em ações:",
          "Também cai, mesmo estando diversificada",
          ["Quase não cai, porque está diversificada", "Cai mais que uma carteira concentrada"],
          "A diversificação reduz o peso de problemas de uma empresa só (risco específico), não o risco do mercado todo.",
          {
            feedback: [
              "Quedas gerais atingem quase todas as ações.",
              "Não há essa regra: a queda da diversificada fica entre a da ação que caiu menos e a da que caiu mais.",
            ],
          },
        ),
        n(
          "carteira",
          "Para ter 25% de uma carteira de R$ 8.000 em ações, quantos reais devem ir para ações?",
          2000,
          "25% de 8.000 = 2.000.",
          { misreads: [{ value: 6000, feedback: "6.000 é a parte que fica fora das ações." }] },
        ),
        c(
          "carteira",
          "Uma carteira começou com 50% em ações e 50% em renda fixa. As ações subiram muito e hoje são 70%. Rebalancear significa:",
          "Vender parte das ações e comprar renda fixa",
          [
            "Comprar mais ações, porque estão subindo",
            "Esperar as ações caírem para voltar aos 50%",
          ],
          "Rebalancear é voltar à proporção planejada de 50% e 50%, o que mantém o nível de risco escolhido.",
          {
            feedback: [
              "Comprar mais ações aumentaria ainda mais o risco e afastaria a carteira do plano.",
              "Esperar a queda é apostar no preço, não rebalancear; enquanto isso, o risco fica maior que o planejado.",
            ],
          },
        ),
      ],
    },
    {
      version: 2,
      title: "Passado não é promessa",
      objective: "Ler criticamente rentabilidades passadas, médias e comparações de desempenho.",
      introduction:
        "Rentabilidade passada não garante rentabilidade futura. Médias escondem a oscilação, e um período escolhido a dedo pode fazer qualquer investimento parecer ótimo. Ler um gráfico de desempenho exige perguntar: qual período, comparado com o quê, com quais custos.",
      specs: [
        c(
          "passado",
          "Um fundo rendeu 40% no último ano. A conclusão correta é:",
          "Que rendeu 40% naquele ano, sem garantia futura",
          [
            "Que deve render perto de 40% no próximo ano",
            "Que é o melhor investimento para qualquer pessoa",
          ],
          "Resultado passado não é promessa: o que aconteceu naquele ano não garante nada sobre o próximo.",
          {
            feedback: [
              "O próximo ano pode ser muito diferente; resultado passado não é promessa.",
              "Um ano bom não define o melhor para todos, e pode ter vindo junto com muito risco.",
            ],
          },
        ),
        n(
          "passado",
          "Um investimento rendeu +50% num ano e −50% no seguinte. A 'média' dos retornos é 0%. Quanto vale ao final um investimento de R$ 1.000, em reais?",
          750,
          "1.000 × 1,5 × 0,5 = 750.",
          {
            misreads: [
              { value: 1000, feedback: "A média aritmética de 0% engana: os fatores dão 0,75." },
            ],
          },
        ),
        c(
          "passado",
          "Um anúncio mostra o desempenho de um fundo apenas nos últimos 8 meses, que foram muito bons. O que perguntar?",
          "Como foi em períodos longos, comparado com uma referência",
          ["Nada; 8 meses bastam para avaliar", "Quantas pessoas já investiram no fundo"],
          "Períodos curtos escolhidos podem enganar.",
          {
            feedback: [
              "Oito meses podem ser um recorte favorável.",
              "O número de investidores não diz se o desempenho se repete.",
            ],
          },
        ),
        n(
          "passado",
          "Um fundo rendeu 12% no ano, e o índice de referência do mercado rendeu 15%. Em pontos percentuais, quanto o fundo ficou abaixo da referência?",
          3,
          "15 − 12 = 3 pontos.",
          { misreads: [{ value: 12, feedback: "12% é o retorno do fundo, não a diferença." }] },
        ),
        c(
          "passado",
          "Em uma simulação de 1 ano, um fundo rende 14% bruto e outro 12,5%. Ao final, as taxas descontadas são, respectivamente, 3% e 0,5% do valor inicialmente aplicado, sem impostos. Qual comparação dos rendimentos líquidos está correta?",
          "O segundo rendeu mais líquido (12% contra 11%)",
          ["O primeiro, porque 14% é maior", "Empatam"],
          "14 − 3 = 11; 12,5 − 0,5 = 12.",
          {
            feedback: ["A taxa reduz o rendimento de quem investe.", "11% e 12% são diferentes."],
          },
        ),
        n(
          "passado",
          "Um investimento de R$ 2.000 rendeu +10%, +10% e −10% em três anos. Quanto vale ao final, em reais?",
          2178,
          "2.000 × 1,1 × 1,1 × 0,9 = 2.178.",
          {
            misreads: [
              { value: 2200, feedback: "2.200 soma as taxas (10%); os fatores se multiplicam." },
            ],
          },
        ),
        c(
          "passado",
          "Qual frase é a leitura mais honesta de um gráfico de rentabilidade passada?",
          "'Neste período variou assim; o futuro pode ser diferente'",
          [
            "'Como subiu no período, tende a continuar subindo'",
            "'Quem investir agora vai ganhar o mesmo'",
          ],
          "Descreve o que o investimento fez no período, sem prometer o futuro.",
          {
            feedback: [
              "Uma alta passada pode se inverter; o gráfico não diz o que vem depois.",
              "O passado não garante o futuro.",
            ],
          },
        ),
        c(
          "passado",
          "Um amigo diz que uma ação 'só sobe' porque subiu nos últimos 3 anos. O erro de raciocínio é:",
          "Tratar um histórico de valorização como garantia futura",
          ["Nenhum; 3 anos é tempo suficiente", "Olhar só o preço, sem somar os dividendos"],
          "Tendências passadas podem se inverter.",
          {
            feedback: [
              "Três anos de alta não impedem uma queda.",
              "Dividendos importam, mas o erro principal é tratar o passado como garantia.",
            ],
          },
        ),
      ],
    },
    {
      version: 2,
      title: "Analisar sem recomendar",
      objective:
        "Montar e comparar cenários de carteiras com renda variável, declarando premissas e sem recomendação pessoal.",
      introduction:
        "Uma análise responsável compara cenários (bom, médio, ruim), mostra o que acontece com a carteira em cada um e deixa claro o que se supôs. Ela não diz o que cada pessoa deve fazer: isso depende de objetivos, prazos e tolerância a perdas.",
      estimatedMinutes: 18,
      specs: [
        n(
          "cenarios-rv",
          "Uma carteira de R$ 10.000 tem 40% em ações. Num cenário ruim, as ações caem 30% e o resto rende 8%. Qual é o valor final, em reais?",
          9280,
          "Ações: 4.000 × 0,7 = 2.800. Resto: 6.000 × 1,08 = 6.480. Total 9.280.",
          { misreads: [{ value: 7000, feedback: "Aplicou a queda de 30% à carteira inteira." }] },
        ),
        c(
          "cenarios-rv",
          "Uma carteira de R$ 10.000 tem 40% em ações e o resto em renda fixa. Num cenário bom as ações sobem 25% e a renda fixa rende 8%. O valor final é:",
          "R$ 11.480",
          ["R$ 12.500", "R$ 10.800"],
          "4.000 × 1,25 + 6.000 × 1,08 = 5.000 + 6.480.",
          {
            feedback: [
              "Aplicou a alta de 25% à carteira inteira.",
              "10.800 aplica 8% à carteira inteira.",
            ],
          },
        ),
        n(
          "cenarios-rv",
          "Entre o cenário bom (R$ 11.480) e o ruim (R$ 9.280), qual é a diferença, em reais?",
          2200,
          "11.480 − 9.280 = 2.200.",
          { misreads: [{ value: 20760, feedback: "Somou os cenários em vez de subtrair." }] },
        ),
        c(
          "cenarios-rv",
          "Numa carteira, as ações sobem 25% no cenário bom e caem 30% no ruim, enquanto a renda fixa rende 8% em ambos. Mantendo o total inicial, ao aumentar a parte em ações de 40% para 80%, a diferença entre os valores finais dos dois cenários:",
          "Aumenta, pois mais dinheiro fica exposto",
          [
            "Diminui, pois o cenário bom compensa o ruim",
            "Não muda, pois as variações das ações são as mesmas",
          ],
          "Mais peso em renda variável, maior a dispersão dos resultados: mais dinheiro fica exposto à oscilação.",
          {
            feedback: [
              "Mais ações deixam o cenário bom melhor e o ruim pior, então a distância entre eles cresce.",
              "As variações das ações são as mesmas, mas agora valem sobre uma parte maior da carteira.",
            ],
          },
        ),
        n(
          "cenarios-rv",
          "Cenários com probabilidades: 25% de o valor final ser R$ 9.280, 50% de ser R$ 10.500 e 25% de ser R$ 11.480. Qual é o valor esperado, em reais?",
          10440,
          "0,25 × 9.280 + 0,5 × 10.500 + 0,25 × 11.480 = 2.320 + 5.250 + 2.870.",
          {
            misreads: [
              {
                value: 10420,
                feedback: "10.420 é a média simples dos três cenários, sem os pesos.",
              },
            ],
          },
        ),
        c(
          "cenarios-rv",
          "Qual destas frases cabe numa análise responsável?",
          "'Com estas premissas, fica entre R$ 9.280 e R$ 11.480; a escolha depende do risco aceito'",
          [
            "'Invista 80% em ações, que é a melhor escolha para todos'",
            "'Pelas premissas adotadas, a carteira vai valer R$ 11.480'",
          ],
          "Declara as premissas, mostra o intervalo entre o cenário ruim e o bom e deixa a escolha para as preferências de cada um, sem prometer nem recomendar.",
          {
            feedback: [
              "Recomendação pessoal ignora objetivos, prazo e tolerância a perdas de cada um.",
              "R$ 11.480 é só o cenário bom; premissas não transformam um cenário em garantia.",
            ],
          },
        ),
        n(
          "cenarios-rv",
          "Uma pessoa diz que não aceitaria perder mais de 10% da carteira num ano. Num cenário em que as ações caem 40% e o resto não varia, qual é a maior porcentagem da carteira que poderia estar em ações?",
          25,
          "0,4 × p = 10% dá p = 25%.",
          { misreads: [{ value: 40, feedback: "40% é a queda das ações, não o peso máximo." }] },
        ),
        c(
          "cenarios-rv",
          "Por que uma análise de cenários não deve terminar com 'faça isto'?",
          "Porque depende do objetivo, do prazo e do risco que cada um aceita",
          [
            "Porque as contas de cenários são aproximadas demais",
            "Porque cenários nunca acertam o que vai acontecer",
          ],
          "A análise informa; a decisão depende de objetivos, prazos e tolerância a perdas de cada pessoa.",
          {
            feedback: [
              "Contas aproximadas ainda informam; o que falta é a situação de cada pessoa.",
              "Cenários podem acertar; o problema é que a decisão depende de cada pessoa.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize os passos de uma análise de cenários para uma carteira com renda variável.",
    labels: [
      "Definir a composição da carteira e o prazo",
      "Montar cenários ruim, médio e bom, com premissas declaradas",
      "Calcular o valor da carteira em cada cenário",
      "Apresentar o intervalo de resultados sem recomendar uma escolha pessoal",
    ],
    explanation:
      "Composição e prazo vêm antes dos cenários; o cálculo depende das premissas; a conclusão mostra o intervalo.",
  },
  justification: {
    prompts: [
      "Explique por que uma ação que cai 20% e depois sobe 20% não volta ao preço inicial.",
      "Explique por que dividir o dinheiro entre dez empresas de setores diferentes reduz o risco, com um exemplo numérico.",
      "Explique por que 'rendeu 40% no ano passado' não é um bom motivo, sozinho, para investir.",
    ],
    samples: [
      "Com R$ 100, cair 20% leva a R$ 80. Subir 20% de R$ 80 soma R$ 16, e o preço vai a R$ 96. A alta incide sobre um valor menor que o inicial, então as porcentagens não se anulam: o resultado é 4% abaixo.",
      "Se todo o dinheiro está numa empresa e ela quebra, perde-se 100%. Com dez partes iguais, a quebra de uma leva só 10% da carteira, e as outras nove podem até ter subido. Setores diferentes costumam reagir de formas diferentes aos mesmos acontecimentos, o que evita que tudo caia pelo mesmo motivo.",
      "O resultado de um ano diz o que aconteceu naquele período, não o que vai acontecer. Investimentos que sobem muito costumam também oscilar muito, e o ano seguinte pode trazer queda. Antes de decidir, é preciso olhar períodos longos, comparar com referências, considerar custos e, principalmente, ver se o risco combina com o objetivo e o prazo.",
    ],
    focus: "oscilação e diversificação",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      // 20% já é uma missão.
      const queda = [10, 30, 40, 50, 60][seed % 5] ?? 10;
      const alta = queda;
      const final = ((100 - queda) * (100 + alta)) / 100;
      const perda = 100 - final;
      const texto = (v: number) =>
        Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, "").replace(".", ",");
      return c(
        "queda-e-alta",
        `Uma ação cai ${queda}% num mês e sobe ${alta}% no mês seguinte. Em relação ao preço inicial, ela está:`,
        `${texto(perda)}% abaixo`,
        ["No mesmo preço", `${texto(perda)}% acima`],
        `${((100 - queda) / 100).toString().replace(".", ",")} × ${((100 + alta) / 100).toString().replace(".", ",")} = ${(final / 100).toString().replace(".", ",")}: ${texto(perda)}% abaixo.`,
        {
          feedback: [
            "Alta e queda de mesma porcentagem não se anulam: a alta incide sobre um valor menor.",
            "O sentido está trocado: o preço final é menor que o inicial.",
          ],
        },
      );
    }
    if (variant === 1) {
      const pesoA = 10 * (3 + (seed % 5));
      const pesoB = 100 - pesoA;
      const retornoA = 5 * (2 + (seed % 5));
      // Quedas que nunca anulam a alta de A nem coincidem com o resultado ponderado.
      const retornoB = -([3, 7, 11, 13][Math.floor(seed / 5) % 4] ?? 3);
      const resultado = (pesoA * retornoA + pesoB * retornoB) / 100;
      const texto = (v: number) =>
        (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ",")).replace("-", "−");
      const simples = (retornoA + retornoB) / 2;
      const alternativa = simples === resultado ? retornoA : simples;
      return c(
        "resultado-da-carteira-rv",
        `Uma carteira tem ${pesoA}% na empresa A, cuja variação foi de ${texto(retornoA)}%, e ${pesoB}% na empresa B, cuja variação foi de ${texto(retornoB)}%. Qual foi o resultado da carteira?`,
        `${texto(resultado)}%`,
        [`${texto(alternativa)}%`, `${texto(retornoA + retornoB)}%`],
        `${pesoA}% × ${texto(retornoA)} + ${pesoB}% × (${texto(retornoB)}) = ${texto(resultado)}%.`,
        {
          feedback: [
            simples === resultado
              ? "Considerou só a empresa A."
              : "Fez a média simples, sem os pesos.",
            "Somou as variações sem os pesos.",
          ],
        },
      );
    }
    // 25% e 50% já são missões.
    const queda = [20, 40, 60][seed % 3] ?? 20;
    const necessario = Math.round((100 / (100 - queda) - 1) * 1000) / 10;
    const texto = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ","));
    return c(
      "alta-para-recuperar",
      `Um investimento caiu ${queda}%. Quanto precisa subir para voltar ao valor inicial?`,
      `${texto(necessario)}%`,
      [`${queda}%`, `${texto(necessario + 100)}%`],
      `Depois da queda sobra ${100 - queda}%; para voltar a 100%, a alta é 100 ÷ ${100 - queda} − 1 ${Number.isInteger(necessario) ? "=" : "≈"} ${texto(necessario)}%.`,
      {
        feedback: [
          "Subir a mesma porcentagem da queda não recupera: a base ficou menor.",
          "É o fator 100 ÷ sobra em porcentagem; falta subtrair os 100% iniciais.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "renda-variavel",
    title: "A carteira simulada de quatro semanas",
    prompt:
      "Monte uma carteira fictícia com três ativos de setores diferentes e uma parte em renda fixa. Acompanhe, com dados públicos, a variação de preços em quatro semanas e calcule o resultado da carteira, comparando com a opção de ter tudo em renda fixa.",
    lab: "bars",
    steps: [
      "Escolha ativos com preços públicos e os pesos (a carteira é simulada, sem dinheiro real e sem recomendação) e registre os preços iniciais com a fonte.",
      "Registre os preços a cada semana e calcule o resultado da carteira ponderado pelos pesos.",
      "Compare com a renda fixa e discuta o que o resultado de quatro semanas diz e o que não diz.",
    ],
    rubric: [
      "Carteira com pesos e fontes registrados (0–2)",
      "Resultados semanais calculados com os pesos (0–3)",
      "Comparação com renda fixa (0–2)",
      "Discussão sobre período curto e passado não ser promessa (0–3)",
    ],
  },
  homeSupport: [
    "Ao ouvir notícias sobre a bolsa, conversem sobre o que significa uma queda de 10% para quem vendeu e para quem não vendeu.",
    "Quando alguém disser que um investimento 'só sobe', perguntem juntos em que período e comparado com o quê.",
  ],
};
