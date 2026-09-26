import { c, n, decimal as real, type SkillPack } from "../skill-factory";

/**
 * Juros: o preço do tempo. Juros simples e compostos, parcelamento, custo
 * real de uma compra a prazo e comparação entre pagar à vista, parcelar e
 * guardar antes. Trilha OLITEF N2.
 */
export const juros: SkillPack = {
  id: "juros",
  name: "Juros e parcelamento",
  domain: "olitef",
  lab: "bars",
  missions: [
    {
      title: "O preço do tempo",
      objective: "Calcular juros simples e entender taxa, período e montante.",
      introduction:
        "Juros são o valor pago por usar dinheiro de outra pessoa por um tempo. Nos juros simples, a cada período paga-se a mesma porcentagem do valor inicial.",
      specs: [
        n(
          "juros-simples",
          "Uma pessoa empresta R$ 500 a juros simples de 2% ao mês. Quanto de juros ela recebe depois de 3 meses, em reais?",
          30,
          "2% de 500 = 10 por mês; em 3 meses, 30.",
          { misreads: [{ value: 10, feedback: "10 são os juros de um mês só." }] },
        ),
        c(
          "montante",
          "Um empréstimo de R$ 1.200 a juros simples de 5% ao mês, pago em 4 meses, custa ao todo:",
          "R$ 1.440",
          ["R$ 1.260", "R$ 1.200"],
          "Juros: 5% de 1.200 = 60 por mês; 4 meses: 240; total 1.440.",
          {
            feedback: [
              "R$ 1.260 paga só um mês de juros.",
              "R$ 1.200 é o valor emprestado, sem os juros.",
            ],
          },
        ),
        n(
          "juros-simples",
          "Um investimento de R$ 2.000 rende juros simples de 1% ao mês. Em quantos meses os juros somam R$ 240?",
          12,
          "1% de 2.000 = 20 por mês; 240 ÷ 20 = 12 meses.",
          { misreads: [{ value: 24, feedback: "Usou 10 reais por mês; 1% de 2.000 é 20." }] },
        ),
        c(
          "taxa",
          "Quem pagou R$ 90 de juros por usar R$ 1.500 durante 3 meses, a juros simples, pagou uma taxa mensal de:",
          "2%",
          ["6%", "3%"],
          "Por mês: 90 ÷ 3 = 30; 30 ÷ 1.500 = 2%.",
          {
            feedback: ["6% é a taxa do período inteiro de 3 meses.", "3% seria 45 reais por mês."],
          },
        ),
        n(
          "montante",
          "Uma dívida de R$ 800 cresce a juros simples de 4% ao mês. Qual é o valor da dívida depois de 6 meses, em reais?",
          992,
          "4% de 800 = 32 por mês; 6 meses: 192; 800 + 192 = 992.",
          { misreads: [{ value: 192, feedback: "192 são só os juros; a dívida inclui os 800." }] },
        ),
        c(
          "juros-simples",
          "Em juros simples, se o tempo dobra e a taxa e o capital ficam iguais, os juros:",
          "Dobram",
          ["Ficam iguais", "Quadruplicam"],
          "Juros simples são proporcionais ao tempo.",
          {
            feedback: [
              "Mais tempo, mais juros.",
              "Quadruplicar exigiria que juros crescessem com o quadrado do tempo, o que não acontece nos juros simples.",
            ],
          },
        ),
        n(
          "taxa",
          "Uma loja cobra R$ 24 de juros para atrasar um pagamento de R$ 600 em um mês. Qual é a taxa de juros ao mês, em porcentagem?",
          4,
          "24 ÷ 600 = 0,04 = 4%.",
          {
            misreads: [
              { value: 24, feedback: "24 é o valor em reais; a taxa compara com os 600." },
            ],
          },
        ),
        c(
          "montante",
          "Um capital de R$ 3.000 a juros simples de 1,5% ao mês, por 10 meses, vira um montante de:",
          "R$ 3.450",
          ["R$ 3.045", "R$ 4.500"],
          "1,5% de 3.000 = 45 por mês; 10 meses: 450; montante 3.450.",
          {
            feedback: [
              "R$ 3.045 conta só um mês.",
              "R$ 4.500 multiplica 3.000 por 1,5, como se a taxa fosse 50%, e não 1,5% ao mês.",
            ],
          },
        ),
      ],
    },
    {
      title: "Juros sobre juros",
      objective: "Calcular juros compostos por poucos períodos e comparar com juros simples.",
      introduction:
        "Nos juros compostos, os juros de cada período entram no valor que rende no período seguinte. Multiplique pelo fator (1 + taxa) a cada período.",
      specs: [
        n(
          "juros-compostos",
          "R$ 1.000 aplicados a 10% ao ano, com juros compostos, valem quanto depois de 2 anos, em reais?",
          1210,
          "1.000 × 1,1 = 1.100; 1.100 × 1,1 = 1.210.",
          {
            misreads: [
              {
                value: 1200,
                feedback:
                  "1.200 é o resultado com juros simples; nos compostos o segundo ano rende sobre 1.100.",
              },
            ],
          },
        ),
        c(
          "simples-versus-compostos",
          "Dois investimentos de R$ 1.000 rendem 10% ao ano, um a juros simples e outro a juros compostos. Depois de 3 anos, a diferença entre eles é:",
          "R$ 31",
          ["R$ 0", "R$ 100"],
          "Simples: 1.300. Compostos: 1.000 × 1,1³ = 1.331. Diferença 31.",
          {
            feedback: [
              "A diferença é zero só no primeiro ano.",
              "R$ 100 é o rendimento de um ano, não a diferença.",
            ],
          },
        ),
        n(
          "juros-compostos",
          "Uma dívida de R$ 500 no cartão cresce 10% ao mês, com juros compostos. Quanto ela vale depois de 3 meses, em reais?",
          665.5,
          "500 × 1,1 × 1,1 × 1,1 = 665,50.",
          {
            misreads: [
              {
                value: 650,
                feedback:
                  "650 é com juros simples; no cartão os juros incidem sobre a dívida já crescida.",
              },
            ],
          },
        ),
        c(
          "juros-compostos",
          "A juros compostos de 100% ao ano, um valor:",
          "Dobra a cada ano",
          ["Aumenta o mesmo valor todo ano", "Dobra uma única vez"],
          "Multiplicar por 2 a cada período: 1, 2, 4, 8.",
          {
            feedback: [
              "Aumentar o mesmo valor todo ano é o comportamento dos juros simples.",
              "Nos compostos o fator se aplica todo período.",
            ],
          },
        ),
        n(
          "juros-compostos",
          "R$ 2.000 aplicados a 5% ao ano, com juros compostos, valem quanto depois de 2 anos, em reais?",
          2205,
          "2.000 × 1,05 = 2.100; 2.100 × 1,05 = 2.205.",
          {
            misreads: [
              {
                value: 2200,
                feedback: "2.200 é com juros simples; o segundo ano rende sobre 2.100.",
              },
            ],
          },
        ),
        c(
          "simples-versus-compostos",
          "Para o mesmo capital, taxa e prazo maior que um período, os juros compostos em relação aos simples são:",
          "Maiores, porque os juros passam a render juros",
          ["Menores, porque são divididos em mais partes", "Iguais, porque a taxa é a mesma"],
          "A partir do segundo período, a base dos compostos é maior.",
          {
            feedback: [
              "Não há divisão: os juros se acumulam.",
              "A taxa é a mesma, mas a base cresce nos compostos.",
            ],
          },
        ),
        n(
          "juros-compostos",
          "Em quantos anos R$ 1.000 a 20% ao ano, com juros compostos, ultrapassam R$ 1.700 pela primeira vez?",
          3,
          "1.200, 1.440, 1.728: no terceiro ano passa de 1.700.",
          { misreads: [{ value: 4, feedback: "No terceiro ano o valor já é 1.728." }] },
        ),
        c(
          "juros-compostos",
          "Uma poupança rende 0,5% ao mês, com juros compostos. R$ 10.000 rendem, no segundo mês, em reais:",
          "R$ 50,25",
          ["R$ 50", "R$ 100"],
          "Primeiro mês: 50, saldo 10.050; segundo mês: 0,5% de 10.050 = 50,25.",
          {
            feedback: [
              "R$ 50 é o rendimento do primeiro mês; no segundo a base já é 10.050.",
              "R$ 100 seria a soma aproximada dos dois meses.",
            ],
          },
        ),
      ],
    },
    {
      title: "Parcelar tem preço",
      objective:
        "Calcular o custo total de uma compra parcelada e a diferença para o preço à vista.",
      introduction:
        "Parcelar 'sem juros' costuma esconder um preço à vista menor. Some as parcelas, compare com o valor à vista e descubra quanto custa o tempo.",
      specs: [
        n(
          "custo-do-parcelamento",
          "Uma TV custa R$ 1.800 à vista ou 12 parcelas de R$ 175. Quanto a mais paga quem parcela, em reais?",
          300,
          "12 × 175 = 2.100; 2.100 − 1.800 = 300.",
          {
            misreads: [
              {
                value: 25,
                feedback:
                  "25 é a diferença de uma parcela para 1.800 ÷ 12 = 150; ao todo são 12 parcelas.",
              },
            ],
          },
        ),
        c(
          "custo-do-parcelamento",
          "Um celular custa R$ 2.000 à vista ou 10 parcelas de R$ 230. O acréscimo do parcelamento sobre o preço à vista é de:",
          "15%",
          ["30%", "23%"],
          "10 × 230 = 2.300; 300 ÷ 2.000 = 15%.",
          {
            feedback: [
              "30% confunde a diferença por parcela (30 reais) com a taxa.",
              "23% usa 230 como se fosse a porcentagem.",
            ],
          },
        ),
        n(
          "custo-do-parcelamento",
          "Uma bicicleta custa R$ 960. A loja dá 10% de desconto para pagamento à vista ou aceita 4 parcelas de R$ 240. Qual é a diferença, em reais, entre pagar parcelado e pagar à vista com desconto?",
          96,
          "À vista: 960 × 0,9 = 864; parcelado: 960; diferença 96.",
          {
            misreads: [
              {
                value: 0,
                feedback: "As parcelas somam 960, mas o preço à vista tem 10% de desconto.",
              },
            ],
          },
        ),
        c(
          "entrada-e-parcelas",
          "Uma geladeira custa R$ 2.400. A loja pede R$ 600 de entrada e 6 parcelas de R$ 350. O total pago é:",
          "R$ 2.700",
          ["R$ 2.100", "R$ 2.400"],
          "600 + 6 × 350 = 2.700.",
          {
            feedback: [
              "R$ 2.100 esquece a entrada.",
              "R$ 2.400 é o preço à vista, não o total parcelado.",
            ],
          },
        ),
        n(
          "custo-do-parcelamento",
          "Um curso custa R$ 1.500 à vista ou 5 parcelas de R$ 330. Se a família tem o dinheiro guardado rendendo 1% ao mês, quanto ela ganharia de juros simples em 5 meses deixando os R$ 1.500 aplicados, em reais?",
          75,
          "1% de 1.500 = 15 por mês; 5 meses: 75. Bem menos que os 150 de acréscimo do parcelamento.",
          {
            misreads: [
              {
                value: 150,
                feedback: "150 é o acréscimo do parcelamento, não o rendimento da aplicação.",
              },
            ],
          },
        ),
        c(
          "comparar-formas-de-pagamento",
          "Um produto custa R$ 400 à vista, ou 2 parcelas de R$ 210, ou 4 parcelas de R$ 110. Do mais barato para o mais caro, a ordem é:",
          "À vista, 2 parcelas, 4 parcelas",
          ["2 parcelas, à vista, 4 parcelas", "4 parcelas, 2 parcelas, à vista"],
          "400; 420; 440.",
          {
            feedback: [
              "2 parcelas somam 420, mais que 400.",
              "Mais parcelas custam mais no total.",
            ],
          },
        ),
        n(
          "entrada-e-parcelas",
          "Um notebook custa R$ 3.200 à vista. A loja oferece entrada de R$ 800 e 8 parcelas iguais que totalizam R$ 2.800. Qual é o valor de cada parcela, em reais?",
          350,
          "2.800 ÷ 8 = 350.",
          {
            misreads: [
              {
                value: 300,
                feedback:
                  "300 dividiria o restante do preço à vista (2.400), mas as parcelas somam 2.800.",
              },
            ],
          },
        ),
        c(
          "custo-do-parcelamento",
          "Qual afirmação sobre 'parcelamento sem juros' é a mais precisa?",
          "O custo pode estar embutido no preço; compare a soma das parcelas com o preço à vista de outra loja ou com desconto",
          [
            "Parcelar sem juros é sempre igual a pagar à vista",
            "Parcelar sem juros é sempre mais vantajoso",
          ],
          "Sem desconto à vista o total é o mesmo, mas muitas vezes o preço à vista é menor em outro lugar ou com desconto.",
          {
            feedback: [
              "Quando existe desconto à vista, parcelar custa mais.",
              "Depende de haver desconto à vista e do rendimento do dinheiro guardado.",
            ],
          },
        ),
      ],
    },
    {
      title: "Dívida que cresce, poupança que espera",
      objective: "Comparar o custo de uma dívida com o ganho de poupar antes de comprar.",
      introduction:
        "A mesma taxa de juros pesa contra quem deve e a favor de quem guarda. Colocar as duas situações lado a lado mostra o tamanho da diferença.",
      specs: [
        n(
          "divida-versus-poupanca",
          "Uma pessoa quer um item de R$ 1.200. Se guardar R$ 200 por mês, em quantos meses compra à vista?",
          6,
          "1.200 ÷ 200 = 6 meses.",
          { misreads: [{ value: 12, feedback: "12 seria guardando 100 por mês." }] },
        ),
        c(
          "divida-versus-poupanca",
          "Em vez de guardar por 6 meses, a pessoa compra o item de R$ 1.200 em 6 parcelas de R$ 230. O custo de não esperar foi:",
          "R$ 180",
          ["R$ 30", "R$ 1.380"],
          "6 × 230 = 1.380; 1.380 − 1.200 = 180.",
          {
            feedback: [
              "R$ 30 é a diferença de uma parcela, não das seis.",
              "R$ 1.380 é o total pago, não o custo extra.",
            ],
          },
        ),
        n(
          "divida-versus-poupanca",
          "Uma dívida de R$ 1.000 cresce 8% ao mês, com juros compostos, e ninguém a paga. Quanto ela vale depois de 2 meses, em reais?",
          1166.4,
          "1.000 × 1,08 × 1,08 = 1.166,40.",
          {
            misreads: [
              {
                value: 1160,
                feedback: "1.160 é com juros simples; a dívida do segundo mês cresce sobre 1.080.",
              },
            ],
          },
        ),
        c(
          "rotativo-do-cartao",
          "Uma fatura de cartão de R$ 900 foi paga só no mínimo, sobrando R$ 700 a 12% ao mês. No mês seguinte, essa sobra vira:",
          "R$ 784",
          ["R$ 712", "R$ 1.008"],
          "700 × 1,12 = 784.",
          {
            feedback: [
              "R$ 712 soma 12 reais em vez de 12%.",
              "R$ 1.008 aplica 12% sobre os 900, mas só os 700 ficaram devendo.",
            ],
          },
        ),
        n(
          "divida-versus-poupanca",
          "Quem guarda R$ 150 por mês, sem juros, tem quanto guardado depois de 8 meses, em reais?",
          1200,
          "8 × 150 = 1.200.",
          { misreads: [{ value: 1050, feedback: "Contou 7 meses." }] },
        ),
        c(
          "rotativo-do-cartao",
          "A taxa de 12% ao mês do cartão, com juros compostos, ao longo de um ano fica mais perto de:",
          "290% ao ano",
          ["144% ao ano", "12% ao ano"],
          "1,12¹² é cerca de 3,9: a dívida quase quadruplica, um acréscimo de cerca de 290%.",
          {
            feedback: [
              "144% seria 12 × 12, o cálculo de juros simples.",
              "12% é a taxa de um mês só.",
            ],
          },
        ),
        n(
          "divida-versus-poupanca",
          "Um empréstimo de R$ 2.000 será pago em 4 parcelas de R$ 560. Qual é o total de juros pagos, em reais?",
          240,
          "4 × 560 = 2.240; 2.240 − 2.000 = 240.",
          {
            misreads: [
              {
                value: 60,
                feedback: "60 é a diferença de uma parcela para 500; são quatro parcelas.",
              },
            ],
          },
        ),
        c(
          "divida-versus-poupanca",
          "Para uma compra de R$ 600, a família pode: (1) parcelar em 3 vezes de R$ 220; (2) esperar 3 meses guardando R$ 200 por mês. A opção 2 economiza:",
          "R$ 60, além de evitar a dívida",
          ["R$ 20", "Nada, porque leva mais tempo"],
          "3 × 220 = 660; esperar custa 600; diferença 60.",
          {
            feedback: [
              "R$ 20 é a diferença de uma parcela só.",
              "O tempo de espera não tem custo em reais; a dívida tem.",
            ],
          },
        ),
      ],
    },
    {
      title: "Juros para decidir",
      objective: "Comparar alternativas de crédito e de poupança e justificar a escolha.",
      introduction:
        "Decidir bem é comparar totais, não parcelas: quanto sai do bolso ao final, em quanto tempo e com que risco. Escreva as três respostas antes de escolher.",
      estimatedMinutes: 18,
      specs: [
        c(
          "comparar-formas-de-pagamento",
          "Um produto custa R$ 500. Loja A: 10% de desconto à vista. Loja B: 5 parcelas de R$ 100 'sem juros'. Loja C: R$ 480 em 2 parcelas. A opção mais barata é:",
          "Loja A: R$ 450",
          ["Loja B: parcelas sem juros", "Loja C: R$ 480"],
          "A: 450; B: 500; C: 480.",
          {
            feedback: ["Sem juros ainda são R$ 500, mais que R$ 450.", "R$ 480 é mais que R$ 450."],
          },
        ),
        n(
          "comparar-formas-de-pagamento",
          "Um empréstimo de R$ 3.000 pode ser pago em 6 parcelas de R$ 560 ou em 12 de R$ 300. Qual é a diferença, em reais, entre os totais das duas opções?",
          240,
          "6 × 560 = 3.360; 12 × 300 = 3.600; diferença 240.",
          {
            misreads: [
              { value: 260, feedback: "260 é a diferença entre as parcelas, não entre os totais." },
            ],
          },
        ),
        c(
          "juros-embutidos",
          "Uma loja anuncia um produto de R$ 1.000 em '10 parcelas de R$ 100 sem juros' e dá 8% de desconto à vista. Os juros do parcelamento em relação ao preço à vista com desconto são:",
          "Cerca de 8,7% no total",
          ["0%, porque é sem juros", "8% no total"],
          "À vista sai por 920; parcelado, 1.000: 80 ÷ 920 é cerca de 8,7%.",
          {
            feedback: [
              "'Sem juros' compara com o preço cheio, não com o preço à vista com desconto.",
              "8% é o desconto sobre 1.000; a taxa do parcelamento tem base 920.",
            ],
          },
        ),
        n(
          "juros-compostos",
          "Uma aplicação rende 2% ao mês com juros compostos. Quantos reais R$ 5.000 rendem no total em 2 meses?",
          202,
          "5.000 × 1,02 × 1,02 = 5.202; rendimento 202.",
          {
            misreads: [
              { value: 200, feedback: "200 é com juros simples; o segundo mês rende sobre 5.100." },
            ],
          },
        ),
        c(
          "juros-embutidos",
          "Um financiamento de R$ 20.000 será pago em 24 parcelas de R$ 1.000. Sobre esse financiamento é correto dizer que:",
          "Os juros somam R$ 4.000, 20% do valor financiado",
          ["Não há juros, porque as parcelas são iguais", "Os juros somam R$ 1.000"],
          "24 × 1.000 = 24.000; 24.000 − 20.000 = 4.000, que é 20% de 20.000.",
          {
            feedback: [
              "Parcelas iguais não significam ausência de juros; o total supera o financiado.",
              "R$ 1.000 é uma parcela, não o total de juros.",
            ],
          },
        ),
        n(
          "divida-versus-poupanca",
          "Uma família deve R$ 1.500 no cartão a 10% ao mês e tem R$ 1.500 guardados rendendo 0,5% ao mês. Se quitar a dívida hoje em vez de manter os dois, quanto deixa de perder no próximo mês, em reais?",
          142.5,
          "Juros da dívida: 150; rendimento da poupança: 7,50; diferença 142,50.",
          {
            misreads: [
              {
                value: 150,
                feedback:
                  "150 são os juros da dívida, mas ela perderia os 7,50 de rendimento ao quitar.",
              },
            ],
          },
        ),
        c(
          "comparar-formas-de-pagamento",
          "Ao escolher entre duas ofertas de crédito, o critério que mais importa é:",
          "O total pago ao final, incluindo taxas e seguros, e se as parcelas cabem no orçamento",
          ["O valor da menor parcela", "O número de parcelas"],
          "Parcelas menores em mais meses costumam somar um total maior.",
          {
            feedback: [
              "A menor parcela pode esconder um total muito maior.",
              "O número de parcelas sozinho não diz o custo.",
            ],
          },
        ),
        c(
          "juros-compostos",
          "Dois amigos guardam R$ 1.000: um a 6% ao ano por 2 anos, com juros compostos; outro a 12% ao ano por 1 ano. Ao final de seus prazos:",
          "O primeiro tem R$ 1.123,60 e o segundo R$ 1.120",
          ["Os dois têm R$ 1.120", "O segundo tem mais, porque a taxa é o dobro"],
          "1.000 × 1,06² = 1.123,60; 1.000 × 1,12 = 1.120.",
          {
            feedback: [
              "O primeiro passa de 1.120 porque o segundo ano rende sobre 1.060.",
              "O prazo maior com juros compostos compensa a taxa menor neste caso.",
            ],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize um método para comparar pagar à vista e pagar parcelado.",
    labels: [
      "Descobrir o preço à vista com todos os descontos",
      "Somar todas as parcelas e a entrada, se houver",
      "Calcular a diferença e a porcentagem que ela representa sobre o preço à vista",
      "Considerar se o dinheiro guardado renderia mais ou menos que essa diferença",
    ],
    explanation:
      "Primeiro o preço à vista real, depois o total parcelado; a diferença em reais e em porcentagem é o custo do tempo, que se compara com o rendimento do dinheiro guardado.",
  },
  justification: {
    prompts: [
      "Explique por que R$ 1.000 a 10% ao ano com juros compostos valem mais depois de 2 anos do que com juros simples, mostrando as contas.",
      "Um colega diz que '12 parcelas de R$ 100 sem juros' custa o mesmo que pagar R$ 1.200 à vista, então tanto faz. Explique em que situação isso é verdade e em que situação não é.",
      "Mostre como calcular a taxa de juros mensal embutida em uma compra de R$ 400 à vista que é paga em uma única parcela de R$ 420 daqui a um mês, e explique o que a taxa significa.",
    ],
    samples: [
      "Com juros simples, cada ano rende 10% de 1.000, ou seja, 100: depois de 2 anos há 1.200. Com juros compostos, o primeiro ano leva a 1.100 e o segundo rende 10% de 1.100, que são 110, chegando a 1.210. A diferença de 10 reais é exatamente o rendimento dos 100 de juros do primeiro ano.",
      "É verdade quando não existe preço menor à vista e o dinheiro não renderia nada guardado. Se a loja dá desconto à vista, ou se outra loja vende mais barato à vista, ou se os R$ 1.200 renderiam juros ao longo dos 12 meses, então parcelar custa mais: o custo está embutido no preço, mesmo com a etiqueta 'sem juros'.",
      "A diferença é 420 − 400 = 20 reais por um mês de espera. A taxa é 20 ÷ 400 = 0,05, ou seja, 5% ao mês. Isso significa que a loja cobra 5% do valor por cada mês de adiamento; se fosse para dois meses com juros compostos, seriam 400 × 1,05² = 441.",
    ],
    focus: "a comparação entre totais pagos, e não entre parcelas",
  },
  reserved: (seed, variant) => {
    if (variant === 0) {
      const capital = 100 * (5 + (seed % 11));
      const taxa = 1 + (seed % 4);
      const meses = 3 + (seed % 5);
      const juros = (capital * taxa * meses) / 100;
      return c(
        "juros-simples-reservado",
        `Uma pessoa emprestou R$ ${real(capital)} a juros simples de ${taxa}% ao mês por ${meses} meses. Quanto recebeu de juros?`,
        `R$ ${real(juros)}`,
        [`R$ ${real((capital * taxa) / 100)}`, `R$ ${real(capital + juros)}`],
        `${taxa}% de ${real(capital)} = ${real((capital * taxa) / 100)} por mês; em ${meses} meses, ${real(juros)}.`,
        {
          feedback: [
            "Esses são os juros de um único mês.",
            "Esse é o montante, capital mais juros; a pergunta pede só os juros.",
          ],
        },
      );
    }
    if (variant === 1) {
      const parcelas = 3 + (seed % 5);
      const base = 50 * (2 + (seed % 9));
      const vista = base * parcelas;
      const acrescimo = 10 * (1 + (seed % 6));
      const parcela = base + acrescimo;
      const total = parcela * parcelas;
      return c(
        "custo-total-parcelado",
        `Um produto custa R$ ${real(vista)} à vista ou ${parcelas} parcelas de R$ ${real(parcela)}. Quanto a mais paga quem parcela?`,
        `R$ ${real(total - vista)}`,
        [`R$ ${real(acrescimo)}`, `R$ ${real(total)}`],
        `${parcelas} × ${real(parcela)} = ${real(total)}; ${real(total)} − ${real(vista)} = ${real(total - vista)}.`,
        {
          feedback: [
            "Essa é a diferença de uma parcela só para a fração do preço à vista.",
            "Esse é o total pago, não o acréscimo.",
          ],
        },
      );
    }
    const capital = 1000 * (1 + (seed % 5));
    const taxa = 10 * (1 + (seed % 2));
    const fator = 1 + taxa / 100;
    // Aritmética inteira: capital é múltiplo de 1.000, então o resultado é exato.
    const compostos = ((capital / 100) * (100 + taxa) ** 2) / 100;
    const simples = capital + (capital * taxa * 2) / 100;
    const umAno = capital + (capital * taxa) / 100;
    return c(
      "compostos-em-dois-periodos",
      `R$ ${real(capital)} aplicados a ${taxa}% ao ano, com juros compostos, valem quanto depois de 2 anos?`,
      `R$ ${real(compostos)}`,
      [`R$ ${real(simples)}`, `R$ ${real(umAno)}`],
      `${real(capital)} × ${fator.toString().replace(".", ",")} × ${fator.toString().replace(".", ",")} = ${real(compostos)}.`,
      {
        feedback: [
          "Esse é o valor com juros simples; nos compostos o segundo ano rende sobre o saldo do primeiro.",
          "Esse é o valor depois de um ano só.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "juros",
    title: "A compra que a família quer fazer",
    prompt:
      "Escolha uma compra que a família pretende fazer e monte três caminhos: pagar à vista hoje, parcelar, ou guardar por alguns meses e pagar à vista depois. Compare os totais e recomende um caminho.",
    lab: "bars",
    steps: [
      "Registre o preço à vista, as condições de parcelamento reais e quanto a família consegue guardar por mês.",
      "Calcule o total de cada caminho e o tempo até ter o produto em casa.",
      "Recomende um caminho e explique o que pesou: total, tempo e risco de a parcela não caber.",
    ],
    rubric: [
      "Três caminhos com dados reais registrados (0–2)",
      "Totais e prazos calculados corretamente (0–3)",
      "Recomendação justificada com mais de um critério (0–2)",
      "Registro que outra pessoa da família entende (0–1)",
    ],
  },
  homeSupport: [
    "Ao ver uma oferta de parcelamento, somem juntos as parcelas em voz alta e comparem com o preço à vista antes de decidir.",
    "Conversem sobre algo que a família guardou dinheiro para comprar e quanto custaria se tivesse sido parcelado.",
  ],
};
