import type { Course, Item, Lesson } from "./types";

export type SkillId =
  | "fracoes"
  | "porcentagem"
  | "precos"
  | "orcamento"
  | "medidas"
  | "simetria"
  | "contagem"
  | "gavetas"
  | "probabilidade"
  | "paridade"
  | "padroes"
  | "logica";

import {
  brl,
  justificationItem as buildJustificationItem,
  orderingItem as buildOrderingItem,
  type ChoiceSpec,
  c,
  decimal,
  distinctNumericOptions,
  n,
  type ObjectiveSpec,
  type OrderDefinition,
  objectiveItem,
  stageValue,
  verificationSpec,
} from "./skill-factory";

function fractionSpecs(stage: number): ObjectiveSpec[] {
  const quantities = [24, 35, 48];
  const q = quantities[stage] ?? 24;
  const numerator = [3, 4, 5][stage] ?? 3;
  const denominator = [8, 7, 6][stage] ?? 8;
  const part = (q * numerator) / denominator;
  return [
    c(
      "parte-de-um-todo",
      `Uma oficina separou ${numerator}/${denominator} de ${q} peças para a primeira montagem. Quantas peças foram separadas?`,
      part,
      [q / denominator, stage === 2 ? part + q / denominator : q - part],
      `${q} ÷ ${denominator} = ${q / denominator}; multiplicando por ${numerator}, obtemos ${part}.`,
    ),
    c(
      "comparacao-por-referencia",
      `Qual quantidade está mais perto de uma unidade inteira?`,
      ["7/8", "11/12", "14/15"][stage] ?? "7/8",
      stage === 0 ? ["5/8", "3/4"] : stage === 1 ? ["4/6", "5/8"] : ["7/10", "9/12"],
      "A fração mais próxima de 1 é a que deixa a menor parte faltando para completar o inteiro.",
    ),
    c(
      "equivalencia",
      `Complete a equivalência: ${[2, 3, 5][stage]}/${[3, 4, 8][stage]} = ?/${[12, 20, 24][stage]}.`,
      [8, 15, 15][stage] ?? 8,
      [6 + stage, 10 + stage * 2],
      "Numerador e denominador devem ser multiplicados pelo mesmo fator.",
    ),
    c(
      "soma-com-denominador-comum",
      `Uma faixa recebeu ${[2, 3, 5][stage]}/${[10, 12, 16][stage]} de tinta azul e ${[3, 5, 7][stage]}/${[10, 12, 16][stage]} de tinta amarela. Que fração foi pintada?`,
      `${[5, 8, 12][stage]}/${[10, 12, 16][stage]}`,
      [`${[5, 8, 12][stage]}/${[20, 24, 32][stage]}`, `${[1, 2, 2][stage]}/${[10, 12, 16][stage]}`],
      "Como as partes têm o mesmo tamanho, somamos os numeradores e mantemos o denominador.",
    ),
    c(
      "razao-parte-total",
      `Em uma coleção há ${[6, 9, 12][stage]} cartões verdes e ${[10, 15, 18][stage]} cartões ao todo. Qual fração representa os verdes?`,
      `${[3, 3, 2][stage]}/${[5, 5, 3][stage]}`,
      [`${[2, 2, 3][stage]}/${[5, 5, 2][stage]}`, `${[5, 8, 6][stage]}/${[3, 3, 2][stage]}`],
      "A razão parte–todo usa a quantidade verde no numerador e o total no denominador, depois simplifica.",
    ),
    c(
      "fracao-restante",
      `De uma trilha, ${[3, 5, 7][stage]}/${[8, 12, 15][stage]} já foi percorrida. Que fração ainda falta?`,
      `${[5, 7, 8][stage]}/${[8, 12, 15][stage]}`,
      [`${[3, 5, 7][stage]}/${[8, 12, 15][stage]}`, `${[5, 7, 8][stage]}/${[16, 24, 30][stage]}`],
      "O percurso inteiro corresponde ao denominador; subtraímos do total as partes já percorridas.",
    ),
    n(
      "escala-de-receita",
      `Uma receita usa ${[2, 3, 4][stage]} copos de água para ${[8, 12, 20][stage]} porções. Quantos copos são necessários para ${[12, 20, 35][stage]} porções?`,
      [3, 5, 7][stage] ?? 3,
      "Mantendo a razão, encontramos o valor por porção e multiplicamos pelo novo total.",
      {
        unit: { symbol: "copos", aliases: ["copo"], required: false },
        misreads: [
          {
            value: [2, 3, 4][stage] ?? 2,
            feedback:
              "Esse é o número de copos da receita original. O novo total de porções muda a quantidade.",
          },
        ],
      },
    ),
    n(
      "divisao-em-partes",
      `${[18, 30, 42][stage]} metros de corda serão divididos em partes de ${[3, 5, 7][stage]}/2 metro. Quantas partes completas serão formadas?`,
      12,
      "Dividir pelo comprimento de cada parte equivale a multiplicar pelo inverso da fração.",
      {
        misreads: [
          {
            value: 6,
            feedback:
              "Você dividiu pelo numerador e deixou o denominador 2 de fora. Cada parte mede metade desse valor, então cabem o dobro de partes.",
          },
        ],
      },
    ),
  ];
}

function percentageSpecs(stage: number): ObjectiveSpec[] {
  const bases = [80, 150, 240];
  const rates = [25, 20, 15];
  const base = bases[stage] ?? 80;
  const rate = rates[stage] ?? 25;
  const part = (base * rate) / 100;
  return [
    c(
      "parte-percentual",
      `Uma caixa tem ${base} fichas. ${rate}% são azuis. Quantas são azuis?`,
      part,
      [rate, base - part],
      `${rate}% de ${base} é ${rate}/100 × ${base} = ${part}.`,
    ),
    c(
      "percentual-como-fracao",
      `Qual fração simplificada representa ${decimal(stageValue([40, 35, 62.5], stage))}%?`,
      ["2/5", "7/20", "5/8"][stage] ?? "2/5",
      stage === 0 ? ["4/5", "1/4"] : stage === 1 ? ["3/5", "7/10"] : ["3/8", "6/10"],
      "Escrevemos a porcentagem sobre 100 e simplificamos sem alterar a razão.",
    ),
    c(
      "aumento-percentual",
      `Um marcador passou de ${[50, 120, 200][stage]} para ${[60, 150, 230][stage]}. Qual foi o aumento percentual?`,
      `${[20, 25, 15][stage]}%`,
      [`${[10, 30, 30][stage]}%`, `${[12, 20, 13][stage]}%`],
      "Calculamos a diferença e a comparamos com o valor inicial, que é a base do aumento.",
    ),
    c(
      "desconto",
      `Um material de ${brl([90, 160, 300][stage] ?? 90)} recebe ${[10, 25, 30][stage]}% de desconto. Qual é o preço final?`,
      brl([81, 120, 210][stage] ?? 81),
      [brl([80, 135, 270][stage] ?? 80), brl([9, 40, 90][stage] ?? 9)],
      "Primeiro calculamos o desconto sobre o preço inicial e depois o subtraímos.",
    ),
    c(
      "base-desconhecida",
      `${[18, 32, 45][stage]} participantes correspondem a ${[30, 40, 25][stage]}% do grupo. Quantas pessoas há no grupo?`,
      [60, 80, 180][stage] ?? 60,
      [[54, 128, 135][stage] ?? 54, [48, 72, 120][stage] ?? 48],
      "Se uma parte conhecida representa certo percentual, dividimos a parte pela taxa em forma decimal.",
    ),
    c(
      "mudancas-sucessivas",
      `Um índice de 100 aumenta ${[10, 20, 25][stage]}% e depois diminui ${[10, 20, 20][stage]}%. Qual é o valor final?`,
      [99, 96, 100][stage] ?? 99,
      [[100, 100, 105][stage] ?? 100, [90, 80, 95][stage] ?? 90],
      "Cada mudança usa uma base diferente; a segunda porcentagem incide sobre o valor já alterado.",
    ),
    n(
      "taxa-de-acerto",
      `Em ${[20, 40, 80][stage]} tentativas, uma equipe concluiu ${[15, 34, 68][stage]}. Qual foi a taxa de conclusão em porcentagem?`,
      [75, 85, 85][stage] ?? 75,
      "Dividimos as conclusões pelo total e multiplicamos por 100.",
      {
        unit: { symbol: "%", aliases: ["por cento"], required: false },
        misreads: [
          {
            value: [15, 34, 68][stage] ?? 15,
            feedback:
              "Esse é o número de conclusões. A taxa compara esse número com o total de tentativas.",
          },
          {
            value: [25, 15, 15][stage] ?? 25,
            feedback: "Essa é a porcentagem que faltou concluir, não a taxa de conclusão.",
          },
        ],
      },
    ),
    n(
      "percentual-inverso",
      `Depois de aumentar ${[25, 20, 10][stage]}%, uma quantidade ficou igual a ${[75, 144, 198][stage]}. Qual era a quantidade inicial?`,
      [60, 120, 180][stage] ?? 60,
      "O valor final corresponde a 125%, 120% ou 110% do valor inicial; dividimos pelo fator.",
      {
        misreads: [
          {
            value: [56.25, 115.2, 178.2][stage] ?? 56.25,
            feedback:
              "Você descontou a porcentagem do valor final. O aumento foi calculado sobre a quantidade inicial, que é menor.",
          },
        ],
      },
    ),
  ];
}

function priceSpecs(stage: number): ObjectiveSpec[] {
  const quantities = stageValue(
    [
      [3, 5],
      [4, 7],
      [6, 10],
    ],
    stage,
  );
  const prices = stageValue(
    [
      [18, 27.5],
      [30, 49],
      [45, 72],
    ],
    stage,
  );
  const [quantityA = 3, quantityB = 5] = quantities;
  const [priceA = 18, priceB = 27.5] = prices;
  const units = prices.map((price, index) => price / (quantities[index] ?? 1));
  return [
    c(
      "preco-unitario",
      `Um pacote com ${quantityA} cadernos custa ${brl(priceA)}. Qual é o preço por caderno?`,
      brl(units[0] ?? 0),
      [brl(priceA - quantityA), brl(priceA * quantityA)],
      "Preço unitário é preço total dividido pela quantidade.",
    ),
    c(
      "comparacao-unitaria",
      `Pacote A: ${quantityA} unidades por ${brl(priceA)}. Pacote B: ${quantityB} por ${brl(priceB)}. Qual tem menor preço por unidade?`,
      (units[0] ?? 0) < (units[1] ?? 0) ? "Pacote A" : "Pacote B",
      ["Custam o mesmo por unidade", "Não é possível comparar"],
      `Os preços unitários são ${brl(units[0] ?? 0)} e ${brl(units[1] ?? 0)}.`,
    ),
    c(
      "frete-no-total",
      `Loja A cobra ${brl(stageValue([42, 75, 110], stage))} e frete de ${brl(stageValue([8, 12, 15], stage))}. Loja B cobra ${brl(stageValue([48, 82, 118], stage))} com frete grátis. Qual total é menor?`,
      ["Loja B: R$ 48,00", "Loja B: R$ 82,00", "Loja B: R$ 118,00"][stage] ?? "Loja B: R$ 48,00",
      stage === 0
        ? ["Loja A: R$ 42,00", "Os totais são iguais"]
        : stage === 1
          ? ["Loja A: R$ 75,00", "Loja A: R$ 87,00"]
          : ["Loja A: R$ 110,00", "Loja A: R$ 125,00"],
      "A comparação inclui todos os custos obrigatórios, inclusive o frete.",
    ),
    c(
      "leve-pague",
      `Uma oferta “leve ${[4, 5, 6][stage]}, pague ${[3, 4, 5][stage]}” usa unidades de ${brl(stageValue([6, 8, 10], stage))}. Qual é o custo efetivo por unidade levada?`,
      brl([4.5, 6.4, 8.333333][stage] ?? 4.5),
      [brl(stageValue([6, 8, 10], stage)), brl(stageValue([8, 10, 12], stage))],
      "Calculamos o total pago e dividimos por todas as unidades levadas.",
    ),
    c(
      "quantidade-util",
      `Duas embalagens têm o mesmo preço. A primeira contém ${[500, 750, 900][stage]} g e perde ${[10, 20, 25][stage]}% no preparo; a segunda contém ${[440, 640, 700][stage]} g sem perda. Qual oferece mais quantidade útil?`,
      ["Primeira embalagem", "Segunda embalagem", "Segunda embalagem"][stage] ??
        "Primeira embalagem",
      ["As duas oferecem o mesmo", "Faltam dados para calcular"],
      "Comparamos a quantidade realmente utilizável depois da perda informada.",
    ),
    c(
      "parcelas-e-total",
      `Uma compra pode ser paga à vista por ${brl(stageValue([180, 320, 540], stage))} ou em ${[4, 6, 8][stage]} parcelas de ${brl(stageValue([48, 56, 72], stage))}. Quanto a opção parcelada custa a mais?`,
      brl([12, 16, 36][stage] ?? 12),
      [brl(stageValue([48, 56, 72], stage)), brl(stageValue([192, 336, 576], stage))],
      "Multiplicamos parcela por quantidade e comparamos o total com o preço à vista.",
    ),
    n(
      "custo-de-uso",
      `Um passe de ${brl(stageValue([72, 105, 156], stage))} será usado ${[12, 15, 24][stage]} vezes. Qual é o custo por uso?`,
      [6, 7, 6.5][stage] ?? 6,
      "Dividimos o custo total pelo número de usos previstos.",
      {
        unit: { symbol: "R$", aliases: ["reais", "real"], required: false },
        misreads: [
          {
            value: stageValue([72, 105, 156], stage),
            feedback:
              "Esse é o custo total do passe. O custo por uso divide esse valor pelo número de usos.",
          },
        ],
      },
    ),
    n(
      "economia-total",
      `Uma escolha economiza ${brl(stageValue([2.5, 3.75, 4.2], stage))} por unidade em ${[8, 12, 25][stage]} unidades. Qual é a economia total?`,
      [20, 45, 105][stage] ?? 20,
      "Multiplicamos a economia por unidade pela quantidade comprada.",
      {
        unit: { symbol: "R$", aliases: ["reais", "real"], required: false },
        misreads: [
          {
            value: stageValue([2.5, 3.75, 4.2], stage),
            feedback:
              "Essa é a economia de uma unidade. O total multiplica esse valor pela quantidade comprada.",
          },
        ],
      },
    ),
  ];
}

