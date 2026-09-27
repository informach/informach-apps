import { c, n, type SkillPack } from "../skill-factory";

/**
 * Porcentagem para 8º/9º: base certa, mudanças sucessivas, cálculo de trás
 * para frente, comparação de percentuais com bases diferentes e leitura
 * crítica de afirmações com porcentagem. Trilha OLITEF N2.
 */
export const porcentagemN2: SkillPack = {
  id: "porcentagem-n2",
  name: "Porcentagem com base certa",
  domain: "olitef",
  lab: "bars",
  missions: [
    {
      title: "Sobre qual valor?",
      objective: "Identificar a base de uma porcentagem e calcular percentuais acima de 100%.",
      introduction:
        "Toda porcentagem é uma fração de alguma coisa. Antes de calcular, pergunte: por cento de quê? A base muda a resposta.",
      specs: [
        n(
          "base-da-porcentagem",
          "Uma escola tem 480 estudantes e 35% deles usam transporte escolar. Quantos usam transporte escolar?",
          168,
          "35% de 480 = 0,35 × 480 = 168.",
          { misreads: [{ value: 35, feedback: "35 é a taxa, não a quantidade; a base é 480." }] },
        ),
        c(
          "base-da-porcentagem",
          "Em uma turma de 40 alunos, 10 usam óculos. Em outra, de 25 alunos, 8 usam óculos. Em qual turma a porcentagem de alunos com óculos é maior?",
          "Na segunda: 32% contra 25%",
          ["Na primeira: 10 é mais que 8", "As porcentagens são iguais"],
          "10 ÷ 40 = 25% e 8 ÷ 25 = 32%.",
          {
            feedback: [
              "Comparar as quantidades ignora que as turmas têm tamanhos diferentes.",
              "25% e 32% são diferentes.",
            ],
          },
        ),
        n(
          "mais-de-cem-por-cento",
          "Uma cidade tinha 20.000 habitantes e hoje tem 150% desse valor. Quantos habitantes tem hoje?",
          30000,
          "150% de 20.000 = 1,5 × 20.000 = 30.000.",
          { misreads: [{ value: 10000, feedback: "10.000 é o aumento de 50%, não o total." }] },
        ),
        c(
          "pontos-percentuais",
          "A taxa de aprovação de uma escola passou de 80% para 90%. Isso corresponde a:",
          "Um aumento de 10 pontos percentuais, ou de 12,5%",
          [
            "Um aumento de 10 pontos percentuais, ou de 10%",
            "Um aumento de 10 pontos percentuais, ou de 11,1%",
          ],
          "A diferença entre 80% e 90% é de 10 pontos percentuais; em relação à taxa anterior, o aumento é 10 ÷ 80 = 12,5%.",
          {
            feedback: [
              "10% de 80% seriam 8 pontos; a taxa subiu 10 pontos, que são 12,5% de 80.",
              "11,1% divide os 10 pontos pela taxa nova, 90; a base do aumento é a taxa anterior, 80.",
            ],
          },
        ),
        n(
          "base-da-porcentagem",
          "Um produto custa R$ 250 e o imposto embutido é 18% do preço. Quanto do preço, em reais, é imposto?",
          45,
          "18% de 250 = 45.",
          {
            misreads: [{ value: 18, feedback: "18 é a taxa; o valor depende do preço de R$ 250." }],
          },
        ),
        c(
          "base-da-porcentagem",
          "Um salário de R$ 2.000 teve aumento de 5%. Um salário de R$ 5.000 teve aumento de 3%. Qual aumento foi maior em reais?",
          "O do salário de R$ 5.000: R$ 150 contra R$ 100",
          ["O do salário de R$ 2.000, porque 5% é maior que 3%", "Os dois foram iguais"],
          "5% de 2.000 = 100 e 3% de 5.000 = 150.",
          {
            feedback: ["A taxa maior incidiu sobre uma base menor.", "100 e 150 são diferentes."],
          },
        ),
        n(
          "mais-de-cem-por-cento",
          "O preço de um ingresso passou de R$ 40 para R$ 100. De quantos por cento foi o aumento?",
          150,
          "O aumento foi de 60 sobre 40: 60 ÷ 40 = 1,5 = 150%.",
          {
            misreads: [
              {
                value: 60,
                feedback: "60 é o aumento em reais; em porcentagem, compare com a base 40.",
              },
            ],
          },
        ),
        c(
          "porcentagem-de-porcentagem",
          "Em uma escola, 60% dos estudantes praticam esporte e, desses, 25% jogam vôlei. Que porcentagem dos estudantes da escola joga vôlei?",
          "15%",
          ["25%", "85%"],
          "25% de 60% = 0,25 × 0,6 = 0,15 = 15%.",
          {
            feedback: [
              "25% é a fração dos esportistas, não de toda a escola.",
              "85% soma as taxas, o que não faz sentido aqui.",
            ],
          },
        ),
      ],
    },
    {
      title: "Aumentos e descontos em sequência",
      objective: "Calcular o efeito de variações percentuais sucessivas.",
      introduction:
        "Duas mudanças de porcentagem não se somam: a segunda incide sobre o valor já alterado. Multiplique os fatores: um aumento de 20% é × 1,2 e um desconto de 20% é × 0,8.",
      specs: [
        n(
          "variacoes-sucessivas",
          "Um produto de R$ 200 teve aumento de 10% e depois desconto de 10%. Qual é o preço final, em reais?",
          198,
          "200 × 1,1 = 220; 220 × 0,9 = 198.",
          {
            misreads: [
              {
                value: 200,
                feedback: "Somou +10% e −10% como se se cancelassem; o desconto incidiu sobre 220.",
              },
            ],
          },
        ),
        c(
          "variacoes-sucessivas",
          "Dois descontos sucessivos de 20% equivalem a um único desconto de:",
          "36%",
          ["40%", "20%"],
          "0,8 × 0,8 = 0,64: paga-se 64%, ou seja, desconto de 36%.",
          {
            feedback: [
              "40% soma os descontos, mas o segundo incide sobre o preço já reduzido.",
              "20% seria um único desconto.",
            ],
          },
        ),
        n(
          "variacoes-sucessivas",
          "Uma quantia de R$ 1.000 aumentou 20% e depois mais 25%. Qual é o valor final, em reais?",
          1500,
          "1.000 × 1,2 = 1.200; 1.200 × 1,25 = 1.500.",
          {
            misreads: [
              { value: 1450, feedback: "Somou as taxas (45%); a segunda incide sobre 1.200." },
            ],
          },
        ),
        c(
          "variacoes-sucessivas",
          "Um aumento de 50% seguido de um desconto de 50% resulta em:",
          "Um valor 25% menor que o inicial",
          ["O valor inicial", "Um valor 25% maior que o inicial"],
          "1,5 × 0,5 = 0,75.",
          {
            feedback: [
              "As porcentagens têm bases diferentes: o desconto incide sobre o valor aumentado.",
              "0,75 é menor que 1.",
            ],
          },
        ),
        n(
          "variacoes-sucessivas",
          "Um aluguel de R$ 800 sofreu dois reajustes anuais de 5%. Quanto ficou, em reais?",
          882,
          "800 × 1,05 = 840; 840 × 1,05 = 882.",
          {
            misreads: [
              {
                value: 880,
                feedback: "Somou 10% de uma vez; o segundo reajuste incide sobre 840.",
              },
            ],
          },
        ),
        c(
          "fator-multiplicativo",
          "Multiplicar um valor por 0,85 corresponde a:",
          "Um desconto de 15%",
          ["Um aumento de 85%", "Um desconto de 85%"],
          "0,85 = 1 − 0,15.",
          {
            feedback: [
              "Aumento de 85% seria multiplicar por 1,85.",
              "Desconto de 85% seria multiplicar por 0,15.",
            ],
          },
        ),
        n(
          "variacoes-sucessivas",
          "Um valor caiu 30% e depois subiu 30%. O resultado é quantos por cento menor que o inicial?",
          9,
          "0,7 × 1,3 = 0,91: 9% menor.",
          {
            misreads: [
              {
                value: 0,
                feedback: "As variações não se cancelam: a subida incide sobre o valor reduzido.",
              },
            ],
          },
        ),
        c(
          "variacoes-sucessivas",
          "Uma loja anuncia 'desconto de 30% mais 10% para pagamento à vista'. O desconto total sobre o preço original é:",
          "37%",
          ["40%", "33%"],
          "0,7 × 0,9 = 0,63: desconto de 37%.",
          {
            feedback: [
              "40% soma os descontos, mas o de 10% incide sobre o preço já com 30% de desconto.",
              "33% não corresponde a nenhuma combinação dos dois descontos.",
            ],
          },
        ),
      ],
    },
    {
      title: "De trás para frente",
      objective: "Recuperar o valor original a partir do valor alterado e da taxa.",
      introduction:
        "Se o valor final é 120% do original, o original é o final dividido por 1,2. Nunca tire a porcentagem do valor final: a taxa foi aplicada sobre o original.",
      specs: [
        n(
          "valor-original",
          "Depois de um aumento de 25%, um produto passou a custar R$ 150. Quanto custava antes, em reais?",
          120,
          "150 ÷ 1,25 = 120.",
          {
            misreads: [
              {
                value: 112.5,
                feedback: "Tirou 25% de 150, mas o aumento foi sobre o preço antigo.",
              },
            ],
          },
        ),
        c(
          "valor-original",
          "Com 20% de desconto, uma camisa saiu por R$ 64. O preço sem desconto era:",
          "R$ 80",
          ["R$ 76,80", "R$ 84"],
          "64 ÷ 0,8 = 80.",
          {
            feedback: [
              "R$ 76,80 soma 20% de 64, mas o desconto foi sobre o preço cheio.",
              "R$ 84 soma 20 reais, e a taxa é percentual.",
            ],
          },
        ),
        n(
          "valor-original",
          "Após perder 12% do valor, um carro vale R$ 44.000. Quanto valia antes, em reais?",
          50000,
          "44.000 ÷ 0,88 = 50.000.",
          {
            misreads: [
              {
                value: 49280,
                feedback: "Somou 12% de 44.000; a perda foi calculada sobre o valor antigo.",
              },
            ],
          },
        ),
        c(
          "taxa-desconhecida",
          "Um produto passou de R$ 80 para R$ 68. A variação percentual foi:",
          "Queda de 15%",
          ["Queda de 12%", "Queda de 17,6%"],
          "68 ÷ 80 = 0,85: queda de 15%.",
          {
            feedback: [
              "12 é a diferença em reais, não a porcentagem.",
              "17,6% compara a diferença com o valor final, e a base é o valor inicial.",
            ],
          },
        ),
        n(
          "valor-original",
          "Um salário líquido de R$ 2.700 corresponde ao bruto menos 10% de desconto. Qual é o salário bruto, em reais?",
          3000,
          "2.700 ÷ 0,9 = 3.000.",
          {
            misreads: [
              { value: 2970, feedback: "Somou 10% de 2.700; o desconto foi sobre o bruto." },
            ],
          },
        ),
        c(
          "valor-original",
          "Um número aumentado em 60% resulta em 96. Esse número é:",
          60,
          [57.6, 36],
          "96 ÷ 1,6 = 60.",
          {
            feedback: [
              "57,6 é 60% de 96: aplicou a taxa ao valor final em vez de dividir 96 por 1,6.",
              "36 é 60% de 60, o valor do aumento.",
            ],
          },
        ),
        n(
          "valor-original",
          "Uma mercadoria sofreu dois aumentos de 10% e passou a custar R$ 242. Qual era o preço inicial, em reais?",
          200,
          "242 ÷ 1,1 ÷ 1,1 = 200.",
          {
            misreads: [
              {
                value: 220,
                feedback: "Dividiu por 1,1 uma vez só; foram dois aumentos de 10%.",
              },
            ],
          },
        ),
        c(
          "taxa-desconhecida",
          "Uma população passou de 50.000 para 60.000 habitantes. Para voltar a 50.000, ela precisaria cair:",
          "Cerca de 16,7%",
          ["20%", "10%"],
          "10.000 ÷ 60.000 = 1/6, cerca de 16,7%: a base agora é 60.000.",
          {
            feedback: [
              "20% foi a subida sobre 50.000; a descida tem base 60.000.",
              "10% de 60.000 são 6.000, e a queda precisa ser de 10.000.",
            ],
          },
        ),
      ],
    },
    {
      title: "Comparar percentuais com bases diferentes",
      objective: "Decidir entre ofertas e ler dados percentuais em tabelas e gráficos.",
      introduction:
        "Um percentual maior pode valer menos dinheiro se a base for menor. Converta tudo para a mesma unidade, reais ou pessoas, antes de comparar.",
      specs: [
        c(
          "comparar-ofertas",
          "Uma loja dá 25% de desconto em um tênis de R$ 200; outra dá R$ 40 de desconto no mesmo tênis. Qual oferta é melhor?",
          "A primeira: R$ 50 de desconto",
          ["A segunda: R$ 40 é um valor certo", "As duas são iguais"],
          "25% de 200 = 50, mais que 40.",
          {
            feedback: [
              "R$ 40 é menos que os R$ 50 de desconto da primeira.",
              "50 e 40 são diferentes.",
            ],
          },
        ),
        n(
          "comparar-ofertas",
          "Um pacote de 500 g custa R$ 12,50 e um de 750 g custa R$ 18. Compare o preço por quilo dos dois. Quanto custa o quilo no pacote mais vantajoso, em reais?",
          24,
          "500 g: 25 reais por kg; 750 g: 18 ÷ 0,75 = 24 reais por kg. O mais barato por quilo custa 24.",
          {
            misreads: [
              { value: 25, feedback: "25 é o preço por quilo do pacote de 500 g, o mais caro." },
            ],
          },
        ),
        c(
          "ler-percentual-em-tabela",
          "Em uma pesquisa, 40% de 300 jovens e 60% de 100 adultos preferem cinema. Quem prefere cinema em maior número?",
          "Os jovens: 120 contra 60",
          ["Os adultos: 60% é maior que 40%", "Os dois grupos empatam"],
          "40% de 300 = 120 e 60% de 100 = 60.",
          {
            feedback: [
              "A porcentagem maior está sobre um grupo menor.",
              "120 e 60 são diferentes.",
            ],
          },
        ),
        n(
          "ler-percentual-em-tabela",
          "Uma eleição numa cidade teve 40.000 votos. Um gráfico mostra 45% para a candidata A, 35% para o candidato B e o restante em branco ou nulo. Quantos votos em branco ou nulo houve?",
          8000,
          "100% − 45% − 35% = 20%; 20% de 40.000 = 8.000.",
          {
            misreads: [
              { value: 20, feedback: "20 é a porcentagem; a pergunta pede a quantidade de votos." },
            ],
          },
        ),
        c(
          "comparar-ofertas",
          "Um plano de celular custa R$ 50 com 10 GB; outro custa R$ 80 com 20 GB. Em preço por gigabyte:",
          "O segundo é mais barato: R$ 4 contra R$ 5 por GB",
          ["O primeiro é mais barato, porque custa menos", "Os dois custam o mesmo por GB"],
          "50 ÷ 10 = 5 e 80 ÷ 20 = 4.",
          {
            feedback: [
              "Custar menos no total não significa ser mais barato por unidade.",
              "5 e 4 são diferentes.",
            ],
          },
        ),
        n(
          "ler-percentual-em-tabela",
          "Em 2024, 30% dos 200 alunos de uma escola participaram de olimpíadas; em 2025, 25% de 320 alunos. Quantos alunos a mais participaram em 2025?",
          20,
          "2024: 60 alunos; 2025: 80 alunos; diferença 20.",
          {
            misreads: [
              { value: 5, feedback: "5 é a diferença em pontos percentuais, não em alunos." },
            ],
          },
        ),
        c(
          "comparar-ofertas",
          "Um investimento rendeu 8% sobre R$ 500 e outro rendeu 4% sobre R$ 1.500. Qual rendeu mais em reais?",
          "O segundo: R$ 60 contra R$ 40",
          ["O primeiro: 8% é o dobro de 4%", "Renderam o mesmo"],
          "8% de 500 = 40 e 4% de 1.500 = 60.",
          {
            feedback: [
              "A taxa maior incidiu sobre um valor três vezes menor.",
              "40 e 60 são diferentes.",
            ],
          },
        ),
        c(
          "ler-percentual-em-tabela",
          "Uma manchete diz: 'crimes aumentaram 100% no bairro'. Sabendo que foram de 1 para 2 casos, a leitura mais correta é:",
          "O aumento percentual é real, mas a base pequena exagera a impressão",
          ["O bairro ficou duas vezes mais perigoso que a cidade", "A manchete está errada"],
          "De 1 para 2 é mesmo 100%, mas um caso a mais em uma base de 1 diz pouco.",
          {
            feedback: [
              "A comparação com a cidade não aparece nos dados.",
              "A conta está certa; o problema é a interpretação sem a base.",
            ],
          },
        ),
      ],
    },
    {
      title: "Porcentagem para decidir",
      objective: "Analisar promoções, impostos e afirmações com porcentagem em situações reais.",
      introduction:
        "Promoções e manchetes escondem a base. Traduza cada afirmação em uma conta explícita antes de concluir.",
      estimatedMinutes: 18,
      specs: [
        c(
          "promocao",
          "Uma promoção 'leve 3, pague 2' equivale a um desconto de:",
          "Cerca de 33%",
          ["50%", "Cerca de 67%"],
          "Paga-se 2 de 3: economiza-se 1/3 do preço dos três produtos, cerca de 33%.",
          {
            feedback: [
              "50% seria 'leve 2, pague 1'.",
              "Cerca de 67% é o que se paga, não o desconto.",
            ],
          },
        ),
        n(
          "imposto",
          "O preço de um produto sem imposto é R$ 400 e o imposto é 15%. Quanto se paga ao todo, em reais?",
          460,
          "400 × 1,15 = 460.",
          { misreads: [{ value: 60, feedback: "60 é só o imposto; a pergunta pede o total." }] },
        ),
        c(
          "promocao",
          "Duas lojas vendem o mesmo produto por R$ 300. A loja A dá 10% de desconto à vista; a loja B parcela em 2 vezes de R$ 150 sem juros. Quem paga à vista na loja A economiza, em relação à B:",
          "R$ 30",
          ["R$ 15", "R$ 60"],
          "10% de 300 = 30; na loja B paga-se 300.",
          {
            feedback: ["R$ 15 seria 10% de uma parcela só.", "R$ 60 seria 20% de 300."],
          },
        ),
        n(
          "imposto",
          "Um trabalhador recebe R$ 3.200 brutos. Do salário sai um desconto de 8% e, sobre o que sobra, outro de 7,5%. Qual é o valor líquido, em reais?",
          2723.2,
          "3.200 × 0,92 = 2.944; 2.944 × 0,925 = 2.723,20.",
          {
            misreads: [
              {
                value: 2704,
                feedback:
                  "Somou as taxas (15,5%) sobre o bruto; a segunda incide sobre o restante.",
              },
            ],
          },
        ),
        c(
          "afirmacao-critica",
          "Um anúncio diz que um curso 'aumenta em 40% a chance de aprovação'. Sem saber a chance inicial, o que se pode afirmar?",
          "Nada sobre o valor da chance final",
          ["Que a chance final é 40%", "Que a chance final é ao menos 40%"],
          "Um aumento percentual depende da base: 40% a mais de 5% dá 7%, e 40% a mais de 50% dá 70%. Sem a chance inicial não há como saber o resultado.",
          {
            feedback: [
              "40% é o aumento relativo, não a chance.",
              "Com chance inicial de 5%, 40% a mais dá só 7%; não há garantia sem a base.",
            ],
          },
        ),
        n(
          "promocao",
          "Uma loja aumentou o preço de um produto em 25% e depois anunciou 'desconto de 20%'. Em relação ao preço original, a variação final foi de quantos por cento? Responda 0 se não houve variação.",
          0,
          "1,25 × 0,8 = 1: o preço voltou ao original; o desconto anunciado devolveu o aumento.",
          {
            misreads: [
              {
                value: 5,
                feedback: "Somou +25% e −20%; multiplicando os fatores o resultado é 1.",
              },
            ],
          },
        ),
        c(
          "afirmacao-critica",
          "Em uma cidade, 2% dos 500.000 moradores usam bicicleta; em outra, 20% dos 30.000. Qual afirmação é correta?",
          "A primeira tem mais ciclistas em número; a segunda, em proporção",
          [
            "A segunda tem mais ciclistas em número e em proporção",
            "A primeira tem mais ciclistas em número e em proporção",
          ],
          "2% de 500.000 = 10.000 e 20% de 30.000 = 6.000: a primeira tem mais ciclistas, mas na segunda a parte dos moradores que pedala é maior.",
          {
            feedback: [
              "Em número, 20% de 30.000 são 6.000, menos que os 10.000 da primeira cidade.",
              "Em proporção, 2% é bem menos que 20%; a primeira só ganha no número de ciclistas.",
            ],
          },
        ),
        c(
          "promocao",
          "Um cartão devolve 5% do valor gasto. Quem gastou R$ 1.240 recebe de volta:",
          "R$ 62",
          ["R$ 6,20", "R$ 124"],
          "5% de 1.240 = 62.",
          {
            feedback: ["R$ 6,20 seria 0,5%.", "R$ 124 seria 10%."],
          },
        ),
      ],
    },
  ],
  ordering: {
    prompt: "Organize um método para calcular o efeito de duas variações percentuais seguidas.",
    labels: [
      "Transformar cada variação em um fator multiplicativo",
      "Multiplicar os fatores na ordem em que as variações acontecem",
      "Comparar o fator final com 1 para ver se houve aumento ou redução",
      "Converter o fator final em porcentagem e conferir com um valor de exemplo",
    ],
    explanation:
      "Cada variação vira um fator; o produto dos fatores é o efeito total, e comparar com 1 diz o sentido e o tamanho da variação.",
  },
  justification: {
    prompts: [
      "Explique por que um aumento de 20% seguido de um desconto de 20% não devolve o valor original, com um exemplo numérico.",
      "Um colega diz que 'a taxa passou de 5% para 10%, então subiu 5%'. Explique a diferença entre pontos percentuais e variação percentual usando esse caso.",
      "Mostre como recuperar o preço original de um produto que custa R$ 90 depois de um desconto de 25%, e explique por que somar 25% a 90 está errado.",
    ],
    samples: [
      "Com R$ 100, o aumento de 20% leva a R$ 120. O desconto de 20% incide sobre 120, e 20% de 120 são 24, então o preço vai a R$ 96. As duas porcentagens têm bases diferentes: o desconto retira mais reais do que o aumento acrescentou.",
      "De 5% para 10% a taxa subiu 5 pontos percentuais. Mas, em relação ao valor inicial, 5 sobre 5 é um aumento de 100%: a taxa dobrou. 'Subiu 5%' sugere um aumento pequeno, quando na verdade a taxa é o dobro.",
      "O preço com desconto é 75% do original, então original = 90 ÷ 0,75 = 120. Conferindo: 25% de 120 são 30, e 120 − 30 = 90. Somar 25% a 90 daria 112,50, porque 25% de 90 é menos que 25% de 120: a base do desconto foi o preço cheio.",
    ],
    focus: "a base sobre a qual cada porcentagem é calculada",
  },
  reserved: (seed, variant) => {
    const reais = (value: number) =>
      `R$ ${Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ",")}`;
    if (variant === 0) {
      const taxa = 5 * (2 + (seed % 5));
      // Com preço final de R$ 100 (80 com 25%), tirar a taxa em reais coincidiria com
      // tirar a porcentagem do preço final; nesse caso o preço original sobe para 120.
      const inicial = 40 * (2 + (seed % 11));
      const original = inicial * (100 + taxa) === 100 * 100 ? inicial + 40 : inicial;
      const final = original + (original * taxa) / 100;
      const sobreFinal = final - (final * taxa) / 100;
      const emReais = final - taxa;
      return c(
        "preco-antes-do-aumento",
        `Depois de um aumento de ${taxa}%, um produto passou a custar ${reais(final)}. Quanto ele custava antes do aumento?`,
        reais(original),
        [reais(sobreFinal), reais(emReais)],
        `O preço final é ${100 + taxa}% do original: ${final} ÷ ${((100 + taxa) / 100).toString().replace(".", ",")} = ${original}.`,
        {
          feedback: [
            "Tirou a porcentagem do preço final, mas o aumento foi calculado sobre o preço antigo.",
            "Subtraiu a taxa como se fosse um valor em reais.",
          ],
        },
      );
    }
    if (variant === 1) {
      const primeira = 10 * (1 + (seed % 3));
      const segunda = 10 * (1 + ((seed + 1) % 3));
      const fator = (1 + primeira / 100) * (1 - segunda / 100);
      const variacao = Math.round((fator - 1) * 100 * 10) / 10;
      const texto = (v: number) => String(Math.abs(v)).replace(".", ",");
      const descreve = (v: number) =>
        v === 0 ? "sem variação" : v > 0 ? `aumento de ${texto(v)}%` : `redução de ${texto(v)}%`;
      const soma = primeira - segunda;
      return c(
        "aumento-e-desconto-seguidos",
        `Um preço sofreu um aumento de ${primeira}% e, em seguida, um desconto de ${segunda}%. Em relação ao preço original, o resultado é:`,
        descreve(variacao),
        [
          descreve(soma) === descreve(variacao) ? `redução de ${texto(segunda)}%` : descreve(soma),
          `aumento de ${texto(primeira + segunda)}%`,
        ],
        `Os fatores se multiplicam: ${(1 + primeira / 100).toString().replace(".", ",")} × ${(1 - segunda / 100).toString().replace(".", ",")} = ${fator.toFixed(2).replace(".", ",")}.`,
        {
          feedback: [
            "Somou as taxas com sinal, mas o desconto incide sobre o preço já aumentado.",
            "Somou as duas taxas como se fossem dois aumentos.",
          ],
        },
      );
    }
    const grupoA = 100 * (2 + (seed % 7));
    const taxaA = 5 * (1 + (seed % 4));
    const grupoB = 50 * (1 + (seed % 3));
    let taxaB = 10 * (3 + (seed % 5));
    const quantA = (grupoA * taxaA) / 100;
    if ((grupoB * taxaB) / 100 === quantA) taxaB += 10;
    const quantB = (grupoB * taxaB) / 100;
    const maior = quantA > quantB ? "A" : "B";
    const outro = maior === "A" ? "B" : "A";
    const taxaDoOutro = outro === "A" ? taxaA : taxaB;
    const taxaDoMaior = outro === "A" ? taxaB : taxaA;
    const motivo =
      taxaDoOutro > taxaDoMaior ? "porque a porcentagem é maior" : "porque o grupo é maior";
    return c(
      "percentual-com-bases-diferentes",
      `No grupo A, ${taxaA}% de ${grupoA} pessoas usam bicicleta; no grupo B, ${taxaB}% de ${grupoB} pessoas. Em qual grupo há mais ciclistas em número?`,
      `No grupo ${maior}: ${Math.max(quantA, quantB)} contra ${Math.min(quantA, quantB)}`,
      [`No grupo ${outro}, ${motivo}`, `Nos dois igualmente: ${quantA + quantB} ao todo`],
      `${taxaA}% de ${grupoA} = ${quantA} e ${taxaB}% de ${grupoB} = ${quantB}.`,
      {
        feedback: [
          "Compare as quantidades: porcentagem maior sobre grupo menor, ou grupo maior com porcentagem menor, pode dar menos pessoas.",
          "Somar os dois grupos não responde qual tem mais.",
        ],
      },
    );
  },
  deepChallenge: {
    skillId: "porcentagem-n2",
    title: "A promoção que promete demais",
    prompt:
      "Colecione três anúncios reais com porcentagens (desconto, aumento, juros ou pesquisa) e descubra, em cada um, qual é a base. Depois reescreva cada anúncio de um jeito que não engane ninguém.",
    lab: "bars",
    steps: [
      "Registre os três anúncios e identifique a base de cada porcentagem, ou anote que ela não aparece.",
      "Refaça a conta de um deles com uma base plausível e mostre como a impressão muda.",
      "Reescreva os anúncios com a base explícita e explique o que ficou diferente.",
    ],
    rubric: [
      "Bases identificadas ou apontadas como ausentes nos três casos (0–2)",
      "Conta refeita com base plausível e leitura correta do efeito (0–3)",
      "Reescrita honesta dos anúncios (0–2)",
      "Registro claro, com as fontes anotadas (0–1)",
    ],
  },
  homeSupport: [
    "Diante de uma placa de desconto, pergunte qual era o preço antes e se o desconto anunciado vale mesmo sobre esse preço.",
    "Quando uma notícia falar em 'aumento de X%', perguntem juntos: X% de quê, e quanto isso dá em número?",
  ],
};
