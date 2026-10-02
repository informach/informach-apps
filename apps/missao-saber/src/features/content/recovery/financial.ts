import type { RecoveryBank } from "./types";

// All rates, taxes and prices below are hypothetical inputs for mathematical
// comparison, not claims about products or current tax rules.
export const financialRecovery: RecoveryBank = {
  "porcentagem-n2": [
    [
      "learn:variacoes-sucessivas",
      "Variações seguidas incidem sobre bases diferentes.",
      "Multiplique os fatores de cada etapa, sem somar as taxas.",
      [
        "Um preço de R$ 250 sobe 12% e depois cai 20%. Qual é o preço final em reais?",
        224,
        "250 × 1,12 × 0,8 = 224.",
      ],
      [
        "Uma quantidade dobra e depois diminui 30%. Ela termina com quantos por cento do valor inicial?",
        140,
        "2 × 0,7 = 1,4, ou 140% do início.",
      ],
    ],
    [
      "learn:valor-original",
      "O preço final corresponde a uma fração do original.",
      "Divida pelo fator que transformou o original no final.",
      [
        "Depois de um desconto de 15%, um curso custa R$ 238. Qual era o preço em reais?",
        280,
        "238 ÷ 0,85 = 280.",
      ],
      [
        "Uma bolsa aumentou 18% e passou a R$ 354. Quanto custava antes, em reais?",
        300,
        "354 ÷ 1,18 = 300.",
      ],
    ],
    [
      "learn:pontos-percentuais",
      "Diferença em pontos percentuais e variação relativa são medidas distintas.",
      "Pontos percentuais subtraem as taxas; a variação relativa divide pela taxa inicial.",
      [
        "Uma taxa passou de 12% a 18%. Quantos pontos percentuais aumentou?",
        6,
        "18 − 12 = 6 pontos percentuais.",
      ],
      [
        "Uma taxa de participação passou de 40% a 50%. Qual foi seu aumento relativo, em %?",
        25,
        "O aumento de 10 pontos corresponde a 10/40 = 25% da taxa inicial.",
      ],
    ],
  ],
  juros: [
    [
      "learn:juros-simples",
      "Em juros simples, os juros de cada período usam o capital inicial.",
      "Use J = capital × taxa × número de períodos.",
      [
        "Num contrato hipotético, R$ 750 rendem juros simples de 2% ao mês por 5 meses. Quantos reais de juros são gerados, sem custos?",
        75,
        "750 × 0,02 × 5 = 75.",
      ],
      [
        "Um capital de R$ 480 gerou R$ 72 de juros simples em 6 meses. Qual foi a taxa mensal em %?",
        2.5,
        "72/(480 × 6) = 0,025 = 2,5%.",
      ],
    ],
    [
      "learn:juros-compostos",
      "Nos juros compostos, cada período usa o saldo atualizado.",
      "Multiplique o capital pelo fator (1 + taxa) a cada período.",
      [
        "R$ 640 crescem 25% por período, durante dois períodos, sem custos nem movimentações. Qual é o saldo final em reais?",
        1000,
        "640 × 1,25² = 1.000.",
      ],
      [
        "Uma dívida hipotética de R$ 900 cresce 10% ao mês, sem pagamentos. Qual é o saldo após dois meses, em reais?",
        1089,
        "900 × 1,1² = 1.089.",
      ],
    ],
    [
      "learn:custo-do-parcelamento",
      "Some todos os pagamentos para comparar o total nominal.",
      "Inclua entrada e parcelas, sem confundir a diferença nominal com taxa efetiva.",
      [
        "Um objeto custa R$ 540 à vista ou entrada de R$ 90 mais 6 parcelas de R$ 85. Quantos reais a mais são pagos no parcelamento, em total nominal?",
        60,
        "90 + 6 × 85 = 600; diferença 60.",
      ],
      [
        "Uma compra de R$ 420 à vista pode ser paga em 8 parcelas de R$ 58, sem entrada. Qual é o acréscimo nominal total, em reais?",
        44,
        "8 × 58 − 420 = 44.",
      ],
    ],
  ],
  "orcamento-n2": [
    [
      "learn:saldo",
      "Só o dinheiro que sobra após todas as despesas pode ser destinado a novas metas.",
      "Subtraia despesas fixas e variáveis das entradas.",
      [
        "Uma família hipotética recebe R$ 3.750, gasta R$ 2.460 em despesas fixas e R$ 890 em variáveis. Quantos reais sobram?",
        400,
        "3.750 − 2.460 − 890 = 400.",
      ],
      [
        "Com entradas de R$ 2.840 e despesas de R$ 2.990, quantos reais é preciso reduzir nas despesas para zerar o déficit?",
        150,
        "2.990 − 2.840 = 150.",
      ],
    ],
    [
      "learn:reserva-de-emergencia",
      "Uma meta de reserva usa despesas essenciais como referência.",
      [
        "Multiplique a despesa mensal pelo número de meses indicado no problema.",
        "Divida a reserva pela despesa mensal para encontrar quantos meses ela cobre.",
      ],
      [
        "Um exercício define uma reserva de 4 meses de despesas essenciais de R$ 1.350 por mês. Qual é a meta em reais?",
        5400,
        "4 × 1.350 = 5.400; é a meta deste exercício.",
      ],
      [
        "Uma reserva de R$ 7.200 cobre despesas essenciais constantes de R$ 1.800 por mês. Quantos meses cobre, sem rendimento?",
        4,
        "7.200 ÷ 1.800 = 4.",
      ],
    ],
    [
      "learn:custo-de-oportunidade",
      "Escolher uma alternativa pode impedir outra dentro do mesmo limite.",
      "Compare o valor comprometido e a verba que resta.",
      [
        "Com verba de R$ 920, uma turma escolhe equipamento de R$ 635. Quanto sobra para livros, em reais?",
        285,
        "920 − 635 = 285.",
      ],
      [
        "Uma verba de R$ 1.000 compra A por R$ 680 ou B por R$ 510. Quantos reais a escolha de B libera a mais para outra finalidade?",
        170,
        "A diferença entre os custos é 680 − 510 = 170.",
      ],
    ],
  ],
  inflacao: [
    [
      "learn:cesta-com-pesos",
      "O índice da cesta depende de quanto cada item pesa no gasto.",
      "Calcule a média das variações ponderada pelas participações iniciais.",
      [
        "Numa cesta hipotética, 60% do gasto é com alimentos que sobem 10%; os outros 40% não mudam. Qual é a alta da cesta, em %?",
        6,
        "0,60 × 10% + 0,40 × 0% = 6%.",
      ],
      [
        "Uma cesta tem metade do gasto em um grupo que sobe 8% e metade em outro que sobe 4%. Qual é a alta da cesta, em %?",
        6,
        "0,5 × 8% + 0,5 × 4% = 6%.",
      ],
    ],
    [
      "learn:ganho-real",
      "Compare o fator do rendimento ao fator dos preços.",
      "Divida (1 + rendimento) por (1 + inflação), subtraia 1 e converta em %.",
      [
        "Um valor cresce 21% e os preços sobem 10% no mesmo período. Qual é o ganho real exato, em %?",
        10,
        "1,21/1,10 − 1 = 0,10 = 10%.",
      ],
      [
        "Um salário cresce 8% enquanto os preços sobem 20%. Qual é a variação real em %, com sinal?",
        -10,
        "1,08/1,20 − 1 = −0,10 = −10%.",
      ],
    ],
    [
      "learn:corrigir-valores",
      "Manter poder de compra exige acompanhar o fator dos preços.",
      [
        "Multiplique o valor antigo pelo fator acumulado da inflação.",
        "Divida o aumento pelo preço inicial e converta a razão em porcentagem.",
      ],
      [
        "Uma quantia era R$ 680. Com inflação acumulada hipotética de 25%, qual quantia em reais preserva seu poder de compra?",
        850,
        "680 × 1,25 = 850.",
      ],
      [
        "Uma cesta passou de R$ 240 para R$ 276. Qual foi a inflação dessa cesta em %?",
        15,
        "(276 − 240)/240 = 0,15 = 15%.",
      ],
    ],
  ],
  investimentos: [
    [
      "learn:rendimento",
      "Separe o capital aplicado do ganho.",
      [
        "O rendimento percentual é ganho dividido pelo capital inicial.",
        "Multiplique o capital pela taxa em forma decimal para encontrar o ganho em reais.",
      ],
      [
        "Num exemplo sem aportes, retiradas nem custos, R$ 1.250 tornam-se R$ 1.350. Qual é o rendimento em %?",
        8,
        "Ganho 100 sobre 1.250: 8%.",
      ],
      [
        "Uma aplicação hipotética de R$ 840 rende 5% em um período, sem custos. Qual é o ganho em reais?",
        42,
        "840 × 0,05 = 42.",
      ],
    ],
    [
      "learn:aportes",
      "A data de cada aporte determina por quanto tempo ele rende.",
      "Calcule cada aporte até a mesma data antes de somar.",
      [
        "Deposita-se R$ 200 no início de um mês, com rendimento hipotético de 10% nesse mês. Logo após o rendimento, depositam-se mais R$ 80. Qual é o saldo em reais?",
        300,
        "O primeiro depósito vira 220; o segundo ainda não rendeu: 220 + 80 = 300.",
      ],
      [
        "Uma conta começa zerada e recebe R$ 75 ao fim de cada mês. Sem rendimentos nem custos, qual é o saldo após 8 depósitos, em reais?",
        600,
        "8 × 75 = 600.",
      ],
    ],
    [
      "learn:diversificacao",
      "Diversificar distribui exposições, mas não elimina todos os riscos.",
      "Observe a parcela alocada em cada grupo e o efeito de cada variação.",
      [
        "Uma carteira hipotética tem R$ 300 em A e R$ 700 em B. A perde 20% e B não muda. Qual é a perda total em reais?",
        60,
        "Só A varia: 300 × 0,20 = 60.",
      ],
      [
        "Uma carteira aplica 40% em um ativo que sobe 15% e 60% em outro que sobe 5%. Qual é seu retorno no período, em %, sem custos ou movimentações?",
        9,
        "0,4 × 15% + 0,6 × 5% = 9%.",
      ],
    ],
  ],
  "modelos-financeiros": [
    [
      "learn:linear-exponencial",
      "Crescimento linear soma valor constante; exponencial multiplica por fator constante.",
      "Aplique o modelo declarado a cada período.",
      [
        "Um saldo inicia em R$ 470 e aumenta R$ 35 por mês, sem outras mudanças. Qual será o saldo após 6 meses, em reais?",
        680,
        "470 + 6 × 35 = 680.",
      ],
      [
        "Um saldo de R$ 320 aumenta 25% por período, sem aportes. Quanto vale após 3 períodos, em reais?",
        625,
        "320 × 1,25³ = 625.",
      ],
    ],
    [
      "learn:parametros",
      "O coeficiente de t representa variação por período; o termo constante é o valor inicial.",
      [
        "Use dois valores para achar a taxa e depois recupere o início.",
        "Subtraia do saldo observado a variação acumulada nos períodos já decorridos.",
      ],
      [
        "Um custo linear C(t) = a + bt vale R$ 74 para t = 2 e R$ 110 para t = 5. Qual é b em reais por unidade de t?",
        12,
        "b = (110 − 74)/(5 − 2) = 12.",
      ],
      [
        "Um saldo linear S(t) = a + 18t vale R$ 146 em t = 4. Qual é o saldo inicial a, em reais?",
        74,
        "a = 146 − 18 × 4 = 74.",
      ],
    ],
    [
      "learn:comparar",
      "Compare os modelos na mesma quantidade de uso e na mesma data.",
      [
        "O ponto de empate resolve a igualdade entre os custos.",
        "Substitua o mesmo h nos dois custos e calcule a diferença.",
      ],
      [
        "Aluguel A cobra R$ 55 fixos mais R$ 9 por dia; B cobra R$ 20 por dia, sem taxa fixa. Em quantos dias os custos empatam?",
        5,
        "55 + 9d = 20d; 11d = 55.",
      ],
      [
        "Um serviço A custa 40 + 6h reais; B custa 10h reais. Para h = 12, quantos reais A custa a menos que B?",
        8,
        "A custa 112; B custa 120; diferença 8.",
      ],
    ],
  ],
  "equivalencia-temporal": [
    [
      "learn:presente-futuro",
      "Valores em datas diferentes precisam ser levados à mesma data.",
      "Para antecipar, divida pelo fator; para projetar, multiplique.",
      [
        "Com taxa hipotética de 10% por período, qual valor presente em reais equivale a R$ 1.331 daqui a três períodos?",
        1000,
        "1.331/1,1³ = 1.000.",
      ],
      [
        "R$ 512 hoje crescem 25% por período. A quanto equivalem daqui a dois períodos, em reais, sem custos?",
        800,
        "512 × 1,25² = 800.",
      ],
    ],
    [
      "learn:fluxos",
      "Cada pagamento percorre seu próprio número de períodos.",
      "Desconte cada fluxo até hoje e só depois some.",
      [
        "Um contrato hipotético paga R$ 220 em um período e R$ 242 em dois. Com taxa de 10% por período, qual é o valor presente total em reais?",
        400,
        "220/1,1 + 242/1,1² = 200 + 200 = 400.",
      ],
      [
        "Um fluxo entrega R$ 300 hoje e R$ 363 em dois períodos. A 10% por período, qual é seu valor presente em reais?",
        600,
        "300 + 363/1,21 = 600.",
      ],
    ],
    [
      "learn:decidir",
      "Compare alternativas pelo valor na mesma data, usando a taxa informada.",
      "O menor valor presente é o menor custo segundo esse modelo.",
      [
        "Uma compra custa R$ 720 hoje ou R$ 792 em um período. Com taxa de comparação de 10% por período, qual é a diferença entre seus valores presentes, em reais?",
        0,
        "792/1,1 = 720; as alternativas são equivalentes nesse modelo.",
      ],
      [
        "Uma conta de R$ 550 vence em um período e pode ser quitada hoje por R$ 480. À taxa de comparação de 10%, qual é a economia de valor presente ao quitar hoje, em reais?",
        20,
        "O vencimento vale 550/1,1 = 500 hoje; 500 − 480 = 20.",
      ],
    ],
  ],
  "renda-fixa": [
    [
      "learn:remuneracao",
      "A taxa do exemplo se aplica ao capital e ao período indicados.",
      [
        "Calcule o rendimento bruto antes de deduzir custos.",
        "Multiplique a taxa do índice pela fração contratada.",
      ],
      [
        "Um título hipotético paga 6% sobre R$ 1.400 em um período, sem custos. Qual é o rendimento bruto em reais?",
        84,
        "1.400 × 0,06 = 84.",
      ],
      [
        "Um título hipotético remunera 80% de um índice que rendeu 10% no período. Pelo modelo proporcional deste exercício, qual é a taxa do título em %?",
        8,
        "80% de 10% = 8%.",
      ],
    ],
    [
      "learn:liquido",
      "Impostos do exemplo incidem apenas sobre a base declarada.",
      [
        "Subtraia do ganho bruto o imposto sobre o ganho e os custos informados.",
        "Desconte o imposto do ganho bruto e acrescente o ganho líquido ao capital inicial.",
      ],
      [
        "Um exemplo rende R$ 160 brutos. Cobra imposto hipotético de 15% somente sobre o ganho e taxa fixa de R$ 6. Qual é o ganho líquido em reais?",
        130,
        "Imposto 24; ganho líquido 160 − 24 − 6 = 130.",
      ],
      [
        "Um investimento hipotético de R$ 900 rende R$ 120 brutos. Há imposto de 20% só sobre o ganho, sem outras taxas. Qual é o saldo líquido final em reais?",
        996,
        "Imposto 24; ganho líquido 96; saldo 900 + 96 = 996.",
      ],
    ],
    [
      "learn:liquidez",
      "Liquidez trata da possibilidade e do prazo de transformar o investimento em dinheiro disponível.",
      [
        "Compare o dia em que o dinheiro é necessário com o prazo de resgate.",
        "Conte os dias úteis seguintes à solicitação, sem incluir a segunda-feira.",
      ],
      [
        "O dinheiro é necessário amanhã. A permite resgate hoje com crédito hoje; B só permite resgate em 30 dias. Qual atende ao prazo informado?",
        "A",
        "A disponibiliza o dinheiro antes da necessidade; B não.",
        ["B", "Ambos atendem"],
      ],
      [
        "Um resgate é solicitado na segunda-feira e leva 2 dias úteis. Sem feriados, em qual dia ocorre o crédito?",
        "Quarta-feira",
        "Terça é o primeiro dia útil seguinte; quarta é o segundo.",
        ["Terça-feira", "Quinta-feira"],
      ],
    ],
  ],
  "renda-variavel": [
    [
      "learn:variacao",
      "O retorno usa o valor inicial como base.",
      "Some preço final e proventos antes de comparar com o custo inicial, quando solicitado.",
      [
        "Uma ação hipotética custa R$ 40, paga R$ 3 de proventos e é vendida por R$ 43. Qual é o retorno total em %, sem custos?",
        15,
        "Ganho total 43 + 3 − 40 = 6; 6/40 = 15%.",
      ],
      [
        "Uma cota hipotética cai de R$ 80 para R$ 68, sem proventos. Qual é a variação percentual com sinal?",
        -15,
        "(68 − 80)/80 × 100 = −15%.",
      ],
    ],
    [
      "learn:oscilacao",
      "Uma perda altera a base sobre a qual a recuperação será calculada.",
      [
        "Calcule o aumento necessário usando o valor depois da queda.",
        "Aplique primeiro o fator da queda e depois o fator da alta ao saldo atualizado.",
      ],
      [
        "Um ativo hipotético cai de R$ 125 para R$ 100. De quantos por cento precisa subir para voltar a R$ 125?",
        25,
        "O aumento necessário é 25 sobre a base 100: 25%.",
      ],
      [
        "Um ativo de R$ 200 cai 50% e depois sobe 50%. Qual é seu preço final em reais?",
        150,
        "200 × 0,5 × 1,5 = 150.",
      ],
    ],
    [
      "learn:carteira",
      "Pese o retorno de cada ativo por sua participação inicial.",
      "Some os ganhos e perdas sobre a mesma base total.",
      [
        "Uma carteira hipotética tem 25% em A, que sobe 12%, e 75% em B, que cai 4%. Qual é o retorno total em %, sem custos ou movimentações?",
        0,
        "0,25 × 12% + 0,75 × (−4%) = 0%.",
      ],
      [
        "Uma carteira tem R$ 800 em A e R$ 200 em B. A sobe 5% e B sobe 20%. Qual é o ganho total em reais?",
        80,
        "A ganha 40 e B ganha 40; total 80.",
      ],
    ],
  ],
  cenarios: [
    [
      "learn:sensibilidade",
      "Mude uma variável por vez para observar seu efeito.",
      "Use a taxa de variação do modelo mantendo os outros parâmetros constantes.",
      [
        "O custo de um evento é C = 350 + 12n reais, com n participantes. Quanto aumenta o custo se entram mais 15 participantes?",
        180,
        "A parte fixa não muda; o acréscimo é 12 × 15 = 180.",
      ],
      [
        "O lucro é L = (p − 8) × 50 − 200, em reais, com quantidade vendida fixa em 50. Se p sobe R$ 3, quanto aumenta L?",
        150,
        "A alteração é 3 × 50 = 150, mantendo quantidade e custos fixos.",
      ],
    ],
    [
      "learn:tres-cenarios",
      "Cada cenário usa sua própria premissa de vendas.",
      [
        "Substitua a quantidade de cada cenário no mesmo modelo.",
        "Iguale o saldo a zero e resolva a equação para q.",
      ],
      [
        "O lucro é L = 9q − 270 reais. No cenário de q = 20 vendas, qual é L em reais, com sinal?",
        -90,
        "9 × 20 − 270 = −90.",
      ],
      [
        "O saldo é S = 7q − 210 reais. Qual quantidade q produz saldo zero?",
        30,
        "7q = 210, logo q = 30.",
      ],
    ],
    [
      "learn:premissas",
      "Uma projeção só vale nas condições assumidas.",
      "Confira qual hipótese foi mantida ou violada.",
      [
        "Um modelo calcula receita como preço × 100 unidades. Ao aumentar o preço, projeta as mesmas 100 vendas. Qual hipótese exige verificação?",
        "A quantidade vendida não muda com o preço",
        "A reação da demanda pode alterar o total vendido.",
        ["A multiplicação deixa de valer", "Toda receita vira lucro"],
      ],
      [
        "Uma projeção usa taxa mensal fixa de 2% por um ano. A taxa real passa a variar. O que fazer?",
        "Recalcular com as taxas dos períodos",
        "A hipótese de taxa constante deixou de representar os dados.",
        ["Manter o resultado como garantido", "Somar 2 reais a cada mês"],
      ],
    ],
  ],
};