function budgetSpecs(stage: number): ObjectiveSpec[] {
  const income = [320, 480, 750][stage] ?? 320;
  const fixed = [180, 275, 430][stage] ?? 180;
  const variable = [65, 90, 145][stage] ?? 65;
  const balance = income - fixed - variable;
  return [
    c(
      "saldo",
      `Um projeto recebeu ${brl(income)}, reservou ${brl(fixed)} para custos fixos e gastou ${brl(variable)} em materiais. Qual é o saldo?`,
      brl(balance),
      [brl(income - fixed), brl(fixed + variable)],
      "Saldo é tudo que entrou menos todos os valores que saíram.",
    ),
    c(
      "necessidade-e-desejo",
      `Qual item deve aparecer primeiro em um orçamento com recursos limitados?`,
      ["Transporte necessário para chegar à escola", "Remédio prescrito", "Alimentação da semana"][
        stage
      ] ?? "Transporte necessário para chegar à escola",
      stage === 0
        ? ["Adesivos colecionáveis", "Uma segunda capa decorativa"]
        : stage === 1
          ? ["Ingresso para um evento", "Acessório de moda"]
          : ["Assinatura de entretenimento", "Troca de celular funcionando"],
      "Priorizar é relacionar o gasto a uma necessidade e às consequências de adiá-lo, sem julgar a família.",
    ),
    c(
      "meta-e-prazo",
      `Uma meta custa ${brl(stageValue([180, 315, 560], stage))}. Já há ${brl(stageValue([30, 75, 140], stage))} e será possível guardar ${brl(stageValue([25, 40, 60], stage))} por mês. Qual é o menor número de meses completos?`,
      [6, 6, 7][stage] ?? 6,
      [[5, 7, 6][stage] ?? 5, [7, 8, 8][stage] ?? 7],
      "Subtraímos o valor já guardado e dividimos o restante pela contribuição mensal, arredondando para cima.",
    ),
    c(
      "limite-por-categoria",
      `O limite para materiais é ${brl(stageValue([90, 140, 220], stage))}. Já foram usados ${brl(stageValue([35, 68, 95], stage))} e ${brl(stageValue([28, 46, 72], stage))}. Quanto ainda pode ser usado?`,
      brl([27, 26, 53][stage] ?? 27),
      [brl([55, 72, 125][stage] ?? 55), brl([63, 114, 167][stage] ?? 63)],
      "Somamos os gastos da categoria e subtraímos do limite definido.",
    ),
    c(
      "ajuste-de-plano",
      `O orçamento excedeu o limite em ${brl(stageValue([18, 35, 52], stage))}. Qual ajuste resolve o excesso sem cortar um gasto essencial?`,
      [
        "Adiar um item opcional de R$ 20,00",
        "Reduzir dois itens opcionais em R$ 18,00 e R$ 20,00",
        "Trocar um item opcional de R$ 75,00 por outro de R$ 20,00",
      ][stage] ?? "Adiar um item opcional de R$ 20,00",
      stage === 0
        ? ["Cortar R$ 10,00", "Ignorar o excesso"]
        : stage === 1
          ? ["Reduzir apenas R$ 30,00", "Aumentar outro gasto em R$ 5,00"]
          : ["Economizar apenas R$ 50,00", "Retirar um remédio necessário"],
      "O ajuste precisa cobrir todo o excesso e preservar os itens definidos como essenciais.",
    ),
    c(
      "imprevisto",
      `Uma reserva tem ${brl(stageValue([120, 240, 450], stage))}. Surge um imprevisto de ${brl(stageValue([45, 135, 280], stage))}. Que valor permanece na reserva?`,
      brl([75, 105, 170][stage] ?? 75),
      [brl([165, 375, 730][stage] ?? 165), brl([45, 135, 280][stage] ?? 45)],
      "Usar a reserva reduz seu saldo pelo valor do imprevisto.",
    ),
    n(
      "poupanca-regular",
      `Uma meta recebe ${brl(stageValue([18, 35, 55], stage))} por mês durante ${[7, 9, 12][stage]} meses, sem rendimento. Quanto será acumulado?`,
      [126, 315, 660][stage] ?? 126,
      "Sem rendimento, o total é o aporte mensal multiplicado pelo número de meses.",
      {
        unit: { symbol: "R$", aliases: ["reais", "real"], required: false },
        misreads: [
          {
            value: stageValue([18, 35, 55], stage),
            feedback: "Esse é o aporte de um mês. O acumulado soma todos os meses do plano.",
          },
        ],
      },
    ),
    n(
      "margem-de-seguranca",
      `Um custo estimado é ${brl(stageValue([200, 360, 640], stage))}. O plano reserva mais ${[10, 15, 20][stage]}% para variações. Qual é o total planejado?`,
      [220, 414, 768][stage] ?? 220,
      "Somamos ao custo a margem calculada sobre a estimativa inicial.",
      {
        unit: { symbol: "R$", aliases: ["reais", "real"], required: false },
        misreads: [
          {
            value: [20, 54, 128][stage] ?? 20,
            feedback:
              "Essa é apenas a margem reservada. O total planejado soma a margem ao custo estimado.",
          },
        ],
      },
    ),
  ];
}

function measureSpecs(stage: number): ObjectiveSpec[] {
  const widths = [6, 9, 12];
  const heights = [4, 7, 9];
  const width = widths[stage] ?? 6;
  const height = heights[stage] ?? 4;
  return [
    c(
      "perimetro-retangulo",
      `Uma horta retangular mede ${width} m por ${height} m. Quantos metros de cerca contornam a horta?`,
      2 * (width + height),
      [width * height, width + height],
      "O perímetro soma os quatro lados: duas larguras e duas alturas.",
    ),
    c(
      "area-retangulo",
      `Um painel retangular tem ${width + 2} fileiras e ${height + 1} colunas de quadrados iguais. Quantos quadrados o cobrem?`,
      (width + 2) * (height + 1),
      [2 * (width + height + 3), width + height + 3],
      "A área conta todas as células: fileiras multiplicadas por colunas.",
    ),
    c(
      "area-composta",
      `Uma placa de ${[8, 12, 15][stage]} por ${[6, 9, 10][stage]} quadrados perdeu um recorte de ${[2, 3, 5][stage]} por ${[2, 2, 3][stage]}. Qual área restou?`,
      [44, 102, 135][stage] ?? 44,
      [[48, 108, 150][stage] ?? 48, [40, 96, 120][stage] ?? 40],
      "Calculamos a área da placa inteira e retiramos apenas a área do recorte.",
    ),
    c(
      "mesmo-perimetro",
      `Qual retângulo tem perímetro ${[24, 34, 46][stage]} unidades?`,
      [`5 por 7`, `7 por 10`, `9 por 14`][stage] ?? "5 por 7",
      stage === 0
        ? ["4 por 7", "6 por 8"]
        : stage === 1
          ? ["6 por 10", "8 por 11"]
          : ["8 por 14", "10 por 15"],
      "Para lados a e b, o perímetro é 2(a + b).",
    ),
    c(
      "conversao-de-comprimento",
      `${decimal(stageValue([2.4, 3.75, 5.2], stage))} metros correspondem a quantos centímetros?`,
      [240, 375, 520][stage] ?? 240,
      [[24, 37.5, 52][stage] ?? 24, [2400, 3750, 5200][stage] ?? 2400],
      "Cada metro tem 100 centímetros, então multiplicamos por 100.",
    ),
    c(
      "escala-em-malha",
      `Em uma planta, cada lado de quadradinho representa ${[2, 3, 5][stage]} m. Um caminho ocupa ${[7, 9, 12][stage]} lados. Qual é o comprimento real?`,
      [14, 27, 60][stage] ?? 14,
      [[9, 12, 17][stage] ?? 9, [28, 36, 120][stage] ?? 28],
      "Multiplicamos a quantidade de segmentos pelo comprimento real de cada um.",
    ),
    n(
      "area-triangulo",
      `Um triângulo tem base ${[10, 14, 18][stage]} cm e altura ${[6, 9, 12][stage]} cm. Qual é a área?`,
      [30, 63, 108][stage] ?? 30,
      "A área de um triângulo é metade do produto da base pela altura.",
      {
        unit: { symbol: "cm²", aliases: ["cm2", "centímetros quadrados"], required: false },
        misreads: [
          {
            value: [60, 126, 216][stage] ?? 60,
            feedback:
              "Esse é o produto da base pela altura, que corresponde ao retângulo inteiro. A área do triângulo é a metade dele.",
          },
        ],
      },
    ),
    n(
      "lado-por-area",
      `Um quadrado tem área ${[49, 121, 196][stage]} cm². Qual é a medida do lado?`,
      [7, 11, 14][stage] ?? 7,
      "O lado é o número que, multiplicado por si mesmo, produz a área.",
      {
        unit: { symbol: "cm", aliases: ["centímetro", "centímetros"], required: false },
        misreads: [
          {
            value: [24.5, 60.5, 98][stage] ?? 24.5,
            feedback:
              "Você dividiu a área por 2. O lado é o número que, multiplicado por si mesmo, devolve a área.",
          },
        ],
      },
    ),
  ];
}

function symmetrySpecs(stage: number): ObjectiveSpec[] {
  const turn = [90, 180, 270][stage] ?? 90;
  return [
    c(
      "eixo-de-simetria",
      `Qual figura mantém as duas metades coincidentes ao dobrar por um eixo vertical central?`,
      ["Um retângulo sem marcas", "Uma letra H de traços iguais", "Um losango sem marcas"][stage] ??
        "Um retângulo sem marcas",
      stage === 0
        ? ["Um triângulo escaleno", "Uma seta apontando à direita"]
        : stage === 1
          ? ["Uma letra F", "Uma espiral"]
          : ["Um paralelogramo inclinado", "Uma letra P"],
      "Um eixo de simetria divide a figura em partes que se sobrepõem por reflexão.",
    ),
    c(
      "reflexao-em-malha",
      `Um ponto está ${[2, 3, 5][stage]} casas à esquerda de um eixo vertical. Onde fica sua imagem refletida?`,
      `${[2, 3, 5][stage]} casas à direita do eixo`,
      [`Sobre o eixo`, `${[4, 6, 10][stage]} casas à direita do eixo`],
      "A reflexão preserva a distância perpendicular ao eixo e troca o lado.",
    ),
    c(
      "rotacao",
      `Uma seta aponta para cima e gira ${turn}° no sentido horário. Para onde passa a apontar?`,
      ["direita", "baixo", "esquerda"][stage] ?? "direita",
      stage === 0
        ? ["esquerda", "baixo"]
        : stage === 1
          ? ["direita", "esquerda"]
          : ["cima", "direita"],
      "Acompanhar quartos de volta evita confundir o sentido e a amplitude da rotação.",
    ),
    c(
      "translacao",
      `Um desenho é deslocado ${[4, 6, 9][stage]} casas para a direita e ${[2, 3, 5][stage]} para cima, sem girar. Que propriedade muda?`,
      "A posição",
      ["O tamanho", "A orientação"],
      "Uma translação muda a posição e preserva forma, tamanho e orientação.",
    ),
    c(
      "composicao-de-reflexoes",
      [
        "Um ponto é refletido duas vezes pelo mesmo eixo. Onde termina?",
        "Uma figura é refletida primeiro em um eixo vertical e depois em um eixo horizontal que cruza o primeiro. A qual transformação essa composição equivale?",
        "Um ponto é refletido em duas retas verticais paralelas separadas por 3 unidades. Qual deslocamento total a composição produz?",
      ][stage] ?? "Um ponto é refletido duas vezes pelo mesmo eixo. Onde termina?",
      [
        "Na posição inicial",
        "Uma rotação de 180° em torno do cruzamento",
        "Uma translação de 6 unidades perpendicular aos eixos",
      ][stage] ?? "Na posição inicial",
      stage === 0
        ? ["Sobre o eixo", "Ao dobro da distância do outro lado"]
        : stage === 1
          ? ["Uma translação", "A posição inicial para qualquer figura"]
          : ["Uma translação de 3 unidades", "Uma rotação de 180°"],
      [
        "A segunda reflexão pelo mesmo eixo desfaz a primeira.",
        "Reflexões em eixos perpendiculares equivalem a uma meia-volta em torno do ponto de encontro.",
        "Reflexões em retas paralelas produzem uma translação igual ao dobro da distância entre elas.",
      ][stage] ?? "A composição pode ser analisada acompanhando um ponto por vez.",
    ),
    c(
      "simetria-rotacional",
      `Qual figura volta a coincidir consigo mesma após um giro de ${[90, 120, 180][stage]}°?`,
      ["quadrado", "triângulo equilátero", "retângulo não quadrado"][stage] ?? "quadrado",
      stage === 0
        ? ["triângulo equilátero", "retângulo não quadrado"]
        : stage === 1
          ? ["quadrado", "pentágono irregular"]
          : ["triângulo equilátero", "trapézio irregular"],
      "A simetria rotacional exige que todos os pontos coincidam após o ângulo indicado.",
    ),
    n(
      "coordenada-refletida",
      `Na malha, o ponto (${[3, 5, 7][stage]}, ${[2, 4, 6][stage]}) é refletido no eixo vertical x = 0. Qual é a nova coordenada x?`,
      -([3, 5, 7][stage] ?? 3),
      "A reflexão no eixo vertical troca o sinal de x e mantém y.",
      {
        misreads: [
          {
            value: [3, 5, 7][stage] ?? 3,
            feedback:
              "Você manteve o sinal de x. A reflexão em x = 0 troca esse sinal e conserva y.",
          },
          { value: 0, feedback: "Zero é a posição do eixo, não do ponto refletido." },
        ],
      },
    ),
    n(
      "voltas-completas",
      `Uma peça gira ${[5, 11, 18][stage]} quartos de volta. Quantos graus equivalentes restam depois de retirar voltas completas?`,
      [90, 270, 180][stage] ?? 90,
      "Cada quarto vale 90°; retiramos múltiplos de 360° e conservamos o restante.",
      {
        unit: { symbol: "°", aliases: ["graus", "grau"], required: false },
        misreads: [
          {
            value: [450, 990, 1620][stage] ?? 450,
            feedback:
              "Você somou todos os quartos de volta. Falta retirar as voltas completas de 360°.",
          },
        ],
      },
    ),
  ];
}

