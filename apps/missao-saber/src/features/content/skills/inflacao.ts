import { c, n, type SkillPack } from "../skill-factory";

/**
 * Inflação: preços que sobem, poder de compra que cai, índices e reajustes,
 * ganho real e nominal, e leitura de gráficos e afirmações sobre inflação.
 * Trilha OLITEF N2.
 */
export const inflacao: SkillPack = {
  id: "inflacao",
  name: "Inflação e poder de compra",
  domain: "olitef",
  lab: "bars",
  missions: [
    {
      title: "Quando o dinheiro compra menos",
      objective: "Entender inflação como aumento geral de preços e seu efeito no poder de compra.",
      introduction:
        "Inflação é quando os preços sobem em geral e o mesmo dinheiro compra menos. A conta de quanto se perde compara o que cabia antes com o que cabe depois.",
      specs: [
        n(
          "poder-de-compra",
          "Um pão custava R$ 0,50 e passou a custar R$ 0,80. Quantos pães a menos R$ 20 compram agora?",
          15,
          "Antes: 20 ÷ 0,5 = 40 pães; agora: 20 ÷ 0,8 = 25; diferença 15.",
          {
            misreads: [
              { value: 25, feedback: "25 é a quantidade de agora; a pergunta pede a diferença." },
            ],
          },
        ),
        c(
          "conceito",
          "Inflação significa:",
          "Aumento geral e contínuo dos preços, que reduz o poder de compra do dinheiro",
          ["Aumento do preço de um único produto", "Queda dos salários"],
          "A inflação é medida por uma cesta de produtos e serviços, não por um item isolado.",
          {
            feedback: [
              "Um produto pode subir por motivo próprio, como uma safra ruim; inflação é o conjunto.",
              "Salários podem até subir; o que cai é o quanto eles compram.",
            ],
          },
        ),
        n(
          "poder-de-compra",
          "Uma cesta de compras custava R$ 400 e, com inflação de 6% no ano, passou a custar quanto, em reais?",
          424,
          "400 × 1,06 = 424.",
          { misreads: [{ value: 406, feedback: "Somou 6 reais em vez de 6%." }] },
        ),
        c(
          "poder-de-compra",
          "Se os preços sobem 25%, R$ 100 passam a comprar o mesmo que quantos reais compravam antes?",
          "R$ 80",
          ["R$ 75", "R$ 125"],
          "100 ÷ 1,25 = 80: o dinheiro perdeu 20% do poder de compra.",
          {
            feedback: [
              "R$ 75 tira 25% de 100, mas a perda de poder de compra é 1 − 1/1,25 = 20%.",
              "R$ 125 é o que custa agora o que custava 100.",
            ],
          },
        ),
        n(
          "poder-de-compra",
          "Uma mesada de R$ 100 não mudou em um ano com inflação de 10%. Quanto ela vale hoje em poder de compra do ano passado, em reais? Arredonde para os centavos.",
          90.91,
          "100 ÷ 1,1 = 90,91: compra o que 90,91 compravam antes.",
          {
            misreads: [
              {
                value: 90,
                feedback:
                  "90 tira 10% de 100, mas a perda de poder de compra é 1 − 1/1,1, cerca de 9,1%.",
              },
            ],
          },
        ),
        c(
          "conceito",
          "Quem mais perde com inflação alta é quem:",
          "Guarda dinheiro parado, sem rendimento",
          [
            "Tem dívida com juros fixos abaixo da inflação",
            "Tem salário reajustado acima da inflação",
          ],
          "Dinheiro parado compra menos a cada mês.",
          {
            feedback: [
              "Uma dívida fixa fica mais leve em poder de compra quando os preços sobem.",
              "Reajuste acima da inflação aumenta o poder de compra.",
            ],
          },
        ),
        n(
          "poder-de-compra",
          "Uma passagem de ônibus subiu de R$ 4,40 para R$ 5,50. De quantos por cento foi o aumento?",
          25,
          "5,5 ÷ 4,4 = 1,25: aumento de 25%.",
          {
            misreads: [
              {
                value: 1.1,
                feedback: "1,10 é a diferença em reais; a porcentagem compara com 4,40.",
              },
            ],
          },
        ),
        c(
          "conceito",
          "Uma cesta com 4 produtos teve variações de +10%, +2%, 0% e −4% no ano. A inflação dessa cesta, se cada produto pesa igual no gasto, foi de:",
          "2%",
          ["8%", "10%"],
          "A média das variações: (10 + 2 + 0 − 4) ÷ 4 = 2%.",
          {
            feedback: ["8% soma sem dividir pelos 4 produtos.", "10% é só o maior aumento."],
          },
        ),
      ],
    },
    {
      title: "Reajuste é para repor",
      objective: "Calcular reajustes que repõem a inflação e reconhecer ganho ou perda real.",
      introduction:
        "Um reajuste igual à inflação mantém o poder de compra; abaixo dela é perda real, acima é ganho real. O ganho real vem da divisão dos fatores, não da subtração das taxas.",
      specs: [
        n(
          "reajuste",
          "Um salário de R$ 2.500 precisa de um reajuste que reponha uma inflação de 4%. Qual é o novo salário, em reais?",
          2600,
          "2.500 × 1,04 = 2.600.",
          { misreads: [{ value: 2504, feedback: "Somou 4 reais em vez de 4%." }] },
        ),
        c(
          "ganho-real",
          "Um salário subiu 8% em um ano em que a inflação foi 5%. O ganho real foi:",
          "Cerca de 2,9%",
          ["3%", "13%"],
          "1,08 ÷ 1,05 é cerca de 1,029: ganho real de 2,9%.",
          {
            feedback: [
              "3% é a subtração das taxas; o ganho real divide os fatores, e dá um pouco menos.",
              "13% soma as taxas, o que não tem sentido aqui.",
            ],
          },
        ),
        n(
          "reajuste",
          "O aluguel de R$ 1.200 foi reajustado pela inflação de 5% no primeiro ano e 4% no segundo. Quanto ficou, em reais?",
          1310.4,
          "1.200 × 1,05 = 1.260; 1.260 × 1,04 = 1.310,40.",
          {
            misreads: [
              {
                value: 1308,
                feedback: "Somou as taxas (9%); o segundo reajuste incide sobre 1.260.",
              },
            ],
          },
        ),
        c(
          "ganho-real",
          "Uma mesada subiu de R$ 50 para R$ 52 em um ano com inflação de 6%. Em poder de compra, a mesada:",
          "Perdeu valor, porque subiu 4% e os preços subiram 6%",
          ["Ganhou valor, porque aumentou 2 reais", "Ficou igual"],
          "52 ÷ 50 = 1,04 < 1,06.",
          {
            feedback: [
              "Aumentar em reais não basta se os preços subiram mais.",
              "Igual seria um reajuste de 6%: R$ 53.",
            ],
          },
        ),
        n(
          "reajuste",
          "Para manter o poder de compra depois de uma inflação de 12%, um valor de R$ 850 deveria ir a quanto, em reais?",
          952,
          "850 × 1,12 = 952.",
          { misreads: [{ value: 862, feedback: "Somou 12 reais em vez de 12%." }] },
        ),
        c(
          "ganho-real",
          "Um investimento rendeu 10% em um ano com inflação de 10%. Em poder de compra, o investidor:",
          "Ficou no mesmo lugar: rendimento real zero",
          ["Ganhou 10%", "Ganhou 20%"],
          "1,10 ÷ 1,10 = 1.",
          {
            feedback: [
              "Os 10% de rendimento só repuseram a inflação.",
              "Somar rendimento e inflação não tem sentido.",
            ],
          },
        ),
        n(
          "reajuste",
          "Um produto custava R$ 60 há dois anos. A inflação foi 10% em cada ano. Se hoje ele custa R$ 66, ele ficou quantos por cento mais barato em termos reais? Arredonde para o inteiro mais próximo.",
          9,
          "Acompanhando a inflação, custaria 60 × 1,21 = 72,60; 66 ÷ 72,60 = 0,909: cerca de 9% mais barato em termos reais.",
          {
            misreads: [
              {
                value: 10,
                feedback:
                  "10% divide a diferença de 6,60 pelo preço de hoje (66); o desconto real compara com o preço corrigido: 6,60 ÷ 72,60 = 9,1%.",
              },
            ],
          },
        ),
        c(
          "ganho-real",
          "Uma poupança rendeu 6% em um ano; a inflação foi 7%. O que aconteceu com o dinheiro?",
          "Aumentou em reais e diminuiu em poder de compra",
          ["Aumentou em poder de compra", "Diminuiu em reais"],
          "Há mais reais na conta, mas eles compram menos do que antes.",
          {
            feedback: ["Render menos que a inflação é perda real.", "Em reais o saldo cresceu 6%."],
          },
        ),
      ],
    },
    {
      title: "Índices e cestas",
      objective: "Ler índices de preços, pesos de uma cesta e variação acumulada.",
      introduction:
        "Um índice de preços acompanha uma cesta com pesos: o que pesa mais no gasto pesa mais no índice. Variações mensais se acumulam por multiplicação.",
      specs: [
        n(
          "indice",
          "Um índice de preços valia 100 em janeiro e 104 em dezembro. Qual foi a inflação do ano, em porcentagem?",
          4,
          "104 ÷ 100 = 1,04: 4%.",
          { misreads: [{ value: 104, feedback: "104 é o valor do índice, não a variação." }] },
        ),
        c(
          "cesta-com-pesos",
          "Em uma cesta, alimentação pesa 40% e subiu 10%; o restante pesa 60% e subiu 0%. A inflação da cesta foi:",
          "4%",
          ["10%", "5%"],
          "0,4 × 10% + 0,6 × 0% = 4%.",
          {
            feedback: [
              "10% foi só a alimentação, que pesa 40%.",
              "5% seria a média simples, ignorando os pesos.",
            ],
          },
        ),
        n(
          "acumulado",
          "A inflação foi 2% em um mês e 3% no mês seguinte. Qual foi a inflação acumulada nos dois meses, em porcentagem? Responda com duas casas decimais.",
          5.06,
          "1,02 × 1,03 = 1,0506: 5,06%.",
          {
            misreads: [
              { value: 5, feedback: "Somou as taxas; o acumulado multiplica os fatores." },
            ],
          },
        ),
        c(
          "cesta-com-pesos",
          "Uma família gasta 50% com moradia, 30% com alimentação e 20% com transporte. Moradia subiu 2%, alimentação 8% e transporte 5%. A inflação sentida por essa família foi de:",
          "4,4%",
          ["5%", "15%"],
          "0,5 × 2 + 0,3 × 8 + 0,2 × 5 = 1 + 2,4 + 1 = 4,4%.",
          {
            feedback: [
              "5% é a média simples das três variações.",
              "15% soma as variações sem os pesos.",
            ],
          },
        ),
        n(
          "indice",
          "Um índice passou de 120 para 132. Qual foi a variação percentual?",
          10,
          "132 ÷ 120 = 1,1: 10%.",
          {
            misreads: [
              { value: 12, feedback: "12 é a diferença de pontos; a porcentagem compara com 120." },
            ],
          },
        ),
        c(
          "acumulado",
          "Se a inflação foi 1% ao mês durante 12 meses, a inflação do ano fica:",
          "Um pouco acima de 12%, cerca de 12,7%",
          ["Exatamente 12%", "Menos de 12%"],
          "1,01¹² é cerca de 1,127.",
          {
            feedback: [
              "Multiplicar os fatores dá mais que somar as taxas.",
              "Acumular aumentos nunca dá menos que a soma.",
            ],
          },
        ),
        n(
          "acumulado",
          "Depois de dois anos com inflação de 5% e 8%, um índice que valia 200 passa a valer quanto?",
          226.8,
          "200 × 1,05 × 1,08 = 226,80.",
          {
            misreads: [
              { value: 226, feedback: "Somou as taxas (13%); o segundo ano incide sobre 210." },
            ],
          },
        ),
        c(
          "cesta-com-pesos",
          "Duas famílias veem a mesma inflação oficial de 5%. A família que gasta mais com o item que mais subiu:",
          "Sente uma inflação maior que a oficial",
          ["Sente exatamente 5%", "Sente uma inflação menor que a oficial"],
          "O índice oficial usa pesos médios; cada família tem os seus.",
          {
            feedback: [
              "A inflação oficial é uma média; a de cada família depende dos seus pesos.",
              "Gastar mais com o que mais subiu aumenta a inflação sentida.",
            ],
          },
        ),
      ],
    },
    {
      title: "Preços no tempo",
      objective: "Comparar valores de épocas diferentes e ler gráficos de inflação.",
      introduction:
        "Comparar R$ 100 de hoje com R$ 100 de anos atrás exige corrigir pela inflação acumulada. Um gráfico de inflação mostra a velocidade de subida, não o nível dos preços.",
      specs: [
        n(
          "corrigir-valores",
          "Um brinquedo custava R$ 80 há 3 anos, e a inflação acumulada no período foi 25%. Quanto custaria hoje só pela inflação, em reais?",
          100,
          "80 × 1,25 = 100.",
          { misreads: [{ value: 105, feedback: "Somou 25 reais em vez de 25%." }] },
        ),
        c(
          "corrigir-valores",
          "Um salário de R$ 1.000 em 2016 equivale hoje, com inflação acumulada de 60%, a:",
          "R$ 1.600",
          ["R$ 1.060", "R$ 625"],
          "1.000 × 1,6 = 1.600.",
          {
            feedback: [
              "R$ 1.060 soma 60 reais em vez de 60%.",
              "R$ 625 é o cálculo ao contrário: quanto 1.000 de hoje valiam em 2016.",
            ],
          },
        ),
        n(
          "corrigir-valores",
          "Se a inflação acumulada em 10 anos foi 100%, R$ 500 de hoje equivalem a quantos reais de 10 anos atrás?",
          250,
          "500 ÷ 2 = 250.",
          {
            misreads: [
              { value: 1000, feedback: "1.000 seria levar 500 de dez anos atrás para hoje." },
            ],
          },
        ),
        c(
          "ler-grafico",
          "Um gráfico de inflação mensal mostra: jan 1%, fev 0,5%, mar 0,2%, abr 0%. Os preços em abril, em relação a janeiro:",
          "Continuaram mais altos; só pararam de subir",
          ["Voltaram ao nível de janeiro", "Caíram"],
          "Inflação zero significa preços estáveis no mês, não preços de volta ao passado.",
          {
            feedback: [
              "Para voltar, seria necessária inflação negativa.",
              "Nenhum mês teve variação negativa.",
            ],
          },
        ),
        n(
          "corrigir-valores",
          "Um ingresso custava R$ 20 quando o índice de preços era 150; hoje o índice é 180. Quanto custaria o ingresso hoje, só pela inflação, em reais?",
          24,
          "20 × 180 ÷ 150 = 24.",
          {
            misreads: [
              { value: 50, feedback: "Somou 30 pontos de índice ao preço como se fossem reais." },
            ],
          },
        ),
        c(
          "ler-grafico",
          "Em um gráfico, a inflação anual caiu de 10% para 4%. Isso significa que:",
          "Os preços subiram menos que no ano anterior, mas continuaram subindo",
          ["Os preços caíram 6%", "Os preços voltaram ao nível anterior"],
          "4% ainda é aumento; só a velocidade diminuiu.",
          {
            feedback: [
              "Queda da inflação não é queda de preços.",
              "Com 4% de inflação os preços subiram mais 4%.",
            ],
          },
        ),
        n(
          "corrigir-valores",
          "Uma mesada de R$ 30 em 2020 foi reajustada para R$ 39 em 2024, e a inflação do período foi 30%. Em termos reais, a mesada ficou quantos por cento maior? Responda 0 se não mudou.",
          0,
          "39 ÷ 30 = 1,3, igual ao fator da inflação: o poder de compra não mudou.",
          {
            misreads: [
              { value: 30, feedback: "30% foi o reajuste nominal, que apenas repôs a inflação." },
            ],
          },
        ),
        c(
          "ler-grafico",
          "Um gráfico mostra que o preço de um produto subiu 20% enquanto a inflação geral foi 5%. Podemos dizer que esse produto:",
          "Ficou mais caro em relação aos outros produtos",
          ["Subiu só por causa da inflação", "Ficou mais barato"],
          "Subiu 20% contra 5% do conjunto: encareceu em termos relativos.",
          {
            feedback: [
              "A inflação explica só 5 dos 20 pontos.",
              "Subir mais que a média é ficar relativamente mais caro.",
            ],
          },
        ),
      ],
    },
    {
      title: "Inflação para decidir",
      objective: "Analisar afirmações e escolhas financeiras considerando a inflação.",
      introduction:
        "Toda comparação de dinheiro no tempo precisa perguntar: nominal ou real? A resposta muda decisões sobre salário, poupança e dívida.",
      estimatedMinutes: 18,
      specs: [
        c(
          "decisao",
          "Uma pessoa guarda R$ 5.000 em casa por um ano com inflação de 8%. Ao final, o dinheiro:",
          "Ainda são R$ 5.000, mas compram o que R$ 4.630 compravam antes",
          ["Vira R$ 4.600", "Continua comprando a mesma coisa"],
          "5.000 ÷ 1,08 é cerca de 4.630.",
          {
            feedback: [
              "O valor em reais não muda; o poder de compra é que cai.",
              "Com preços 8% maiores o mesmo dinheiro compra menos.",
            ],
          },
        ),
        n(
          "decisao",
          "Um investimento rende 11% ao ano e a inflação é 5%. Qual é o rendimento real aproximado, em porcentagem, arredondado para uma casa decimal?",
          5.7,
          "1,11 ÷ 1,05 = 1,0571: cerca de 5,7%.",
          {
            misreads: [
              { value: 6, feedback: "6% é a subtração das taxas; a divisão dos fatores dá 5,7%." },
            ],
          },
        ),
        c(
          "decisao",
          "Um empregador oferece reajuste de 3% em um ano com inflação de 4,5%. Aceitar significa:",
          "Perder cerca de 1,4% de poder de compra",
          ["Ganhar 3%", "Ficar igual"],
          "1,03 ÷ 1,045 é cerca de 0,986.",
          {
            feedback: [
              "O ganho de 3% é nominal; os preços subiram mais.",
              "Igual exigiria reajuste de 4,5%.",
            ],
          },
        ),
        n(
          "decisao",
          "Uma dívida fixa de R$ 1.000, sem juros, será paga daqui a um ano. Com inflação de 10%, quanto ela pesa hoje em poder de compra, em reais? Arredonde para o inteiro mais próximo.",
          909,
          "1.000 ÷ 1,1 = 909: a dívida fixa fica mais leve com a inflação.",
          {
            misreads: [
              {
                value: 1100,
                feedback: "1.100 seria uma dívida corrigida pela inflação; esta é fixa.",
              },
            ],
          },
        ),
        c(
          "decisao",
          "Uma notícia diz: 'a inflação de 2025 foi positiva e a menor em cinco anos'. O que se pode concluir?",
          "Que os preços subiram menos em 2025 do que nos quatro anos anteriores, mas ainda subiram",
          ["Que os preços caíram em 2025", "Que os preços de 2025 são os menores em cinco anos"],
          "Inflação menor é subida mais lenta, não descida.",
          {
            feedback: [
              "Só inflação negativa faria os preços caírem.",
              "Os preços de 2025 são os maiores da série, só subiram mais devagar.",
            ],
          },
        ),
        n(
          "decisao",
          "Uma família quer manter o poder de compra de R$ 2.000 guardados durante um ano com inflação de 6%. Quantos reais de rendimento ela precisa, no mínimo?",
          120,
          "6% de 2.000 = 120.",
          { misreads: [{ value: 6, feedback: "6 é a taxa; o valor depende dos 2.000." }] },
        ),
        c(
          "decisao",
          "Entre uma aplicação que rende 9% ao ano e outra que rende 'inflação + 3%', em um ano com inflação de 7%, a melhor foi:",
          "A segunda: 1,07 × 1,03, cerca de 10,2%",
          ["A primeira, porque 9% é mais que 3%", "As duas empatam"],
          "Inflação mais 3%: 1,07 × 1,03 = 1,1021, mais que 1,09.",
          {
            feedback: ["Os 3% são além da inflação de 7%.", "10,2% e 9% são diferentes."],
          },
        ),
        c(
          "decisao",
          "Por que comparar o preço de um produto hoje com o preço de 20 anos atrás sem corrigir pela inflação leva a conclusões erradas?",
          "Porque o real de hoje compra menos que o de 20 anos atrás; sem corrigir, tudo parece ter ficado mais caro, mesmo o que ficou mais barato em termos reais",
          ["Porque os produtos mudaram de nome", "Porque preços antigos não existem mais"],
          "A comparação certa usa valores corrigidos pela inflação acumulada.",
          {
            feedback: [
              "O nome não interfere na comparação de valores.",
              "Os preços antigos existem em registros; o problema é a unidade de medida do dinheiro ter mudado.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize um método para saber se um reajuste repôs a inflação.",
    labels: [
      "Anotar o valor antes e depois do reajuste",
      "Calcular o fator do reajuste dividindo o depois pelo antes",
      "Calcular o fator da inflação do período, 1 mais a taxa",
      "Dividir os dois fatores para achar o ganho ou a perda real",
    ],
    explanation:
      "Com os dois fatores em mãos, a divisão diz se houve ganho ou perda real; subtrair taxas dá só uma aproximação.",
  },
  justification: {
    prompts: [
      "Explique por que 'a inflação caiu' não significa 'os preços caíram', com um exemplo numérico de dois anos.",
      "Um colega diz que um salário que subiu 5% em um ano com inflação de 5% 'ganhou 5%'. Explique o erro usando poder de compra.",
      "Mostre por que duas famílias com o mesmo salário podem sentir inflações diferentes, usando uma cesta com pesos.",
    ],
    samples: [
      "Se em um ano a inflação foi 10% e no seguinte foi 4%, um produto de R$ 100 vai a R$ 110 e depois a R$ 114,40. A inflação caiu de 10% para 4%, mas o preço continuou subindo; só subiu mais devagar. Preço só cai com inflação negativa.",
      "Se os preços subiram 5%, o que custava R$ 100 custa R$ 105. Um salário que subiu 5% compra exatamente a mesma cesta de antes: o ganho em reais foi de 5%, mas o ganho em poder de compra foi zero. 'Ganhar' de verdade seria subir mais que os preços.",
      "Uma família gasta 60% com alimentação e 40% com transporte; outra gasta 20% e 80%. Se a alimentação sobe 10% e o transporte 0%, a primeira sente 0,6 × 10 = 6% e a segunda sente 0,2 × 10 = 2%. A inflação oficial é uma média dos pesos de todo mundo; a de cada casa depende de onde o dinheiro dela vai.",
    ],
    focus: "a diferença entre valor nominal e poder de compra",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const valor = 50 * (4 + (seed % 13));
      const taxa = 2 + (seed % 7);
      const novo = valor + (valor * taxa) / 100;
      const texto = (v: number) =>
        Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",");
      return c(
        "repor-a-inflacao",
        `Uma mesada de R$ ${valor} precisa de um reajuste que reponha uma inflação de ${taxa}%. Qual deve ser o novo valor?`,
        `R$ ${texto(novo)}`,
        [`R$ ${valor + taxa}`, `R$ ${texto(valor + (valor * taxa * 2) / 100)}`],
        `${valor} × ${(1 + taxa / 100).toString().replace(".", ",")} = ${texto(novo)}.`,
        {
          feedback: [
            "Somou a taxa como se fosse um valor em reais.",
            "Aplicou o dobro da inflação.",
          ],
        },
      );
    }
    if (variant === 1) {
      const pesoA = 10 * (2 + (seed % 7));
      const pesoB = 100 - pesoA;
      const altaA = 5 * (1 + (seed % 4));
      const altaB = 2 * (1 + (seed % 3));
      const inflacao = (pesoA * altaA + pesoB * altaB) / 100;
      const media = (altaA + altaB) / 2;
      const texto = (v: number) =>
        Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ",");
      return c(
        "inflacao-da-cesta",
        `Em uma cesta, o grupo A pesa ${pesoA}% e subiu ${altaA}%; o grupo B pesa ${pesoB}% e subiu ${altaB}%. Qual foi a inflação da cesta?`,
        `${texto(inflacao)}%`,
        [media === inflacao ? `${texto(altaA)}%` : `${texto(media)}%`, `${altaA + altaB}%`],
        `${pesoA}% de ${altaA}% mais ${pesoB}% de ${altaB}%: ${texto(inflacao)}%.`,
        {
          feedback: [
            media === inflacao
              ? "Considerou só a alta do grupo A."
              : "Ignorou os pesos dos grupos na cesta.",
            "Somou as variações sem os pesos.",
          ],
        },
      );
    }
    const indiceAntes = 100 + 10 * (seed % 9);
    const variacao = 5 * (1 + (seed % 6));
    const indiceDepois = indiceAntes + (indiceAntes * variacao) / 100;
    const preco = 10 * (2 + (seed % 7));
    const precoHoje = (preco * indiceDepois) / indiceAntes;
    const texto = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ","));
    return c(
      "preco-corrigido-pelo-indice",
      `Um produto custava R$ ${preco} quando o índice de preços era ${texto(indiceAntes)}. Hoje o índice é ${texto(indiceDepois)}. Quanto ele custaria hoje só pela inflação?`,
      `R$ ${texto(precoHoje)}`,
      [`R$ ${texto(preco + (indiceDepois - indiceAntes))}`, `R$ ${texto(preco)}`],
      `${preco} × ${texto(indiceDepois)} ÷ ${texto(indiceAntes)} = ${texto(precoHoje)}.`,
      {
        feedback: [
          "Somou pontos de índice como se fossem reais.",
          "Esse é o preço antigo; o índice subiu.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "inflacao",
    title: "O preço que a família lembra",
    prompt:
      "Pergunte a alguém mais velho da família quanto custava um produto do dia a dia há dez ou vinte anos e quanto se ganhava. Compare com hoje, corrija pela inflação acumulada e diga o que ficou mais caro ou mais barato de verdade.",
    lab: "bars",
    steps: [
      "Registre dois preços antigos e um salário antigo, com o ano, e os valores de hoje.",
      "Procure a inflação acumulada do período em uma fonte oficial e corrija os valores antigos.",
      "Conclua o que encareceu ou barateou em termos reais e o que aconteceu com o poder de compra do salário.",
    ],
    rubric: [
      "Valores antigos e atuais registrados com o ano (0–2)",
      "Correção pela inflação acumulada feita corretamente (0–3)",
      "Conclusão em termos reais, separando nominal de poder de compra (0–2)",
      "Fonte da inflação citada (0–1)",
    ],
  },
  homeSupport: [
    "Na volta do mercado, comparem o preço de um item com o de alguns meses atrás e conversem sobre quanto a mesma quantia comprava antes.",
    "Quando alguém disser que 'antigamente era tudo mais barato', perguntem juntos quanto se ganhava na época e se dava para comprar mais ou menos coisas.",
  ],
};
