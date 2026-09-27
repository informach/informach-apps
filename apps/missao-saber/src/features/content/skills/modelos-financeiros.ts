import { c, n, type SkillPack } from "../skill-factory";

/**
 * Modelos financeiros: descrever situações de dinheiro com funções lineares
 * e exponenciais, comparar modelos, ler parâmetros e reconhecer limites.
 * Trilha OLITEF N3.
 */
export const modelosFinanceiros: SkillPack = {
  id: "modelos-financeiros",
  name: "Modelos financeiros",
  domain: "olitef",
  lab: "bars",
  missions: [
    {
      title: "Crescer por soma ou por fator",
      objective:
        "Distinguir modelos lineares (juros simples, parcelas fixas) de exponenciais (juros compostos) e escrever suas fórmulas.",
      introduction:
        "Quando o dinheiro cresce somando sempre o mesmo valor, o modelo é linear: M = C + C·i·t. Quando cresce multiplicando por um fator a cada período, é exponencial: M = C·(1 + i)ᵗ. A diferença é pequena no começo e enorme no longo prazo.",
      free: true,
      specs: [
        n(
          "linear-exponencial",
          "R$ 2.000 aplicados a juros simples de 1% ao mês. Quanto haverá depois de 12 meses, em reais?",
          2240,
          "2.000 + 2.000 × 0,01 × 12 = 2.240.",
          {
            misreads: [
              {
                value: 2253.65,
                feedback: "2.253,65 é o valor com juros compostos, 2.000 × 1,01¹².",
              },
            ],
          },
        ),
        c(
          "linear-exponencial",
          "Um saldo passa de R$ 1.000 para R$ 1.100 e depois para R$ 1.210 em dois anos. O modelo mais adequado é:",
          "Exponencial, com fator 1,1 ao ano",
          ["Linear, com acréscimo de R$ 100 por ano", "Linear, com acréscimo de R$ 105 por ano"],
          "1.100/1.000 = 1.210/1.100 = 1,1: razão constante.",
          {
            feedback: [
              "O segundo acréscimo foi 110, não 100.",
              "Os acréscimos foram 100 e 110, não constantes.",
            ],
          },
        ),
        n(
          "linear-exponencial",
          "Um capital de R$ 5.000 cresce 2% ao mês com juros compostos. Qual é o montante após 3 meses, em reais? Arredonde para os centavos.",
          5306.04,
          "5.000 × 1,02³ = 5.000 × 1,061208 = 5.306,04.",
          {
            misreads: [
              {
                value: 5300,
                feedback:
                  "5.300 é o valor com juros simples; nos compostos cada mês rende sobre o saldo.",
              },
            ],
          },
        ),
        c(
          "linear-exponencial",
          "Qual expressão dá o montante de C reais a juros compostos de taxa i por período, depois de t períodos?",
          "C·(1 + i)ᵗ",
          ["C·(1 + i·t)", "C + i·t"],
          "A cada período o saldo é multiplicado por (1 + i).",
          {
            feedback: [
              "C·(1 + i·t) é o montante com juros simples.",
              "C + i·t mistura taxa com dinheiro.",
            ],
          },
        ),
        n(
          "linear-exponencial",
          "Uma conta de celular tem mensalidade de R$ 45 e cobra R$ 0,30 por minuto excedente. Qual é o valor para 80 minutos excedentes, em reais?",
          69,
          "45 + 0,3 × 80 = 69.",
          { misreads: [{ value: 24, feedback: "24 é só o excedente; falta a mensalidade." }] },
        ),
        c(
          "linear-exponencial",
          "Em quanto tempo um capital dobra a juros simples de 5% ao ano?",
          "20 anos",
          ["Cerca de 14 anos", "10 anos"],
          "Juros de 100% do capital exigem 100/5 = 20 anos.",
          {
            feedback: [
              "Cerca de 14 anos é o tempo com juros compostos (1,05¹⁴ ≈ 1,98).",
              "10 anos daria só 50% de juros.",
            ],
          },
        ),
        n(
          "linear-exponencial",
          "Pela regra aproximada dos 72, em quantos anos um investimento dobra a 6% ao ano com juros compostos?",
          12,
          "72 ÷ 6 = 12; conferindo, 1,06¹² ≈ 2,01.",
          {
            misreads: [
              {
                value: 17,
                feedback: "17 ≈ 100 ÷ 6 seria o tempo com juros simples, não compostos.",
              },
            ],
          },
        ),
        c(
          "linear-exponencial",
          "Dois investimentos rendem 1% ao mês: um com juros simples, outro compostos. Depois de 1 mês:",
          "Os dois valem o mesmo",
          ["O composto vale mais", "O simples vale mais"],
          "No primeiro período os dois modelos coincidem; a diferença aparece depois.",
          {
            feedback: [
              "No primeiro mês os juros compostos ainda não incidem sobre juros.",
              "No primeiro mês os dois dão C × 1,01.",
            ],
          },
        ),
      ],
    },
    {
      title: "Ler os parâmetros",
      objective: "Interpretar taxa, prazo, valor inicial e valor fixo numa fórmula ou num gráfico.",
      introduction:
        "Todo modelo tem parâmetros com significado: o valor inicial, a taxa, o prazo, uma parte fixa. Ler o que cada número representa é o que permite usar o modelo para decidir, e não só para calcular.",
      free: true,
      specs: [
        c(
          "parametros",
          "No modelo V(t) = 800 + 150t, que descreve o saldo guardado num cofrinho, sem rendimento, com depósitos mensais, o número 150 representa:",
          "O valor depositado por mês",
          ["O saldo inicial", "A taxa de juros"],
          "É o quanto V aumenta por unidade de t.",
          {
            feedback: [
              "O saldo inicial é 800, o valor em t = 0.",
              "Não há taxa percentual num modelo de soma fixa.",
            ],
          },
        ),
        n(
          "parametros",
          "No modelo M(t) = 3.000 × 1,04ᵗ, qual é a taxa de crescimento por período, em porcentagem?",
          4,
          "O fator 1,04 corresponde a 4% por período.",
          {
            misreads: [
              { value: 104, feedback: "104% é o fator inteiro; a taxa é o que passa de 100%." },
            ],
          },
        ),
        c(
          "parametros",
          "Um carro que vale R$ 60.000 perde 15% do valor por ano. Qual modelo descreve o valor após t anos?",
          "V(t) = 60.000 × 0,85ᵗ",
          ["V(t) = 60.000 − 15t", "V(t) = 60.000 × 1,15ᵗ"],
          "Perder 15% é multiplicar por 0,85 a cada ano.",
          {
            feedback: ["Tira 15 reais por ano, não 15%.", "Esse modelo faria o valor crescer."],
          },
        ),
        n(
          "parametros",
          "No modelo C(x) = 1.200 + 35x, para o custo mensal de uma pequena confeitaria que produz x bolos, qual é o custo fixo, em reais?",
          1200,
          "O custo quando x = 0.",
          { misreads: [{ value: 35, feedback: "35 é o custo de cada bolo, a parte que varia." }] },
        ),
        c(
          "parametros",
          "No gráfico de um investimento com juros compostos, o formato da curva é:",
          "Uma curva que sobe cada vez mais rápido",
          ["Uma reta", "Uma curva que sobe cada vez mais devagar"],
          "O acréscimo de cada período é maior que o anterior.",
          {
            feedback: [
              "Reta é juros simples.",
              "Subir cada vez mais devagar seria o contrário do efeito dos juros sobre juros.",
            ],
          },
        ),
        n(
          "parametros",
          "A confeitaria de custo C(x) = 1.200 + 35x vende cada bolo por R$ 75. Quantos bolos por mês ela precisa vender para não ter prejuízo?",
          30,
          "Receita 75x igual ao custo: 75x = 1.200 + 35x dá x = 30.",
          {
            misreads: [
              { value: 16, feedback: "16 = 1.200 ÷ 75 esquece que cada bolo também custa 35." },
            ],
          },
        ),
        c(
          "parametros",
          "Se no modelo M(t) = C·(1 + i)ᵗ a taxa i dobrar, o montante depois de t períodos:",
          "Aumenta, mas em geral não dobra",
          ["Dobra exatamente, para qualquer prazo", "Dobra apenas quando t = 1"],
          "(1 + 2i)ᵗ não é o dobro de (1 + i)ᵗ em geral: o montante cresce, mas não na mesma proporção da taxa.",
          {
            feedback: [
              "Dobrar a taxa não dobra o montante: com i = 10% e t = 2, o fator vai de 1,21 para 1,44, não para 2,42.",
              "Nem com t = 1 dobra: com i = 10%, o montante vai de C·1,1 para C·1,2, longe de C·2,2.",
            ],
          },
        ),
        n(
          "parametros",
          "Uma dívida cresce segundo D(t) = 500 × 1,1ᵗ, com t em meses. Qual é a dívida depois de 2 meses, em reais?",
          605,
          "500 × 1,21 = 605.",
          {
            misreads: [
              {
                value: 600,
                feedback: "600 soma 10% duas vezes sobre 500; no segundo mês a base é 550.",
              },
            ],
          },
        ),
      ],
    },
    {
      title: "Comparar modelos",
      objective:
        "Achar o ponto em que duas opções se igualam e decidir qual é melhor em cada faixa.",
      introduction:
        "Comparar duas opções é comparar dois modelos. O ponto de empate separa as faixas em que uma ou outra é melhor. Com modelos lineares a conta é direta; com exponenciais, tabelas e aproximações ajudam.",
      specs: [
        n(
          "comparar",
          "Um aplicativo de transporte cobra R$ 6 fixos mais R$ 2 por km; outro cobra R$ 3,50 por km sem taxa fixa. A partir de quantos km, em números inteiros, o primeiro fica mais barato?",
          5,
          "6 + 2k = 3,5k dá k = 4 (empate). Com 5 km: 16 contra 17,50.",
          {
            misreads: [
              {
                value: 4,
                feedback:
                  "Em 4 km os dois custam o mesmo; mais barato só a partir do próximo quilômetro.",
              },
            ],
          },
        ),
        c(
          "comparar",
          "Opção A: R$ 100 fixos por mês. Opção B: R$ 40 mais R$ 5 por uso. Para quem usa 15 vezes por mês, a melhor opção é:",
          "A, que custa 100 contra 115",
          ["B, porque tem menor valor fixo", "Empatam"],
          "B: 40 + 5 × 15 = 115.",
          {
            feedback: [
              "O valor fixo menor não compensa com 15 usos.",
              "O empate acontece em 12 usos.",
            ],
          },
        ),
        n(
          "comparar",
          "Um investimento rende juros simples de 12% ao ano e outro juros compostos de 10% ao ano, ambos sobre R$ 1.000. Depois de quantos anos inteiros o composto passa o simples pela primeira vez?",
          5,
          "Simples: 1.120, 1.240, 1.360, 1.480, 1.600. Compostos: 1.100, 1.210, 1.331, 1.464,10, 1.610,51. O composto passa no 5º ano.",
          {
            misreads: [
              {
                value: 4,
                feedback: "No 4º ano o composto ainda está atrás: 1.464,10 contra 1.480.",
              },
            ],
          },
        ),
        c(
          "comparar",
          "Uma pessoa pode receber R$ 10.000 hoje ou R$ 11.000 daqui a um ano. Se ela consegue aplicar a 12% ao ano sem risco:",
          "Receber hoje é melhor, porque vira R$ 11.200 em um ano",
          ["Receber depois é melhor, porque 11.000 é mais que 10.000", "São equivalentes"],
          "10.000 × 1,12 = 11.200 > 11.000.",
          {
            feedback: [
              "Comparar valores em datas diferentes exige levar para a mesma data.",
              "Só seriam equivalentes com taxa de 10%.",
            ],
          },
        ),
        n(
          "comparar",
          "Um plano A custa R$ 80 por mês e um plano B custa R$ 900 por ano pago de uma vez. Quantos reais por ano o plano B economiza em relação ao A?",
          60,
          "A: 80 × 12 = 960; B: 900. Diferença 60.",
          {
            misreads: [{ value: 820, feedback: "820 compara o preço anual de B com um mês de A." }],
          },
        ),
        c(
          "comparar",
          "Dois modelos, um linear crescente e um exponencial crescente, começam no mesmo valor. No longo prazo:",
          "O exponencial acaba passando o linear",
          ["O linear fica acima se for bem inclinado", "A distância entre eles se estabiliza"],
          "Com fator maior que 1, o crescimento por fator acaba superando qualquer crescimento por soma fixa, qualquer que seja a inclinação da reta.",
          {
            feedback: [
              "Uma inclinação grande só adia o cruzamento: no começo o linear pode ficar acima, mas não para sempre.",
              "A distância cresce sem limite, porque o acréscimo do exponencial aumenta a cada período.",
            ],
          },
        ),
        n(
          "comparar",
          "Uma assinatura custa R$ 30 no 1º mês e aumenta R$ 2 a cada mês seguinte. Outra custa sempre R$ 40. Em que mês a primeira passa a custar mais que a segunda?",
          7,
          "Mês m custa 30 + 2(m − 1); passa de 40 quando m − 1 > 5, ou seja, m = 7 (42).",
          {
            misreads: [
              { value: 6, feedback: "No 6º mês a primeira custa exatamente 40, igual à segunda." },
            ],
          },
        ),
        c(
          "comparar",
          "Para escolher entre duas opções modeladas, o ponto de empate serve para:",
          "Separar as faixas de uso em que cada opção é a melhor",
          ["Mostrar que as duas são sempre iguais", "Escolher automaticamente a opção mais barata"],
          "Abaixo do empate uma vence, acima a outra.",
          {
            feedback: [
              "Só são iguais naquele ponto.",
              "A escolha depende de onde o uso real fica em relação ao empate.",
            ],
          },
        ),
      ],
    },
    {
      title: "Taxas equivalentes",
      objective: "Converter taxas entre períodos e reconhecer taxas nominais e efetivas.",
      introduction:
        "Uma taxa mensal i equivale a uma anual de (1 + i)¹² − 1, e não a 12i. Uma taxa 'nominal' anunciada por ano com capitalização mensal rende efetivamente mais do que o número anunciado.",
      specs: [
        n(
          "equivalentes",
          "Qual taxa anual equivale a 1% ao mês com juros compostos? Responda em porcentagem, com duas casas decimais.",
          12.68,
          "1,01¹² − 1 ≈ 0,1268.",
          {
            misreads: [
              {
                value: 12,
                feedback: "12% soma as taxas; com juros compostos a taxa anual é maior.",
              },
            ],
          },
        ),
        c(
          "equivalentes",
          "Uma taxa de 21% ao ano equivale, com juros compostos, a quanto em dois anos?",
          "46,41%",
          ["42%", "21%"],
          "1,21² − 1 = 0,4641.",
          {
            feedback: ["42% soma as taxas dos dois anos.", "21% é a taxa de um ano só."],
          },
        ),
        n(
          "equivalentes",
          "Uma taxa de 44% em dois anos equivale a quanto ao ano, com juros compostos? Responda em porcentagem.",
          20,
          "√1,44 = 1,2: 20% ao ano.",
          {
            misreads: [
              {
                value: 22,
                feedback: "22% divide a taxa por 2; com juros compostos se tira a raiz do fator.",
              },
            ],
          },
        ),
        c(
          "equivalentes",
          "Um cartão anuncia '12% ao ano, capitalizados mensalmente'. A taxa efetiva anual é:",
          "Cerca de 12,68%",
          ["Exatamente 12%", "144%"],
          "1% ao mês capitalizado 12 vezes: 1,01¹² ≈ 1,1268.",
          {
            feedback: [
              "A capitalização mensal faz render juros sobre juros.",
              "144% multiplica 12 por 12.",
            ],
          },
        ),
        n(
          "equivalentes",
          "Uma dívida de cartão cobra 10% ao mês com juros compostos. Supondo essa taxa por 3 meses, qual é a taxa efetiva no período? Responda em porcentagem, com uma casa decimal.",
          33.1,
          "1,1³ − 1 = 0,331.",
          { misreads: [{ value: 30, feedback: "30% soma as taxas mensais." }] },
        ),
        c(
          "equivalentes",
          "Qual taxa mensal, aproximadamente, equivale a 26,82% ao ano?",
          "2% ao mês",
          ["2,24% ao mês", "1,5% ao mês"],
          "1,02¹² ≈ 1,2682.",
          {
            feedback: [
              "2,24% é a divisão simples por 12, que ignora a capitalização.",
              "1,5% ao mês dá cerca de 19,6% ao ano.",
            ],
          },
        ),
        n(
          "equivalentes",
          "Uma loja vende um produto por R$ 190 à vista ou em 2 × R$ 100 'sem juros', a primeira parcela no ato da compra. Qual é a taxa de juros mensal embutida, em porcentagem, arredondada para uma casa decimal?",
          11.1,
          "Paga 100 na hora e financia 90, devolvendo 100 um mês depois: 100/90 − 1 ≈ 11,1%.",
          {
            misreads: [
              {
                value: 5.3,
                feedback: "5,3% compara 200 com 190, mas a primeira parcela é paga na hora.",
              },
            ],
          },
        ),
        c(
          "equivalentes",
          "Por que comparar uma taxa mensal com uma anual exige convertê-las para o mesmo período?",
          "Porque só dá para comparar taxas do mesmo período",
          ["Porque a anual é sempre 12 vezes a mensal", "Não exige; basta olhar o número maior"],
          "Taxas de períodos diferentes não se comparam diretamente, e com juros compostos a conversão não é proporcional: 1% ao mês não é 12% ao ano, é 12,68%.",
          {
            feedback: [
              "Multiplicar por 12 é o erro que a conversão evita: com juros compostos, 1% ao mês dá 12,68% ao ano.",
              "Um número maior pode ser de um período maior: 10% ao ano rende menos que 1% ao mês.",
            ],
          },
        ),
      ],
    },
    {
      title: "Modelar para decidir",
      objective:
        "Construir um modelo a partir de uma situação, calcular e declarar premissas e limites.",
      introduction:
        "Uma análise financeira honesta tem quatro partes: premissas (o que se supõe), cálculo, limite (quando o modelo deixa de valer) e conclusão. Taxas mudam, rendas mudam e imprevistos acontecem: o modelo orienta, mas não garante.",
      estimatedMinutes: 18,
      specs: [
        n(
          "decidir",
          "Uma pessoa quer ter R$ 12.000 em 2 anos, guardando o mesmo valor todo mês sem rendimento. Quanto deve guardar por mês, em reais?",
          500,
          "12.000 ÷ 24 = 500.",
          { misreads: [{ value: 1000, feedback: "1.000 divide por 12, mas são 24 meses." }] },
        ),
        c(
          "decidir",
          "No item anterior, se o dinheiro guardado render juros, o valor mensal necessário:",
          "Diminui, pois parte da meta vem dos juros",
          [
            "Fica igual, pois a meta continua sendo R$ 12.000",
            "Aumenta, para cobrir o imposto sobre os juros",
          ],
          "Parte dos R$ 12.000 viria dos juros, então cada depósito pode ser menor.",
          {
            feedback: [
              "A meta é a mesma, mas os juros somam ao saldo, então os depósitos podem ser menores.",
              "O imposto leva só uma parte do rendimento; o que sobra ainda ajuda a chegar à meta.",
            ],
          },
        ),
        n(
          "decidir",
          "Um financiamento de R$ 10.000 a 2% ao mês é pago em uma única parcela depois de 6 meses. Qual é o valor da parcela, em reais? Arredonde para os centavos.",
          11261.62,
          "10.000 × 1,02⁶ ≈ 11.261,62.",
          {
            misreads: [
              {
                value: 11200,
                feedback: "11.200 é juros simples; o financiamento cobra juros compostos.",
              },
            ],
          },
        ),
        c(
          "decidir",
          "Uma análise diz: 'guardando R$ 300 por mês a 1% ao mês por 30 anos, você terá mais de R$ 1 milhão'. A premissa mais frágil é:",
          "Supor a mesma taxa e o mesmo depósito por 30 anos",
          [
            "Usar juros compostos em vez de juros simples",
            "Considerar depósitos mensais, e não anuais",
          ],
          "Em 30 anos taxas, inflação e renda mudam; o valor nominal também perde poder de compra.",
          {
            feedback: [
              "Juros compostos são o modelo certo para uma aplicação que rende sobre o saldo.",
              "Mensal ou anual é só a forma de organizar os depósitos; frágil é supor o mesmo valor e a mesma taxa por 30 anos.",
            ],
          },
        ),
        n(
          "decidir",
          "Uma família gasta R$ 400 por mês com um serviço que pode ser trocado por outro de R$ 250. Se guardar a diferença, sem rendimento, quanto terá em 18 meses, em reais?",
          2700,
          "150 × 18 = 2.700.",
          {
            misreads: [
              { value: 4500, feedback: "4.500 usa 250 por mês; a economia é a diferença, 150." },
            ],
          },
        ),
        c(
          "decidir",
          "Qual destas é uma conclusão responsável de uma análise com modelo?",
          "'Com esta taxa, A custa menos até 20 meses; se ela subir, o empate muda'",
          [
            "'A opção A custa menos que B, qualquer que seja o prazo'",
            "'O modelo prova que A custará menos por 20 meses, com certeza'",
          ],
          "A conclusão responsável cita a premissa (a taxa) e o limite (o que muda se ela subir).",
          {
            feedback: [
              "Ignora o ponto de empate: pelo próprio modelo, A só custa menos até 20 meses.",
              "Modelos orientam, não garantem: se a taxa mudar, o resultado muda junto.",
            ],
          },
        ),
        n(
          "decidir",
          "Um curso custa R$ 6.000 à vista ou 12 parcelas de R$ 560. Quanto se paga a mais parcelando, em reais?",
          720,
          "12 × 560 = 6.720; 6.720 − 6.000 = 720.",
          { misreads: [{ value: 6720, feedback: "6.720 é o total parcelado, não a diferença." }] },
        ),
        c(
          "decidir",
          "Ao apresentar um modelo financeiro, por que declarar o limite de validade?",
          "Porque fora das condições supostas o resultado pode falhar",
          [
            "Porque todo modelo está errado e não serve",
            "Porque dentro do limite o resultado é garantido",
          ],
          "Fora das condições supostas o resultado pode estar muito errado, e quem decide precisa saber disso. Limite honesto é parte da análise.",
          {
            feedback: [
              "Modelos servem, dentro das condições que supõem; o limite mostra onde confiar neles.",
              "Nem dentro do limite há garantia: ele só indica onde o modelo é razoável.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize as partes de uma análise financeira com modelo.",
    labels: [
      "Declarar as premissas: valores, taxas e prazos supostos",
      "Escrever o modelo e fazer o cálculo",
      "Testar o resultado com outra taxa ou prazo e indicar quando a conclusão muda",
      "Apresentar a conclusão ligada às premissas",
    ],
    explanation:
      "A conclusão só faz sentido depois do cálculo e dos limites, e o cálculo depende das premissas.",
  },
  justification: {
    prompts: [
      "Explique por que 1% ao mês não equivale a 12% ao ano com juros compostos.",
      "Explique como um ponto de empate ajuda a escolher entre duas opções de preço com parte fixa e parte variável.",
      "Aponte a premissa mais frágil de uma projeção de 30 anos com taxa constante e explique por quê.",
    ],
    samples: [
      "Com juros compostos, os juros de cada mês passam a render nos meses seguintes. Em um ano o fator é 1,01 elevado a 12, cerca de 1,1268, ou seja, 12,68%. Os 0,68 ponto a mais vêm dos juros sobre juros. Somar 1% doze vezes só valeria com juros simples.",
      "Escrevo o custo de cada opção em função do uso, igualo e acho o uso do empate. Abaixo desse uso, a opção com parte fixa menor é mais barata; acima, a com custo por uso menor. Assim a escolha depende de quanto a pessoa realmente usa, e não de qual número parece menor no anúncio.",
      "A premissa mais frágil é supor a mesma taxa por 30 anos. Taxas de juros e inflação mudam muito em três décadas, e a renda de quem guarda também. Além disso, um milhão daqui a 30 anos compra muito menos do que hoje. A projeção serve para mostrar o efeito dos juros compostos, não para prometer um valor.",
    ],
    focus: "premissas, cálculo e limites",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const capital = 1000 * (2 + (seed % 7));
      const taxa = 1 + (seed % 3);
      const meses = 6 + (Math.floor(seed / 3) % 7);
      const juros = (capital * taxa * meses) / 100;
      const real = (v: number) => v.toLocaleString("pt-BR");
      return c(
        "montante-simples",
        `Um capital de R$ ${real(capital)} é aplicado a juros simples de ${taxa}% ao mês por ${meses} meses. Qual é o montante no final?`,
        `R$ ${real(capital + juros)}`,
        [`R$ ${real(juros)}`, `R$ ${real(capital + juros / meses)}`],
        `Juros: ${real(capital)} × ${taxa}% × ${meses} = ${real(juros)}; montante ${real(capital + juros)}.`,
        {
          feedback: [
            "Esses são só os juros; o montante soma o capital.",
            "Esse é o montante de um mês só.",
          ],
        },
      );
    }
    if (variant === 1) {
      const fixo = 10 * (3 + (seed % 7));
      const porUso = 2 + (seed % 4);
      const semFixo = porUso + 1 + (Math.floor(seed / 4) % 3);
      const empate = fixo / (semFixo - porUso);
      const inteiro = Number.isInteger(empate);
      const primeiro = inteiro ? empate + 1 : Math.ceil(empate);
      const ingenuo = Math.round(fixo / porUso);
      const segunda = ingenuo !== primeiro && ingenuo !== primeiro - 1 ? ingenuo : primeiro + 3;
      return c(
        "a-partir-de-quando-compensa",
        `Um serviço cobra R$ ${fixo} fixos por mês mais R$ ${porUso} por uso. Outro cobra R$ ${semFixo} por uso, sem parte fixa. A partir de quantos usos no mês o primeiro fica mais barato?`,
        `${primeiro}`,
        [`${primeiro - 1}`, `${segunda}`],
        `Empate: ${fixo} + ${porUso}u = ${semFixo}u dá u ${inteiro ? `= ${empate}` : `≈ ${empate.toFixed(1).replace(".", ",")}`}. O primeiro fica mais barato a partir de ${primeiro} usos.`,
        {
          feedback: [
            "Nesse número de usos os dois custam o mesmo ou o segundo ainda é mais barato.",
            segunda === Math.round(fixo / porUso)
              ? "Dividiu a parte fixa pelo preço por uso do próprio serviço, ignorando o outro."
              : "Esse número passa do necessário: confira o ponto de empate.",
          ],
        },
      );
    }
    const taxa = [1, 2, 3][seed % 3] ?? 1;
    const meses = [6, 12][Math.floor(seed / 3) % 2] ?? 12;
    const efetiva = Math.round(((1 + taxa / 100) ** meses - 1) * 10000) / 100;
    const texto = (v: number) => v.toFixed(2).replace(".", ",");
    return c(
      "taxa-equivalente",
      `Uma aplicação rende ${taxa}% ao mês com juros compostos. Qual é a taxa equivalente em ${meses} meses?`,
      `${texto(efetiva)}%`,
      [`${texto(taxa * meses)}%`, `${texto(efetiva + 100)}%`],
      `(1 + ${taxa}%) elevado a ${meses}, menos 1: ≈ ${texto(efetiva)}%.`,
      {
        feedback: [
          "Multiplicou a taxa pelo número de meses, como se fossem juros simples.",
          "Esse é o fator acumulado em porcentagem; a taxa é o que passa de 100%.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "modelos-financeiros",
    title: "O modelo de uma escolha da casa",
    prompt:
      "Escolha uma decisão real da família que envolva dinheiro no tempo (trocar de plano, comprar à vista ou parcelado, guardar para uma meta). Construa um modelo, calcule, declare premissas e limites e escreva uma conclusão responsável.",
    lab: "bars",
    steps: [
      "Descreva a decisão e as opções, com valores reais ou estimados.",
      "Escreva o modelo de cada opção e calcule o ponto de empate ou o resultado final.",
      "Declare premissas e limites e escreva a conclusão ligada a eles.",
    ],
    rubric: [
      "Opções descritas com dados (0–2)",
      "Modelos e cálculos corretos (0–3)",
      "Premissas e limites declarados com honestidade (0–3)",
      "Conclusão ligada às premissas, sem prometer resultado (0–2)",
    ],
  },
  homeSupport: [
    "Ao ver uma oferta de parcelamento, montem juntos os dois modelos (à vista e parcelado) e perguntem qual taxa está embutida.",
    "Conversem sobre uma projeção de longo prazo vista em anúncio e identifiquem quais premissas ela esconde.",
  ],
};