function countingSpecs(stage: number): ObjectiveSpec[] {
  const a = [3, 4, 5][stage] ?? 3;
  const b = [4, 5, 6][stage] ?? 4;
  return [
    c(
      "principio-multiplicativo",
      `Há ${a} opções de entrada e ${b} oficinas. Escolhendo uma entrada e uma oficina, quantas combinações existem?`,
      a * b,
      [a + b, a * b - 1],
      "Para cada escolha da primeira etapa, todas as opções da segunda continuam possíveis.",
    ),
    c(
      "lista-sem-repetir",
      `Com os algarismos ${["1, 2, 3", "2, 4, 6, 8", "1, 3, 5, 7, 9"][stage]}, quantos números de dois algarismos distintos podem ser formados?`,
      [6, 12, 20][stage] ?? 6,
      [[9, 16, 25][stage] ?? 9, [3, 6, 10][stage] ?? 3],
      "Escolhemos o primeiro algarismo e depois um diferente; a ordem produz números distintos.",
    ),
    c(
      "pares-sem-ordem",
      `Em um grupo de ${[5, 6, 8][stage]} pessoas, quantos pares diferentes podem conversar uma vez?`,
      [10, 15, 28][stage] ?? 10,
      [[20, 30, 56][stage] ?? 20, [8, 12, 24][stage] ?? 8],
      "Contamos pares sem ordem: cada dupla não deve aparecer novamente com os nomes invertidos.",
    ),
    c(
      "contagem-por-complemento",
      `Há ${[30, 50, 80][stage]} cartões numerados. ${[8, 13, 21][stage]} têm estrela. Quantos não têm estrela?`,
      [22, 37, 59][stage] ?? 22,
      [[38, 63, 101][stage] ?? 38, [8, 13, 21][stage] ?? 8],
      "O complemento é o total menos os casos que possuem a propriedade.",
    ),
    c(
      "inclusao-exclusao",
      `Em ${[24, 36, 50][stage]} estudantes, ${[14, 20, 31][stage]} gostam de desenho, ${[11, 18, 24][stage]} de música e ${[5, 8, 12][stage]} de ambos. Quantos gostam de pelo menos uma atividade?`,
      [20, 30, 43][stage] ?? 20,
      [[25, 38, 55][stage] ?? 25, [30, 46, 67][stage] ?? 30],
      "Somamos os dois grupos e subtraímos a interseção, que havia sido contada duas vezes.",
    ),
    c(
      "casos-com-restricao",
      `Uma senha tem uma letra entre ${[3, 4, 5][stage]} opções e um algarismo entre ${[4, 5, 6][stage]} opções, mas uma combinação específica é proibida. Quantas senhas são válidas?`,
      [11, 19, 29][stage] ?? 11,
      [[12, 20, 30][stage] ?? 12, [6, 9, 11][stage] ?? 6],
      "Contamos todas as combinações e retiramos exatamente o caso proibido.",
    ),
    n(
      "caminhos-em-etapas",
      `Um percurso exige escolher uma de ${[2, 3, 4][stage]} pontes, depois uma de ${[3, 4, 5][stage]} trilhas e, por fim, uma de ${[2, 2, 3][stage]} saídas. Quantos percursos existem?`,
      [12, 24, 60][stage] ?? 12,
      "As escolhas independentes de cada etapa são multiplicadas.",
      {
        misreads: [
          {
            value: [7, 9, 12][stage] ?? 7,
            feedback:
              "Você somou as opções de cada etapa. Escolhas independentes se multiplicam, porque cada ponte combina com cada trilha.",
          },
        ],
      },
    ),
    n(
      "subconjuntos-simples",
      `Uma pessoa pode escolher incluir ou não cada um de ${[4, 5, 6][stage]} adesivos diferentes. Quantas seleções existem, incluindo não escolher nenhum?`,
      [16, 32, 64][stage] ?? 16,
      "Cada adesivo oferece duas decisões independentes; multiplicamos 2 por si mesmo para cada adesivo.",
      {
        misreads: [
          {
            value: [8, 10, 12][stage] ?? 8,
            feedback:
              "Você multiplicou 2 pelo número de adesivos. Cada adesivo dobra o total de seleções possíveis.",
          },
        ],
      },
    ),
  ];
}

function pigeonholeSpecs(stage: number): ObjectiveSpec[] {
  return [
    c(
      "garantia-simples",
      `${[13, 25, 37][stage]} cartões são distribuídos em ${[12, 8, 9][stage]} caixas. Qual é o menor valor possível para a quantidade de cartões na caixa mais cheia?`,
      [2, 4, 5][stage] ?? 2,
      [[1, 3, 4][stage] ?? 1, [3, 5, 6][stage] ?? 3],
      "Dividimos e arredondamos para cima: alguma caixa atinge pelo menos o teto da média.",
    ),
    c(
      "garantia-de-par",
      `Qual é o menor número de meias que precisam ser retiradas no escuro de uma gaveta com ${[3, 4, 5][stage]} cores para garantir duas da mesma cor?`,
      [4, 5, 6][stage] ?? 4,
      [[3, 4, 5][stage] ?? 3, [6, 8, 10][stage] ?? 6],
      "No pior caso sai uma de cada cor; a retirada seguinte repete alguma cor.",
    ),
    c(
      "classes-de-resto",
      `Ao dividir números inteiros por ${[4, 6, 8][stage]}, quantas classes de resto existem? São essas classes que garantem uma repetição ao escolher ${[5, 7, 9][stage]} números inteiros.`,
      [4, 6, 8][stage] ?? 4,
      [[5, 7, 9][stage] ?? 5, [3, 5, 7][stage] ?? 3],
      "Os possíveis restos formam as gavetas; há uma classe para cada resto de zero até divisor menos um.",
    ),
    c(
      "limite-sem-repeticao",
      `Há ${[6, 8, 10][stage]} categorias. Qual é o maior número de objetos que pode ser escolhido sem repetir categoria?`,
      [6, 8, 10][stage] ?? 6,
      [[5, 7, 9][stage] ?? 5, [12, 16, 20][stage] ?? 12],
      "Sem repetição, cabe no máximo um objeto em cada categoria.",
    ),
    c(
      "distribuicao-equilibrada",
      `${[29, 43, 61][stage]} sementes serão colocadas em ${[7, 8, 10][stage]} vasos. Se a distribuição for tão equilibrada quanto possível, qual é o maior número em um vaso?`,
      [5, 6, 7][stage] ?? 5,
      [[4, 5, 6][stage] ?? 4, [7, 8, 10][stage] ?? 7],
      "O maior grupo em uma distribuição equilibrada é o teto da divisão.",
    ),
    c(
      "garantia-de-tres",
      `Há ${[4, 5, 6][stage]} símbolos possíveis. Qual é o menor número de fichas que garante pelo menos três com o mesmo símbolo?`,
      [9, 11, 13][stage] ?? 9,
      [[8, 10, 12][stage] ?? 8, [12, 15, 18][stage] ?? 12],
      "Ainda é possível ter duas de cada símbolo; uma ficha a mais força a terceira repetição.",
    ),
    n(
      "minimo-para-cota",
      `Em ${[9, 12, 15][stage]} grupos, qual é o menor número de participantes que garante que algum grupo tenha pelo menos ${[4, 5, 6][stage]} pessoas?`,
      [28, 49, 76][stage] ?? 28,
      "Podemos manter no máximo uma pessoa a menos que a cota em cada grupo; somamos uma para forçar a garantia.",
      {
        misreads: [
          {
            value: [27, 48, 75][stage] ?? 27,
            feedback:
              "Com esse total ainda é possível que nenhum grupo alcance a cota. Falta uma pessoa para forçar a garantia.",
          },
        ],
      },
    ),
    n(
      "teto-da-media",
      `${[52, 77, 103][stage]} arquivos foram organizados em ${[10, 12, 15][stage]} pastas. Qual é o menor valor possível para a quantidade de arquivos na pasta mais cheia?`,
      [6, 7, 7][stage] ?? 6,
      "A pasta mais cheia tem pelo menos o teto da média total por pasta.",
      {
        misreads: [
          {
            value: [5, 6, 6][stage] ?? 5,
            feedback:
              "Esse é o valor da média arredondado para baixo. Como a divisão não é exata, alguma pasta precisa passar dele.",
          },
        ],
      },
    ),
  ];
}

function probabilitySpecs(stage: number): ObjectiveSpec[] {
  return [
    c(
      "casos-equiprovaveis",
      `Uma sacola tem ${[3, 5, 7][stage]} fichas azuis e ${[5, 7, 9][stage]} amarelas, todas com a mesma chance. Qual é a probabilidade de retirar azul?`,
      [`3/8`, `5/12`, `7/16`][stage] ?? "3/8",
      stage === 0 ? ["3/5", "5/8"] : stage === 1 ? ["5/7", "7/12"] : ["7/9", "9/16"],
      "Em casos equiprováveis, a probabilidade é favoráveis dividido pelo total.",
    ),
    c(
      "complemento",
      `A chance de chover em um modelo é ${[30, 45, 65][stage]}%. Qual é a chance complementar de não chover?`,
      `${[70, 55, 35][stage]}%`,
      [`${[30, 45, 65][stage]}%`, `${[60, 90, 30][stage]}%`],
      "Um evento e seu complemento somam 100%.",
    ),
    c(
      "comparacao-de-chances",
      `Qual situação oferece maior chance de obter uma ficha verde?`,
      ["4 verdes em 10 fichas", "7 verdes em 15 fichas", "9 verdes em 20 fichas"][stage] ??
        "4 verdes em 10 fichas",
      stage === 0
        ? ["3 verdes em 9 fichas", "5 verdes em 15 fichas"]
        : stage === 1
          ? ["4 verdes em 10 fichas", "8 verdes em 20 fichas"]
          : ["4 verdes em 10 fichas", "8 verdes em 20 fichas"],
      "Comparamos as razões na mesma escala, e não somente a quantidade de fichas verdes.",
    ),
    c(
      "duas-etapas",
      `Uma moeda equilibrada é lançada ${[2, 3, 4][stage]} vezes. Qual é a probabilidade de sair cara em todos os lançamentos?`,
      [`1/4`, `1/8`, `1/16`][stage] ?? "1/4",
      stage === 0 ? ["1/2", "2/4"] : stage === 1 ? ["1/3", "3/8"] : ["1/4", "4/16"],
      "Cada lançamento reduz pela metade a chance conjunta; multiplicamos as probabilidades independentes.",
    ),
    c(
      "sem-reposicao",
      `Uma caixa tem ${[4, 5, 6][stage]} fichas, apenas uma marcada. Após retirar uma ficha sem marca e não devolver, qual é a chance de tirar a marcada?`,
      [`1/3`, `1/4`, `1/5`][stage] ?? "1/3",
      stage === 0 ? ["1/4", "2/3"] : stage === 1 ? ["1/5", "2/4"] : ["1/6", "2/5"],
      "Sem reposição, o total diminui, mas a única ficha marcada continua disponível.",
    ),
    c(
      "frequencia-e-modelo",
      `Em ${[40, 80, 120][stage]} testes, um evento ocorreu ${[18, 38, 57][stage]} vezes. Qual é sua frequência relativa?`,
      [`45%`, `47,5%`, `47,5%`][stage] ?? "45%",
      stage === 0 ? ["18%", "55%"] : stage === 1 ? ["38%", "52,5%"] : ["57%", "52,5%"],
      "Frequência relativa é ocorrências divididas pelo total observado.",
    ),
    n(
      "valor-esperado-contagem",
      `Um dado comum é lançado ${[24, 60, 90][stage]} vezes. Usando o modelo equiprovável, quantas ocorrências de um número específico são esperadas em média?`,
      [4, 10, 15][stage] ?? 4,
      "A chance é 1/6; multiplicamos a quantidade de lançamentos por essa chance.",
      {
        misreads: [
          {
            value: [24, 60, 90][stage] ?? 24,
            feedback:
              "Esse é o total de lançamentos. A média esperada aplica a chance de 1/6 a esse total.",
          },
        ],
      },
    ),
    n(
      "espaco-amostral",
      `Uma roleta tem ${[4, 6, 8][stage]} setores e uma moeda tem 2 lados. Quantos resultados ordenados existem ao usar os dois?`,
      [8, 12, 16][stage] ?? 8,
      "Cada setor pode ser combinado com cada um dos dois lados da moeda.",
      {
        misreads: [
          {
            value: [6, 8, 10][stage] ?? 6,
            feedback:
              "Você somou os setores e os lados da moeda. Cada setor combina com cada lado, então os números se multiplicam.",
          },
        ],
      },
    ),
  ];
}

