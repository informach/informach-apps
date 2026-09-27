import { c, n, decimal as real, type SkillPack } from "../skill-factory";

/**
 * Investimentos: guardar com objetivo, rendimento e prazo, risco e retorno,
 * liquidez, diversificação e leitura crítica de promessas de ganho.
 * Trilha OLITEF N2.
 */
export const investimentos: SkillPack = {
  id: "investimentos",
  name: "Investimentos e risco",
  domain: "olitef",
  lab: "bars",
  missions: [
    {
      title: "Guardar com objetivo",
      objective:
        "Entender por que investir é diferente de só guardar e calcular rendimentos simples.",
      introduction:
        "Guardar dinheiro é separar; investir é colocar esse dinheiro para render. O rendimento é uma porcentagem do que foi aplicado em um período.",
      specs: [
        n(
          "rendimento",
          "Uma aplicação de R$ 500 rendeu 4% em um ano. Quanto ela rendeu, em reais?",
          20,
          "4% de 500 = 20.",
          {
            misreads: [
              { value: 520, feedback: "520 é o total ao final; a pergunta pede só o rendimento." },
            ],
          },
        ),
        c(
          "conceito",
          "A diferença entre guardar dinheiro no cofre e investir é que:",
          "Investido, o dinheiro rende; no cofre, perde poder de compra",
          [
            "No cofre, o dinheiro fica protegido da inflação",
            "Investido, o lucro é garantido; no cofre, nada muda",
          ],
          "No cofre não há rendimento, e qualquer inflação reduz o que aquele dinheiro compra. Investido, ele rende e pode acompanhar ou vencer a inflação.",
          {
            feedback: [
              "O cofre protege de roubo, não da inflação: as notas continuam as mesmas, mas os preços sobem e elas compram menos.",
              "Nenhum investimento garante lucro, e alguns podem perder. E no cofre algo muda, sim: a inflação reduz o que o dinheiro compra.",
            ],
          },
        ),
        n(
          "rendimento",
          "Uma aplicação de R$ 1.200 rende 0,5% ao mês. Quanto ela rende no primeiro mês, em reais?",
          6,
          "0,5% de 1.200 = 6.",
          { misreads: [{ value: 60, feedback: "60 seria 5%; a taxa é 0,5%." }] },
        ),
        c(
          "conceito",
          "Uma família guarda R$ 200 por mês para uma viagem daqui a um ano. Investir esse dinheiro em vez de deixá-lo parado serve principalmente para:",
          "Fazer o valor render e não perder poder de compra",
          [
            "Poder sacar e gastar o dinheiro antes da viagem",
            "Garantir que a viagem fique mais barata",
          ],
          "O objetivo tem prazo; investir até a data da viagem mantém o poder de compra e acrescenta rendimento.",
          {
            feedback: [
              "Investir é justamente para não gastar antes: o dinheiro fica aplicado até a data da viagem.",
              "O preço da viagem não depende de onde o dinheiro está; investir faz o dinheiro crescer, não o preço cair.",
            ],
          },
        ),
        n(
          "rendimento",
          "Uma aplicação de R$ 2.000 rendeu R$ 130 em um ano. Qual foi a taxa de rendimento, em porcentagem?",
          6.5,
          "130 ÷ 2.000 = 0,065: 6,5%.",
          { misreads: [{ value: 13, feedback: "13% seria 130 sobre 1.000; a base é 2.000." }] },
        ),
        c(
          "conceito",
          "Uma pessoa investe R$ 1.000 a 6% ao ano. Depois de um ano, saca tudo. Com quanto ela sai?",
          "R$ 1.060",
          ["R$ 1.006", "R$ 1.600"],
          "1.000 + 6% de 1.000 = 1.060.",
          {
            feedback: [
              "R$ 1.006 soma 6 reais; 6% de 1.000 são 60.",
              "R$ 1.600 seria um rendimento de 60%.",
            ],
          },
        ),
        n(
          "rendimento",
          "Quanto é preciso aplicar a 5% ao ano para receber R$ 75 de rendimento em um ano, em reais?",
          1500,
          "75 ÷ 0,05 = 1.500.",
          {
            misreads: [
              { value: 375, feedback: "Multiplicou 75 por 5; para achar a base, divida por 0,05." },
            ],
          },
        ),
        c(
          "conceito",
          "Duas aplicações: A rende 7% ao ano e cobra taxa de 2% ao ano; B rende 5,5% ao ano sem taxa. Em um ano, com o mesmo valor aplicado, a melhor foi:",
          "B, que rende 5,5% contra 5% de A",
          ["A, porque 7% é maior que 5,5%", "As duas empatam depois de descontar a taxa"],
          "O que importa é o rendimento líquido, depois das taxas: A fica com 7% − 2% = 5%, e B, sem taxa, rende 5,5%.",
          {
            feedback: [
              "Comparou só o rendimento bruto; a taxa de 2% reduz o ganho de A para 5%.",
              "Descontada a taxa, A fica com 5%, meio ponto abaixo dos 5,5% de B: não há empate.",
            ],
          },
        ),
      ],
    },
    {
      title: "Tempo e rendimento",
      objective:
        "Calcular o crescimento de um investimento ao longo de alguns períodos e o efeito de aportes.",
      introduction:
        "Investimento cresce com o tempo: a cada período o rendimento incide sobre o total já acumulado. Aportes regulares somam ao montante e também passam a render.",
      specs: [
        n(
          "crescimento",
          "R$ 1.000 aplicados a 10% ao ano viram quanto depois de 2 anos, com o rendimento reinvestido, em reais?",
          1210,
          "1.000 × 1,1 × 1,1 = 1.210.",
          {
            misreads: [
              {
                value: 1200,
                feedback: "1.200 soma 10% duas vezes sobre 1.000; no segundo ano a base é 1.100.",
              },
            ],
          },
        ),
        c(
          "crescimento",
          "R$ 800 rendem 5% ao ano com reinvestimento. Depois de 3 anos, o valor fica:",
          "R$ 926,10",
          ["R$ 920", "R$ 840"],
          "800 × 1,05³ = 800 × 1,157625 = 926,10.",
          {
            feedback: [
              "R$ 920 soma 5% três vezes sobre 800, ignorando o rendimento sobre rendimento.",
              "R$ 840 é o valor depois de um ano só.",
            ],
          },
        ),
        n(
          "aportes",
          "Uma pessoa aplica R$ 100 hoje e mais R$ 100 daqui a um ano, a 10% ao ano. Quanto terá logo após o segundo aporte, em reais?",
          210,
          "100 × 1,1 = 110; mais 100 = 210.",
          {
            misreads: [
              {
                value: 220,
                feedback:
                  "220 faria os dois aportes renderem um ano, mas o segundo acabou de entrar.",
              },
            ],
          },
        ),
        c(
          "crescimento",
          "Qual investimento acumula mais em 2 anos: R$ 1.000 a 12% ao ano ou R$ 1.000 a 1% ao mês, ambos com reinvestimento?",
          "O de 1% ao mês, porque 1,01²⁴ é maior que 1,12²",
          ["O de 12% ao ano, porque 12% é uma taxa maior", "Os dois empatam, porque 12 × 1% = 12%"],
          "1,01¹² é cerca de 1,127, mais que 1,12; em dois anos a diferença cresce.",
          {
            feedback: [
              "12% ao ano é menos que 1% ao mês capitalizado.",
              "Multiplicar a taxa mensal por 12 ignora o rendimento sobre rendimento.",
            ],
          },
        ),
        n(
          "aportes",
          "Uma pessoa aplica R$ 200 por mês durante 3 meses em uma aplicação que não rende nada nesse período. Quanto tem ao final, em reais?",
          600,
          "3 × 200 = 600: sem rendimento, o total é a soma dos aportes.",
          { misreads: [{ value: 200, feedback: "200 é um só aporte; foram três." }] },
        ),
        c(
          "crescimento",
          "Dobrar o dinheiro a 10% ao ano leva cerca de:",
          "7 anos",
          ["10 anos", "5 anos"],
          "1,1⁷ é cerca de 1,95; 1,1⁸ passa de 2,1.",
          {
            feedback: [
              "10 anos daria 1,1¹⁰, cerca de 2,59: muito mais que o dobro.",
              "1,1⁵ é cerca de 1,61, ainda longe do dobro.",
            ],
          },
        ),
        n(
          "crescimento",
          "R$ 5.000 aplicados a 8% ao ano rendem quanto no segundo ano, em reais, com reinvestimento?",
          432,
          "Ao final do 1º ano: 5.400; 8% de 5.400 = 432.",
          {
            misreads: [
              {
                value: 400,
                feedback: "400 é o rendimento do primeiro ano; no segundo a base é 5.400.",
              },
            ],
          },
        ),
        c(
          "aportes",
          "Duas pessoas guardam R$ 100 por mês a uma mesma taxa. Ana começou 5 anos antes de Bia, e as duas param no mesmo mês. Ao parar, Ana terá:",
          "Mais de R$ 6.000 a mais que Bia",
          ["Exatamente R$ 6.000 a mais que Bia", "O mesmo que Bia, porque a taxa é igual"],
          "5 anos × 12 × 100 = 6.000 de aportes a mais, e esse dinheiro rendeu durante todo o período; por isso a diferença passa de R$ 6.000.",
          {
            feedback: [
              "Os 6.000 são só os aportes a mais; eles também renderam, então a diferença é maior.",
              "A taxa é a mesma, mas Ana aportou por mais tempo; mesma taxa por mais tempo acumula mais.",
            ],
          },
        ),
      ],
    },
    {
      title: "Risco, retorno e liquidez",
      objective: "Relacionar risco e retorno esperado e entender liquidez e prazo.",
      introduction:
        "Todo investimento equilibra três coisas: quanto pode render, quanto pode variar e quando o dinheiro pode ser retirado. Quem promete mais retorno costuma cobrar mais risco ou mais prazo.",
      specs: [
        c(
          "risco-retorno",
          "Um investimento A rende sempre 6% ao ano. Um investimento B rendeu 20% em um ano e perdeu 10% no seguinte. Sobre risco, podemos dizer que:",
          "B tem mais risco, porque oscila muito",
          [
            "A tem mais risco, porque rende menos",
            "Os dois têm o mesmo risco, pois ambos lucraram",
          ],
          "Risco é a variação do resultado, não o tamanho do ganho: o resultado de B varia muito de um ano para outro, e A é previsível.",
          {
            feedback: [
              "Render menos não é risco; risco é incerteza, e A rende sempre o mesmo.",
              "Ter lucrado no fim não mede o risco: A é previsível, e B subiu 20% e depois caiu 10%.",
            ],
          },
        ),
        n(
          "risco-retorno",
          "Um investimento de R$ 1.000 rendeu 20% no primeiro ano e perdeu 10% no segundo. Quanto vale ao final, em reais?",
          1080,
          "1.000 × 1,2 × 0,9 = 1.080.",
          {
            misreads: [
              {
                value: 1100,
                feedback: "1.100 soma 20% e tira 10% sobre 1.000; a perda incide sobre 1.200.",
              },
            ],
          },
        ),
        c(
          "liquidez",
          "Liquidez de um investimento é:",
          "A facilidade de resgatar sem perder valor",
          ["A rapidez com que o investimento rende", "O valor mínimo necessário para aplicar"],
          "Liquidez é a facilidade de transformar o investimento em dinheiro sem perder valor. Alta liquidez: resgate rápido; baixa liquidez: prazo de carência ou perda ao sair antes.",
          {
            feedback: [
              "A rapidez do rendimento fala de retorno, não de liquidez; liquidez trata da saída do dinheiro.",
              "Valor mínimo é uma condição de entrada, não de saída.",
            ],
          },
        ),
        c(
          "liquidez",
          "Uma família guarda dinheiro para emergências, que podem acontecer a qualquer momento. O investimento mais adequado para essa reserva tem:",
          "Alta liquidez e baixo risco, mesmo rendendo menos",
          ["Retorno alto, mesmo com prazo de 5 anos", "Alto risco, para render mais rápido"],
          "Emergência exige acesso imediato e valor preservado.",
          {
            feedback: [
              "Prazo longo trava o dinheiro justamente quando ele pode ser necessário.",
              "Risco alto pode fazer faltar dinheiro na hora da emergência.",
            ],
          },
        ),
        n(
          "risco-retorno",
          "Um investimento perdeu 25% em um ano. Quantos por cento ele precisa render no ano seguinte para voltar ao valor inicial? Arredonde para o inteiro mais próximo.",
          33,
          "Depois da perda sobra 75%; para voltar a 100% é preciso multiplicar por 4/3, ou seja, render cerca de 33%.",
          { misreads: [{ value: 25, feedback: "25% sobre 75 dá 93,75, ainda abaixo de 100." }] },
        ),
        c(
          "risco-retorno",
          "Um anúncio promete 'rendimento garantido de 5% ao mês, sem risco'. A leitura mais sensata é:",
          "Desconfiar: 5% ao mês sem risco costuma ser golpe",
          [
            "Aceitar, porque está escrito que é garantido",
            "Aceitar, porque 5% parece uma taxa pequena",
          ],
          "5% ao mês é cerca de 80% ao ano, muito acima dos investimentos comuns; ninguém garante isso sem risco, e promessas assim costumam ser golpe.",
          {
            feedback: [
              "A palavra 'garantido' não garante nada; a taxa é que denuncia.",
              "5% ao mês não é pouco: 1,05¹² é cerca de 1,8, quase 80% ao ano.",
            ],
          },
        ),
        n(
          "risco-retorno",
          "Um investimento rendeu 30% em um ano e perdeu 30% no seguinte. Ao final, quantos por cento abaixo do valor inicial ele ficou?",
          9,
          "1,3 × 0,7 = 0,91: 9% abaixo.",
          {
            misreads: [
              {
                value: 0,
                feedback:
                  "Ganhar 30% e perder 30% não se anulam: a perda incide sobre um valor maior.",
              },
            ],
          },
        ),
        c(
          "liquidez",
          "Um investimento paga 9% ao ano se o dinheiro ficar 2 anos e só 3% se for retirado antes. Para uma meta de 6 meses, ele:",
          "Não é adequado: em 6 meses, paga só 3%",
          ["É adequado, porque rende 9% ao ano", "É indiferente, pois o prazo não muda a taxa"],
          "O retorno alto só vale para quem cumpre o prazo; para a meta de 6 meses, a retirada antecipada paga só 3%.",
          {
            feedback: [
              "Os 9% exigem 2 anos; com a meta de 6 meses, a retirada antecipada paga só 3%.",
              "O prazo muda a taxa, sim: sair antes dos 2 anos derruba o rendimento de 9% para 3%.",
            ],
          },
        ),
      ],
    },
    {
      title: "Não colocar tudo na mesma cesta",
      objective: "Entender diversificação e comparar carteiras simples.",
      introduction:
        "Dividir o dinheiro entre investimentos diferentes reduz o estrago quando um deles vai mal. O rendimento de uma carteira é a média dos rendimentos, ponderada pelo quanto foi para cada um.",
      specs: [
        n(
          "carteira",
          "Uma pessoa aplica R$ 600 em A, que rendeu 10%, e R$ 400 em B, que rendeu 5%. Quanto a carteira rendeu, em reais?",
          80,
          "60 + 20 = 80.",
          {
            misreads: [
              {
                value: 75,
                feedback:
                  "75 aplica a média simples de 7,5% aos 1.000; as partes têm pesos diferentes.",
              },
            ],
          },
        ),
        c(
          "carteira",
          "Na carteira anterior (R$ 600 a 10% e R$ 400 a 5%), o rendimento percentual do total foi:",
          "8%",
          ["7,5%", "15%"],
          "80 ÷ 1.000 = 8%.",
          {
            feedback: ["7,5% é a média simples; A pesa mais na carteira.", "15% soma as taxas."],
          },
        ),
        c(
          "diversificacao",
          "Uma pessoa colocou todo o dinheiro em um único investimento que perdeu 40%. Se tivesse dividido em quatro investimentos iguais, só esse perdesse 40% e os outros três não variassem, a perda da carteira seria de:",
          "10%",
          ["40%", "4%"],
          "40% de um quarto = 10% do total.",
          {
            feedback: [
              "40% foi só da parte afetada, que era um quarto.",
              "Um quarto de 40% é 10%, não 4%.",
            ],
          },
        ),
        n(
          "carteira",
          "Uma carteira tem R$ 2.000 em renda fixa a 8% ao ano e R$ 500 em ações que caíram 12% no ano. Quanto a carteira rendeu no ano, em reais?",
          100,
          "160 − 60 = 100.",
          { misreads: [{ value: 220, feedback: "Somou a perda das ações como se fosse ganho." }] },
        ),
        c(
          "diversificacao",
          "Diversificar significa:",
          "Distribuir o dinheiro entre aplicações que não caem juntas",
          ["Aplicar em vários investimentos iguais", "Trocar de investimento sempre que um cair"],
          "O que protege é a diferença de comportamento entre as partes: investimentos que não sobem e descem juntos amortecem as quedas.",
          {
            feedback: [
              "Vários iguais caem juntos: não há proteção.",
              "Trocar a cada queda gera custo e costuma vender na baixa; isso não é diversificar.",
            ],
          },
        ),
        n(
          "carteira",
          "Uma pessoa tem R$ 4.000 e quer 25% em um investimento de mais risco. Quantos reais vão para ele?",
          1000,
          "25% de 4.000 = 1.000.",
          {
            misreads: [{ value: 3000, feedback: "3.000 é a parte de menor risco, os outros 75%." }],
          },
        ),
        c(
          "carteira",
          "Carteira 1: 100% em um investimento que rendeu 12%. Carteira 2: metade a 12% e metade a 6%. Sobre o ano, é correto dizer:",
          "A carteira 1 rendeu 12% contra 9%, com mais risco",
          [
            "A carteira 2 rendeu mais, porque é diversificada",
            "A carteira 1 rendeu mais, com o mesmo risco da 2",
          ],
          "A carteira 2 rendeu (12% + 6%) ÷ 2 = 9%, menos que a 1, que assumiu mais risco de concentração. Diversificar não garante render mais; reduz o impacto de um resultado ruim.",
          {
            feedback: [
              "Neste ano a concentração deu certo: a carteira 2 rendeu 9%. Diversificar protege, não maximiza.",
              "O rendimento está certo, mas o risco não: com tudo em um só investimento, um resultado ruim atinge a carteira inteira.",
            ],
          },
        ),
        n(
          "carteira",
          "Uma carteira de R$ 3.000 tem três partes iguais que renderam 9%, 3% e −3%. Qual foi o rendimento da carteira, em porcentagem?",
          3,
          "(9 + 3 − 3) ÷ 3 = 3%, porque as partes são iguais.",
          { misreads: [{ value: 9, feedback: "9% foi só uma das três partes." }] },
        ),
      ],
    },
    {
      title: "Investir para decidir",
      objective:
        "Comparar alternativas de investimento considerando objetivo, prazo, risco e custos.",
      introduction:
        "Não existe o melhor investimento; existe o mais adequado para um objetivo, um prazo e uma tolerância a perdas. A decisão compara rendimento líquido, risco e liquidez com o que se quer.",
      estimatedMinutes: 18,
      specs: [
        c(
          "decisao",
          "Uma família quer trocar de geladeira daqui a 8 meses e tem R$ 2.000 guardados. A melhor escolha é:",
          "Um investimento de baixo risco e resgate livre, mesmo rendendo menos",
          ["Ações, porque podem render muito", "Um investimento com prazo de 3 anos e taxa alta"],
          "Prazo curto e objetivo definido pedem segurança e liquidez.",
          {
            feedback: [
              "Em 8 meses as ações podem estar em baixa justo na hora da compra.",
              "O dinheiro ficaria preso além da data da compra.",
            ],
          },
        ),
        n(
          "decisao",
          "Aplicação A: 8% ao ano com taxa de 1,5% ao ano. Aplicação B: 6% ao ano sem taxa. Qual é a diferença, em pontos percentuais, entre os rendimentos líquidos?",
          0.5,
          "A líquida: 6,5%; B: 6%; diferença 0,5 ponto.",
          { misreads: [{ value: 2, feedback: "2 compara 8% com 6% sem tirar a taxa de A." }] },
        ),
        c(
          "decisao",
          "Um investimento rende 12% ao ano e paga 20% de imposto sobre o rendimento. Outro rende 7% e é isento de imposto. O rendimento líquido de imposto do primeiro é:",
          "9,6% ao ano, ainda maior que os 7% do segundo",
          ["12%, porque imposto não muda o rendimento", "2,4%"],
          "20% de 12% = 2,4 pontos de imposto; sobra 9,6%.",
          {
            feedback: [
              "O imposto reduz o que fica com o investidor.",
              "2,4% é o imposto, não o que sobra.",
            ],
          },
        ),
        n(
          "decisao",
          "Uma pessoa investe R$ 10.000 a 9% ao ano. O imposto é 15% sobre o rendimento. Quanto ela recebe de rendimento líquido no ano, em reais?",
          765,
          "Rendimento 900; imposto 135; líquido 765.",
          {
            misreads: [{ value: 900, feedback: "900 é o bruto; falta descontar 15% de imposto." }],
          },
        ),
        c(
          "decisao",
          "Uma pessoa jovem guarda para a aposentadoria, daqui a 40 anos. Sobre risco, faz sentido que ela:",
          "Aceite mais oscilação em parte da carteira, porque tem tempo para atravessar quedas",
          [
            "Evite qualquer risco, porque é muito dinheiro",
            "Coloque tudo no investimento de maior retorno passado",
          ],
          "Prazo longo dilui oscilações; concentrar tudo no que subiu antes ignora o risco.",
          {
            feedback: [
              "Zero risco por 40 anos costuma render pouco acima da inflação.",
              "Retorno passado não garante o futuro; concentração aumenta o risco.",
            ],
          },
        ),
        n(
          "decisao",
          "Uma família guarda R$ 300 por mês. Ela decide colocar 80% em baixo risco e 20% em maior risco. Quantos reais por mês vão para a parte de maior risco?",
          60,
          "20% de 300 = 60.",
          { misreads: [{ value: 240, feedback: "240 é a parte de baixo risco." }] },
        ),
        c(
          "decisao",
          "Um amigo diz que 'investiu em algo que rendeu 50% no mês passado' e sugere colocar todas as economias lá. A resposta mais prudente é:",
          "Recusar: um mês bom não garante o próximo",
          ["Aceitar, porque 50% em um mês é muito", "Aceitar, mas só com metade das economias"],
          "Retorno passado extremo indica risco extremo: quem rende 50% em um mês pode perder 50%, e as economias não devem ficar num lugar só.",
          {
            feedback: [
              "Ganho alto no passado não é garantia; é sinal de oscilação.",
              "Metade das economias em algo tão volátil ainda é muito.",
            ],
          },
        ),
        c(
          "decisao",
          "Por que uma reserva de emergência deve existir antes de investir em coisas de mais risco?",
          "Porque evita vender o investimento na baixa ou se endividar",
          [
            "Porque investimentos de risco exigem reserva por lei",
            "Porque a reserva rende mais que os investimentos de risco",
          ],
          "Sem reserva, uma emergência obriga a vender o investimento arriscado num momento ruim ou a pegar empréstimo caro. A reserva evita transformar um imprevisto em prejuízo ou dívida.",
          {
            feedback: [
              "Não é exigência legal; é prudência.",
              "A reserva costuma render menos; a função dela é estar disponível na hora do imprevisto.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize os passos para escolher onde colocar um dinheiro guardado com objetivo.",
    labels: [
      "Definir o objetivo e em quanto tempo o dinheiro será usado",
      "Separar antes uma reserva para emergências",
      "Comparar rendimento líquido, risco e liquidez das opções",
      "Escolher a opção adequada ao prazo e dividir se fizer sentido",
    ],
    explanation:
      "Objetivo e prazo vêm primeiro porque definem o risco aceitável; a reserva protege a decisão; só então se comparam as opções.",
  },
  justification: {
    prompts: [
      "Explique por que ganhar 30% e depois perder 30% não deixa o investimento no mesmo lugar.",
      "Um anúncio promete 5% ao mês garantido. Mostre com uma conta por que isso é suspeito.",
      "Explique por que dividir R$ 1.000 em quatro investimentos diferentes reduz o risco, com um exemplo em que um deles perde 40%.",
    ],
    samples: [
      "Com R$ 100, ganhar 30% leva a R$ 130. Perder 30% de R$ 130 tira R$ 39, não R$ 30, e sobram R$ 91. A perda incide sobre um valor maior que o inicial; por isso as porcentagens não se cancelam.",
      "5% ao mês, com reinvestimento, dá 1,05 elevado a 12, cerca de 1,80: quase 80% ao ano. Aplicações de baixo risco rendem algo perto da taxa básica de juros, muito longe de 80% ao ano. Algo que promete tanto sem risco não fecha a conta; é sinal de golpe.",
      "Se tudo estivesse em um só investimento e ele perdesse 40%, a perda seria R$ 400. Dividindo em quatro partes de R$ 250 e só uma perdendo 40%, a perda é R$ 100, ou 10% do total. As outras três partes podem até ter rendido e compensado.",
    ],
    focus: "a relação entre retorno, risco e prazo",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const capital = 500 * (2 + (seed % 9));
      const taxa = 4 + (seed % 7);
      const anual = (capital * taxa) / 100;
      const ano2 = ((capital + anual) * taxa) / 100;
      const texto = (v: number) =>
        Number.isInteger(v)
          ? real(v)
          : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return c(
        "rendimento-do-segundo-ano",
        `R$ ${real(capital)} são aplicados a ${taxa}% ao ano com reinvestimento. Quanto a aplicação rende no segundo ano?`,
        `R$ ${texto(ano2)}`,
        [`R$ ${texto(anual)}`, `R$ ${texto(2 * anual)}`],
        `No fim do 1º ano há R$ ${texto(capital + anual)}; ${taxa}% disso é R$ ${texto(ano2)}.`,
        {
          feedback: [
            "Esse é o rendimento do primeiro ano; no segundo a base é maior.",
            "Esse é o rendimento simples de dois anos somados, não o do segundo ano.",
          ],
        },
      );
    }
    if (variant === 1) {
      const total = 1000 * (1 + (seed % 6));
      const parteA = 10 * (3 + (seed % 5));
      const parteB = 100 - parteA;
      const taxaA = 6 + (seed % 5);
      const taxaB = seed % 2 === 0 ? -(2 + (seed % 4)) : 2 + (seed % 3);
      const rendimento = (total * (parteA * taxaA + parteB * taxaB)) / 10000;
      const soTaxaA = (total * taxaA) / 100;
      const somaSimples = (total * (taxaA + taxaB)) / 100;
      const texto = (v: number) =>
        (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",")).replace("-", "−");
      const resultado = (v: number) =>
        v < 0 ? `Perda de R$ ${real(-v)}` : `Ganho de R$ ${real(v)}`;
      return c(
        "rendimento-da-carteira",
        `Uma carteira de R$ ${real(total)} tem ${parteA}% em A, cuja variação no ano foi de ${texto(taxaA)}%, e ${parteB}% em B, cuja variação foi de ${texto(taxaB)}%. Qual foi o resultado da carteira no ano?`,
        resultado(rendimento),
        [resultado(soTaxaA), resultado(somaSimples)],
        `${parteA}% de ${real(total)} a ${texto(taxaA)}% mais ${parteB}% de ${real(total)} a ${texto(taxaB)}%: ${texto(rendimento)}.`,
        {
          feedback: [
            "Aplicou a taxa de A a toda a carteira.",
            "Somou as taxas como se cada uma incidisse sobre o total.",
          ],
        },
      );
    }
    const capital = 1000 * (2 + (seed % 7));
    const ganho = 10 * (1 + (seed % 4));
    const perda = 10 * (1 + (seed % 3));
    const final = (capital * (100 + ganho) * (100 - perda)) / 10000;
    const ingenuo = (capital * (100 + ganho - perda)) / 100;
    return c(
      "ganho-e-perda-em-sequencia",
      `Um investimento de R$ ${real(capital)} rendeu ${ganho}% em um ano e perdeu ${perda}% no ano seguinte. Quanto vale ao final?`,
      `R$ ${real(final)}`,
      [`R$ ${real(ingenuo)}`, `R$ ${real((capital * (100 + ganho)) / 100)}`],
      `${real(capital)} × ${(1 + ganho / 100).toString().replace(".", ",")} × ${(1 - perda / 100).toString().replace(".", ",")} = ${real(final)}.`,
      {
        feedback: [
          "Somou e subtraiu as taxas sobre o valor inicial; a perda incide sobre o valor já aumentado.",
          "Esse é o valor depois do primeiro ano; falta a perda do segundo.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "investimentos",
    title: "Três caixinhas para um objetivo",
    prompt:
      "Escolha um objetivo da família com prazo (uma viagem, um curso, um conserto). Monte uma divisão do dinheiro guardado em até três tipos de investimento, com prazo e risco compatíveis, e explique a escolha.",
    lab: "bars",
    steps: [
      "Anote o objetivo, o valor necessário e a data prevista.",
      "Pesquise dois ou três tipos de investimento acessíveis, com rendimento, prazo de resgate e risco.",
      "Distribua o dinheiro entre eles e justifique cada parte pelo prazo e pelo risco aceitável.",
    ],
    rubric: [
      "Objetivo com valor e prazo definidos (0–2)",
      "Investimentos descritos com rendimento, liquidez e risco (0–3)",
      "Distribuição coerente com o prazo e a tolerância a perdas (0–2)",
      "Justificativa clara para cada parte (0–1)",
    ],
  },
  homeSupport: [
    "Conversem sobre a reserva de emergência da casa: para que serve, quanto seria razoável e por que ela precisa estar disponível rápido.",
    "Quando aparecer uma propaganda de investimento com retorno alto, façam juntos a conta de quanto seria em um ano e discutam se faz sentido.",
  ],
};