function paritySpecs(stage: number): ObjectiveSpec[] {
  return [
    c(
      "soma-e-paridade",
      `A soma de ${[3, 5, 7][stage]} números ímpares tem qual paridade?`,
      "ímpar",
      ["par", "depende dos valores"],
      "Pares de ímpares formam uma soma par; sobra um ímpar quando a quantidade é ímpar.",
    ),
    c(
      "produto-e-paridade",
      `Um produto tem um fator par e ${[2, 4, 6][stage]} fatores ímpares. Qual é a paridade do produto?`,
      "par",
      ["ímpar", "depende da ordem"],
      "O fator par já contém um fator 2, então todo o produto é par.",
    ),
    c(
      "resto",
      `Qual é o resto de ${[83, 157, 263][stage]} na divisão por ${[6, 8, 10][stage]}?`,
      [5, 5, 3][stage] ?? 5,
      [[4, 4, 2][stage] ?? 4, [6, 8, 10][stage] ?? 6],
      "Retiramos o maior múltiplo do divisor que não ultrapassa o número.",
    ),
    c(
      "ciclo-de-restos",
      `Uma sequência começa em ${[2, 3, 5][stage]} e soma ${[4, 6, 8][stage]} a cada passo. Qual resto por 2 aparece em todos os termos?`,
      ([2, 3, 5][stage] ?? 2) % 2,
      [1 - (([2, 3, 5][stage] ?? 2) % 2), 2],
      "Somar um número par preserva o resto por 2 do termo inicial.",
    ),
    c(
      "possibilidade-por-paridade",
      `É possível somar ${[4, 6, 8][stage]} números ímpares e obter um número ímpar?`,
      "Não",
      ["Sim, sempre", "Somente se forem consecutivos"],
      "Uma quantidade par de parcelas ímpares pode ser agrupada em pares, e cada par soma um número par.",
    ),
    c(
      "ultimo-algarismo",
      `Qual é o último algarismo de ${[7, 3, 9][stage]} elevado a ${[5, 8, 7][stage]}?`,
      [7, 1, 9][stage] ?? 7,
      [[9, 3, 1][stage] ?? 9, [5, 8, 7][stage] ?? 5],
      "Os últimos algarismos das potências formam um ciclo; localizamos a posição do expoente nesse ciclo.",
    ),
    n(
      "proximo-multiplo",
      `Qual é o menor número inteiro não negativo que deve ser somado a ${[74, 118, 203][stage]} para obter um múltiplo de ${[9, 11, 12][stage]}?`,
      [7, 3, 1][stage] ?? 7,
      "Calculamos o resto atual e completamos até o divisor.",
      {
        misreads: [
          {
            value: [2, 8, 11][stage] ?? 2,
            feedback:
              "Esse é o resto atual da divisão. A pergunta pede quanto falta para chegar ao próximo múltiplo.",
          },
        ],
      },
    ),
    n(
      "quantidade-de-impares",
      `Quantos números ímpares existem de 1 até ${[31, 57, 101][stage]}, inclusive?`,
      [16, 29, 51][stage] ?? 16,
      "A sequência de ímpares alterna com os pares e começa em 1; arredondamos a metade para cima.",
      {
        misreads: [
          {
            value: [15, 28, 50][stage] ?? 15,
            feedback:
              "Você arredondou a metade para baixo. A contagem começa em 1, então sobra um ímpar a mais.",
          },
        ],
      },
    ),
  ];
}

function patternSpecs(stage: number): ObjectiveSpec[] {
  const starts = [4, 7, 11];
  const steps = [3, 5, 7];
  const start = starts[stage] ?? 4;
  const step = steps[stage] ?? 3;
  return [
    c(
      "sequencia-aritmetica",
      `A sequência começa em ${start} e aumenta ${step}: ${start}, ${start + step}, ${start + 2 * step}, ... Qual é o sexto termo?`,
      start + 5 * step,
      [start + 6 * step, 6 * step],
      "Do primeiro ao sexto termo há cinco aumentos iguais.",
    ),
    c(
      "regra-por-posicao",
      `Qual expressão dá o termo da posição n na sequência ${["2, 5, 8, 11", "4, 8, 12, 16", "6, 11, 16, 21"][stage]}?`,
      ["3n − 1", "4n", "5n + 1"][stage] ?? "3n − 1",
      stage === 0 ? ["3n + 2", "2n + 1"] : stage === 1 ? ["4n + 4", "n + 4"] : ["5n − 1", "6n"],
      "A expressão precisa produzir o primeiro termo quando n = 1 e manter a diferença da sequência.",
    ),
    c(
      "padrao-figurativo",
      `Uma figura da posição n usa ${["2n + 1", "3n + 2", "4n − 1"][stage]} peças. Quantas peças há na posição ${[6, 8, 10][stage]}?`,
      [13, 26, 39][stage] ?? 13,
      [[12, 24, 40][stage] ?? 12, [15, 29, 36][stage] ?? 15],
      "Substituímos n pela posição pedida e respeitamos a ordem das operações.",
    ),
    c(
      "ciclo",
      `As cores repetem na ordem ${["azul, verde, amarelo", "roxo, laranja, azul, verde", "vermelho, azul, verde, amarelo, roxo"][stage]}. Qual cor ocupa a posição ${[20, 27, 43][stage]}?`,
      ["verde", "azul", "verde"][stage] ?? "verde",
      stage === 0 ? ["azul", "amarelo"] : stage === 1 ? ["roxo", "verde"] : ["amarelo", "roxo"],
      "Dividimos a posição pelo tamanho do ciclo; o resto identifica a posição dentro da repetição.",
    ),
    c(
      "diferencas",
      `Observe ${["3, 6, 11, 18, 27", "2, 6, 12, 20, 30", "5, 12, 21, 32, 45"][stage]}. Qual é o próximo termo?`,
      [38, 42, 60][stage] ?? 38,
      [[36, 40, 58][stage] ?? 36, [39, 44, 62][stage] ?? 39],
      "As diferenças crescem de dois em dois; prolongamos a sequência de diferenças antes de somar.",
    ),
    c(
      "recorrencia",
      `Uma sequência começa com ${[1, 2, 3][stage]} e cada termo seguinte é o dobro do anterior mais ${[1, 2, 3][stage]}. Qual é o quarto termo?`,
      [15, 30, 45][stage] ?? 15,
      [[12, 24, 36][stage] ?? 12, [17, 32, 48][stage] ?? 17],
      "Aplicamos a mesma regra a cada passagem, sem pular diretamente do primeiro ao quarto termo.",
    ),
    n(
      "soma-aritmetica",
      `Calcule a soma ${["2 + 5 + 8 + 11 + 14", "3 + 7 + 11 + 15 + 19 + 23", "5 + 10 + 15 + 20 + 25 + 30 + 35"][stage]}.`,
      [40, 78, 140][stage] ?? 40,
      "Podemos parear termos das extremidades, que produzem a mesma soma.",
      {
        misreads: [
          {
            value: [26, 55, 105][stage] ?? 26,
            feedback: "Parece que o último termo ficou fora da soma. Confira a lista até o fim.",
          },
        ],
      },
    ),
    n(
      "posicao-de-termo",
      `Na sequência que começa em ${[5, 8, 12][stage]} e aumenta ${[4, 6, 9][stage]}, em qual posição aparece ${[41, 62, 102][stage]}?`,
      [10, 10, 11][stage] ?? 10,
      "Subtraímos o primeiro termo, dividimos pelo passo e somamos uma posição inicial.",
      {
        misreads: [
          {
            value: [9, 9, 10][stage] ?? 9,
            feedback:
              "Você contou quantos passos foram dados. A posição inclui também o primeiro termo da sequência.",
          },
        ],
      },
    ),
  ];
}

function logicSpecs(stage: number): ObjectiveSpec[] {
  return [
    c(
      "negacao",
      `Qual é a negação lógica de “Todos os ${["robôs acenderam", "times pontuaram", "vasos têm etiqueta"][stage]}”?`,
      [
        `Pelo menos um robô não acendeu`,
        `Pelo menos um time não pontuou`,
        `Pelo menos um vaso não tem etiqueta`,
      ][stage] ?? "Pelo menos um robô não acendeu",
      [
        `Nenhum ${["robô acendeu", "time pontuou", "vaso tem etiqueta"][stage]}`,
        `Alguns ${["robôs acenderam", "times pontuaram", "vasos têm etiqueta"][stage]}`,
      ],
      "Para negar uma afirmação universal, basta afirmar a existência de pelo menos um contraexemplo.",
    ),
    c(
      "implicacao",
      [
        "Sabemos: “Se a chave é azul, então abre a porta 2”. A chave é azul. O que podemos concluir?",
        "Sabemos: “Se um cartão tem estrela, então vale dois pontos”. O cartão tem estrela. O que podemos concluir?",
        "Sabemos: “Se a luz verde acende, então a passagem está liberada”. A luz verde acendeu. O que podemos concluir?",
      ][stage] ?? "Se uma condição é confirmada, aplique sua consequência.",
      ["Ela abre a porta 2", "O cartão vale dois pontos", "A passagem está liberada"][stage] ??
        "A consequência declarada ocorre",
      stage === 0
        ? ["Ela não abre a porta 2", "Toda chave que abre a porta 2 é azul"]
        : stage === 1
          ? ["O cartão vale um ponto", "Todo cartão de dois pontos tem estrela"]
          : ["A passagem está bloqueada", "Toda passagem liberada acende essa luz"],
      "A condição foi confirmada, portanto aplicamos a consequência declarada sem inverter a frase.",
    ),
    c(
      "conversa-invalida",
      [
        "Sabemos: “Se um número é múltiplo de 4, então é par”. Um número é par. O que é correto afirmar?",
        "Sabemos: “Se um número é múltiplo de 6, então é múltiplo de 3”. Um número é múltiplo de 3. O que é correto afirmar?",
        "Sabemos: “Se um número termina em zero, então é múltiplo de 5”. Um número é múltiplo de 5. O que é correto afirmar?",
      ][stage] ?? "Uma consequência foi confirmada. O que se pode concluir sobre a condição?",
      [
        "Ele pode ou não ser múltiplo de 4",
        "Ele pode ou não ser múltiplo de 6",
        "Ele pode ou não terminar em zero",
      ][stage] ?? "A condição pode ou não ocorrer",
      stage === 0
        ? ["Ele certamente é múltiplo de 4", "Ele certamente não é múltiplo de 4"]
        : stage === 1
          ? ["Ele certamente é múltiplo de 6", "Ele certamente não é múltiplo de 6"]
          : ["Ele certamente termina em zero", "Ele certamente não termina em zero"],
      "Confirmar a consequência não autoriza concluir a condição; precisamos considerar contraexemplos.",
    ),
    c(
      "eliminacao",
      `${["Ana", "Bia", "Caio"][stage]} escolheu uma caixa entre vermelha, azul e verde. Não escolheu a vermelha. Uma pista elimina também a ${["verde", "azul", "verde"][stage]}. Qual caixa sobrou?`,
      ["azul", "verde", "azul"][stage] ?? "azul",
      stage === 0
        ? ["vermelha", "verde"]
        : stage === 1
          ? ["azul", "vermelha"]
          : ["vermelha", "verde"],
      "Listamos as possibilidades e riscamos somente as que contradizem cada pista.",
    ),
    c(
      "contradicao",
      [
        "Duas placas dizem: A: “O prêmio está na caixa 1”. B: “O prêmio não está na caixa 1”. Quantas dessas frases podem ser verdadeiras ao mesmo tempo?",
        "Uma ficha diz “o número é par” e outra diz “o número não é par”. Quantas podem ser verdadeiras ao mesmo tempo?",
        "Uma seta afirma “a porta está aberta” e outra “a porta não está aberta”. Quantas podem ser verdadeiras ao mesmo tempo?",
      ][stage] ?? "Duas frases são negações exatas. Quantas podem ser verdadeiras ao mesmo tempo?",
      1,
      [0, 2],
      "As duas afirmações são negações exatas; uma é verdadeira e a outra é falsa.",
    ),
    c(
      "contraexemplo",
      `Qual número é um contraexemplo para “Todo número ímpar é primo”?`,
      [9, 15, 21][stage] ?? 9,
      [[7, 11, 13][stage] ?? 7, [2, 3, 5][stage] ?? 2],
      "Um contraexemplo precisa satisfazer a condição inicial e tornar falsa a conclusão: deve ser ímpar e composto.",
    ),
    n(
      "posicoes-com-restricoes",
      `${[3, 4, 5][stage]} pessoas ocupam posições em fila. Lia deve ficar antes de Rui, e Rui antes de Sol. Dentro do bloco consecutivo formado por essas três pessoas, qual é a posição de Rui?`,
      [2, 2, 2][stage] ?? 2,
      "Entre Lia e Sol, Rui ocupa a segunda posição do bloco ordenado.",
      {
        misreads: [
          { value: 1, feedback: "Essa é a posição de Lia, que precisa ficar antes de Rui." },
          { value: 3, feedback: "Essa é a posição de Sol, que precisa ficar depois de Rui." },
        ],
      },
    ),
    n(
      "verdadeiros-e-falsos",
      `Em ${[7, 11, 15][stage]} afirmações, exatamente ${[3, 5, 7][stage]} são falsas. Quantas são verdadeiras?`,
      [4, 6, 8][stage] ?? 4,
      "As afirmações se dividem entre verdadeiras e falsas; subtraímos as falsas do total.",
      {
        misreads: [
          {
            value: [3, 5, 7][stage] ?? 3,
            feedback: "Esse é o número de afirmações falsas. A pergunta pede as verdadeiras.",
          },
        ],
      },
    ),
  ];
}

const skillDefinitions: Record<
  SkillId,
  {
    titles: [string, string, string];
    objectives: [string, string, string];
    introductions: [string, string, string];
    lab: Lesson["lab"];
    specs: (stage: number) => ObjectiveSpec[];
  }
> = {
  fracoes: {
    titles: ["Frações em relações", "Frações em várias etapas", "Frações para argumentar"],
    objectives: [
      "Relacionar parte, todo, razão e equivalência.",
      "Combinar frações em escalas, somas e divisões.",
      "Escolher referências e sustentar comparações entre frações.",
    ],
    introductions: [
      "Uma fração descreve uma relação; identifique inteiro, partes iguais e quantidade tomada.",
      "Em problemas de várias etapas, preserve a unidade e registre o que cada fração representa.",
      "Comparar bem exige uma referência comum, uma equivalência ou um limite que possa ser explicado.",
    ],
    lab: "bars",
    specs: fractionSpecs,
  },
  porcentagem: {
    titles: ["A base da porcentagem", "Mudanças percentuais", "Porcentagens de trás para frente"],
    objectives: [
      "Interpretar porcentagem como uma razão sobre uma base.",
      "Distinguir aumento, desconto e mudanças sucessivas.",
      "Recuperar bases desconhecidas e verificar resultados percentuais.",
    ],
    introductions: [
      "Porcentagem sempre compara uma parte com uma base tomada como cem.",
      "A base pode mudar depois de cada aumento ou redução; anote-a em cada etapa.",
      "Quando o valor final é conhecido, use o fator percentual para reconstruir o ponto de partida.",
    ],
    lab: "bars",
    specs: percentageSpecs,
  },
  precos: {
    titles: ["Preços na mesma medida", "O custo que fica escondido", "Escolhas pelo custo de uso"],
    objectives: [
      "Comparar ofertas por uma unidade comum.",
      "Incluir frete, perdas e condições no custo total.",
      "Relacionar custo, quantidade útil e frequência de uso.",
    ],
    introductions: [
      "Etiquetas diferentes só ficam comparáveis quando calculamos o mesmo tipo de unidade.",
      "Uma comparação justa inclui todos os custos obrigatórios e a quantidade realmente aproveitada.",
      "Preço de compra e custo de uso respondem a perguntas diferentes; escolha a medida adequada.",
    ],
    lab: "groups",
    specs: priceSpecs,
  },
  orcamento: {
    titles: ["Entradas, saídas e saldo", "Metas com restrições", "Planos que suportam imprevistos"],
    objectives: [
      "Organizar receitas, despesas e saldo sem duplicar valores.",
      "Transformar uma meta em valor, prazo e contribuição possível.",
      "Replanejar categorias e margens quando as condições mudam.",
    ],
    introductions: [
      "Um orçamento registra o que entra, o que sai e quando cada valor pode ser usado.",
      "Uma meta executável combina o que já existe, o que falta, um prazo e uma contribuição viável.",
      "Planejar inclui reconhecer incerteza e decidir antecipadamente como ajustar itens opcionais.",
    ],
    lab: "groups",
    specs: budgetSpecs,
  },
  medidas: {
    titles: ["Contorno e cobertura", "Compor e recortar áreas", "Medidas em representações"],
    objectives: [
      "Distinguir perímetro, área e unidade de medida.",
      "Calcular áreas por decomposição e subtração de recortes.",
      "Interpretar escalas, conversões e medidas indiretas.",
    ],
    introductions: [
      "Perímetro mede o contorno; área mede a cobertura. Desenhe e marque a unidade antes da conta.",
      "Figuras compostas podem ser divididas em partes conhecidas ou vistas como uma área maior com recortes.",
      "Uma representação em escala conserva relações; cada segmento precisa ser convertido para a medida real.",
    ],
    lab: "grid",
    specs: measureSpecs,
  },
  simetria: {
    titles: ["Refletir sem deformar", "Girar e deslocar", "Compor transformações"],
    objectives: [
      "Reconhecer e construir reflexões por um eixo.",
      "Distinguir reflexão, rotação e translação.",
      "Prever o resultado de transformações sucessivas em malhas.",
    ],
    introductions: [
      "Na reflexão, cada ponto conserva sua distância perpendicular ao eixo e aparece do outro lado.",
      "Transformações rígidas mudam posição ou orientação, preservando distâncias e ângulos.",
      "Componha uma transformação por vez e registre o estado intermediário para não perder a referência.",
    ],
    lab: "grid",
    specs: symmetrySpecs,
  },
  contagem: {
    titles: ["Listar sem perder casos", "Escolhas em etapas", "Contar com restrições"],
    objectives: [
      "Organizar possibilidades sem repetir nem omitir.",
      "Usar soma ou multiplicação conforme a relação entre etapas.",
      "Separar casos, retirar proibições e conferir a exaustão.",
    ],
    introductions: [
      "Uma lista organizada precisa de uma regra de ordem e um critério claro para saber quando terminou.",
      "Quando cada escolha de uma etapa combina com todas da próxima, multiplicamos as quantidades.",
      "Restrições podem ser tratadas criando casos válidos ou contando tudo e retirando o complemento.",
    ],
    lab: "groups",
    specs: countingSpecs,
  },
  gavetas: {
    titles: ["Quando repetir é inevitável", "Garantias no pior caso", "Distribuições e limites"],
    objectives: [
      "Identificar objetos, categorias e a primeira repetição garantida.",
      "Construir o pior caso antes de forçar uma cota.",
      "Aplicar teto da média e classes de resto em garantias.",
    ],
    introductions: [
      "A repetição fica garantida quando há mais objetos do que categorias disponíveis.",
      "Para provar o mínimo, monte a distribuição que adia a repetição pelo maior tempo possível.",
      "O teto da média fornece uma garantia; um exemplo extremo mostra por que um número menor não basta.",
    ],
    lab: "groups",
    specs: pigeonholeSpecs,
  },
  probabilidade: {
    titles: ["Casos favoráveis e possíveis", "Eventos em sequência", "Modelo e frequência"],
    objectives: [
      "Calcular e comparar chances em resultados equiprováveis.",
      "Analisar etapas com e sem reposição.",
      "Distinguir probabilidade teórica de frequência observada.",
    ],
    introductions: [
      "Quando os casos são igualmente prováveis, compare favoráveis com o total de resultados possíveis.",
      "Em várias etapas, atualize o espaço de possibilidades e observe se uma retirada é devolvida.",
      "A frequência descreve o que ocorreu; o modelo descreve a chance prevista sob hipóteses explícitas.",
    ],
    lab: "groups",
    specs: probabilitySpecs,
  },
  paridade: {
    titles: ["Pares, ímpares e possibilidades", "Restos que organizam", "Ciclos numéricos"],
    objectives: [
      "Usar paridade para decidir possibilidades sem testar todos os números.",
      "Interpretar restos como classes e completar múltiplos.",
      "Reconhecer ciclos de restos e últimos algarismos.",
    ],
    introductions: [
      "A paridade registra apenas o resto por dois, mas já permite provar muitas impossibilidades.",
      "O resto mede o que sobra depois de retirar grupos completos do tamanho do divisor.",
      "Operações repetidas criam ciclos; procure o período antes de calcular termos enormes.",
    ],
    lab: "groups",
    specs: paritySpecs,
  },
  padroes: {
    titles: ["Da repetição à regra", "Posição e termo", "Padrões de diferenças"],
    objectives: [
      "Descrever uma regularidade com palavras e exemplos.",
      "Relacionar a posição ao termo sem listar toda a sequência.",
      "Investigar diferenças, ciclos e recorrências antes de generalizar.",
    ],
    introductions: [
      "Um padrão útil informa o que muda, quanto muda e como prever o passo seguinte.",
      "A posição começa em um; confira a fórmula no primeiro e em outro termo conhecido.",
      "Quando os termos não têm diferença constante, observe as diferenças ou a regra que usa o termo anterior.",
    ],
    lab: "grid",
    specs: patternSpecs,
  },
  logica: {
    titles: ["Pistas e conclusões", "Condições sem inversão", "Argumentos e contraexemplos"],
    objectives: [
      "Combinar pistas eliminando somente casos incompatíveis.",
      "Aplicar implicações sem inverter condição e consequência.",
      "Negar afirmações e construir contraexemplos conclusivos.",
    ],
    introductions: [
      "Liste as possibilidades e aplique uma pista por vez, registrando o motivo de cada eliminação.",
      "Uma frase do tipo “se..., então...” permite avançar quando sua condição é confirmada.",
      "Um contraexemplo basta para refutar uma afirmação universal, desde que cumpra a hipótese.",
    ],
    lab: "groups",
    specs: logicSpecs,
  },
};

const orderDefinitions: Record<SkillId, OrderDefinition> = {
  fracoes: {
    prompt: "Organize um método para calcular uma fração de uma quantidade.",
    labels: [
      "Identificar o inteiro e o denominador",
      "Dividir o inteiro em partes iguais",
      "Multiplicar pelo numerador",
      "Conferir se o resultado cabe no inteiro",
    ],
    explanation:
      "Primeiro obtemos uma parte, depois reunimos a quantidade indicada pelo numerador e verificamos a escala.",
  },
  porcentagem: {
    prompt: "Organize um método para calcular um desconto percentual.",
    constraints: [
      [0, 2],
      [1, 2],
      [2, 3],
    ],
    labels: [
      "Identificar o preço que serve de base",
      "Transformar a taxa em fração ou decimal",
      "Calcular o valor do desconto",
      "Subtrair o desconto do preço inicial",
    ],
    explanation:
      "A taxa incide sobre uma base definida; o desconto calculado é retirado dessa base.",
  },
  precos: {
    prompt: "Organize uma comparação justa entre duas embalagens.",
    constraints: [
      [0, 2],
      [1, 2],
      [2, 3],
    ],
    labels: [
      "Registrar preço e quantidade de cada opção",
      "Escolher uma unidade comum",
      "Calcular os dois preços por unidade",
      "Comparar e declarar o critério usado",
    ],
    explanation: "As duas ofertas precisam ser trazidas para a mesma unidade antes da conclusão.",
  },
  orcamento: {
    prompt: "Organize a construção de um orçamento simples.",
    constraints: [
      [0, 2],
      [1, 2],
      [2, 3],
    ],
    labels: [
      "Listar todas as entradas",
      "Separar despesas obrigatórias e opcionais",
      "Calcular o saldo",
      "Ajustar o plano se o saldo ficar negativo",
    ],
    explanation: "O saldo só é confiável depois de registrar entradas e despesas sem omissões.",
  },
  medidas: {
    prompt: "Organize a solução de uma área composta.",
    constraints: [
      [0, 2],
      [1, 2],
      [2, 3],
    ],
    labels: [
      "Desenhar ou decompor a figura",
      "Marcar as medidas e unidades",
      "Calcular as áreas das partes",
      "Somar ou subtrair as partes e conferir a unidade quadrada",
    ],
    explanation: "A decomposição transforma a figura em áreas conhecidas e conserva a unidade.",
  },
  simetria: {
    prompt: "Organize a construção da imagem de um ponto por reflexão.",
    labels: [
      "Localizar o eixo",
      "Medir a distância perpendicular até o eixo",
      "Marcar a mesma distância no lado oposto",
      "Conferir o alinhamento perpendicular",
    ],
    explanation: "Ponto e imagem ficam alinhados perpendicularmente e à mesma distância do eixo.",
  },
  contagem: {
    prompt: "Organize uma contagem por casos.",
    labels: [
      "Definir o que conta como resultado diferente",
      "Escolher uma primeira categoria de casos",
      "Contar cada categoria sem sobreposição",
      "Somar e conferir se todos os casos foram cobertos",
    ],
    explanation: "Casos disjuntos podem ser somados quando formam uma cobertura completa.",
  },
  gavetas: {
    prompt: "Organize uma prova de garantia pelo pior caso.",
    constraints: [
      [0, 1],
      [1, 2],
      [1, 3],
    ],
    labels: [
      "Identificar objetos e categorias",
      "Distribuir o máximo sem atingir a cota",
      "Adicionar um objeto que força a cota",
      "Mostrar um exemplo que prova a minimalidade",
    ],
    explanation: "O pior caso estabelece o limite e o objeto seguinte força a garantia.",
  },
  probabilidade: {
    prompt: "Organize o cálculo de uma probabilidade equiprovável.",
    labels: [
      "Definir o experimento e os resultados possíveis",
      "Verificar se os casos têm a mesma chance",
      "Contar casos favoráveis e totais",
      "Formar a razão e verificar se está entre zero e um",
    ],
    explanation:
      "A razão favoráveis/total vale quando o espaço amostral está completo e equiprovável.",
  },
  paridade: {
    prompt: "Organize uma análise de possibilidade usando paridade.",
    labels: [
      "Classificar cada parcela como par ou ímpar",
      "Aplicar as regras de soma ou produto",
      "Determinar a paridade obrigatória do resultado",
      "Comparar com a condição pedida",
    ],
    explanation:
      "A conclusão vem da estrutura de paridade, sem precisar testar valores particulares.",
  },
  padroes: {
    prompt: "Organize a investigação de uma sequência.",
    labels: [
      "Registrar termos e posições",
      "Comparar diferenças ou transformações",
      "Propor uma regra",
      "Testar a regra em termos conhecidos e em um novo",
    ],
    explanation:
      "Uma regra só é uma boa generalização depois de ser conferida em mais de uma posição.",
  },
  logica: {
    prompt: "Organize a resolução de um problema de pistas.",
    labels: [
      "Listar todas as possibilidades",
      "Traduzir cada pista sem acrescentar suposições",
      "Eliminar casos contraditórios",
      "Conferir que a possibilidade restante atende a todas as pistas",
    ],
    explanation:
      "Cada eliminação precisa ser justificada por uma pista e a solução deve satisfazer o conjunto inteiro.",
  },
};

const justificationPrompts: Record<SkillId, [string, string, string]> = {
  fracoes: [
    "Explique por que duas frações equivalentes representam a mesma quantidade.",
    "Explique como decidir qual de duas frações está mais perto de 1.",
    "Justifique por que dividir por uma fração equivale a multiplicar pelo inverso.",
  ],
  porcentagem: [
    "Explique por que uma porcentagem precisa de uma base definida.",
    "Explique por que aumentar 20% e depois diminuir 20% não costuma voltar ao início.",
    "Justifique como recuperar um valor inicial a partir do valor depois de um aumento.",
  ],
  precos: [
    "Explique por que o menor preço de etiqueta pode não ser a opção mais barata por unidade.",
    "Justifique quais custos precisam entrar na comparação de duas ofertas.",
    "Explique quando custo por uso é mais informativo que preço de compra.",
  ],
  orcamento: [
    "Explique a diferença entre saldo disponível e total recebido.",
    "Justifique por que uma meta precisa considerar valor e prazo.",
    "Explique como uma margem para imprevistos altera um plano sem julgar as escolhas da família.",
  ],
  medidas: [
    "Explique a diferença entre medir contorno e medir cobertura.",
    "Justifique uma decomposição usada para calcular uma área recortada.",
    "Explique por que uma mudança de escala altera comprimentos e áreas de maneiras diferentes.",
  ],
  simetria: [
    "Explique como conferir se dois pontos são reflexos por um eixo.",
    "Justifique por que uma translação preserva tamanho e orientação.",
    "Explique o resultado de refletir uma figura duas vezes pelo mesmo eixo.",
  ],
  contagem: [
    "Explique como uma lista organizada evita repetir ou omitir casos.",
    "Justifique quando escolhas devem ser multiplicadas em uma contagem.",
    "Explique como conferir que uma divisão em casos cobre todas as possibilidades.",
  ],
  gavetas: [
    "Explique por que uma repetição fica inevitável quando há mais objetos do que categorias.",
    "Justifique o pior caso usado para garantir três objetos da mesma categoria.",
    "Explique como um exemplo extremo mostra que uma garantia é mínima.",
  ],
  probabilidade: [
    "Explique por que contar casos favoráveis exige casos igualmente prováveis.",
    "Justifique como a ausência de reposição muda a segunda chance.",
    "Explique a diferença entre probabilidade de um modelo e frequência observada.",
  ],
  paridade: [
    "Explique por que a soma de dois números ímpares é par.",
    "Justifique uma impossibilidade usando apenas restos.",
    "Explique como um ciclo de últimos algarismos evita calcular uma potência inteira.",
  ],
  padroes: [
    "Explique por que observar poucos termos não prova qualquer regra imaginada.",
    "Justifique uma fórmula de termo geral testando posições.",
    "Explique como diferenças sucessivas podem revelar uma regularidade.",
  ],
  logica: [
    "Explique por que uma conclusão não pode usar uma informação que não aparece nas pistas.",
    "Justifique por que a volta de uma implicação pode ser falsa.",
    "Explique como um único contraexemplo refuta uma afirmação universal.",
  ],
};

const justificationSamples: Record<SkillId, [string, string, string]> = {
  fracoes: [
    "Por exemplo, 2/3 e 4/6 ocupam a mesma parte do inteiro: ao dividir cada terço em duas partes, surgem seis sextos e os dois terços viram quatro sextos. Multiplicar numerador e denominador pelo mesmo número apenas refina as partes, então a quantidade representada não muda.",
    "Para comparar 7/8 e 5/6 com 1, observo o que falta: faltam 1/8 e 1/6. Como 1/8 é menor que 1/6, 7/8 deixa a menor lacuna. Portanto, 7/8 está mais perto de 1.",
    "Se (3/4) ÷ (2/5) = x, então x · 2/5 = 3/4. Multiplicar os dois lados por 5/2 isola x: x = 3/4 · 5/2 = 15/8. Por isso, dividir por 2/5 produz o mesmo resultado que multiplicar por seu inverso 5/2.",
  ],
  porcentagem: [
    "A taxa sozinha não determina uma quantidade. Vinte por cento de 50 é 10, enquanto 20% de 80 é 16. Como o cálculo é taxa vezes valor de referência, é preciso declarar a base para saber qual parte a porcentagem representa.",
    "Partindo de 100, um aumento de 20% leva a 120. A redução seguinte usa 120 como base: 20% de 120 é 24, então restam 96. As bases são diferentes; por isso aumentar e depois diminuir a mesma taxa não devolve, em geral, o valor inicial.",
    "Se um valor cresceu 20% e chegou a 144, o final representa 120% do inicial, ou 1,2 vezes esse valor. Faço 144 ÷ 1,2 = 120. Logo, recuperar o início exige dividir pelo fator de aumento, e não subtrair 20% do final.",
  ],
  precos: [
    "Uma embalagem de 3 unidades por R$ 12 tem etiqueta menor que outra de 5 por R$ 15, mas custa R$ 4 por unidade contra R$ 3. Ao comparar quantidades iguais, a segunda é mais barata por unidade. Portanto, o menor total na etiqueta não garante o menor custo unitário.",
    "Se uma oferta custa R$ 30 mais R$ 8 de frete e outra custa R$ 35 com frete grátis, os totais comparáveis são R$ 38 e R$ 35. Também entram taxas obrigatórias e a quantidade realmente aproveitada. A escolha deve usar o custo completo para a mesma necessidade.",
    "Um item de R$ 40 usado 20 vezes custa R$ 2 por uso; outro de R$ 25 usado 5 vezes custa R$ 5 por uso. Quando durabilidade e frequência de uso diferem, dividir o custo pela quantidade de usos mostra melhor o impacto da compra.",
  ],
  orcamento: [
    "Receber R$ 500 não significa ter R$ 500 livres. Se R$ 320 já estão destinados a despesas e R$ 80 a uma reserva, o saldo disponível é 500 − 320 − 80 = R$ 100. Portanto, saldo é o que permanece depois dos compromissos, não o total recebido.",
    "Para alcançar R$ 240 em seis meses, a meta pede R$ 40 por mês. Sem o prazo, não sabemos o esforço mensal; sem o valor, não sabemos quando terminamos. Valor e prazo juntos permitem verificar se o plano cabe no orçamento.",
    "Num plano de R$ 600, separar R$ 60 para imprevistos deixa R$ 540 para as demais categorias. Se nada inesperado ocorrer, a reserva pode permanecer para o futuro. A margem muda os limites do plano sem classificar nenhuma escolha pessoal como certa ou errada.",
  ],
  medidas: [
    "Num retângulo de 5 m por 3 m, o contorno mede 2·(5+3)=16 m, enquanto a cobertura mede 5·3=15 m². O primeiro soma comprimentos da borda; o segundo conta unidades quadradas internas. Por isso perímetro e área medem aspectos diferentes.",
    "Uma figura em L pode ser vista como um retângulo 6×4 sem um canto 2×1. Calculo 24 − 2 = 22 unidades quadradas. As duas partes não se sobrepõem e recompõem exatamente a figura, então a decomposição preserva sua área.",
    "Ao dobrar todas as medidas de um quadrado de lado 3, o lado vira 6: o comprimento dobra, mas a área passa de 9 para 36, quatro vezes maior. Como a área multiplica duas dimensões, uma escala k multiplica comprimentos por k e áreas por k².",
  ],
  simetria: [
    "Se o eixo é vertical e um ponto está três quadrículas à esquerda dele, sua imagem deve ficar três quadrículas à direita, na mesma linha horizontal. O segmento entre os pontos é perpendicular ao eixo e o eixo passa pelo seu meio. Essas duas verificações confirmam a reflexão.",
    "Transladar um triângulo duas unidades à direita soma o mesmo vetor a todos os vértices. As diferenças entre as coordenadas dos vértices permanecem iguais, então lados, ângulos e a ordem dos pontos não mudam. Logo, tamanho e orientação são preservados.",
    "Na primeira reflexão, cada ponto vai para o lado oposto à mesma distância do eixo. Refletindo de novo pelo mesmo eixo, ele percorre essa distância de volta e retorna à posição inicial. Portanto, duas reflexões pelo mesmo eixo recompõem a figura original.",
  ],
  contagem: [
    "Para formar códigos com uma letra A ou B e um número 1, 2 ou 3, listo A1, A2, A3, B1, B2 e B3 em linhas. Cada par aparece uma vez e cada escolha possível ocupa uma linha e uma coluna. Assim, a organização mostra que são seis casos sem repetição ou omissão.",
    "Se há 3 camisetas e 2 calças e qualquer uma pode combinar com qualquer outra, cada camiseta abre 2 escolhas. São 3 grupos de 2, isto é, 3·2=6 combinações. Multiplicamos porque as escolhas acontecem em etapas independentes e formam pares ordenados.",
    "Ao contar números por paridade, separo todos os casos em pares e ímpares. Nenhum número inteiro pertence aos dois grupos e todo inteiro pertence a um deles. Como os casos são disjuntos e cobrem o universo, somar as duas contagens dá o total sem duplicação.",
  ],
  gavetas: [
    "Com três cores de etiqueta, é possível distribuir três objetos usando uma cor para cada um. O quarto objeto precisa receber uma das três cores já usadas. Assim, quatro objetos em três categorias garantem uma repetição.",
    "Para evitar três objetos da mesma cor entre quatro cores, o pior caso coloca dois em cada cor, totalizando 8. O nono objeto entra em alguma dessas cores e eleva sua quantidade para 3. Logo, 9 garante a cota.",
    "No caso de quatro cores e cota três, oito objetos ainda podem ser distribuídos como 2,2,2,2 sem atingir a cota. Com nove, a repetição tripla é inevitável. Esse exemplo mostra que 9 é suficiente e que nenhum número menor oferece a mesma garantia.",
  ],
  probabilidade: [
    "Num dado equilibrado, cada face tem a mesma chance, então obter número maior que 4 tem 2 casos favoráveis entre 6 e probabilidade 2/6. Num sorteio em que alguns resultados aparecem em mais fichas, contar apenas nomes diferentes seria incorreto. A razão favoráveis/total exige resultados equiprováveis.",
    "Numa caixa com uma ficha marcada e quatro comuns, a chance inicial de tirar a marcada é 1/5. Se sai uma comum e ela não volta, restam quatro fichas e a marcada continua lá, então a segunda chance é 1/4. A ausência de reposição altera o total disponível.",
    "Uma moeda equilibrada tem probabilidade teórica 1/2 de cara, mas em 20 lançamentos podem aparecer 13 caras, frequência 13/20. O modelo descreve a chance antes do experimento; a frequência resume o que foi observado. Elas podem diferir numa amostra finita.",
  ],
  paridade: [
    "Escrevo dois ímpares como 2a+1 e 2b+1. A soma é 2a+1+2b+1 = 2(a+b+1), que é múltiplo de 2. Portanto, a soma de quaisquer dois números ímpares é par.",
    "A soma de quatro ímpares é par, pois posso agrupá-los em dois pares de ímpares. Um número com resto 1 na divisão por 2 é ímpar. Logo, é impossível que essa soma tenha resto 1, independentemente dos valores escolhidos.",
    "As potências de 3 terminam em 3, 9, 7, 1 e então repetem esse ciclo de quatro posições. Para 3^10, uso o resto 2 de 10 por 4 e escolho a segunda posição, 9. Assim, o ciclo determina o último algarismo sem calcular a potência inteira.",
  ],
  padroes: [
    "Os termos 2, 4, 8 podem sugerir dobrar, mas também cabem em outras regras construídas para esses três pontos. Só novos termos ou uma descrição do processo distinguem as regras. Portanto, poucos exemplos apoiam uma hipótese, mas não provam sozinhos uma regra única.",
    "Na sequência 4, 7, 10, 13, proponho a_n=4+3(n−1). Para n=1 obtenho 4; para n=3, 10; e para n=5, prevejo 16. Como a fórmula acerta posições conhecidas e mantém diferença 3, ela representa a sequência aritmética descrita.",
    "Na sequência 1, 4, 9, 16, as primeiras diferenças são 3, 5 e 7; as diferenças dessas diferenças são sempre 2. Essa regularidade constante de segunda ordem indica crescimento quadrático e ajuda a reconhecer a regra n².",
  ],
  logica: [
    "Se as únicas pistas dizem que Ana não está no meio e Bia está à direita, nada informa diretamente quem está à esquerda entre as possibilidades restantes sem listar os casos. Acrescentar uma preferência seria uma suposição. A conclusão válida deve aparecer em todos os casos que satisfazem as pistas dadas.",
    "Da frase 'se é múltiplo de 4, então é par' não segue que todo par seja múltiplo de 4. O número 6 é par e não é múltiplo de 4. Esse contraexemplo mostra que inverter a implicação pode produzir uma afirmação falsa.",
    "A afirmação 'todo número primo é ímpar' é universal. O número 2 é primo e é par, logo não satisfaz a conclusão. Um único caso que atende à condição e contraria a conclusão basta para refutar a afirmação universal.",
  ],
};

const justificationFocus: Record<SkillId, string> = {
  fracoes: "uma relação entre numerador, denominador e inteiro",
  porcentagem: "a taxa e sua base de referência",
  precos: "uma unidade comum e o custo completo",
  orcamento: "entradas, compromissos e saldo",
  medidas: "a grandeza e a unidade correspondentes",
  simetria: "distâncias, direção e transformação",
  contagem: "casos disjuntos e cobertura completa",
  gavetas: "o pior caso antes de forçar a cota",
  probabilidade: "casos possíveis, favoráveis e equiprobabilidade",
  paridade: "classes de resto e suas operações",
  padroes: "termos, posições e uma regra verificável",
  logica: "premissas, casos compatíveis e conclusão",
};

function orderingItem(skillId: SkillId, lessonId: string, stage: number): Item {
  return buildOrderingItem(skillId, lessonId, stage, orderDefinitions[skillId]);
}

function justificationItem(skillId: SkillId, lessonId: string, stage: number): Item {
  return buildJustificationItem(skillId, lessonId, stage, {
    introductions: skillDefinitions[skillId].introductions,
    prompts: justificationPrompts[skillId],
    samples: justificationSamples[skillId],
    focus: justificationFocus[skillId],
  });
}

// Revisões de conteúdo são publicadas sem reescrever snapshots já estudados.
const missionVersions: Readonly<Record<string, number>> = {
  "porcentagem-3": 2,
  "porcentagem-5": 2,
  "precos-3": 2,
  "orcamento-3": 2,
  "medidas-3": 2,
  "medidas-4": 2,
  "medidas-5": 2,
  "gavetas-3": 2,
  "gavetas-4": 2,
  "gavetas-5": 2,
  "paridade-3": 2,
  "paridade-4": 2,
  "paridade-5": 2,
};

export const commercialLessons: Lesson[] = (Object.keys(skillDefinitions) as SkillId[]).flatMap(
  (skillId) => {
    const definition = skillDefinitions[skillId];
    return [0, 1, 2].map((stage) => {
      const id = `${skillId}-${stage + 3}`;
      const items = definition
        .specs(stage)
        .map((spec, index) => objectiveItem(skillId, id, index, spec));
      items.push(orderingItem(skillId, id, stage), justificationItem(skillId, id, stage));
      return {
        id,
        version: missionVersions[id] ?? 1,
        title: definition.titles[stage] ?? definition.titles[0],
        skillId,
        objective: definition.objectives[stage] ?? definition.objectives[0],
        introduction: definition.introductions[stage] ?? definition.introductions[0],
        lab: definition.lab,
        free: false,
        kind: "mission",
        stage: stage === 0 ? "discover" : stage === 1 ? "practice" : "challenge",
        prerequisites: [],
        estimatedMinutes: stage === 2 ? 18 : 15,
        items,
      } satisfies Lesson;
    });
  },
);

/**
 * Questões reservadas das doze habilidades de 6º/7º. Devolve `undefined` para
 * uma habilidade que não é destas: antes, qualquer id desconhecido caía em
 * lógica em silêncio, e uma trilha nova receberia um banco errado.
 */
export function legacyReservedSpec(
  skillId: string,
  seed: number,
  variant: number,
): ChoiceSpec | undefined {
  switch (skillId) {
    case "fracoes": {
      const denominator = 4 + (seed % 4);
      const numerator = 1 + (seed % (denominator - 2));
      const unit = 5 + seed;
      if (variant === 0) {
        const answer = numerator * unit;
        return c(
          "parte-todo-em-medida",
          `Uma faixa tem ${denominator} trechos iguais de ${unit} cm. Uma composição ocupa ${numerator} trechos. Quantos centímetros ela ocupa?`,
          answer,
          distinctNumericOptions(answer),
          `${numerator} × ${unit} = ${answer} cm.`,
        );
      }
      if (variant === 1) {
        const part = numerator * unit;
        const answer = denominator * unit;
        return c(
          "recomposicao-do-inteiro",
          `${numerator}/${denominator} de uma fita medem ${part} cm. Qual é o comprimento da fita inteira?`,
          answer,
          [part, answer - unit],
          `Cada ${numerator} partes mede ${part} cm, então uma parte mede ${unit} cm e ${denominator} partes medem ${answer} cm.`,
        );
      }
      const used = numerator + 1;
      const answer = (denominator - used) * unit;
      return c(
        "complemento-em-medida",
        `Uma barra foi separada em ${denominator} partes de ${unit} cm. Depois de usar ${used} partes, quantos centímetros restam?`,
        answer,
        [used * unit, denominator * unit],
        `Restam ${denominator} − ${used} = ${denominator - used} partes; ${denominator - used} × ${unit} = ${answer} cm.`,
      );
    }
    case "porcentagem": {
      const rates = [10, 20, 25, 40, 50];
      const rate = rates[seed % rates.length] ?? 10;
      const base = 100 + seed * 20;
      if (variant === 0) {
        const answer = (rate * base) / 100;
        return c(
          "parte-de-uma-base",
          `Em um painel de ${base} pontos, ${rate}% ficam destacados. Quantos pontos ficam destacados?`,
          answer,
          distinctNumericOptions(answer),
          `${rate}/100 × ${base} = ${answer}.`,
        );
      }
      if (variant === 1) {
        const highlighted = (rate * base) / 100;
        return c(
          "taxa-a-partir-da-parte",
          `Um painel tem ${base} pontos e ${highlighted} estão destacados. Qual percentual está destacado?`,
          `${rate}%`,
          [`${highlighted}%`, `${100 - rate}%`],
          `${highlighted}/${base} = ${rate}/100, portanto ${rate}%.`,
        );
      }
      const initial = base;
      const final = (initial * (100 + rate)) / 100;
      return c(
        "base-antes-do-aumento",
        `Depois de aumentar ${rate}%, uma pontuação chegou a ${decimal(final)}. Qual era a pontuação inicial?`,
        decimal(initial),
        [decimal(final - rate), decimal((final * (100 - rate)) / 100)],
        `${decimal(final)} corresponde a ${100 + rate}% do início; ${decimal(final)} ÷ ${decimal((100 + rate) / 100)} = ${decimal(initial)}.`,
      );
    }
    case "precos": {
      const quantity = 3 + (seed % 5);
      const unit = 4 + seed;
      if (variant === 0) {
        const total = quantity * unit;
        return c(
          "preco-por-unidade",
          `Uma caixa com ${quantity} refis custa ${brl(total)}. Qual é o custo de cada refil?`,
          brl(unit),
          [brl(total - quantity), brl(total + quantity)],
          `${brl(total)} ÷ ${quantity} = ${brl(unit)} por refil.`,
        );
      }
      if (variant === 1) {
        const shipping = quantity % 2 ? quantity - 1 : quantity + 1;
        const firstTotal = quantity * unit + shipping;
        const secondTotal = quantity * (unit + 1);
        const answer = firstTotal < secondTotal ? "Oferta A" : "Oferta B";
        return c(
          "custo-total-com-frete",
          `Para a mesma quantidade, a oferta A custa ${brl(quantity * unit)} mais ${brl(shipping)} de frete; a oferta B custa ${brl(secondTotal)} com frete incluído. Qual tem menor custo total?`,
          answer,
          [answer === "Oferta A" ? "Oferta B" : "Oferta A", "Custam o mesmo"],
          `Os totais são ${brl(firstTotal)} e ${brl(secondTotal)}; vence ${answer}.`,
        );
      }
      const durableUses = 8 + (seed % 5);
      const cheapUses = 4 + (seed % 3);
      const durableCost = durableUses * unit;
      const cheapCost = cheapUses * (unit + 2);
      const answer = unit < unit + 2 ? "Item durável" : "Item simples";
      return c(
        "custo-por-uso",
        `Um item durável custa ${brl(durableCost)} e rende ${durableUses} usos; outro custa ${brl(cheapCost)} e rende ${cheapUses} usos. Qual tem menor custo por uso?`,
        answer,
        ["Item simples", "Custam o mesmo por uso"],
        `Os custos por uso são ${brl(unit)} e ${brl(unit + 2)}; o item durável tem menor custo por uso.`,
      );
    }
    case "orcamento": {
      const income = 300 + seed * 25;
      const fixed = 110 + seed * 7;
      if (variant === 0) {
        const optional = 35 + seed * 3;
        const answer = income - fixed - optional;
        return c(
          "saldo-depois-dos-compromissos",
          `Um plano dispõe de ${brl(income)}, compromete ${brl(fixed)} e reserva ${brl(optional)}. Qual saldo permanece?`,
          brl(answer),
          [brl(income - fixed), brl(fixed + optional)],
          `${income} − ${fixed} − ${optional} = ${answer}.`,
        );
      }
      if (variant === 1) {
        const months = 4 + (seed % 5);
        const monthly = 30 + seed;
        const goal = months * monthly;
        return c(
          "parcela-mensal-da-meta",
          `Uma meta de ${brl(goal)} deve ser alcançada em ${months} meses, com parcelas iguais. Quanto reservar por mês?`,
          brl(monthly),
          [brl(goal - monthly), brl(monthly + months)],
          `${brl(goal)} ÷ ${months} = ${brl(monthly)} por mês.`,
        );
      }
      const emergency = 40 + seed * 2;
      const answer = income - fixed - emergency;
      return c(
        "limite-de-gasto-com-reserva",
        `De ${brl(income)}, um plano precisa manter ${brl(emergency)} para imprevistos e pagar ${brl(fixed)} em compromissos. Qual é o máximo restante para escolhas opcionais?`,
        brl(answer),
        [brl(income - fixed), brl(income - emergency)],
        `${income} − ${emergency} − ${fixed} = ${answer}.`,
      );
    }
    case "medidas": {
      const width = 6 + seed;
      const height = 3 + (seed % 5);
      if (variant === 0) {
        const cut = 1 + (seed % 2);
        const answer = width * height - cut * cut;
        return c(
          "area-com-recorte",
          `Uma malha retangular de ${width} por ${height} quadrados perde um canto quadrado de lado ${cut}. Quantos quadrados restam?`,
          answer,
          [width * height, 2 * (width + height) - cut],
          `${width} × ${height} − ${cut} × ${cut} = ${answer}.`,
        );
      }
      if (variant === 1) {
        const answer = 2 * (width + height);
        return c(
          "contorno-retangular",
          `Um painel retangular mede ${width} cm por ${height} cm. Quantos centímetros de fita são necessários para contornar sua borda?`,
          answer,
          [width * height, width + height],
          `O contorno tem dois lados de cada medida: 2 × (${width} + ${height}) = ${answer} cm.`,
        );
      }
      const scale = 2 + (seed % 2);
      const originalArea = width * height;
      const answer = originalArea * scale * scale;
      return c(
        "area-depois-da-escala",
        `Uma figura de área ${originalArea} cm² é ampliada com todos os comprimentos multiplicados por ${scale}. Qual será sua área?`,
        answer,
        [originalArea * scale, originalArea + scale],
        `A área usa duas dimensões e é multiplicada por ${scale}²: ${originalArea} × ${scale * scale} = ${answer} cm².`,
      );
    }
    case "simetria": {
      const directions = ["cima", "direita", "baixo", "esquerda"];
      if (variant === 0) {
        const totalTurns = seed + 1;
        const answer = directions[totalTurns % 4] ?? "cima";
        return c(
          "rotacao-em-quartos",
          `Uma seta começa apontando para cima e gira ${totalTurns} quarto(s) de volta no sentido horário. Para onde aponta?`,
          answer,
          directions.filter((direction) => direction !== answer).slice(0, 2) as [string, string],
          "Cada quarto de volta avança no ciclo cima, direita, baixo, esquerda.",
        );
      }
      if (variant === 1) {
        const x = 2 + (seed % 6);
        return c(
          "reflexao-no-eixo-vertical",
          `O ponto (${x}, ${seed + 1}) é refletido no eixo vertical x = 0. Qual é sua imagem?`,
          `(${-x}, ${seed + 1})`,
          [`(${x}, ${-(seed + 1)})`, `(${-x}, ${-(seed + 1)})`],
          `A reflexão no eixo vertical troca o sinal de x e conserva y: (${-x}, ${seed + 1}).`,
        );
      }
      const horizontal = 2 + (seed % 5);
      const vertical = 1 + (seed % 4);
      return c(
        "composicao-de-translacoes",
        `Um ponto anda ${horizontal} unidades à direita e depois ${vertical} para cima. Qual vetor único produz o mesmo deslocamento?`,
        `(${horizontal}, ${vertical})`,
        [`(${-horizontal}, ${vertical})`, `(${horizontal}, ${-vertical})`],
        `Somamos os deslocamentos por eixo; o vetor resultante é (${horizontal}, ${vertical}).`,
      );
    }
    case "contagem": {
      const first = 2 + (seed % 5);
      const second = 3 + (seed % 7);
      if (variant === 0) {
        const answer = first * second - 1;
        return c(
          "etapas-com-uma-restricao",
          `Uma montagem combina uma de ${first} bases com uma de ${second} coberturas, mas uma combinação é incompatível. Quantas montagens são possíveis?`,
          answer,
          [first * second, answer - 1],
          `${first} × ${second} − 1 = ${answer}.`,
        );
      }
      if (variant === 1) {
        const people = 5 + (seed % 12);
        const rounds = 1 + Math.floor(seed / 12);
        const answer = ((people * (people - 1)) / 2) * rounds;
        return c(
          "pares-sem-ordem",
          `Entre ${people} participantes, todos os pares são formados em cada uma de ${rounds} rodada(s). Quantos pares são registrados ao todo?`,
          answer,
          [answer + people, answer - rounds],
          `${people} × ${people - 1} ÷ 2 = ${(people * (people - 1)) / 2} pares por rodada; em ${rounds} rodada(s), são ${answer}.`,
        );
      }
      const symbols = 4 + (seed % 5);
      const answer = symbols * (symbols - 1);
      return c(
        "codigos-sem-repeticao",
        `Um código tem duas posições e usa ${symbols} símbolos distintos, sem repetir símbolo. Quantos códigos são possíveis?`,
        answer,
        [symbols * symbols, (symbols * (symbols - 1)) / 2],
        `Há ${symbols} escolhas na primeira posição e ${symbols - 1} na segunda: ${answer}.`,
      );
    }
    case "gavetas": {
      const groups = 3 + (seed % 8);
      if (variant === 0) {
        const quota = 3 + (seed % 3);
        const answer = groups * (quota - 1) + 1;
        return c(
          "garantia-de-uma-cota",
          `Há ${groups} etiquetas possíveis. Qual é o menor número de objetos que garante pelo menos ${quota} com a mesma etiqueta?`,
          answer,
          [answer - 1, answer + groups],
          `Com ${quota - 1} por etiqueta ainda evitamos a cota; o objeto seguinte a força: ${answer}.`,
        );
      }
      if (variant === 1) {
        const answer = groups + 1;
        return c(
          "primeira-repeticao-garantida",
          `Uma caixa recebe objetos de ${groups} cores. Qual é o menor número de objetos que garante que alguma cor apareça pelo menos duas vezes?`,
          answer,
          [groups, groups * 2],
          `Com ${groups} objetos ainda cabe uma cor por objeto; o próximo força repetição, total ${answer}.`,
        );
      }
      const quota = 2 + (seed % 3);
      const safe = groups * (quota - 1);
      return c(
        "pior-caso-ainda-sem-cota",
        `Há ${groups} categorias. Qual é o maior número de objetos que ainda pode ser distribuído sem colocar ${quota} na mesma categoria?`,
        safe,
        [safe + 1, groups * quota],
        `Podemos pôr no máximo ${quota - 1} em cada categoria: ${groups} × ${quota - 1} = ${safe}.`,
      );
    }
    case "probabilidade": {
      const total = 8 + (seed % 9);
      const favorable = 2 + (seed % (total - 3));
      if (variant === 0) {
        const answer = `${favorable}/${total}`;
        const complement = total - favorable;
        const firstWrong =
          complement === favorable ? `${favorable + 1}/${total}` : `${complement}/${total}`;
        return c(
          "razao-no-espaco-amostral",
          `Uma roleta equilibrada tem ${total} setores, dos quais ${favorable} exibem uma estrela. Qual é a chance de obter estrela?`,
          answer,
          [firstWrong, `${favorable}/${total - 1}`],
          `Há ${favorable} casos favoráveis entre ${total} equiprováveis.`,
        );
      }
      if (variant === 1) {
        const marked = 1 + Math.floor(seed / 12);
        const common = 7 + (seed % 12);
        const remaining = marked + common - 1;
        return c(
          "chance-condicional-sem-reposicao",
          `Uma caixa tem ${marked} ficha(s) marcada(s) e ${common} comuns. Uma comum saiu e não voltou. Qual é a chance de a próxima ser marcada?`,
          `${marked}/${remaining}`,
          [`${marked}/${remaining + 1}`, `${marked + 1}/${remaining}`],
          `Restam ${remaining} fichas e ${marked} delas são marcadas, então a chance é ${marked}/${remaining}.`,
        );
      }
      const losing = total - favorable;
      const firstWrong = losing === favorable ? `${favorable + 1}/${total}` : `${losing}/${total}`;
      return c(
        "probabilidade-do-complementar",
        `Em ${total} resultados equiprováveis, ${losing} não atendem ao objetivo. Qual é a chance de atender ao objetivo?`,
        `${favorable}/${total}`,
        [firstWrong, `${favorable}/${total - 1}`],
        `O complementar deixa ${total} − ${losing} = ${favorable} casos favoráveis; a chance é ${favorable}/${total}.`,
      );
    }
    case "paridade": {
      if (variant === 0) {
        const divisor = 3 + (seed % 7);
        const firstRemainder = seed % divisor;
        const secondRemainder = (seed + 2) % divisor;
        const first = divisor * (seed + 4) + firstRemainder;
        const second = divisor * (seed + 2) + secondRemainder;
        const answer = (firstRemainder + secondRemainder) % divisor;
        return c(
          "resto-de-uma-soma",
          `Sem efetuar a soma completa, qual é o resto de ${first} + ${second} na divisão por ${divisor}?`,
          answer,
          distinctNumericOptions(answer),
          `Os restos são ${firstRemainder} e ${secondRemainder}; a soma dos restos deixa resto ${answer} por ${divisor}.`,
        );
      }
      if (variant === 1) {
        const oddTerms = 3 + 2 * (seed % 8);
        const evenTerms = 2 + 2 * Math.floor(seed / 8);
        return c(
          "paridade-de-uma-soma",
          `Qual é a paridade da soma de ${oddTerms} números ímpares e ${evenTerms} números pares?`,
          "ímpar",
          ["par", "depende dos números"],
          `Uma quantidade ímpar de ímpares soma ímpar; acrescentar pares preserva essa paridade.`,
        );
      }
      const exponent = 5 + (seed % 8);
      const cycle = [7, 9, 3, 1];
      const answer = cycle[(exponent - 1) % 4] ?? 7;
      const wrong = cycle.filter((digit) => digit !== answer).slice(0, 2) as [number, number];
      return c(
        "ciclo-do-ultimo-algarismo",
        `Qual é o último algarismo de 7 elevado a ${exponent}?`,
        answer,
        wrong,
        `Os finais 7, 9, 3, 1 repetem a cada quatro expoentes; a posição de ${exponent} dá ${answer}.`,
      );
    }
    case "padroes": {
      const start = 2 + seed;
      const step = 2 + (seed % 5);
      if (variant === 0) {
        const position = 6 + (seed % 4);
        const answer = start + (position - 1) * step;
        return c(
          "termo-em-progressao-aritmetica",
          `Uma sequência começa em ${start} e cresce ${step} a cada termo. Qual é o termo da posição ${position}?`,
          answer,
          [start + position * step, answer - step],
          `Há ${position - 1} aumentos: ${start} + ${position - 1} × ${step} = ${answer}.`,
        );
      }
      if (variant === 1) {
        const position = 5 + (seed % 6);
        const value = start + (position - 1) * step;
        return c(
          "posicao-a-partir-do-termo",
          `A sequência começa em ${start} e aumenta ${step}. Em qual posição aparece o termo ${value}?`,
          position,
          [position - 1, position + 1],
          `${value} − ${start} = ${(position - 1) * step}, que corresponde a ${position - 1} passos; portanto é a posição ${position}.`,
        );
      }
      const position = 4 + (seed % 12);
      const copies = 1 + Math.floor(seed / 12);
      const oneFigure = (position * (position + 1)) / 2;
      const answer = oneFigure * copies;
      return c(
        "padrao-triangular",
        `Cada uma de ${copies} figura(s) tem 1 ponto na primeira fileira, 2 na segunda e assim por diante. Quantos pontos há ao todo quando cada figura completa ${position} fileiras?`,
        answer,
        [answer + position, answer - copies],
        `Uma figura usa ${position} × ${position + 1} ÷ 2 = ${oneFigure} pontos; ${copies} figura(s) usam ${answer}.`,
      );
    }
    case "logica": {
      const a = `cartão ${seed + 1}`;
      const b = `cartão ${seed + 2}`;
      const d = `cartão ${seed + 3}`;
      if (variant === 0)
        return c(
          "eliminacao-por-posicoes",
          `${a}, ${b} e ${d} ocupam esquerda, centro e direita. ${b} está à direita e ${a} não está no centro. Quem está no centro?`,
          d,
          [a, b],
          `${b} ocupa a direita; como ${a} não pode ficar no centro, ${d} fica no centro.`,
        );
      if (variant === 1) {
        const counterexample = [8, 10, 14, 16, 20][seed % 5] ?? 8;
        return c(
          "contraexemplo-de-implicacao",
          "Se um número é múltiplo de 6, então é par. Qual opção mostra que a afirmação inversa é falsa?",
          `${counterexample} é par e não é múltiplo de 6`,
          ["12 é par e múltiplo de 6", "9 não é par nem múltiplo de 6"],
          `Para refutar a inversa, precisamos de um número par que não seja múltiplo de 6; ${counterexample} serve.`,
        );
      }
      return c(
        "deducao-com-verdade-e-mentira",
        `${a} diz “o prêmio está com ${a}”. ${b} também diz “o prêmio está com ${a}”. ${d} diz “o prêmio não está com ${d}”. Apenas uma frase é verdadeira. Com quem está o prêmio?`,
        b,
        [a, d],
        `Com ${a}, as três frases seriam verdadeiras; com ${d}, nenhuma seria. Com ${b}, apenas a frase de ${d} é verdadeira.`,
      );
    }
  }
  return undefined;
}

export type AssessmentCourse = Pick<Course, "id" | "title" | "skills" | "olympiad" | "bankSeed">;

const assessmentVersions: Readonly<Record<string, { diagnostic: number; exam: number }>> = {
  "olitef-n1": { diagnostic: 3, exam: 4 },
  "obmep-n1": { diagnostic: 3, exam: 4 },
  "canguru-s": { diagnostic: 3, exam: 4 },
};

/**
 * Banco reservado de uma trilha: doze questões que percorrem as habilidades
 * dela em rodízio. `resolveReserved` devolve a especificação da habilidade
 * (pack novo ou legado); sem ela, a trilha não pode existir.
 */
export function makeAssessmentBank(
  course: AssessmentCourse,
  mode: "diagnostic" | "exam",
  resolveReserved: (skillId: string, seed: number, variant: 0 | 1 | 2) => ChoiceSpec | undefined,
): Lesson {
  const id = `bank:${mode}:${course.id}`;
  const items = Array.from({ length: 12 }, (_, index) => {
    const skillId = course.skills[index % course.skills.length] ?? course.skills[0] ?? "logica";
    const variant = (Math.floor(index / course.skills.length) % 3) as 0 | 1 | 2;
    const baseSpec = resolveReserved(
      skillId,
      course.bankSeed + index + (mode === "exam" ? 101 : 0),
      variant,
    );
    if (!baseSpec) throw new Error(`Sem questões reservadas para a habilidade ${skillId}`);
    const spec = mode === "exam" ? verificationSpec(baseSpec) : baseSpec;
    const numberedSpec = {
      ...spec,
      prompt: `Questão ${course.bankSeed + index + (mode === "exam" ? 13 : 1)}. ${spec.prompt}`,
    };
    const item = objectiveItem(skillId, id, index, numberedSpec);
    return {
      ...item,
      familyId: `${skillId}:assess:${spec.family}`,
      purpose: "assessment" as const,
      domain: course.olympiad,
    };
  });
  return {
    id,
    version: assessmentVersions[course.id]?.[mode] ?? (mode === "exam" ? 3 : 2),
    title: `${mode === "diagnostic" ? "Diagnóstico" : "Avaliação formativa"} · ${course.title}`,
    skillId: "mixed",
    objective:
      mode === "diagnostic"
        ? "Mapear estratégias de entrada sem conceder domínio antecipado."
        : "Observar transferência para problemas inéditos depois do percurso.",
    introduction:
      "As atividades deste percurso são autorais, reservadas e não reproduzem uma edição oficial.",
    lab: null,
    free: mode === "diagnostic",
    kind: "assessment-bank",
    stage: "assessment",
    prerequisites: [],
    estimatedMinutes: mode === "diagnostic" ? 18 : 35,
    items,
  };
}
